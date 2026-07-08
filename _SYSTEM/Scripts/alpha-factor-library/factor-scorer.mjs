// @capability: afl-factor-scorer
// @serves: factor quality score | alpha factor scoring | factor calibration brier | factor evidence decay | portfolio diversification | factor retrievability | rank alpha factors
// @does: AFL quality scorer — composes math-kernel (brier/entropy/confidenceDecay) + yuri-fsrs (retrievability) into a single composite factorQualityScore plus the evidence-decay / calibration / diversification primitives it ranks on
// @use: reach for this to RANK alpha factors by quality (NOT to gate promotion — that is claim-cortex/energy-gate). Use the named primitives directly for the individual terms
// @exports: factorEvidenceDecay, factorRetrievability, factorCalibrationBrier, portfolioDiversification, factorQualityScore, AFL_LEDGER
/**
 * factor-scorer.mjs — AFL quality-scoring layer (design §3.3, ranking-not-gating).
 *
 * This is the RANKING instrument. It wraps two verified organs:
 *   - math-kernel.mjs : brierScore (calibration), entropy + normalizeDistribution
 *                       (portfolio diversification), confidenceDecay (evidence aging).
 *   - yuri-fsrs.mjs   : retrievability (FSRS power-law evidence-freshness curve).
 *
 * IT DOES NOT GATE PROMOTION. Promotion across the claim ladder is owned by
 * claim-cortex.mjs (gateClaimTransition) + the energy gate (yuri-energy.mjs). This
 * module only produces a continuous quality scalar used to RANK candidate factors.
 *
 * Call conventions are pinned against the live organ signatures (verified by reading
 * the source — several design-doc signatures were WRONG and are corrected here):
 *   - confidenceDecay({base, age, halfLife})  — OBJECT arg; positional THROWS.
 *   - retrievability(stabilityDays, daysSinceUse) — positional; FSRS power-law curve.
 *     (the design's `fsrsRetrievability` is a PHANTOM — the real export is `retrievability`.)
 *   - brierScore(predictions, outcomes) — both probability arrays in [0,1], equal length.
 *   - entropy(probs) / normalizeDistribution(values) — non-negative, positive-sum.
 *
 * Pure arithmetic, ESM, no I/O on the scoring path. Paths resolve via
 * fileURLToPath(import.meta.url) per the YURI-OS hard constraint.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  brierScore,
  confidenceDecay,
  entropy,
  normalizeDistribution,
} from '../math/math-kernel.mjs';
import { retrievability } from '../math/yuri-fsrs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AFL_LEDGER — the AFL's OWN prediction-ledger file, isolated from YURI's self-model.
 *
 * CRITICAL: prediction-ledger.mjs defaults to _SYSTEM/state/prediction-ledger.jsonl,
 * which a planned yuri-homeostat.mjs (NOT YET WIRED) would read as YURI's own self-model accuracy. Factor forecasts
 * MUST NOT land there or they corrupt the homeostat's rolling Brier. Every AFL ledger
 * call (recordPrediction / recordOutcome / calibrationReport / readLedger) in later
 * phases MUST pass `{ file: AFL_LEDGER }`. Defined here, imported elsewhere.
 *   alpha-factor-library/ -> Scripts/ -> _SYSTEM/ -> _SYSTEM/state/afl-prediction-ledger.jsonl
 */
export const AFL_LEDGER = path.resolve(
  __dirname, '..', '..', 'state', 'afl-prediction-ledger.jsonl',
);

// ---------------------------------------------------------------------------
// Primitive 1 — evidence decay (confidence half-life)
// ---------------------------------------------------------------------------

/**
 * Half-life decay of an evidence/confidence value: base * 0.5^(ageDays/halfLifeDays).
 * Thin adapter that pins the OBJECT-ARG convention (math-kernel.confidenceDecay throws
 * on positional args). `base` must be in [0,1], age >= 0, halfLifeDays > 0 — the kernel
 * enforces these and throws on violation (fail-closed, no silent clamp here).
 *
 * @param {number} base          confidence in [0,1] at age 0
 * @param {number} ageDays       days elapsed since the evidence was captured (>= 0)
 * @param {number} [halfLifeDays=30]  half-life in days (> 0); default matches the
 *                                    cortex's DEFAULT_EVIDENCE_HALFLIFE_DAYS = 30
 * @returns {number} decayed confidence in [0, base]
 */
export function factorEvidenceDecay(base, ageDays, halfLifeDays = 30) {
  return confidenceDecay({ base, age: ageDays, halfLife: halfLifeDays });
}

// ---------------------------------------------------------------------------
// Primitive 2 — evidence retrievability (FSRS power-law freshness)
// ---------------------------------------------------------------------------

