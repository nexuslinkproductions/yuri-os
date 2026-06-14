// Tests for yuri-energy-coverage.mjs — the computeU input-space coverage meter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  binOf, makeCoverage, hit, report, COMPONENT_KEYS, ALWAYS_EMITTED, CREDIT_KEYS, coverageFromGenerator,
} from './yuri-energy-coverage.mjs';
import { computeU } from './yuri-energy.mjs';

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

test('honest denominator: ALWAYS_EMITTED keys never carry an "absent" reachable bin/hole', () => {
  const cov = coverageFromGenerator(1500);
  const r = report(cov);
  for (const k of ALWAYS_EMITTED) {
    // penalty always-emitted => 6-1=5 reachable; credit always-emitted => 5-1=4 reachable
    const expected = CREDIT_KEYS.has(k) ? 4 : 5;
    assert.equal(r.perComponent[k].binsTotal, expected, `${k} reachable bins (no 'absent')`);
    assert.ok(!r.perComponent[k].holes.includes('absent'), `${k} must not report an 'absent' hole`);
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
