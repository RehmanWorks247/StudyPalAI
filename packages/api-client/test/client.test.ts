import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '../src/index.js';

test('uses contract paths and decodes a successful JSON response', async () => {
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: async (request) => {
      assert.equal(request.url, 'https://api.example.test/api/v1/health/live');
      assert.equal(request.method, 'GET');
      return Response.json({ status: 'ok' });
    },
  });
  const result = await api.GET('/api/v1/health/live');
  assert.deepEqual(result.data, { status: 'ok' });
  assert.equal(result.error, undefined);
});

test('preserves problem responses and request IDs for the caller', async () => {
  const problem = {
    type: 'about:blank',
    title: 'Service Unavailable',
    status: 503,
    detail: 'The service is temporarily unavailable.',
    instance: '/api/v1/health/ready',
    requestId: 'request-123',
  };
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: async () =>
      Response.json(problem, {
        status: 503,
        headers: { 'content-type': 'application/problem+json', 'x-request-id': 'request-123' },
      }),
  });
  const result = await api.GET('/api/v1/health/ready');
  assert.equal(result.data, undefined);
  assert.deepEqual(result.error, problem);
  assert.equal(result.response.headers.get('x-request-id'), 'request-123');
});

test('propagates cancellation and network failures without unsafe retries', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: async (request) => {
      calls += 1;
      assert.equal(request.signal.aborted, true);
      throw new TypeError('Network unavailable');
    },
  });
  await assert.rejects(
    api.GET('/api/v1/health/live', { signal: controller.signal }),
    /Network unavailable/,
  );
  assert.equal(calls, 1);
});
