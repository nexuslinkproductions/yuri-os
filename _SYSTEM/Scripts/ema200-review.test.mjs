// ema200-review tests.
// Regression anchor: the rule-v1 defect documented in the freeze changelog —
// back-dated onto a real 5-day window, v1 reported 16 winners of 23 because a setup
// that was never reached could still "win". ENTRY_TRIGGER_V2 must make that impossible.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFreeze, evaluateTrade, evaluateEntry, brier, spearman, aggregate, review, quotesTemplate,
} from './ema200-review.mjs';

const bar = (date, low, high, close) => ({
  date, open: (low + high) / 2, high, low, close: close ?? (low + high) / 2, volume: 1e6,
});

const COHR = { ticker: 'COHR', entry: 266.16, stop: 219.58, target: 326.18, close: 222.05, p: 0.38, rank: 19 };
const WMB = { ticker: 'WMB', entry: 69.33, stop: 65.97, target: 73.60, close: 70.13, p: 0.73, rank: 1 };

describe('ENTRY_TRIGGER_V2', () => {

  it('1. price never reaches the entry → NOT_TRIGGERED, no R (the v1 defect)', () => {
    // COHR closed at 222.05, entry sits at 266.16 — 20% away. v1 called this a winner.
    const bars = [bar('2026-07-30', 215, 228), bar('2026-07-31', 218, 231), bar('2026-08-03', 220, 234)];
    const t = evaluateTrade(COHR, bars);
    assert.equal(t.state, 'NOT_TRIGGERED');
    assert.equal(t.r, null, 'NOT_TRIGGERED must carry no R');
  });

  it('2. a bar containing the entry arms the trade', () => {
    const bars = [bar('2026-07-30', 260, 270, 268), bar('2026-07-31', 265, 272, 270)];
    const t = evaluateTrade(COHR, bars);
    assert.equal(t.state, 'OPEN');
    assert.equal(t.triggerDate, '2026-07-30');
  });

  it('3. target reached after trigger → +R equal to the CRV', () => {
    const bars = [bar('2026-07-30', 68.9, 70.2), bar('2026-07-31', 70, 74.0)];
    const t = evaluateTrade(WMB, bars);
    assert.equal(t.state, 'TARGET');
    assert.ok(Math.abs(t.r - (73.60 - 69.33) / (69.33 - 65.97)) < 1e-9);
    assert.ok(t.r > 1.26 && t.r < 1.28, `expected ~1.27 CRV, got ${t.r}`);
  });

  it('4. stop takes precedence over target inside one bar — no intrabar path assumed', () => {
    const bars = [bar('2026-07-30', 65.0, 74.0)]; // touches entry, stop AND target
    const t = evaluateTrade(WMB, bars);
    assert.equal(t.state, 'STOPPED');
    assert.equal(t.r, -1);
  });

  it('5. a stop breached BEFORE the entry is touched does not count', () => {
    // gap below the stop first, then rally through the entry: trade arms on the later bar
    const bars = [bar('2026-07-30', 60, 64), bar('2026-07-31', 68.5, 71.0, 70.5)];
    const t = evaluateTrade(WMB, bars);
    assert.equal(t.state, 'OPEN');
    assert.equal(t.triggerDate, '2026-07-31');
  });
});

describe('REVERSAL_CONFIRMED', () => {

  it('6. above the freeze close but below the EMA200 → not confirmed', () => {
    const q = { ema200: 72.0, bars: [bar('2026-08-06', 70, 71.5, 71.0)] };
    const r = evaluateEntry(WMB, q, '2026-08-06');
    assert.equal(r.reversal, false);
    assert.equal(r.reversalParts.aboveFreezeClose, true);
    assert.equal(r.reversalParts.aboveEma200, false);
  });

  it('7. above the EMA200 but below the freeze close → not confirmed (sideways does not count)', () => {
    const q = { ema200: 68.0, bars: [bar('2026-08-06', 68.5, 70.0, 69.5)] };
    const r = evaluateEntry(WMB, q, '2026-08-06');
    assert.equal(r.reversal, false);
  });

  it('8. above both → confirmed', () => {
    const q = { ema200: 69.5, bars: [bar('2026-08-06', 70, 72, 71.4)] };
    const r = evaluateEntry(WMB, q, '2026-08-06');
    assert.equal(r.reversal, true);
  });

  it('9. bars outside the window are ignored', () => {
    const q = { ema200: 69.5, bars: [bar('2026-07-29', 74, 76, 75), bar('2026-08-06', 70, 72, 71.4)] };
    const r = evaluateEntry(WMB, q, '2026-08-06');
    assert.equal(r.closeAsOf, 71.4, 'the 2026-07-29 bar is the freeze bar, not a window bar');
  });

  it('10. missing EMA200 → NO_DATA, never a silent false', () => {
    const r = evaluateEntry(WMB, { bars: [bar('2026-08-06', 70, 72, 71.4)] }, '2026-08-06');
    assert.equal(r.status, 'NO_DATA');
    assert.deepEqual(r.missing, ['ema200']);
    assert.equal(r.reversal, null);
  });

  it('11. EMA200 computed from a supplied close series', () => {
    const series = Array.from({ length: 260 }, () => 60);
    const q = { ema200: null, series, bars: [bar('2026-08-06', 70, 72, 71.4)] };
    const r = evaluateEntry(WMB, q, '2026-08-06');
    assert.equal(r.status, 'SCORED');
    assert.ok(Math.abs(r.ema200 - 60) < 1e-6);
    assert.equal(r.reversalParts.ema200From, 'computed-from-series');
  });
});

