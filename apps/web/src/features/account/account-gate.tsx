import { AuthForms, OAuthCallback } from './auth-forms';
import { ClerkProvider, useClerk, useSession, useUser } from '@clerk/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { WorkspaceAccessContext, type WorkspaceAccess } from '@/lib/workspace-access';
import { authPage, returnPath, signRoute } from './auth-route';
import {
  AccountRejected,
  bindAccount,
  releaseAccount,
  tokenForSession,
  type AccountSession,
} from './bound-session';
import { AccountShell } from './account-shell';

const Workspace = lazy(() =>
  import('../study-workspace').then(({ StudyWorkspace }) => ({ default: StudyWorkspace })),
);
const loading = (
  <AccountShell>
    <p role="status">Verifying your session…</p>
  </AccountShell>
);
function Navigate({ to }: { to: string }) {
  useEffect(() => location.replace(to), [to]);
  return loading;
}
function lockedKey(sid: string) {
  return 'studypal:signed-out:' + sid;
}
function locallyLocked(sid: string) {
  try {
    return localStorage.getItem(lockedKey(sid)) === '1';
  } catch {
    return false;
  }
}
type ClerkAccess = Extract<WorkspaceAccess, { mode: 'clerk' }>;

function VerifiedWorkspace({
  identity,
  expiresAt,
  name,
  leave,
  manage,
}: {
  identity: AccountSession;
  expiresAt: number;
  name: string;
  leave: (switching: boolean) => Promise<void>;
  manage: () => void;
}) {
  const identityRef = useRef(identity);
  const expiryRef = useRef(expiresAt);
  const [bound, setBound] = useState<{ access: ClerkAccess; csrf: string }>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(() => locallyLocked(identity.id));
  const [leaving, setLeaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    identityRef.current = identity;
    expiryRef.current = expiresAt;
  }, [identity, expiresAt]);
  useEffect(() => {
    if (locked) return;
    const cancel = new AbortController();
    controller.current = cancel;
    let expiry: number | undefined, renewal: number | undefined;
    let bindingExpires = Infinity;
    let access: ClerkAccess | undefined;
    let checking = false;
    function lock(message: string) {
      cancel.abort();
      setBound(undefined);
      setError(message);
    }
    function validate() {
      if (cancel.signal.aborted) return;
      if (locallyLocked(identityRef.current.id)) {
        lock('Signed out on this device.');
        setLocked(true);
        return;
      }
      if (Date.now() >= Math.min(bindingExpires, expiryRef.current)) {
        lock('Your session has expired. Reconnect to verify your account.');
        return;
      }
      if (access && navigator.onLine && bindingExpires - Date.now() <= 60_000) void verify();
    }
    function changed(e: StorageEvent) {
      if (e.key === lockedKey(identityRef.current.id) && e.newValue === '1') validate();
    }
    async function verify() {
      if (checking || cancel.signal.aborted) return;
      checking = true;
      try {
        if (!navigator.onLine) throw new Error();
        const principal = identityRef.current;
        const verified = await bindAccount(principal, cancel.signal);
        if (cancel.signal.aborted) return;
        if (access && verified.ownerId !== access.ownerId) {
          lock('Your account changed. Verify your session again.');
          return;
        }
        bindingExpires = verified.expiresAt;
        const remaining = Math.min(bindingExpires, expiryRef.current) - Date.now();
        if (remaining <= 0) {
          lock('Your session has expired. Reconnect to verify your account.');
          return;
        }
        access ??= {
          mode: 'clerk',
          ownerId: verified.ownerId,
          signal: cancel.signal,
          getToken: () =>
            !cancel.signal.aborted &&
            Date.now() < Math.min(bindingExpires, expiryRef.current) &&
            !locallyLocked(principal.id)
              ? tokenForSession(principal)
              : Promise.resolve(null),
          onUnauthorized: () => lock('Your sign-in has changed. Verify your account to continue.'),
        };
        window.clearTimeout(expiry);
        window.clearTimeout(renewal);
        expiry = window.setTimeout(validate, remaining);
        if (remaining > 60_000)
          renewal = window.setTimeout(() => {
            if (navigator.onLine) void verify();
          }, remaining - 60_000);
        setBound({ access, csrf: verified.csrfToken });
        setError('');
      } catch (reason) {
        if (cancel.signal.aborted) return;
        if (reason instanceof AccountRejected) {
          lock('StudyPal could not verify your session. Sign in again to open your workspace.');
          return;
        }
        if (!access)
          setError(
            navigator.onLine
              ? 'StudyPal could not verify your session. Check your connection to the account server.'
              : 'Connect to the internet to verify this session and unlock your workspace.',
          );
      } finally {
        checking = false;
      }
    }
    window.addEventListener('storage', changed);
    window.addEventListener('pageshow', validate);
    window.addEventListener('focus', validate);
    window.addEventListener('online', validate);
    document.addEventListener('visibilitychange', validate);
    const begin = window.setTimeout(() => void verify(), 0);
    return () => {
      window.clearTimeout(begin);
      window.clearTimeout(expiry);
      window.clearTimeout(renewal);
      window.removeEventListener('storage', changed);
      window.removeEventListener('pageshow', validate);
      window.removeEventListener('focus', validate);
      window.removeEventListener('online', validate);
      document.removeEventListener('visibilitychange', validate);
      cancel.abort();
    };
  }, [attempt, locked]);
  async function signOut(switching = false) {
    if (leaving) return;
    setLeaving(true);
    setLocked(true);
    try {
      localStorage.setItem(lockedKey(identity.id), '1');
    } catch {
      /* Keep the current view locked. */
    }
    controller.current?.abort();
    const current = bound;
    setBound(undefined);
    setError('');
    try {
      if (current && navigator.onLine)
        await releaseAccount(identity, current.csrf).catch(() => undefined);
      await leave(switching);
    } catch {
      setError('Reconnect to finish signing out.');
    } finally {
      setLeaving(false);
    }
  }
  if (locked)
    return (
      <AccountShell>
        <h1>Workspace locked</h1>
        <p role="status">{error || 'Your study materials are closed on this device.'}</p>
        <button disabled={leaving} className="account-action" onClick={() => void signOut()}>
          {leaving ? 'Signing out…' : 'Finish signing out'}
        </button>
      </AccountShell>
    );
  if (error)
    return (
      <AccountShell>
        <h1>Verify your account</h1>
        <p role="alert">{error}</p>
        <button className="account-action" onClick={() => setAttempt((v) => v + 1)}>
          Try again
        </button>
        <button className="account-action" onClick={() => void signOut()}>
          Sign out
        </button>
      </AccountShell>
    );
  if (!bound) return loading;
  const actions = (
    <div className="account-actions">
      <button onClick={manage}>Manage account</button>
      <button onClick={() => void signOut(true)}>Switch account</button>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
  return (
    <WorkspaceAccessContext.Provider value={bound.access}>
      <Suspense fallback={loading}>
        <Workspace key={bound.access.ownerId} accountName={name} accountActions={actions} />
      </Suspense>
    </WorkspaceAccessContext.Provider>
  );
}
function ConnectionStatus() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(t);
  }, []);
  return slow ? (
    <AccountShell>
      <h1>Sign-in is unavailable</h1>
      <p role="alert">Reconnect to the internet and try signing in again.</p>
      <button className="account-action" onClick={() => location.reload()}>
        Retry sign-in
      </button>
    </AccountShell>
  ) : (
    loading
  );
}

