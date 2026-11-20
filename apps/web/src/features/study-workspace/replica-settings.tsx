import { useState, useSyncExternalStore } from 'react';
import { downloadText, readSnapshot } from './workspace-format';
import type { WorkspaceReplica } from './workspace-replica';

export function ReplicaLabel({ replica }: { replica: WorkspaceReplica }) {
  const status = useSyncExternalStore(replica.subscribe, replica.status);
  return <>{status.label}</>;
}
export function ReplicaSettings({ replica }: { replica: WorkspaceReplica }) {
  const status = useSyncExternalStore(replica.subscribe, replica.status);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch {
      setError(
        'Could not restore this backup. Choose a valid StudyPal JSON backup under 32 MiB, or reload if another tab is editing.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-form">
      <h3 role="status">{status.label}</h3>
      <p>{status.detail}</p>
      {status.needsKey ? (
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = key;
            setKey('');
            void run(() => replica.pair(value));
          }}
        >
          <p>
            On your Mac, run <code>node scripts/pair-workspace.mjs --copy</code> in the StudyPal
            folder, then paste the key below.
          </p>
          <label>
            Pairing key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </label>
          <button className="sp-button dark" disabled={busy || !key.trim()}>
            Pair browser
          </button>
        </form>
      ) : status.conflict ? (
        <>
          <button
            className="sp-button dark"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Replace the study sets in this browser with the database copy?'))
                void run(() => replica.resolve('database'));
            }}
          >
            Load database copy
          </button>
          <button
            className="sp-button white"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Replace the PostgreSQL workspace with this browser copy?'))
                void run(() => replica.resolve('browser'));
            }}
          >
            Keep browser copy
          </button>
        </>
      ) : (
        <button className="sp-button white" disabled={busy} onClick={() => void run(replica.retry)}>
          Sync now
        </button>
      )}{' '}
      <details>
        <summary>Workspace backup</summary>
        <p>Export study data as JSON. Recording audio can be downloaded from Record Lecture.</p>
        <button
          className="sp-button white"
          disabled={busy}
          onClick={() =>
            downloadText('studypal-browser-backup.json', replica.backup(), 'application/json')
          }
        >
          Download browser copy
        </button>
        <label>
          Restore workspace backup
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void run(async () => {
                if (file.size > 32 * 1024 * 1024) throw new Error('Too large');
                const next = readSnapshot(await file.text());
                if (
                  window.confirm(
                    'Replace the study sets in this browser with this backup? If paired, the restored workspace will sync to PostgreSQL.',
                  )
                )
                  await replica.restoreBackup(next);
              });
            }}
          />
        </label>
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
