// This test creates synthetic accounts on an actual Clerk development instance.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { chromium, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
const issuer = process.env.CLERK_ISSUER;
const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';
assert.ok(
  issuer?.startsWith('https://') &&
    key.startsWith('pk_test_') &&
    Buffer.from(key.slice(8), 'base64url').toString() === new URL(issuer).host + '$',
  'Requires a matching Clerk development instance.',
);
assert.ok(
  process.env.CLERK_TESTING_TOKEN,
  'Supply a short-lived development CLERK_TESTING_TOKEN to the test process.',
);
const environment = await (
  await fetch(issuer + '/v1/environment', { signal: AbortSignal.timeout(10000) })
).json();
assert.equal(
  environment.auth_config.test_mode,
  true,
  'Use a development instance with test addresses enabled.',
);
const ready = await fetch(origin + '/api/v1/health/ready');
assert.equal(ready.headers.get('x-studypal-auth-mode'), 'clerk');

const password = () => randomBytes(23).toString('base64url') + 'a7!';
const accounts = Array.from({ length: 2 }, () => ({
  email: 'studypal-' + randomUUID() + '+clerk_test@example.com',
  password: password(),
}));
const marker = 'Mechanics ' + randomUUID();
const browser = await chromium.launch({ channel: 'chrome' });
async function openBrowser() {
  const context = await browser.newContext();
  await setupClerkTestingToken({ context, options: { frontendApiUrl: new URL(issuer).hostname } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return page;
}
async function signUp(page, account) {
  await page.goto(origin + '/sign-up');
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('424242');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your first study set' })).toBeVisible({
    timeout: 25000,
  });
}
async function signOut(page) {
  const menu = page.getByRole('button', { name: /account menu/i });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible({ timeout: 20000 });
  assert.equal((await page.context().request.get(origin + '/api/v1/workspace')).status(), 401);
}
async function readSet(page) {
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20000 });
}
try {
  const page = await openBrowser();
  await page.goto(origin + '/local');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(/secured by|powered by/i)).toHaveCount(0);
  assert.equal((await page.context().request.get(origin + '/api/v1/workspace')).status(), 401);
  await signUp(page, accounts[0]);
  await page.getByLabel('Study set name').fill(marker);
  await page.getByRole('button', { name: 'Create study set' }).click();
  await readSet(page);
  const saved = page.waitForResponse(
    (r) => r.url() === origin + '/api/v1/workspace' && r.request().method() === 'PUT' && r.ok(),
  );
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  await dialog.getByLabel('Choose materials').setInputFiles({
    name: 'Lab observations.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Calibration is checked against a reference measurement before each experiment.',
    ),
  });
  await dialog.getByText('Lab observations.txt', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
  await saved;
  await expect(page.getByRole('button', { name: 'PostgreSQL synced' })).toBeVisible({
    timeout: 15000,
  });
  await signOut(page);
  await signUp(page, accounts[1]);
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  await signOut(page);
  await page.context().close();
  const fresh = await openBrowser();
  await fresh.goto(origin + '/sign-in');
  await fresh.getByLabel('Email address', { exact: true }).fill(accounts[0].email);
  await fresh.getByLabel('Password', { exact: true }).fill(accounts[0].password);
  await fresh.getByRole('button', { name: 'Sign in', exact: true }).click();
  await finishVerificationIfNeeded(fresh);
  await readSet(fresh);
  await fresh.reload();
  await readSet(fresh);
  await fresh.locator('button[title="Lab observations.txt"]').click();
  await expect(fresh.getByLabel('Document text', { exact: true })).toContainText(
    'reference measurement',
  );
  await signOut(fresh);
  await fresh.getByRole('link', { name: /forgot password/i }).click();
  await fresh.getByLabel('Email address', { exact: true }).fill(accounts[0].email);
  await fresh.getByRole('button', { name: 'Send reset code' }).click();
  await fresh.getByLabel('Verification code', { exact: true }).fill('424242');
  await fresh.getByRole('button', { name: 'Verify code', exact: true }).click();
  const newPassword = password();
  await fresh.getByLabel('New password', { exact: true }).fill(newPassword);
  await fresh.getByRole('button', { name: 'Reset password', exact: true }).click();
  await readSet(fresh);
  await signOut(fresh);
  await fresh.getByLabel('Email address', { exact: true }).fill(accounts[0].email);
  await fresh.getByRole('button', { name: 'Use an email code', exact: true }).click();
  await fresh.getByLabel('Email address', { exact: true }).fill(accounts[0].email);
  await fresh.getByRole('button', { name: 'Send code', exact: true }).click();
  await finishVerificationIfNeeded(fresh);
  await readSet(fresh);
  await signOut(fresh);
  console.log(
    'Live custom registration, email verification, password and email-code sign-in, password reset, sign-out, two-account isolation, document upload and PostgreSQL restore passed.',
  );
} finally {
  await browser.close();
}

async function finishVerificationIfNeeded(page) {
  const field = page.getByLabel('Verification code', { exact: true });
  await Promise.race([
    field.waitFor(),
    page.getByRole('button', { name: /account menu/i }).waitFor(),
  ]);
  if (await field.isVisible()) {
    await field.fill('424242');
    await page.getByRole('button', { name: /^(Verify|Sign in|Verify code)$/i }).click();
  }
}
