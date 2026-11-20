import { workspaceApi, type WorkspaceAccess } from '@/lib/workspace-access';
import { readSnapshot, snapshot } from './workspace-format';
import type { openWorkspace, WorkspaceData } from './workspace-storage';

type Storage = Awaited<ReturnType<typeof openWorkspace>>;
interface Status {
  label: string;
  detail: string;
  needsKey?: boolean;
  conflict?: boolean;
}
const disconnected: Status = {
  label: 'Connect PostgreSQL',
  detail: 'Pair this browser with your local PostgreSQL workspace.',
  needsKey: true,
};

export function createReplica(
  access: WorkspaceAccess,
  storage: Storage,
  restored: (data: WorkspaceData) => void,
) {
  const local =
    access.mode === 'clerk' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const api = workspaceApi(access);
  let csrf = '',
    closed = false,
    paired = access.mode === 'clerk' || Boolean(storage.syncPoint);
  let status: Status =
    access.mode === 'clerk'
      ? { label: 'Syncing workspace', detail: 'Loading your account’s saved study sets.' }
      : local
        ? disconnected
        : {
            label: 'Saved in browser',
            detail: 'Open the localhost StudyPal app on this Mac to pair PostgreSQL.',
          };
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  function recover() {
    if (closed || !paired || !navigator.onLine || attempts >= 3) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(
      () => {
        void retry();
      },
      750 * 2 ** attempts++,
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const options = () => ({
    credentials: 'same-origin' as const,
    cache: 'no-store' as const,
    signal: AbortSignal.timeout(6500),
  });
  function update(next: Status) {
    if (closed) return;
    status = next;
    listeners.forEach((callback) => callback());
  }
  function handle(response: Response) {
    if (access.mode === 'clerk' && (response.status === 401 || response.status === 403)) {
      update({ label: 'Session unavailable', detail: 'Sign in again to sync your changes.' });
    } else if (response.status === 401 || response.status === 403) {
      csrf = '';
      update({ ...disconnected, detail: 'Pair again to sync your browser changes to PostgreSQL.' });
    } else if (response.status === 409) {
      update({
        label: 'Review copies',
        detail:
          'The database and browser have separate changes. Download a copy before choosing which version to keep.',
        conflict: true,
      });
    } else if (response.status === 413) {
      update({
        label: 'Saved in browser',
        detail:
          'Your workspace exceeds the 8 MiB PostgreSQL sync limit. Your browser still holds the full copy.',
      });
    } else {
      update({
        label: 'Saved in browser',
        detail: 'The local API is unavailable. Start StudyPal and try syncing again.',
      });
      recover();
    }
  }
  async function push(revision: number) {
    const localRevision = storage.revision;
    const content = snapshot(storage.data);
    if (new Blob([content]).size > 8 * 1024 * 1024) {
      handle(new Response(null, { status: 413 }));
      return false;
    }
    const result = await api.PUT('/api/v1/workspace', {
      ...options(),
      params: { header: { 'X-StudyPal-CSRF': csrf } },
      body: { revision, content },
    });
    if (!result.data) {
      handle(result.response);
      return false;
    }
    await storage.acknowledge(result.data.revision, localRevision);
    return true;
  }
  function synced() {
    if (storage.syncPoint?.local !== storage.revision) {
      changed();
      return;
    }
    clearTimeout(retryTimer);
    attempts = 0;
    update({
      label: 'PostgreSQL synced',
      detail:
        'Study sets, source text, annotations, practice, chats and plans are saved in local PostgreSQL. Manage audio separately in Record Lecture.',
    });
  }
  async function sync(choice?: 'database' | 'browser') {
    if (!local || !paired || closed) return;
    const get = await api.GET('/api/v1/workspace', options());
    if (closed) return;
    if (!get.data) return handle(get.response);
    const remote = get.data;
    csrf = remote.csrfToken;
    const same = remote.content === snapshot(storage.data);
    const point = storage.syncPoint;
    const useDatabase =
      choice === 'database' || (!point && storage.revision === 0 && remote.revision > 0 && !choice);
    if (
      !same &&
      remote.revision > 0 &&
      remote.revision !== point?.server &&
      !choice &&
      !useDatabase
    ) {
      if (storage.revision > (point?.local ?? 0))
        return handle(new Response(null, { status: 409 }));
      // Explicitly restore a newer copy so an in-progress form is never discarded on focus.
      update({
        label: 'Database copy available',
        detail: 'PostgreSQL has a newer workspace. Load it to continue on this browser.',
        conflict: true,
      });
      return;
    }
    if (!same && useDatabase) {
      if (!remote.content) throw new Error('There is no saved workspace in PostgreSQL yet.');
      const next = readSnapshot(remote.content);
      await storage.save(next);
      await storage.acknowledge(remote.revision, storage.revision);
      if (!closed) restored(next);
    } else if (same || (point?.server === remote.revision && point.local === storage.revision)) {
      await storage.acknowledge(remote.revision, storage.revision);
    } else {
      if (!(await push(remote.revision))) return;
    }
    synced();
  }

  function enqueue(work: () => Promise<void>) {
    queue = queue
      .then(async () => {
        if (!closed) await work();
      })
      .catch((error) => {
        update({
          label: 'Saved in browser',
          detail:
            error instanceof Error && error.message.includes('workspace version')
              ? error.message
              : 'Sync could not finish. Your local changes are safe. Start the API and retry.',
        });
        recover();
      });
    return queue;
  }
  function retry() {
    return enqueue(() => sync());
  }
  function changed() {
    if (!local || !paired || closed) return;
    if (!status.needsKey && !status.conflict)
      update({
        label: 'Saving to PostgreSQL',
        detail: 'Your changes are saved in this browser and waiting for PostgreSQL.',
      });
    clearTimeout(timer);
    timer = setTimeout(() => {
      void enqueue(async () => {
        const point = storage.syncPoint;
        if (!csrf || !point || status.conflict || status.needsKey) {
          await sync();
          return;
        }
        if (point.local === storage.revision) return;
        if (await push(point.server)) synced();
      });
    }, 650);
  }
  function reconnect() {
    attempts = 0;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      void retry();
    }, 250);
  }
  window.addEventListener('online', reconnect);
  window.addEventListener('focus', retry);
  const ready = paired ? retry() : Promise.resolve();
  return {
    ready,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    status: () => status,
    async pair(key: string) {
      if (!local || access.mode === 'clerk') return;
      return enqueue(async () => {
        const result = await api.POST('/api/v1/workspace/pair', {
          ...options(),
          headers: { Authorization: 'Bearer ' + key.trim() },
        });
        if (!result.data) return handle(result.response);
        paired = true;
        csrf = result.data.csrfToken;
        await sync();
      });
    },
    retry,
    changed,
    resolve: (choice: 'database' | 'browser') => enqueue(() => sync(choice)),
    backup: () => snapshot(storage.data),
    restoreBackup: async (next: WorkspaceData) => {
      await queue;
      await storage.save(next);
      restored(next);
      changed();
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      listeners.clear();
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', reconnect);
    },
  };
}
export type WorkspaceReplica = ReturnType<typeof createReplica>;
