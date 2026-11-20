import { workspaceApi, type WorkspaceAccess } from '@/lib/workspace-access';
import { type components } from '@studypal/api-client';
import { markLectureBackup, saveLecture, type Lecture } from './lecture-storage';

export type BackupItem = components['schemas']['RecordingListItemDto'];
const sizePerPart = 4 * 1024 * 1024;
const recording = '/api/v1/recordings/{id}';
const part = '/api/v1/recordings/{id}/parts/{part}';

function requireSuccess<T>(result: { data?: T; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  switch (result.response.status) {
    case 401:
    case 403:
      throw new Error('Verify your workspace session and try again.');
    case 404:
      throw new Error('This recording backup is unavailable. Refresh the list.');
    case 409:
      throw new Error(
        'This backup has a different version. Refresh the list before replacing a backup.',
      );
    case 413:
      throw new Error(
        'Recording backup limit reached. Each set can hold 100 backups and each workspace can hold 1 GiB.',
      );
    case 429:
      throw new Error('The server is busy. Wait a minute, then try again to resume the transfer.');
    default:
      throw new Error(
        'Could not reach the local recording backup. Check the local server and try again.',
      );
  }
}
async function csrf(access: WorkspaceAccess, signal: AbortSignal) {
  return requireSuccess(await workspaceApi(access).GET('/api/v1/workspace/session', { signal }))
    .csrfToken;
}
async function sha256(bytes: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
async function audioHash(hashes: string[]) {
  return sha256(new TextEncoder().encode(hashes.join('')));
}
function asBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === 'string') resolve(value.slice(value.indexOf(',') + 1));
      else reject(new Error('Cannot read audio.'));
    };
    reader.onerror = () => reject(new Error('Cannot read audio.'));
    reader.readAsDataURL(blob);
  });
}
export async function backUpLecture(
  access: WorkspaceAccess,
  lecture: Lecture,
  audio: Blob,
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  const api = workspaceApi(access);
  const token = await csrf(access, signal);
  const total = Math.ceil(audio.size / sizePerPart);
  const hashes: string[] = [];
  progress('Checking audio…');
  for (let index = 0; index < total; index++) {
    signal.throwIfAborted();
    hashes.push(
      await sha256(await audio.slice(index * sizePerPart, (index + 1) * sizePerPart).arrayBuffer()),
    );
  }
  let revision = lecture.backupRevision ?? 0;
  if (revision) {
    const current = await api.GET(recording, { params: { path: { id: lecture.id } }, signal });
    if (current.response.status === 404) revision = 0;
    else requireSuccess(current);
  }
  const headers = { 'X-StudyPal-CSRF': token };
  const info = requireSuccess(
    await api.PUT(recording, {
      params: { path: { id: lecture.id }, header: headers },
      signal,
      body: {
        title: lecture.title,
        setId: lecture.setId,
        createdAt: lecture.createdAt,
        seconds: lecture.seconds,
        transcript: lecture.transcript,
        mediaType: audio.type,
        size: audio.size,
        audioHash: await audioHash(hashes),
        revision,
      },
    }),
  );
  let final = info;
  for (let index = info.nextPart; index < total; index++) {
    signal.throwIfAborted();
    progress('Backing up audio · ' + Math.floor((index / total) * 100) + '%');
    final = requireSuccess(
      await api.PUT(part, {
        params: { path: { id: lecture.id, part: index }, header: headers },
        signal,
        body: { data: await asBase64(audio.slice(index * sizePerPart, (index + 1) * sizePerPart)) },
      }),
    );
  }
  if (!final.complete) throw new Error('Audio backup is incomplete. Try again to resume.');
  return markLectureBackup(access, lecture, final.revision);
}
export async function listRecordingBackups(
  access: WorkspaceAccess,
  setId: number,
  signal: AbortSignal,
) {
  return requireSuccess(
    await workspaceApi(access).GET('/api/v1/recordings', { params: { query: { setId } }, signal }),
  );
}
export async function restoreLecture(
  access: WorkspaceAccess,
  setId: number,
  id: string,
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  const api = workspaceApi(access);
  const meta = requireSuccess(await api.GET(recording, { params: { path: { id } }, signal }));
  if (meta.setId !== setId || !meta.complete || meta.size <= 0 || meta.size > 214958080)
    throw new Error('This recording is incomplete or belongs to another study set.');
  const blobs: Blob[] = [];
  const hashes: string[] = [];
  const total = Math.ceil(meta.size / sizePerPart);
  for (let index = 0; index < total; index++) {
    signal.throwIfAborted();
    progress('Restoring audio · ' + Math.floor((index / total) * 100) + '%');
    const bytes = requireSuccess(
      await api.GET(part, { params: { path: { id, part: index } }, signal }),
    );
    const decoded = atob(bytes.data);
    if (decoded.length !== Math.min(sizePerPart, meta.size - index * sizePerPart))
      throw new Error('The restored audio size does not match its backup.');
    const buffer = Uint8Array.from(decoded, (s) => s.charCodeAt(0));
    hashes.push(await sha256(buffer));
    blobs.push(new Blob([buffer]));
  }
  if ((await audioHash(hashes)) !== meta.audioHash)
    throw new Error(
      'The restored audio checksum does not match. Your local recordings are unchanged.',
    );
  const restored: Lecture = {
    id,
    setId,
    title: meta.title,
    seconds: meta.seconds,
    createdAt: meta.createdAt,
    transcript: meta.transcript,
    backupCurrent: true,
    backupRevision: meta.revision,
    backedUpAt: new Date().toISOString(),
  };
  signal.throwIfAborted();
  await saveLecture(access, restored, new Blob(blobs, { type: meta.mediaType }));
  return restored;
}
export async function removeRecordingBackup(
  access: WorkspaceAccess,
  item: BackupItem,
  signal: AbortSignal,
) {
  const token = await csrf(access, signal);
  const result = await workspaceApi(access).DELETE(recording, {
    params: {
      path: { id: item.id },
      query: { revision: item.revision },
      header: { 'X-StudyPal-CSRF': token },
    },
    signal,
  });
  if (!result.response.ok) requireSuccess(result);
}
