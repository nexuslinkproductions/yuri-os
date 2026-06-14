// Tests for yuri-energy-contracts.mjs — the DbC layer for computeU.
// Every contract (C1–C6, W-*) has a PASSING and a DELIBERATELY-VIOLATING case
// → the suite is provably non-vacuous. Peer-built by Mimo, Claude-verified.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkComputeUResult, checkWeights } from './yuri-energy-contracts.mjs';

/** Valid computeU envelope; U auto-computed from the contribution sum (C2 holds). */
function validResult(overrides = {}) {
  const contributions = {
    entropy: 1.0, wasserstein: 2.0, logLoss: 1.0, brier: 1.0,
    informationGain: -0.5, staleness: 0.5, protectedPathViolations: 0,
    promotionLadderInversions: 0, verifiedEvidenceCredit: -0.1,
    repeatedFailure: 0, malformedForecast: 0, overconfidenceDrift: 0.5,
    ...overrides.contributions,
  };
  const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
  const U = overrides.U ?? sum;
  return { result: { U, components: {}, contributions } };
}

function validWeights(overrides = {}) {
  return {
    entropy: 1, wasserstein: 2, logLoss: 1, brier: 1, informationGain: 1, staleness: 0.5,
    protectedPathViolations: 100, promotionLadderInversions: 10, verifiedEvidenceCredit: 0.1,
    repeatedFailure: 5, malformedForecast: 50, overconfidenceDrift: 0.5, ...overrides,
  };
}

describe('checkComputeUResult', () => {
  describe('C1 — U finite', () => {
    it('PASS: finite U', () => assert.equal(checkComputeUResult(validResult()).ok, true));
    it('FAIL: U=Infinity', () => {
      const { ok, violations } = checkComputeUResult(validResult({ U: Infinity }));
      assert.equal(ok, false); assert.ok(violations.some((v) => v.contract === 'C1'));
    });
    it('FAIL: U=NaN', () => {
      const { violations } = checkComputeUResult(validResult({ U: NaN }));
      assert.ok(violations.some((v) => v.contract === 'C1'));
    });
  });
  describe('C2 — sum == U', () => {
    it('PASS: auto-sum', () => assert.equal(checkComputeUResult(validResult()).violations.filter((v) => v.contract === 'C2').length, 0));
    it('FAIL: U forced 9999', () => {
      const { violations } = checkComputeUResult(validResult({ U: 9999 }));
      assert.ok(violations.some((v) => v.contract === 'C2'));
    });
  });
  describe('C3 — U >= -1.4', () => {
    it('PASS: default', () => assert.equal(checkComputeUResult(validResult()).violations.filter((v) => v.contract === 'C3').length, 0));
    it('FAIL: U=-2', () => {
      const { violations } = checkComputeUResult(validResult({ U: -2.0 }));
      assert.ok(violations.some((v) => v.contract === 'C3'));
    });
  });
  describe('C4 — known keys only', () => {
    it('PASS: known', () => assert.equal(checkComputeUResult(validResult()).ok, true));
    it('FAIL: alien key', () => {
      const { violations } = checkComputeUResult(validResult({ contributions: { bogusTerm: 7 } }));
      assert.ok(violations.some((v) => v.contract === 'C4' && v.detail.includes('bogusTerm')));
    });
  });
  describe('C5 — sign constraints', () => {
    it('PASS: correct signs', () => assert.equal(checkComputeUResult(validResult()).ok, true));
    it('FAIL: credit key positive', () => {
      const { violations } = checkComputeUResult(validResult({ contributions: { informationGain: 0.5, verifiedEvidenceCredit: 0.2 } }));
      assert.ok(violations.filter((v) => v.contract === 'C5').length >= 2);
    });
    it('FAIL: non-credit key negative', () => {
      const { violations } = checkComputeUResult(validResult({ contributions: { entropy: -3 } }));
      assert.ok(violations.some((v) => v.contract === 'C5' && v.detail.includes('entropy')));
    });
  });
  describe('C6 — barrier-dominance', () => {
    const zeroExceptBarrier = (ppv, U) => validResult({
      U,
      contributions: {
        protectedPathViolations: ppv, entropy: 0, wasserstein: 0, logLoss: 0, brier: 0,
        informationGain: 0, staleness: 0, promotionLadderInversions: 0,
        verifiedEvidenceCredit: 0, repeatedFailure: 0, malformedForecast: 0, overconfidenceDrift: 0,
      },
    });
    it('PASS: barrier=100, U=100', () => assert.equal(checkComputeUResult(zeroExceptBarrier(100, 100)).ok, true));
    it('FAIL: barrier=100 but U=0 (inconsistent)', () => {
      const { violations } = checkComputeUResult(zeroExceptBarrier(100, 0));
      assert.ok(violations.some((v) => v.contract === 'C6'));
    });
  });
  describe('opt-in {assert:true}', () => {
    it('throws on first violation', () => assert.throws(() => checkComputeUResult(validResult({ U: NaN }), { assert: true }), /\[energy-contract\].*C1/));
    it('does not throw when clean', () => assert.doesNotThrow(() => checkComputeUResult(validResult(), { assert: true })));
  });
  it('accepts inner result directly (no envelope)', () => assert.equal(checkComputeUResult(validResult().result).ok, true));
});

describe('checkWeights', () => {
  it('PASS: defaults valid', () => assert.equal(checkWeights(validWeights()).ok, true));
  it('FAIL: negative weight', () => assert.ok(checkWeights(validWeights({ entropy: -1 })).violations.some((v) => v.contract === 'W-nonneg')));
  it('FAIL: Infinity weight', () => assert.ok(checkWeights(validWeights({ brier: Infinity })).violations.some((v) => v.contract === 'W-finite')));
  it('FAIL: NaN weight', () => assert.ok(checkWeights(validWeights({ logLoss: NaN })).violations.some((v) => v.contract === 'W-finite')));
  it('FAIL: null', () => assert.ok(checkWeights(null).violations.some((v) => v.contract === 'W-shape')));
  it('FAIL: not an object', () => assert.ok(checkWeights('oops').violations.some((v) => v.contract === 'W-shape')));
  it('PASS: zero weights valid', () => {
    const zeroes = Object.fromEntries(Object.keys(validWeights()).map((k) => [k, 0]));
    assert.equal(checkWeights(zeroes).ok, true);
  });
});
