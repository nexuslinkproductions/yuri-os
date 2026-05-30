import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate, SCENARIOS } from './yuri-energy-simulate.mjs';

test('the LIVE gate (veto built into gateProposal) is NOT fooled by the masking attack', () => {
  const r = evaluateGate();
  // the obvious good/bad scenarios are graded right
  const prot = r.perScenario.find((p) => p.label === 'bad: protected-path violation');
  assert.equal(prot.got, 'reject');
  const ok = r.perScenario.find((p) => p.label.startsWith('healthy:'));
  assert.equal(ok.got, 'accept');
  // The masking attack is now closed in the LIVE gate — the hard veto shipped INTO
  // gateProposal (bug #4 fix), so the simulator's standard path no longer leaks it.
  // This test is now the regression guard that the veto stays live.
  assert.equal(r.falseAccepts.length, 0, 'live gate must close the violation-masking attack');
  assert.equal(r.accuracy, 1, 'live gate grades perfectly — the veto is built in, not optional');
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
