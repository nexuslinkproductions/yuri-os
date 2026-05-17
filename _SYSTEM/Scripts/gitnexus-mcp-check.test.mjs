#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['Scripts/gitnexus-mcp-check.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /^GITNEXUS_MCP_CHECK_PASS tools=\d+/);

console.log('gitnexus-mcp-check: pass');
