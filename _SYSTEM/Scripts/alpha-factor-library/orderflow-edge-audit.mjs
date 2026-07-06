#!/usr/bin/env node
// @capability: orderflow-edge-audit
// @serves: orderflow edge audit | is there edge | cost-adjusted edge | deflated sharpe gate | reject noise | net edge bps | honest edge verdict on a paper run
// @does: Reads a symbol's orderflow paper-trading ledgers (afl-paper.mjs-shaped: close/partial_close rows carry netPnl already fee-netted) + its prediction/outcome ledger, computes per-trade net-of-cost edge in bps, an IC read (signal confidence vs realized directional return, advisory — DISARMED by default via ic-spine's own flag), and gates a HONEST verdict through factor-evaluator's REUSED deflatedSharpe (never rebuilt): INSUFFICIENT below a stated min-trade floor, NO_EDGE when net edge <= 0 or the DSR gate fails, EDGE only when both net edge > 0 AND DSR passes AND n is sufficient.
// @use: auditOrderflowEdge({symbol, paperLedgerPath, predLedgerPath}) after any orderflow-paper.mjs paper run, before trusting its P&L as real edge; CLI: node orderflow-edge-audit.mjs --symbol BTCUSDT
// @exports: auditOrderflowEdge, MIN_TRADES, DSR_CONFIDENCE
//
// WHY THIS EXISTS: a naive baseline paper run of the orderflow loop lost -15.8 bps net. Nobody should
// trust a losing or noise-level strategy just because it "ran" — this is the gate that says so, out loud.
//
// COMPOSITION (capability-first — reuses, does not reinvent):
//   - factor-evaluator.deflatedSharpe(observedSharpe, {nTrials, T, skew, kurtosis, confidence})
//       Bailey & Lopez de Prado False Strategy Theorem. observedSharpe here is the PER-TRADE
//       Sharpe of the net-bps return series (sharpePeriod convention — NOT annualized).
//       `passes` = dsr > confidence (default 0.95, the conventional one-sided bar).
//   - factor-evaluator.benjaminiHochberg — available for a multi-symbol fleet caller; this
//     single-symbol audit gates on DSR alone (nTrials=1, no fleet p-value vector to correct across).
//   - ic-spine.computeIC(signal[], forwardReturn[], {method}) — Spearman rank IC between the
//     ENTRY signal (prediction confidence, signed by predicted direction) and the realized
//     per-trade return. ADVISORY ONLY: ic-spine is DISARMED by default (no
//     _SYSTEM/state/mure-ic-spine.enabled flag) and degrades to {ic:NaN,...} — this audit treats
//     that as "no IC evidence" and NEVER gates the verdict on it (only netEdgeBps + DSR gate the
//     verdict, per spec). A NaN IC is reported honestly, not hidden.
//
// LEDGER SHAPES CONSUMED (verified against afl-paper.mjs + orderflow-paper.mjs, 2026-07-06):
//   paperLedgerPath  (_SYSTEM/state/orderflow-paper-<SYMBOL>.jsonl, written by createPaperEngine):
//     {type:'close', inst, fid, side, qty, entryPx, exitPx, grossPnl, netPnl, eFees, xFee,
//      reason, ots, cts, fills, _seq}
//     {type:'partial_close', inst, fid, side, closeQty, remainQty, fp, xf, grossPnl, ts, _seq}
//     {type:'open', inst, fid, side, qty, fp, fee, conf, cb, ddBps, sigmaBps, adv, ts, _seq}
//     {type:'no_trade', reason, factorId, ts, ...} / {type:'rejected', reason, ...} — context only.
//   predLedgerPath  (_SYSTEM/state/orderflow-paper-pred-<SYMBOL>.jsonl, via prediction-ledger.mjs):
//     {type:'prediction', id, subject, change, predictedEffects:[{target,effect,confidence}], source, ts}
//     {type:'outcome', predictionId, observedEffects:[{target,effect,value}], ts}
//     predictionId / id format: `pred_${instrument}_${factorId}_${openedTs}` (afl-paper.mjs convention).
//
// CONSTRAINTS: paper/analysis only — pure reads, no order path, no network, no key reads.
// Deterministic, fail-soft (a missing/absent ledger degrades to INSUFFICIENT, never a throw).

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deflatedSharpe } from './factor-evaluator.mjs';
import { computeIC } from './ic-spine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(__dirname, '..', '..', 'state');

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Minimum CLOSED trades before the audit will render ANY EDGE/NO_EDGE opinion — below this
 *  the honest answer is "not enough data", not a guess dressed up as a verdict. */
export const MIN_TRADES = 5;
/** The conventional one-sided DSR confidence bar (factor-evaluator's own default — reused, not re-tuned). */
export const DSR_CONFIDENCE = 0.95;

