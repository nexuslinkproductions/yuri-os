#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const registry = readJson('_SYSTEM/config/artifact-registry.json');
const registryPaths = new Set((registry.artifacts || []).map((entry) => entry.path));

const requiredRegistryPaths = [
  '_SYSTEM/Scripts/claim-integrity-gate.mjs',
  '_SYSTEM/Scripts/yuri-council-claim-evidence.mjs',
  '_SYSTEM/Scripts/yuri-artifact-audit.mjs',
  '_SYSTEM/Scripts/yuri-canonical-memory-import.mjs',
  '_SYSTEM/Scripts/yuri-proving-run-repeatable.mjs',
  '_SYSTEM/Scripts/yuri-control-plane-schema.mjs',
  '_SYSTEM/Scripts/schemas/normalized-intent.schema.json',
  '_SYSTEM/Scripts/schemas/graph-plan.schema.json',
  '_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json',
  '_SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md',
];

for (const requiredPath of requiredRegistryPaths) {
  assert.ok(registryPaths.has(requiredPath), `artifact registry missing truth-promotion path: ${requiredPath}`);
}

const ladder = readJson('_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json');
const ladderStates = ladder.properties.states.prefixItems.map((entry) => entry.const);
assert.deepEqual(ladderStates, [
  'draft',
  'research',
  'fixture_ready',
  'runtime_tested',
  'operator_validated',
  'trusted',
  'deprecated',
]);

const provingRun = readText('_SYSTEM/Scripts/yuri-proving-run-repeatable.mjs');
assert.match(provingRun, /'--dry-run'/, 'repeatable proving run must dry-run canonical memory import');
assert.match(provingRun, /rollback-rehearsal/, 'repeatable proving run must rehearse rollback on a copied DB');
assert.match(provingRun, /production_db_unchanged/, 'repeatable proving run must verify production DB hash stability');

const artifactAudit = readText('_SYSTEM/Scripts/yuri-artifact-audit.mjs');
assert.match(artifactAudit, /promotion-gate/, 'artifact audit must keep promotion-gate command');
assert.match(artifactAudit, /canonical_memory_gate/, 'artifact audit must emit canonical memory gate decisions');
assert.match(artifactAudit, /Raw source prose remains tainted/i, 'artifact audit must preserve raw-source taint boundary');

const claimGate = readText('_SYSTEM/Scripts/claim-integrity-gate.mjs');
assert.match(claimGate, /HIGH_RISK_TERMS/, 'claim integrity gate must define high-risk claim terms');
assert.match(claimGate, /PROMOTION_STATES/, 'claim integrity gate must recognize canonical promotion states');

const procedure = readText('_SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md');
for (const phrase of [
  'Fast claim language gate',
  'Advisory claim extraction',
  'Artifact and reference proof path',
  'Promotion ladder mapping',
  'Canonical memory import',
  'No registry write-time enforcement exists in this tranche',
  'No promotion ladder runtime migration is performed in this tranche',
  'Do not run canonical memory writes automatically',
]) {
  assert.match(procedure, new RegExp(escapeRegex(phrase)), `procedure missing phrase: ${phrase}`);
}

for (const command of [
  ['node', '_SYSTEM/Scripts/claim-integrity-gate.test.mjs'],
  ['node', '_SYSTEM/Scripts/claim-integrity-gate.mjs', '--path', '_SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md', '--json'],
  ['node', '_SYSTEM/Scripts/yuri-council-claim-evidence.test.mjs'],
  ['node', '_SYSTEM/Scripts/yuri-artifact-audit.test.mjs'],
  ['node', '_SYSTEM/Scripts/yuri-canonical-memory-import.test.mjs'],
  ['node', '_SYSTEM/Scripts/yuri-control-plane-schema.test.mjs'],
  ['node', '_SYSTEM/Scripts/shintai-dispatch.test.mjs'],
  ['node', '_SYSTEM/Scripts/artifact-registry.mjs', '--validate'],
]) {
  run(command);
}

process.stdout.write('yuri-truth-promotion-pipeline: pass\n');

function run(command) {
  const [binary, ...args] = command;
  const result = spawnSync(binary === 'node' ? process.execPath : binary, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${command.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
