import { setTimeout as delay } from 'node:timers/promises';
import type { FrontierJobs } from './frontier-jobs';
import { inputSchema, runProvider } from './frontier-provider';

export async function processNext(
  jobs: FrontierJobs,
  key: string,
  shutdown: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const row = await jobs.claim();
  if (!row) return false;
  const controller = new AbortController();
  const signal = AbortSignal.any([shutdown, controller.signal, AbortSignal.timeout(70_000)]);
  const watch = (async () => {
    while (!signal.aborted) {
      await delay(1250, undefined, { signal });
      if (!(await jobs.active(row.id))) controller.abort();
    }
  })().catch(() => controller.abort());
  try {
    signal.throwIfAborted();
    const result = await runProvider(inputSchema.parse(row.input), key, signal, transport);
    await jobs.finish(row.id, result);
  } catch {
    await jobs.finish(row.id);
  } finally {
    controller.abort();
    await watch;
  }
  return true;
}
export async function runWorker(jobs: FrontierJobs, key: string, stop: AbortSignal) {
  let cleanupAt = 0;
  while (!stop.aborted) {
    try {
      if (Date.now() >= cleanupAt) {
        await jobs.clean();
        cleanupAt = Date.now() + 30_000;
      }
      if (await processNext(jobs, key, stop)) continue;
    } catch {
      process.stderr.write(
        '{"level":"error","message":"Frontier queue temporarily unavailable"}\n',
      );
    }
    await delay(1200, undefined, { signal: stop }).catch(() => undefined);
  }
}
