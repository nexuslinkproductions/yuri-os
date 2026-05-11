#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['Scripts/backend-release-gate.mjs', '--dry-run', '--db', '/tmp/restored-candidate.db'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

const implicitLiveDb = spawnSync(process.execPath, ['Scripts/backend-release-gate.mjs', '--dry-run'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

const explicitLiveDb = spawnSync(process.execPath, ['Scripts/backend-release-gate.mjs', '--dry-run', '--allow-live-db'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.notEqual(implicitLiveDb.status, 0, 'release gate should refuse implicit live DB checks');
assert.match(
  `${implicitLiveDb.stdout}\n${implicitLiveDb.stderr}`,
  /BACKEND_RELEASE_GATE_FAIL.*--db <candidate> or --allow-live-db/,
  'live DB refusal should explain the explicit operator choice'
);

assert.equal(explicitLiveDb.status, 0, `explicit live DB dry run should pass:\n${explicitLiveDb.stdout}\n${explicitLiveDb.stderr}`);
assert.match(
  explicitLiveDb.stdout,
  /backend-db-check\.mjs --allow-live-db/,
  'release gate should forward explicit live DB override to DB check'
);

assert.equal(result.status, 0, `release gate dry run should pass:\n${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /BACKEND_RELEASE_GATE_DRY_RUN/, 'dry run should emit stable marker');
assert.match(result.stdout, /backend-db-check\.mjs --db \/tmp\/restored-candidate\.db/, 'release gate should include explicit DB candidate check');
assert.match(result.stdout, /backend-cors-hardening\.test\.mjs/, 'release gate should include backend smoke/CORS test');
assert.match(result.stdout, /backend-route-auth-matrix\.test\.mjs/, 'release gate should include route auth audit');
assert.match(result.stdout, /backend-db-readiness-migration-status\.test\.mjs/, 'release gate should include readiness migration test');
assert.match(result.stdout, /backend-db-readiness-recovery-metadata\.test\.mjs/, 'release gate should include readiness recovery metadata test');
assert.match(result.stdout, /backend-gitnexus-status-truth\.test\.mjs/, 'release gate should include GitNexus truth test');
assert.match(result.stdout, /gitnexus-mcp-check\.mjs/, 'release gate should include live GitNexus MCP probe');

process.stdout.write('backend-release-gate: pass\n');
