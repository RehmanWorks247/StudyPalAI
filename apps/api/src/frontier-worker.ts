import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigurationModule } from './config/configuration.module';
import { loadConfig } from './config/env';
import { FrontierJobs, runWorker } from './modules/frontier';
import { DatabaseModule } from './platform/database/database.module';

async function main() {
  const config = loadConfig(process.env);
  if (!config.OPENAI_API_KEY || !config.WORKSPACE_OWNER_ID) throw new Error('Missing worker key');
  @Module({
    imports: [ConfigurationModule.register(config), DatabaseModule],
    providers: [FrontierJobs],
  })
  class WorkerModule {}
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try {
    await runWorker(app.get(FrontierJobs), config.OPENAI_API_KEY, stop.signal);
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('{"level":"error","message":"Frontier worker startup failed"}\n');
  process.exitCode = 1;
});
