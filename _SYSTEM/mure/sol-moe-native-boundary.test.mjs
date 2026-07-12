import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('production OMP dispatch modules contain no legacy OpenClaw dispatch symbols', () => {
  const files = [
    'sol-moe-native-dispatch.mjs',
    'sol-moe-parent-adapter.mjs',
    'native-dispatch-shadow.mjs',
    'sol-moe-run.mjs',
    'omp-task-adapter.mjs',
  ];
  const forbidden = [
    /node:child_process/,
    /\bexecFile\b/,
    /\bsessions_spawn\b/,
    /\bchildSessionKey\b/,
    /\brunId\b/,
    /\bresolvedModel\b/,
    /\bOpenClaw\b/,
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(HERE, file), 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains forbidden legacy symbol ${pattern}`);
    }
  }
});