/**
 * FSRS retrievability of a factor's evidence: 1 right after use, decaying along the
 * validated power-law curve R(t) = (1 + FACTOR·t/S)^DECAY. Higher = the evidence is
 * still "retrievable"/fresh; a backtest confirmed long ago with low stability decays.
 *
 * @param {number} stabilityDays  S — larger S = slower decay (e.g. a robust factor)
 * @param {number} daysSinceUse   t — days since the evidence was last confirmed/used
 * @returns {number} retrievability in (0,1]  (S<=0 -> 0; t<=0 -> 1)
 */
export function factorRetrievability(stabilityDays, daysSinceUse) {
  return retrievability(stabilityDays, daysSinceUse);
}

// ---------------------------------------------------------------------------
// Primitive 3 — calibration (Brier score; lower = better-calibrated)
// ---------------------------------------------------------------------------

/**
 * Brier score of a factor's probabilistic forecasts vs realized outcomes.
 * Lower is better (0 = perfect, 1 = maximally wrong). Both arrays must be equal-length
 * probabilities in [0,1] (the kernel asserts this and throws otherwise).
 *
 * @param {number[]} predictions  forecast probabilities in [0,1]
 * @param {number[]} outcomes     realized outcomes in [0,1] (typically 0/1)
 * @returns {number} mean Brier score in [0,1]
 */
export function factorCalibrationBrier(predictions, outcomes) {
  return brierScore(predictions, outcomes);
}

// ---------------------------------------------------------------------------
// Primitive 4 — portfolio diversification (entropy of weights)
// ---------------------------------------------------------------------------

/**
 * Portfolio diversification = entropy of the NORMALIZED weight distribution, in nats.
 * Higher = more diversified (mass spread evenly); a single-factor portfolio -> 0.
 * Weights must be non-negative with a positive sum (kernel throws otherwise).
 *
 * NOTE this is the PORTFOLIO-LEVEL diversification (concentration of capital across the
 * whole book). It is distinct from the per-factor `diversification` TERM inside
 * factorQualityScore, which is 1 - maxPairwiseCorr (the marginal correlation a single
 * candidate adds). Both are "diversification" by name; they measure different things.
 *
 * @param {number[]} weights  non-negative portfolio weights (need not sum to 1)
 * @returns {number} entropy in nats (>= 0); higher = more diversified
 */
export function portfolioDiversification(weights) {
  return entropy(normalizeDistribution(weights));
}

// ---------------------------------------------------------------------------
// Composite — factor quality score (design §3.3; ranking, NOT gating)
// ---------------------------------------------------------------------------

