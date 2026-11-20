import { useWorkspaceAccess } from '@/lib/workspace-access';
import { useEffect, useRef, useState } from 'react';
import {
  listRecordingBackups,
  removeRecordingBackup,
  restoreLecture,
  type BackupItem,
} from './lecture-backup';
import type { Lecture } from './lecture-storage';

export function LectureRestore({
  setId,
  lectures,
  onRestore,
}: {
  setId: number;
  lectures: Lecture[];
  onRestore: (item: Lecture) => void;
}) {
  const access = useWorkspaceAccess();
  const [items, setItems] = useState<BackupItem[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [setId],
  );
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const cancel = new AbortController();
    controller.current = cancel;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work(cancel.signal);
    } catch (e) {
      if (!cancel.signal.aborted)
        setError(
          e instanceof TypeError
            ? 'The local server is unavailable. Check your connection and try again.'
            : e instanceof Error
              ? e.message
              : 'Could not access recording backups.',
        );
    } finally {
      controller.current = null;
      if (!cancel.signal.aborted) setBusy(false);
    }
  }
  const refresh = () =>
    run(async (signal) => {
      const list = await listRecordingBackups(access, setId, signal);
      if (!signal.aborted) setItems(list);
    });
  return (
    <section className="lecture-backups" aria-label="PostgreSQL recording backups">
      <button className="sp-button" disabled={busy} onClick={() => void refresh()}>
        {items ? 'Refresh backups' : 'Restore recordings'}
      </button>
      {items && (
        <div>
          <p>
            {items.length
              ? 'Recording backups in local PostgreSQL'
              : 'This study set has no recording backups.'}
          </p>
          {items.map((item) => (
            <div className="lecture-backup-entry" key={item.id}>
              <strong>{item.title}</strong>{' '}
              <small>
                {(item.size / 1048576).toFixed(1)} MiB ·{' '}
                {item.complete ? 'Backed up' : 'Incomplete backup'}
              </small>
              {item.complete &&
                (lectures.some((l) => l.id === item.id) ? (
                  <small>On this device</small>
                ) : (
                  <button
                    className="sp-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (signal) => {
                        const lecture = await restoreLecture(
                          access,
                          setId,
                          item.id,
                          signal,
                          setMessage,
                        );
                        if (!signal.aborted) {
                          onRestore(lecture);
                          setMessage('Recording restored on this device.');
                        }
                      })
                    }
                  >
                    Restore recording
                  </button>
                ))}
              {deleting === item.id ? (
                <>
                  <span>Delete the PostgreSQL backup?</span>
                  <button
                    className="sp-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (signal) => {
                        await removeRecordingBackup(access, item, signal);
                        if (!signal.aborted) {
                          setItems((rows) => rows?.filter((r) => r.id !== item.id) ?? []);
                          setDeleting('');
                          setMessage('PostgreSQL backup deleted.');
                        }
                      })
                    }
                  >
                    Delete backup
                  </button>
                  <button className="text-button" onClick={() => setDeleting('')}>
                    Keep backup
                  </button>
                </>
              ) : (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setDeleting(item.id)}
                >
                  Remove backup
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