// ── moments (skew, raw kurtosis) for the DSR non-normality correction — same convention deflatedSharpe expects ──
function moments(xs) {
  const n = xs.length;
  if (n < 2) return { mean: NaN, std: NaN, skew: 0, kurtosis: 3, n };
  let mean = 0;
  for (const x of xs) mean += x;
  mean /= n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) { const d = x - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const std = Math.sqrt((m2 * n) / Math.max(1, n - 1)); // sample std
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) : 3; // raw kurtosis (normal = 3)
  return { mean, std, skew, kurtosis, n };
}

/** Read a JSONL ledger, fail-soft to [] on missing file / parse errors per-line. */
function readJsonl(p) {
  if (!p || !existsSync(p)) return [];
  let text;
  try { text = readFileSync(p, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed line */ }
  }
  return out;
}

/**
 * extractClosedTrades(paperRows) — pull every closed (full + partial) trade off the paper
 * ledger and compute its NET-OF-COST bps: netBps = netPnl / notional * 1e4 for full closes
 * (netPnl already has entry+exit fees deducted by afl-paper.execClose); partial_close rows
 * only carry grossPnl (afl-paper.mjs does not net fees into a partial-close row), so we net
 * the exit fee (xf) ourselves there — never silently drop the fee, that would inflate the edge.
 * @returns {{n:number, netBpsSeries:number[], grossBpsSeries:number[], hitRate:number, trades:object[]}}
 */
function extractClosedTrades(paperRows) {
  const trades = [];
  for (const r of paperRows) {
    if (r.type === 'close') {
      const notional = isNum(r.entryPx) && isNum(r.qty) ? Math.abs(r.entryPx * r.qty) : NaN;
      if (!isNum(notional) || notional <= 0 || !isNum(r.netPnl) || !isNum(r.grossPnl)) continue;
      trades.push({
        inst: r.inst, fid: r.fid, side: r.side, ots: r.ots, cts: r.cts,
        notional, netBps: (r.netPnl / notional) * 1e4, grossBps: (r.grossPnl / notional) * 1e4,
        kind: 'close',
      });
    } else if (r.type === 'partial_close') {
      const notional = isNum(r.fp) && isNum(r.closeQty) ? Math.abs(r.fp * r.closeQty) : NaN;
      if (!isNum(notional) || notional <= 0 || !isNum(r.grossPnl)) continue;
      const xf = isNum(r.xf) ? r.xf : 0;
      const net = r.grossPnl - xf;
      trades.push({
        inst: r.inst, fid: r.fid, side: r.side, ots: null, cts: r.ts,
        notional, netBps: (net / notional) * 1e4, grossBps: (r.grossPnl / notional) * 1e4,
        kind: 'partial_close',
      });
    }
  }
  const n = trades.length;
  const netBpsSeries = trades.map((t) => t.netBps);
  const grossBpsSeries = trades.map((t) => t.grossBps);
  const hits = trades.filter((t) => t.netBps > 0).length;
  return { n, netBpsSeries, grossBpsSeries, hitRate: n ? hits / n : NaN, trades };
}

/**
 * icFromLedgers(predRows, trades) — advisory IC between the ENTRY prediction's signed
 * confidence (long=+conf, short=-conf) and the realized net-bps return of the trade it opened.
 * Pairs by predictionId convention `pred_<inst>_<fid>_<ots>` (afl-paper.mjs). Returns computeIC's
 * shape UNMODIFIED (ic-spine is DISARMED by default -> {ic:NaN,...} until the operator arms the
 * mure-ic-spine flag; that is correct, honest degrade, not a bug in this audit).
 */
function icFromLedgers(predRows, trades) {
  const predById = new Map();
  for (const r of predRows) {
    if (r.type === 'prediction' && r.id) predById.set(r.id, r);
  }
  const signals = [];
  const fwdRets = [];
  for (const t of trades) {
    if (t.kind !== 'close' || !isNum(t.ots)) continue; // partial closes have no clean single predictionId
    const predId = `pred_${t.inst}_${t.fid}_${t.ots}`;
    const pred = predById.get(predId);
    if (!pred) continue;
    const eff = Array.isArray(pred.predictedEffects) ? pred.predictedEffects[0] : null;
    const conf = eff && isNum(eff.confidence) ? eff.confidence : NaN;
    if (!isNum(conf)) continue;
    const signedSignal = t.side === 'short' ? -conf : conf; // short=predicting DOWN -> negative signal
    signals.push(signedSignal);
    fwdRets.push(t.netBps);
  }
  return { pairs: signals.length, ...computeIC(signals, fwdRets, { method: 'spearman' }) };
}

