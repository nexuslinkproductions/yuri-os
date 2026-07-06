#!/usr/bin/env node
// @capability: ic-spine
// @serves: information coefficient | rank IC | spearman IC | pearson IC | IC decay curve | Grinold fundamental law | IR = IC x sqrt(breadth) | effective breadth | IC promotion gate | factor forecasting skill
// @does: The AFL quant measurement core the library lacked (Lane-B verified greenfield): Spearman rank-IC / Pearson IC between factor signals and forward returns, Fisher-z p-values + CI, rolling IC series over the forecast ledger, IC-decay across the horizon ladder (BH-corrected across rungs), Grinold IR = IC×√breadth with the effective-N-under-correlation shrink, and an IC promotion gate that FEEDS the existing deflatedSharpe/benjaminiHochberg machinery (C2: build the IC computation, reuse the gate).
// @use: computeIC(signal, fwdRet) for one window; computeICSeries(recall, {factorId, horizonS}) for rolling IC off a recallFactors() ledger; computeICDecay for the per-rung ladder; icPromotionGate(icStats, {nTrials}) to promote. DISARMED-first: degrades to NaN/[] without _SYSTEM/state/mure-ic-spine.enabled.
// @exports: spearmanRankIC, computeIC, computeICSeries, computeICDecay, icBreadthIR, effectiveBreadth, icPromotionGate
//
// MURE gap-1 (MURE_GAP_SEAM_DESIGN_2026-07-06.mjs::gap1_ic_spine). Pure leaf — no network, no I/O
// beyond the flag check + the injected ledger recall. Existing modules never import this (DAG: new→existing only).
//
// QUANT SPEC (lanes/D-quant-spec.md — formula-level, cited):
//   IC_t,h  = corr(signal_t, forwardReturn_{t+h})            [Grinold & Kahn]
//   rank IC = Pearson(rank(signal), rank(fwdRet))            [industry default; robust to outliers/non-linearity]
//   SE_IC   ≈ 1/√(n−3) under the Fisher z-transform          [never quote IC without its band]
//   IR      = IC × √BR (× TC live)                           [Grinold 1989; TC per Clarke/de Silva/Thorley]
//   N_eff   = N / (1 + (N−1)·ρ̄)                              [effective breadth under cross-correlation]
//   Gate    : the EXISTING factor-evaluator deflatedSharpe (dsr>0.95) + benjaminiHochberg — REUSED, not rebuilt.
//   Bands   : IC 0.02–0.05 workable · 0.05–0.10 strong · >0.10 suspect (leakage/overfit — cross-check DSR/BH).
//   minIC default is 0.02 (the workable-edge floor), NOT 0.05 — Lane D explicitly warns against
//   gating AT 0.05 ("a genuinely tradeable systematic factor commonly sits at 0.02–0.03 IC").
//
// TIMESTAMPS: ledger rows carry unix-SECONDS ts (orchestrator convention); horizonS/strideS in seconds.
//
// DISARMED CONTRACT (per the seam spec's disarmedFirstContract):
//   flag file: _SYSTEM/state/mure-ic-spine.enabled  (creating it = owner-gated; never created here)
//   disarmed → spearmanRankIC NaN · computeIC {ic:NaN,...} · computeICSeries [] · computeICDecay []
//              · icBreadthIR {ir:NaN, icir:NaN} · icPromotionGate {promote:false, reasons:['DISARMED...']}
//   No throw, no console spam — fail-silent degrade. MURE_FLAG_DIR env is a TEST-SANDBOX override
//   (unit tests arm a flag in a tmpdir); production callers never set it, so the real gate stands.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deflatedSharpe, benjaminiHochberg, factorPromotionGate, temporalSplit } from './factor-evaluator.mjs';
import { RUNGS } from './horizon-ladder.mjs';
import { recallFactors } from './trade-edge-audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAG_NAME = 'mure-ic-spine.enabled';
const FLAG_PATH = () => path.join(
  process.env.MURE_FLAG_DIR || path.resolve(__dirname, '..', '..', 'state'),
  FLAG_NAME,
);
const armed = () => { try { return existsSync(FLAG_PATH()); } catch { return false; } };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── normal CDF (Abramowitz & Stegun 7.1.26, |err|<7.5e-8 — same kernel factor-evaluator inlines) ──
function normalCdf(z) {
  if (!isNum(z)) return NaN;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// ── pairwise-finite filter: keeps index-aligned pairs where BOTH are finite ──
function finitePairs(xs, ys, label) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) throw new TypeError(`${label}: expected two arrays`);
  if (xs.length !== ys.length) throw new TypeError(`${label}: length mismatch (${xs.length} vs ${ys.length}) — misaligned signal/forward-return arrays are an integration bug, not data noise`);
  const a = [], b = [];
  for (let i = 0; i < xs.length; i++) {
    if (isNum(xs[i]) && isNum(ys[i])) { a.push(xs[i]); b.push(ys[i]); }
  }
  return [a, b];
}

