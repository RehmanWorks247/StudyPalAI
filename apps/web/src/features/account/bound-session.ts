import { createApiClient } from '@studypal/api-client';

export interface AccountSession {
  id: string;
  userId: string;
  getToken: () => Promise<string | null>;
}
export async function tokenForSession(session: AccountSession) {
  const token = await session.getToken();
  if (!token) return null;
  try {
    const body = token.split('.')[1];
    if (!body) return null;
    const claims: unknown = JSON.parse(atob(body.replaceAll('-', '+').replaceAll('_', '/')));
    if (
      typeof claims !== 'object' ||
      !claims ||
      !('sub' in claims) ||
      claims.sub !== session.userId ||
      !('sid' in claims) ||
      claims.sid !== session.id ||
      !('exp' in claims) ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 <= Date.now()
    )
      return null;
    return token;
  } catch {
    return null;
  }
}
const api = () =>
  createApiClient({
    baseUrl: location.origin,
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  });
export class AccountRejected extends Error {}

export async function bindAccount(session: AccountSession, signal: AbortSignal) {
  const token = await tokenForSession(session);
  signal.throwIfAborted();
  if (!token) throw new AccountRejected('Sign in again to open this workspace.');
  const result = await api().POST('/api/v1/workspace/sign-in', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (result.response.status === 401 || result.response.status === 403)
    throw new AccountRejected('StudyPal could not verify this account.');
  if (
    !result.data ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(result.data.ownerId) ||
    !result.data.csrfToken
  )
    throw new Error('StudyPal could not verify this account.');
  const expiresAt =
    'expiresAt' in result.data && typeof result.data.expiresAt === 'string'
      ? Date.parse(result.data.expiresAt)
      : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw new Error('The account binding has expired.');
  return { ownerId: result.data.ownerId, csrfToken: result.data.csrfToken, expiresAt };
}
export async function releaseAccount(session: AccountSession, csrfToken: string) {
  const token = await tokenForSession(session);
  if (!token) return;
  await api().POST('/api/v1/workspace/sign-out', {
    headers: { Authorization: 'Bearer ' + token },
    params: { header: { 'X-StudyPal-CSRF': csrfToken } },
    signal: AbortSignal.timeout(4_000),
  });
}
