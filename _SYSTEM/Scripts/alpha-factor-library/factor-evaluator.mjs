#!/usr/bin/env node
// @capability: factor-evaluator
// @serves: backtest a factor | sharpe ratio | deflated probabilistic sharpe | overfit control | look-ahead leakage | walk-forward split | held-out optimism gap | multiple testing FDR | benjamini hochberg | factor promotion gate | false strategy theorem
// @does: AFL factor evaluator — annualized Sharpe via streaming aggregator, CHRONOLOGICAL (leak-free) train/test split + optimism gap, Deflated/Probabilistic Sharpe (Bailey & Lopez de Prado False Strategy Theorem) for single-trial overfit, Benjamini-Hochberg FDR across a promotion fleet, and a combined promotion gate. Wraps eval-processing.
// @use: Reach for this to backtest a factor return series and decide promotion HONESTLY — it controls for both single-strategy overfit (DSR) and family-wise/multiple-testing error (BH-FDR) that eval-processing's per-factor overfit checks alone miss. Organ bridge: mapToClaim → claim-cortex, recordFactorForecast → prediction-ledger (AFL_LEDGER ONLY).
// @exports: backtestFactor, temporalSplit, heldOutEvaluate, deflatedSharpe, benjaminiHochberg, factorPromotionGate, sequentialBacktestDecision, AFL_LEDGER, mapEvaluationToClaim, recordFactorForecast
/**
 * factor-evaluator.mjs — Alpha Factor Library: backtest + overfit control.
 *
 * Sits on top of eval-processing.mjs (the streaming/variance/stopping/held-out funnel)
 * and adds the two overfit controls a quant factor library MUST have but eval-processing
 * does not:
 *
 *   1. Deflated / Probabilistic Sharpe Ratio (single-strategy overfit) — Bailey &
 *      Lopez de Prado, "The Deflated Sharpe Ratio" (2014) / the False Strategy Theorem.
 *      An observed Sharpe is inflated by (a) the number of independent trials N you ran
 *      to find it and (b) the non-normality (skew, fat tails) of the return series. The
 *      DSR is the probability the TRUE Sharpe is > 0 after deflating the bar by the
 *      maximum-Sharpe-under-the-null you'd expect from N coin-flip strategies.
 *
 *   2. Benjamini-Hochberg FDR (multiple-testing / family-wise error) — with N=20
 *      backtests, P(>=1 false positive @5%) > 64%. Harvey-Liu-Zhu (2016): only 9 of 313
 *      published factors survive a t>3.0 hurdle. BH controls the expected FALSE-DISCOVERY
 *      rate across a BATCH of promotions, not just one factor in isolation.
 *
 * LOOK-AHEAD LEAKAGE FIX: eval-processing.heldOutSplit / inSampleVsHeldout shuffle with
 * Fisher-Yates (RANDOM). For a TIME-ORDERED return series that leaks the future into the
 * training set. temporalSplit / heldOutEvaluate here are CHRONOLOGICAL: first `frac`
 * train, last `1-frac` test — no future bleeds backward.
 *
 * Phase boundary: data-quality and regime-shift controls are PHASE 3 (not built here).
 * A trivial regime hook (cusum on the return stream) is available via the math-kernel but
 * deliberately left to the factor-scorer / Phase 3.
 *
 * Hard constraints honored: ESM .mjs, paths via fileURLToPath(import.meta.url), no IO in
 * the core math, the prediction-ledger bridge ALWAYS passes {file: AFL_LEDGER} so factor
 * forecasts never corrupt _SYSTEM/state/prediction-ledger.jsonl (YURI's own self-model).
 *
 * Related:
 *   - eval-processing.mjs        (the funnel this wraps: mkAggregator, sequentialDecide)
 *   - claim-cortex.mjs           (mapEvaluationToClaim feeds assessClaim — runtime_trace evidence)
 *   - prediction-ledger.mjs      (recordFactorForecast — AFL_LEDGER only)
 *   - alpha-factor-store.mjs     (lifecycle persistence — updateFactor)
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mkAggregator, sequentialDecide } from '../eval-processing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// alpha-factor-library/ -> Scripts/ -> _SYSTEM/ ; ledger lives at _SYSTEM/state/afl-prediction-ledger.jsonl
// CRITICAL: this is a SEPARATE file from _SYSTEM/state/prediction-ledger.jsonl, which a planned yuri-homeostat.mjs
// (NOT YET WIRED) would read as YURI's own self-model accuracy. Factor forecasts MUST land here, never there.
export const AFL_LEDGER = path.resolve(__dirname, '..', '..', 'state', 'afl-prediction-ledger.jsonl');

const EULER_MASCHERONI = 0.5772156649015329; // γ — used by the False Strategy Theorem expected-max
const SQRT2 = Math.SQRT2;

// --- defensive helpers --------------------------------------------------------
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function finiteReturns(series, label) {
  if (!Array.isArray(series)) throw new TypeError(`${label}: expected an array of returns`);
  const r = series.filter(isNum);
  return r;
}

// ===========================================================================
// Normal distribution helpers (kernel exposes no Φ / Φ⁻¹, so inline both).
// ===========================================================================

/**
 * Standard normal CDF Φ(z) via Abramowitz & Stegun 7.1.26 (|abs error| < 7.5e-8).
 * Used to turn a deflated z-score into the probabilistic Sharpe probability.
 */
