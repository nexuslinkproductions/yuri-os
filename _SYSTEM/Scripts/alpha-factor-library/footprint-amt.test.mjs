#!/usr/bin/env node
// footprint-amt.test.mjs — red/grey/green for the AMT layer (MURE gap-2).
// Run: node --test _SYSTEM/Scripts/alpha-factor-library/footprint-amt.test.mjs
// Known-answer fixtures are HAND-COMPUTED (POC/VA/CVD arithmetic in comments).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-fp-'));
const FLAG = path.join(FLAG_DIR, 'mure-footprint.enabled');
process.env.MURE_FLAG_DIR = FLAG_DIR;
const arm = () => writeFileSync(FLAG, '1');
const disarm = () => { try { unlinkSync(FLAG); } catch { /* absent */ } };

const { computeVolumeProfile, computeCVD, computeFootprintBars, computeValueArea, amtSignals, profileFromTape } =
  await import('./footprint-amt.mjs');

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

const T = (ts, price, qty, side) => ({ ts, price, qty, aggressorSide: side });

// ═══ RED — DISARMED degrade ═══════════════════════════════════════════════════

test('DISARMED: empty-shape degrades, no throw', () => {
  disarm();
  const p = computeVolumeProfile([T(1, 100, 5, 'buy')], { binSize: 1 });
  assert.deepEqual(p.bins, []);
  assert.equal(p.poc, null);
  assert.equal(p.vah, null);
  assert.deepEqual(computeCVD([T(1, 100, 5, 'buy')]), []);
  assert.deepEqual(computeFootprintBars([T(1, 100, 5, 'buy')]), []);
  const va = computeValueArea({ bins: [{ price: 100, totalVol: 10 }] });
  assert.equal(va.poc, null);
  assert.deepEqual(amtSignals([{ ts: 1, close: 105, delta: 5, volume: 10 }], { vah: 102, val: 100 }), []);
  assert.equal(profileFromTape([], { t0: 0, t1: 1 }), null);
});

// ═══ GREEN — hand-computed volume profile + value area ════════════════════════

test('KNOWN-ANSWER: POC/VAH/VAL match the hand-computed 70% expansion', () => {
  arm();
  // Volumes by price: 100→30, 101→20, 102→50(POC), 103→10, 104→5. Total=115, target=80.5.
  // Expansion from POC 102: neighbors 101(20) vs 103(10) → take 101 (acc 70);
  // then 100(30) vs 103(10) → take 100 (acc 100 ≥ 80.5). VA=[100..102].
  const trades = [
    T(1, 100, 18, 'buy'), T(2, 100, 12, 'sell'),      // 100: 30 (delta +6)
    T(3, 101, 8, 'buy'), T(4, 101, 12, 'sell'),       // 101: 20 (delta −4)
    T(5, 102, 35, 'buy'), T(6, 102, 15, 'sell'),      // 102: 50 (delta +20)
    T(7, 103, 2, 'buy'), T(8, 103, 8, 'sell'),        // 103: 10 (delta −6)
    T(9, 104, 1, 'buy'), T(10, 104, 4, 'sell'),       // 104: 5  (delta −3)
  ];
  const p = computeVolumeProfile(trades, { binSize: 1 });
  assert.equal(p.poc, 102, 'POC = max-volume price');
  assert.equal(p.vah, 102, 'VAH');
  assert.equal(p.val, 100, 'VAL');
  assert.equal(p.totalVol, 115);
  assert.equal(p.valueAreaVol, 100);
  assert.equal(p.deltaPoc, 102, 'delta POC = argmax|delta| = 102 (+20)');
  const bin102 = p.bins.find((b) => b.price === 102);
  assert.equal(bin102.buyVol, 35);
  assert.equal(bin102.sellVol, 15);
  assert.equal(bin102.delta, 20);
  assert.equal(p.bins.length, 5);
  assert.ok(p.bins.every((b, i, a) => i === 0 || a[i - 1].price < b.price), 'bins ascending');
});

test('VOLUME-POC vs DELTA-POC divergence (value migrating)', () => {
  arm();
  // 100 has the most VOLUME (60, balanced); 103 has the most |DELTA| (30 one-sided sell).
  const trades = [
    T(1, 100, 30, 'buy'), T(2, 100, 30, 'sell'), // vol 60, delta 0
    T(3, 103, 5, 'buy'), T(4, 103, 35, 'sell'),  // vol 40, delta −30
  ];
  const p = computeVolumeProfile(trades, { binSize: 1 });
  assert.equal(p.poc, 100);
  assert.equal(p.deltaPoc, 103);
  assert.notEqual(p.poc, p.deltaPoc, 'divergence detected');
});

