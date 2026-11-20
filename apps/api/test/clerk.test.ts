import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config/env';
import { ClerkVerifier } from '../src/modules/workspace/clerk-verifier';
import { signingFixture, testIssuer, testOrigin } from './clerk-fixture';

const environment = {
  DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
  CORS_ORIGINS: testOrigin,
  CLERK_ISSUER: testIssuer,
};
test('Clerk mode is default even if legacy credentials remain; issuer and PEM configuration never expose keys', () => {
  const config = loadConfig({
    ...environment,
    WORKSPACE_PAIRING_KEY: 'x'.repeat(43),
    WORKSPACE_OWNER_ID: randomUUID(),
  });
  assert.equal(config.WORKSPACE_AUTH_MODE, 'clerk');
  assert.throws(
    () => loadConfig({ ...environment, CLERK_ISSUER: 'http://insecure.example' }),
    /CLERK_ISSUER/,
  );
  assert.throws(
    () => loadConfig({ ...environment, CLERK_JWT_KEY: 'secret-invalid-pem' }),
    (e) =>
      e instanceof Error &&
      e.message.includes('CLERK_JWT_KEY') &&
      !e.message.includes('secret-invalid'),
  );
});
test('official Clerk verifier enforces signature, exact issuer, allowed Origin, active browser session and bounded JWT validity', async () => {
  const keys = signingFixture();
  const verifier = new ClerkVerifier(loadConfig({ ...environment, CLERK_JWT_KEY: keys.publicPem }));
  assert.deepEqual(await verifier.verify(keys.token(), testOrigin), {
    issuer: testIssuer,
    subject: 'user_sample',
    sid: 'sess_sample',
  });
  for (const claims of [
    { iss: 'https://another.clerk.accounts.dev' },
    { azp: 'http://other.example' },
    { azp: null },
    { sid: null },
    { sub: 'org_wrong' },
    { sts: 'pending' },
    { exp: 0 },
    { exp: Math.floor(Date.now() / 1000) + 900 },
    { nbf: Math.floor(Date.now() / 1000) + 500 },
  ]) {
    await assert.rejects(verifier.verify(keys.token(claims), testOrigin), { status: 401 });
  }
  await assert.rejects(verifier.verify(keys.token(), 'http://other.example'), { status: 401 });
  await assert.rejects(verifier.verify(signingFixture().token(), testOrigin), { status: 401 });
  await assert.rejects(verifier.verify(keys.token({}, { alg: 'none' }), testOrigin), {
    status: 401,
  });
  await assert.rejects(verifier.verify(undefined, testOrigin), { status: 401 });
  const unconfigured = new ClerkVerifier(loadConfig({ DATABASE_URL: environment.DATABASE_URL }));
  await assert.rejects(unconfigured.verify(keys.token(), testOrigin), { status: 503 });
});
test('public JWKS uses only configured issuer, coalesces requests, rotates keys and rejects unavailable key sets', async (t) => {
  const a = signingFixture('first'),
    b = signingFixture('second');
  let response = [a.jwk];
  let calls = 0;
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, testIssuer + '/.well-known/jwks.json');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    calls++;
    return Response.json({ keys: response });
  });
  const verifier = new ClerkVerifier(loadConfig(environment));
  await Promise.all([verifier.verify(a.token()), verifier.verify(a.token())]);
  assert.equal(calls, 1);
  await assert.rejects(verifier.verify(b.token()), { status: 401 });
  assert.equal(calls, 1);
  t.mock.timers.tick(10_100);
  response = [a.jwk, b.jwk];
  await verifier.verify(b.token());
  assert.equal(calls, 2);
  t.mock.timers.tick(310_000);
  response = [];
  await assert.rejects(verifier.verify(a.token()), { status: 503 });
});
