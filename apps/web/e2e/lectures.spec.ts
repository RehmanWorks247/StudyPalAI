import { createFirstSet } from './fixtures/study-set';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const fixture = fileURLToPath(new URL('./fixtures/spoken-digits.wav', import.meta.url));
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' + fixture,
    ],
  },
  permissions: ['microphone'],
});

test('records a lecture, restores the audio, and transcribes its speech offline', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await createFirstSet(page);
  await page.goto('/#record');
  await page.getByRole('button', { name: 'Install English model' }).click();
  await expect(page.getByText('English speech model installed on this device.')).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: 'Create Live Lecture' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record lecture' });
  await dialog.getByLabel('Lecture title').fill('Spoken digits');
  await dialog.getByRole('button', { name: 'Start recording' }).click();
  await expect(dialog.getByText('00:04')).toBeVisible({ timeout: 12_000 });
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dialog.getByText('Recording paused')).toBeVisible();
  await dialog.getByRole('button', { name: 'Resume' }).click();
  await dialog.getByRole('button', { name: 'Finish recording' }).click();
  await dialog.getByRole('button', { name: 'Save recording' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: /Spoken digits/ }).click();
  const audio = page.getByLabel('Play Spoken digits');
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await audio.evaluate(async (element) => {
    if (element instanceof HTMLAudioElement) {
      await element.play();
      element.pause();
    }
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download audio' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Spoken digits\.(webm|ogg|m4a)$/);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Transcribe on device' }).click();
  await expect(page.getByLabel('Transcript or lecture notes')).toHaveValue(/zero/, {
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Add to study materials' }).click();
  await expect(page.getByText('Transcript added to study materials.')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /Spoken digits.*\d:\d\d/ }).click();
  await expect(page.getByLabel('Transcript or lecture notes')).toHaveValue(/zero/);
  await page.getByRole('button', { name: 'Remove recording' }).click();
  await page.getByRole('button', { name: 'Delete recording' }).click();
  await expect(page.getByText('No recordings in this study set yet.')).toBeVisible();
});

test('backs up microphone audio and notes to paired PostgreSQL and restores in a second browser', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!process.env.STUDYPAL_E2E_PAIR_KEY, 'Run the local PostgreSQL browser suite.');
  test.setTimeout(100000);
  const key = process.env.STUDYPAL_E2E_PAIR_KEY!;
  async function pair(target: typeof page) {
    await target.goto(baseURL ?? '/');
    await target.getByRole('button', { name: 'Connect PostgreSQL' }).click();
    await target.getByLabel('Pairing key').fill(key);
    await target.getByRole('button', { name: 'Pair browser' }).click();
    await expect(target.getByRole('dialog').getByLabel('Pairing key')).toHaveCount(0);
    await target.keyboard.press('Escape');
  }
  await pair(page);
  if (await page.getByRole('textbox', { name: 'Study set name' }).isVisible())
    await createFirstSet(page);
  await page.goto('/#record');
  await page.getByRole('button', { name: 'Create Live Lecture' }).click();
  const recorder = page.getByRole('dialog');
  const title = 'Backup sample ' + crypto.randomUUID().slice(0, 8);
  await recorder.getByLabel('Lecture title').fill(title);
  await recorder.getByRole('button', { name: 'Start recording' }).click();
  await recorder.getByRole('button', { name: 'Finish recording' }).waitFor();
  await page.waitForTimeout(1400);
  await recorder.getByRole('button', { name: 'Finish recording' }).click();
  await recorder.getByRole('button', { name: 'Save recording' }).click();
  const notes = 'Restored lecture notes';
  await page.getByLabel('Transcript or lecture notes').fill(notes);
  await page.getByRole('button', { name: 'Save notes' }).click();
  await page.getByRole('button', { name: 'Back up recording' }).click();
  await expect(
    page.getByText('Audio and saved notes backed up to local PostgreSQL.'),
  ).toBeVisible();
  const second = await browser.newContext();
  try {
    const restored = await second.newPage();
    await pair(restored);
    await restored.goto((baseURL ?? '') + '/#record');
    await restored.getByRole('button', { name: 'Restore recordings', exact: true }).click();
    const entry = restored.locator('.lecture-backup-entry').filter({ hasText: title });
    await entry.getByRole('button', { name: 'Restore recording', exact: true }).click();
    await expect(restored.getByLabel('Transcript or lecture notes')).toHaveValue(notes);
    const audio = restored.getByLabel('Play ' + title);
    await audio.evaluate((el) => {
      if (el instanceof HTMLAudioElement) return el.play();
    });
    await expect(restored.getByText('Recording restored on this device.')).toBeVisible();
    await entry.getByRole('button', { name: 'Remove backup' }).click();
    await entry.getByRole('button', { name: 'Delete backup' }).click();
    await expect(entry).toHaveCount(0);
    await restored.reload();
    await restored.getByRole('button', { name: new RegExp(title) }).click();
    await expect(restored.getByLabel('Transcript or lecture notes')).toHaveValue(notes);
  } finally {
    await second.close();
  }
});