test('COMPOSITE VA: merge-before-compute ≡ concatenating raw trades (Lane D)', () => {
  arm();
  const s1 = [T(1, 100, 40, 'buy'), T(2, 101, 10, 'sell')];
  const s2 = [T(3, 101, 45, 'buy'), T(4, 102, 12, 'sell')];
  const composite = computeVolumeProfile([...s1, ...s2], { binSize: 1 });
  // merged: 100→40, 101→55(POC), 102→12; total 107, target 74.9: POC 101(55) → 100(40) → 95 ≥ 74.9
  assert.equal(composite.poc, 101);
  assert.equal(composite.val, 100);
  assert.equal(composite.vah, 101);
  // Property: composite ≠ either single-session VA (the merge changes the answer)
  const p1 = computeVolumeProfile(s1, { binSize: 1 });
  assert.notEqual(p1.poc, composite.poc);
});

test('computeValueArea edge cases: single bin, tie-break, valuePct bounds, garbage', () => {
  arm();
  const single = computeValueArea({ bins: [{ price: 50, totalVol: 10 }] });
  assert.deepEqual([single.poc, single.vah, single.val], [50, 50, 50], 'single bin → degenerate VA at itself');
  // POC tie → deterministic lower price
  const tie = computeValueArea({ bins: [{ price: 10, totalVol: 5 }, { price: 11, totalVol: 5 }] });
  assert.equal(tie.poc, 10, 'tie-break toward lower price (documented)');
  assert.equal(computeValueArea({ bins: [] }).poc, null);
  assert.equal(computeValueArea(null).poc, null);
  assert.equal(computeValueArea({ bins: [{ price: 1, totalVol: 0 }] }).poc, null, 'zero total volume → no VA');
});

// ═══ GREEN — CVD ══════════════════════════════════════════════════════════════

test('CVD: signed accumulation, chronological sort, session reset', () => {
  arm();
  // buys +10 +5, sell −3 → cvd [10, 15, 12]; feed shuffled to prove sort.
  const trades = [T(3, 101, 3, 'sell'), T(1, 100, 10, 'buy'), T(2, 100.5, 5, 'buy')];
  const cvd = computeCVD(trades);
  assert.deepEqual(cvd.map((r) => r.cvd), [10, 15, 12]);
  assert.deepEqual(cvd.map((r) => r.delta), [10, 5, -3]);
  assert.deepEqual(cvd.map((r) => r.ts), [1, 2, 3], 'chronological');
  // Session reset at UTC-day boundary: trade at day0 23:59, day1 00:01 → cvd resets.
  const day = 86400;
  const rs = computeCVD([T(day - 60, 100, 7, 'buy'), T(day + 60, 100, 4, 'buy')], { sessionResetSec: day });
  assert.deepEqual(rs.map((r) => r.cvd), [7, 4], 'reset at the boundary');
  const noReset = computeCVD([T(day - 60, 100, 7, 'buy'), T(day + 60, 100, 4, 'buy')]);
  assert.deepEqual(noReset.map((r) => r.cvd), [7, 11], 'no reset by default');
  // ms unit: same boundary in ms only resets when tsUnit told the truth.
  const ms = computeCVD([T((day - 60) * 1000, 100, 7, 'buy'), T((day + 60) * 1000, 100, 4, 'buy')], { sessionResetSec: day, tsUnit: 'ms' });
  assert.deepEqual(ms.map((r) => r.cvd), [7, 4]);
  // trades without aggressor info are EXCLUDED, never guessed:
  assert.deepEqual(computeCVD([{ ts: 1, price: 100, qty: 5 }]), []);
});

// ═══ GREEN — footprint bars ═══════════════════════════════════════════════════

test('FOOTPRINT BARS: OHLCV + delta + bins + running CVD + validateBar reuse', () => {
  arm();
  const trades = [
    // bar [0,60): open 100, high 102, low 99, close 102
    T(5, 100, 10, 'buy'), T(20, 99, 4, 'sell'), T(50, 102, 6, 'buy'),
    // bar [60,120): open 101, close 101
    T(70, 101, 8, 'sell'),
  ];
  const bars = computeFootprintBars(trades, { barSec: 60, binSize: 1 });
  assert.equal(bars.length, 2);
  const [b0, b1] = bars;
  assert.deepEqual([b0.ts, b0.open, b0.high, b0.low, b0.close], [0, 100, 102, 99, 102]);
  assert.equal(b0.volume, 20);
  assert.equal(b0.delta, 12, '+10 −4 +6');
  assert.equal(b0.cvd, 12);
  assert.equal(b1.delta, -8);
  assert.equal(b1.cvd, 4, 'running CVD across bars');
  assert.equal(b0.bins.length, 3);
  assert.equal(b0.bins.find((x) => x.price === 99).delta, -4);
  assert.ok(b0.valid && b1.valid, 'validateBar (reused gate) passes clean bars');
  // ms timestamps honored:
  const barsMs = computeFootprintBars(trades.map((t) => ({ ...t, ts: t.ts * 1000 })), { barSec: 60, binSize: 1, tsUnit: 'ms' });
  assert.equal(barsMs.length, 2);
  assert.equal(barsMs[0].delta, 12);
  assert.deepEqual(computeFootprintBars([], {}), []);
  assert.deepEqual(computeFootprintBars(null, {}), []);
});