/** Clamp a value into [lo, hi]; non-finite collapses to lo (fail-low for ranking). */
function clamp(value, lo, hi) {
  const v = Number(value);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Composite factor quality score (design §3.3) — a single scalar for RANKING factors.
 * NOT a promotion gate (that is claim-cortex + the energy gate).
 *
 *   score = 0.35·backtestSharpe_norm
 *         + 0.25·(1 - calibrationBrier)
 *         + 0.20·retrievability
 *         + 0.20·diversification
 *
 * Each term is documented below. All four terms are normalized into [0,1] so the
 * weighted sum lands in [0,1] and is comparable across factors:
 *
 *   1. backtestSharpe_norm (w=0.35) — the factor's out-of-sample Sharpe, read from
 *      factor.backtest_results?.sharpe ?? factor.sharpe_estimate ?? 0 (matching the
 *      live store columns), then mapped to [0,1] via sharpe/(1+|sharpe|). This is a
 *      bounded, monotone squash: a NEGATIVE Sharpe maps below 0.5 (still penalized but
 *      kept in-range), Sharpe 0 -> 0.5, Sharpe 1 -> 0.667, Sharpe 3 -> 0.75, saturating
 *      toward 1. Raw Sharpe is unbounded, so feeding it un-normalized would let one
 *      term dominate the composite — the squash keeps the 0.35 weight meaningful.
 *
 *   2. (1 - calibrationBrier) (w=0.25) — calibration quality. Brier in [0,1] is
 *      lower-is-better, so 1-Brier is higher-is-better. Default 0.5 (the design's
 *      uninformed prior: a factor with no calibration history scores neutrally here).
 *
 *   3. retrievability (w=0.20) — FSRS freshness of the supporting evidence: how recently
 *      / robustly the backtest was confirmed. Computed from stabilityDays (S) and
 *      daysSinceConfirmed (t). Stale evidence drags the score down even if the Sharpe
 *      looked good once.
 *
 *   4. diversification (w=0.20) — marginal diversification benefit of adding THIS factor:
 *      1 - maxPairwiseCorr, where maxPairwiseCorr in [0,1] is the largest absolute
 *      correlation of this factor against the existing portfolio. maxPairwiseCorr=0 ->
 *      diversification 1 (orthogonal, maximally additive); =1 -> 0 (a redundant clone).
 *      |corr| is clamped to [0,1] before inverting so an out-of-range input can't push
 *      the term outside [0,1].
 *
 * @param {object} factor  AFL factor row. Reads .backtest_results?.sharpe (parsed JSON)
 *                         then .sharpe_estimate as the Sharpe source.
 * @param {object} [opts]
 * @param {number[]} [opts.portfolioWeights]   reserved for portfolio-level use; not read
 *                                              by the per-factor composite (the marginal
 *                                              diversification term uses maxPairwiseCorr).
 * @param {number} [opts.maxPairwiseCorr=0]     largest |corr| vs the existing portfolio
 * @param {number} [opts.calibrationBrier=0.5]  Brier score of this factor's forecasts
 * @param {number} [opts.daysSinceConfirmed=0]  days since the backtest/evidence confirmed
 * @param {number} [opts.stabilityDays=30]      FSRS stability S of the evidence
 * @returns {number} composite quality score in [0,1]; higher = better
 */
export function factorQualityScore(factor, {
  portfolioWeights,           // eslint-disable-line no-unused-vars -- reserved (see JSDoc)
  maxPairwiseCorr = 0,
  calibrationBrier = 0.5,
  daysSinceConfirmed = 0,
  stabilityDays = 30,
} = {}) {
  const f = (factor && typeof factor === 'object') ? factor : {};

  // Term 1 — Sharpe, read from the live store shape, then bounded-squashed to [0,1].
  const rawSharpe = Number(
    f.backtest_results?.sharpe ?? f.sharpe_estimate ?? 0,
  );
  const sharpe = Number.isFinite(rawSharpe) ? rawSharpe : 0;
  // sharpe/(1+|sharpe|) ∈ (-1,1); +1)/2 -> (0,1). Monotone, bounded, 0 -> 0.5.
  const sharpeNorm = clamp((sharpe / (1 + Math.abs(sharpe)) + 1) / 2, 0, 1);

  // Term 2 — calibration: 1 - Brier, clamped (a passed-in Brier could be out of range).
  const calibrationTerm = clamp(1 - clamp(calibrationBrier, 0, 1), 0, 1);

  // Term 3 — FSRS retrievability of the supporting evidence (already in (0,1]).
  const retrievabilityTerm = clamp(
    factorRetrievability(stabilityDays, daysSinceConfirmed), 0, 1,
  );

  // Term 4 — marginal diversification: 1 - |maxPairwiseCorr|, corr clamped to [0,1].
  const diversificationTerm = clamp(1 - clamp(Math.abs(maxPairwiseCorr), 0, 1), 0, 1);

  return clamp(
    0.35 * sharpeNorm
    + 0.25 * calibrationTerm
    + 0.20 * retrievabilityTerm
    + 0.20 * diversificationTerm,
    0, 1,
  );
}

// ---------------------------------------------------------------------------
// Self-smoke: high-sharpe well-calibrated fresh factor vs stale poorly-calibrated.
// `node factor-scorer.mjs` runs it; importers don't.
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Prove the object-arg convention for confidenceDecay (positional would THROW).
  const decayObjArg = factorEvidenceDecay(1.0, 30, 30); // -> 0.5 at one half-life
  let positionalThrows = false;
  try {
    // confidenceDecay(1.0, 30, 30) — positional: math-kernel destructures {base},
    // so base=1.0 but age/halfLife are undefined -> throws "age must be a finite number".
    confidenceDecay(1.0, 30, 30);
  } catch {
    positionalThrows = true;
  }

  const goodFactor = {
    name: 'momentum-12m',
    backtest_results: { sharpe: 2.5 },
    status: 'backtested',
  };
  const badFactor = {
    name: 'noise-reversal',
    sharpe_estimate: 0.1,
    status: 'hypothesis',
  };

  const goodScore = factorQualityScore(goodFactor, {
    maxPairwiseCorr: 0.1,        // nearly orthogonal -> high diversification
    calibrationBrier: 0.08,      // well calibrated
    daysSinceConfirmed: 1,       // fresh
    stabilityDays: 60,           // robust evidence
  });
  const badScore = factorQualityScore(badFactor, {
    maxPairwiseCorr: 0.9,        // crowded -> low diversification
    calibrationBrier: 0.45,      // poorly calibrated
    daysSinceConfirmed: 400,     // stale
    stabilityDays: 5,            // fragile evidence
  });

  const diversifiedBook = portfolioDiversification([1, 1, 1, 1]); // even -> max entropy
  const concentratedBook = portfolioDiversification([10, 1, 1, 1]); // skewed -> lower

  console.log(JSON.stringify({
    decay_objArg_30d_halfLife: decayObjArg,
    confidenceDecay_positional_throws: positionalThrows,
    goodFactor_score: goodScore,
    badFactor_score: badScore,
    good_beats_bad: goodScore > badScore,
    retrievability_fresh_1d_S60: factorRetrievability(60, 1),
    retrievability_stale_400d_S5: factorRetrievability(5, 400),
    calibration_brier_demo: factorCalibrationBrier([0.9, 0.1, 0.8], [1, 0, 1]),
    portfolio_diversified: diversifiedBook,
    portfolio_concentrated: concentratedBook,
    diversified_beats_concentrated: diversifiedBook > concentratedBook,
    AFL_LEDGER,
  }, null, 2));
}
