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

// Math-base wave 2026-06-10 (D3): the minRecalls form-switch is RETIRED — the old
// test here stayed green-but-stale (its uc=3/ed=1 fixture sat exactly where both
// forms agree), so replacing it was mandatory even though nothing turned red.
test('freqTerm is monotone in useCount at fixed window (no recall-#4 cliff)', () => {
  for (let uc = 0; uc < 12; uc++) {
    assert.ok(
      effectiveStability(10, { useCount: uc + 1, elapsedDays: 100 }) >= effectiveStability(10, { useCount: uc, elapsedDays: 100 }) - 1e-12,
      `monotone at uc=${uc}`,
    );
  }
});

test('sparse recall keeps only the DISCOUNTED count floor (kappa=0.25 winning branch)', () => {
  const s = effectiveStability(10, { useCount: 3, elapsedDays: 100 });
  assert.ok(Math.abs(s - 10 * (1 + 0.5 * 0.25 * Math.log1p(3))) < 1e-9, `got ${s}`);
});

test('continuity: rate and floor blend smoothly across the old cliff boundary', () => {
  const s3 = effectiveStability(10, { useCount: 3, elapsedDays: 100 });
  const s4 = effectiveStability(10, { useCount: 4, elapsedDays: 100 });
  assert.ok(s4 >= s3, `recall #4 must not cut stability (S3=${s3}, S4=${s4})`);
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

test('invalid decay/factor fall back to canonical constants — never NaN, never a NaN reason', () => {
  assert.equal(retrievability(10, 10, { factor: -3 }), retrievability(10, 10));
  assert.equal(retrievability(10, 10, { decay: 2 }), retrievability(10, 10));
  const ev = evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0 }, { nowMs: 40 * 86400000, factor: NaN });
  assert.ok(Number.isFinite(ev.R));
  assert.ok(!ev.reason.includes('NaN'));
});
