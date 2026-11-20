import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { frontierJobs } from '@studypal/database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { createApplication } from '../src/application';
import { loadConfig } from '../src/config/env';
import { FrontierJobs } from '../src/modules/frontier';
import type { FrontierJobDto, FrontierRequestDto } from '../src/modules/frontier/frontier.dto';
import { processNext } from '../src/modules/frontier/frontier-worker';
import { DatabaseService } from '../src/platform/database/database.service';

test('paired requests reserve once, settle only validated results, enforce ownership and cancellation in PostgreSQL', async () => {
  const dbUrl = process.env['DATABASE_URL'];
  assert.ok(
    dbUrl &&
      URL.canParse(dbUrl) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(dbUrl).hostname),
    'Set DATABASE_URL to a local test database',
  );
  const owner = randomUUID(),
    origin = 'http://localhost:5173',
    key = randomBytes(32).toString('base64url');
  const config = loadConfig({
    DATABASE_URL: dbUrl,
    WORKSPACE_AUTH_MODE: 'local',
    WORKSPACE_OWNER_ID: owner,
    WORKSPACE_PAIRING_KEY: key,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    OPENAI_API_KEY: 'synthetic',
    FRONTIER_DAILY_BUDGET_CENTS: '10000',
    FRONTIER_USER_DAILY_BUDGET_CENTS: '100',
  });
  const app = await createApplication(config);
  const db = app.get(DatabaseService),
    jobs = app.get(FrontierJobs);
  const url = '/api/v1/frontier/jobs';
  const source = { name: 'Body mechanics', text: 'Momentum equals mass times velocity.' };
  const quiz = {
    question: 'What equals mass times velocity?',
    correct: 'Momentum',
    distractors: ['Heat', 'Power', 'Force'],
    explanation: source.text,
    quote: source.text,
  };
  const request: FrontierRequestDto = {
    kind: 'quiz',
    requestId: randomUUID(),
    count: 1,
    prompt: '',
    passages: [source],
  };
  const accounting = async (id: string) =>
    (
      await db.client.db
        .select({ input: frontierJobs.input, charged: frontierJobs.chargedMicros })
        .from(frontierJobs)
        .where(and(eq(frontierJobs.ownerId, owner), eq(frontierJobs.requestId, id)))
    )[0];
  try {
    await app.init();
    assert.equal(
      (await app.inject({ method: 'POST', url, payload: request, headers: { origin } })).statusCode,
      401,
    );
    const paired = await app.inject({
      method: 'POST',
      url: '/api/v1/workspace/pair',
      headers: { origin, authorization: 'Bearer ' + key },
    });
    assert.equal(paired.statusCode, 200);
    const cookie = String(paired.headers['set-cookie']).split(';')[0] ?? '';
    const headers = {
      cookie,
      origin,
      'X-StudyPal-CSRF': paired.json<{ csrfToken: string }>().csrfToken,
    };
    assert.equal(
      (await app.inject({ method: 'POST', url, payload: request, headers: { cookie, origin } }))
        .statusCode,
      403,
    );
    const enqueue = (payload: FrontierRequestDto) =>
      app.inject({ method: 'POST', url, headers, payload });
    const first = await Promise.all([enqueue(request), enqueue(request)]);
    for (const response of first) {
      assert.equal(response.statusCode, 202);
      assert.deepEqual(response.json(), { id: request.requestId, status: 'queued' });
    }
    assert.equal((await enqueue({ ...request, prompt: 'another' })).statusCode, 409);
    assert.equal((await enqueue({ ...request, count: 0 })).statusCode, 400);
    await assert.rejects(jobs.get(randomUUID(), request.requestId), /Not Found/);
    await assert.rejects(jobs.cancel(randomUUID(), request.requestId), /Not Found/);
    assert.ok((await accounting(request.requestId))!.charged > 600);
    const other = { ...request, requestId: randomUUID() };
    assert.equal((await enqueue(other)).statusCode, 202);
    assert.equal((await enqueue({ ...request, requestId: randomUUID() })).statusCode, 429);
    assert.equal(
      (
        await app.inject({ method: 'DELETE', url: url + '/' + other.requestId, headers })
      ).json<FrontierJobDto>().status,
      'canceled',
    );
    assert.deepEqual(await accounting(other.requestId), { input: null, charged: 0 });
    const transport: typeof fetch = async () =>
      Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify({ questions: [quiz] }) }],
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      });
    assert.equal(
      await processNext(jobs, 'synthetic', new AbortController().signal, transport),
      true,
    );
    assert.equal(
      await processNext(jobs, 'synthetic', new AbortController().signal, transport),
      false,
    );
    assert.deepEqual(
      (
        await app.inject({ method: 'GET', url: url + '/' + request.requestId, headers: { cookie } })
      ).json(),
      { id: request.requestId, status: 'completed', result: { questions: [quiz] } },
    );
    assert.deepEqual(await accounting(request.requestId), { input: null, charged: 600 });
    const failed = { ...request, requestId: randomUUID() };
    await enqueue(failed);
    await processNext(
      jobs,
      'synthetic',
      new AbortController().signal,
      async () => new Response(null, { status: 429 }),
    );
    assert.equal((await jobs.get(owner, failed.requestId)).status, 'failed');
    assert.ok((await accounting(failed.requestId))!.charged > 600);
    // Simulate a worker death after claim. Recovery never redispatches the unknown-cost request.
    const interrupted = { ...request, requestId: randomUUID() };
    await enqueue(interrupted);
    assert.ok(await jobs.claim());
    await db.client.db
      .update(frontierJobs)
      .set({ updatedAt: sql`now()-interval '3 minutes'` })
      .where(
        and(eq(frontierJobs.ownerId, owner), eq(frontierJobs.requestId, interrupted.requestId)),
      );
    await jobs.clean();
    assert.equal((await jobs.get(owner, interrupted.requestId)).status, 'failed');
    assert.equal((await accounting(interrupted.requestId))!.input, null);
    const noBudget = new FrontierJobs(db, { ...config, FRONTIER_USER_DAILY_BUDGET_CENTS: 0 });
    await assert.rejects(noBudget.enqueue(owner, { ...request, requestId: randomUUID() }), /quota/);
    const noKey = new FrontierJobs(db, { ...config, OPENAI_API_KEY: undefined });
    await assert.rejects(
      noKey.enqueue(owner, { ...request, requestId: randomUUID() }),
      /Unavailable/,
    );
  } finally {
    try {
      await db.client.db.delete(frontierJobs).where(eq(frontierJobs.ownerId, owner));
    } finally {
      await app.close();
    }
  }
});
