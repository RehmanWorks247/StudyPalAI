import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ProblemDto } from './problem.dto';

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StudyPal API')
    .setDescription('StudyPal workspace, recording, practice generation and health endpoints.')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Local installation pairing key' },
      'pairing-key',
    )
    .addCookieAuth('studypal_session', { type: 'apiKey', in: 'cookie' }, 'workspace-session')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Current verified Clerk user session JWT',
      },
      'clerk-session',
    )
    .addCookieAuth('__session', { type: 'apiKey', in: 'cookie' }, 'clerk-cookie')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ProblemDto] });
  for (const pathItem of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      if (operation.security?.some((requirement) => 'workspace-session' in requirement)) {
        operation.security = [
          { 'workspace-session': [], 'clerk-session': [] },
          { 'workspace-session': [], 'clerk-cookie': [] },
          { 'workspace-session': [] },
        ];
        operation.description =
          (operation.description ?? '') +
          ' Clerk mode requires a StudyPal cookie and a current Clerk JWT. A StudyPal cookie alone is accepted only in explicitly enabled local pairing mode.';
      }
      for (const [status, description] of Object.entries({
        ...(operation.security?.length
          ? {
              401: 'Pairing or session credentials missing or invalid',
              403: 'Untrusted origin, remote host or CSRF token',
              503: 'Local service unavailable',
            }
          : {}),
        ...(operation.tags?.includes('recordings')
          ? {
              400: 'Invalid recording or audio part',
              404: 'Recording unavailable',
              409: 'Conflicting recording, revision, or part',
              413: 'Recording or storage limit reached',
            }
          : {}),
        ...(operation.operationId === 'saveWorkspace'
          ? { 400: 'Invalid snapshot', 409: 'Revision conflict', 413: 'Snapshot too large' }
          : {}),
        429: 'Rate limit exceeded',
        500: 'Unexpected server error',
      })) {
        operation.responses[status] ??= {
          description,
          content: {
            'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDto' } },
          },
        };
      }
    }
  }
  return document;
}
