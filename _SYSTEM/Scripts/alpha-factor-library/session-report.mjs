#!/usr/bin/env node
// @capability: crypto-train-session-report
// @serves: expectancy scorecard | win rate scorecard | training session report | paper trade stats | profit factor | trade win loss breakdown | sharpe calmar fee coverage
// @does: computes an EXPECTANCY-FIRST SCORECARD for one bounded paper training session — reads the close records from a paper ledger (JSONL), aggregates expectancy, sharpe, calmar, fee-coverage, win rate, avg win/loss, profit factor, net P&L, return %, drawdown, liquidation count, and a per-exit-reason breakdown. Pure (no network); pairs with train-session.mjs + param-sweep.mjs.
// @use: import { computeSessionReport, formatScorecard } from './session-report.mjs' — call after a train-session run with the session paper-ledger path + starting equity + engine.pnl().
// @exports: computeSessionReport, formatScorecard, readCloses
import { readFileSync, existsSync } from 'node:fs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const r4 = (x) => Math.round((x + Number.EPSILON) * 10000) / 10000;

/**
 * readCloses(ledgerPath) -> close records [{ netPnl, grossPnl, reason, entryPx, exitPx, side, qty, ... }]
 * Reads the append-only paper JSONL and keeps only type:'close' rows (afl-paper execClose shape).
 */
export function readCloses(ledgerPath) {
  if (!ledgerPath || !existsSync(ledgerPath)) return [];
  const out = [];
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const rec = JSON.parse(line); if (rec && rec.type === 'close') out.push(rec); } catch { /* skip malformed */ }
  }
  return out;
}

/**
 * computeSessionReport({ paperLedgerPath | closes, startingEquity, pnl, config }) -> scorecard object.
 * Win = a close with netPnl > 0 (net of fees + funding, since execClose's netPnl already subtracts them).
 * pnl is the engine.pnl() snapshot (equity, totalFees, totalFunding, maxDrawdownBps). config is echoed.
 *
 * New fields (expectancy-first):
 *   expectancy   — mean net P&L per trade = netPnl / closedTrades. Headline metric.
 *   sharpe       — per-trade Sharpe = mean(netPnl_i) / population-stddev(netPnl_i). 0 when <2 trades or stddev=0.
 *   calmar       — returnPct / maxDrawdownPct. null when drawdown missing or 0.
 *   feeCoverage  — sum(|grossPnl_i|) / totalFees. null when fees=0 or grossPnl absent on closes.
 */
