import { expect, type Page } from '@playwright/test';

export async function createFirstSet(page: Page, name = 'Field course') {
  await page.getByRole('textbox', { name: 'Study set name' }).fill(name);
  await page.getByRole('button', { name: 'Create study set', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

export async function uploadLabNotes(page: Page) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  await dialog.getByLabel('Choose materials').setInputFiles({
    name: 'Lab observations.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Measurement and instruments\n\nEach measurement has an uncertainty. Calibrate instruments before recording data. Repeat readings to estimate their spread.\n\nGraphical analysis\n\nThe gradient describes change in the dependent variable.',
    ),
  });
  await dialog.getByText('Lab observations.txt', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
}
