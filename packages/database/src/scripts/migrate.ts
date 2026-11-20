import { resolve } from 'node:path';

import { createDatabase } from '../client';
import { runMigrations } from '../migrate';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is required for migrations');

  const database = createDatabase({
    connectionString,
    maxConnections: 1,
    statementTimeoutMs: 120_000,
    queryTimeoutMs: 125_000,
  });
  try {
    await runMigrations(database, resolve(__dirname, '../../migrations'));
    process.stdout.write('Database migrations applied successfully.\n');
  } finally {
    await database.close();
  }
}

void main().catch(() => {
  // Connection errors may contain credentials or host details; keep CLI output safe.
  process.stderr.write(
    'Database migration failed. Check connection settings, migration SQL, and database logs.\n',
  );
  process.exitCode = 1;
});
