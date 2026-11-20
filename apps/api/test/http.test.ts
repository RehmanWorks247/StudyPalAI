import { PublicEndpoint } from '../src/platform/http/endpoint-access';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { IsString, MaxLength } from 'class-validator';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/env';
import { DatabaseService } from '../src/platform/database/database.service';
import { configureHttp, createHttpAdapter } from '../src/platform/http/configure-http';
import { createOpenApiDocument } from '../src/platform/http/openapi';

class InputDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}

@PublicEndpoint()
@Controller('test')
class TestController {
  @Get('failure')
  failure(): never {
    throw new Error('database-password-secret');
  }

  @Post('validate')
  validate(@Body() input: InputDto): InputDto {
    return input;
  }
}

async function makeApp(
  options: { databaseFails?: boolean; rateLimit?: number; docs?: boolean } = {},
): Promise<NestFastifyApplication> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    RATE_LIMIT_MAX: String(options.rateLimit ?? 100),
    ENABLE_API_DOCS: String(options.docs ?? false),
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
    controllers: [TestController],
  })
    .overrideProvider(DatabaseService)
    .useValue({
      ping: async () => {
        if (options.databaseFails) throw new Error('database-password-secret');
      },
    })
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(config), {
    logger: false,
  });
  await configureHttp(app, config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

test('liveness is independent of database availability, readiness returns safe 503', async () => {
  const app = await makeApp({ databaseFails: true });
  try {
    const live = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    assert.equal(live.statusCode, 200);
    assert.deepEqual(live.json(), { status: 'ok' });
    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    assert.equal(ready.statusCode, 503);
    assert.equal(ready.headers['x-studypal-auth-mode'], 'clerk');
    assert.match(String(ready.headers['content-type']), /application\/problem\+json/);
    assert.equal(ready.json<{ requestId: string }>().requestId, ready.headers['x-request-id']);
    assert.ok(!ready.body.includes('password'));
  } finally {
    await app.close();
  }
});

test('readiness reports success after the database responds', async () => {
  const app = await makeApp();
  try {
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/health/ready' })).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});

test('security headers, exact CORS origins, and generated request IDs are applied', async () => {
  const app = await makeApp();
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { origin: 'http://localhost:5173', 'x-request-id': 'client-controlled' },
    });
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(String(response.headers['x-request-id']), /^[0-9a-f-]{36}$/);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { origin: 'https://attacker.example' },
    });
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    assert.equal((await app.inject({ method: 'GET', url: '/api/docs' })).statusCode, 404);
  } finally {
    await app.close();
  }
});

test('unknown DTO fields and malformed JSON are rejected; valid input is accepted', async () => {
  const app = await makeApp();
  try {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/test/validate',
      payload: { name: 'Test', admin: true },
    });
    assert.equal(unknown.statusCode, 400);
    assert.match(String(unknown.headers['content-type']), /application\/problem\+json/);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/test/validate',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    assert.equal(invalid.statusCode, 400);
    assert.match(String(invalid.headers['content-type']), /application\/problem\+json/);
    const valid = await app.inject({
      method: 'POST',
      url: '/api/v1/test/validate',
      payload: { name: 'Test' },
    });
    assert.equal(valid.statusCode, 201);
    assert.deepEqual(valid.json(), { name: 'Test' });
  } finally {
    await app.close();
  }
});

test('unexpected failures and missing routes use problem details without secrets or query strings', async () => {
  const app = await makeApp();
  try {
    const failure = await app.inject({ method: 'GET', url: '/api/v1/test/failure?token=secret' });
    assert.equal(failure.statusCode, 500);
    assert.equal(failure.json<{ instance: string }>().instance, '/api/v1/test/failure');
    assert.ok(!failure.body.includes('secret'));
    const missing = await app.inject({ method: 'GET', url: '/missing' });
    assert.equal(missing.statusCode, 404);
    assert.match(String(missing.headers['content-type']), /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

test('oversized JSON bodies are rejected before reaching controllers', async () => {
  const app = await makeApp();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/test/validate',
      payload: { name: 'x'.repeat(1024 * 1024) },
    });
    assert.equal(response.statusCode, 413);
    assert.match(String(response.headers['content-type']), /application\/problem\+json/);
  } finally {
    await app.close();
  }
});

test('rate limiting bounds repeated requests', async () => {
  const app = await makeApp({ rateLimit: 1 });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/health/live' })).statusCode, 200);
    const limited = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    assert.equal(limited.statusCode, 429);
    assert.match(String(limited.headers['content-type']), /application\/problem\+json/);
    assert.ok(limited.headers['retry-after']);
    assert.ok(limited.headers['x-request-id']);
  } finally {
    await app.close();
  }
});

test('OpenAPI describes the versioned health contract and failure response', async () => {
  const app = await makeApp();
  try {
    const document = createOpenApiDocument(app);
    assert.equal(document.paths['/api/v1/health/live']?.get?.operationId, 'healthLive');
    assert.equal(document.paths['/api/v1/health/ready']?.get?.operationId, 'healthReady');
    assert.ok(document.paths['/api/v1/health/ready']?.get?.responses['503']);
    assert.ok(document.components?.schemas?.['ProblemDto']);
  } finally {
    await app.close();
  }
});

test('API documentation serves when explicitly enabled outside production', async () => {
  const app = await makeApp({ docs: true });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/docs' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /swagger-ui/);
    const script = await app.inject({ method: 'GET', url: '/api/docs/swagger-ui-bundle.js' });
    assert.equal(script.statusCode, 200);
    const schema = await app.inject({ method: 'GET', url: '/api/docs-json' });
    assert.equal(schema.statusCode, 200);
  } finally {
    await app.close();
  }
});
