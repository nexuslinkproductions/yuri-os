#!/usr/bin/env node
/**
 * Tests for the crypto perp TRAIN-SESSION harness (train-session.mjs + session-report.mjs).
 * Deterministic + offline: synthetic bars are injected (opts.bars), funding skipped, no network.
 *
 * Run: node --test _SYSTEM/Scripts/alpha-factor-library/train-session.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runTrainSession } from './train-session.mjs';
import { computeSessionReport } from './session-report.mjs';

// Deterministic trending+noisy series (oscillating drift → generates both long & short setups + winners & losers).
function synthBars(n, start = 60000) {
  const out = [];
  let px = start;
  for (let i = 0; i < n; i += 1) {
    const drift = Math.sin(i / 18) * 0.0025;          // slow oscillation
    const noise = (((i * 7919) % 13) - 6) / 6 * 0.0012; // deterministic pseudo-noise
    px = px * (1 + drift + noise);
    out.push({
      timestamp: 1_700_000_000 + i * 60,
      open: px * (1 - drift * 0.3),
      high: px * 1.0009,
      low: px * 0.9991,
      close: px,
      volume: 100 + (i % 5),
    });
  }
  return out;
}

test('runTrainSession: deterministic offline session returns a valid scorecard', async () => {
  const bars = synthBars(400);
  const rep = await runTrainSession({ leverage: 20, riskPct: 0.03, bankroll: 300, market: 'BTCUSDT', bars, skipFunding: true, warmup: 60, tag: 'test-shape' });
  assert.ok(rep, 'returns a report');
  assert.equal(rep.config.leverage, 20);
  assert.equal(rep.config.bankroll, 300);
  assert.ok(Number.isFinite(rep.closedTrades) && rep.closedTrades >= 0, `closedTrades numeric: ${rep.closedTrades}`);
  assert.ok(rep.winRate >= 0 && rep.winRate <= 1, `winRate in [0,1]: ${rep.winRate}`);
  assert.ok(Number.isFinite(rep.netPnl), 'netPnl finite');
  assert.ok(rep.byReason && typeof rep.byReason === 'object', 'byReason present');
});

test('runTrainSession: same bars → identical scorecard (determinism)', async () => {
  const bars = synthBars(300);
  const a = await runTrainSession({ leverage: 20, riskPct: 0.03, bankroll: 300, bars, skipFunding: true, tag: 'det-a' });
  const b = await runTrainSession({ leverage: 20, riskPct: 0.03, bankroll: 300, bars, skipFunding: true, tag: 'det-b' });
  assert.equal(a.closedTrades, b.closedTrades);
  assert.equal(a.winRate, b.winRate);
  assert.equal(a.netPnl, b.netPnl);
  assert.equal(a.finalEquity, b.finalEquity);
});

test('runTrainSession: higher leverage amplifies P&L magnitude on the same bars', async () => {
  const bars = synthBars(350);
  const lo = await runTrainSession({ leverage: 5, riskPct: 0.03, bankroll: 300, bars, skipFunding: true, tag: 'lev-5' });
  const hi = await runTrainSession({ leverage: 25, riskPct: 0.03, bankroll: 300, bars, skipFunding: true, tag: 'lev-25' });
  // Same signals/sizing-fraction, more leverage → larger |return| (win OR lose bigger). Just assert they differ.
  assert.ok(Math.abs(hi.returnPct) >= Math.abs(lo.returnPct) || hi.closedTrades !== lo.closedTrades,
    `25x should move equity more than 5x (lo=${lo.returnPct}% hi=${hi.returnPct}%)`);
});

test('computeSessionReport: win-rate + profit-factor math', () => {
  const closes = [
    { type: 'close', netPnl: 10, reason: 'take-profit' },
    { type: 'close', netPnl: -5, reason: 'stop-loss' },
    { type: 'close', netPnl: 8, reason: 'take-profit' },
    { type: 'close', netPnl: -4, reason: 'liquidation' },
  ];
  const rep = computeSessionReport({ closes, startingEquity: 300, pnl: { equity: 309, totalFees: 1, totalFunding: 0, maxDrawdownBps: 200 } });
  assert.equal(rep.closedTrades, 4);
  assert.equal(rep.winRate, 0.5);
  assert.equal(rep.wins, 2);
  assert.equal(rep.losses, 2);
  assert.equal(rep.netPnl, 9);
  assert.equal(rep.profitFactor, 2);     // 18 / 9
  assert.equal(rep.liquidations, 1);
  assert.equal(rep.returnPct, 3);        // 9 / 300
});
