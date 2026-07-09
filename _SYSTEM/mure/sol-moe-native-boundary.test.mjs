import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('production Sol MoE modules contain no CLI or subprocess agent dispatch path', () => {
  const files = fs.readdirSync(HERE)
    .filter((name) => /^sol-moe-.*\.mjs$/.test(name) && !name.endsWith('.test.mjs'))
    .sort();
  const forbidden = [
    /node:child_process/,
    /\bexecFile\b/,
    /openclaw\s+agent/,
    /--session-key/,
    /['"]--message['"]/,
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(HERE, file), 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains forbidden native-dispatch bypass ${pattern}`);
    }
  }
});
