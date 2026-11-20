import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const artifacts = [
  'packages/api-contract/openapi.json',
  'packages/api-client/src/generated/schema.ts',
];
const before = artifacts.map((file) => readFileSync(file, 'utf8'));
const result = spawnSync('pnpm', ['api:generate'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const changed = artifacts.filter((file, index) => readFileSync(file, 'utf8') !== before[index]);
if (changed.length > 0) {
  console.error(
    `Generated artifacts were stale: ${changed.join(', ')}. Review and commit regeneration.`,
  );
  process.exit(1);
}
console.log('OpenAPI and generated client match the API implementation.');
