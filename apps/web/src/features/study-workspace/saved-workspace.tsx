import { useWorkspaceAccess } from '@/lib/workspace-access';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { openWorkspace, type WorkspaceData } from './workspace-storage';
import { createReplica, type WorkspaceReplica } from './workspace-replica';
import { StudyWorkspace } from './workspace';

interface Loaded {
  initial: WorkspaceData;
  save: (data: WorkspaceData) => Promise<void>;
  replica: WorkspaceReplica;
  generation: number;
}

export function SavedWorkspace({
  accountName,
  accountActions,
}: {
  accountName?: string;
  accountActions?: ReactNode;
}) {
  const access = useWorkspaceAccess();
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState('');
  useEffect(() => {
    let closed = false;
    let dispose: (() => void) | undefined;
    void openWorkspace(access)
      .then(async (storage) => {
        if (closed) {
          storage.close();
          return;
        }
        const replica = createReplica(access, storage, (initial) =>
          setLoaded((prev) => prev && { ...prev, initial, generation: prev.generation + 1 }),
        );
        dispose = () => {
          replica.close();
          storage.close();
        };
        // A fresh browser restores its owner's existing server copy before exposing an editable empty workspace.
        if (access.mode === 'clerk' && storage.revision === 0) await replica.ready;
        if (closed) return;
        setLoaded({
          initial: storage.data,
          replica,
          generation: 0,
          save: async (data) => {
            const before = storage.revision;
            await storage.save(data);
            if (storage.revision !== before) replica.changed();
          },
        });
      })
      .catch(() => {
        if (!closed)
          setError(
            'StudyPal needs access to browser storage. Allow site storage and reload to open your workspace.',
          );
      });
    return () => {
      closed = true;
      dispose?.();
    };
  }, [access]);
  if (error)
    return (
      <main role="alert">
        {error} <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  return loaded ? (
    <StudyWorkspace
      key={loaded.generation}
      {...(accountName ? { accountName } : {})}
      accountActions={accountActions}
      initial={loaded.initial}
      save={loaded.save}
      replica={loaded.replica}
    />
  ) : (
    <main role="status">Opening your study sets…</main>
  );
}
