import { createFirstSet } from './fixtures/study-set';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({
  actionTimeout: 15_000,
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' +
        fileURLToPath(new URL('./fixtures/spoken-digits.wav', import.meta.url)),
    ],
  },
  permissions: ['microphone'],
});

test('dictates a tutor question with the installed offline speech model', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await createFirstSet(page);
  await page.goto('/#record');
  await page.getByRole('button', { name: 'Install English model' }).click();
  await expect(page.getByText('English speech model installed on this device.')).toBeVisible({
    timeout: 90_000,
  });
  await page.goto('/#tutor');
  await page.getByRole('button', { name: 'Dictate question' }).waitFor();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Dictate question' }).click();
  const finish = page.getByRole('button', { name: 'Finish dictation' });
  await expect(finish).toBeVisible();
  // Capture the four-second spoken audio through Chrome's fake microphone.
  await page.waitForTimeout(4200);
  await finish.click();
  await expect(page.getByRole('textbox', { name: 'Ask your AI tutor anything' })).toHaveValue(
    /zero/i,
    { timeout: 45_000 },
  );
});

test('offline Mac runs source-backed tutoring, quiz and test with real local inference', async ({
  page,
  context,
}) => {
  test.skip(
    process.env.RUN_LOCAL_AI_E2E !== '1',
    'Start the local model and set RUN_LOCAL_AI_E2E=1 to run live inference.',
  );
  test.setTimeout(600_000);
  const unexpected: string[] = [];
  await context.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') await route.continue();
    else {
      unexpected.push(url.origin);
      await route.abort('internetdisconnected');
    }
  });
  const filename = 'Greenhouse field notes.txt';
  const passage =
    'In Fieldhouse Elm, the irrigation valve opens at 18 kilopascals. The indicator bead is cobalt blue. The inspection interval is fourteen days.';
  await page.goto('/');
  await createFirstSet(page);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  await dialog
    .getByLabel('Choose materials')
    .setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from(passage) });
  await dialog.getByText(filename, { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Ask your AI tutor anything' })
    .fill('At how many kilopascals does the Fieldhouse Elm irrigation valve open?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  let transcript = page.getByRole('log', { name: 'Chat transcript' });
  await expect(
    transcript.getByText('Local AI', { exact: true }).or(page.getByRole('alert')).first(),
  ).toBeVisible({ timeout: 125_000 });
  expect(await page.getByRole('alert').allTextContents()).toEqual([]);
  await expect(transcript).toContainText(filename);
  await expect(transcript).toContainText('18');
  await page
    .getByRole('navigation', { name: 'Study set navigation' })
    .getByRole('button', { name: 'Tutor Me', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Ask your AI tutor anything' })
    .fill('Which color is the Fieldhouse Elm indicator bead?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  transcript = page.getByRole('log', { name: 'Chat transcript' });
  await expect(transcript.getByText('Local AI', { exact: true })).toHaveCount(2, {
    timeout: 125_000,
  });
  await expect(transcript.getByText(/cobalt blue/i).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read aloud' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.reload();
  await expect(transcript.getByText('Local AI', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat history' }).click();
  await page.getByRole('button', { name: /At how many kilopascals/ }).click();
  await expect(transcript.getByText('Local AI', { exact: true })).toHaveCount(2);
  for (const mode of ['quiz', 'test']) {
    await page.goto('/#' + mode);
    const region = page.getByRole('region', { name: 'Practice ' + mode, exact: true });
    await region.getByLabel('Source material').selectOption(filename);
    await region.getByLabel('Number of questions').selectOption('1');
    await region.getByRole('button', { name: 'Generate ' + mode, exact: true }).click();
    const choices = region.getByRole('radio');
    await expect(choices.first().or(region.getByRole('alert')).first()).toBeVisible({
      timeout: 125_000,
    });
    expect(await region.getByRole('alert').allTextContents()).toEqual([]);
    await expect(choices).toHaveCount(4);
    await choices.first().check();
    if (mode === 'quiz') {
      await region.getByRole('button', { name: 'Check answer' }).click();
      await expect(region.getByRole('status')).toContainText(filename);
    } else await expect(region.locator('blockquote')).toHaveCount(0);
    await region.getByRole('button', { name: 'See results' }).click();
    await expect(page.getByRole('region', { name: 'Practice results' })).toContainText(
      'of 1 correct',
    );
    await page.reload();
    await expect(page.getByRole('region', { name: 'Practice results' })).toContainText(
      'of 1 correct',
    );
  }
  await page.getByRole('button', { name: 'Create another test' }).click();
  await page.goto('/#qbank');
  const savedTest = page.getByRole('article', { name: 'Practice test · Saved' });
  await expect(savedTest).toContainText('of 1 correct');
  await savedTest.getByRole('button', { name: 'Practice again' }).click();
  const replay = page.getByRole('region', { name: 'Practice test', exact: true });
  await expect(replay.getByRole('radio')).toHaveCount(4);
  await expect(replay.getByRole('button', { name: 'See results' })).toBeDisabled();
  await page.goto('/#qbank');
  await savedTest.getByRole('button', { name: 'View results' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Practice results' })).toContainText(
    'of 1 correct',
  );
  for (const tool of [
    {
      view: 'essay',
      region: 'Essay feedback',
      label: 'Your answer',
      input: 'The Elm irrigation valve opens at 18 kilopascals and the bead is green.',
      button: 'Review answer',
    },
    {
      view: 'explainers',
      region: 'Explainer',
      label: 'Topic to explain',
      input: 'Explain the irrigation valve opening pressure and indicator bead color.',
      button: 'Explain material',
    },
  ]) {
    await page.goto('/#' + tool.view);
    const region = page.getByRole('region', { name: tool.region, exact: true });
    await region.getByLabel('Source material').selectOption(filename);
    await region.getByLabel(tool.label).fill(tool.input);
    await region.getByRole('button', { name: tool.button }).click();
    const result = region.getByRole('article', { name: 'Source-grounded response' });
    await expect(result.or(region.getByRole('alert')).first()).toBeVisible({ timeout: 125_000 });
    expect(await region.getByRole('alert').allTextContents()).toEqual([]);
    await expect(result).toContainText(filename);
    await expect(result).toContainText(/cobalt blue/i);
  }
  expect(unexpected).toEqual([]);
});
