#!/usr/bin/env node
// @capability: crypto-trainer-snapshot-publish
// @serves: publish trainer snapshot | train session latest json | perp trainer panel data | refresh win rate board | trainer dashboard feed
// @does: runs ONE headline perp train-session (real funding + equity curve) plus a leverage×riskPct sweep on the SAME freshly-fetched Binance bars, and atomically writes the unified scorecard to _SYSTEM/state/train-session-latest.json — the data feed the board's /api/observatory/trainer route + Perp Trainer panel render. Paper-only analysis; never touches the live daemon.
// @use: node train-publish.mjs --market BTCUSDT --cycles 500 --bankroll 300 ; run on demand or from a cron to refresh the board's trainer panel.
// @exports: publishTrainerSnapshot, TRAINER_SNAPSHOT_PATH
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

import { runTrainSession } from './train-session.mjs';
import { paramSweep } from './param-sweep.mjs';
import * as PerpAdapter from './adapters/perp-adapter.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(_HERE, '..', '..', 'state');
export const TRAINER_SNAPSHOT_PATH = path.join(STATE_DIR, 'train-session-latest.json');

/**
 * publishTrainerSnapshot(opts) -> snapshot object (also written to TRAINER_SNAPSHOT_PATH).
 * Fetches bars ONCE; the headline session applies real funding, the sweep holds it out for a clean
 * relative comparison. Pass opts.bars for a deterministic offline publish (tests).
 */
export async function publishTrainerSnapshot(opts = {}) {
  const cfg = {
    market: 'BTCUSDT', interval: '1m', bankroll: 300, cycles: 500, warmup: 60,
    headlineLeverage: 20, headlineRiskPct: 0.03,
    levGrid: opts.levGrid || [5, 10, 20, 25],
    riskGrid: opts.riskGrid || [0.01, 0.03, 0.05],
    ...opts,
  };

  // One bar fetch shared by headline + sweep (deterministic comparison, single network call).
  let bars = Array.isArray(opts.bars) ? opts.bars : null;
  if (!bars) {
    const limit = Math.min(cfg.cycles + cfg.warmup + 5, 1500);
    const res = await PerpAdapter.getCandles(cfg.market, { interval: cfg.interval, limit });
    bars = res.candles;
  }

  const headline = await runTrainSession({
    leverage: cfg.headlineLeverage, riskPct: cfg.headlineRiskPct,
    bankroll: cfg.bankroll, cycles: cfg.cycles, market: cfg.market,
    warmup: cfg.warmup, bars, skipFunding: !!opts.skipFunding, tag: 'publish-headline',
  });

  const sweep = await paramSweep({
    market: cfg.market, bankroll: cfg.bankroll, cycles: cfg.cycles, warmup: cfg.warmup,
    levGrid: cfg.levGrid, riskGrid: cfg.riskGrid, bars,
  });

  const top = sweep[0];
  const snapshot = {
    generatedAt: opts.now ?? Date.now(),
    market: cfg.market,
    interval: cfg.interval,
    bankroll: cfg.bankroll,
    barCount: bars.length,
    headline,                                 // full report incl equityCurve + byReason
    sweep: sweep.map((r) => ({ leverage: r.leverage, riskPct: r.riskPct,
      winRate: r.report.winRate, profitFactor: r.report.profitFactor === Infinity ? null : r.report.profitFactor,
      netPnl: r.report.netPnl, returnPct: r.report.returnPct, maxDrawdownPct: r.report.maxDrawdownPct,
      closedTrades: r.report.closedTrades, liquidations: r.report.liquidations })),
    best: top ? { leverage: top.leverage, riskPct: top.riskPct, winRate: top.report.winRate,
      netPnl: top.report.netPnl, returnPct: top.report.returnPct } : null,
    advisory: 'paper training — not live. Win rate is the target metric; leverage scales magnitude, not win rate.',
  };

  try { mkdirSync(STATE_DIR, { recursive: true }); } catch { /* ok */ }
  // Atomic write so the /trainer route never reads a half-written file.
  const tmp = `${TRAINER_SNAPSHOT_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  renameSync(tmp, TRAINER_SNAPSHOT_PATH);
  return snapshot;
}

// CLI
const _SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(_SELF)) {
  const a = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--market') opts.market = a[++i];
    else if (a[i] === '--cycles') opts.cycles = Number(a[++i]);
    else if (a[i] === '--bankroll') opts.bankroll = Number(a[++i]);
    else if (a[i] === '--interval') opts.interval = a[++i];
  }
  publishTrainerSnapshot(opts)
    .then((s) => {
      const h = s.headline;
      console.log(`✓ trainer snapshot → ${TRAINER_SNAPSHOT_PATH}`);
      console.log(`  headline: ${h.closedTrades} trades · winRate ${(h.winRate * 100).toFixed(1)}% · net ${h.netPnl} · return ${h.returnPct}% · equityCurve ${h.equityCurve?.length ?? 0}pts`);
      if (s.best) console.log(`  best sweep config: lev ${s.best.leverage}x risk ${s.best.riskPct} → winRate ${(s.best.winRate * 100).toFixed(1)}%`);
    })
    .catch((e) => { console.error('train-publish error:', e.message); process.exit(1); });
}
