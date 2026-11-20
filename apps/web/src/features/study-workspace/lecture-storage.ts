import { storageKey, type WorkspaceAccess } from '@/lib/workspace-access';
export interface Lecture {
  id: string;
  setId: number;
  title: string;
  createdAt: string;
  seconds: number;
  transcript: string;
  backupRevision?: number;
  backupCurrent?: boolean;
  backedUpAt?: string;
}

const databaseName = 'studypal-lectures-v1';
const maxLecturesPerSet = 100;

async function openDatabase(access: WorkspaceAccess): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageKey(access, databaseName), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const metadata = db.createObjectStore('lectures', { keyPath: 'id' });
      metadata.createIndex('setId', 'setId');
      db.createObjectStore('audio');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local recordings could not be opened.'));
  });
}

async function withTransaction<T>(
  access: WorkspaceAccess,
  stores: string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase(access);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(new Error('The local recording change could not be completed.'));
      action(tx, (next) => {
        value = next;
      });
    });
  } finally {
    db.close();
  }
}

export function listLectures(access: WorkspaceAccess, setId: number) {
  return withTransaction<Lecture[]>(access, ['lectures'], 'readonly', (tx, result) => {
    const request: IDBRequest<Lecture[]> = tx
      .objectStore('lectures')
      .index('setId')
      .getAll(setId, maxLecturesPerSet);
    request.onsuccess = () =>
      result(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
}

export function saveLecture(access: WorkspaceAccess, lecture: Lecture, audio: Blob) {
  if (!audio.size || !audio.type.startsWith('audio/')) throw new Error('Invalid audio.');
  return withTransaction<void>(access, ['lectures', 'audio'], 'readwrite', (tx) => {
    const metadata = tx.objectStore('lectures');
    const count = metadata.index('setId').count(lecture.setId);
    count.onsuccess = () => {
      if (count.result >= maxLecturesPerSet) {
        tx.abort();
        return;
      }
      metadata.add(lecture);
      tx.objectStore('audio').add(audio, lecture.id);
    };
  });
}

export function loadLectureAudio(access: WorkspaceAccess, setId: number, id: string) {
  return withTransaction<Blob>(access, ['lectures', 'audio'], 'readonly', (tx, result) => {
    const metadata: IDBRequest<Lecture | undefined> = tx.objectStore('lectures').get(id);
    metadata.onsuccess = () => {
      if (metadata.result?.setId !== setId) {
        tx.abort();
        return;
      }
      const audio: IDBRequest<Blob | undefined> = tx.objectStore('audio').get(id);
      audio.onsuccess = () => (audio.result ? result(audio.result) : tx.abort());
    };
  });
}

export function updateLectureTranscript(
  access: WorkspaceAccess,
  setId: number,
  id: string,
  text: string,
) {
  if (text.length > 100_000) throw new Error('Transcript too long.');
  return withTransaction<void>(access, ['lectures'], 'readwrite', (tx) => {
    const store = tx.objectStore('lectures');
    const request: IDBRequest<Lecture | undefined> = store.get(id);
    request.onsuccess = () => {
      if (request.result?.setId !== setId) {
        tx.abort();
        return;
      }
      store.put({
        ...request.result,
        transcript: text,
        backupCurrent: request.result.backupCurrent && request.result.transcript === text,
      });
    };
  });
}

export function deleteLecture(access: WorkspaceAccess, setId: number, id: string) {
  return withTransaction<void>(access, ['lectures', 'audio'], 'readwrite', (tx) => {
    const metadata = tx.objectStore('lectures');
    const request: IDBRequest<Lecture | undefined> = metadata.get(id);
    request.onsuccess = () => {
      if (request.result?.setId !== setId) {
        tx.abort();
        return;
      }
      metadata.delete(id);
      tx.objectStore('audio').delete(id);
    };
  });
}

export function markLectureBackup(access: WorkspaceAccess, lecture: Lecture, revision: number) {
  return withTransaction<Lecture>(access, ['lectures'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('lectures');
    const request: IDBRequest<Lecture | undefined> = store.get(lecture.id);
    request.onsuccess = () => {
      if (request.result?.setId !== lecture.setId) {
        tx.abort();
        return;
      }
      const updated = {
        ...request.result,
        backupRevision: revision,
        backupCurrent: request.result.transcript === lecture.transcript,
        backedUpAt: new Date().toISOString(),
      };
      store.put(updated);
      result(updated);
    };
  });
}
