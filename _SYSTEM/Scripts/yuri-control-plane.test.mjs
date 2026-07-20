import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildConstraintBlock,
  classifyTaskTierHint,
  loadEvidenceGate,
  preflightControlPlane,
} from './yuri-control-plane.mjs';

test('Gate 0 loads required control-plane evidence before Shintai dispatch', () => {
  const gate = loadEvidenceGate('critical Rick harness Shintai guardrail supercharge', {
    maxBytes: 12_000,
  });

  assert.equal(gate.ok, true);
  assert.deepEqual(gate.missing, []);
  assert.deepEqual(gate.requiredMissing, []);
  assert.deepEqual(gate.blocked, []);
  for (const requiredId of ['yuri-memory-index', 'extraction-sprint-template']) {
    assert.ok(gate.loaded.some((entry) => entry.id === requiredId), `${requiredId} should load`);
  }
  for (const registryId of ['provider-route-registry', 'sol-moe-routing-policy']) {
    assert.ok(gate.loaded.some((entry) => entry.id === registryId), `${registryId} should load`);
    assert.ok(gate.constraints.requiredCoreIds.includes(registryId), `${registryId} should be required`);
  }
  assert.deepEqual(gate.constraints.superauditPreflightBindings, [{
    role: 'worker',
    use: 'evidence-preflight',
    tier: 'cheap',
    model: 'opencode-go/mimo-v2.5',
    routeId: 'mimo-v2.5.opencode',
    agentId: 'mure-artificer-mimo25',
    surface: 'omp-native',
    status: 'canary-proven',
    mayExecuteWorkerTasks: true,
    maySpawn: false,
    registryPath: '_SYSTEM/config/provider-route-registry.json',
    policyPath: '_SYSTEM/config/sol-moe-routing-policy.json',
  }]);
  assert.equal(gate.constraints.taskTierHint, 'critical');
  // NIM lanes were retired in the Mimo migration: ACTIVE_NIM_LANES is now empty and the dead set
  // carries the retired NVIDIA/Kimi reasoning lanes (nemotron-3-ultra-550b-a55b, kimi-k2.6).
  assert.deepEqual(gate.constraints.activeNimLanes, []);
  assert.ok(gate.constraints.deadNimLanes.includes('nemotron-3-ultra-550b-a55b'));
  assert.ok(gate.constraints.deadNimLanes.includes('kimi-k2.6'));
  assert.ok(gate.warnings.every((entry) => entry.id !== 'memory-rag-skill-research'));
});

test('Gate 0 fails closed when required evidence is missing', () => {
  const gate = loadEvidenceGate('Shintai dispatch', {
    coreFiles: [{ id: 'missing-required', path: '_SYSTEM/docs/DOES_NOT_EXIST.md', required: true }],
    optionalFiles: [],
  });

  assert.equal(gate.ok, false);
  assert.deepEqual(gate.missing.map((entry) => entry.id), ['missing-required']);
});

test('Gate 0 fails closed when task-required optional evidence is not loaded', () => {
  const gate = loadEvidenceGate('Shintai memory RAG self-improvement dispatch', {
    optionalFiles: [],
  });

  assert.equal(gate.ok, false);
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'yuri-memory-index'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'extraction-sprint-template'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'memory-rag-skill-research'));
});

test('Gate 0 loads cyber evidence before cyber Shintai dispatch', () => {
  const gate = loadEvidenceGate('critical cyber threat intelligence Upgreat sprint', {
    maxBytes: 12_000,
  });

  assert.equal(gate.ok, true);
  assert.deepEqual(gate.requiredMissing, []);
  for (const requiredId of [
    'cyber-company-goal',
    'cyber-intel-matrix',
    'cyber-intel-ingestion-protocol',
    'threat-intel-kernel-source',
    'security-lens-source',
    'cyber-lab-harness-source',
    'cyber-lab-runner-source',
    'cyber-guardrail-proof-source',
    'cyber-pilot-pack-source',
    'cyber-capability-audit',
    'cyber-research-sprint',
  ]) {
    assert.ok(gate.loaded.some((entry) => entry.id === requiredId), `${requiredId} should load`);
    assert.ok(gate.constraints.requiredEvidenceIds.includes(requiredId), `${requiredId} should be required`);
  }
});

test('Gate 0 fails closed when cyber-required evidence is not loaded', () => {
  const gate = loadEvidenceGate('critical cyber threat intelligence Upgreat sprint', {
    optionalFiles: [],
  });

  assert.equal(gate.ok, false);
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'cyber-intel-matrix'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'threat-intel-kernel-source'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'security-lens-source'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'cyber-lab-harness-source'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'cyber-lab-runner-source'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'cyber-guardrail-proof-source'));
  assert.ok(gate.requiredMissing.some((entry) => entry.id === 'cyber-pilot-pack-source'));
});

test('Gate 0 blocks protected evidence paths', () => {
  const protectedPath = ['.claude', 'state', 'pulse-bus.jsonl'].join('/');
  const gate = loadEvidenceGate('Shintai dispatch', {
    coreFiles: [{ id: 'protected-required', path: protectedPath, required: true }],
    optionalFiles: [],
  });

  assert.equal(gate.ok, false);
  assert.deepEqual(gate.blocked.map((entry) => entry.id), ['protected-required']);
});

test('control-plane constraint block carries current authority and lane policy', () => {
  const preflight = preflightControlPlane('supercharge YURI control plane', {
    maxBytes: 8000,
  });
  const block = buildConstraintBlock(preflight);

  assert.equal(preflight.ok, true);
  assert.match(block, /Codex\/main assembles/);
  assert.match(block, /cyber-intel-matrix/);
  // Dead NIM line now reflects the retired NVIDIA/Kimi reasoning lanes post-Mimo migration.
  assert.match(block, /dead_nim=.*nemotron-3-ultra-550b-a55b/);
  assert.match(block, /dead_nim=.*kimi-k2\.6/);
  assert.match(block, /no DeepSeek CLI --tools forcing/);
  assert.match(block, /worker_preflight=.*mimo-v2\.5\.opencode/);
  assert.doesNotMatch(block, /haiku/i);
  assert.doesNotMatch(block, /codex-spark default/i);
});

test('task tier hint treats harness, memory, automation, and guardrails as critical', () => {
  assert.equal(classifyTaskTierHint('memory automation guardrail forensic sprint'), 'critical');
  assert.equal(classifyTaskTierHint('small typo'), 'standard');
});
