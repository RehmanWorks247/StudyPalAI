import { createFirstSet } from './fixtures/study-set';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test('opt-in quiz, test and grading traverse the paired API, real PostgreSQL and simulated provider', async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env['RUN_FRONTIER_E2E'] !== '1',
    'Requires a local migrated PostgreSQL database and the compiled API test fixture.',
  );
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4184').origin;
  const fixture = fork(
    fileURLToPath(new URL('../../api/dist-test/test/frontier-browser-fixture.js', import.meta.url)),
    [],
    {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      env: { ...process.env, FRONTIER_BROWSER_ORIGIN: origin },
    },
  );
  const exited = once(fixture, 'exit');
  try {
    const [info] = (await Promise.race([
      once(fixture, 'message'),
      exited.then(() => {
        throw new Error('Local frontier test server failed to start');
      }),
    ])) as [{ baseUrl: string; pair: string }];
    const requests: string[] = [];
    await page.route(origin + '/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/v1/frontier')) requests.push(route.request().method());
      const response = await route.fetch({ url: info.baseUrl + url.pathname });
      await route.fulfill({ response });
    });
    await page.goto('/');
    await createFirstSet(page);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add materials' });
    const name = 'Frontier reading.txt';
    await dialog.getByLabel('Choose materials').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from('Momentum equals mass times velocity.'),
    });
    await dialog.getByText(name, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
    await page.goto('/#quiz');
    await page.getByLabel('Source material').selectOption(name);
    await page.getByLabel('Number of questions').selectOption('1');
    await expect(page.getByLabel('AI model')).toHaveValue('local');
    await page.getByLabel('AI model').selectOption('cloud');
    expect(requests).toEqual([]);
    await page.getByRole('button', { name: 'Generate quiz' }).click();
    await expect(page.getByRole('alert')).toContainText('Pair this browser');
    expect(requests).toEqual([]);
    const paired = await page.evaluate(
      async (key) =>
        (
          await fetch('/api/v1/workspace/pair', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + key },
          })
        ).status,
      info.pair,
    );
    expect(paired).toBe(200);
    for (const mode of ['quiz', 'test']) {
      await page.goto('/#' + mode);
      await page.getByLabel('Source material').selectOption(name);
      await page.getByLabel('AI model').selectOption('cloud');
      await page.getByLabel('Number of questions').selectOption('1');
      await page.getByRole('button', { name: 'Generate ' + mode }).click();
      await page.getByRole('radio', { name: 'Momentum' }).check();
      if (mode === 'quiz') {
        await page.getByRole('button', { name: 'Check answer' }).click();
        await expect(
          page.getByRole('region', { name: 'Practice quiz', exact: true }).locator('cite'),
        ).toHaveText(name);
      }
      await page.getByRole('button', { name: 'See results' }).click();
      await expect(page.getByText('1 of 1 correct')).toBeVisible();
    }
    await page.goto('/#essay');
    await page.getByLabel('Source material').selectOption(name);
    await page.getByLabel('Your answer').fill('Momentum depends on velocity.');
    await page.getByLabel('AI model').selectOption('cloud');
    await page.getByRole('button', { name: 'Review answer' }).click();
    await expect(page.getByRole('article', { name: 'Source-grounded response' })).toContainText(
      'Source accuracy: 3/4',
    );
    await expect(page.getByRole('article')).toContainText('Momentum equals mass times velocity.');
    expect(requests.filter((method) => method === 'POST')).toHaveLength(3);
  } finally {
    if (fixture.connected) fixture.send('stop');
    await exited;
  }
});
