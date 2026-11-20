import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fileName = 'vosk-model-small-en-us-0.15.tar.gz';
const directory = new URL('../apps/web/public/speech-models/', import.meta.url);
const target = fileURLToPath(new URL(fileName, directory));
const expected = 'f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8';
const matches = (bytes) => createHash('sha256').update(bytes).digest('hex') === expected;

await mkdir(directory, { recursive: true });
const existing = await readFile(target).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
});
if (!existing || !matches(existing)) {
  const response = await fetch('https://ccoreilly.github.io/vosk-browser/models/' + fileName, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error('The English speech model download failed.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matches(bytes)) throw new Error('The speech model checksum does not match.');
  const temp = target + '.partial-' + process.pid;
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}
console.log('The verified English speech model is ready to serve.');
