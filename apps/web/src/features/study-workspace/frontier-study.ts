import type { components } from '@studypal/api-client';
import { workspaceApi, type WorkspaceAccess } from '@/lib/workspace-access';
import { parseQuestions, selectPassages } from './local-inference';
import type { StudySource } from './study-source';

class FrontierError extends Error {}
export const frontierError = (error: unknown) =>
  error instanceof FrontierError
    ? error.message
    : 'The cloud request could not finish. Check your connection or choose On this device.';
function check(access: WorkspaceAccess, status: number): never {
  if (status === 401 || status === 403)
    throw new FrontierError(
      access.mode === 'local'
        ? 'Pair this browser with your StudyPal server using Local workspace before using the cloud model.'
        : 'Verify your account to continue with the cloud model.',
    );
  if (status === 429)
    throw new FrontierError(
      'The cloud request limit has been reached. Try again later or choose On this device.',
    );
  if (status === 503)
    throw new FrontierError(
      'Cloud practice is unavailable. Check the local server and its OpenAI configuration.',
    );
  throw new FrontierError(
    'The cloud request could not finish. Check the local StudyPal server and try again.',
  );
}
function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 1800);
    signal.addEventListener('abort', abort, { once: true });
  });
}
async function submit(
  access: WorkspaceAccess,
  body: components['schemas']['FrontierRequestDto'],
  userSignal: AbortSignal,
) {
  if (!navigator.onLine)
    throw new FrontierError(
      'This model needs internet access. Choose On this device to study offline.',
    );
  const api = workspaceApi(access);
  const signal = AbortSignal.any([userSignal, AbortSignal.timeout(105_000)]);
  const session = await api.GET('/api/v1/workspace/session', { signal });
  if (!session.data) check(access, session.response.status);
  const header = { 'X-StudyPal-CSRF': session.data.csrfToken };
  signal.throwIfAborted();
  const id = body.requestId;
  let finished = false;
  try {
    // Complete enqueue before attempting cancellation. The request ID also addresses the job if a response is lost.
    const queued = await api.POST('/api/v1/frontier/jobs', {
      body,
      params: { header },
      signal: AbortSignal.timeout(10_000),
    });
    if (!queued.data) {
      finished = true;
      check(access, queued.response.status);
    }
    let current = queued.data;
    while (true) {
      signal.throwIfAborted();
      if (current.status === 'completed' && current.result) {
        finished = true;
        return current.result;
      }
      if (current.status === 'failed' || current.status === 'canceled') {
        finished = true;
        throw new FrontierError(
          'Cloud practice could not produce a verified answer. Check the worker and try again, or choose On this device.',
        );
      }
      await wait(signal);
      const response = await api.GET('/api/v1/frontier/jobs/{id}', {
        params: { path: { id } },
        signal,
      });
      if (!response.data) check(access, response.response.status);
      current = response.data;
    }
  } finally {
    if (!finished)
      void api
        .DELETE('/api/v1/frontier/jobs/{id}', {
          params: { path: { id }, header },
          signal: AbortSignal.timeout(5000),
          keepalive: true,
        })
        .catch(() => undefined);
  }
}
export async function frontierQuestions(
  access: WorkspaceAccess,
  sources: readonly StudySource[],
  count: number,
  prompt: string,
  signal: AbortSignal,
) {
  const passages = selectPassages(sources, prompt).filter((p) => p.text.length >= 6);
  if (!passages.length) throw new FrontierError('Add a longer passage first.');
  const result = await submit(
    access,
    { kind: 'quiz', requestId: crypto.randomUUID(), passages, prompt, count },
    signal,
  );
  return parseQuestions(result, passages, count);
}
export async function frontierGrade(
  access: WorkspaceAccess,
  source: StudySource,
  prompt: string,
  signal: AbortSignal,
) {
  const passages = selectPassages([source], prompt).filter((p) => p.text.length >= 6);
  if (!passages.length) throw new FrontierError('Add a longer passage first.');
  const { grade } = await submit(
    access,
    { kind: 'grade', requestId: crypto.randomUUID(), passages, prompt, count: 1 },
    signal,
  );
  const quote = grade?.quote?.replace(/\s+/gu, ' ').trim();
  if (!grade || !quote || !passages.some((p) => p.text.replace(/\s+/gu, ' ').includes(quote)))
    throw new FrontierError('The cloud feedback lacked supporting evidence.');
  return (
    'Source accuracy: ' +
    grade.score +
    '/4\n\nStrength: ' +
    grade.strength +
    '\n\nImprovement: ' +
    grade.improvement +
    '\n\n' +
    source.name +
    '\n“' +
    quote +
    '”'
  );
}
