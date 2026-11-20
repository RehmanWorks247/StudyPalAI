import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { offlineShell } from './build-tools/offline-shell.ts';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, 'API_PORT');
  const apiPort = Number(process.env.API_PORT ?? env.API_PORT ?? '3001');

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  return {
    plugins: [react(), tailwindcss(), offlineShell()],
    envDir,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rolldownOptions: {
        output: {
          assetFileNames: (asset) =>
            asset.names.includes('eng.traineddata.gz')
              ? 'assets/ocr/[hash]/eng.traineddata.gz'
              : 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
