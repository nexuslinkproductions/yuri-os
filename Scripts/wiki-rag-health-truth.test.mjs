#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'Scripts/wiki-rag-health.mjs'), 'utf8');

assert.match(source, /integrity_check/, 'wiki RAG health must include SQLite integrity_check');
assert.match(source, /quick_check/, 'wiki RAG health must include SQLite quick_check');
assert.match(source, /foreign_key_check/, 'wiki RAG health must include SQLite foreign_key_check');
assert.match(source, /database:\s*\{/, 'wiki RAG health summary must expose database integrity status');

process.stdout.write('wiki-rag-health-truth: pass\n');
