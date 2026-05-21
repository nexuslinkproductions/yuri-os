import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CORE_EVIDENCE_FILES,
  buildConstraintBlock,
  classifyTaskTierHint,
  loadEvidenceGate,
  preflightControlPlane,
} from './yuri-control-plane.mjs';

test('Gate 0 loads required control-plane evidence before Shintai dispatch', () => {
  const gate = loadEvidenceGate('critical Rick harness Shintai guardrail supercharge', {
    optionalFiles: [],
    maxBytes: 12_000,
  });

  assert.equal(gate.ok, true);
  assert.deepEqual(gate.missing, []);
  assert.deepEqual(gate.blocked, []);
  assert.deepEqual(
    CORE_EVIDENCE_FILES.map((entry) => entry.id),
    gate.loaded.map((entry) => entry.id),
  );
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
    optionalFiles: [],
    maxBytes: 8000,
  });
  const block = buildConstraintBlock(preflight);

  assert.equal(preflight.ok, true);
  assert.match(block, /Codex\/main assembles/);
  assert.match(block, /dead_nim=.*nvidia-nemotron/);
  assert.match(block, /no DeepSeek CLI --tools forcing/);
  assert.doesNotMatch(block, /codex-spark default/i);
});

test('task tier hint treats harness, memory, automation, and guardrails as critical', () => {
  assert.equal(classifyTaskTierHint('memory automation guardrail forensic sprint'), 'critical');
  assert.equal(classifyTaskTierHint('small typo'), 'standard');
});
