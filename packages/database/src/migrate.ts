import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { DatabaseClient } from './client';

// Session-level lock: all migration statements and the lock use the same client.
const MIGRATION_LOCK_ID = 1_984_247_031;

export async function runMigrations(
  database: DatabaseClient,
  migrationsFolder: string,
): Promise<void> {
  const client = await database.pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [MIGRATION_LOCK_ID],
    );
    locked = result.rows[0]?.acquired === true;
    if (!locked) {
      throw new Error('Another migration runner holds the database lock; retry after it finishes');
    }
    // Fail a blocked DDL deployment quickly instead of holding up application writes.
    await client.query("SET lock_timeout = '5s'");
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      // Destroy the session so a failed unlock cannot return a locked connection to the pool.
      client.release(true);
    }
  }
}