describe('aggregates', () => {

  it('12. brier of a perfectly confident correct call is 0', () => {
    assert.equal(brier([{ p: 1, outcome: true }, { p: 0, outcome: false }]), 0);
  });

  it('13. brier of a perfectly confident wrong call is 1', () => {
    assert.equal(brier([{ p: 1, outcome: false }]), 1);
  });

  it('14. spearman of a monotone pair is 1', () => {
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9);
  });

  it('15. spearman of an inverted pair is -1', () => {
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [40, 30, 20, 10]) + 1) < 1e-9);
  });

  it('16. the earnings cohort is split out of the clean cohort', () => {
    const freeze = loadFreeze();
    const results = freeze.entries.map(e => ({
      ticker: e.ticker, status: 'SCORED', p: e.p, reversal: true, ret: 0.01,
      trade: { state: 'OPEN', r: 0.5 },
    }));
    const agg = aggregate(results, freeze, '2026-08-06');
    assert.equal(agg.all.n, 23);
    assert.equal(agg.clean.n + agg.event.n, 23);
    assert.ok(agg.event.n >= 6, `expected the August reporters in the event cohort, got ${agg.event.n}`);
    // NVDA reports 2026-08-26 — clean at the interim date, event at the primary date
    const primary = aggregate(results, freeze, '2026-08-26');
    assert.ok(primary.event.n > agg.event.n, 'the 26.08 window must capture more reporters');
  });
});

describe('evidence discipline', () => {

  it('17. unverified quotes are never authoritative', () => {
    const freeze = loadFreeze();
    const q = { asOf: '2026-08-06', source: 'guessed', verified: false, tickers: {} };
    assert.equal(review(freeze, q, '2026-08-06').authoritative, false);
  });

  it('18. verified quotes with a named source are authoritative', () => {
    const freeze = loadFreeze();
    const q = { asOf: '2026-08-06', source: 'nasdaq daily OHLCV', verified: true, tickers: {} };
    assert.equal(review(freeze, q, '2026-08-06').authoritative, true);
  });

  it('19. verified:true with an empty source is still not authoritative', () => {
    const freeze = loadFreeze();
    const q = { asOf: '2026-08-06', source: '', verified: true, tickers: {} };
    assert.equal(review(freeze, q, '2026-08-06').authoritative, false);
  });

  it('20. no quotes at all → every title NO_DATA, no reversal claimed', () => {
    const freeze = loadFreeze();
    const rv = review(freeze, { source: '', verified: false, tickers: {} }, '2026-08-06');
    assert.equal(rv.results.length, 23);
    assert.ok(rv.results.every(r => r.status === 'NO_DATA'));
    assert.equal(rv.aggregates.all.n, 0);
  });
});

describe('freeze integrity', () => {

  it('21. 23 entries, unique tickers, ranks 1..23', () => {
    const freeze = loadFreeze();
    assert.equal(freeze.entries.length, 23);
    assert.equal(new Set(freeze.entries.map(e => e.ticker)).size, 23);
    assert.deepEqual(freeze.entries.map(e => e.rank).sort((a, b) => a - b),
      Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it('22. every entry has stop < entry < target and a probability in the stated band', () => {
    for (const e of loadFreeze().entries) {
      assert.ok(e.stop < e.entry, `${e.ticker}: stop must sit below entry`);
      assert.ok(e.entry < e.target, `${e.ticker}: target must sit above entry`);
      assert.ok(e.p >= 0.08 && e.p <= 0.78, `${e.ticker}: p=${e.p} outside the declared 8–78% band`);
    }
  });

  it('23. the stated CRV matches entry/stop/target within transcription tolerance', () => {
    for (const e of loadFreeze().entries) {
      const derived = (e.target - e.entry) / (e.entry - e.stop);
      assert.ok(Math.abs(derived - e.crv) < 0.02,
        `${e.ticker}: stated CRV ${e.crv}, derived ${derived.toFixed(3)} — transcription error?`);
    }
  });

  it('24. the stated stop percentage matches entry and stop', () => {
    for (const e of loadFreeze().entries) {
      const derived = (e.stop - e.entry) / e.entry;
      assert.ok(Math.abs(derived - e.stopPct) < 0.005,
        `${e.ticker}: stated stopPct ${e.stopPct}, derived ${derived.toFixed(4)}`);
    }
  });

  it('25. the stated distance matches close and entry', () => {
    for (const e of loadFreeze().entries) {
      const derived = (e.close - e.entry) / e.entry;
      assert.ok(Math.abs(derived - e.dist) < 0.006,
        `${e.ticker}: stated dist ${e.dist}, derived ${derived.toFixed(4)}`);
    }
  });

  it('26. reconstruction is declared, never passed off as original', () => {
    const freeze = loadFreeze();
    assert.equal(freeze.provenance.reconstructed, true);
    assert.equal(freeze.rules.REVERSAL_CONFIRMED.verbatim, true);
    assert.equal(freeze.rules.TRADE_OUTCOME.reconstructed, true);
    assert.equal(freeze.rules.CALIBRATION.reconstructed, true);
  });

  it('27. the quotes template covers every frozen ticker', () => {
    const freeze = loadFreeze();
    const t = quotesTemplate(freeze, '2026-08-06');
    assert.equal(Object.keys(t.tickers).length, 23);
    assert.equal(t.verified, false, 'a template must never claim verification');
  });
});
