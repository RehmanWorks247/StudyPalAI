import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const origins = ['127.0.0.1', 'localhost'].flatMap((host) =>
  [5173, 4173, 4184].map((port) => `http://${host}:${port}`),
);

async function configure() {
  const arg = process.argv[2];
  if (process.argv.length > 3 || (arg && arg !== '--copy'))
    throw new Error('Usage: node scripts/pair-workspace.mjs [--copy]');
  const contents = await readFile(envPath, 'utf8').catch(() => {
    throw new Error('Create a private .env from .env.example first.');
  });
  const env = parseEnv(contents);
  if (arg === '--copy') {
    if (!/^[A-Za-z0-9_-]{43}$/.test(env.WORKSPACE_PAIRING_KEY ?? ''))
      throw new Error('Run the setup command first.');
    if (process.platform !== 'darwin')
      throw new Error(
        'On this platform, copy WORKSPACE_PAIRING_KEY directly from the local .env file.',
      );
    const result = spawnSync('/usr/bin/pbcopy', [], {
      input: env.WORKSPACE_PAIRING_KEY,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    if (result.status !== 0) throw new Error('Could not copy the pairing key.');
    console.log('Local pairing key copied. Paste it into the StudyPal pairing dialog.');
    return;
  }
  const local = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  const dbHost =
    env.DATABASE_URL && URL.canParse(env.DATABASE_URL) && new URL(env.DATABASE_URL).hostname;
  const currentOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !dbHost ||
    !local.has(dbHost) ||
    !local.has(env.API_HOST || '127.0.0.1') ||
    Number(env.API_TRUST_PROXY_HOPS || 0) !== 0 ||
    currentOrigins.some((s) => !URL.canParse(s) || !local.has(new URL(s).hostname))
  ) {
    throw new Error(
      'Pairing requires a loopback database, API host and browser origins with no trusted proxies.',
    );
  }
  if (Boolean(env.WORKSPACE_PAIRING_KEY) !== Boolean(env.WORKSPACE_OWNER_ID))
    throw new Error('Restore both pairing fields from your backup before running setup.');
  if (
    env.WORKSPACE_PAIRING_KEY &&
    (!/^[A-Za-z0-9_-]{43}$/.test(env.WORKSPACE_PAIRING_KEY) ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(env.WORKSPACE_OWNER_ID))
  )
    throw new Error('Invalid existing pairing configuration. Restore it from your backup.');
  const allOrigins = [...new Set([...currentOrigins, ...origins])].join(',');
  const updatedOrigins = /^CORS_ORIGINS=.*$/m.test(contents)
    ? contents.replace(/^CORS_ORIGINS=.*$/m, 'CORS_ORIGINS=' + allOrigins)
    : contents + '\nCORS_ORIGINS=' + allOrigins + '\n';
  const next = env.WORKSPACE_PAIRING_KEY
    ? updatedOrigins
    : updatedOrigins.trimEnd() +
      '\nWORKSPACE_OWNER_ID=' +
      randomUUID() +
      '\nWORKSPACE_PAIRING_KEY=' +
      randomBytes(32).toString('base64url') +
      '\n';
  const temp = envPath + '.' + randomUUID() + '.tmp';
  const lock = await open(envPath + '.pair-lock', 'wx', 0o600).catch(() => {
    throw new Error('Another pairing setup is running.');
  });
  try {
    if ((await readFile(envPath, 'utf8')) !== contents)
      throw new Error('Local configuration changed. Run setup again.');
    if (next !== contents) {
      await writeFile(temp, next, { mode: 0o600, flag: 'wx' });
      await rename(temp, envPath);
    } else await chmod(envPath, 0o600);
  } finally {
    await unlink(temp).catch(() => {});
    await lock.close();
    await unlink(envPath + '.pair-lock');
  }
  console.log(
    'Local pairing configured. Restart the API to load it. On macOS use --copy to copy the pairing key.',
  );
}
await configure().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Pairing setup failed.');
  process.exitCode = 1;
});
