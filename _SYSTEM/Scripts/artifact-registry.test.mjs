#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyArtifactPath,
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
