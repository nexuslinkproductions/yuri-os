#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyArtifactPath,
  createRepositoryPathPresence,
  loadArtifactRegistry,
  validateArtifactRegistry,
} from './artifact-registry.mjs';

const CONTEXT_REGISTRY = JSON.parse(readFileSync('_SYSTEM/context/context-registry.json', 'utf8'));

test('artifact registry validates current durable seed', () => {
  const result = validateArtifactRegistry();

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.errors.length, 0);
  assert.ok(result.artifactCount >= 10);
  assert.ok(result.placementRuleCount >= 10);
});

test('artifact registry classifies canonical future destinations', () => {
  const registry = loadArtifactRegistry();

  assert.equal(classifyArtifactPath('_SYSTEM/docs/NEW_PLAN.md', registry).ruleId, 'system-doc');
  assert.equal(classifyArtifactPath('_SYSTEM/Scripts/new-tool.mjs', registry).ruleId, 'system-script');
  assert.equal(classifyArtifactPath('_SYSTEM/context/new-packet.md', registry).ruleId, 'context-layer');
  assert.equal(classifyArtifactPath('_SYSTEM/reports/new-report.md', registry).ruleId, 'report');
  assert.equal(classifyArtifactPath('skills/new-skill/SKILL.md', registry).ruleId, 'skill');
  assert.equal(classifyArtifactPath('.agents/new-agent.json', registry).ruleId, 'agent-assembly');
  assert.equal(classifyArtifactPath('01_PROJECTS/client/brief.md', registry).ruleId, 'active-project');
});

test('artifact registry fails closed on protected paths', () => {
  const registry = loadArtifactRegistry();
  const envResult = classifyArtifactPath('.env', registry);
  const nodeModulesResult = classifyArtifactPath('node_modules/package/index.js', registry);
  const claudeHistoryResult = classifyArtifactPath('.claude/history/session.jsonl', registry);

  assert.equal(envResult.classification, 'protected_surface');
  assert.equal(envResult.protected, true);
  assert.equal(nodeModulesResult.classification, 'protected_surface');
  assert.equal(claudeHistoryResult.classification, 'protected_surface');
});

test('artifact registry active seed stays YURI-owned', () => {
  const registry = loadArtifactRegistry();
  const activeArtifacts = registry.artifacts.filter((artifact) => artifact.status !== 'retired');

  assert.equal(activeArtifacts.some((artifact) => artifact.class === 'retired_provider_adapter'), false);
  assert.equal(activeArtifacts.every((artifact) => artifact.storageRule && artifact.rebuildRule), true);
});

test('artifact registry covers cybersecurity context packet paths', () => {
  const registry = loadArtifactRegistry();
  const registered = new Set(registry.artifacts.map((artifact) => artifact.path));
  const cybersecurity = CONTEXT_REGISTRY.packets.find((packet) => packet.id === 'cybersecurity');
  const missing = cybersecurity.paths.filter((packetPath) => !registered.has(packetPath));

  assert.deepEqual(missing, []);
});

test('artifact registry CLI emits valid JSON', () => {
  const stdout = execFileSync(process.execPath, ['_SYSTEM/Scripts/artifact-registry.mjs', '--classify', '_SYSTEM/docs/example.md'], {
    encoding: 'utf8',
  });
  const result = JSON.parse(stdout);

  assert.equal(result.classification, 'placement_rule');
  assert.equal(result.ruleId, 'system-doc');
});

test('repository path presence accepts only sparse-index omissions when the path is absent', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'artreg-presence-'));
  const states = new Map([
    ['_SYSTEM/docs/sparse.md', 'S'],
    ['_SYSTEM/docs/missing.md', 'H'],
    ['_SYSTEM/Scripts/yuri/tool.mjs', 'S'],
  ]);
  const pathExists = createRepositoryPathPresence(root, states);

  assert.equal(pathExists('_SYSTEM/docs/sparse.md'), true);
  assert.equal(pathExists('_SYSTEM/Scripts/yuri/'), true);
  assert.equal(pathExists('_SYSTEM/docs/missing.md'), false);
  assert.equal(pathExists('_SYSTEM/docs/untracked.md'), false);
  assert.equal(pathExists('/tmp'), false);
  assert.equal(pathExists('../../../tmp'), false);
  assert.equal(pathExists('foo/../.env'), false);
  assert.equal(pathExists('./_SYSTEM/docs/sparse.md'), false);
  rmSync(root, { recursive: true, force: true });
});

