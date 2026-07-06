#!/usr/bin/env node
// @capability: gex-compute
// @serves: gamma exposure | GEX | gamma flip | dealer positioning | options chain gamma | black scholes gamma | implied volatility solver | IV from NBBO mid | dealer long short gamma regime
// @does: Gamma-exposure computation from an options chain (MURE gap-3): per-strike GEX = gamma×OI×multiplier×spot²×0.01×sign (calls +1 / puts −1 — the naive dealer convention, validated 3-way vs SpotGamma/FlashAlpha/open-source per Lane D §6), cumulative profile + interpolated gamma-flip level, positive/negative-gamma regime classification, canonical GEX signals, PLUS the Black-Scholes kernel Databento's greeks-free feed requires: bsPrice/bsGamma closed-form and a Newton+bisection impliedVol solver for OPRA NBBO mids. GEX promotion routes through the EXISTING factor-evaluator gate (never rebuilt).
// @use: chain from OPRA (or fixtures) → computeGEX(chain,{spot,multiplier}) → gexRegime/gexSignals; iv per contract via impliedVol({price,spot,strike,tYears,type}) then bsGamma. gexPromotionGate(returns,{nTrials}) for the DSR/BH screen. DISARMED-first: degrades to zero/empty without _SYSTEM/state/mure-gex.enabled.
// @exports: bsPrice, bsGamma, impliedVol, computeStrikeGEX, computeGEX, gexRegime, gexSignals, gexPromotionGate
//
// MURE gap-3 (MURE_GAP_SEAM_DESIGN_2026-07-06.mjs::gap3_gex). Pure compute over an injected chain —
// no network. Existing modules never import this (DAG: new→existing only).
//
// FORMULA + SIGN (lanes/D-quant-spec.md §6 — validated, and the ORIGINAL brief's sign REASONING was
// backwards; the CORRECT mechanism is carried here):
//   GEX_strike = gamma × OI × multiplier × spot² × 0.01 × sign
//   sign(call) = +1 — dealers are net SHORT calls (sold to customers) → hedging a short call makes
//                the dealer LONG GAMMA → calls contribute POSITIVE (stabilizing) GEX.
//   sign(put)  = −1 — dealers are net SHORT puts (sold to hedgers) → hedging a short put makes the
//                dealer SHORT GAMMA → puts contribute NEGATIVE (destabilizing) GEX.
//   spot²×0.01 = "dollar gamma per 1% move" normalization. multiplier = 100 for US equity options —
//   NEVER copy 100 into non-equity venues (Deribit BTC = 1); the multiplier comes from
//   instrument-registry's optionMultiplier, passed by the caller.
//   Net: positive total GEX = dealers long gamma (buy dips / sell rips — vol-dampening);
//        negative = dealers short gamma (sell dips / buy rips — vol-amplifying).
//
// HONESTY CAP (Lane D): the naive sign assumes ALL OI is customer-initiated — covered-call
// overwriting and inter-dealer flow flip real signs. Naive-sign GEX is HYPOTHESIS-grade:
// gexSignals confidence is hard-capped LOW, and any GEX factor must clear the same DSR/BH
// promotion gate as everything else (gexPromotionGate wraps the EXISTING factor-evaluator gate).
// Cross-check levels against SpotGamma before trusting (residual-risk item in the brief).
//
// DISARMED CONTRACT: flag _SYSTEM/state/mure-gex.enabled (creation owner-gated; MURE_FLAG_DIR is
// the unit-test sandbox override only). Disarmed → computeGEX {strikes:[],totalGEX:0,gammaFlip:null}
// · gexSignals [] · gexRegime null · bs*/impliedVol NaN-shapes · gexPromotionGate {promote:false}.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { backtestFactor, factorPromotionGate } from './factor-evaluator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAG_NAME = 'mure-gex.enabled';
const FLAG_PATH = () => path.join(
  process.env.MURE_FLAG_DIR || path.resolve(__dirname, '..', '..', 'state'),
  FLAG_NAME,
);
const armed = () => { try { return existsSync(FLAG_PATH()); } catch { return false; } };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── standard normal pdf/cdf (A&S 7.1.26 — same kernel the evaluator inlines) ──
const normalPdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
function normalCdf(z) {
  if (!isNum(z)) return NaN;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = normalPdf(z) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// ═══════════════════════════════════════════════════════════════════════════
// Black-Scholes kernel (Databento ships NO greeks — the OPRA path is
// NBBO mid → impliedVol → bsGamma → GEX; each step lives here, offline-testable).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * bsPrice({spot, strike, iv, tYears, rate=0, type}) → option price (European, no dividends).
 * Degenerate tYears/iv ≤ 0 → discounted intrinsic (the correct limit).
 */
export function bsPrice({ spot, strike, iv, tYears, rate = 0, type = 'call' } = {}) {
  if (!armed()) return NaN;
  if (!isNum(spot) || !isNum(strike) || !isNum(iv) || !isNum(tYears) || !isNum(rate) || spot <= 0 || strike <= 0) return NaN;
  const isCall = type === 'call';
  if (tYears <= 0 || iv <= 0) {
    const fwd = isCall ? spot - strike * Math.exp(-rate * Math.max(0, tYears)) : strike * Math.exp(-rate * Math.max(0, tYears)) - spot;
    return Math.max(0, fwd);
  }
  const sqT = Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * tYears) / (iv * sqT);
  const d2 = d1 - iv * sqT;
  return isCall
    ? spot * normalCdf(d1) - strike * Math.exp(-rate * tYears) * normalCdf(d2)
    : strike * Math.exp(-rate * tYears) * normalCdf(-d2) - spot * normalCdf(-d1);
}

