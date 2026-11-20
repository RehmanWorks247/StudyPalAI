export function returnPath(candidate: string | null, origin: string) {
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  )
    return '/';
  try {
    const url = new URL(candidate, origin);
    if (url.origin === origin && ['/', '/local', '/local/'].includes(url.pathname))
      return url.pathname + url.search + url.hash;
  } catch {
    /* Use the dashboard for invalid return URLs. */
  }
  return '/';
}
export function authPage(path: string) {
  return /^\/sign-(in|up)(?:\/|$)/.exec(path)?.[1] ?? null;
}
export function signRoute(action: 'in' | 'up', target: string) {
  return '/sign-' + action + (target === '/' ? '' : '?returnTo=' + encodeURIComponent(target));
}
