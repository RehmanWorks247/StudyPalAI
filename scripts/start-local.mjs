import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, copyFile, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createLocalWebServer } from './local-web-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = join(root, '.env');
const dist = join(root, 'apps/web/dist');
const ui = 'http://127.0.0.1:4173';
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const children = new Set();
const stopping = new AbortController();
const stop = (message) => {
  if (!stopping.signal.aborted) stopping.abort(new Error(message));
};
process.once('SIGINT', () => stop('Shutting down StudyPal.'));
process.once('SIGTERM', () => stop('Shutting down StudyPal.'));
let env = { ...process.env };
let server;

const signalChild = (child, signal) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    /* Already exited. */
  }
};
stopping.signal.addEventListener('abort', () => {
  for (const child of children) signalChild(child, 'SIGTERM');
});

function launch(command, args, { quiet = false } = {}) {
  stopping.signal.throwIfAborted();
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: quiet ? 'ignore' : 'inherit',
    detached: process.platform !== 'win32',
  });
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  }).finally(() => children.delete(child));
  children.add(child);
  return exit;
}
async function run(command, args, options) {
  const { code } = await launch(command, args, options);
  if (code !== 0) throw new Error('Startup step failed: ' + command + ' ' + args.join(' '));
}
function background(command, args, { allowSuccess = false } = {}) {
  launch(command, args).then(
    ({ code }) => {
      if (!allowSuccess || code !== 0) stop('A required local service exited: ' + args.at(-1));
    },
    () => stop('Could not start ' + command),
  );
}
function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
async function jsonResponse(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (!res.ok) return false;
    return await res.json();
  } catch {
    return false;
  }
}
async function apiHealthy(api) {
  try {
    const ready = await fetch(api + '/api/v1/health/ready', {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (
      !ready.ok ||
      ready.headers.get('x-studypal-auth-mode') !== (env.WORKSPACE_AUTH_MODE || 'clerk') ||
      (await ready.json()).status !== 'ok'
    )
      return false;
    const session = await fetch(api + '/api/v1/workspace/session', {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    return (
      session.status === 401 &&
      session.headers.get('content-type')?.includes('application/problem+json')
    );
  } catch {
    return false;
  }
}
async function existingWebMatches() {
  try {
    const response = await fetch(ui + '/', {
      signal: AbortSignal.timeout(2500),
      redirect: 'error',
    });
    return (
      response.ok &&
      (await response.text()) === (await readFile(join(dist, 'index.html'), 'utf8')) &&
      (await apiHealthy(ui))
    );
  } catch {
    return false;
  }
}
async function waitFor(check, timeout, message, interval = 500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    stopping.signal.throwIfAborted();
    if (await check()) return;
    await delay(interval, undefined, { signal: stopping.signal });
  }
  throw new Error(message);
}
async function main() {
  try {
    await copyFile(join(root, '.env.example'), envFile, constants.COPYFILE_EXCL);
    await chmod(envFile, 0o600);
  } catch (e) {
    if (e.code !== 'EEXIST')
      throw new Error('Could not create private local configuration.', { cause: e });
  }
  const readConfiguration = async () => ({
    ...process.env,
    ...parseEnv(await readFile(envFile, 'utf8')),
  });
  env = await readConfiguration();
  const mode = env.WORKSPACE_AUTH_MODE || 'clerk';
  if (!['clerk', 'local'].includes(mode) || mode !== (env.VITE_WORKSPACE_AUTH_MODE || 'clerk'))
    throw new Error('Set the same workspace authentication mode for the API and web.');
  if (mode === 'local') {
    await run(process.execPath, ['scripts/pair-workspace.mjs']);
    env = await readConfiguration();
  } else if (
    !env.CLERK_ISSUER ||
    !env.VITE_CLERK_PUBLISHABLE_KEY ||
    Buffer.from(
      env.VITE_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'),
      'base64url',
    ).toString() !==
      new URL(env.CLERK_ISSUER).hostname + '$'
  ) {
    throw new Error(
      'Configure the instance with its publishable key using scripts/configure-clerk.mjs first.',
    );
  }
  const db = new URL(env.DATABASE_URL);
  const apiHost = env.API_HOST || '127.0.0.1';
  const apiPort = Number(env.API_PORT || '3001');
  const api = 'http://' + (apiHost === '::1' ? '[::1]' : apiHost) + ':' + apiPort;
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'];
  if (
    !loopback.includes(db.hostname) ||
    ['host', 'hostaddr', 'service', 'port'].some((k) => db.searchParams.has(k)) ||
    !loopback.includes(apiHost) ||
    !Number.isInteger(apiPort) ||
    apiPort < 1 ||
    apiPort > 65535 ||
    apiPort === 4173 ||
    !env.CORS_ORIGINS?.split(',').includes(ui)
  )
    throw new Error('Invalid local API, database or web configuration.');
  if ((await portOpen(4173)) && !(await existingWebMatches()))
    throw new Error(
      'Port 4173 is in use by another or outdated server. Stop that server and retry.',
    );
  const existingApi = await portOpen(apiPort, apiHost);
  await run(process.execPath, ['scripts/prepare-speech-model.mjs']);
  await run('pnpm', ['build']);
  if (!(await portOpen(Number(db.port || 5432), db.hostname.replace(/^\[|\]$/g, '')))) {
    if (db.port && db.port !== '5432')
      throw new Error('Start PostgreSQL on your configured port, then rerun local:start.');
    await run('pnpm', ['db:up']);
  }
  const { createDatabase } = requireApi('@studypal/database');
  const client = createDatabase({ connectionString: env.DATABASE_URL, maxConnections: 1 });
  try {
    await client.ping();
  } catch {
    throw new Error(
      'The configured local PostgreSQL database did not accept this installation’s credentials.',
    );
  } finally {
    await client.close();
  }
  await run(process.execPath, ['packages/database/dist/scripts/migrate.js']);
  if (existingApi || (await portOpen(apiPort, apiHost))) {
    // A running development watcher briefly releases its port when the build writes its output.
    await waitFor(
      () => apiHealthy(api),
      20_000,
      'The running API could not serve the local workspace. Restart it with the local configuration.',
    );
  } else {
    background(process.execPath, ['apps/api/dist/main.js']);
    await waitFor(() => apiHealthy(api), 20_000, 'The StudyPal API did not become ready.');
  }
  if (
    (await portOpen(11434)) &&
    !(await jsonResponse('http://127.0.0.1:11434/api/version'))?.version
  )
    throw new Error('Port 11434 is occupied by a different service.');
  background('sh', ['scripts/local-ai.sh'], { allowSuccess: true });
  await waitFor(
    async () =>
      (await launch('sh', ['scripts/local-ai.sh', '--check'], { quiet: true })).code === 0,
    3_700_000,
    'Local study model setup timed out.',
    1500,
  );
  if (env.OPENAI_API_KEY) background(process.execPath, ['apps/api/dist/frontier-worker.js']);
  if (await portOpen(4173)) {
    if (!(await existingWebMatches()))
      throw new Error('Another server owns port 4173. Stop it before running local:start.');
  } else {
    server = await createLocalWebServer({
      directory: dist,
      api,
      clerkIssuer: mode === 'clerk' ? env.CLERK_ISSUER : undefined,
    });
    server.listen(4173, '127.0.0.1');
    await once(server, 'listening');
  }
  if (!(await existingWebMatches()))
    throw new Error('Production frontend or its local API proxy did not become ready.');
  console.log(
    'StudyPal is ready at ' +
      ui +
      '. Keep this terminal open. Ctrl+C stops services started here; PostgreSQL data stays on disk.',
  );
  // Stay foreground even when all services were already running.
  while (!stopping.signal.aborted) {
    await delay(30_000, undefined, { signal: stopping.signal });
    await waitFor(
      async () =>
        (await apiHealthy(ui)) &&
        (await launch('sh', ['scripts/local-ai.sh', '--check'], { quiet: true })).code === 0,
      15_000,
      'The UI, API, database or model stopped responding. Check the local services and rerun local:start.',
      3_000,
    );
  }
}
try {
  await main();
} catch (error) {
  if (stopping.signal.aborted) {
    const reason = stopping.signal.reason.message;
    console.log(reason);
    process.exitCode = reason === 'Shutting down StudyPal.' ? 0 : 1;
  } else {
    console.error(error instanceof Error ? error.message : 'Local startup failed.');
    process.exitCode = 1;
  }
} finally {
  if (server) {
    server.closeAllConnections();
    server.close();
  }
  const owned = [...children];
  for (const child of owned) signalChild(child, 'SIGTERM');
  if (owned.length) {
    await Promise.race([
      Promise.all(
        owned
          .filter((c) => c.exitCode === null && c.signalCode === null)
          .map((c) => once(c, 'exit').catch(() => {})),
      ),
      delay(3_000),
    ]);
    for (const child of owned) signalChild(child, 'SIGKILL');
  }
}
