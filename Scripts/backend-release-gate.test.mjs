#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['Scripts/backend-release-gate.mjs', '--dry-run', '--db', '/tmp/restored-candidate.db'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.equal(result.status, 0, `release gate dry run should pass:\n${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /BACKEND_RELEASE_GATE_DRY_RUN/, 'dry run should emit stable marker');
assert.match(result.stdout, /backend-db-check\.mjs --db \/tmp\/restored-candidate\.db/, 'release gate should include explicit DB candidate check');
assert.match(result.stdout, /backend-cors-hardening\.test\.mjs/, 'release gate should include backend smoke/CORS test');
assert.match(result.stdout, /backend-route-auth-matrix\.test\.mjs/, 'release gate should include route auth audit');
assert.match(result.stdout, /backend-db-readiness-migration-status\.test\.mjs/, 'release gate should include readiness migration test');
assert.match(result.stdout, /backend-gitnexus-status-truth\.test\.mjs/, 'release gate should include GitNexus truth test');
assert.match(result.stdout, /gitnexus-mcp-check\.mjs/, 'release gate should include live GitNexus MCP probe');

process.stdout.write('backend-release-gate: pass\n');
