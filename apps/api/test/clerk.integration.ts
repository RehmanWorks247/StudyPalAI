import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { clerkBindings, clerkIdentities, workspaces } from '@studypal/database/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { createApplication } from '../src/application';
import { loadConfig } from '../src/config/env';
import { DatabaseService } from '../src/platform/database/database.service';
import { signingFixture, testIssuer, testOrigin } from './clerk-fixture';

test('Clerk exchange binds PostgreSQL ownership to issuer, subject and active browser session, and logout revokes replay', async () => {
  const db = process.env['DATABASE_URL'];
  assert.ok(
    db && URL.canParse(db) && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(db).hostname),
    'Use an isolated local PostgreSQL test database',
  );
  const keys = signingFixture(),
    subjects = ['user_' + randomUUID(), 'user_' + randomUUID()] as const;
  const legacy = randomUUID(),
    legacyKey = randomBytes(32).toString('base64url');
  const app = await createApplication(
    loadConfig({
      DATABASE_URL: db,
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: testOrigin,
      CLERK_ISSUER: testIssuer,
      CLERK_JWT_KEY: keys.publicPem,
      WORKSPACE_OWNER_ID: legacy,
      WORKSPACE_PAIRING_KEY: legacyKey,
    }),
  );
  await app.listen(0, '127.0.0.1');
  const api = (await app.getUrl()) + '/api/v1/workspace';
  const account = (sub: string, sid: string) => keys.token({ sub, sid });
  const first = account(subjects[0], 'sess_' + randomUUID()),
    second = account(subjects[1], 'sess_' + randomUUID());
  const headers = (token: string) => ({ origin: testOrigin, authorization: 'Bearer ' + token });
  const database = app.get(DatabaseService).client.db;
  async function exchange(jwt: string, previousCookie?: string) {
    const h: Record<string, string> = headers(jwt);
    if (previousCookie) h.cookie = previousCookie;
    const res = await fetch(api + '/sign-in', { method: 'POST', headers: h });
    assert.equal(res.status, 200);
    const rawCookie = res.headers.get('set-cookie');
    assert.ok(rawCookie);
    assert.ok(rawCookie.includes('HttpOnly; Secure; SameSite=Strict'));
    const cookie = rawCookie.split(';')[0];
    assert.ok(cookie);
    const { ownerId, csrfToken, expiresAt } = (await res.json()) as {
      ownerId: string;
      csrfToken: string;
      expiresAt: string;
    };
    const lifetime = Date.parse(expiresAt) - Date.now();
    assert.ok(lifetime > 29 * 60_000 && lifetime <= 30 * 60_000);
    return { cookie, ownerId, csrfToken };
  }
  try {
    await database
      .insert(workspaces)
      .values({ ownerId: legacy, revision: 1, content: '{"legacy":true}' });
    assert.equal(
      (
        await fetch(api + '/pair', {
          method: 'POST',
          headers: { origin: testOrigin, authorization: 'Bearer ' + legacyKey },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(api + '/sign-in', {
          method: 'POST',
          headers: { cookie: '__session=' + first, origin: testOrigin },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(api + '/sign-in', {
          method: 'POST',
          headers: { ...headers(first), origin: 'https://untrusted.example' },
        })
      ).status,
      403,
    );
    const [a, b] = await Promise.all([exchange(first), exchange(second)]);
    assert.notEqual(a.ownerId, b.ownerId);
    assert.notEqual(a.ownerId, legacy);
    const read = await fetch(api, { headers: { ...headers(first), cookie: a.cookie } });
    assert.deepEqual(await read.json(), { revision: 0, content: '', csrfToken: a.csrfToken });
    const body = JSON.stringify({ revision: 0, content: '{"lesson":"A"}' });
    const writeHeaders = {
      ...headers(first),
      cookie: a.cookie,
      'content-type': 'application/json',
      'x-studypal-csrf': a.csrfToken,
    };
    assert.equal(
      (
        await fetch(api, {
          method: 'PUT',
          headers: { ...writeHeaders, 'x-studypal-csrf': 'wrong' },
          body,
        })
      ).status,
      403,
    );
    assert.equal((await fetch(api, { method: 'PUT', headers: writeHeaders, body })).status, 200);
    const dataB = await fetch(api, { headers: { ...headers(second), cookie: b.cookie } });
    assert.deepEqual(await dataB.json(), { revision: 0, content: '', csrfToken: b.csrfToken });
    assert.equal(
      (await fetch(api, { headers: { ...headers(second), cookie: a.cookie } })).status,
      401,
    );
    assert.equal((await fetch(api, { headers: { cookie: a.cookie } })).status, 401);
    assert.equal(
      (await fetch(api, { headers: { cookie: a.cookie + '; __session=' + first } })).status,
      200,
    );
    const refreshed = await exchange(first, a.cookie);
    assert.deepEqual(refreshed, a);
    const logout = await fetch(api + '/sign-out', {
      method: 'POST',
      headers: { ...headers(first), cookie: a.cookie, 'x-studypal-csrf': a.csrfToken },
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal(
      (await fetch(api, { headers: { ...headers(first), cookie: a.cookie } })).status,
      401,
    );
    assert.equal(
      (await fetch(api + '/sign-in', { method: 'POST', headers: headers(first) })).status,
      401,
    );
    const newJwt = account(subjects[0], 'sess_' + randomUUID());
    const again = await exchange(newJwt);
    assert.equal(again.ownerId, a.ownerId);
    assert.notEqual(again.cookie, a.cookie);
    const restored = await fetch(api, { headers: { ...headers(newJwt), cookie: again.cookie } });
    assert.equal(((await restored.json()) as { content: string }).content, '{"lesson":"A"}');
  } finally {
    try {
      const rows = await database
        .select({ id: clerkIdentities.ownerId })
        .from(clerkIdentities)
        .where(
          and(
            eq(clerkIdentities.issuer, testIssuer),
            inArray(clerkIdentities.subject, [...subjects]),
          ),
        );
      const ids = rows.map((r) => r.id);
      await database.transaction(async (tx) => {
        await tx.delete(workspaces).where(inArray(workspaces.ownerId, [legacy, ...ids]));
        if (ids.length) {
          await tx.delete(clerkBindings).where(inArray(clerkBindings.ownerId, ids));
          await tx.delete(clerkIdentities).where(inArray(clerkIdentities.ownerId, ids));
        }
      });
    } finally {
      await app.close();
    }
  }
});
