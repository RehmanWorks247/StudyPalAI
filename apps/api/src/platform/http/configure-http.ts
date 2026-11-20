import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../../config/env';
import { createOpenApiDocument } from './openapi';
import { ProblemFilter } from './problem.filter';

export function createHttpAdapter(config: ApiConfig): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: 1024 * 1024,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    trustProxy:
      config.API_TRUST_PROXY_HOPS > 0
        ? (_address, hop) => hop < config.API_TRUST_PROXY_HOPS
        : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      serializers: {
        req: (request: { method: string; url: string; id: string }) => ({
          method: request.method,
          path: request.url.split('?')[0],
          id: request.id,
        }),
      },
    },
  });
}

export async function configureHttp(app: NestFastifyApplication, config: ApiConfig): Promise<void> {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new ProblemFilter());
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  fastify.addHook('onRoute', (route) => {
    if (route.method === 'PUT' && route.url === '/api/v1/recordings/:id/parts/:part')
      route.bodyLimit = 6 * 1024 * 1024;
    if (route.method === 'PUT' && route.url === '/api/v1/workspace')
      route.bodyLimit = 16 * 1024 * 1024;
  });
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (request.routeOptions.url === '/api/v1/health/ready')
      reply.header('x-studypal-auth-mode', config.WORKSPACE_AUTH_MODE);
    reply.header('cache-control', 'no-store');
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  if (config.ENABLE_API_DOCS) {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
  }
}