/** Average (fractional) ranks, 1-based, ties get the mean of their rank block. */
function rankArray(xs) {
  const n = xs.length;
  const idx = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1; // mean of 1-based ranks i+1..j+1
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Plain Pearson correlation on two equal-length numeric arrays (no filtering). */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return NaN; // zero variance → correlation undefined
  return sxy / Math.sqrt(sxx * syy);
}

// ── sample moments (skew, excess-free kurtosis) for the DSR feed ──
function moments(xs) {
  const n = xs.length;
  if (n < 2) return { mean: NaN, std: NaN, skew: 0, kurtosis: 3, n };
  let mean = 0;
  for (const x of xs) mean += x;
  mean /= n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) { const d = x - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const std = Math.sqrt((m2 * n) / (n - 1)); // sample std
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) : 3; // RAW kurtosis (normal = 3) — the convention deflatedSharpe expects
  return { mean, std, skew, kurtosis, n };
}

// ═══════════════════════════════════════════════════════════════════════════
// spearmanRankIC — the core estimator.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Spearman rank IC: Pearson correlation on the average-ranked values.
 * Robust to outliers, needs only a MONOTONIC signal→return relationship.
 * @param {number[]} factorValues
 * @param {number[]} forwardReturns  index-aligned with factorValues
 * @returns {number} rank IC in [-1, 1], or NaN (disarmed / n<3 / zero variance)
 */
export function spearmanRankIC(factorValues, forwardReturns) {
  if (!armed()) return NaN;
  const [a, b] = finitePairs(factorValues, forwardReturns, 'spearmanRankIC');
  if (a.length < 3) return NaN;
  return pearson(rankArray(a), rankArray(b));
}

// ═══════════════════════════════════════════════════════════════════════════
// computeIC — IC + Fisher-z inference (p-value, CI).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {number[]} factorValues
 * @param {number[]} forwardReturns
 * @param {{method?: 'spearman'|'pearson'}} [opts]
 * @returns {{ic:number, pValue:number, n:number, ci95:[number,number], method:string}}
 *   pValue is TWO-SIDED via the Fisher z-transform (z = atanh(ic)·√(n−3)); NaN when n<4.
 */
