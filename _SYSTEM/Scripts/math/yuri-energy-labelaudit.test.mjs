// Tests for yuri-energy-labelaudit.mjs — identity-leak control and per-rule spot-check.
// Proves: (a) the trivial calibrator on gate features -> gate decision achieves ~100% accuracy
//   (the identity leak), confirming that auto-labels from the gate's own verdict are circular;
// (b) each deriver rule R1/R2/R3 is not just re-encoding the gate's decision — falsifiable checks
//   that R1 fires on accepts, R2 fires on rejects, R3 is not equivalent to accept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identityLeakAudit,
  ruleSpotCheck,
  fullAudit,
} from './yuri-energy-labelaudit.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Realistic firings: accepts have deltaU <= 0, rejects have deltaU > 0
// (matching the actual gate behavior where reject = energy increase)
function makeFirings(accepts = 50, rejects = 10) {
  const firings = [];
  for (let i = 0; i < accepts; i++) {
    firings.push({
      runId: `accept-${i}`,
      decision: 'accept',
      deltaU: -(Math.random() * 5 + 0.01),  // negative deltaU
      U_before: 10 + Math.random() * 20,
      timestamp: `2026-06-15T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
    });
  }
  for (let i = 0; i < rejects; i++) {
    firings.push({
      runId: `reject-${i}`,
      decision: 'reject',
      deltaU: Math.random() * 5 + 0.05,  // positive deltaU
      U_before: 10 + Math.random() * 20,
      timestamp: `2026-06-15T11:${String(i % 60).padStart(2, '0')}:00.000Z`,
    });
  }
  return firings;
}

// Signals that fire on BOTH accepts and rejects (genuinely independent of gate decision)
function makeIndependentSignals(firings) {
  const revertedRunIds = new Set();
  const retriedRunIds = new Set();
  const promotedRunIds = new Set();

  // R1 (reverted): some accepted proposals were later reverted
  // This fires on ACCEPTS — genuinely new info (gate said yes, outcome was bad)
  const acceptFirings = firings.filter(f => f.decision === 'accept');
  for (let i = 0; i < Math.ceil(acceptFirings.length * 0.1); i++) {
    revertedRunIds.add(acceptFirings[i].runId);
  }

  // R2 (retried-and-succeeded): some rejected proposals were retried and succeeded
  // This fires on REJECTS — genuinely new info (gate said no, retry worked)
  const rejectFirings = firings.filter(f => f.decision === 'reject');
  for (let i = 0; i < Math.ceil(rejectFirings.length * 0.3); i++) {
    retriedRunIds.add(rejectFirings[i].runId);
  }

  // R3 (promoted): some accepted proposals were promoted (but not all)
  // This fires on a SUBSET of accepts — adds info beyond just "accepted"
  for (let i = 0; i < Math.ceil(acceptFirings.length * 0.4); i++) {
    promotedRunIds.add(acceptFirings[i].runId);
  }

  return {
    isReverted: (runId) => revertedRunIds.has(runId),
    isRetriedAndSucceeded: (runId) => retriedRunIds.has(runId),
    isPromoted: (runId) => promotedRunIds.has(runId),
  };
}

// ── (a) Identity-Leak Control ────────────────────────────────────────────────

test('identityLeakAudit: trivial model achieves ~100% accuracy on gate decision', () => {
  const firings = makeFirings(100, 20);
  const result = identityLeakAudit(firings);

  // The trivial model (sign(deltaU) -> decision) should achieve ~100% accuracy
  // because the gate is deterministic: accept when deltaU <= 0, reject when deltaU > 0
  assert.equal(result.n, 120, 'all firings counted');
  assert.ok(result.trivialAccuracy >= 0.99, `trivial accuracy should be >=0.99, got ${result.trivialAccuracy}`);
  assert.equal(result.verdict, 'CIRCULAR', 'gate decision is a deterministic function of deltaU -> CIRCULAR');
  assert.ok(result.leakScore >= 0.99, `leak score should be >=0.99, got ${result.leakScore}`);
  assert.ok(result.interpretation.includes('IDENTITY LEAK'), 'interpretation must flag identity leak');
});

test('identityLeakAudit: Brier score of trivial model is moderate (sigmoid confidence is not calibrated as reject-probability)', () => {
  const firings = makeFirings(100, 20);
  const result = identityLeakAudit(firings);

  // The trivial model uses sigmoid(|deltaU|) as confidence, which measures gate decisiveness
  // not calibrated reject-probability. Accepts with large |deltaU| have high confidence but
  // outcome=0, producing moderate Brier (~0.6). The point is accuracy (~100%), not calibration.
  assert.ok(result.trivialBrier > 0.3, `trivial Brier should be >0.3 (uncalibrated), got ${result.trivialBrier}`);
  assert.ok(result.trivialBrier < 0.9, `trivial Brier should be <0.9, got ${result.trivialBrier}`);
});

test('identityLeakAudit: counts accepts with positive deltaU and rejects with negative deltaU', () => {
  const firings = makeFirings(100, 20);
  const result = identityLeakAudit(firings);

  // In our fixture, all accepts have deltaU < 0 and all rejects have deltaU > 0
  assert.equal(result.acceptsPosDelta, 0, 'no accepts with positive deltaU in fixture');
  assert.equal(result.rejectsNegDelta, 0, 'no rejects with negative deltaU in fixture');
  assert.equal(result.firingsByDecision.accepts, 100);
  assert.equal(result.firingsByDecision.rejects, 20);
});

test('identityLeakAudit: handles empty firings', () => {
  const result = identityLeakAudit([]);
  assert.equal(result.n, 0);
  assert.ok(Number.isNaN(result.trivialAccuracy));
  assert.equal(result.verdict, 'NO_DATA');
});

test('identityLeakAudit: handles firings with no rejects (degenerate case)', () => {
  const firings = makeFirings(50, 0);
  const result = identityLeakAudit(firings);
  assert.equal(result.n, 50);
  assert.equal(result.trivialAccuracy, 1.0, 'all accepts, trivial model still perfect');
  assert.equal(result.verdict, 'CIRCULAR');
});

test('identityLeakAudit: proves the KEY POINT — gate verdict is worthless as calibration label', () => {
  // This is the core proof: if you train a calibrator on (deltaU -> gate decision),
  // you get ~100% accuracy. This means the gate's own verdict is a DETERMINISTIC
  // function of its inputs, not an independent ground-truth label.
  // Any "calibration" against the gate's own verdict is circular.
  const firings = makeFirings(200, 50);
  const result = identityLeakAudit(firings);

  assert.ok(result.trivialAccuracy >= 0.99, 'trivial model near-perfect -> gate verdict is circular');
  assert.equal(result.verdict, 'CIRCULAR');
  assert.ok(result.interpretation.includes('circular'), 'must state circularity explicitly');
  assert.ok(result.interpretation.includes('external signals'), 'must point to external signals as the solution');
});

// ── (b) Per-Rule Spot-Check ──────────────────────────────────────────────────

test('ruleSpotCheck: R1 (reverted) fires on accepts — independent of gate decision', () => {
  const firings = makeFirings(100, 20);
  const signals = makeIndependentSignals(firings);
  const result = ruleSpotCheck(firings, signals);

  const r1 = result.rules.find(r => r.id === 'R1');
  assert.ok(r1, 'R1 rule present');
  assert.ok(r1.fireCount > 0, 'R1 must fire at least once');
  assert.ok(r1.acceptsHit > 0, 'R1 must fire on at least some accepts (gate said yes, later reverted)');
  assert.equal(r1.independenceVerdict, 'INDEPENDENT', 'R1 is independent of gate decision');
});

test('ruleSpotCheck: R2 (retried-and-succeeded) fires on rejects — independent of gate decision', () => {
  const firings = makeFirings(100, 20);
  const signals = makeIndependentSignals(firings);
  const result = ruleSpotCheck(firings, signals);

  const r2 = result.rules.find(r => r.id === 'R2');
  assert.ok(r2, 'R2 rule present');
  assert.ok(r2.fireCount > 0, 'R2 must fire at least once');
  assert.ok(r2.rejectsHit > 0, 'R2 must fire on at least some rejects (gate said no, retry succeeded)');
  assert.equal(r2.independenceVerdict, 'INDEPENDENT', 'R2 is independent of gate decision');
});

test('ruleSpotCheck: R3 (promoted) is not equivalent to accept — adds info beyond gate', () => {
  const firings = makeFirings(100, 20);
  const signals = makeIndependentSignals(firings);
  const result = ruleSpotCheck(firings, signals);

  const r3 = result.rules.find(r => r.id === 'R3');
  assert.ok(r3, 'R3 rule present');
  assert.ok(r3.fireCount > 0, 'R3 must fire at least once');
  assert.ok(r3.acceptsHit < r3.acceptsTotal, 'R3 must NOT fire on all accepts (some accepts are not promoted)');
  assert.equal(r3.independenceVerdict, 'INDEPENDENT', 'R3 is independent (not equivalent to accept)');
});

test('ruleSpotCheck: overall verdict is INDEPENDENT when all rules pass', () => {
  const firings = makeFirings(100, 20);
  const signals = makeIndependentSignals(firings);
  const result = ruleSpotCheck(firings, signals);

  assert.equal(result.overallVerdict, 'INDEPENDENT');
});

test('ruleSpotCheck: detects LAUNDERING when R1 only fires on rejects', () => {
  const firings = makeFirings(50, 10);
  // R1 only fires on rejects — this would mean "reverted" only applies to proposals
  // the gate already rejected, which is laundering the gate's decision
  const rejectRunIds = new Set(firings.filter(f => f.decision === 'reject').map(f => f.runId));
  const launderingSignals = {
    isReverted: (runId) => rejectRunIds.has(runId),  // BAD: only marks rejects as reverted
    isRetriedAndSucceeded: (runId) => false,
    isPromoted: (runId) => false,
  };
  const result = ruleSpotCheck(firings, launderingSignals);

  const r1 = result.rules.find(r => r.id === 'R1');
  assert.equal(r1.independenceVerdict, 'LAUNDERING', 'R1 only firing on rejects = laundering');
  assert.equal(r1.rejectsHit > 0, true, 'R1 hits rejects');
  assert.equal(r1.acceptsHit, 0, 'R1 hits zero accepts');
});

test('ruleSpotCheck: detects LAUNDERING when R3 fires on all accepts', () => {
  const firings = makeFirings(50, 10);
  // R3 fires on ALL accepts — this means "promoted" = "accepted", laundering the gate's decision
  const acceptRunIds = new Set(firings.filter(f => f.decision === 'accept').map(f => f.runId));
  const launderingSignals = {
    isReverted: (runId) => false,
    isRetriedAndSucceeded: (runId) => false,
    isPromoted: (runId) => acceptRunIds.has(runId),  // BAD: every accept is "promoted"
  };
  const result = ruleSpotCheck(firings, launderingSignals);

  const r3 = result.rules.find(r => r.id === 'R3');
  assert.equal(r3.independenceVerdict, 'LAUNDERING', 'R3 firing on all accepts = laundering');
  assert.equal(r3.acceptsHit, r3.acceptsTotal, 'R3 hits all accepts');
});

test('ruleSpotCheck: NO_SIGNALS when no rules fire', () => {
  const firings = makeFirings(50, 10);
  const noSignals = {
    isReverted: () => false,
    isRetriedAndSucceeded: () => false,
    isPromoted: () => false,
  };
  const result = ruleSpotCheck(firings, noSignals);

  assert.equal(result.overallVerdict, 'NO_SIGNALS');
  for (const r of result.rules) {
    assert.equal(r.fireCount, 0);
    assert.equal(r.independenceVerdict, 'NO_FIRES');
  }
});

test('ruleSpotCheck: mutual information is low for independent rules', () => {
  const firings = makeFirings(200, 50);
  const signals = makeIndependentSignals(firings);
  const result = ruleSpotCheck(firings, signals);

  for (const r of result.rules) {
    if (r.fireCount > 0) {
      // Independent rules should have low normalized MI with the gate's decision
      // (they fire on both accepts and rejects, not just one)
      assert.ok(r.normalizedMI < 0.5,
        `${r.id} normalizedMI should be <0.5 for independent rules, got ${r.normalizedMI}`);
    }
  }
});

// ── (c) Full Audit ────────────────────────────────────────────────────────────

test('fullAudit: combines identity-leak and rule spot-check', () => {
  const firings = makeFirings(100, 20);
  const signals = makeIndependentSignals(firings);
  const result = fullAudit(firings, signals);

  assert.equal(result.identityLeak.verdict, 'CIRCULAR', 'identity leak detected');
  assert.equal(result.ruleSpotCheck.overallVerdict, 'INDEPENDENT', 'rules are independent');
  assert.ok(result.conclusion.includes('circular'), 'conclusion mentions circularity');
  assert.ok(result.conclusion.includes('external signals'), 'conclusion points to external signals');
});

test('fullAudit: flags laundering in conclusion', () => {
  const firings = makeFirings(50, 10);
  const rejectRunIds = new Set(firings.filter(f => f.decision === 'reject').map(f => f.runId));
  const launderingSignals = {
    isReverted: (runId) => rejectRunIds.has(runId),
    isRetriedAndSucceeded: () => false,
    isPromoted: () => false,
  };
  const result = fullAudit(firings, launderingSignals);

  assert.equal(result.identityLeak.verdict, 'CIRCULAR');
  assert.equal(result.ruleSpotCheck.overallVerdict, 'LAUNDERING_DETECTED');
  assert.ok(result.conclusion.includes('LAUNDERING DETECTED'), 'conclusion must flag laundering');
});