/** bsGamma — ∂²V/∂S² = φ(d1)/(S·σ·√T). Identical for calls and puts. Degenerate inputs → NaN. */
export function bsGamma({ spot, strike, iv, tYears, rate = 0 } = {}) {
  if (!armed()) return NaN;
  if (!isNum(spot) || !isNum(strike) || !isNum(iv) || !isNum(tYears) || spot <= 0 || strike <= 0 || iv <= 0 || tYears <= 0) return NaN;
  const sqT = Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * tYears) / (iv * sqT);
  return normalPdf(d1) / (spot * iv * sqT);
}

/**
 * impliedVol({price, spot, strike, tYears, rate=0, type}) → {iv, iterations, converged}
 * Newton-Raphson on vega with a bisection fallback (Lane D: "Newton/bisection on OPRA mbp-1 NBBO
 * mids"). Bounds [1e-4, 5]. Prices at/below intrinsic or above the no-arb cap → converged:false.
 */
export function impliedVol({ price, spot, strike, tYears, rate = 0, type = 'call', tol = 1e-7, maxIter = 100 } = {}) {
  const fail = { iv: NaN, iterations: 0, converged: false };
  if (!armed()) return fail;
  if (!isNum(price) || !isNum(spot) || !isNum(strike) || !isNum(tYears) || spot <= 0 || strike <= 0 || tYears <= 0 || price <= 0) return fail;
  const isCall = type === 'call';
  const disc = Math.exp(-rate * tYears);
  const intrinsic = Math.max(0, isCall ? spot - strike * disc : strike * disc - spot);
  const upperBound = isCall ? spot : strike * disc; // no-arbitrage price caps
  if (price <= intrinsic + 1e-12 || price >= upperBound - 1e-12) return fail;

  const f = (iv) => bsPrice({ spot, strike, iv, tYears, rate, type }) - price;
  let lo = 1e-4, hi = 5;
  if (f(lo) > 0 || f(hi) < 0) return fail; // outside the bracket → no solution in bounds

  // Newton from the Brenner-Subrahmanyam ATM seed, guarded by the [lo,hi] bracket.
  let iv = Math.max(lo, Math.min(hi, Math.sqrt(2 * Math.PI / tYears) * price / spot));
  let i = 0;
  for (; i < maxIter; i++) {
    const diff = f(iv);
    if (Math.abs(diff) < tol) return { iv, iterations: i, converged: true };
    if (diff > 0) hi = iv; else lo = iv; // maintain the bracket
    const sqT = Math.sqrt(tYears);
    const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * tYears) / (iv * sqT);
    const vega = spot * normalPdf(d1) * sqT;
    let next = vega > 1e-12 ? iv - diff / vega : NaN;
    if (!isNum(next) || next <= lo || next >= hi) next = (lo + hi) / 2; // bisection fallback
    if (Math.abs(next - iv) < 1e-12) return { iv: next, iterations: i, converged: true };
    iv = next;
  }
  return { iv, iterations: i, converged: Math.abs(f(iv)) < 1e-4 };
}

// ═══════════════════════════════════════════════════════════════════════════
// GEX core
// ═══════════════════════════════════════════════════════════════════════════

