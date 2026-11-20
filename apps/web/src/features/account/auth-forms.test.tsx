import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthForms } from './auth-forms';

const sdk = vi.hoisted(() => {
  const action = () => vi.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const method = () => ({ sendCode: action(), verifyCode: action() });
  return {
    in: {
      status: 'needs_identifier',
      supportedSecondFactors: [] as { strategy: string }[],
      password: action(),
      create: action(),
      finalize: action(),
      emailCode: method(),
      resetPasswordEmailCode: { ...method(), submitPassword: action() },
      mfa: { sendEmailCode: action(), verifyEmailCode: action(), verifyTOTP: action() },
      sso: action(),
    },
    up: {
      status: 'missing_requirements',
      missingFields: [] as string[],
      unverifiedFields: [] as string[],
      password: action(),
      verifications: { sendEmailCode: action(), verifyEmailCode: action() },
      finalize: action(),
    },
  };
});
vi.mock('@clerk/react', () => ({
  useSignIn: () => ({ errors: { global: null }, signIn: sdk.in }),
  useSignUp: () => ({ errors: { global: null }, signUp: sdk.up }),
  useClerk: () => ({}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  sdk.in.status = 'needs_identifier';
  sdk.in.supportedSecondFactors = [];
  sdk.up.status = 'missing_requirements';
  sdk.up.missingFields = [];
  sdk.up.unverifiedFields = [];
  history.replaceState(null, '', '/sign-in');
});
afterEach(() => vi.unstubAllEnvs());
function fill(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
it('verifies and resends a registration code, allows retry, and focuses the verification step', async () => {
  render(<AuthForms signup dest="/" />);
  fill('Email address', 'student@example.test');
  fill('Password', 'synthetic-password');
  sdk.up.unverifiedFields = ['email_address'];
  click('Create account');
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toHaveFocus();
  expect(sdk.up.password).toHaveBeenCalledWith({
    emailAddress: 'student@example.test',
    password: 'synthetic-password',
  });
  expect(sdk.up.verifications.sendEmailCode).toHaveBeenCalledOnce();
  click('Resend code');
  expect(await screen.findByRole('status')).toHaveTextContent('A new code has been sent.');
  sdk.up.verifications.verifyEmailCode.mockResolvedValueOnce({
    error: { errors: [{ longMessage: 'That code expired.' }] },
  });
  fill('Verification code', '999999');
  click('Verify email');
  expect(await screen.findByRole('alert')).toHaveTextContent('That code expired.');
  expect(sdk.up.finalize).not.toHaveBeenCalled();
  sdk.up.status = 'complete';
  fill('Verification code', '000000');
  click('Verify email');
  await waitFor(() => expect(sdk.up.finalize).toHaveBeenCalledOnce());
  expect(sdk.up.verifications.verifyEmailCode).toHaveBeenLastCalledWith({ code: '000000' });
});
it('supports email-code sign-in without asking for a password', async () => {
  render(<AuthForms signup={false} dest="/local" />);
  click('Use an email code');
  expect(screen.queryByLabelText('Password')).toBeNull();
  fill('Email address', 'student@example.test');
  click('Send code');
  expect(await screen.findByRole('heading', { name: 'Enter your code' })).toHaveFocus();
  expect(sdk.in.emailCode.sendCode).toHaveBeenCalledWith({ emailAddress: 'student@example.test' });
  sdk.in.status = 'complete';
  fill('Verification code', '000000');
  click('Verify code');
  await waitFor(() => expect(sdk.in.finalize).toHaveBeenCalledOnce());
  expect(sdk.in.emailCode.verifyCode).toHaveBeenCalledWith({ code: '000000' });
});
it('requires email verification before accepting a new recovery password', async () => {
  history.replaceState(null, '', '/sign-in/reset-password');
  render(<AuthForms signup={false} dest="/" />);
  fill('Email address', 'student@example.test');
  click('Send reset code');
  expect(await screen.findByLabelText('Verification code')).toBeVisible();
  expect(sdk.in.create).toHaveBeenCalledWith({ identifier: 'student@example.test' });
  expect(sdk.in.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('New password')).toBeNull();
  fill('Verification code', '000000');
  click('Verify code');
  expect(await screen.findByLabelText('New password')).toBeVisible();
  expect(sdk.in.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: '000000' });
  sdk.in.status = 'complete';
  fill('New password', 'new-synthetic-password');
  click('Reset password');
  await waitFor(() => expect(sdk.in.finalize).toHaveBeenCalledOnce());
  expect(sdk.in.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
    password: 'new-synthetic-password',
  });
});
it('asks for the offered device-trust factor and completes only after verification', async () => {
  render(<AuthForms signup={false} dest="/" />);
  fill('Email address', 'student@example.test');
  fill('Password', 'synthetic-password');
  sdk.in.status = 'needs_client_trust';
  sdk.in.supportedSecondFactors = [{ strategy: 'email_code' }];
  click('Sign in');
  expect(await screen.findByLabelText('Verification code')).toBeVisible();
  expect(sdk.in.mfa.sendEmailCode).toHaveBeenCalledOnce();
  expect(sdk.in.finalize).not.toHaveBeenCalled();
  sdk.in.status = 'complete';
  fill('Verification code', '000000');
  click('Verify code');
  await waitFor(() => expect(sdk.in.finalize).toHaveBeenCalledOnce());
  expect(sdk.in.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '000000' });
});
it('lets an enrolled account choose its authenticator instead of requesting an email', async () => {
  sdk.in.status = 'needs_second_factor';
  sdk.in.supportedSecondFactors = [{ strategy: 'totp' }, { strategy: 'email_code' }];
  render(<AuthForms signup={false} dest="/" />);
  click('Authenticator app');
  expect(
    await screen.findByText('Use the current code from your authenticator app.'),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
  expect(sdk.in.mfa.sendEmailCode).not.toHaveBeenCalled();
  sdk.in.status = 'complete';
  fill('Verification code', '000000');
  click('Verify code');
  await waitFor(() => expect(sdk.in.finalize).toHaveBeenCalledOnce());
  expect(sdk.in.mfa.verifyTOTP).toHaveBeenCalledWith({ code: '000000' });
});
it('opens Google with the application callback and the selected workspace route', async () => {
  vi.stubEnv('VITE_CLERK_GOOGLE_ENABLED', 'true');
  render(<AuthForms signup={false} dest="/local#notes" />);
  click('Continue with Google');
  await waitFor(() =>
    expect(sdk.in.sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectCallbackUrl: location.origin + '/sign-in/sso-callback?returnTo=%2Flocal%23notes',
      redirectUrl: location.origin + '/local#notes',
    }),
  );
});
