import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createLocalWebServer } from './local-web-server.mjs';

test('loopback web server serves offline assets and forwards same-origin authenticated API requests', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'studypal-web-'));
  const dist = join(temp, 'dist');
  await mkdir(dist);
  await Promise.all([
    writeFile(join(dist, 'index.html'), '<title>StudyPal</title>'),
    writeFile(join(dist, 'engine.wasm'), 'abc'),
    writeFile(join(temp, 'private.txt'), 'private'),
    symlink(join(temp, 'private.txt'), join(dist, 'link.txt')),
  ]);
  const backend = createServer((req, res) => {
    assert.equal(req.url, '/api/v1/workspace');
    assert.equal(req.headers['x-studypal-csrf'], 'valid');
    assert.equal(req.headers.cookie, 'session=example');
    assert.equal(req.headers['x-forwarded-for'], undefined);
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'session=renewed; HttpOnly; Secure; SameSite=Strict',
    });
    res.end('{"revision":2}');
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const server = await createLocalWebServer({
    directory: dist,
    api: 'http://127.0.0.1:' + backend.address().port,
    clerkIssuer: 'https://clerk.example.org',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const path of [
      '/local',
      '/sign-in',
      '/sign-in/factor-one',
      '/sign-up/verify-email-address',
    ]) {
      const page = await fetch(origin + path);
      assert.match(await page.text(), /StudyPal/);
      assert.match(
        page.headers.get('content-security-policy'),
        /script-src [^;]*https:\/\/clerk\.example\.org/,
      );
    }
    assert.equal(
      (await fetch(origin + '/engine.wasm', { method: 'HEAD' })).headers.get('content-type'),
      'application/wasm',
    );
    for (const path of ['/missing.mjs', '/sign-in/bundle.js', '/link.txt', '/.env'])
      assert.equal((await fetch(origin + path)).status, 404);
    const invalid = await new Promise((resolve) => {
      request(origin, { path: '/%2e%2e%2fprivate.txt' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).end();
    });
    assert.equal(invalid, 400);
    assert.equal(
      await new Promise((resolve) =>
        request(origin, { headers: { host: 'untrusted.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        }).end(),
      ),
      403,
    );
    await writeFile(join(dist, 'index.html'), 'rebuild in progress');
    assert.notEqual(await (await fetch(origin + '/')).text(), 'rebuild in progress');
    const endpoint = origin + '/api/v1/workspace';
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', headers: { origin: 'https://other.example' } }))
        .status,
      403,
    );
    assert.equal((await fetch(endpoint, { method: 'PUT' })).status, 403);
    const reply = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        origin,
        'x-studypal-csrf': 'valid',
        cookie: 'session=example',
        'x-forwarded-for': '203.0.113.1',
      },
      body: '{}',
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { revision: 2 });
    assert.match(reply.headers.get('set-cookie'), /HttpOnly/);
  } finally {
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => backend.close(resolve)),
    ]);
    await rm(temp, { recursive: true, force: true });
  }
});
