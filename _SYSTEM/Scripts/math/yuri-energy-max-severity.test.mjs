import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateProposal } from './yuri-energy.mjs';
import { cortexSnapshot, gateClaimTransition } from '../claim-cortex.mjs';

// ---------------------------------------------------------------------------
// L∞ MAX-SEVERITY FLOOR — delta-gate severity-laundering closure.
//
// gateProposal is a DELTA gate. A delta on ANY magnitude aggregate (sum, convex
// sum, even the L∞ max) is conserved under an equal-magnitude swap: resolve one
// depth-5 over-claim honestly while smuggling a fresh depth-5 fabrication and the
// after-state has the same sum (25→25) and the same max (5→5), so ΔU≈0 and the
// delta gate ACCEPTS. The closure is an ABSOLUTE-LEVEL floor on the deepest
// per-claim inversion AFTER the transition (not a delta): the after-state still
// CONTAINS a depth-5 inversion, and no amount of resolving OTHER claims lowers the
// max, so the veto is genuinely non-offsettable.
//
// Default cap is Infinity (DISABLED) — every pre-existing caller is unaffected.
// ---------------------------------------------------------------------------

// Two states that model the post-swap world: identical, both carrying a depth-5
// over-claim with a conserved convex sum. ΔU = 0, so the bare delta gate accepts.
const swapBefore = { promotionLadderInversions: 25, maxLadderInversion: 5 };
const swapAfter = { promotionLadderInversions: 25, maxLadderInversion: 5 };

test('default-off: no cap → maxSeverity floor is inert (backward compatible)', () => {
  const r = gateProposal({ stateBefore: swapBefore, stateAfter: swapAfter });
  assert.equal(r.result.maxSeverityVeto, false);
  // ΔU = 0 ≤ threshold 0 → the delta gate accepts. This IS the open hole.
  assert.equal(r.result.accept, true);
});

test('HEADLINE: equal-magnitude swap is caught when the cap is armed', () => {
  // Hole demonstrated (cap disabled):
  const open = gateProposal({ stateBefore: swapBefore, stateAfter: swapAfter, maxLadderInversionCap: Infinity });
  assert.equal(open.result.accept, true, 'delta gate alone is blind to the swap');

  // Hole closed (cap=3): the after-state still contains a depth-5 inversion.
  const closed = gateProposal({ stateBefore: swapBefore, stateAfter: swapAfter, maxLadderInversionCap: 3 });
  assert.equal(closed.result.maxSeverityVeto, true);
  assert.equal(closed.result.accept, false);
  assert.equal(closed.result.dominantTerm, 'maxLadderInversion');
  assert.match(closed.result.reason, /MAX-SEVERITY FLOOR/);
});

test('absolute level, not delta: veto fires even with NO increase (5→5)', () => {
  // max is unchanged across the transition (delta = 0) yet the floor still fires,
  // proving it keys on the absolute after-level, not the delta.
  const r = gateProposal({ stateBefore: swapBefore, stateAfter: swapAfter, maxLadderInversionCap: 3 });
  assert.equal(r.result.maxSeverityVeto, true);
  assert.match(r.result.reason, /absolute level/);
});

test('boundary: max == cap passes, max > cap vetoes', () => {
  const atCap = gateProposal({
    stateBefore: {}, stateAfter: { maxLadderInversion: 3 }, maxLadderInversionCap: 3,
  });
  assert.equal(atCap.result.maxSeverityVeto, false, '3 > 3 is false — at-cap is allowed');

  const overCap = gateProposal({
    stateBefore: {}, stateAfter: { maxLadderInversion: 4 }, maxLadderInversionCap: 3,
  });
  assert.equal(overCap.result.maxSeverityVeto, true);
  assert.equal(overCap.result.accept, false);
});

test('fail-closed: a present-but-unparseable maxLadderInversion vetoes when armed', () => {
  const r = gateProposal({
    stateBefore: {}, stateAfter: { maxLadderInversion: 'lots' }, maxLadderInversionCap: 3,
  });
  assert.equal(r.result.maxSeverityVeto, true);
  assert.match(r.result.reason, /malformed/);
});

test('armed but field absent → 0 > cap is false → no veto (no spurious blocking)', () => {
  const r = gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: 3 });
  assert.equal(r.result.maxSeverityVeto, false);
  assert.equal(r.result.accept, true);
});

test('cap validation: negative and NaN throw, Infinity is accepted', () => {
  assert.throws(() => gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: -1 }));
  assert.throws(() => gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: NaN }));
  assert.doesNotThrow(() => gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: Infinity }));
});

test('Lyapunov preserved: a descending transition below the cap still accepts', () => {
  // after earns verified-evidence credit → U drops → ΔU < 0 (descending). The floor
  // only ever RESTRICTS acceptance; a healthy descent with max below cap is untouched.
  const r = gateProposal({
    stateBefore: { verifiedEvidenceCount: 0, maxLadderInversion: 1 },
    stateAfter: { verifiedEvidenceCount: 10, maxLadderInversion: 1 },
    maxLadderInversionCap: 3,
  });
  assert.ok(r.result.deltaU < 0, 'transition is descending');
  assert.equal(r.result.maxSeverityVeto, false);
  assert.equal(r.result.accept, true);
});

test('precedence: protected-path veto outranks the max-severity floor', () => {
  const r = gateProposal({
    stateBefore: { protectedPathViolations: 0, maxLadderInversion: 5 },
    stateAfter: { protectedPathViolations: 1, maxLadderInversion: 5 },
    maxLadderInversionCap: 3,
  });
  assert.equal(r.result.protectedPathVeto, true);
  assert.equal(r.result.accept, false);
  assert.match(r.result.reason, /protected-path/);
});

// ---------------------------------------------------------------------------
// gateClaimTransition wiring — the cortex layer where per-claim maxLadderInversion
// actually lives. A PERSISTENT deep over-claim (same id, same depth before/after)
// does NOT trip the identity veto (not new-or-deeper) — so it isolates the level
// floor, demonstrating the two vetoes are complementary.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;
// claimed `trusted` with only a stale test → a deep RETRACT inversion.
const deepClaim = [{ id: 'c1', claimedStatus: 'trusted', evidence: [{ kind: 'test', capturedAt: NOW - 120 * DAY }] }];

test('gateClaimTransition: persistent deep over-claim caught by armed cap, not identity veto', () => {
  const depth = cortexSnapshot(deepClaim, { nowMs: NOW }).maxLadderInversion;
  assert.ok(depth > 0, 'fixture produces a real inversion');

  // Same claim before & after → identity veto does NOT fire (not new-or-deeper).
  const armed = gateClaimTransition(deepClaim, deepClaim, { nowMs: NOW, maxLadderInversionCap: depth - 1 });
  assert.equal(armed.identityVeto, false, 'persistent claim is not new-or-deeper');
  assert.equal(armed.deltaGate.maxSeverityVeto, true, 'level floor catches the persistent deep over-claim');
  assert.equal(armed.accept, false);

  // Disabled cap → the level floor is inert (identity veto also quiet here).
  const disabled = gateClaimTransition(deepClaim, deepClaim, { nowMs: NOW });
  assert.equal(disabled.deltaGate.maxSeverityVeto, false);
});
