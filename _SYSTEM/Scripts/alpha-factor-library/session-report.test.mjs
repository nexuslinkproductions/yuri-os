#!/usr/bin/env node
/**
 * Tests for computeSessionReport (session-report.mjs) — expectancy-first metrics.
 * Offline, deterministic, pure functions only. No network.
 *
 * Run: node --test _SYSTEM/Scripts/alpha-factor-library/session-report.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSessionReport, formatScorecard } from './session-report.mjs';

// 4-trade fixture (hand-verified)
// netPnls: [10, -5, 8, -4]  sum=9  mean=2.25  winRate=0.5
const CLOSES_4 = [
  { type: 'close', netPnl: 10, reason: 'take-profit' },
  { type: 'close', netPnl: -5, reason: 'stop-loss' },
  { type: 'close', netPnl: 8, reason: 'take-profit' },
  { type: 'close', netPnl: -4, reason: 'liquidation' },
];
const PNL_4 = { equity: 309, totalFees: 2, totalFunding: 0, maxDrawdownBps: 400 };

// ---------- expectancy ----------
test('expectancy: mean netPnl / closedTrades (hand-check 4-trade)', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: PNL_4 });
  // sum=9, n=4 → 9/4 = 2.25
  assert.equal(rep.expectancy, 2.25, `expected 2.25, got ${rep.expectancy}`);
  assert.equal(rep.closedTrades, 4);
});

test('expectancy: zero when no trades', () => {
  const rep = computeSessionReport({ closes: [], startingEquity: 300, pnl: {} });
  assert.equal(rep.expectancy, 0);
});

test('expectancy: single trade equals its netPnl', () => {
  const rep = computeSessionReport({ closes: [{ netPnl: 7, reason: 'tp' }], startingEquity: 100, pnl: {} });
  assert.equal(rep.expectancy, 7);
});

// ---------- sharpe ----------
test('sharpe: 0 when fewer than 2 trades', () => {
  const rep = computeSessionReport({ closes: [{ netPnl: 5, reason: 'tp' }], startingEquity: 100, pnl: {} });
  assert.equal(rep.sharpe, 0);
});

test('sharpe: 0 when all trades identical (stddev=0)', () => {
  const closes = [{ netPnl: 5 }, { netPnl: 5 }, { netPnl: 5 }];
  const rep = computeSessionReport({ closes, startingEquity: 100, pnl: {} });
  assert.equal(rep.sharpe, 0);
});

test('sharpe: finite + correctly signed on 4-trade fixture', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: PNL_4 });
  // mean=2.25; pop-var = ((10-2.25)^2+(−5−2.25)^2+(8−2.25)^2+(−4−2.25)^2)/4
  //   = (60.0625 + 52.5625 + 33.0625 + 39.0625) / 4 = 184.75 / 4 = 46.1875
  //   stddev = sqrt(46.1875) ≈ 6.7961
  //   sharpe ≈ 2.25 / 6.7961 ≈ 0.33
  assert.ok(Number.isFinite(rep.sharpe), 'sharpe must be finite');
  assert.ok(rep.sharpe > 0, `sharpe should be positive for net-positive session: ${rep.sharpe}`);
  // Round-trip sanity: 2dp
  assert.equal(rep.sharpe, Math.round((rep.sharpe + Number.EPSILON) * 100) / 100);
});

// ---------- calmar ----------
test('calmar: null when maxDrawdownPct is null', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: { totalFees: 0 } });
  assert.equal(rep.calmar, null);
});

test('calmar: null when maxDrawdownPct is zero', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: { maxDrawdownBps: 0 } });
  assert.equal(rep.calmar, null);
});

test('calmar: returnPct / maxDrawdownPct (4-trade fixture)', () => {
  // returnPct = 9/300*100 = 3; maxDrawdownPct = 400/100 = 4 → calmar = 3/4 = 0.75
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: PNL_4 });
  assert.equal(rep.maxDrawdownPct, 4);
  assert.equal(rep.returnPct, 3);
  assert.equal(rep.calmar, 0.75, `expected 0.75 got ${rep.calmar}`);
});

// ---------- feeCoverage ----------
test('feeCoverage: null when closes have no grossPnl field', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: { totalFees: 2 } });
  assert.equal(rep.feeCoverage, null, 'feeCoverage must be null when grossPnl absent');
});

test('feeCoverage: null when totalFees is 0', () => {
  const closes = CLOSES_4.map((c) => ({ ...c, grossPnl: Math.abs(c.netPnl) + 0.5 }));
  const rep = computeSessionReport({ closes, startingEquity: 300, pnl: { totalFees: 0 } });
  assert.equal(rep.feeCoverage, null);
});

test('feeCoverage: sum(|grossPnl_i|) / totalFees when grossPnl present', () => {
  // grossPnls: [11, 6, 9, 5] = 31; totalFees=2 → 31/2 = 15.5
  const closes = CLOSES_4.map((c, i) => ({ ...c, grossPnl: [11, -6, 9, -5][i] }));
  const rep = computeSessionReport({ closes, startingEquity: 300, pnl: { totalFees: 2 } });
  assert.equal(rep.feeCoverage, 15.5, `expected 15.5 got ${rep.feeCoverage}`);
});

// ---------- existing fields still present ----------
test('existing fields intact: winRate, profitFactor, netPnl, byReason, liquidations', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: PNL_4 });
  assert.equal(rep.winRate, 0.5);
  assert.equal(rep.netPnl, 9);
  assert.equal(rep.profitFactor, 2);       // 18 gross-win / 9 gross-loss
  assert.equal(rep.liquidations, 1);
  assert.equal(rep.byReason['take-profit'], 2);
  assert.equal(rep.byReason['stop-loss'], 1);
  assert.equal(rep.byReason['liquidation'], 1);
});

// ---------- sweep ranking order ----------
test('paramSweep ranking: higher expectancy sorts first', async () => {
  // Import paramSweep lazily to avoid import side-effects at test-file load
  const { paramSweep } = await import('./param-sweep.mjs');

  // Build a minimal deterministic bar set — 200 bars is enough for warmup+cycles
  function synthBars(n, start = 40000) {
    const out = [];
    let px = start;
    for (let i = 0; i < n; i += 1) {
      const drift = Math.sin(i / 20) * 0.002;
      const noise = (((i * 6271) % 11) - 5) / 5 * 0.001;
      px = px * (1 + drift + noise);
      out.push({ timestamp: 1_700_000_000 + i * 60, open: px * 0.9998, high: px * 1.001, low: px * 0.999, close: px, volume: 80 + (i % 4) });
    }
    return out;
  }

  const bars = synthBars(250);
  // Narrow grid so the test stays fast
  const results = await paramSweep({ bars, levGrid: [5, 20], riskGrid: [0.02, 0.05], cycles: 80, warmup: 40, bankroll: 300, skipFunding: true });

  assert.ok(results.length > 0, 'sweep returned results');
  // Verify sort invariant: expectancy[i] >= expectancy[i+1] for all consecutive pairs
  for (let i = 0; i < results.length - 1; i += 1) {
    const a = results[i].report.expectancy ?? -Infinity;
    const b = results[i + 1].report.expectancy ?? -Infinity;
    assert.ok(a >= b, `rank ${i + 1} expectancy (${a}) must be >= rank ${i + 2} (${b})`);
  }
});

// ---------- formatScorecard ----------
test('formatScorecard: EXPECTANCY line present + win rate line present', () => {
  const rep = computeSessionReport({ closes: CLOSES_4, startingEquity: 300, pnl: PNL_4 });
  const txt = formatScorecard(rep);
  assert.ok(txt.includes('EXPECTANCY'), `scorecard must include EXPECTANCY line, got:\n${txt}`);
  assert.ok(txt.includes('win rate'), `scorecard must include win rate line, got:\n${txt}`);
});
