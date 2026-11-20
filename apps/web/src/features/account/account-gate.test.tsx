import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AccountGate } from './account-gate';
import { authPage, returnPath } from './auth-route';
import { authConfig } from '@/lib/env';
import { useWorkspaceAccess } from '@/lib/workspace-access';

const state = vi.hoisted(() => ({
  id: 'A',
  active: true,
  stableExpiry: 0,
  signOut: vi.fn(async () => undefined),
}));
function jwt(id: string) {
  return (
    'header.' +
    btoa(JSON.stringify({ sub: 'user_' + id, sid: 'sess_' + id, exp: Date.now() / 1000 + 90 })) +
    '.synthetic'
  );
}
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useUser: () => ({
    isLoaded: true,
    user: state.active ? { id: 'user_' + state.id, fullName: state.id + ' Student' } : null,
  }),
  useSession: () => ({
    isLoaded: true,
    isSignedIn: state.active,
    session: state.active
      ? {
          id: 'sess_' + state.id,
          status: 'active',
          expireAt: new Date(state.stableExpiry),
          abandonAt: new Date(state.stableExpiry),
          getToken: () => Promise.resolve(jwt(state.id)),
        }
      : null,
  }),
  useClerk: () => ({ signOut: state.signOut, openUserProfile: vi.fn() }),
  useSignIn: () => ({ errors: { global: null }, signIn: { status: 'needs_identifier' } }),
  useSignUp: () => ({ errors: { global: null }, signUp: { status: null } }),
}));
vi.mock('../study-workspace', () => ({
  StudyWorkspace: ({
    accountName,
    accountActions,
  }: {
    accountName: string;
    accountActions: ReactNode;
  }) => {
    const access = useWorkspaceAccess();
    return (
      <section>
        {accountName} {access.mode === 'clerk' && access.ownerId} {accountActions}
      </section>
    );
  },
}));
const ownerA = '17aaaab9-d620-42cc-98b0-055b0d3317fb',
  ownerB = '128c7b28-c25e-4dd7-93e1-9e94bc87c103';
beforeEach(() => {
  state.id = 'A';
  state.active = true;
  state.stableExpiry = Date.now() + 300_000;
  state.signOut.mockClear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => vi.unstubAllGlobals());
it('refuses return URLs outside the workspace and requires explicit local mode', () => {
  expect(returnPath('/local#plan', 'https://app.test')).toBe('/local#plan');
  for (const path of [
    '//other.test/',
    '/\\other.test/',
    '/sign-in?returnTo=bad',
    'https://other.test/',
  ])
    expect(returnPath(path, 'https://app.test')).toBe('/');
  expect(authPage('/sign-in/factor-one')).toBe('in');
  expect(authPage('/sign-up/verify-email-address')).toBe('up');
  expect(authConfig({})).toEqual({ mode: 'unavailable' });
  expect(authConfig({ VITE_WORKSPACE_AUTH_MODE: 'local' })).toEqual({ mode: 'local' });
});
it('renders StudyPal registration and recovery pages while signed out without opening storage', () => {
  state.active = false;
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  window.history.replaceState(null, '', '/sign-up/verify-email-address');
  const view = render(<AccountGate publishableKey="pk_test_fake" />);
  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  window.history.replaceState(null, '', '/sign-in/reset-password');
  view.rerender(<AccountGate publishableKey="pk_test_fake" />);
  expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  expect(http).not.toHaveBeenCalled();
});
it('exchanges each authenticated account before rendering, clears the old workspace on a switch and releases the binding before provider sign-out', async () => {
  const requests: string[] = [];
  const http = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    requests.push(path);
    expect(request.credentials).toBe('same-origin');
    expect(request.headers.get('authorization')).toBe(
      'Bearer ' + jwtForRequest(request.headers.get('authorization')!, state.id),
    );
    if (path.endsWith('sign-out')) {
      expect(request.headers.get('X-StudyPal-CSRF')).toBe('csrfB');
      return new Response(null, { status: 204 });
    }
    return Response.json({
      ownerId: state.id === 'A' ? ownerA : ownerB,
      csrfToken: 'csrf' + state.id,
      expiresAt: new Date(state.stableExpiry).toISOString(),
    });
  });
  vi.stubGlobal('fetch', http);
  const view = render(<AccountGate publishableKey="pk_test_fake" />);
  expect(await screen.findByText(new RegExp('A Student ' + ownerA))).toBeVisible();
  state.id = 'B';
  view.rerender(<AccountGate publishableKey="pk_test_fake" />);
  expect(screen.queryByText(/A Student/)).toBeNull();
  expect(await screen.findByText(new RegExp('B Student ' + ownerB))).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(state.signOut).toHaveBeenCalledOnce());
  expect(screen.queryByText(/B Student/)).toBeNull();
  expect(requests).toEqual([
    '/api/v1/workspace/sign-in',
    '/api/v1/workspace/sign-in',
    '/api/v1/workspace/sign-out',
  ]);
});
function jwtForRequest(value: string, id: string) {
  const token = value.slice(7);
  expect(JSON.parse(atob(token.split('.')[1]!))).toMatchObject({
    sub: 'user_' + id,
    sid: 'sess_' + id,
  });
  return token;
}
it('keeps account data locked on rejected binding and when starting offline', async () => {
  const http = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', http);
  const view = render(<AccountGate publishableKey="pk_test_fake" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not verify');
  expect(screen.queryByText(/A Student/)).toBeNull();
  view.unmount();
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    render(<AccountGate publishableKey="pk_test_fake" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connect to the internet');
    expect(http).toHaveBeenCalledOnce();
  } finally {
    online.mockRestore();
  }
});

it('locks an open dashboard immediately when the API rejects its verified identity during renewal', async () => {
  const binder = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        ownerId: ownerA,
        csrfToken: 'csrfA',
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  vi.stubGlobal('fetch', binder);
  render(<AccountGate publishableKey="pk_test_fake" />);
  expect(await screen.findByText(new RegExp('A Student ' + ownerA))).toBeVisible();
  fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not verify');
  expect(screen.queryByText(/A Student/)).toBeNull();
  expect(binder).toHaveBeenCalledTimes(2);
});
