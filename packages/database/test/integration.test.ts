import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { createDatabase } from '../src/client';
import { runMigrations } from '../src/migrate';

test('PostgreSQL migrations are repeatable and queries enforce statement timeouts', async () => {
  const connectionString = process.env['DATABASE_URL'];
  assert.ok(connectionString, 'Set DATABASE_URL to a disposable development/test database');
  const database = createDatabase({ connectionString });
  try {
    const migrationsFolder = resolve(__dirname, '../../migrations');
    await runMigrations(database, migrationsFolder);
    const before = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM drizzle.__drizzle_migrations',
    );
    await runMigrations(database, migrationsFolder);
    const after = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM drizzle.__drizzle_migrations',
    );
    assert.equal(after.rows[0]?.count, before.rows[0]?.count);
    assert.ok(Number(after.rows[0]?.count) >= 1);
    await database.ping();
    const result = await database.pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists',
      ['studypal'],
    );
    assert.equal(result.rows[0]?.exists, true);
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '100ms'");
      await assert.rejects(client.query('SELECT pg_sleep(1)'), { code: '57014' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await database.ping();
  } finally {
    await database.close();
  }
});
