import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import type { AddressInfo } from 'node:net';

test('browser storage isolates the legacy workspace and two account owners, including recording bytes and sync revisions', async ({
  page,
}) => {
  const server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    plugins: [
      {
        name: 'isolated-storage-test',
        configureServer(s) {
          s.middlewares.use('/__storage-test', (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><title>StudyPal storage test</title>');
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    const origin = 'http://127.0.0.1:' + (server.httpServer!.address() as AddressInfo).port;
    await page.goto(origin + '/__storage-test');
    const result = await page.evaluate(async (path) => {
      const fixture: typeof import('./fixtures/account-storage') = await import(path);
      return fixture.verifyStorage();
    }, origin + '/e2e/fixtures/account-storage.ts');
    expect(result.fresh).toMatchObject({ sync: 0, lectures: [], audio: null, timer: null });
    expect(result.fresh.companion).not.toBe('Old browser workspace');
    for (const [copy, label] of [
      [result.local, 'Old browser workspace'],
      [result.a, 'Account A'],
      [result.b, 'Account B'],
    ] as const) {
      expect(copy).toEqual({
        companion: label,
        sync: 8,
        lectures: [label],
        audio: label,
        timer: label,
      });
    }
  } finally {
    await server.close();
  }
});
