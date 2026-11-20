import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config/env';

const valid = { DATABASE_URL: 'postgresql://studypal:local@localhost:5432/studypal' };

test('configuration validates exact origins and does not coerce false to true', () => {
  const config = loadConfig({
    ...valid,
    ENABLE_API_DOCS: 'false',
    CORS_ORIGINS: 'http://localhost:5173,https://studypal.example',
  });
  assert.equal(config.ENABLE_API_DOCS, false);
  assert.deepEqual(config.CORS_ORIGINS, ['http://localhost:5173', 'https://studypal.example']);
  assert.equal(config.API_TRUST_PROXY_HOPS, 0);
});

test('configuration rejects wildcard origins, invalid ports, and missing database URL', () => {
  assert.throws(() => loadConfig({ ...valid, CORS_ORIGINS: '*' }), /CORS_ORIGINS/);
  assert.throws(() => loadConfig({ ...valid, API_PORT: '0' }), /API_PORT/);
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
});

test('production requires verified database TLS and disables API documentation', () => {
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: 'production' }), /DATABASE_URL/);
  const production = {
    DATABASE_URL: `${valid.DATABASE_URL}?sslmode=verify-full`,
    NODE_ENV: 'production',
    CLERK_ISSUER: 'https://auth.example.com',
    CORS_ORIGINS: 'https://study.example.com',
  };
  assert.equal(loadConfig(production).NODE_ENV, 'production');
  assert.throws(
    () => loadConfig({ ...production, WORKSPACE_AUTH_MODE: 'local' }),
    /WORKSPACE_AUTH_MODE/,
  );
  assert.throws(() => loadConfig({ ...production, CLERK_ISSUER: undefined }), /CLERK_ISSUER/);
  for (const origins of [
    undefined,
    'http://localhost:5173',
    'http://study.example.com',
    'https://*.example.com',
    'https://study.example.com/',
    'https://study.example.com/path',
    'https://study.example.com,http://other.example.com',
  ]) {
    assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: origins }), /CORS_ORIGINS/);
  }
  assert.equal(loadConfig({ ...valid, WORKSPACE_AUTH_MODE: 'local' }).WORKSPACE_AUTH_MODE, 'local');
  assert.equal(loadConfig(valid).WORKSPACE_AUTH_MODE, 'clerk');
  assert.throws(() => loadConfig({ ...production, ENABLE_API_DOCS: 'true' }), /ENABLE_API_DOCS/);
});

test('invalid configuration errors contain field names, never values or credentials', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'secret-value', API_PORT: 'secret-port' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('DATABASE_URL'));
      assert.ok(!error.message.includes('secret'));
      return true;
    },
  );
});