test('artifact registry rejects noncanonical and out-of-root artifact paths', () => {
  const registry = loadArtifactRegistry();
  registry.artifacts.push(
    {
      path: '/tmp', type: 'script', class: 'system_control_plane', owner: 'YURI', status: 'planned',
      storageRule: 'invalid fixture', rebuildRule: 'invalid fixture', protected: false,
    },
    {
      path: 'foo/../.env', type: 'script', class: 'system_control_plane', owner: 'YURI', status: 'planned',
      storageRule: 'invalid fixture', rebuildRule: 'invalid fixture', protected: false,
    },
  );
  const result = validateArtifactRegistry(registry);

  assert.ok(result.errors.includes('/tmp must be a canonical repository-relative path'));
  assert.ok(result.errors.includes('foo/../.env must be a canonical repository-relative path'));
});

test('must-register checks sparse-indexed durable files without materializing the zone', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'artreg-index-zone-'));
  const result = validateArtifactRegistry(zoneRegistry(), {
    repoRoot: root,
    folderClasses: new Set(),
    indexPathStates: new Map([['_SYSTEM/Scripts/math/hidden.mjs', 'S']]),
  });

  assert.ok(result.errors.some((error) => error.includes('hidden.mjs')));
  rmSync(root, { recursive: true, force: true });
});

// --- attack regressions: must-register zone enforcement (recursive / ext / symlink) ---
function zoneRegistry() {
  return {
    schemaVersion: 1,
    artifactTypes: ['script', 'test', 'config', 'doc', 'report', 'folder'],
    artifacts: [],
    placementRules: [],
    mustRegisterPrefixes: ['_SYSTEM/Scripts/math/'],
  };
}
function makeZone() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'artreg-'));
  mkdirSync(path.join(root, '_SYSTEM/Scripts/math'), { recursive: true });
  return root;
}

test('must-register flags an unregistered file in a SUBDIRECTORY (recursive scan)', () => {
  const root = makeZone();
  mkdirSync(path.join(root, '_SYSTEM/Scripts/math/experiments'), { recursive: true });
  writeFileSync(path.join(root, '_SYSTEM/Scripts/math/experiments/rogue.mjs'), 'export const x=1;\n');
  const result = validateArtifactRegistry(zoneRegistry(), { repoRoot: root, folderClasses: new Set() });
  assert.ok(result.errors.some((e) => e.includes('must-register zone') && e.includes('experiments/rogue.mjs')));
  rmSync(root, { recursive: true, force: true });
});

test('must-register flags unregistered .js/.py/.json (broadened extensions)', () => {
  const root = makeZone();
  for (const name of ['rogue.js', 'rogue.py', 'rogue.json']) {
    writeFileSync(path.join(root, '_SYSTEM/Scripts/math', name), 'x\n');
  }
  const result = validateArtifactRegistry(zoneRegistry(), { repoRoot: root, folderClasses: new Set() });
  for (const name of ['rogue.js', 'rogue.py', 'rogue.json']) {
    assert.ok(result.errors.some((e) => e.includes(name)), `${name} must be flagged`);
  }
  rmSync(root, { recursive: true, force: true });
});

test('must-register flags an unregistered durable file reached via SYMLINK', () => {
  const root = makeZone();
  const target = path.join(root, 'real_target.mjs');
  writeFileSync(target, 'export const x=1;\n');
  symlinkSync(target, path.join(root, '_SYSTEM/Scripts/math/rogue_link.mjs'));
  const result = validateArtifactRegistry(zoneRegistry(), { repoRoot: root, folderClasses: new Set() });
  assert.ok(result.errors.some((e) => e.includes('rogue_link.mjs')));
  rmSync(root, { recursive: true, force: true });
});

test('must-register accepts a registered file and still ignores test files', () => {
  const root = makeZone();
  writeFileSync(path.join(root, '_SYSTEM/Scripts/math/ok.mjs'), 'export const x=1;\n');
  writeFileSync(path.join(root, '_SYSTEM/Scripts/math/ok.test.mjs'), 'export const x=1;\n');
  const reg = zoneRegistry();
  reg.artifacts.push({ path: '_SYSTEM/Scripts/math/ok.mjs', type: 'script', class: 'x', owner: 'y', status: 'planned', storageRule: 's', rebuildRule: 'r' });
  const result = validateArtifactRegistry(reg, { repoRoot: root, folderClasses: new Set() });
  assert.ok(!result.errors.some((e) => e.includes('must-register zone')));
  rmSync(root, { recursive: true, force: true });
});
