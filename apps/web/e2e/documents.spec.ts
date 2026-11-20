import { createFirstSet } from './fixtures/study-set';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// A complete PDF with a text layer. Valid offsets exercise the browser's bundled PDF worker.
function textPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f '];
  objects.forEach((obj, i) => {
    offsets.push(`${String(pdf.length).padStart(10, '0')} 00000 n `);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n${offsets.join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

test('imports a PDF and Markdown offline, saves annotations, and reads them after reload', async ({
  page,
}) => {
  const passage = 'Solar energy is converted into glucose by plants.';
  await page.goto('/');
  await createFirstSet(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  await dialog.getByLabel('Choose materials').setInputFiles([
    { name: 'Plant physiology.pdf', mimeType: 'application/pdf', buffer: textPdf(passage) },
    {
      name: 'Leaf tissue.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Mesophyll cells contain chloroplasts.'),
    },
  ]);
  await expect(dialog.getByText('2 materials selected')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
  await page.locator('button[title="Plant physiology.pdf"]').click();
  const text = page.getByLabel('Document text', { exact: true });
  await expect(text).toHaveText(passage);
  await text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(text.locator('mark')).toHaveText(passage);
  await page.getByRole('button', { name: 'Show notes' }).click();
  await page.getByRole('textbox', { name: 'My notes' }).fill('Ask about energy storage.');
  await page.reload();
  await page.locator('button[title="Plant physiology.pdf"]').click();
  await expect(page.getByLabel('Document text', { exact: true }).locator('mark')).toHaveText(
    passage,
  );
  await page.getByRole('button', { name: 'Show notes' }).click();
  await expect(page.getByRole('textbox', { name: 'My notes' })).toHaveValue(
    'Ask about energy storage.',
  );
  await page.locator('button[title="Leaf tissue.md"]').click();
  await expect(page.getByLabel('Document text', { exact: true })).toHaveText(
    'Mesophyll cells contain chloroplasts.',
  );
});

test('rejects malformed and unsupported documents without adding materials', async ({ page }) => {
  await page.goto('/');
  await createFirstSet(page);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  await dialog.getByLabel('Choose materials').setInputFiles([
    { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken') },
    { name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from('data') },
  ]);
  await expect(dialog.getByRole('alert')).toContainText('broken.pdf');
  await expect(dialog.getByRole('alert')).toContainText('scan.png');
  await expect(dialog.getByRole('button', { name: 'Add materials', exact: true })).toHaveCount(0);
});

test('imports real Word and PowerPoint packages and CSV together entirely offline', async ({
  page,
}) => {
  await page.goto('/');
  await createFirstSet(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  const files = ['lab-notes.docx', 'lab-slides.pptx', 'observations.csv'];
  await dialog
    .getByLabel('Choose materials')
    .setInputFiles(
      files.map((name) => fileURLToPath(new URL('./fixtures/' + name, import.meta.url))),
    );
  await expect(dialog.getByText('3 materials selected')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
  for (const [name, text] of [
    ['lab-notes.docx', 'Label the graduated cylinder before filling.'],
    ['lab-slides.pptx', 'Repeat the reading three times. Read the lower meniscus at eye level.'],
    ['observations.csv', 'trial,volume_ml'],
  ]) {
    await page.locator('button[title="' + name + '"]').click();
    await expect(page.getByLabel('Document text', { exact: true })).toContainText(text!);
  }
});

test('recognizes printed English from photos and a PDF without a text layer after disconnecting', async ({
  page,
}) => {
  await page.goto('/');
  await createFirstSet(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add materials' });
  const materials = [
    ['printed-lab.png', 'Water freezes at zero degrees'],
    ['printed-lab.jpg', 'Stir the mixture slowly'],
    ['scanned-lab.pdf', 'Measure the volume twice'],
  ] as const;
  await dialog
    .getByLabel('Choose materials')
    .setInputFiles(
      materials.map(([name]) => fileURLToPath(new URL('./fixtures/' + name, import.meta.url))),
    );
  await expect(dialog.getByText('3 materials selected')).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Add materials', exact: true }).click();
  for (const [name, text] of materials) {
    await page.locator('button[title="' + name + '"]').click();
    await expect(page.getByLabel('Document text', { exact: true })).toContainText(text);
  }
});
