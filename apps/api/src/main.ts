import { createApplication } from './application';
import { loadConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await createApplication(config);
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, config.API_HOST);
}

void bootstrap().catch((error: unknown) => {
  // Configuration errors contain field names only. Other startup errors can contain credentials.
  const message =
    error instanceof Error && error.message.startsWith('Invalid API configuration:')
      ? error.message
      : 'API startup failed';
  process.stderr.write(`${JSON.stringify({ level: 'error', message })}\n`);
  process.exitCode = 1;
});