function Routes() {
  const clerk = useClerk();
  const { isLoaded, session, isSignedIn } = useSession();
  const { user, isLoaded: userLoaded } = useUser();
  const current = location.pathname + location.search + location.hash;
  const route = authPage(location.pathname);
  const dest = returnPath(new URLSearchParams(location.search).get('returnTo'), location.origin);
  if (!isLoaded || !userLoaded) return <ConnectionStatus />;
  if (location.pathname === '/sign-in/sso-callback') return <OAuthCallback dest={dest} />;
  if (!isSignedIn || !user || !session || session.status !== 'active') {
    if (!route) return <Navigate to={signRoute('in', returnPath(current, location.origin))} />;
    return <AuthForms key={location.pathname} signup={route === 'up'} dest={dest} />;
  }
  if (route) return <Navigate to={dest} />;
  if (!['/', '/local', '/local/'].includes(location.pathname)) return <Navigate to="/" />;
  const identity: AccountSession = {
    id: session.id,
    userId: user.id,
    getToken: () => session.getToken(),
  };
  return (
    <VerifiedWorkspace
      key={session.id + ':' + user.id}
      identity={identity}
      expiresAt={Math.min(session.expireAt.getTime(), session.abandonAt.getTime())}
      name={
        user.fullName?.trim() ||
        user.username ||
        user.primaryEmailAddress?.emailAddress ||
        'My account'
      }
      leave={(switching) =>
        clerk.signOut({
          redirectUrl: switching
            ? signRoute('in', returnPath(current, location.origin))
            : '/sign-in',
        })
      }
      manage={() => void clerk.redirectToUserProfile()}
    />
  );
}
export function AccountGate({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider
      telemetry={false}
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      allowedRedirectOrigins={[location.origin]}
      afterSignOutUrl="/sign-in"
    >
      <Routes />
    </ClerkProvider>
  );
}
