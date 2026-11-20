import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  statementTimeoutMs?: number;
  queryTimeoutMs?: number;
  onError?: (error: Error) => void;
}

export interface DatabaseClient {
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  ping(): Promise<void>;
  close(): Promise<void>;
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function validateConnectionString(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  const sslMode = parsed.searchParams.get('sslmode');
  if (parsed.searchParams.getAll('sslmode').length > 1) {
    throw new Error('DATABASE_URL must specify sslmode at most once');
  }
  if (sslMode !== null && sslMode !== 'disable' && sslMode !== 'verify-full') {
    throw new Error('Use sslmode=verify-full for verified TLS or disable for local development');
  }
  if (parsed.searchParams.has('ssl') || parsed.searchParams.has('uselibpqcompat')) {
    throw new Error('Configure database TLS using sslmode=verify-full');
  }
  const managedSettings = [
    'statement_timeout',
    'query_timeout',
    'connectionTimeoutMillis',
    'idle_in_transaction_session_timeout',
    'options',
  ];
  if (managedSettings.some((setting) => parsed.searchParams.has(setting))) {
    throw new Error('Configure database timeouts through DatabaseOptions, not URL parameters');
  }
}

/** Creates one lazy, bounded pool per process. Never call this per request. */
export function createDatabase(options: DatabaseOptions): DatabaseClient {
  validateConnectionString(options.connectionString);
  const configuration: PoolConfig = {
    connectionString: options.connectionString,
    max: positiveInteger(options.maxConnections ?? 10, 'maxConnections', 100),
    connectionTimeoutMillis: positiveInteger(
      options.connectionTimeoutMs ?? 2_000,
      'connectionTimeoutMs',
      60_000,
    ),
    idleTimeoutMillis: positiveInteger(options.idleTimeoutMs ?? 30_000, 'idleTimeoutMs', 3_600_000),
    statement_timeout: positiveInteger(
      options.statementTimeoutMs ?? 5_000,
      'statementTimeoutMs',
      3_600_000,
    ),
    query_timeout: positiveInteger(options.queryTimeoutMs ?? 6_000, 'queryTimeoutMs', 3_600_000),
    idle_in_transaction_session_timeout: 10_000,
    application_name: 'studypal',
  };
  const pool = new Pool(configuration);
  pool.on(
    'error',
    options.onError ??
      (() => {
        process.stderr.write(
          `${JSON.stringify({ level: 'error', message: 'An idle database connection failed' })}\n`,
        );
      }),
  );
  let closing: Promise<void> | undefined;

  return {
    db: drizzle(pool, { schema }),
    pool,
    async ping() {
      await pool.query('SELECT 1');
    },
    close() {
      closing ??= pool.end();
      return closing;
    },
  };
}
