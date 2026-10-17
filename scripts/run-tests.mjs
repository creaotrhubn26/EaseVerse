import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
async function findTests(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findTests(target));
    else if (entry.name.endsWith('.test.ts')) files.push(target);
  }
  return files.sort();
}
const tests = await findTests(path.join(root, 'tests'));
if (!tests.length) throw new Error('No test files found');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
