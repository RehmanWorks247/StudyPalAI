import { lazy, Suspense } from 'react';
import { configuredAuth } from '@/lib/env';
import { WorkspaceAccessContext, localAccess } from '@/lib/workspace-access';
import { AccountShell } from '@/features/account/account-shell';

const Gate = lazy(() =>
  import('@/features/account').then(({ AccountGate }) => ({ default: AccountGate })),
);
const Workspace = lazy(() =>
  import('@/features/study-workspace').then(({ StudyWorkspace }) => ({ default: StudyWorkspace })),
);

export function App() {
  const config = configuredAuth();
  if (config.mode === 'unavailable')
    return (
      <AccountShell>
        <div role="alert">
          <h1>Sign-in needs setup</h1>
          <p>Configure the Clerk publishable key for this installation, then rebuild StudyPal.</p>
        </div>
      </AccountShell>
    );
  return (
    <Suspense
      fallback={
        <AccountShell>
          <p role="status">Opening StudyPal…</p>
        </AccountShell>
      }
    >
      {config.mode === 'local' ? (
        <WorkspaceAccessContext.Provider value={localAccess}>
          <Workspace />
        </WorkspaceAccessContext.Provider>
      ) : (
        <Gate publishableKey={config.publishableKey} />
      )}
    </Suspense>
  );
}
