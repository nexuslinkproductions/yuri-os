#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), '_SYSTEM/Scripts/wiki-rag-health.mjs'), 'utf8');
const helper = fs.readFileSync(path.join(process.cwd(), '_SYSTEM/Scripts/lib/db-health.mjs'), 'utf8');

assert.match(source, /inspectOpenDatabaseHealth/, 'wiki RAG health must use shared DB health helper');
assert.doesNotMatch(source, /function\s+checkDatabaseHealth/, 'wiki RAG health must not duplicate DB health logic');
assert.match(helper, /integrity_check/, 'shared DB health helper must include SQLite integrity_check');
assert.match(helper, /quick_check/, 'shared DB health helper must include SQLite quick_check');
assert.match(helper, /foreign_key_check/, 'shared DB health helper must include SQLite foreign_key_check');
assert.match(source, /database:\s*\{/, 'wiki RAG health summary must expose database integrity status');

process.stdout.write('wiki-rag-health-truth: pass\n');
