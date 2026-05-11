#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const missingDbPath = `/tmp/yuri-release-gate-missing-${process.pid}.db`;
const releaseGateSource = fs.readFileSync('Scripts/backend-release-gate.mjs', 'utf8');
const retiredIdentityPattern = new RegExp([
  ['exeo', 'flow'].join(''),
  ['exeo', '-flow'].join(''),
  ['exeo', ' flow'].join(''),
].join('|'), 'i');
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

const failedChild = spawnSync(process.execPath, ['Scripts/backend-release-gate.mjs', '--db', missingDbPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.notEqual(implicitLiveDb.status, 0, 'release gate should refuse implicit live DB checks');
assert.match(
  `${implicitLiveDb.stdout}\n${implicitLiveDb.stderr}`,
  /YURI_BACKEND_RELEASE_GATE_FAIL.*system=YURI_OS.*--db <candidate> or --allow-live-db/,
  'live DB refusal should explain the explicit operator choice'
);

assert.equal(explicitLiveDb.status, 0, `explicit live DB dry run should pass:\n${explicitLiveDb.stdout}\n${explicitLiveDb.stderr}`);
assert.match(explicitLiveDb.stdout, /YURI_BACKEND_RELEASE_GATE_DRY_RUN.*system=YURI_OS/, 'dry run should emit Yuri OS marker');
assert.match(
  explicitLiveDb.stdout,
  /backend-db-check\.mjs --allow-live-db/,
  'release gate should forward explicit live DB override to DB check'
);

assert.notEqual(failedChild.status, 0, 'release gate should fail when a child check fails');
assert.match(
  `${failedChild.stdout}\n${failedChild.stderr}`,
  /YURI_BACKEND_RELEASE_GATE_FAIL.*step=backend-db-check/,
  'release gate should identify the failed child step'
);

assert.equal(result.status, 0, `release gate dry run should pass:\n${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /YURI_BACKEND_RELEASE_GATE_DRY_RUN.*system=YURI_OS/, 'dry run should emit Yuri OS marker');
assert.doesNotMatch(result.stdout, retiredIdentityPattern, 'release gate output should not expose retired flow identity');
assert.match(result.stdout, /yuri-assimilation-guardrail/, 'release gate should include assimilation guardrail step');
assert.match(releaseGateSource, /yuri-exeoflow-assimilation\.test\.mjs/, 'release gate should invoke the assimilation guardrail script');
assert.match(result.stdout, /backend-db-check\.mjs --db \/tmp\/restored-candidate\.db/, 'release gate should include explicit DB candidate check');
assert.match(result.stdout, /backend-cors-hardening\.test\.mjs/, 'release gate should include backend smoke/CORS test');
assert.match(result.stdout, /backend-route-auth-matrix\.test\.mjs/, 'release gate should include route auth audit');
assert.match(result.stdout, /backend-telemetry-truth\.test\.mjs/, 'release gate should include telemetry truth test');
assert.match(result.stdout, /backend-observability-truth\.test\.mjs/, 'release gate should include observability truth test');
assert.match(result.stdout, /backend-db-readiness-migration-status\.test\.mjs/, 'release gate should include readiness migration test');
assert.match(result.stdout, /backend-db-readiness-recovery-metadata\.test\.mjs/, 'release gate should include readiness recovery metadata test');
assert.match(result.stdout, /backend-gitnexus-status-truth\.test\.mjs/, 'release gate should include GitNexus truth test');
assert.match(result.stdout, /wiki-rag-health-truth\.test\.mjs/, 'release gate should include wiki RAG health truth test');
assert.match(result.stdout, /archive-rag-health-truth\.test\.mjs/, 'release gate should include archive RAG health truth test');
assert.match(result.stdout, /rag-db-health-fixtures\.test\.mjs/, 'release gate should include fixture-backed RAG DB health test');
assert.match(result.stdout, /gitnexus-mcp-check\.mjs/, 'release gate should include live GitNexus MCP probe');

process.stdout.write('backend-release-gate: pass\n');
