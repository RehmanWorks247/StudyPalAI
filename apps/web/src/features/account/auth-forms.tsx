import { HandleSSOCallback, useClerk, useSignIn, useSignUp } from '@clerk/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { accountMethods } from '@/lib/env';
import { AccountShell } from './account-shell';
import { signRoute } from './auth-route';

type Stage =
  | 'password'
  | 'email'
  | 'email-code'
  | 'verify-email'
  | 'reset'
  | 'reset-code'
  | 'new-password'
  | 'factors'
  | 'second-code'
  | 'names';
type Factor = 'email_code' | 'phone_code' | 'totp' | 'backup_code';
const factorNames: Record<Factor, string> = {
  email_code: 'Email code',
  phone_code: 'Text message',
  totp: 'Authenticator app',
  backup_code: 'Backup code',
};
const codeHelp: Record<Factor, string> = {
  email_code: 'Check your email for your verification code.',
  phone_code: 'Check your phone for your verification code.',
  totp: 'Use the current code from your authenticator app.',
  backup_code: 'Enter one of your unused backup codes.',
};
const labels: Record<
  Exclude<Stage, 'password'> | 'sign-in' | 'sign-up',
  { title: string; command: string }
> = {
  'sign-in': { title: 'Sign in to StudyPal', command: 'Sign in' },
  'sign-up': { title: 'Create your account', command: 'Create account' },
  names: { title: 'Your name', command: 'Continue' },
  factors: { title: 'Verify your identity', command: 'Continue' },
  reset: { title: 'Reset your password', command: 'Send reset code' },
  'new-password': { title: 'Set a new password', command: 'Reset password' },
  email: { title: 'Sign in with a code', command: 'Send code' },
  'verify-email': { title: 'Verify your email', command: 'Verify email' },
  'email-code': { title: 'Enter your code', command: 'Verify code' },
  'reset-code': { title: 'Enter your code', command: 'Verify code' },
  'second-code': { title: 'Enter your code', command: 'Verify code' },
};

function readable(error: unknown) {
  if (error && typeof error === 'object') {
    if ('errors' in error && Array.isArray(error.errors) && error.errors[0])
      return readable(error.errors[0]);
    if ('longMessage' in error && typeof error.longMessage === 'string') return error.longMessage;
    if (
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.length < 220 &&
      !/https?:|stack|fetch|network/i.test(error.message)
    )
      return error.message;
  }
  return 'Could not complete this step. Check your connection and try again.';
}
function check(result: { error: unknown }) {
  if (result.error) throw result.error;
}
function callbackPath(dest: string) {
  return '/sign-in/sso-callback' + (dest === '/' ? '' : '?returnTo=' + encodeURIComponent(dest));
}
function resetPath(dest: string) {
  return '/sign-in/reset-password' + (dest === '/' ? '' : '?returnTo=' + encodeURIComponent(dest));
}
const supported = (value: string): value is Factor => Object.hasOwn(factorNames, value);

