import { constants, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { cp, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
};
const toApi = [
  'accept',
  'authorization',
  'cookie',
  'origin',
  'content-type',
  'content-length',
  'x-studypal-csrf',
];
const fromApi = [
  'content-type',
  'content-length',
  'cache-control',
  'x-request-id',
  'x-studypal-auth-mode',
  'set-cookie',
  'retry-after',
];
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
function finish(response, status) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { 'cache-control': 'no-store' });
  response.end();
}

function proxy(request, response, api) {
  const headers = {};
  for (const header of toApi)
    if (request.headers[header] !== undefined) headers[header] = request.headers[header];
  const upstream = httpRequest(
    new URL(request.url, api),
    { method: request.method, headers, signal: AbortSignal.timeout(20_000) },
    (incoming) => {
      const outgoing = {};
      for (const header of fromApi)
        if (incoming.headers[header] !== undefined) outgoing[header] = incoming.headers[header];
      response.writeHead(incoming.statusCode ?? 502, outgoing);
      void pipeline(incoming, response).catch(() => response.destroy());
    },
  );
  upstream.on('error', () => finish(response, 502));
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => {
    if (!response.writableEnded) upstream.destroy();
  });
  request.pipe(upstream);
}

export async function createLocalWebServer({ directory, api, clerkIssuer }) {
  const source = await realpath(directory);
  const backend = new URL(api);
  if (
    backend.protocol !== 'http:' ||
    !loopback.has(backend.hostname) ||
    backend.username ||
    backend.password
  )
    throw new Error('The API upstream must be a local HTTP origin.');
  if (
    clerkIssuer &&
    (new URL(clerkIssuer).origin !== clerkIssuer || new URL(clerkIssuer).protocol !== 'https:')
  )
    throw new Error('Clerk must use an HTTPS origin.');
  const clerkScripts = clerkIssuer
    ? ' ' + clerkIssuer + ' https://challenges.cloudflare.com https://*.protect.clerk.com'
    : '';
  const clerkConnect = clerkIssuer ? ' ' + clerkIssuer + ' https://*.protect.clerk.com:*' : '';
  const policy = [
    // The Vosk/Emscripten blob worker builds named bindings with Function at initialization.
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'" + clerkScripts,
    "script-src-attr 'none'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:" + (clerkIssuer ? ' https://img.clerk.com' : ''),
    "frame-src 'self'" + clerkScripts,
    "media-src 'self' blob:",
    "font-src 'self' data: blob:",
    "connect-src 'self' blob: data: http://127.0.0.1:11434 " + backend.origin + clerkConnect,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
  // Pin the release for this server's lifetime. A concurrent Vite rebuild replaces dist/.
  const stage = await mkdtemp(join(tmpdir(), 'studypal-web-release-'));
  const root = await realpath(stage);
  try {
    await cp(source, root, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    });
  } catch (error) {
    await rm(stage, { force: true, recursive: true });
    throw error;
  }
  const server = createServer(
    {
      requestTimeout: 20_000,
      headersTimeout: 10_000,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16_384,
    },
    async (request, response) => {
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('referrer-policy', 'no-referrer');
      response.setHeader('x-frame-options', 'DENY');
      response.setHeader('content-security-policy', policy);
      try {
        const raw = request.url ?? '';
        if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\'))
          return finish(response, 400);
        const authority = request.headers.host;
        if (!authority || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(authority))
          return finish(response, 403);
        const ownOrigin = 'http://' + authority;
        const origin = request.headers.origin;
        if (origin && origin !== ownOrigin) return finish(response, 403);
        const location = new URL(raw, ownOrigin);
        const segments = decodeURIComponent(raw.split('?')[0]).split('/');
        if (segments.some((s) => s === '..' || s === '.' || s.includes('\\') || s.includes('\0')))
          return finish(response, 400);
        if (location.pathname.startsWith('/api/')) {
          if (!location.pathname.startsWith('/api/v1/')) return finish(response, 404);
          if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method))
            return finish(response, 405);
          if (!['GET', 'HEAD'].includes(request.method) && origin !== ownOrigin)
            return finish(response, 403);
          return proxy(request, response, backend);
        }
        if (!['GET', 'HEAD'].includes(request.method)) return finish(response, 405);
        const name =
          ['/', '/local', '/local/'].includes(location.pathname) ||
          /^\/(?:sign-in|sign-up)(?:\/[a-z0-9-]+)*\/?$/i.test(location.pathname)
            ? 'index.html'
            : segments.slice(1).join('/');
        if (!name || name.split('/').some((s) => s.startsWith('.'))) return finish(response, 404);
        const file = await realpath(join(root, name)).catch(() => undefined);
        if (!file || !file.startsWith(root + sep)) return finish(response, 404);
        const info = await stat(file);
        if (!info.isFile()) return finish(response, 404);
        response.setHeader(
          'cache-control',
          /^assets\/[^/]+-[\w-]{8,}\./.test(name)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
        response.setHeader('content-type', mime[extname(name)] ?? 'application/octet-stream');
        response.setHeader('content-length', info.size);
        if (request.method === 'HEAD') return response.end();
        await pipeline(createReadStream(file), response);
      } catch (error) {
        finish(response, error instanceof URIError ? 400 : 500);
      }
    },
  );
  server.once('close', () => {
    void rm(stage, { recursive: true, force: true }).catch(() => undefined);
  });
  return server;
}
