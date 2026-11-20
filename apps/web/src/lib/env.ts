/** Only public configuration belongs in the browser; VITE_* values are bundled. */
export function resolveApiBaseUrl(value: string | undefined, origin: string): string {
  const url = new URL(value || origin);

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'VITE_API_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment.',
    );
  }

  return url.origin;
}

export type AuthConfig =
  { mode: 'local' } | { mode: 'clerk'; publishableKey: string } | { mode: 'unavailable' };
export function authConfig(
  env: Pick<ImportMetaEnv, 'VITE_WORKSPACE_AUTH_MODE' | 'VITE_CLERK_PUBLISHABLE_KEY'>,
): AuthConfig {
  if (env.VITE_WORKSPACE_AUTH_MODE === 'local') return { mode: 'local' };
  if (env.VITE_WORKSPACE_AUTH_MODE && env.VITE_WORKSPACE_AUTH_MODE !== 'clerk')
    return { mode: 'unavailable' };
  const key = env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  return key && /^pk_(test|live)_[A-Za-z0-9_-]+=*$/.test(key)
    ? { mode: 'clerk', publishableKey: key }
    : { mode: 'unavailable' };
}
export function configuredAuth() {
  return authConfig(import.meta.env);
}
export function accountMethods() {
  return {
    google: import.meta.env.VITE_CLERK_GOOGLE_ENABLED === 'true',
    names: import.meta.env.VITE_CLERK_NAME_FIELDS === 'true',
  };
}
