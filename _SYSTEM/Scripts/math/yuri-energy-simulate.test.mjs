import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate, SCENARIOS } from './yuri-energy-simulate.mjs';

test('the standard gate scores healthy/bad correctly but is FOOLED by the masking attack', () => {
  const r = evaluateGate();
  // the obvious good/bad scenarios are graded right
  const prot = r.perScenario.find((p) => p.label === 'bad: protected-path violation');
  assert.equal(prot.got, 'reject');
  const ok = r.perScenario.find((p) => p.label.startsWith('healthy:'));
  assert.equal(ok.got, 'accept');
  // the adversarial masking attack slips through → a real false-accept (the finding)
  assert.equal(r.falseAccepts.length, 1, 'expected exactly the masking attack to slip through');
  assert.match(r.falseAccepts[0].label, /masked by evidence inflation/);
  assert.ok(r.accuracy < 1, 'standard gate must NOT be perfect — that is the signal');
});

test('the hard-veto mitigation closes the masking attack → 100% accuracy', () => {
  const r = evaluateGate(SCENARIOS, { veto: true });
  assert.equal(r.falseAccepts.length, 0, 'hard veto must stop the violation masking');
  assert.equal(r.accuracy, 1, 'with the simulation-derived fix the gate grades perfectly');
});

test('evaluateGate surfaces per-scenario verdicts for inspection', () => {
  const r = evaluateGate();
  assert.equal(r.perScenario.length, SCENARIOS.length);
  for (const p of r.perScenario) {
    assert.ok(['accept', 'reject'].includes(p.got));
    assert.ok(['accept', 'reject'].includes(p.expect));
  }
});
