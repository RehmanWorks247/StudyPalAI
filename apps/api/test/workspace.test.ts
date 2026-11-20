import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/env';
import { WorkspaceRepository } from '../src/modules/workspace/workspace.repository';
import { configureHttp, createHttpAdapter } from '../src/platform/http/configure-http';

const origin = 'http://127.0.0.1:5173';
const owner = randomUUID();
const pairing = randomBytes(32).toString('base64url');
const options = {
  DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: origin,
};
const security = {
  WORKSPACE_AUTH_MODE: 'local',
  WORKSPACE_PAIRING_KEY: pairing,
  WORKSPACE_OWNER_ID: owner,
};
const snapshotUrl = '/api/v1/workspace';

async function server(configured = true) {
  const config = loadConfig({ ...options, ...(configured ? security : {}) });
  let current = { revision: 0, content: '' };
  const repository = {
    read: async (ownerId: string) => {
      assert.equal(ownerId, owner);
      return current;
    },
    save: async (ownerId: string, revision: number, content: string) => {
      assert.equal(ownerId, owner);
      if (current.revision !== revision) return undefined;
      return (current = { revision: revision + 1, content });
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(WorkspaceRepository)
    .useValue(repository)
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter(config), {
    logger: false,
  });
  await configureHttp(app, config);
  await app.listen(0, '127.0.0.1');
  return { app, base: await app.getUrl() };
}

test('pairing is default-deny, loopback-only and resistant to cross-origin requests', async (t) => {
  const { app, base } = await server();
  try {
    const pair = base + snapshotUrl + '/pair';
    assert.equal((await fetch(base + snapshotUrl)).status, 401);
    assert.equal((await fetch(pair, { method: 'POST', headers: { origin } })).status, 401);
    assert.equal(
      (await fetch(pair, { method: 'POST', headers: { origin, authorization: 'Bearer wrong' } }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(pair, {
          method: 'POST',
          headers: { origin: 'https://other.example', authorization: 'Bearer ' + pairing },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(pair, { method: 'POST', headers: { authorization: 'Bearer ' + pairing } }))
        .status,
      403,
    );
    const external = await app.inject({
      method: 'POST',
      url: snapshotUrl + '/pair',
      headers: { host: 'foreign.example', origin, authorization: 'Bearer ' + pairing },
      remoteAddress: '127.0.0.1',
    });
    assert.equal(external.statusCode, 403);
    const remote = await app.inject({
      method: 'POST',
      url: snapshotUrl + '/pair',
      headers: { host: 'localhost', origin, authorization: 'Bearer ' + pairing },
      remoteAddress: '192.0.2.4',
    });
    assert.equal(remote.statusCode, 403);
    const paired = await fetch(pair, {
      method: 'POST',
      headers: { origin, authorization: 'Bearer ' + pairing },
    });
    assert.equal(paired.status, 200);
    const cookieHeader = paired.headers.get('set-cookie');
    assert.ok(cookieHeader);
    for (const attribute of [
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Max-Age=28800',
      'Path=/api/v1',
    ])
      assert.ok(cookieHeader.includes(attribute));
    assert.ok(!cookieHeader.includes('Domain='));
    const cookie = cookieHeader.split(';')[0]!;
    const { csrfToken } = (await paired.json()) as { csrfToken: string };
    const headers = {
      origin,
      cookie,
      'content-type': 'application/json',
      'x-studypal-csrf': csrfToken,
    };
    const url = base + snapshotUrl;
    const replaced = await fetch(url + '/session', { headers: { origin, cookie } });
    assert.deepEqual(await replaced.json(), { csrfToken });
    assert.deepEqual(await (await fetch(url, { headers })).json(), {
      revision: 0,
      content: '',
      csrfToken,
    });
    const body = JSON.stringify({ revision: 0, content: '{}' });
    assert.equal(
      (await fetch(url, { method: 'PUT', headers: { ...headers, 'x-studypal-csrf': '' }, body }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers: { ...headers, origin: 'https://other.example' },
          body,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ revision: 0, content: '{}', ownerId: randomUUID() }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ revision: 0, content: '[]' }),
        })
      ).status,
      400,
    );
    // Normal workspace requests can exceed the smaller general API body cap.
    const content = JSON.stringify({ text: 'x'.repeat(1100000) });
    const accepted = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ revision: 0, content }),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { revision: 1, content, csrfToken });
    assert.equal((await fetch(url, { method: 'PUT', headers, body })).status, 409);
    const tooLarge = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        revision: 1,
        content: JSON.stringify({ text: '界'.repeat(2800000) }),
      }),
    });
    assert.equal(tooLarge.status, 413);
    assert.deepEqual(await (await fetch(url, { headers })).json(), {
      revision: 1,
      content,
      csrfToken,
    });
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(8 * 60 * 60 * 1000 + 1);
    assert.equal((await fetch(url + '/session', { headers })).status, 401);
    t.mock.timers.reset();
  } finally {
    await app.close();
  }
});

test('paired routes stay disabled when no installation identity is configured', async () => {
  const { app, base } = await server(false);
  try {
    assert.equal((await fetch(base + snapshotUrl)).status, 503);
  } finally {
    await app.close();
  }
});

test('local pairing refuses public services, proxies, non-local databases and partial credentials', () => {
  for (const settings of [
    { API_HOST: '0.0.0.0' },
    { DATABASE_URL: 'postgres://example.org/workspace' },
    { API_TRUST_PROXY_HOPS: '1' },
    { CORS_ORIGINS: 'https://example.org' },
    { WORKSPACE_OWNER_ID: undefined },
  ])
    assert.throws(() => loadConfig({ ...options, ...security, ...settings }), /WORKSPACE/);
});
