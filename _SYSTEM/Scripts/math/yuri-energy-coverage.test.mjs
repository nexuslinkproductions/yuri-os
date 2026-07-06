// Tests for yuri-energy-coverage.mjs — the computeU input-space coverage meter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  binOf, makeCoverage, hit, report, COMPONENT_KEYS, ALWAYS_EMITTED, CREDIT_KEYS,
  coverageFromGenerator, STRUCTURAL_PHANTOMS,
} from './yuri-energy-coverage.mjs';
import { computeU } from './yuri-energy.mjs';
import { genState, makeRng } from './yuri-energy-invariants.mjs';

test('binOf: penalty magnitudes map to the right positive bins', () => {
  assert.equal(binOf(undefined, false, false), 'absent');
  assert.equal(binOf(0, true, false), 'zero');
  assert.equal(binOf(0.3, true, false), 'tiny');
  assert.equal(binOf(1.5, true, false), 'small');
  assert.equal(binOf(5, true, false), 'med');
  assert.equal(binOf(100, true, false), 'large');
});

test('binOf: credit magnitudes map to negative bins; non-finite => extreme', () => {
  assert.equal(binOf(-0.3, true, true), 'ntiny');
  assert.equal(binOf(-1.5, true, true), 'nsmall');
  assert.equal(binOf(-9, true, true), 'nlarge');
  assert.equal(binOf(Infinity, true, false), 'large');
  assert.equal(binOf(-Infinity, true, true), 'nlarge');
});

test('honest denominator: ALWAYS_EMITTED keys drop absent; structural phantoms dropped per key', () => {
  const cov = coverageFromGenerator(1500);
  const r = report(cov);
  // After dropping 'absent' (always-emitted) AND the structural-phantom bins, the reachable count is
  // SPECIFIC per key — the generic "5 penalty / 4 credit" no longer holds (discrete/clamped keys
  // reach fewer bins). These are the honest denominators.
  const EXPECTED = {
    protectedPathViolations: 2,   // {zero, large}
    promotionLadderInversions: 3, // {zero, med, large}
    verifiedEvidenceCredit: 2,    // {zero, ntiny}
  };
  for (const k of ALWAYS_EMITTED) {
    assert.equal(r.perComponent[k].binsTotal, EXPECTED[k], `${k} honest reachable-bin count`);
    assert.ok(!r.perComponent[k].holes.includes('absent'), `${k} must not report an 'absent' hole`);
    for (const ph of (STRUCTURAL_PHANTOMS[k] || [])) {
      assert.ok(!r.perComponent[k].holes.includes(ph), `${k} phantom '${ph}' must never be a hole`);
    }
  }
});

test('honest overall denominator is 53 reachable bins (67 raw − 14 structural phantoms)', () => {
  const r = report(coverageFromGenerator(500));
  assert.equal(r.binsTotal, 53);
});

test('binOf: a wrong-signed contribution surfaces as an error bin, not a laundered magnitude bin', () => {
  assert.equal(binOf(-3, true, false), 'err-negative'); // a negative PENALTY is a sign violation
  assert.equal(binOf(3, true, true), 'err-positive');   // a positive CREDIT is a sign violation
  // correctly-signed values are unaffected by the guard
  assert.equal(binOf(3, true, false), 'med');
  assert.equal(binOf(-3, true, true), 'nlarge');
});

test('FALSIFIABLE: no valid computeU input ever lands a contribution in a declared phantom bin', () => {
  // The structural-phantom claim, made falsifiable: throw extreme + random inputs at computeU and
  // assert NO contribution's bin is in STRUCTURAL_PHANTOMS[key]. If a "phantom" were actually
  // reachable, some input would land there and fail HERE — catching a laundered denominator.
  const probes = [
    { protectedPathViolations: 0 }, { protectedPathViolations: 1 }, { protectedPathViolations: 1000 },
    { promotionLadderInversions: 0 }, { promotionLadderInversions: 1 }, { promotionLadderInversions: 2 }, { promotionLadderInversions: 1000 },
    { verifiedEvidenceCount: 0 }, { verifiedEvidenceCount: 1 }, { verifiedEvidenceCount: 50 }, { verifiedEvidenceCount: 1e6 },
    { forecasts: [2], results: [1] },                                   // 1 malformed → λ
    { forecasts: [2, -1, 5, 9], results: [1, 0, 1, 0] },                // 4 malformed → λ
    { predictions: [0.99], outcomes: [0] },                            // 1 confident-wrong → κ
    { predictions: [0.99, 0.99, 0.99, 0.99, 0.99], outcomes: [0, 0, 0, 0, 0] }, // 5 → κ
    { priorState: [0.25, 0.25, 0.25, 0.25], posteriorState: [0.7, 0.1, 0.1, 0.1] }, // infoGain credit
    { priorState: [0.5, 0.5], posteriorState: [0.999, 0.001] },        // near-max normalized credit
  ];
  const rng = makeRng(0xc0ffee);
  const states = [...probes];
  for (let i = 0; i < 4000; i += 1) states.push(genState(rng)); // random sweep on top of the targeted probes
  for (const s of states) {
    let contribs;
    try { contribs = computeU(s).result.contributions; } catch { continue; }
    for (const key of COMPONENT_KEYS) {
      if (!(key in contribs)) continue; // 'absent' is not a phantom-bin landing
      const b = binOf(contribs[key], true, CREDIT_KEYS.has(key));
      const phantom = STRUCTURAL_PHANTOMS[key] || [];
      assert.ok(!phantom.includes(b),
        `${key}=${contribs[key]} landed in PHANTOM bin '${b}' — the structural claim is WRONG (denominator laundered)`);
    }
  }
});

test('report shape: all 12 components + 3 cross pairs + bounded overall', () => {
  const r = report(coverageFromGenerator(1000));
  assert.equal(Object.keys(r.perComponent).length, COMPONENT_KEYS.length);
  assert.equal(Object.keys(r.cross).length, 3);
  assert.ok(r.overallPct > 0 && r.overallPct <= 1);
  assert.equal(r.samples, 1000);
});

test('a barrier state hits the protectedPathViolations large bin (not a hole)', () => {
  const cov = makeCoverage();
  hit(cov, computeU({ protectedPathViolations: 1 }).result.contributions); // eta*1 = 100 -> 'large'
  const r = report(cov);
  assert.ok(!r.perComponent.protectedPathViolations.holes.includes('large'));
});

test('holes are reported for unexercised reachable bins (meter is non-vacuous)', () => {
  const cov = makeCoverage();
  hit(cov, computeU({ protectedPathViolations: 1 }).result.contributions);
  const r = report(cov);
  // a single barrier sample cannot have exercised every entropy bin
  assert.ok(r.perComponent.entropy.holes.length > 0);
});
