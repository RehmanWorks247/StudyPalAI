// Run the browser suite against the local database with a fresh owner for this test process.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const database = process.env.DATABASE_URL;
if (
  !database ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(database).hostname) ||
  ['host', 'hostaddr', 'service', 'port'].some((k) => new URL(database).searchParams.has(k))
)
  throw new Error('A local DATABASE_URL is required.');
const env = {
  ...process.env,
  API_HOST: '127.0.0.1',
  API_PORT: '3086',
  API_TRUST_PROXY_HOPS: '0',
  CORS_ORIGINS: 'http://127.0.0.1:4184',
  WORKSPACE_AUTH_MODE: 'local',
  VITE_WORKSPACE_AUTH_MODE: 'local',
  WORKSPACE_OWNER_ID: randomUUID(),
  WORKSPACE_PAIRING_KEY: randomBytes(32).toString('base64url'),
};
delete env.OPENAI_API_KEY;
env.VITE_CLERK_PUBLISHABLE_KEY = '';
delete env.CLERK_ISSUER;
delete env.CLERK_JWT_KEY;
const release = await mkdtemp(join(tmpdir(), 'studypal-e2e-release-'));
env.STUDYPAL_WEB_DIST = release;
const build = spawn(
  'pnpm',
  ['--filter', '@studypal/web', 'exec', 'vite', 'build', '--outDir', release, '--emptyOutDir'],
  { env, stdio: 'inherit' },
);
const result = await new Promise((resolve, reject) => {
  build.once('exit', resolve);
  build.once('error', reject);
});
if (result !== 0) {
  await rm(release, { recursive: true, force: true });
  throw new Error('Browser test build failed.');
}
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: 'ignore' });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (api.exitCode !== null) throw new Error('The test API could not start on port 3086.');
    try {
      ready = (
        await fetch('http://127.0.0.1:3086/api/v1/health/ready', {
          signal: AbortSignal.timeout(500),
        })
      ).ok;
    } catch {
      /* Wait for startup. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('The isolated test API did not become ready.');
  const run = spawn('pnpm', ['--filter', '@studypal/web', 'test:e2e', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...env, STUDYPAL_E2E_PAIR_KEY: env.WORKSPACE_PAIRING_KEY },
  });
  const code = await new Promise((resolve, reject) => {
    run.once('error', reject);
    run.once('exit', resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  api.kill('SIGTERM');
  await rm(release, { recursive: true, force: true });
  // Delete only records belonging to the fresh test installation generated above.
  const { createDatabase } = requireApi('@studypal/database');
  const { workspaces, recordings } = requireApi('@studypal/database/schema');
  const { eq } = requireApi('drizzle-orm');
  const client = createDatabase({ connectionString: database, maxConnections: 1 });
  try {
    await client.db.transaction(async (tx) => {
      await tx.delete(recordings).where(eq(recordings.ownerId, env.WORKSPACE_OWNER_ID));
      await tx.delete(workspaces).where(eq(workspaces.ownerId, env.WORKSPACE_OWNER_ID));
    });
  } finally {
    await client.close();
  }
}
