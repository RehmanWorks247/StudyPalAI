import 'reflect-metadata';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import type { ApiConfig } from './config/env';
import { configureHttp, createHttpAdapter } from './platform/http/configure-http';

export async function createApplication(config: ApiConfig): Promise<NestFastifyApplication> {
  const levelCount = { silent: 0, fatal: 1, error: 2, warn: 3, info: 4, debug: 5, trace: 6 }[
    config.LOG_LEVEL
  ];
  const logLevels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    createHttpAdapter(config),
    {
      logger:
        config.LOG_LEVEL === 'silent'
          ? false
          : new ConsoleLogger({
              json: true,
              colors: false,
              logLevels: logLevels.slice(0, levelCount),
            }),
    },
  );
  await configureHttp(app, config);
  return app;
}