export function computeIC(factorValues, forwardReturns, { method = 'spearman' } = {}) {
  const degrade = { ic: NaN, pValue: NaN, n: 0, ci95: [NaN, NaN], method };
  if (!armed()) return degrade;
  const [a, b] = finitePairs(factorValues, forwardReturns, 'computeIC');
  const n = a.length;
  if (n < 3) return { ...degrade, n };
  const ic = method === 'pearson' ? pearson(a, b) : pearson(rankArray(a), rankArray(b));
  if (!isNum(ic)) return { ...degrade, n };
  if (n < 4) return { ic, pValue: NaN, n, ci95: [NaN, NaN], method }; // n−3 ≤ 0 → no Fisher inference
  const clamped = Math.max(-0.999999, Math.min(0.999999, ic));
  const zTransform = Math.atanh(clamped);
  const se = 1 / Math.sqrt(n - 3);
  const z = zTransform / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const ci95 = [Math.tanh(zTransform - 1.959964 * se), Math.tanh(zTransform + 1.959964 * se)];
  return { ic, pValue, n, ci95, method };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ledger seam — (signal, forward-return) pair extraction off recallFactors().
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Pairs a forecast row's SIGNAL with the raw forward return over horizonS.
 * signal = row.value when finite (continuous factor value), else row.dir (±1 directional).
 * fwdRet = (p1 − price)/price — RAW, not dir-multiplied: IC correlates the signal itself with
 * what the market did (a short signal is a NEGATIVE signal value predicting a negative return).
 * Leak-free: forward price is the first SAME-market price with ts ≥ row.ts + horizonS
 * (identical lookup discipline to trade-edge-audit.factorEdgeStats). Non-overlap via strideS.
 */
function signalReturnPairs(recall, { factorId, horizonS = 3600, strideS = 0 } = {}) {
  const out = []; // [{ts, signal, fwdRet}]
  if (!recall || !recall.byFactor || !recall.byFactor.has(factorId)) return out;
  const rows = [...recall.byFactor.get(factorId)].sort((x, y) => x.ts - y.ts);
  const arr = (market) => recall.series.get(market) || null;
  let lastTs = -Infinity;
  for (const r of rows) {
    if (isNum(strideS) && strideS > 0 && r.ts - lastTs < strideS) continue;
    const series = arr(r.market);
    if (!series || !isNum(r.price) || r.price <= 0) continue;
    let p1 = null;
    for (let i = 0; i < series.length; i++) { if (series[i][0] >= r.ts + horizonS) { p1 = series[i][1]; break; } }
    if (!isNum(p1)) continue;
    const signal = isNum(r.value) ? r.value : (isNum(r.dir) ? r.dir : NaN);
    if (!isNum(signal)) continue;
    out.push({ ts: r.ts, signal, fwdRet: (p1 - r.price) / r.price });
    lastTs = r.ts;
  }
  return out;
}

/**
 * computeICSeries — rolling per-factor IC time series off the forecast ledger.
 * @param recall  trade-edge-audit.recallFactors() output ({rows, series, byFactor, ...})
 * @param {{factorId:string, horizonS?:number, strideS?:number, method?:string, window?:number, step?:number}} opts
 *   window: observations per IC estimate (Lane D: 60–120 typical; <30 the IC itself is noise — we
 *   floor at 12 so short synthetic fixtures stay testable, and report n so callers can judge).
 * @returns {{ts:number, ic:number, n:number}[]}  ts = last observation in the window
 */
export function computeICSeries(recall, { factorId, horizonS = 3600, strideS = 0, method = 'spearman', window = 60, step = 1 } = {}) {
  if (!armed()) return [];
  const pairs = signalReturnPairs(recall, { factorId, horizonS, strideS });
  const W = Math.max(12, Math.floor(isNum(window) ? window : 60));
  const S = Math.max(1, Math.floor(isNum(step) ? step : 1));
  const out = [];
  if (pairs.length < W) return out;
  for (let end = W; end <= pairs.length; end += S) {
    const win = pairs.slice(end - W, end);
    const r = computeIC(win.map((p) => p.signal), win.map((p) => p.fwdRet), { method });
    if (isNum(r.ic)) out.push({ ts: win[win.length - 1].ts, ic: r.ic, n: r.n });
  }
  return out;
}

/**
 * computeICDecay — IC at every rung of the horizon ladder (the IC-decay curve).
 * Lane D §1: a genuine signal decays smoothly across horizons; a spike at ONE arbitrary rung is a
 * multiple-testing artifact — so the per-rung p-values route through the SAME BH machinery
 * (each rung's IC test = one more p-value in the fleet). bhRejected marks the BH-surviving rungs.
 * @returns {{label:string, horizonS:number, ic:number, pValue:number, n:number, bhRejected:boolean}[]}
 */
export function computeICDecay(recall, { factorId, method = 'spearman', rungs = RUNGS, q = 0.1, minN = 12 } = {}) {
  if (!armed()) return [];
  const rows = [];
  for (const rung of rungs) {
    const pairs = signalReturnPairs(recall, { factorId, horizonS: rung.horizonS, strideS: rung.strideS });
    if (pairs.length < Math.max(3, minN)) continue; // honest: too few independent obs → no IC claim at this rung
    const r = computeIC(pairs.map((p) => p.signal), pairs.map((p) => p.fwdRet), { method });
    if (!isNum(r.ic)) continue;
    rows.push({ label: rung.label, horizonS: rung.horizonS, ic: r.ic, pValue: r.pValue, n: r.n });
  }
  if (rows.length === 0) return rows;
  const finiteP = rows.map((r) => (isNum(r.pValue) ? r.pValue : 1));
  const bh = benjaminiHochberg(finiteP, q);
  return rows.map((r, i) => ({ ...r, bhRejected: bh.rejected[i] }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Grinold — IR = IC × √BR, effective breadth under correlation.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * effectiveBreadth(N, avgPairwiseCorr) — N/(1+(N−1)ρ̄): 10 highly-correlated symbols are NOT 10
 * independent bets. THE most commonly inflated number in practice (Lane D §2) — shrink honestly.
 */
export function effectiveBreadth(N, avgPairwiseCorr = 0) {
  if (!armed()) return NaN;
  if (!isNum(N) || N <= 0) return NaN;
  const rho = isNum(avgPairwiseCorr) ? Math.max(0, Math.min(1, avgPairwiseCorr)) : 0;
  return N / (1 + (N - 1) * rho);
}

/**
 * icBreadthIR(meanIC, breadthN, icStd) — the Fundamental Law of Active Management.
 *   ir   = meanIC × √breadthN     (Grinold 1989 — the THEORETICAL, TC=1 upper bound; report the
 *                                  fee/slippage-adjusted realized IR beside it, never alone)
 *   icir = meanIC / icStd         (the realized IC information ratio — IC-consistency per window)
 * @returns {{ir:number, icir:number}}
 */
export function icBreadthIR(meanIC, breadthN, icStd) {
  if (!armed()) return { ir: NaN, icir: NaN };
  const ir = (isNum(meanIC) && isNum(breadthN) && breadthN > 0) ? meanIC * Math.sqrt(breadthN) : NaN;
  const icir = (isNum(meanIC) && isNum(icStd) && icStd > 0) ? meanIC / icStd : NaN;
  return { ir, icir };
}

// ═══════════════════════════════════════════════════════════════════════════
// icPromotionGate — feed the EXISTING DSR/BH gate (C2: never rebuild it).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Promotion decision for an IC-measured factor. The IC series is treated as the per-period
 * performance series: its mean/std ratio is the per-period "IC Sharpe" fed STRAIGHT into
 * factor-evaluator.factorPromotionGate (deflatedSharpe dsr>0.95 + optional BH fleet membership) —
 * with the series' OWN skew/kurtosis so fat-tailed IC histories deflate honestly.
 *
 * nTrials discipline (Lane D §3/§4): count EVERY variant tried — parameter sweeps, abandoned
 * lookbacks, every peek at the held-out split. Undercounting N is how the gate gets gamed.
 *
 * @param {{ics:number[]}|{meanIC:number, icStd:number, n:number, skew?:number, kurtosis?:number}} icStats
 * @param {{minIC?:number, minTStat?:number, nTrials?:number, fleetPValues?:number[]|null, q?:number, confidence?:number}} opts
 *   minIC default 0.02 — Lane D's workable-edge floor, NOT 0.05 (see header).
 * @returns {{promote:boolean, reasons:string[], meanIC:number, icStd:number, tStat:number, pValue:number, dsr:number, sr0:number, fdr:object|null, n:number}}
 */
export function icPromotionGate(icStats, {
  minIC = 0.02,
  minTStat = 2,
  nTrials = 1,
  fleetPValues = null,
  q = 0.1,
  confidence = 0.95,
} = {}) {
  const degrade = { promote: false, reasons: [`DISARMED: ${FLAG_NAME} flag absent — IC gate inert`], meanIC: NaN, icStd: NaN, tStat: NaN, pValue: NaN, dsr: NaN, sr0: NaN, fdr: null, n: 0 };
  if (!armed()) return degrade;

  let meanIC, icStd, n, skew = 0, kurtosis = 3;
  if (icStats && Array.isArray(icStats.ics)) {
    const ics = icStats.ics.filter(isNum);
    const m = moments(ics);
    meanIC = m.mean; icStd = m.std; n = m.n; skew = m.skew; kurtosis = m.kurtosis;
  } else if (icStats && typeof icStats === 'object') {
    meanIC = icStats.meanIC; icStd = icStats.icStd; n = icStats.n;
    if (isNum(icStats.skew)) skew = icStats.skew;
    if (isNum(icStats.kurtosis)) kurtosis = icStats.kurtosis;
  } else {
    return { ...degrade, reasons: ['icPromotionGate: icStats must be {ics:[]} or {meanIC, icStd, n}'] };
  }
  if (!isNum(meanIC) || !isNum(icStd) || !isNum(n) || n < 4 || icStd <= 0) {
    return { ...degrade, reasons: [`insufficient IC evidence (n=${n ?? 0}, icStd=${icStd ?? NaN}) — no gate decision`], meanIC: isNum(meanIC) ? meanIC : NaN, n: isNum(n) ? n : 0 };
  }

  const reasons = [];
  const tStat = meanIC / (icStd / Math.sqrt(n));
  const pValue = 1 - normalCdf(tStat); // one-sided H1: mean IC > 0
  const icSharpePeriod = meanIC / icStd;

  // REUSE the existing combined gate (DSR + optional BH-FDR) — never rebuild (C2).
  const gate = factorPromotionGate({
    observedSharpe: icSharpePeriod, nTrials, T: n, pValue,
    skew, kurtosis, confidence, fleetPValues, q,
  });
  reasons.push(...gate.reasons);

  const icPass = meanIC >= minIC;
  reasons.push(icPass
    ? `meanIC ${meanIC.toFixed(4)} ≥ minIC ${minIC} (Lane-D band: 0.02–0.05 workable, 0.05–0.10 strong, >0.10 suspect)`
    : `meanIC ${meanIC.toFixed(4)} < minIC ${minIC} — below the workable-edge floor`);
  const tPass = tStat >= minTStat;
  reasons.push(tPass
    ? `IC t-stat ${tStat.toFixed(2)} ≥ ${minTStat}`
    : `IC t-stat ${tStat.toFixed(2)} < ${minTStat} — IC mean not distinguishable from zero`);
  if (meanIC > 0.10) reasons.push(`⚠ meanIC ${meanIC.toFixed(4)} > 0.10 — exceptional or a leakage/overfit artifact; cross-check the DSR/BH result before trusting (Lane D §1)`);

  return {
    promote: gate.promote && icPass && tPass,
    reasons,
    meanIC, icStd, tStat, pValue,
    dsr: gate.dsr, sr0: gate.sr0, fdr: gate.fdr, n,
  };
}

export default {
  spearmanRankIC, computeIC, computeICSeries, computeICDecay,
  icBreadthIR, effectiveBreadth, icPromotionGate,
};

// Re-export the reused split for IC walk-forward callers (chronological, leak-free) — a
// convenience alias, NOT a reimplementation.
export { temporalSplit as icTemporalSplit };

// ── CLI smoke (deterministic): node ic-spine.mjs --smoke  (requires armed flag or MURE_FLAG_DIR) ──
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  console.log(`armed=${armed()} flag=${FLAG_PATH()}`);
  const sig = Array.from({ length: 500 }, () => gauss());
  const fwd = sig.map((s) => s + gauss()); // true Pearson ρ = 1/√2 ≈ 0.707 → rank ρ ≈ 0.690
  console.log('signal→return IC:', JSON.stringify(computeIC(sig, fwd)));
  const noise = sig.map(() => gauss());
  console.log('noise IC:        ', JSON.stringify(computeIC(sig, noise)));
  console.log('IR(0.03, 2000):  ', JSON.stringify(icBreadthIR(0.03, 2000, 0.05)));
  console.log('N_eff(10, 0.8):  ', effectiveBreadth(10, 0.8));
}
