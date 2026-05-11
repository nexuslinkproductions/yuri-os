#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const healthScripts = [
  'Scripts/research-rag-health.mjs',
  'Scripts/prompt-rag-health.mjs',
];

for (const scriptPath of healthScripts) {
  const source = fs.readFileSync(path.join(process.cwd(), scriptPath), 'utf8');
  assert.match(source, /integrity_check/, `${scriptPath} must include SQLite integrity_check`);
  assert.match(source, /quick_check/, `${scriptPath} must include SQLite quick_check`);
  assert.match(source, /foreign_key_check/, `${scriptPath} must include SQLite foreign_key_check`);
  assert.match(source, /database:\s*\{/, `${scriptPath} summary must expose database integrity status`);
}

process.stdout.write('archive-rag-health-truth: pass\n');
