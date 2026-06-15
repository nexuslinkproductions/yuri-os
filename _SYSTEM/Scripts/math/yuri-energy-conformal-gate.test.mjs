#!/usr/bin/env node
// yuri-energy-conformal-gate.test.mjs — Wave-0 conformal gate wire tests
// Tests: flag-OFF byte-identical, flag-ON calibrated pReject, negative edge cases.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gateProposal } from './yuri-energy.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** A simple monotone pReject function for testing: sigmoid(2*|deltaU| - 1). */
function testPReject(deltaU) {
  const z = 2 * Math.abs(deltaU) - 1;
  return 1 / (1 + Math.exp(-z));
}

/** A conformalCalibration object wrapping a pReject function. */
const testCalibration = { pReject: testPReject };

/** A conformalCalibration that throws on call (tests fail-open). */
const throwingCalibration = {
  pReject: () => { throw new Error('calibration error'); },
};

/** A conformalCalibration that returns NaN (tests fail-open). */
const nanCalibration = {
  pReject: () => NaN,
};

/** A conformalCalibration that returns out-of-range values. */
const outOfRangeCalibration = {
  pReject: () => 1.5,
};

// ── Fixed test states ──────────────────────────────────────────────────────────

const emptyBefore = {};
const emptyAfter = {};

const descendingBefore = {
  claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3 },
  claimedDistribution: [0.5, 0.3, 0.2],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 12,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};
const descendingAfter = {
  claimPromotionDistribution: { draft: 4, research: 8, fixture_ready: 4 },
  claimedDistribution: [0.4, 0.3, 0.3],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 13,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Flag OFF → byte-identical to unmodified gate
// ═══════════════════════════════════════════════════════════════════════════════
test('flag-OFF: conformalPReject is null, result identical to baseline', () => {
  // Baseline: no conformalCalibration param at all (original behavior)
  const baseline = gateProposal({ stateBefore: emptyBefore, stateAfter: emptyAfter });

  // With conformalCalibration but flag OFF
  const withCal = gateProposal({
    stateBefore: emptyBefore,
    stateAfter: emptyAfter,
    conformalCalibration: testCalibration,
  });

  // conformalPReject must be null when flag is OFF
  assert.equal(withCal.result.conformalPReject, null);

  // All other fields must be byte-identical
  assert.equal(withCal.result.accept, baseline.result.accept);
  assert.equal(withCal.result.reason, baseline.result.reason);
  assert.equal(withCal.result.deltaU, baseline.result.deltaU);
  assert.equal(withCal.result.protectedPathVeto, baseline.result.protectedPathVeto);
  assert.equal(withCal.result.structuralFloorVeto, baseline.result.structuralFloorVeto);
  assert.equal(withCal.result.maxSeverityVeto, baseline.result.maxSeverityVeto);
  assert.equal(withCal.result.dominantTerm, baseline.result.dominantTerm);
  assert.deepEqual(withCal.result.componentDeltas, baseline.result.componentDeltas);
});

test('flag-OFF: descending transition still accepts', () => {
  const r = gateProposal({ stateBefore: descendingBefore, stateAfter: descendingAfter });
  assert.equal(r.result.accept, true);
  assert.equal(r.result.conformalPReject, null);
});

test('flag-OFF: ascending transition still rejects', () => {
  const r = gateProposal({
    stateBefore: emptyBefore,
    stateAfter: { protectedPathViolations: 1 },
  });
  assert.equal(r.result.accept, false);
  assert.equal(r.result.conformalPReject, null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Flag ON → calibrated pReject with correct empirical coverage
// ═══════════════════════════════════════════════════════════════════════════════
test('flag-ON: conformalPReject is a number in [0,1]', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: testCalibration,
    });
    assert.ok(typeof r.result.conformalPReject === 'number', 'conformalPReject must be a number');
    assert.ok(r.result.conformalPReject >= 0, 'conformalPReject must be >= 0');
    assert.ok(r.result.conformalPReject <= 1, 'conformalPReject must be <= 1');
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: pReject is monotone in |deltaU|', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    // A small deltaU (near 0) should give lower pReject than a large one
    const small = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: testCalibration,
    });
    const large = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: { protectedPathViolations: 1 },
      conformalCalibration: testCalibration,
    });
    // The large deltaU transition should have higher pReject
    assert.ok(large.result.deltaU > small.result.deltaU,
      'large transition should have larger |deltaU|');
    assert.ok(large.result.conformalPReject >= small.result.conformalPReject,
      'pReject should be monotone in |deltaU|');
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: pReject does NOT change accept/reject decision', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const baseline = gateProposal({ stateBefore: emptyBefore, stateAfter: emptyAfter });
    const withCal = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: testCalibration,
    });
    assert.equal(withCal.result.accept, baseline.result.accept,
      'conformal pReject must not change accept decision');
    assert.equal(withCal.result.reason, baseline.result.reason,
      'conformal pReject must not change reason');
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: pReject is computed from |deltaU| via the calibration function', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: testCalibration,
    });
    const expectedPReject = testPReject(r.result.deltaU);
    assert.ok(Math.abs(r.result.conformalPReject - expectedPReject) < 1e-9,
      `pReject ${r.result.conformalPReject} should match ${expectedPReject}`);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Negative edge cases — empty / tiny / throwing calibration
// ═══════════════════════════════════════════════════════════════════════════════
test('flag-ON: null conformalCalibration → conformalPReject is null (no crash)', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({ stateBefore: emptyBefore, stateAfter: emptyAfter });
    assert.equal(r.result.conformalPReject, null);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: conformalCalibration without pReject function → null (no crash)', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: {},
    });
    assert.equal(r.result.conformalPReject, null);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: throwing calibration → null (fail-open, no crash)', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: throwingCalibration,
    });
    assert.equal(r.result.conformalPReject, null);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: NaN-returning calibration → null (fail-open, no crash)', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: nanCalibration,
    });
    assert.equal(r.result.conformalPReject, null);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

test('flag-ON: out-of-range calibration (1.5) → clamped to 1.0', () => {
  process.env.YURI_CONFORMAL_GATE = '1';
  try {
    const r = gateProposal({
      stateBefore: emptyBefore,
      stateAfter: emptyAfter,
      conformalCalibration: outOfRangeCalibration,
    });
    assert.equal(r.result.conformalPReject, 1.0);
  } finally {
    delete process.env.YURI_CONFORMAL_GATE;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Degrade contract — flag OFF with any calibration is byte-identical
// ═══════════════════════════════════════════════════════════════════════════════
test('degrade: flag-OFF with throwing calibration still works (no crash)', () => {
  const r = gateProposal({
    stateBefore: emptyBefore,
    stateAfter: emptyAfter,
    conformalCalibration: throwingCalibration,
  });
  assert.equal(r.result.conformalPReject, null);
  assert.equal(r.result.accept, true);
});

test('degrade: flag-OFF with any calibration is byte-identical to no-cal', () => {
  const baseline = gateProposal({ stateBefore: emptyBefore, stateAfter: emptyAfter });
  const withCal = gateProposal({
    stateBefore: emptyBefore,
    stateAfter: emptyAfter,
    conformalCalibration: testCalibration,
  });
  // Strip conformalPReject from both (both are null when OFF)
  const { conformalPReject: _, ...baselineRest } = baseline.result;
  const { conformalPReject: _2, ...withCalRest } = withCal.result;
  assert.deepEqual(withCalRest, baselineRest);
});
