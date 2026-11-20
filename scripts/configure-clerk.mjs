import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const file = fileURLToPath(new URL('../.env', import.meta.url));
const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const key = Buffer.concat(input).toString('utf8').trim();
if (!/^pk_(test|live)_[A-Za-z0-9_=-]{8,512}$/.test(key))
  throw new Error('Copy the Clerk publishable key and pass it on standard input.');
const domain = Buffer.from(key.split('_').slice(2).join('_'), 'base64url').toString('utf8');
if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\$$/i.test(domain))
  throw new Error('The Clerk publishable key contains an invalid instance host.');
const issuer = 'https://' + domain.slice(0, -1);
const original = await readFile(file, 'utf8');
const current = parseEnv(original);
if (current.CLERK_ISSUER && current.CLERK_ISSUER !== issuer)
  throw new Error(
    'This installation already has another Clerk issuer. Review the account mapping before switching instances.',
  );
const response = await fetch(issuer + '/v1/environment', {
  signal: AbortSignal.timeout(8000),
  redirect: 'error',
});
if (!response.ok)
  throw new Error('Could not verify the public authentication settings for this instance.');
const { user_settings: settings } = await response.json();
if (typeof settings?.attributes?.email_address?.enabled !== 'boolean')
  throw new Error('Invalid Clerk instance settings.');
const fields = {
  WORKSPACE_AUTH_MODE: 'clerk',
  VITE_WORKSPACE_AUTH_MODE: 'clerk',
  VITE_CLERK_PUBLISHABLE_KEY: key,
  CLERK_ISSUER: issuer,
  VITE_CLERK_GOOGLE_ENABLED: String(settings.social?.oauth_google?.enabled === true),
  VITE_CLERK_NAME_FIELDS: String(
    settings.attributes.first_name?.required === true ||
      settings.attributes.last_name?.required === true,
  ),
  CORS_ORIGINS: [
    ...new Set([
      ...(current.CORS_ORIGINS || '').split(',').filter(Boolean),
      ...['localhost', '127.0.0.1'].flatMap((host) =>
        [4173, 5173].map((port) => 'http://' + host + ':' + port),
      ),
    ]),
  ].join(','),
};
let contents = original;
for (const [name, value] of Object.entries(fields)) {
  const line = new RegExp('^' + name + '=.*$', 'm');
  const setting = name + '=' + value;
  contents = line.test(contents)
    ? contents.replace(line, () => setting)
    : contents.trimEnd() + '\n' + setting + '\n';
}
const temporary = file + '.' + randomUUID() + '.tmp';
try {
  await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
  if ((await readFile(file, 'utf8')) !== original)
    throw new Error('Configuration changed during setup. Retry with the same key.');
  await rename(temporary, file);
} finally {
  await rm(temporary, { force: true });
}
console.log(
  'Configured the web and API for the same Clerk instance. Restart both after rebuilding.',
);