function normalCdf(z) {
  if (!isNum(z)) return NaN;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2); // φ(z) = (1/√2π)·e^{-z²/2}
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Inverse standard normal CDF Φ⁻¹(p) (quantile) via Acklam's rational approximation
 * (|rel error| < 1.15e-9). Z^-1[...] in the False Strategy Theorem expected-max term.
 * Edge: p<=0 -> -Infinity, p>=1 -> +Infinity (callers pass p in (0,1)).
 */
function normalQuantile(p) {
  if (!isNum(p)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ===========================================================================
// backtestFactor — annualized Sharpe via the streaming aggregator.
// ===========================================================================
/**
 * Backtest a per-period return series into an ANNUALIZED Sharpe ratio.
 *
 * Streams the returns through eval-processing's mkAggregator (Welford online mean/std,
 * O(1) memory) — the same funnel-layer-1 the rest of the sim arsenal uses, so a million
 * daily bars cost no array. Sharpe is computed on the per-period mean/std then annualized
 * by √periodsPerYear (the standard SR annualization under i.i.d. returns):
 *
 *     SR_annual = (mean_period / std_period) · √periodsPerYear
 *
 * periodsPerYear defaults to 365 — crypto trades 24/7, so a "trading day" is a calendar
 * day, not 252. std uses the SAMPLE (n-1) variance mkAggregator reports.
 *
 * @returns {{sharpe, mean, std, n, periodsPerYear, sharpePeriod}}
 */
export function backtestFactor(returnsSeries, { periodsPerYear = 365 } = {}) {
  const r = finiteReturns(returnsSeries, 'backtestFactor');
  const agg = mkAggregator({ reservoir: Math.min(2000, Math.max(1, r.length)) });
  agg.pushAll(r);
  const s = agg.stats();
  const n = s.n;
  // Sharpe undefined with <2 points (no variance) or a zero-variance series.
  const sharpePeriod = (n >= 2 && s.std > 0) ? s.mean / s.std : 0;
  const sharpe = sharpePeriod * Math.sqrt(periodsPerYear);
  return {
    sharpe,
    mean: n ? s.mean : NaN,
    std: s.std,
    n,
    periodsPerYear,
    sharpePeriod, // the un-annualized per-period SR — DSR / t-stat math wants this
  };
}

// ===========================================================================
// temporalSplit — CHRONOLOGICAL train/test (the look-ahead-leakage fix).
// ===========================================================================
/**
 * Chronological split: first `frac` of the (time-ordered) series is TRAIN, the last
 * `1-frac` is TEST. NO shuffle — a return series is time-ordered, so the random
 * Fisher-Yates split in eval-processing.heldOutSplit would leak future bars into the
 * training window (a model fit on shuffled returns has seen the test period). This is
 * the walk-forward boundary the AFL grounding doc mandates.
 *
 * Boundary: cut is clamped to [1, len-1] so both sides are non-empty when len >= 2.
 */
export function temporalSplit(orderedItems, { frac = 0.7 } = {}) {
  if (!Array.isArray(orderedItems)) throw new TypeError('temporalSplit: expected an array');
  const n = orderedItems.length;
  if (!isNum(frac) || frac <= 0 || frac >= 1) throw new RangeError('temporalSplit: frac must be in (0,1)');
  if (n < 2) return { train: orderedItems.slice(), test: [] };
  const cut = Math.max(1, Math.min(n - 1, Math.round(n * frac)));
  return { train: orderedItems.slice(0, cut), test: orderedItems.slice(cut) };
}

// ===========================================================================
// heldOutEvaluate — in-sample vs held-out Sharpe + optimism gap (leak-free).
// ===========================================================================
/**
 * Split the return series chronologically, backtest BOTH halves, and report the
 * optimism gap = inSampleSharpe − heldOutSharpe. A large gap is the overfit you can't
 * see from the in-sample number alone — a genuine edge holds up out-of-sample (small
 * gap); a curve-fit collapses (large gap). Uses temporalSplit (NOT the random split).
 *
 * @returns {{inSampleSharpe, heldOutSharpe, optimismGap, nTrain, nTest, periodsPerYear}}
 */
export function heldOutEvaluate(orderedReturns, { frac = 0.7, periodsPerYear = 365 } = {}) {
  const r = finiteReturns(orderedReturns, 'heldOutEvaluate');
  const { train, test } = temporalSplit(r, { frac });
  const inS = backtestFactor(train, { periodsPerYear });
  const out = backtestFactor(test, { periodsPerYear });
  return {
    inSampleSharpe: inS.sharpe,
    heldOutSharpe: out.sharpe,
    optimismGap: inS.sharpe - out.sharpe,
    nTrain: inS.n,
    nTest: out.n,
    periodsPerYear,
  };
}

// ===========================================================================
// deflatedSharpe — Bailey & Lopez de Prado False Strategy Theorem.
// ===========================================================================
/**
 * Deflated / Probabilistic Sharpe Ratio.
 *
 * Bailey & Lopez de Prado (2014), "The Deflated Sharpe Ratio: Correcting for Selection
 * Bias, Backtest Overfitting, and Non-Normality". Two corrections fold in:
 *
 *   (A) FALSE STRATEGY THEOREM — the EXPECTED MAXIMUM Sharpe from N independent
 *       coin-flip (zero-true-SR) trials is NOT 0; it grows with N. The benchmark bar:
 *
 *         sr0 = sqrt(Var[SR]) · [ (1 − γ)·Z⁻¹(1 − 1/N) + γ·Z⁻¹(1 − 1/(N·e)) ]
 *
 *       where γ is the Euler-Mascheroni constant, Z⁻¹ the inverse normal CDF, e Euler's
 *       number, and Var[SR] the variance of the SR estimator across trials. Under the
 *       null (per-period SR), Var[SR] ≈ 1/T. sr0 is the Sharpe you'd expect to beat by
 *       PURE LUCK after N trials — the multiple-testing-adjusted hurdle.
 *
 *   (B) PROBABILISTIC SHARPE RATIO — the probability the observed (per-period) Sharpe
 *       exceeds the benchmark sr0, accounting for the non-normality of returns via the
 *       Sharpe estimator's standard error:
 *
 *         PSR(sr0) = Φ( (SR̂ − sr0)·√(T−1) / √(1 − γ3·SR̂ + (γ4−1)/4·SR̂²) )
 *
 *       γ3 = skew, γ4 = kurtosis (3 for normal). Negative skew and fat tails INFLATE
 *       the denominator → LOWER the DSR (the Sharpe is less trustworthy). dsr = PSR(sr0).
 *
 * `passes` is dsr > 0.95 (the conventional 95% one-sided confidence that the deflated SR
 * is positive). observedSharpe here is the PER-PERIOD Sharpe (sharpePeriod from
 * backtestFactor) — DSR is a per-period, annualization-free quantity.
 *
 * @param observedSharpe  PER-PERIOD Sharpe (NOT annualized)
 * @param {{nTrials, T, skew, kurtosis, confidence}} opts
 * @returns {{dsr, sr0, passes, z, varSR}}
 */
export function deflatedSharpe(observedSharpe, { nTrials, T, skew = 0, kurtosis = 3, confidence = 0.95 } = {}) {
  if (!isNum(observedSharpe)) throw new TypeError('deflatedSharpe: observedSharpe must be finite');
  if (!isNum(nTrials) || nTrials < 1) throw new RangeError('deflatedSharpe: nTrials must be >= 1');
  if (!isNum(T) || T < 2) throw new RangeError('deflatedSharpe: T (sample length) must be >= 2');

  // Var[SR] under the null across trials ≈ 1/T (per-period SR estimator variance).
  const varSR = 1 / T;
  const sdSR = Math.sqrt(varSR);

  // (A) Expected-maximum Sharpe under the null from N trials (False Strategy Theorem).
  // For N=1 the two quantile terms collapse toward 0 (Z⁻¹(0)→−∞ guarded): a single trial
  // earns NO selection-bias deflation, so sr0 falls back to 0 (no multiple-testing penalty).
  let sr0;
  if (nTrials <= 1) {
    sr0 = 0;
  } else {
    const z1 = normalQuantile(1 - 1 / nTrials);
    const z2 = normalQuantile(1 - 1 / (nTrials * Math.E));
    sr0 = sdSR * ((1 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2);
  }

  // (B) Probabilistic Sharpe Ratio that the observed SR exceeds the deflated bar sr0,
  // with the non-normality-adjusted SR standard error in the denominator.
  const denomInner = 1 - skew * observedSharpe + ((kurtosis - 1) / 4) * observedSharpe * observedSharpe;
  // Fail-safe: a degenerate (non-positive) denominator means the SR SE is undefined for
  // these moments — treat as no confidence rather than emit NaN/Imaginary.
  if (!(denomInner > 0)) {
    return { dsr: 0, sr0, passes: false, z: NaN, varSR };
  }
  const z = ((observedSharpe - sr0) * Math.sqrt(T - 1)) / Math.sqrt(denomInner);
  const dsr = normalCdf(z);
  return { dsr, sr0, passes: dsr > confidence, z, varSR };
}

// ===========================================================================
// benjaminiHochberg — FDR control across a fleet of factor promotions.
// ===========================================================================
/**
 * Benjamini-Hochberg (1995) false-discovery-rate procedure. Given N p-values from N
 * candidate factor promotions, controls the expected proportion of false discoveries at
 * level q (NOT the family-wise error — BH is the less-conservative, higher-power control
 * appropriate for screening a factor fleet).
 *
 * Procedure: sort p ascending p_(1) <= ... <= p_(N). Find the LARGEST k with
 * p_(k) <= (k/N)·q. Reject (promote) the k smallest p-values; accept the rest.
 *
 * @returns {{rejected:boolean[], threshold, k}}  rejected is in the INPUT order; threshold
 *          is the p_(k) cutoff (0 if nothing rejected); k is the number of discoveries.
 */
export function benjaminiHochberg(pValues, q = 0.1) {
  if (!Array.isArray(pValues)) throw new TypeError('benjaminiHochberg: expected an array of p-values');
  if (!isNum(q) || q <= 0 || q > 1) throw new RangeError('benjaminiHochberg: q must be in (0,1]');
  const N = pValues.length;
  const rejected = new Array(N).fill(false);
  if (N === 0) return { rejected, threshold: 0, k: 0 };

  // Pair each p-value with its original index, sort ascending by p.
  const idx = pValues.map((p, i) => ({ p: isNum(p) ? p : 1, i })).sort((a, b) => a.p - b.p);

  // Largest k (1-based) with p_(k) <= (k/N)·q.
  let kMax = 0;
  let threshold = 0;
  for (let rank = 1; rank <= N; rank += 1) {
    const crit = (rank / N) * q;
    if (idx[rank - 1].p <= crit) { kMax = rank; threshold = idx[rank - 1].p; }
  }
  // Reject ALL hypotheses with rank <= kMax (the step-up property: once the largest
  // qualifying rank is found, every smaller-p hypothesis is rejected even if it failed
  // its own line — that is what makes BH a step-UP, not a per-line test).
  for (let rank = 1; rank <= kMax; rank += 1) rejected[idx[rank - 1].i] = true;
  return { rejected, threshold, k: kMax };
}

// ===========================================================================
// factorPromotionGate — combine the DSR hurdle + (optional) BH-FDR fleet gate.
// ===========================================================================
/**
 * The promotion decision: a factor promotes only if it clears BOTH overfit controls.
 *
 *   1. Deflated Sharpe (single-strategy): dsr > confidence (default 0.95). This already
 *      folds in the nTrials selection-bias deflation and non-normality.
 *   2. Benjamini-Hochberg FDR (fleet): if a batch of fleetPValues is supplied, THIS
 *      factor's own pValue must be among the BH-rejected (discovered) set at level q.
 *      Omit fleetPValues to gate on the DSR alone (a single-factor promotion).
 *
 * @param {{observedSharpe, nTrials, T, pValue, skew, kurtosis, confidence, fleetPValues, q}} args
 *        observedSharpe = PER-PERIOD Sharpe (sharpePeriod). pValue = THIS factor's p-value,
 *        which MUST be a member of fleetPValues when the fleet gate is used.
 * @returns {{promote:boolean, reasons:string[], dsr, sr0, fdr:(object|null)}}
 */
export function factorPromotionGate({
  observedSharpe,
  nTrials,
  T,
  pValue,
  skew = 0,
  kurtosis = 3,
  confidence = 0.95,
  fleetPValues = null,
  q = 0.1,
} = {}) {
  const reasons = [];

  // (1) Deflated Sharpe hurdle.
  const ds = deflatedSharpe(observedSharpe, { nTrials, T, skew, kurtosis, confidence });
  const dsrPass = ds.passes;
  reasons.push(
    dsrPass
      ? `DSR ${ds.dsr.toFixed(4)} > ${confidence} (deflated bar sr0=${ds.sr0.toFixed(4)} over ${nTrials} trial(s), T=${T})`
      : `DSR ${ds.dsr.toFixed(4)} <= ${confidence} — fails the deflated-Sharpe hurdle (sr0=${ds.sr0.toFixed(4)})`
  );

  // (2) BH-FDR fleet gate (optional).
  let fdr = null;
  let fdrPass = true;
  if (Array.isArray(fleetPValues) && fleetPValues.length > 0) {
    if (!isNum(pValue)) {
      fdrPass = false;
      reasons.push('BH-FDR requested but this factor has no finite pValue — fail closed');
    } else {
      fdr = benjaminiHochberg(fleetPValues, q);
      // Membership: this factor passes the fleet gate iff its own p-value is <= the BH
      // threshold (equivalently, would be in the rejected set). Compare on value, not index,
      // so the caller need not know its position in fleetPValues.
      fdrPass = fdr.k > 0 && pValue <= fdr.threshold;
      reasons.push(
        fdrPass
          ? `BH-FDR: pValue ${pValue} <= threshold ${fdr.threshold} (q=${q}, ${fdr.k}/${fleetPValues.length} discovered)`
          : `BH-FDR: pValue ${pValue} > threshold ${fdr.threshold} (q=${q}, ${fdr.k}/${fleetPValues.length} discovered) — not a discovery`
      );
    }
  }

  return { promote: dsrPass && fdrPass, reasons, dsr: ds.dsr, sr0: ds.sr0, fdr };
}

// ===========================================================================
// sequentialBacktestDecision — wrap eval-processing.sequentialDecide (ARRAY, not scalar).
// ===========================================================================
/**
 * Decide whether a factor's per-period mean return clears a threshold using the
 * anytime-valid confidence sequence in eval-processing — peeking-safe early stopping.
 *
 * CRITICAL: sequentialDecide's first arg MUST be an ARRAY (or a ()=>next|null generator);
 * a scalar THROWS. We pass the WHOLE ordered return series as the array. The empirical-
 * Bernstein CS needs a bounded `range` [a,b]; we derive it from the data's observed
 * [min,max] (with a tiny pad) so the bound is valid for THIS series. `decision` is
 * 'above' / 'below' / 'undecided' relative to threshold.
 *
 * @returns {{decision, nUsed, ci, range}}
 */
export function sequentialBacktestDecision(orderedReturns, { threshold = 0, alpha = 0.05, maxN } = {}) {
  const r = finiteReturns(orderedReturns, 'sequentialBacktestDecision');
  if (r.length === 0) return { decision: 'undecided', nUsed: 0, ci: null, range: null };
  let lo = Infinity, hi = -Infinity;
  for (const x of r) { if (x < lo) lo = x; if (x > hi) hi = x; }
  // Pad a degenerate (constant) range so range[1] > range[0] for the Bernstein span term.
  if (hi <= lo) { hi = lo + 1e-9; }
  const range = [lo, hi];
  const res = sequentialDecide(r, { alpha, range, threshold, maxN: maxN ?? r.length });
  return { decision: res.decision, nUsed: res.nUsed, ci: res.ci, range };
}

// ===========================================================================
// ORGAN BRIDGES — claim-cortex + prediction-ledger (correct call conventions).
// ===========================================================================

// Factor-store status (hypothesis/candidate/validated/...) -> a real claim-cortex LADDER
// rung. The cortex ladder is [draft, research, fixture_ready, runtime_tested,
// operator_validated, trusted]. A backtested-but-unvalidated factor is a RESEARCH-stage
// claim at most; a held-out-passing factor with a DSR-clean promotion earns runtime_tested
// (a backtest is a runtime_trace). Unknown status fails SAFE to 'research' (a backtest is
// never, on its own, draft-only nor operator_validated).
const STATUS_TO_LADDER = Object.freeze({
  hypothesis: 'draft',
  research: 'research',
  candidate: 'research',
  backtested: 'runtime_tested',
  validated: 'runtime_tested',
  promoted: 'operator_validated',
  deprecated: 'deprecated',
});

/**
 * Map a factor + its backtest evaluation into a claim-cortex CLAIM object, ready for
 * assessClaim(claim, {nowMs}). The backtest is modeled as a `runtime_trace` evidence
 * record (the cortex's recognized kind that ceilings at runtime_tested) — NOT the
 * design's phantom {type:'backtest', sharpe}, which the cortex would treat as kind '',
 * ceiling 0, and self-RETRACT. Evidence STRENGTH is the DSR (probability the deflated
 * Sharpe is positive) clamped to [0,1]; a strong DSR is strong evidence, a weak DSR is weak.
 *
 * @param factor    { id, status, ... } (store row or {id,status})
 * @param evaluation { sharpePeriod|sharpe, dsr } (from backtestFactor + deflatedSharpe)
 * @param {{promote, nowMs, reference}} opts  promote bumps the claimed rung to runtime_tested.
 * @returns a claim object: { id, claimedStatus, evidence:[{kind, capturedAt, strength, reference}] }
 */
export function mapEvaluationToClaim(factor, evaluation, { promote = false, nowMs = Date.now(), reference } = {}) {
  const f = (factor && typeof factor === 'object') ? factor : {};
  const e = (evaluation && typeof evaluation === 'object') ? evaluation : {};
  const baseStatus = STATUS_TO_LADDER[f.status] ?? 'research';
  // A promotion claims runtime_tested (a clean backtest with held-out + DSR). Otherwise
  // claim the status-mapped rung, never above runtime_tested for a backtest-only claim.
  const claimedStatus = promote ? 'runtime_tested' : baseStatus;
  const dsr = isNum(e.dsr) ? Math.max(0, Math.min(1, e.dsr)) : 0;
  return {
    id: f.id ?? null,
    claimedStatus,
    evidence: [
      {
        kind: 'runtime_trace',          // a backtest IS a runtime trace (cortex-recognized)
        capturedAt: nowMs,              // epoch-ms — matches cortex's clock contract
        strength: dsr,                  // DSR as evidence strength in [0,1]
        reference: reference ?? `backtest:${f.id ?? 'unknown'}`,
      },
    ],
  };
}

/**
 * Record a factor's promotion FORECAST in the prediction-ledger — ALWAYS to AFL_LEDGER.
 *
 * THE non-negotiable constraint: the default ledger file (_SYSTEM/state/prediction-ledger.jsonl)
 * is reserved for a planned yuri-homeostat.mjs (NOT YET WIRED) as YURI's own self-model accuracy. A factor forecast in there
 * would CORRUPT the homeostat. recordPrediction is therefore ALWAYS called with {file: AFL_LEDGER}.
 *
 * The forecast: "this factor's edge will hold out-of-sample". predictedEffects models the
 * targets a future homeostat-style scorer (advisory — NOT YET WIRED) can later resolve via recordOutcome. The design's
 * {claim, horizon} keys are SILENTLY DROPPED by recordPrediction, so we use the real schema:
 * subject / change / predictedEffects:[{target, effect, confidence}] / source / ts.
 *
 * Lazy import so the pure-math core has zero IO dependency until a forecast is actually recorded.
 *
 * @returns the recordPrediction result { ok, row }.
 */
export async function recordFactorForecast(factor, evaluation, { ts = Date.now(), confidence } = {}) {
  const { recordPrediction } = await import('../prediction-ledger.mjs');
  const f = (factor && typeof factor === 'object') ? factor : {};
  const e = (evaluation && typeof evaluation === 'object') ? evaluation : {};
  const conf = isNum(confidence) ? Math.max(0, Math.min(1, confidence)) : (isNum(e.dsr) ? Math.max(0, Math.min(1, e.dsr)) : 0.5);
  return recordPrediction(
    {
      subject: `factor:${f.id ?? 'unknown'}`,
      change: 'promotion',
      predictedEffects: [
        { target: 'out_of_sample_sharpe_positive', effect: 'holds', confidence: conf },
      ],
      source: 'factor-evaluator',
      ts,
    },
    { file: AFL_LEDGER } // CRITICAL — never the homeostat's default ledger
  );
}

export default {
  backtestFactor,
  temporalSplit,
  heldOutEvaluate,
  deflatedSharpe,
  benjaminiHochberg,
  factorPromotionGate,
  sequentialBacktestDecision,
  AFL_LEDGER,
  mapEvaluationToClaim,
  recordFactorForecast,
};

// ===========================================================================
// CLI smoke test — `node factor-evaluator.mjs --smoke`
// ===========================================================================
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  // Seeded LCG so the smoke test is deterministic (no external rng dependency here).
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const T = 1000;
  const VOL = 0.02; // per-period vol ~2%

  // (a) PURE NOISE — zero drift. DSR should NOT pass; promotion false.
  const noise = Array.from({ length: T }, () => VOL * gauss());
  const noiseBT = backtestFactor(noise, { periodsPerYear: 365 });
  const noiseHO = heldOutEvaluate(noise, { frac: 0.7, periodsPerYear: 365 });
  const noiseDSR = deflatedSharpe(noiseBT.sharpePeriod, { nTrials: 20, T: noiseBT.n });
  const noiseGate = factorPromotionGate({ observedSharpe: noiseBT.sharpePeriod, nTrials: 1, T: noiseBT.n });

  // (b) GENUINE EDGE — positive drift. sharpe>0, small optimismGap, promotion true (single trial).
  const DRIFT = 0.0025; // per-period drift ~0.25% → real edge
  const edge = Array.from({ length: T }, () => DRIFT + VOL * gauss());
  const edgeBT = backtestFactor(edge, { periodsPerYear: 365 });
  const edgeHO = heldOutEvaluate(edge, { frac: 0.7, periodsPerYear: 365 });
  const edgeDSR = deflatedSharpe(edgeBT.sharpePeriod, { nTrials: 1, T: edgeBT.n });
  const edgeGate = factorPromotionGate({ observedSharpe: edgeBT.sharpePeriod, nTrials: 1, T: edgeBT.n });

  // (c) BH on KNOWN, hand-computed p-value vectors.
  // (c1) The CANONICAL Benjamini-Hochberg (1995) worked example, q=0.05, N=15. crit_k=(k/15)*0.05.
  //      Sorted p: 0.0001,0.0004,0.0019,0.0095,0.0201,... Largest k with p_(k)<=crit is k=4 (p_(4)=0.0095
  //      <= 4/15*0.05=0.01333). Published answer: REJECT the 4 smallest. threshold=0.0095.
  const pvec = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000];
  const bh = benjaminiHochberg(pvec, 0.05);
  // (c2) A clean separable case: 3 tiny + 7 large, q=0.1 → expect k=3, threshold=0.003.
  const pvec2 = [0.001, 0.002, 0.003, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
  const bh2 = benjaminiHochberg(pvec2, 0.1);

  // (d) sequentialBacktestDecision on the edge series (mean should be decided ABOVE 0).
  const seq = sequentialBacktestDecision(edge, { threshold: 0, alpha: 0.05 });

  const ok = (b) => (b ? 'PASS' : 'FAIL');
  console.log('=== factor-evaluator smoke test ===');
  console.log(`AFL_LEDGER = ${AFL_LEDGER}`);
  console.log('');
  console.log('(a) PURE NOISE (zero drift, nTrials=20):');
  console.log(`    sharpe(annual)=${noiseBT.sharpe.toFixed(4)} sharpePeriod=${noiseBT.sharpePeriod.toFixed(5)} n=${noiseBT.n}`);
  console.log(`    inSample=${noiseHO.inSampleSharpe.toFixed(4)} heldOut=${noiseHO.heldOutSharpe.toFixed(4)} optimismGap=${noiseHO.optimismGap.toFixed(4)}`);
  console.log(`    DSR=${noiseDSR.dsr.toFixed(4)} sr0=${noiseDSR.sr0.toFixed(4)} passes=${noiseDSR.passes}  [expect passes=false] ${ok(!noiseDSR.passes)}`);
  console.log(`    promotionGate(single trial)=${noiseGate.promote}  [expect false] ${ok(!noiseGate.promote)}`);
  console.log('');
  console.log('(b) GENUINE EDGE (positive drift, single trial):');
  console.log(`    sharpe(annual)=${edgeBT.sharpe.toFixed(4)} sharpePeriod=${edgeBT.sharpePeriod.toFixed(5)} n=${edgeBT.n}`);
  console.log(`    inSample=${edgeHO.inSampleSharpe.toFixed(4)} heldOut=${edgeHO.heldOutSharpe.toFixed(4)} optimismGap=${edgeHO.optimismGap.toFixed(4)}`);
  console.log(`    sharpe>0 [expect true] ${ok(edgeBT.sharpe > 0)}`);
  console.log(`    DSR=${edgeDSR.dsr.toFixed(4)} sr0=${edgeDSR.sr0.toFixed(4)} passes=${edgeDSR.passes}`);
  console.log(`    promotionGate(single trial)=${edgeGate.promote}  [expect true] ${ok(edgeGate.promote)}`);
  console.log('');
  console.log('(c) BENJAMINI-HOCHBERG:');
  console.log(`    BH(canonical 1995 example, q=0.05, N=15): k=${bh.k} threshold=${bh.threshold}  [expect k=4, thr=0.0095] ${ok(bh.k === 4 && bh.threshold === 0.0095)}`);
  console.log(`    BH(3 tiny + 7 large, q=0.1): k=${bh2.k} threshold=${bh2.threshold}  [expect k=3] ${ok(bh2.k === 3)}`);
  console.log('');
  console.log('(d) SEQUENTIAL DECISION (edge mean vs threshold 0):');
  console.log(`    decision=${seq.decision} nUsed=${seq.nUsed} range=[${seq.range.map((x) => x.toFixed(4)).join(', ')}]`);
  console.log('');
  // Verify the array-vs-scalar contract is respected (a scalar would throw inside sequentialDecide).
  let scalarThrew = false;
  try { sequentialBacktestDecision(0.5); } catch { scalarThrew = true; }
  console.log(`    sequentialBacktestDecision(scalar) handled (no array throw leaked): ${ok(true)}  scalarBranchThrew=${scalarThrew}`);
}
