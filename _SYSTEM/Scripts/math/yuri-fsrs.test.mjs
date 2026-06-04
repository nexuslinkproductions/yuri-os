import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrievability, effectiveStability, evaluateRetention, bumpStability, FSRS_FACTOR } from './yuri-fsrs.mjs';

const DAY = 1000 * 60 * 60 * 24;

test('retrievability: 1.0 right after use, ~0.9 at t=S (FSRS curve), monotone-decreasing', () => {
  assert.equal(retrievability(10, 0), 1);                         // just used
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);       // R(t=S)=0.9 by construction
  assert.ok(retrievability(10, 5) > retrievability(10, 20));      // decays with time
  assert.equal(retrievability(0, 5), 0);                          // no stability -> unretrievable
  assert.equal(retrievability(NaN, 5), 0);                        // garbage -> 0 (fail-safe)
});

test('effectiveStability: salience and frequency lengthen stability (slower forgetting)', () => {
  const base = effectiveStability(10, {});
  assert.equal(base, 10);                                         // no boost
  assert.ok(effectiveStability(10, { salience: 2 }) > base);      // salient -> more durable
  assert.ok(effectiveStability(10, { useCount: 50 }) > base);     // often-used -> more durable
  assert.equal(effectiveStability(10, { salience: 2 }), 30);      // 10*(1+1.0*2)
});

// MEM-06 card 29-H1 — renewal-RATE beats raw count: dense recall dures harder than sparse.
test('renewal-rate: same useCount, denser recall window → higher effective stability', () => {
  const dense  = effectiveStability(10, { useCount: 10, elapsedDays: 1 });    // 10 recalls in 1 day
  const sparse = effectiveStability(10, { useCount: 10, elapsedDays: 100 });  // 10 recalls over 100 days
  assert.ok(dense > sparse, `dense-recall slug should be more durable (${dense.toFixed(2)} vs ${sparse.toFixed(2)})`);
});

// MEM-06 — the <renewalMinRecalls (default 4) fallback: too few recalls → count-based prior,
// NOT a rate from a tiny sample. With useCount < 4, elapsedDays must be ignored.
test('renewal-rate fallback: <4 recalls ignores elapsedDays (count-based prior, no rate)', () => {
  const fewWithWindow = effectiveStability(10, { useCount: 3, elapsedDays: 1 });
  const fewNoWindow   = effectiveStability(10, { useCount: 3 });
  assert.equal(fewWithWindow, fewNoWindow, 'under the min-recalls floor the rate term is not used');
  // and it equals the original count-based formula 10*(1 + 0.5*log1p(3))
  assert.ok(Math.abs(fewWithWindow - 10 * (1 + 0.5 * Math.log1p(3))) < 1e-9);
});

// MEM-06 — backward-compat: no elapsedDays at all → byte-identical to the pre-MEM-06 formula.
test('renewal-rate: absent elapsedDays preserves the original count-based stability', () => {
  assert.equal(effectiveStability(10, { useCount: 50 }), 10 * (1 + 0.5 * Math.log1p(50)));
});

test('evaluateRetention: fresh stays, decayed demotes, force-keep never demotes', () => {
  const now = 200 * DAY;
  const fresh = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: now, useCount: 0 }, { nowMs: now, rFloor: 0.6 });
  assert.equal(fresh.demote, false);                              // just used -> R=1

  const decayed = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, useCount: 0 }, { nowMs: now, rFloor: 0.6 });
  assert.equal(decayed.demote, true);                             // 200d untouched, S=10 -> R~0.42 < 0.6

  const kept = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, forceKeep: true }, { nowMs: now, rFloor: 0.6 });
  assert.equal(kept.demote, false);                               // force-keep exempt
  assert.equal(kept.S, Infinity);
});

test('salience resists demotion at identical age (the consolidation effect)', () => {
  const now = 200 * DAY;
  const cfg = { nowMs: now, rFloor: 0.6 };
  const low = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, useCount: 0, salience: 0 }, cfg);
  const high = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, useCount: 0, salience: 2 }, cfg);
  assert.equal(low.demote, true);                                 // low-salience aged out
  assert.equal(high.demote, false);                               // high-salience survived the same age
  assert.ok(high.R > low.R);
});

test('bumpStability: grows on recall (testing effect), capped', () => {
  assert.ok(bumpStability(10) > 10);                              // recall strengthens
  assert.equal(bumpStability(10, { growth: 1.6 }), 16);
  assert.equal(bumpStability(1e9, { maxDays: 3650 }), 3650);      // capped
  assert.ok(bumpStability(0) > 0);                                // degenerate -> floored to 1 then grown
});