export function OAuthCallback({ dest }: { dest: string }) {
  return (
    <AccountShell>
      <h1>Finishing sign-in</h1>
      <p role="status">Verifying your account…</p>
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) => location.replace(decorateUrl(dest))}
        navigateToSignIn={() => location.replace(signRoute('in', dest))}
        navigateToSignUp={() => location.replace(signRoute('up', dest))}
      />
    </AccountShell>
  );
}
export function AuthForms({ signup, dest }: { signup: boolean; dest: string }) {
  const { signIn, errors: signInErrors } = useSignIn(),
    { signUp, errors: signUpErrors } = useSignUp();
  const clerk = useClerk();
  const methods = accountMethods();
  const reset = location.pathname === '/sign-in/reset-password';
  const [stage, setStage] = useState<Stage>(() => {
    if (
      signup &&
      signUp.status === 'missing_requirements' &&
      signUp.unverifiedFields.includes('email_address')
    )
      return 'verify-email';
    if (!signup && signIn.status === 'needs_new_password') return 'new-password';
    if (
      !signup &&
      (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust')
    )
      return 'factors';
    if (reset)
      return signIn.firstFactorVerification?.strategy === 'reset_password_email_code'
        ? 'reset-code'
        : 'reset';
    if (
      !signup &&
      signIn.status === 'needs_first_factor' &&
      signIn.firstFactorVerification?.strategy === 'email_code'
    )
      return 'email-code';
    if (
      signup &&
      signUp.status === 'missing_requirements' &&
      signUp.missingFields.some((f) => f === 'first_name' || f === 'last_name')
    )
      return 'names';
    return 'password';
  });
  const [email, setEmail] = useState(
    signup ? (signUp.emailAddress ?? '') : (signIn.identifier ?? ''),
  );
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState(signUp.firstName ?? ''),
    [last, setLast] = useState(signUp.lastName ?? '');
  const [factor, setFactor] = useState<Factor>('email_code');
  const [error, setError] = useState(() => {
      const providerError = (signup ? signUpErrors : signInErrors).global?.[0];
      return providerError ? readable(providerError) : '';
    }),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStage = useRef(stage);
  useEffect(() => {
    if (lastStage.current !== stage) heading.current?.focus();
    lastStage.current = stage;
  }, [stage]);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      setError(readable(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function finish({ decorateUrl }: { decorateUrl: (path: string) => string }) {
    location.replace(decorateUrl(dest));
  }
  async function sendFactor(value: Factor) {
    if (value === 'email_code') check(await signIn.mfa.sendEmailCode());
    if (value === 'phone_code') check(await signIn.mfa.sendPhoneCode());
    setFactor(value);
    setCode('');
    setStage('second-code');
  }
  async function nextSignIn() {
    if (signIn.status === 'complete') {
      check(await signIn.finalize({ navigate: finish }));
      return;
    }
    if (signIn.status === 'needs_new_password') {
      setPassword('');
      setStage('new-password');
      return;
    }
    if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
      const factors = signIn.supportedSecondFactors.map((f) => f.strategy).filter(supported);
      if (factors.length === 1) await sendFactor(factors[0]!);
      else if (factors.length) setStage('factors');
      else
        throw new Error(
          'This account requires a verification method that is unavailable on this device.',
        );
      return;
    }
    if (signIn.existingSession) {
      await clerk.setActive({ session: signIn.existingSession.sessionId, navigate: finish });
      return;
    }
    throw new Error('Your sign-in needs another verification step. Try signing in again.');
  }
  async function nextSignUp() {
    if (signUp.status === 'complete') {
      check(await signUp.finalize({ navigate: finish }));
      return;
    }
    if (signUp.missingFields.some((f) => f === 'first_name' || f === 'last_name')) {
      setStage('names');
      return;
    }
    if (signUp.unverifiedFields.includes('email_address')) {
      check(await signUp.verifications.sendEmailCode());
      setCode('');
      setStage('verify-email');
      return;
    }
    throw new Error('This registration requires another account verification step.');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      switch (stage) {
        case 'password':
          if (signup) {
            check(
              await signUp.password({
                emailAddress: email.trim(),
                password,
                ...(methods.names ? { firstName: first.trim(), lastName: last.trim() } : {}),
              }),
            );
            setPassword('');
            await nextSignUp();
          } else {
            check(await signIn.password({ emailAddress: email.trim(), password }));
            setPassword('');
            await nextSignIn();
          }
          break;
        case 'names':
          check(
            await signUp.update({
              ...(methods.names || signUp.missingFields.includes('first_name')
                ? { firstName: first.trim() }
                : {}),
              ...(methods.names || signUp.missingFields.includes('last_name')
                ? { lastName: last.trim() }
                : {}),
            }),
          );
          await nextSignUp();
          break;
        case 'verify-email':
          check(await signUp.verifications.verifyEmailCode({ code: code.trim() }));
          await nextSignUp();
          break;
        case 'email':
          check(await signIn.emailCode.sendCode({ emailAddress: email.trim() }));
          setCode('');
          setStage('email-code');
          break;
        case 'email-code':
          check(await signIn.emailCode.verifyCode({ code: code.trim() }));
          await nextSignIn();
          break;
        case 'reset':
          check(await signIn.create({ identifier: email.trim() }));
          check(await signIn.resetPasswordEmailCode.sendCode());
          setCode('');
          setStage('reset-code');
          break;
        case 'reset-code':
          check(await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }));
          setPassword('');
          setStage('new-password');
          break;
        case 'new-password':
          check(await signIn.resetPasswordEmailCode.submitPassword({ password }));
          setPassword('');
          await nextSignIn();
          break;
        case 'second-code': {
          const input = { code: code.trim() };
          const verify = {
            email_code: () => signIn.mfa.verifyEmailCode(input),
            phone_code: () => signIn.mfa.verifyPhoneCode(input),
            totp: () => signIn.mfa.verifyTOTP(input),
            backup_code: () => signIn.mfa.verifyBackupCode(input),
          };
          check(await verify[factor]());
          await nextSignIn();
          break;
        }
      }
    });
  }
  async function resend() {
    if (stage === 'verify-email') check(await signUp.verifications.sendEmailCode());
    if (stage === 'email-code') check(await signIn.emailCode.sendCode());
    if (stage === 'reset-code') check(await signIn.resetPasswordEmailCode.sendCode());
    if (stage === 'second-code') await sendFactor(factor);
    setNotice('A new code has been sent.');
  }
  const isIntro = stage === 'password',
    isCode = ['verify-email', 'email-code', 'second-code', 'reset-code'].includes(stage);
  const intro = signup ? 'sign-up' : 'sign-in';
  const { title, command } = labels[stage === 'password' ? intro : stage];
  const requestName = methods.names && isIntro && signup;
  return (
    <AccountShell>
      <div className="auth-form">
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {isIntro && methods.google && (
          <>
            <button
              type="button"
              disabled={busy}
              className="auth-social"
              onClick={() =>
                void run(async () => {
                  const args = {
                    strategy: 'oauth_google' as const,
                    redirectCallbackUrl: new URL(callbackPath(dest), location.origin).href,
                    redirectUrl: new URL(dest, location.origin).href,
                  };
                  check(await (signup ? signUp.sso(args) : signIn.sso(args)));
                })
              }
            >
              Continue with Google
            </button>
            <div className="auth-divider">or</div>
          </>
        )}
        {stage === 'factors' ? (
          <div className="auth-factor-list">
            {signIn.supportedSecondFactors
              .map((f) => f.strategy)
              .filter(supported)
              .map((value) => (
                <button
                  key={value}
                  disabled={busy}
                  onClick={() => void run(() => sendFactor(value))}
                >
                  {factorNames[value]}
                </button>
              ))}
          </div>
        ) : (
          <form onSubmit={submit} className="auth-fields" aria-busy={busy}>
            {(requestName ||
              (stage === 'names' && signUp.missingFields.includes('first_name'))) && (
              <label>
                First name
                <input
                  autoComplete="given-name"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  maxLength={128}
                  required={stage === 'names'}
                />
              </label>
            )}
            {(requestName || (stage === 'names' && signUp.missingFields.includes('last_name'))) && (
              <label>
                Last name
                <input
                  autoComplete="family-name"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  maxLength={128}
                  required={stage === 'names'}
                />
              </label>
            )}
            {(isIntro || stage === 'email' || stage === 'reset') && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={320}
                  required
                />
              </label>
            )}
            {(isIntro || stage === 'new-password') && (
              <label>
                {stage === 'new-password' ? 'New password' : 'Password'}
                <input
                  type="password"
                  autoComplete={
                    signup || stage === 'new-password' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            )}
            {isCode && (
              <>
                <p className="auth-note">
                  {stage === 'second-code'
                    ? codeHelp[factor]
                    : 'Check ' + (email || 'your email') + ' for the code.'}
                </p>
                <label>
                  {factor === 'backup_code' && stage === 'second-code'
                    ? 'Backup code'
                    : 'Verification code'}
                  <input
                    autoComplete="one-time-code"
                    inputMode={factor === 'backup_code' ? 'text' : 'numeric'}
                    maxLength={64}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </label>
              </>
            )}
            {isIntro && <div id="clerk-captcha" />}
            <button className="auth-primary" disabled={busy} type="submit">
              {command}
            </button>
          </form>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="auth-note" role="status">
            {notice}
          </p>
        )}
        {isIntro && !signup && (
          <div className="auth-options">
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => {
                setStage('email');
                setPassword('');
                setError('');
              }}
            >
              Use an email code
            </button>
            <a className="auth-link" href={resetPath(dest)}>
              Forgot password?
            </a>
          </div>
        )}
        {isCode &&
          (stage !== 'second-code' || factor === 'email_code' || factor === 'phone_code') && (
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => void run(resend)}
            >
              Resend code
            </button>
          )}
        {stage === 'second-code' && signIn.supportedSecondFactors.length > 1 && (
          <button className="auth-link" disabled={busy} onClick={() => setStage('factors')}>
            Try another method
          </button>
        )}
        {isIntro ? (
          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to StudyPal?'}{' '}
            <a href={signRoute(signup ? 'in' : 'up', dest)}>{signup ? 'Sign in' : 'Sign up'}</a>
          </p>
        ) : (
          <button
            type="button"
            className="auth-link"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (signup) await signUp.reset();
                else await signIn.reset();
                location.assign(signRoute(signup ? 'up' : 'in', dest));
              })
            }
          >
            Start over
          </button>
        )}
      </div>
    </AccountShell>
  );
}
