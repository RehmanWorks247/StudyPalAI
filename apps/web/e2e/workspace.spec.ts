import { createFirstSet, uploadLabNotes } from './fixtures/study-set';
import { expect, test, type Page } from '@playwright/test';

async function rename(page: Page, name: string) {
  await page.getByRole('button', { name: 'Study set settings', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Study set name').fill(name);
  await form.getByRole('button', { name: 'Save changes' }).click();
}

test('builds a dated study plan, tracks progress offline, clones materials and serves learning tools', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/');
  await createFirstSet(page);
  await uploadLabNotes(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'View Full Study Plan' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Plan name').fill('Final exam revision');
  await form.getByLabel('Study mode').selectOption('Cram');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(/Cram · Target/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Reviewed' }).first().check();
  await page.getByLabel('Filter study plan').selectOption('Covered');
  await expect(page.getByRole('checkbox', { name: 'Reviewed' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Reviewed' }).first()).toBeChecked();
  await page.getByRole('button', { name: 'Read source' }).first().click();
  await expect(page.getByLabel('Document text', { exact: true })).toContainText('measurement');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Clone Set' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /\(copy\)/ })).toBeVisible();
  for (const name of [
    'Flashcards',
    'Arcade',
    'Audio Recap',
    'Explainers',
    'Essay Grader',
    'Mini Apps',
    'Test',
    'QuizFetch',
  ]) {
    await page.getByRole('button', { name: 'Practice & Activities' }).click();
    await page.locator('.practice-menu').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('pairs separate browsers with PostgreSQL, syncs offline edits and catches conflicts', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.STUDYPAL_E2E_PAIR_KEY,
    'Run with pnpm test:e2e:postgres for an isolated local owner.',
  );
  const key = process.env.STUDYPAL_E2E_PAIR_KEY!;
  async function pair(browserPage: Page) {
    await browserPage.goto(baseURL ?? '/');
    await browserPage.getByRole('button', { name: 'Connect PostgreSQL' }).click();
    await browserPage.getByLabel('Pairing key').fill(key);
    await browserPage.getByRole('button', { name: 'Pair browser' }).click();
  }
  await pair(page);
  const panel = page.getByRole('dialog', { name: 'Local workspace' });
  await expect(panel.getByRole('status')).toHaveText('PostgreSQL synced');
  await panel.getByRole('button', { name: 'Close Local workspace' }).click();
  if (await page.getByRole('textbox', { name: 'Study set name' }).isVisible())
    await createFirstSet(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  const name = 'PostgreSQL lab notes.txt';
  const passage = 'The timed pendulum completed sixteen cycles in twenty seconds.';
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'Add materials' });
  await upload
    .getByLabel('Choose materials')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(passage) });
  await upload.getByText(name, { exact: true }).waitFor();
  await upload.getByRole('button', { name: 'Add materials', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await rename(page, 'PostgreSQL physics lab');
  await expect(page.getByRole('button', { name: 'Saved in browser' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PostgreSQL physics lab' })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByRole('button', { name: 'PostgreSQL synced' })).toBeVisible();
  const ctx = await browser.newContext({ baseURL });
  try {
    const other = await ctx.newPage();
    await pair(other);
    other.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await expect(other.getByRole('heading', { name: 'PostgreSQL physics lab' })).toBeVisible();
    await other.locator('button[title="PostgreSQL lab notes.txt"]').click();
    await expect(other.getByLabel('Document text', { exact: true })).toHaveText(passage);
    await other.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await ctx.setOffline(true);
    await rename(other, 'Private pending edit');
    await rename(page, 'First browser edit');
    await expect(page.getByRole('button', { name: 'PostgreSQL synced' })).toBeVisible();
    await ctx.setOffline(false);
    await expect(other.getByRole('button', { name: 'Review copies' })).toBeVisible();
    await expect(other.getByRole('heading', { name: 'Private pending edit' })).toBeVisible();
    await other.getByRole('button', { name: 'Review copies' }).click();
    await other.getByRole('button', { name: 'Load database copy' }).click();
    await expect(other.getByRole('heading', { name: 'First browser edit' })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('resumes a flashcard deck and opens a quiz on the selected plan topic', async ({ page }) => {
  await page.goto('/');
  await createFirstSet(page);
  await uploadLabNotes(page);
  await page.getByRole('button', { name: 'Create a Flashcard Set', exact: true }).click();
  await page.getByRole('button', { name: 'Create flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  const next = await page.getByRole('main').getByRole('heading', { level: 2 }).innerText();
  await page.reload();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(next);
  await page.getByRole('button', { name: 'Study Plan', exact: true }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Plan name').fill('Review for Friday');
  await dialog.getByLabel('Study mode').selectOption('Cram');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  const topic = page.locator('.plan-step').first();
  const title = await topic.locator('summary').innerText();
  await topic.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByLabel('Topic (optional)')).toHaveValue(title);
  await expect(page.getByRole('combobox', { name: 'Source material', exact: true })).toHaveValue(
    'Lab observations.txt',
  );
});

test('restores an exported workspace using the offline mobile dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createFirstSet(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await rename(page, 'Mobile history');
  await page.getByRole('button', { name: 'Connect PostgreSQL' }).click();
  await page.getByText('Workspace backup', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download browser copy' }).click();
  const filepath = await (await downloaded).path();
  if (!filepath) throw new Error('Missing workspace export');
  await page.getByRole('button', { name: 'Close Local workspace' }).click();
  await rename(page, 'Current mobile edit');
  await page.getByRole('button', { name: 'Connect PostgreSQL' }).click();
  await page.getByText('Workspace backup', { exact: true }).click();
  await page.getByLabel('Restore workspace backup').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('valid StudyPal');
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByLabel('Restore workspace backup').setInputFiles(filepath);
  await expect(page.getByRole('heading', { level: 1, name: 'Mobile history' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mobile history' })).toBeVisible();
});

test('opens a fresh account with no subject data and retains the first named set across both routes', async ({
  page,
}) => {
  await page.goto('/local');
  await expect(page.getByRole('heading', { name: 'Create your first study set' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create study set' })).toBeDisabled();
  await createFirstSet(page, 'Coastal geography');
  await expect(page.getByText('0 Topics')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Coastal geography' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
});
