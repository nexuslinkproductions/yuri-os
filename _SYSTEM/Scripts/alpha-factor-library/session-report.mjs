#!/usr/bin/env node
// @capability: crypto-train-session-report
// @serves: win rate scorecard | training session report | paper trade stats | profit factor | trade win loss breakdown
// @does: computes a WIN-RATE SCORECARD for one bounded paper training session — reads the close records from a paper ledger (JSONL), aggregates win rate, avg win/loss, profit factor, net P&L, return %, drawdown, liquidation count, and a per-exit-reason breakdown. Pure (no network); pairs with train-session.mjs + param-sweep.mjs.
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
  return {
    config,
    closedTrades: n,
    winRate: n ? r4(wins.length / n) : 0,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? r2(sumWin / wins.length) : 0,
    avgLoss: losses.length ? r2(-sumLoss / losses.length) : 0,
    profitFactor: sumLoss > 0 ? r2(sumWin / sumLoss) : (sumWin > 0 ? Infinity : 0),
    netPnl: r2(netPnl),
    returnPct: startingEquity > 0 ? r2((netPnl / startingEquity) * 100) : 0,
    finalEquity: r2(finalEquity),
    maxDrawdownPct: isNum(pnl.maxDrawdownBps) ? r2(pnl.maxDrawdownBps / 100) : null,
    totalFees: isNum(pnl.totalFees) ? r2(pnl.totalFees) : null,
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
  return [
    `── TRAIN SESSION SCORECARD ──`,
    `config:   lev=${c.leverage ?? '?'}x risk=${c.riskPct ?? '?'} bankroll=${c.bankroll ?? '?'} cycles=${c.cycles ?? '?'} ${c.market ?? ''}`,
    `trades:   ${rep.closedTrades}  (W ${rep.wins} / L ${rep.losses})`,
    `WIN RATE: ${(rep.winRate * 100).toFixed(1)}%   profit factor: ${pf}`,
    `avg win:  ${rep.avgWin}   avg loss: ${rep.avgLoss}`,
    `net P&L:  ${rep.netPnl}   return: ${rep.returnPct}%   final equity: ${rep.finalEquity}`,
    `costs:    fees ${rep.totalFees} | funding ${rep.totalFunding} | liquidations ${rep.liquidations}`,
    `max DD:   ${rep.maxDrawdownPct}%`,
    `exits:    ${reasons}`,
  ].join('\n');
}
