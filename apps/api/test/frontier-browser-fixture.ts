// Isolated companion process for the opt-in Playwright PostgreSQL/worker test.
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { frontierJobs } from '@studypal/database/schema';
import { eq } from 'drizzle-orm';
import { createApplication } from '../src/application';
import { loadConfig } from '../src/config/env';
import { FrontierJobs } from '../src/modules/frontier';
import { processNext } from '../src/modules/frontier/frontier-worker';
import { DatabaseService } from '../src/platform/database/database.service';

async function start() {
  const db = process.env['DATABASE_URL'],
    origin = process.env['FRONTIER_BROWSER_ORIGIN'];
  if (
    !process.send ||
    !db ||
    !origin ||
    ![db, origin].every(
      (url) =>
        URL.canParse(url) && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname),
    )
  )
    throw new Error('Requires a local integration database and test runner');
  const simulation = process.env['FRONTIER_SIMULATION_URL'];
  if (
    simulation &&
    (!URL.canParse(simulation) ||
      new URL(simulation).hostname !== '127.0.0.1' ||
      new URL(simulation).protocol !== 'http:')
  )
    throw new Error('Simulation must be local');
  const owner = randomUUID(),
    pair = randomBytes(32).toString('base64url');
  const config = loadConfig({
    DATABASE_URL: db,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WORKSPACE_AUTH_MODE: 'local',
    WORKSPACE_OWNER_ID: owner,
    WORKSPACE_PAIRING_KEY: pair,
    CORS_ORIGINS: origin,
    OPENAI_API_KEY: 'synthetic',
    FRONTIER_DAILY_BUDGET_CENTS: '10000',
  });
  const app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  const jobs = app.get(FrontierJobs);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('disconnect', stop);
  process.once('SIGTERM', stop);
  process.once('message', stop);
  const transport: typeof fetch = async (_url, opt) => {
    const payload = JSON.parse(String(opt?.body)) as { text: { format: { name: string } } };
    const quiz = payload.text.format.name === 'study_quiz';
    if (simulation)
      return fetch(simulation + '/' + (quiz ? 'quiz' : 'grade') + '/v1/responses', opt);
    const quote = 'Momentum equals mass times velocity.';
    const result = quiz
      ? {
          questions: [
            {
              question: 'What equals mass times velocity?',
              correct: 'Momentum',
              distractors: ['Heat', 'Power', 'Force'],
              explanation: quote,
              quote,
            },
          ],
        }
      : {
          grade: {
            score: 3,
            strength: 'Connects momentum and velocity.',
            improvement: 'Include the mass factor.',
            quote,
          },
        };
    return Response.json({
      status: 'completed',
      usage: { input_tokens: 200, output_tokens: 100 },
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
      ],
    });
  };
  try {
    process.send({ baseUrl: await app.getUrl(), pair });
    while (!controller.signal.aborted) {
      if (!(await processNext(jobs, 'synthetic', controller.signal, transport))) await delay(120);
    }
  } finally {
    try {
      await app
        .get(DatabaseService)
        .client.db.delete(frontierJobs)
        .where(eq(frontierJobs.ownerId, owner));
    } finally {
      await app.close();
      process.disconnect?.();
    }
  }
}
void start().catch(() => {
  process.exitCode = 1;
  process.disconnect?.();
});
