import { useState, type ReactNode } from 'react';
import { ToolIllustration } from './illustrations';
import { Modal } from './primitives';
import { ReplicaLabel, ReplicaSettings } from './replica-settings';
import type { WorkspaceReplica } from './workspace-replica';
import './empty-workspace.css';

export function EmptyWorkspace({
  accountName,
  accountActions,
  replica,
  error,
  onCreate,
}: {
  accountName: string;
  accountActions?: ReactNode;
  replica?: WorkspaceReplica | undefined;
  error: string;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState(false);
  return (
    <div className="study-workspace first-workspace">
      <header>
        <strong>StudyPal</strong>
        <div>
          {replica && (
            <button className="sp-button white" onClick={() => setSettings(true)}>
              <ReplicaLabel replica={replica} />
            </button>
          )}
          {accountActions}
        </div>
      </header>
      <main>
        <div className="first-workspace-art">
          <ToolIllustration kind="set" />
        </div>
        {accountName && <p>Welcome, {accountName}.</p>}
        <h1>Create your first study set</h1>
        <p>
          Give your course or topic a name. Then add your notes or record a lecture to start
          studying.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onCreate(name.trim());
          }}
        >
          <label>
            Study set name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button className="sp-button dark" disabled={!name.trim()}>
            Create study set
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
      {settings && replica && (
        <Modal title="Local workspace" onClose={() => setSettings(false)}>
          <ReplicaSettings replica={replica} />
        </Modal>
      )}
    </div>
  );
}
