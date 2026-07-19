import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransitions, DEFAULT_WEIGHTS, gateProposal } from '../energy-calibration-contract.mjs';
import { ATTACK_CLASSES, scenario, expectVeto } from './adversarial-probe.mjs';

test('fixture covers all five attack classes with aligned expectations', () => {
  assert.equal(scenario.length, expectVeto.length);
  const classes = new Set(scenario.map((row) => row.label.split(':')[1]));
  assert.deepEqual([...classes].sort(), [...ATTACK_CLASSES].sort());
  assert.ok(expectVeto.every((entry) => entry.shouldReject === true));
  assert.deepEqual(expectVeto.map((entry) => entry.vetoExpected), [false, false, false, false, false, true, true]);
});

test('default v3 weights reject every adversarial transition', () => {
  const run = evaluateTransitions(scenario, {
    scenario: 'adversarial-probe',
    runId: 'fixture-default',
    lane: '10AD',
    weights: DEFAULT_WEIGHTS,
  });
  assert.equal(run.steps.filter((step) => step.accept).length, 0);
});

test('raised alpha exposes exactly one soft weight-ratio evasion and no veto evasion', () => {
  const run = evaluateTransitions(scenario, {
    scenario: 'adversarial-probe',
    runId: 'fixture-alpha',
    lane: '10AD',
    weights: { ...DEFAULT_WEIGHTS, alpha: 1.6 },
  });
  const accepted = run.steps.filter((step) => step.accept);
  assert.deepEqual(accepted.map((step) => step.label), [
    'class1:weight-ratio:entropy-vs-drift',
  ]);
  for (let index = 0; index < expectVeto.length; index += 1) {
    if (expectVeto[index].vetoExpected) assert.equal(run.steps[index].accept, false);
  }
});

test('at-cap stale-evidence transition remains rejected', () => {
  const index = scenario.findIndex((row) => row.label.includes('at-cap'));
  const run = evaluateTransitions(scenario, {
    scenario: 'adversarial-probe',
    runId: 'fixture-cap',
    lane: '10AD',
    weights: DEFAULT_WEIGHTS,
  });
  assert.ok(index >= 0);
  assert.equal(run.steps[index].accept, false);
  assert.ok(run.steps[index].deltaU > 0);
});

test('hard barriers reject even with zero barrier weights, a permissive threshold, and override', () => {
  const weights = { ...DEFAULT_WEIGHTS, eta: 0, theta: 0 };
  const protectedGate = gateProposal({
    stateBefore: { protectedPathViolations: 0, verifiedEvidenceCount: 0 },
    stateAfter: { protectedPathViolations: 1, verifiedEvidenceCount: 50 },
    weights,
    threshold: Number.MAX_SAFE_INTEGER,
    allowOverride: true,
  });
  assert.equal(protectedGate.result.accept, false);
  assert.equal(protectedGate.result.protectedPathVeto, true);
  assert.equal(protectedGate.result.override, false);

  const structuralGate = gateProposal({
    stateBefore: { promotionLadderInversions: 0, verifiedEvidenceCount: 0 },
    stateAfter: { promotionLadderInversions: 1, verifiedEvidenceCount: 50 },
    weights,
    threshold: Number.MAX_SAFE_INTEGER,
    allowOverride: true,
  });
  assert.equal(structuralGate.result.accept, false);
  assert.equal(structuralGate.result.structuralFloorVeto, true);
  assert.equal(structuralGate.result.override, false);
});