/** computeStrikeGEX({gamma, openInterest, spot, multiplier=100, sign}) → one strike's contribution. */
export function computeStrikeGEX({ gamma, openInterest, spot, multiplier = 100, sign = 1 } = {}) {
  if (!armed()) return 0;
  if (!isNum(gamma) || !isNum(openInterest) || !isNum(spot) || !isNum(multiplier) || !isNum(sign)) return 0;
  if (gamma < 0 || openInterest < 0 || spot <= 0) return 0;
  return gamma * openInterest * multiplier * spot * spot * 0.01 * sign;
}

/**
 * computeGEX(chain, {spot, multiplier, dealerSign}) → {strikes, totalGEX, gammaFlip}
 * @param chain [{strike, gamma, openInterest, type:'call'|'put', iv?, volume?}] — gamma may be
 *   pre-computed or produced upstream via impliedVol→bsGamma; rows without finite gamma/OI are
 *   skipped (fail-open), NEVER guessed.
 * @param {{spot:number, multiplier?:number, dealerSign?:{call:number, put:number}}} opts
 * @returns strikes ascending with per-strike net gex + cumulativeGEX (low→high); gammaFlip = the
 *   linearly-interpolated price where cumulative GEX crosses zero (null when no crossing).
 */
export function computeGEX(chain, { spot, multiplier = 100, dealerSign = { call: +1, put: -1 } } = {}) {
  const degrade = { strikes: [], totalGEX: 0, gammaFlip: null };
  if (!armed()) return degrade;
  try {
    if (!Array.isArray(chain) || !isNum(spot) || spot <= 0) return degrade;
    const byStrike = new Map();
    for (const row of chain) {
      if (!row || !isNum(row.strike) || row.strike <= 0) continue;
      const sign = row.type === 'call' ? dealerSign.call : row.type === 'put' ? dealerSign.put : null;
      if (sign === null) continue;
      const gex = computeStrikeGEX({ gamma: row.gamma, openInterest: row.openInterest, spot, multiplier, sign });
      if (gex === 0 && !(isNum(row.gamma) && isNum(row.openInterest))) continue; // skipped garbage row
      byStrike.set(row.strike, (byStrike.get(row.strike) ?? 0) + gex);
    }
    if (byStrike.size === 0) return degrade;
    const strikes = [...byStrike.entries()].map(([strike, gex]) => ({ strike, gex })).sort((a, b) => a.strike - b.strike);
    let cum = 0;
    for (const s of strikes) { cum += s.gex; s.cumulativeGEX = cum; }
    const totalGEX = cum;
    // gamma flip: first zero-crossing of the cumulative profile, linearly interpolated in strike.
    let gammaFlip = null;
    for (let i = 1; i < strikes.length; i++) {
      const a = strikes[i - 1], b = strikes[i];
      if (a.cumulativeGEX === 0) { gammaFlip = a.strike; break; }
      if ((a.cumulativeGEX < 0 && b.cumulativeGEX >= 0) || (a.cumulativeGEX > 0 && b.cumulativeGEX <= 0)) {
        const span = b.cumulativeGEX - a.cumulativeGEX;
        const t = span !== 0 ? -a.cumulativeGEX / span : 1;
        gammaFlip = a.strike + t * (b.strike - a.strike);
        break;
      }
    }
    return { strikes, totalGEX, gammaFlip };
  } catch { return degrade; }
}

/**
 * gexRegime(totalGEX, gammaFlip, spot) → {regime, nearFlip, distancePct}
 * positive = dealers long gamma (stabilizing) · negative = short gamma (destabilizing).
 * nearFlip: |spot − flip| < 1% of spot — the unstable hand-off zone.
 */
export function gexRegime(totalGEX, gammaFlip, spot) {
  if (!armed()) return null;
  if (!isNum(totalGEX) || !isNum(spot) || spot <= 0) return null;
  const regime = totalGEX >= 0 ? 'positive' : 'negative';
  const distancePct = isNum(gammaFlip) ? ((spot - gammaFlip) / spot) * 100 : null;
  const nearFlip = isNum(distancePct) ? Math.abs(distancePct) < 1 : false;
  return { regime, nearFlip, distancePct };
}

