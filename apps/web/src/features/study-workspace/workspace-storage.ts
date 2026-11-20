import { storageKey, type WorkspaceAccess } from '@/lib/workspace-access';
import { type ChatState, type StudySet, type StudyEvent, type StudyFolder } from './demo-data';

export interface Plan {
  name: string;
  date: string;
  start: string;
  mode: string;
}

export interface WorkspaceData {
  sets: StudySet[];
  setId: number;
  chats: Record<number, ChatState>;
  folders: Record<number, StudyFolder[]>;
  events: StudyEvent[];
  plans: Record<number, Plan[]>;
  reviewed: Record<number, string[]>;
  profileName: string;
  companionName: string;
  theme: string;
}

export const initialWorkspace: WorkspaceData = {
  sets: [],
  setId: 0,
  chats: {},
  folders: {},
  plans: {},
  reviewed: {},
  events: [],
  profileName: '',
  companionName: 'Sparky',
  theme: 'light',
};

export async function openWorkspace(access: WorkspaceAccess) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(storageKey(access, 'studypal-workspace'), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other StudyPal tabs to open storage.'));
  });
  db.onversionchange = () => db.close();
  let revision = 0;
  const data = await new Promise<WorkspaceData>((resolve, reject) => {
    const tx = db.transaction('state');
    const req = tx.objectStore('state').get('workspace');
    tx.oncomplete = () => {
      const record = req.result;
      if (record === undefined) return resolve(initialWorkspace);
      if (
        record?.version !== 1 ||
        !Number.isSafeInteger(record.revision) ||
        !Array.isArray(record.data?.sets) ||
        (record.data.sets.length === 0 && record.data.setId !== 0)
      ) {
        db.close();
        return reject(new Error('This workspace could not be read.'));
      }
      revision = record.revision;
      resolve({ ...initialWorkspace, ...record.data });
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
  let previous = data;
  interface SyncPoint {
    server: number;
    local: number;
  }
  const point = await new Promise<SyncPoint | undefined>((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get('sync');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let syncPoint = point;
  async function acknowledge(server: number, local: number) {
    const next = { server, local };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const read = store.get('sync');
      read.onsuccess = () => {
        if ((read.result?.server ?? -1) <= server) store.put(next, 'sync');
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    syncPoint = next;
  }
  return {
    get data() {
      return previous;
    },
    get revision() {
      return revision;
    },
    get syncPoint() {
      return syncPoint;
    },
    acknowledge,
    close: () => db.close(),
    async save(next: WorkspaceData) {
      if (
        (Object.keys(next) as (keyof WorkspaceData)[]).every((key) => previous[key] === next[key])
      )
        return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite');
        const store = tx.objectStore('state');
        const read = store.get('revision');
        let conflict = false;
        read.onsuccess = () => {
          if ((read.result ?? 0) !== revision) {
            conflict = true;
            tx.abort();
            return;
          }
          store.put({ version: 1, revision: revision + 1, data: next }, 'workspace');
          store.put(revision + 1, 'revision');
        };
        tx.oncomplete = () => {
          revision++;
          previous = next;
          resolve();
        };
        tx.onabort = () =>
          reject(
            conflict
              ? new Error(
                  'Another tab changed this workspace. Reload this tab before editing again.',
                )
              : new Error(
                  'Could not save changes. Check free disk space and browser storage permissions.',
                ),
          );
      });
    },
  };
}
