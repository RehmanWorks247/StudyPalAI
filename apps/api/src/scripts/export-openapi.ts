import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApplication } from '../application';
import { loadConfig } from '../config/env';
import { createOpenApiDocument } from '../platform/http/openapi';

async function exportOpenApi(): Promise<void> {
  // Offline by design: constructing the pool never acquires a database connection.
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  });
  const app = await createApplication(config);
  try {
    const document = createOpenApiDocument(app);
    const destination = path.resolve(__dirname, '../../../../packages/api-contract/openapi.json');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

void exportOpenApi().catch(() => {
  process.stderr.write('OpenAPI export failed\n');
  process.exitCode = 1;
});
