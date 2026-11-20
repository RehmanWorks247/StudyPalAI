import { localAccess, storageKey, type WorkspaceAccess } from '../../src/lib/workspace-access';
import { openWorkspace } from '../../src/features/study-workspace/workspace-storage';
import {
  listLectures,
  loadLectureAudio,
  saveLecture,
} from '../../src/features/study-workspace/lecture-storage';

function verified(ownerId: string): WorkspaceAccess {
  return {
    mode: 'clerk',
    ownerId,
    signal: new AbortController().signal,
    getToken: async () => null,
    onUnauthorized: () => undefined,
  };
}
const a = verified('aaf60514-20b3-4a7b-b897-258fbb5cd7c2'),
  b = verified('5f83ee7f-4b79-411b-a3ff-5a7bc5b8afc8');
async function seed(access: WorkspaceAccess, label: string) {
  const db = await openWorkspace(access);
  try {
    await db.save({ ...db.data, companionName: label });
    await db.acknowledge(8, db.revision);
  } finally {
    db.close();
  }
  await saveLecture(
    access,
    {
      id: 'same-recording-id',
      setId: 1,
      title: label,
      transcript: label,
      createdAt: new Date().toISOString(),
      seconds: 3,
    },
    new Blob([label], { type: 'audio/webm' }),
  );
  sessionStorage.setItem(storageKey(access, 'studypal-focus-timer'), label);
}
async function read(access: WorkspaceAccess) {
  const db = await openWorkspace(access);
  try {
    const lectures = await listLectures(access, 1);
    return {
      companion: db.data.companionName,
      sync: db.syncPoint?.server ?? 0,
      lectures: lectures.map((l) => l.title),
      audio: lectures[0] ? await (await loadLectureAudio(access, 1, lectures[0].id)).text() : null,
      timer: sessionStorage.getItem(storageKey(access, 'studypal-focus-timer')),
    };
  } finally {
    db.close();
  }
}
export async function verifyStorage() {
  await seed(localAccess, 'Old browser workspace');
  await seed(a, 'Account A');
  const fresh = await read(b);
  await seed(b, 'Account B');
  return { fresh, local: await read(localAccess), a: await read(a), b: await read(b) };
}
