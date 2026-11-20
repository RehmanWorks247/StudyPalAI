import { createApiClient } from '@studypal/api-client';
import { createContext, useContext } from 'react';

export type WorkspaceAccess =
  | { mode: 'local' }
  | {
      mode: 'clerk';
      ownerId: string;
      getToken: () => Promise<string | null>;
      signal: AbortSignal;
      onUnauthorized: () => void;
    };
export const localAccess: WorkspaceAccess = { mode: 'local' };
export const WorkspaceAccessContext = createContext<WorkspaceAccess | null>(null);
export function useWorkspaceAccess() {
  const value = useContext(WorkspaceAccessContext);
  if (!value) throw new Error('A workspace session is required.');
  return value;
}
// Clerk's verified (issuer, subject) mapping yields a stable server UUID, independent of the active session.
export const storageKey = (access: WorkspaceAccess, name: string) =>
  access.mode === 'local' ? name : name + '-account-' + access.ownerId;

export function workspaceApi(access: WorkspaceAccess) {
  return createApiClient({
    baseUrl: window.location.origin,
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    fetch: async (request: Request) => {
      const signal = AbortSignal.any(
        access.mode === 'clerk'
          ? [access.signal, request.signal, AbortSignal.timeout(30_000)]
          : [request.signal, AbortSignal.timeout(30_000)],
      );
      signal.throwIfAborted();
      if (access.mode === 'clerk') {
        if (!navigator.onLine) throw new TypeError('Workspace sync needs a connection.');
        const token = await access.getToken();
        signal.throwIfAborted();
        if (!token) {
          access.onUnauthorized();
          throw new Error('The session has ended.');
        }
        request.headers.set('Authorization', 'Bearer ' + token);
      }
      const response = await fetch(request, { signal });
      if (response.status === 401 && access.mode === 'clerk' && !access.signal.aborted)
        access.onUnauthorized();
      return response;
    },
  });
}
