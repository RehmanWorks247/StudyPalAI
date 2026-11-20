import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4184',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    permissions: ['microphone'],
  },
  webServer: {
    command: 'node e2e/serve-build.mjs',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
  },
});
