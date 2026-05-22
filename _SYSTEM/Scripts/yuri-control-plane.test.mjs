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
  for (const requiredId of ['shintai-roster', 'yuri-memory-index', 'extraction-sprint-template']) {
    assert.ok(gate.loaded.some((entry) => entry.id === requiredId), `${requiredId} should load`);
  }
  assert.equal(gate.constraints.taskTierHint, 'critical');
  assert.ok(gate.constraints.activeNimLanes.includes('nvidia-nemotron-120b'));
  assert.ok(gate.constraints.deadNimLanes.includes('nvidia-nemotron'));
  assert.ok(gate.warnings.every((entry) => entry.id !== 'memory-rag-skill-research'));
  assert.ok(gate.constraints.requiredEvidenceIds.includes('shintai-roster'));
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
  assert.match(block, /dead_nim=.*nvidia-nemotron/);
  assert.match(block, /no DeepSeek CLI --tools forcing/);
  assert.doesNotMatch(block, /codex-spark default/i);
});

test('task tier hint treats harness, memory, automation, and guardrails as critical', () => {
  assert.equal(classifyTaskTierHint('memory automation guardrail forensic sprint'), 'critical');
  assert.equal(classifyTaskTierHint('small typo'), 'standard');
});