/**
 * gexSignals(gexResult, {market, ts, spot}) → canonical signal[].
 * Directional read (practitioner convention, HYPOTHESIS-grade — see HONESTY CAP):
 *   negative regime + spot BELOW flip → dealer hedging amplifies downside → short tilt
 *   negative regime + spot ABOVE flip → amplification upward → long tilt (rare config)
 *   positive regime → vol-dampening/range → NO directional signal by default (emitting a fake
 *   direction from a stabilizing regime is exactly the overclaim the gate exists to kill);
 *   emitted only as a flat regime marker when opts.emitPositiveRegime is set.
 * Confidence hard-capped at 0.40 (below OBI's 0.60 cap) — naive-sign GEX never outranks flow.
 */
export function gexSignals(gexResult, { market = '', ts, spot, emitPositiveRegime = false } = {}) {
  if (!armed()) return [];
  try {
    if (!gexResult || !Array.isArray(gexResult.strikes) || gexResult.strikes.length === 0) return [];
    if (!isNum(spot) || spot <= 0) return [];
    const t = isNum(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000);
    const { totalGEX, gammaFlip } = gexResult;
    const reg = gexRegime(totalGEX, gammaFlip, spot);
    if (!reg) return [];
    const signals = [];
    if (reg.regime === 'negative' && isNum(gammaFlip)) {
      const side = spot < gammaFlip ? 'short' : 'long';
      // scale by distance from flip (deeper into negative territory = stronger amplification), cap 0.40
      const conf = Math.min(0.40, 0.20 + Math.min(0.2, Math.abs(reg.distancePct ?? 0) / 100 * 4));
      signals.push({ factorId: `gex-regime-${market}`, ts: t, value: totalGEX, side, confidence: conf, source: 'gex', regime: 'negative', gammaFlip, nearFlip: reg.nearFlip });
    } else if (emitPositiveRegime) {
      signals.push({ factorId: `gex-regime-${market}`, ts: t, value: totalGEX, side: 'flat', confidence: 0.15, source: 'gex', regime: 'positive', gammaFlip, nearFlip: reg.nearFlip });
    }
    return signals;
  } catch { return []; }
}

/**
 * gexPromotionGate(returnsSeries, {nTrials, periodsPerYear, pValue, fleetPValues, q}) — the DSR/BH
 * screen for a GEX-derived factor's realized return series. THIN wrapper: backtestFactor supplies
 * sharpePeriod/T, factorPromotionGate (EXISTING, reused) decides. Sits here so no GEX caller ever
 * "forgets" the gate (integration_to_edge_audit in the seam spec).
 */
export function gexPromotionGate(returnsSeries, { nTrials = 1, periodsPerYear = 252, pValue, fleetPValues = null, q = 0.1, confidence = 0.95 } = {}) {
  if (!armed()) return { promote: false, reasons: [`DISARMED: ${FLAG_NAME} flag absent — GEX gate inert`], dsr: NaN, sr0: NaN, fdr: null };
  const bt = backtestFactor(returnsSeries, { periodsPerYear }); // REUSED
  if (bt.n < 4) return { promote: false, reasons: [`insufficient returns (n=${bt.n})`], dsr: NaN, sr0: NaN, fdr: null, backtest: bt };
  const gate = factorPromotionGate({ observedSharpe: bt.sharpePeriod, nTrials, T: bt.n, pValue, fleetPValues, q, confidence }); // REUSED
  return { ...gate, backtest: bt };
}

export default { bsPrice, bsGamma, impliedVol, computeStrikeGEX, computeGEX, gexRegime, gexSignals, gexPromotionGate };

// ── CLI smoke: node gex-compute.mjs --smoke ──────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  console.log(`armed=${armed()} flag=${FLAG_PATH()}`);
  console.log('BS call S=K=100 σ=0.2 T=1:', bsPrice({ spot: 100, strike: 100, iv: 0.2, tYears: 1 }), '(ref 7.9656)');
  console.log('BS gamma same:', bsGamma({ spot: 100, strike: 100, iv: 0.2, tYears: 1 }), '(ref 0.019848)');
  console.log('IV round-trip:', JSON.stringify(impliedVol({ price: 7.9656, spot: 100, strike: 100, tYears: 1, type: 'call' })));
  const chain = [
    { strike: 4900, gamma: 0.001, openInterest: 10000, type: 'put' },
    { strike: 5000, gamma: 0.002, openInterest: 15000, type: 'call' },
    { strike: 5100, gamma: 0.001, openInterest: 8000, type: 'call' },
  ];
  console.log('GEX:', JSON.stringify(computeGEX(chain, { spot: 5000, multiplier: 100 })));
}