// ═══ GREEN — AMT regime signals ═══════════════════════════════════════════════

test('AMT SIGNALS: initiative acceptance vs responsive rejection at the VA edges', () => {
  arm();
  const va = { vah: 102, val: 100, poc: 101 };
  const bar = (ts, close, delta, volume) => ({ ts, open: close, high: close, low: close, close, delta, volume, valid: true });

  // Initiative buy: close above VAH, delta strongly positive (ratio 0.5 ≥ 0.15)
  let s = amtSignals([bar(10, 103, 50, 100)], va, { market: 'ES-USD' });
  assert.equal(s.length, 1);
  assert.equal(s[0].side, 'long');
  assert.equal(s[0].regime, 'initiative-buy');
  assert.equal(s[0].factorId, 'footprint-amt-ES-USD');
  assert.equal(s[0].source, 'footprint');
  assert.equal(s[0].value, 50);
  assert.ok(s[0].confidence > 0 && s[0].confidence <= 0.60, 'confidence capped');

  // Responsive fade: close above VAH but delta NEGATIVE (unconfirmed breach) → short
  s = amtSignals([bar(11, 103, -5, 100)], va, { market: 'ES-USD' });
  assert.equal(s[0].side, 'short');
  assert.equal(s[0].regime, 'responsive-fade-high');

  // Initiative sell below VAL
  s = amtSignals([bar(12, 99, -40, 100)], va, { market: 'ES-USD' });
  assert.equal(s[0].side, 'short');
  assert.equal(s[0].regime, 'initiative-sell');

  // Responsive fade at the low: breach with buy-side delta → long
  s = amtSignals([bar(13, 99, 10, 100)], va, { market: 'ES-USD' });
  assert.equal(s[0].side, 'long');
  assert.equal(s[0].regime, 'responsive-fade-low');

  // Absorption-ish: breach with heavy volume, near-zero delta ratio (0.02 < 0.15) → responsive
  s = amtSignals([bar(14, 103, 4, 200)], va, { market: 'ES-USD' });
  assert.equal(s[0].regime, 'responsive-fade-high', 'unconfirmed heavy-volume push treated responsive');

  // Inside value → no signal
  assert.deepEqual(amtSignals([bar(15, 101, 30, 100)], va, { market: 'ES-USD' }), []);

  // Default = last bar only; emitPerBar → all classified bars
  const seq = [bar(1, 103, 50, 100), bar(2, 101, 0, 100), bar(3, 99, -40, 100)];
  assert.equal(amtSignals(seq, va, { market: 'X' }).length, 1, 'live mode: last bar only');
  assert.equal(amtSignals(seq, va, { market: 'X', emitPerBar: true }).length, 2, 'research mode: every classified bar (inside-VA bar emits nothing)');

  // Garbage guards: inverted VA, missing VA, invalid bars → []
  assert.deepEqual(amtSignals([bar(1, 103, 5, 10)], { vah: 100, val: 102 }), [], 'inverted VA refused');
  assert.deepEqual(amtSignals([bar(1, 103, 5, 10)], null), []);
  assert.deepEqual(amtSignals([{ ts: 1, close: 103, delta: 5, volume: 0 }], va), [], 'zero-volume bar refused');
  assert.deepEqual(amtSignals([{ ...bar(1, 103, 50, 100), valid: false }], va), [], 'validateBar-failed bar refused');
});

// ═══ GREEN — tape seam (loadTape REUSED) ══════════════════════════════════════

test('profileFromTape: recorded trade lines → profile through the real tape loader', () => {
  arm();
  // Binance-contract trade lines (ms ts) — the same shape the nautilus recorder emits.
  const lines = [
    { t: 'trade', ts: 1000, s: 'ES', p: '100', q: '18', m: false }, // buy 18 @100
    { t: 'trade', ts: 1500, s: 'ES', p: '100', q: '12', m: true },  // sell 12 @100
    { t: 'trade', ts: 2000, s: 'ES', p: '102', q: '50', m: false }, // buy 50 @102
    { t: 'trade', ts: 9999999, s: 'ES', p: '999', q: '99', m: false }, // OUTSIDE window
  ];
  const p = profileFromTape(lines, { t0: 0, t1: 3000, binSize: 1 });
  assert.equal(p.poc, 102);
  assert.equal(p.totalVol, 80, 'window-bounded: the 999 trade excluded');
  assert.equal(p.bins.find((b) => b.price === 100).delta, 6);
  assert.equal(profileFromTape(lines, { t0: 5, t1: 1 }), null, 't1<t0 refused');
});
