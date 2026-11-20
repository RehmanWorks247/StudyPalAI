import { fileURLToPath } from 'node:url';
import { createLocalWebServer } from '../../../scripts/local-web-server.mjs';
const server = await createLocalWebServer({
  directory: process.env.STUDYPAL_WEB_DIST || fileURLToPath(new URL('../dist', import.meta.url)),
  api: 'http://127.0.0.1:' + Number(process.env.API_PORT ?? 3001),
});
server.listen(4184, '127.0.0.1');

const close = () => {
  server.closeAllConnections();
  server.close();
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
