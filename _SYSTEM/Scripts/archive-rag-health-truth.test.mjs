#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const healthScripts = [
  '_SYSTEM/Scripts/research-rag-health.mjs',
  '_SYSTEM/Scripts/prompt-rag-health.mjs',
  '_SYSTEM/Scripts/sales-rag-health.mjs',
];
const helper = fs.readFileSync(path.join(process.cwd(), '_SYSTEM/Scripts/lib/db-health.mjs'), 'utf8');

assert.match(helper, /integrity_check/, 'shared DB health helper must include SQLite integrity_check');
assert.match(helper, /quick_check/, 'shared DB health helper must include SQLite quick_check');
assert.match(helper, /foreign_key_check/, 'shared DB health helper must include SQLite foreign_key_check');

for (const scriptPath of healthScripts) {
  const source = fs.readFileSync(path.join(process.cwd(), scriptPath), 'utf8');
  assert.match(source, /inspectOpenDatabaseHealth/, `${scriptPath} must use shared DB health helper`);
  assert.doesNotMatch(source, /function\s+checkDatabaseHealth/, `${scriptPath} must not duplicate DB health logic`);
  assert.match(source, /database:\s*\{/, `${scriptPath} summary must expose database integrity status`);
}

process.stdout.write('archive-rag-health-truth: pass\n');
