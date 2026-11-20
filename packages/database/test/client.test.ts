import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDatabase } from '../src/client';

const localUrl = 'postgresql://studypal:local-only@127.0.0.1:5432/studypal';

test('pool creation is lazy and closing is idempotent', async () => {
  const database = createDatabase({ connectionString: localUrl });
  assert.equal(database.pool.totalCount, 0);
  assert.equal(database.pool.idleCount, 0);
  const firstClose = database.close();
  assert.equal(database.close(), firstClose);
  await firstClose;
});

test('idle connection errors reach the caller without an unhandled error event', async () => {
  const errors: Error[] = [];
  const database = createDatabase({
    connectionString: localUrl,
    onError: (error) => errors.push(error),
  });
  const error = new Error('idle connection lost');
  database.pool.emit('error', error);
  assert.deepEqual(errors, [error]);
  await database.close();
});

test('invalid URLs fail without leaking the supplied value', () => {
  assert.throws(() => createDatabase({ connectionString: 'sensitive-password' }), {
    message: 'DATABASE_URL must be a valid PostgreSQL URL',
  });
  assert.throws(
    () => createDatabase({ connectionString: 'https://example.com' }),
    /PostgreSQL URL/,
  );
});

test('pool bounds and query timeouts cannot be disabled accidentally', () => {
  for (const invalid of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
    assert.throws(
      () => createDatabase({ connectionString: localUrl, maxConnections: invalid }),
      /maxConnections/,
    );
  }
  assert.throws(
    () => createDatabase({ connectionString: localUrl, queryTimeoutMs: 0 }),
    /queryTimeoutMs/,
  );
  assert.throws(
    () => createDatabase({ connectionString: localUrl, statementTimeoutMs: 0 }),
    /statementTimeoutMs/,
  );
  assert.throws(
    () => createDatabase({ connectionString: `${localUrl}?statement_timeout=0` }),
    /DatabaseOptions/,
  );
  assert.throws(
    () => createDatabase({ connectionString: `${localUrl}?options=-c%20statement_timeout%3D0` }),
    /DatabaseOptions/,
  );
});

test('TLS configuration requires certificate verification', async () => {
  for (const mode of ['require', 'prefer', 'allow', 'verify-ca', 'no-verify']) {
    assert.throws(
      () => createDatabase({ connectionString: `${localUrl}?sslmode=${mode}` }),
      /verify-full/,
    );
  }
  assert.throws(() => createDatabase({ connectionString: `${localUrl}?ssl=false` }), /verify-full/);
  assert.throws(
    () => createDatabase({ connectionString: `${localUrl}?sslmode=verify-full&sslmode=disable` }),
    /at most once/,
  );
  const database = createDatabase({ connectionString: `${localUrl}?sslmode=verify-full` });
  await database.close();
});