export function computeSessionReport({ paperLedgerPath, closes: closesIn, startingEquity = 0, pnl = {}, config = {} } = {}) {
  const closes = Array.isArray(closesIn) ? closesIn : readCloses(paperLedgerPath);
  const n = closes.length;
  const wins = closes.filter((c) => isNum(c.netPnl) && c.netPnl > 0);
  const losses = closes.filter((c) => isNum(c.netPnl) && c.netPnl <= 0);
  const sumWin = wins.reduce((s, c) => s + c.netPnl, 0);
  const sumLoss = Math.abs(losses.reduce((s, c) => s + c.netPnl, 0));
  const netPnl = closes.reduce((s, c) => s + (isNum(c.netPnl) ? c.netPnl : 0), 0);
  const byReason = {};
  for (const c of closes) { const k = c.reason || 'unknown'; byReason[k] = (byReason[k] || 0) + 1; }
  const finalEquity = isNum(pnl.equity) ? pnl.equity : (startingEquity + netPnl);
  const maxDrawdownPct = isNum(pnl.maxDrawdownBps) ? r2(pnl.maxDrawdownBps / 100) : null;
  const returnPct = startingEquity > 0 ? r2((netPnl / startingEquity) * 100) : 0;
  const totalFees = isNum(pnl.totalFees) ? r2(pnl.totalFees) : null;

  // expectancy: mean net P&L per trade (the headline — invariant to leverage scaling bias of win-rate)
  const expectancy = n > 0 ? r2(netPnl / n) : 0;

  // per-trade Sharpe: mean / population-stddev over close netPnl values
  let sharpe = 0;
  if (n >= 2) {
    const pnls = closes.map((c) => (isNum(c.netPnl) ? c.netPnl : 0));
    const mean = netPnl / n;
    const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / n; // population variance
    const stddev = Math.sqrt(variance);
    sharpe = stddev > 0 ? r2(mean / stddev) : 0;
  }

  // calmar: return / maxDD (null when drawdown unavailable or zero — can't divide)
  const calmar = (maxDrawdownPct !== null && maxDrawdownPct > 0) ? r2(returnPct / maxDrawdownPct) : null;

  // feeCoverage: sum(|grossPnl_i|) / totalFees — answers "does the edge clear fees".
  // grossPnl is an optional field on close records (present when the engine records it separately).
  // If absent from ALL closes, we return null rather than inventing a number.
  let feeCoverage = null;
  const grossPnls = closes.map((c) => (isNum(c.grossPnl) ? Math.abs(c.grossPnl) : null));
  const hasGross = grossPnls.some((v) => v !== null);
  if (hasGross && totalFees !== null && totalFees > 0) {
    const sumGross = grossPnls.reduce((s, v) => s + (v ?? 0), 0);
    feeCoverage = r2(sumGross / totalFees);
  }
  // (feeCoverage is null when closes lack grossPnl — the engine records netPnl by default; grossPnl
  //  is an optional enrichment. Null is honest; do not substitute netPnl which is post-fee.)

  return {
    config,
    closedTrades: n,
    // --- expectancy-first block ---
    expectancy,
    sharpe,
    calmar,
    feeCoverage,
    // --- existing fields (kept; winRate now secondary) ---
    winRate: n ? r4(wins.length / n) : 0,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? r2(sumWin / wins.length) : 0,
    avgLoss: losses.length ? r2(-sumLoss / losses.length) : 0,
    profitFactor: sumLoss > 0 ? r2(sumWin / sumLoss) : (sumWin > 0 ? Infinity : 0),
    netPnl: r2(netPnl),
    returnPct,
    finalEquity: r2(finalEquity),
    maxDrawdownPct,
    totalFees,
    totalFunding: isNum(pnl.totalFunding) ? r2(pnl.totalFunding) : null,
    liquidations: byReason.liquidation || 0,
    byReason,
  };
}

/** formatScorecard(report) -> compact human-readable text block. */
export function formatScorecard(rep) {
  const c = rep.config || {};
  const pf = rep.profitFactor === Infinity ? '∞' : rep.profitFactor;
  const reasons = Object.entries(rep.byReason || {}).map(([k, v]) => `${k}:${v}`).join(' ');
  const calmarStr = rep.calmar !== null && rep.calmar !== undefined ? rep.calmar : 'n/a';
  const feeCovStr = rep.feeCoverage !== null && rep.feeCoverage !== undefined ? rep.feeCoverage : 'n/a';
  return [
    `── TRAIN SESSION SCORECARD ──`,
    `config:      lev=${c.leverage ?? '?'}x risk=${c.riskPct ?? '?'} bankroll=${c.bankroll ?? '?'} cycles=${c.cycles ?? '?'} ${c.market ?? ''}`,
    `trades:      ${rep.closedTrades}  (W ${rep.wins} / L ${rep.losses})`,
    `EXPECTANCY:  ${rep.expectancy}  sharpe: ${rep.sharpe}  calmar: ${calmarStr}  fee-coverage: ${feeCovStr}x`,
    `win rate:    ${(rep.winRate * 100).toFixed(1)}%   profit factor: ${pf}`,
    `avg win:     ${rep.avgWin}   avg loss: ${rep.avgLoss}`,
    `net P&L:     ${rep.netPnl}   return: ${rep.returnPct}%   final equity: ${rep.finalEquity}`,
    `costs:       fees ${rep.totalFees} | funding ${rep.totalFunding} | liquidations ${rep.liquidations}`,
    `max DD:      ${rep.maxDrawdownPct}%`,
    `exits:       ${reasons}`,
  ].join('\n');
}
