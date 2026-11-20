import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

// Only files produced by this build are cacheable. Never cache API replies, documents or model requests.
export function offlineShell(): Plugin {
  let publicRoot: string;
  return {
    name: 'studypal-offline-shell',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicRoot = config.publicDir;
    },
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter((name) => !name.endsWith('.map'));
      const digest = createHash('sha256');
      for (const file of readdirSync(publicRoot, { recursive: true, withFileTypes: true })) {
        if (!file.isFile()) continue;
        const path = resolve(file.parentPath, file.name);
        const name = relative(publicRoot, path).split(sep).join('/');
        if (name.startsWith('speech-models/')) continue;
        assets.push(name);
        digest.update(readFileSync(path));
      }
      const urls = [...new Set(['index.html', ...assets])].sort().map((name) => '/' + name);
      digest.update(JSON.stringify(urls));
      const html = bundle['index.html'];
      if (html?.type === 'asset') digest.update(html.source);
      const version = 'studypal-shell-' + digest.digest('hex').slice(0, 20);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const version = ${JSON.stringify(version)};
const files = new Set(${JSON.stringify(urls)});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll([...files].map(url => new Request(url,{cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('studypal-shell-') && key !== version) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  const shellRoute = ['/', '/local','/local/'].includes(url.pathname) || /^\\/(?:sign-in|sign-up)(?:\\/[a-z0-9-]+)*\\/?$/i.test(url.pathname);
  if (request.mode === 'navigate' && shellRoute) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(version)).match('/index.html')));
    return;
  }
  const path = url.pathname;
  if (!files.has(path)) return;
  event.respondWith(caches.open(version).then(async cache => await cache.match(path) ?? fetch(request)));
});`,
      });
    },
  };
}
