import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateProposal, computeU } from './yuri-energy.mjs';

// Attack-round regression: a malformed protectedPathViolations in stateAfter must NOT
// slip past the hard veto by being coerced to 0. Before the fix, NaN / 'BREACH' ->
// readNonNegativeField -> 0 -> (0 > 0) false -> the non-offsettable veto never fired.

test('hard veto fires when stateAfter.protectedPathViolations is NaN (fail-closed)', () => {
  const g = gateProposal({ stateBefore: { protectedPathViolations: 0 }, stateAfter: { protectedPathViolations: NaN } });
  assert.equal(g.result.accept, false);
  assert.equal(g.result.protectedPathVeto, true);
});

test('hard veto fires when stateAfter.protectedPathViolations is a non-numeric string', () => {
  const g = gateProposal({ stateBefore: { protectedPathViolations: 0 }, stateAfter: { protectedPathViolations: 'BREACH' } });
  assert.equal(g.result.accept, false);
  assert.equal(g.result.protectedPathVeto, true);
});

test('a well-formed clean transition still accepts (no false veto from the malformed guard)', () => {
  const g = gateProposal({ stateBefore: { verifiedEvidenceCount: 2 }, stateAfter: { verifiedEvidenceCount: 3 } });
  assert.equal(g.result.protectedPathVeto, false);
  assert.equal(g.result.accept, true);
});

// Attack-round regression: a predictions/outcomes length mismatch must RAISE U (via the
// malformed-forecast lambda net), not vanish to a 0 contribution that lets the gate accept.

test('forecast length mismatch raises U instead of silently skipping to zero', () => {
  const aligned = computeU({ predictions: [0.9, 0.9, 0.9], outcomes: [0, 0, 0] }).result.U;
  const mismatched = computeU({ predictions: [0.9, 0.9, 0.9], outcomes: [0] }).result.U;
  assert.ok(mismatched > aligned, `mismatch U (${mismatched}) must exceed aligned U (${aligned})`);
});

test('a transition introducing a forecast length mismatch is rejected, not accepted', () => {
  const g = gateProposal({ stateBefore: {}, stateAfter: { predictions: [0.9, 0.9, 0.9], outcomes: [0] } });
  assert.equal(g.result.accept, false);
});
