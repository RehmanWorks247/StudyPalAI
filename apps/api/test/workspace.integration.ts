import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { recordings, workspaces } from '@studypal/database/schema';
import { eq, inArray } from 'drizzle-orm';
import { RecordingRepository } from '../src/modules/recordings/recording.repository';
import { partBytes } from '../src/modules/recordings/recording.dto';
import { loadConfig } from '../src/config/env';
import { DatabaseService } from '../src/platform/database/database.service';
import { WorkspaceRepository } from '../src/modules/workspace/workspace.repository';

test('PostgreSQL isolates owners and atomically rejects stale or concurrent snapshot writes', async () => {
  const url = process.env['DATABASE_URL'];
  assert.ok(
    url && URL.canParse(url) && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
    'Use a disposable local PostgreSQL database',
  );
  const db = new DatabaseService(
    loadConfig({ DATABASE_URL: url, LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
  );
  const repo = new WorkspaceRepository(db);
  const owner = randomUUID();
  const other = randomUUID();
  try {
    const initial = { content: '', revision: 0 };
    assert.deepEqual(await repo.read(owner), initial);
    const first = await Promise.all([
      repo.save(owner, 0, '{"set":"first"}'),
      repo.save(owner, 0, '{"set":"second"}'),
    ]);
    assert.equal(first.filter(Boolean).length, 1);
    assert.deepEqual(await repo.read(other), initial);
    assert.equal(await repo.save(other, 1, '{}'), undefined);
    const updates = await Promise.all([
      repo.save(owner, 1, '{"set":"A"}'),
      repo.save(owner, 1, '{"set":"B"}'),
    ]);
    const saved = updates.filter((s) => s !== undefined);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.revision, 2);
    assert.deepEqual(await repo.read(owner), saved[0]);
    assert.deepEqual(await repo.save(other, 0, '{"mine":true}'), {
      content: '{"mine":true}',
      revision: 1,
    });
    assert.deepEqual(await repo.read(owner), saved[0]);
  } finally {
    try {
      await db.client.db.delete(workspaces).where(inArray(workspaces.ownerId, [owner, other]));
    } finally {
      await db.onApplicationShutdown();
    }
  }
});

test('recording backup resumes, validates every ordered chunk, isolates owners and versions notes', async () => {
  const url = process.env['DATABASE_URL'];
  assert.ok(
    url && URL.canParse(url) && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
  );
  const db = new DatabaseService(
    loadConfig({ DATABASE_URL: url, LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
  );
  const repo = new RecordingRepository(db);
  const owner = randomUUID();
  const other = randomUUID();
  const id = randomUUID();
  const first = Buffer.alloc(partBytes, 33),
    last = Buffer.from('tail');
  const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
  const input = {
    setId: 1,
    title: 'Integration lecture',
    createdAt: new Date().toISOString(),
    seconds: 18,
    transcript: 'original notes',
    mediaType: 'audio/webm',
    size: first.length + last.length,
    audioHash: sha(sha(first) + sha(last)),
    revision: 0,
  };
  try {
    assert.equal((await repo.begin(owner, id, input)).nextPart, 0);
    assert.deepEqual(await repo.list(other, 1), []);
    await assert.rejects(repo.get(other, id), { status: 404 });
    await assert.rejects(repo.savePart(owner, id, 1, last.toString('base64')), { status: 409 });
    assert.equal((await repo.savePart(owner, id, 0, first.toString('base64'))).nextPart, 1);
    assert.equal((await repo.savePart(owner, id, 0, first.toString('base64'))).nextPart, 1);
    await assert.rejects(repo.readPart(owner, id, 0), { status: 404 });
    assert.equal((await repo.begin(owner, id, input)).nextPart, 1);
    await assert.rejects(repo.savePart(owner, id, 1, Buffer.from('fail').toString('base64')), {
      status: 409,
    });
    assert.equal((await repo.get(owner, id)).nextPart, 1);
    assert.equal((await repo.savePart(owner, id, 1, last.toString('base64'))).complete, true);
    assert.deepEqual(await repo.readPart(owner, id, 1), { data: last.toString('base64') });
    await assert.rejects(repo.readPart(other, id, 0), { status: 404 });
    assert.equal((await repo.begin(owner, id, input)).revision, 1);
    const changed = { ...input, transcript: 'updated', revision: 1 };
    assert.equal((await repo.begin(owner, id, changed)).revision, 2);
    assert.equal((await repo.begin(owner, id, changed)).revision, 2);
    await assert.rejects(repo.begin(owner, id, { ...changed, transcript: 'stale' }), {
      status: 409,
    });
    await assert.rejects(repo.remove(other, id, 2), { status: 409 });
    await assert.rejects(repo.remove(owner, id, 1), { status: 409 });
    await repo.remove(owner, id, 2);
    await assert.rejects(repo.readPart(owner, id, 0), { status: 404 });
  } finally {
    try {
      await db.client.db.delete(recordings).where(eq(recordings.ownerId, owner));
    } finally {
      await db.onApplicationShutdown();
    }
  }
});
