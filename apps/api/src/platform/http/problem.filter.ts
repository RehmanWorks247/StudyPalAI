import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProblemDto } from './problem.dto';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const fastifyStatus =
      exception !== null && typeof exception === 'object' && 'statusCode' in exception
        ? exception.statusCode
        : undefined;
    const candidate = exception instanceof HttpException ? exception.getStatus() : fastifyStatus;
    const status =
      typeof candidate === 'number' && candidate >= 400 && candidate <= 599 ? candidate : 500;
    const title = STATUS_CODES[status] ?? 'Request Failed';

    if (status >= 500) {
      // Exceptions can include provider secrets and SQL parameters. Log a safe class only.
      request.log.error(
        { errorType: exception instanceof Error ? exception.name : 'UnknownError', status },
        'Request failed',
      );
    }

    const detail =
      status === 503
        ? 'The service is temporarily unavailable.'
        : status >= 500
          ? 'An unexpected error occurred.'
          : status === 400
            ? 'The request is invalid.'
            : title;
    const problem: ProblemDto = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.url.split('?')[0] ?? '/',
      requestId: request.id,
    };
    void reply.status(status).type('application/problem+json').send(problem);
  }
}
