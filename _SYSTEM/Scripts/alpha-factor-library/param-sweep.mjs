#!/usr/bin/env node
// @capability: crypto-perp-param-sweep
// @serves: sweep leverage | optimize win rate | parameter grid search | tune trading config | find best leverage risk
// @does: runs the train-session across a leverage × riskPct grid on ONE shared bar set (fetched once → deterministic + cheap), collects each run's win-rate scorecard, and ranks by win rate then net P&L to surface the best config. The optimize step of the train→refine→optimize loop.
// @use: node param-sweep.mjs --cycles 400 --market BTCUSDT ; or import { paramSweep } and pass {bars} for a deterministic offline sweep.
// @exports: paramSweep, formatSweep
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runTrainSession } from './train-session.mjs';
import * as PerpAdapter from './adapters/perp-adapter.mjs';

const r2 = (x) => (x === Infinity ? 'inf' : Math.round((x + Number.EPSILON) * 100) / 100);

/**
 * paramSweep(opts) -> ranked results [{ leverage, riskPct, report }]. Fetches bars ONCE and replays the
 * SAME series through every config (deterministic + ~free). Pass opts.bars for a fully offline sweep.
 */
export async function paramSweep(opts = {}) {
  const cfg = {
    market: 'BTCUSDT', interval: '1m', bankroll: 300, cycles: 500, warmup: 60,
    levGrid: opts.levGrid || [5, 10, 20, 25],
    riskGrid: opts.riskGrid || [0.01, 0.03, 0.05],
    ...opts,
  };
  let bars = Array.isArray(opts.bars) ? opts.bars : null;
  if (!bars) {
    const limit = Math.min(cfg.cycles + cfg.warmup + 5, 1500);
    const res = await PerpAdapter.getCandles(cfg.market, { interval: cfg.interval, limit });
    bars = res.candles;
  }
  const results = [];
  let idx = 0;
  for (const leverage of cfg.levGrid) {
    for (const riskPct of cfg.riskGrid) {
      idx += 1;
      // skipFunding: funding is fetched once at most; for a relative config comparison we hold it out
      // (it's a small same-direction drag). The single-session CLI applies real funding.
      const report = await runTrainSession({
        leverage, riskPct, bankroll: cfg.bankroll, cycles: cfg.cycles, market: cfg.market,
        warmup: cfg.warmup, bars, skipFunding: true, tag: `sweep-${idx}`,
      });
      results.push({ leverage, riskPct, report });
    }
  }
  // Rank: win rate desc, then net P&L desc.
  results.sort((a, b) => (b.report.winRate - a.report.winRate) || (b.report.netPnl - a.report.netPnl));
  return results;
}

/** formatSweep(results) -> ranked table + winning config. */
export function formatSweep(results) {
  const lines = [
    '=== PARAM SWEEP — ranked by win rate, then net P&L ===',
    'rank  lev   risk   trades  winRate    PF    netP&L   return%  maxDD%  liq',
  ];
  results.forEach((r, i) => {
    const x = r.report;
    lines.push(
      `${String(i + 1).padStart(3)}  ${String(r.leverage).padStart(3)}x  ${(r.riskPct * 100).toFixed(0).padStart(3)}%  ${String(x.closedTrades).padStart(6)}  ${(x.winRate * 100).toFixed(1).padStart(6)}%  ${String(r2(x.profitFactor)).padStart(5)}  ${String(x.netPnl).padStart(7)}  ${String(x.returnPct).padStart(6)}  ${String(x.maxDrawdownPct).padStart(5)}  ${x.liquidations}`,
    );
  });
  const w = results[0];
  if (w) lines.push(`\nWINNING CONFIG: leverage=${w.leverage}x  riskPct=${w.riskPct}  →  winRate ${(w.report.winRate * 100).toFixed(1)}%  netP&L ${w.report.netPnl}  return ${w.report.returnPct}%`);
  return lines.join('\n');
}

// CLI
const _SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(_SELF)) {
  const a = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--cycles') opts.cycles = Number(a[++i]);
    else if (a[i] === '--market') opts.market = a[++i];
    else if (a[i] === '--bankroll') opts.bankroll = Number(a[++i]);
    else if (a[i] === '--interval') opts.interval = a[++i];
  }
  paramSweep(opts)
    .then((res) => { console.log(formatSweep(res)); })
    .catch((e) => { console.error('param-sweep error:', e.message); process.exit(1); });
}