/**
 * auditOrderflowEdge({ symbol, paperLedgerPath, predLedgerPath }) — the honest edge verdict.
 *
 * Gates (exact, per spec):
 *   INSUFFICIENT — n (closed trades) < MIN_TRADES. No opinion rendered on edge/no-edge.
 *   NO_EDGE      — n >= MIN_TRADES AND (netEdgeBps <= 0 OR DSR gate fails).
 *   EDGE         — n >= MIN_TRADES AND netEdgeBps > 0 AND DSR gate passes (dsr > DSR_CONFIDENCE).
 *
 * netEdgeBps = mean per-trade net-of-cost bps (the honest, fee-inclusive edge unit — netPnl
 * already nets entry+exit fees per afl-paper.execClose). costBps = grossEdgeBps - netEdgeBps,
 * i.e. the mean per-trade cost drag actually paid (fees + the gross/net gap), reported >= 0 by
 * convention (a net credit, e.g. funding carry, would show as a small/negative cost — reported as-is,
 * never floored, so a carry-positive strategy isn't lied about).
 *
 * @returns {{symbol, trades, hitRate, grossEdgeBps, costBps, netEdgeBps, ic, deflatedSharpe, verdict}}
 */
export function auditOrderflowEdge({ symbol, paperLedgerPath, predLedgerPath } = {}) {
  const sym = symbol ? String(symbol).toUpperCase() : null;
  const paperPath = paperLedgerPath || (sym ? path.join(STATE, `orderflow-paper-${sym}.jsonl`) : null);
  const predPath = predLedgerPath || (sym ? path.join(STATE, `orderflow-paper-pred-${sym}.jsonl`) : null);

  const paperRows = readJsonl(paperPath);
  const predRows = readJsonl(predPath);
  const { n, netBpsSeries, grossBpsSeries, hitRate, trades } = extractClosedTrades(paperRows);

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const grossEdgeBps = mean(grossBpsSeries);
  const netEdgeBps = mean(netBpsSeries);
  const costBps = isNum(grossEdgeBps) && isNum(netEdgeBps) ? grossEdgeBps - netEdgeBps : NaN;

  const ic = icFromLedgers(predRows, trades);

  // DSR gate — reused verbatim from factor-evaluator.deflatedSharpe. Single-symbol audit -> nTrials=1
  // (no selection-bias deflation across a fleet here; a multi-symbol caller should sweep this per
  // symbol and feed the RESULTING p-values through benjaminiHochberg itself — out of scope for one audit).
  let dsrResult = { dsr: 0, sr0: 0, passes: false, z: NaN, varSR: NaN };
  if (n >= 2) {
    const m = moments(netBpsSeries);
    const sharpePeriod = m.std > 0 ? m.mean / m.std : 0;
    try {
      dsrResult = deflatedSharpe(sharpePeriod, {
        nTrials: 1, T: n, skew: m.skew, kurtosis: m.kurtosis, confidence: DSR_CONFIDENCE,
      });
    } catch { /* degenerate series -> dsrResult stays the safe zero-confidence default */ }
  }

  let verdict;
  const reasons = [];
  if (n < MIN_TRADES) {
    verdict = 'INSUFFICIENT';
    reasons.push(`only ${n} closed trade(s) < MIN_TRADES=${MIN_TRADES} — no edge opinion rendered`);
  } else if (!(netEdgeBps > 0) || !dsrResult.passes) {
    verdict = 'NO_EDGE';
    if (!(netEdgeBps > 0)) reasons.push(`netEdgeBps ${isNum(netEdgeBps) ? netEdgeBps.toFixed(2) : netEdgeBps} <= 0 — losing or breakeven after cost`);
    if (!dsrResult.passes) reasons.push(`DSR ${dsrResult.dsr.toFixed(4)} <= ${DSR_CONFIDENCE} — fails the deflated-Sharpe hurdle (sr0=${dsrResult.sr0.toFixed(4)}, T=${n})`);
  } else {
    verdict = 'EDGE';
    reasons.push(`netEdgeBps ${netEdgeBps.toFixed(2)} > 0 AND DSR ${dsrResult.dsr.toFixed(4)} > ${DSR_CONFIDENCE} (T=${n})`);
  }

  return {
    symbol: sym,
    trades: n,
    hitRate: isNum(hitRate) ? +hitRate.toFixed(4) : NaN,
    grossEdgeBps: isNum(grossEdgeBps) ? +grossEdgeBps.toFixed(4) : NaN,
    costBps: isNum(costBps) ? +costBps.toFixed(4) : NaN,
    netEdgeBps: isNum(netEdgeBps) ? +netEdgeBps.toFixed(4) : NaN,
    ic: { value: isNum(ic.ic) ? +ic.ic.toFixed(4) : NaN, pValue: isNum(ic.pValue) ? +ic.pValue.toFixed(4) : NaN, n: ic.n ?? 0, pairs: ic.pairs, note: 'ADVISORY ONLY — ic-spine is DISARMED by default (mure-ic-spine.enabled flag); NaN here means no IC evidence, NOT a gate failure' },
    deflatedSharpe: { dsr: +dsrResult.dsr.toFixed(4), sr0: +dsrResult.sr0.toFixed(4), passes: dsrResult.passes, confidence: DSR_CONFIDENCE, nTrials: 1, T: n },
    verdict,
    reasons,
  };
}

export default { auditOrderflowEdge, MIN_TRADES, DSR_CONFIDENCE };

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : def;
}

if (_main) {
  const symbol = arg('symbol', 'BTCUSDT');
  const result = auditOrderflowEdge({ symbol });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
