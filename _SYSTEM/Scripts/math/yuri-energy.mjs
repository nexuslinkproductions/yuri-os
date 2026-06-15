#!/usr/bin/env node
// @capability: energy-gate-scoring
// @serves: energy | composite score | weighted composite | gate | progress regress | lyapunov | delta U | claim evaluation | penalty reward | calibration | verification credit | should this block
// @does: U = additive weighted composite of badness (entropy, miscalibration, staleness, protected-path violations +100, ladder-inversions +10) minus credits (information-gain, verified-evidence). Penalties raise U, credits lower it.
// @use: Reach for this before building any composite/weighted scorer or gate. Audit new composites against its sign convention (penalties +, credits -).
// @exports: computeU
/**
 * YURI Energy Function — yuri-energy.mjs
 *
 * Composes existing math-kernel primitives into a scalar potential U(state)
 * over YURI control-plane state. Bound to dispatch and claim promotion as a
 * Lyapunov-style rejection rule:
 *
 *   ΔU > threshold → reject the proposed transition (unless operator override)
 *   ΔU ≤ threshold → accept the proposed transition
 *
 * Architectural disclaimer:
 *
 * This is NOT the Potential-Derived (PD) layer from the energy-based-models
 * literature. It is an applied composition of proven primitives at the
 * control-plane meta-level, not at the neural-network weight level.
 *
 * The weights are designed (hand-tuned), not learned. This is an explicit
 * limitation noted in the methodology paper. The current weights reflect the
 * policy "claim/evidence drift is bad, protected-path violations are
 * catastrophic, verified evidence is good."
 *
 * Status: research → fixture_ready. Not yet runtime_tested in dispatch.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/math-kernel.mjs           (primitives composed here)
 *   - _SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md §4.1
 *   - YURI memory: project-energy-landscape-paper
 */

import {
  entropy,
  klDivergence,
  logLoss,
  brierScore,
  informationGain,
  confidenceDecay,
  maxEntBelief,
  hazardMultiplier,
  makeMathResult,
} from './math-kernel.mjs';

// Transitive kernel re-export (MATH-07 seam contract). The claim-cortex composes
// kernel primitives THROUGH this module, never by importing math-kernel directly —
// keeping a single energy↔kernel edge. This is a pure pass-through: maxEntBelief +
// hazardMultiplier are NOT consumed by computeU/gateProposal, so re-exporting them
// changes no live verdict.
export { maxEntBelief, hazardMultiplier };

// B4 ground-truth log seam (substrate-frontier-grade, 2026-06-14): an OPT-IN, FAIL-OPEN
// capture of each gateProposal verdict. maybeTraceGateVerdict is a NO-OP unless
// YURI_GATE_TRACE is set, so this import + its single call site below leave the clean
// path byte-identical (proven ∀-input by yuri-energy-gate-invariants over genGateCorpus).
// No cycle: the trace module imports nothing from here at top level (its only back-import
// is a CLI-block dynamic import).
import { maybeTraceGateVerdict } from './yuri-energy-gate-trace.mjs';

// ENG-01 default baseline halfLife (days) for the SHADOW Cox-aging metric. The live
// confidenceDecay path requires a per-record halfLife; persisted evidence records
// (energy-tick-core.applyTransition) carry none. ζ arms via the FLAG-GATED config
// key `staleness.halfLifeDays` in energy-weights.json (yuri-energy-config.mjs):
// when set, energy-tick-core hydrates evidence at read time (age from capturedAt,
// halfLife from config). Absent key → ζ stays a skipped term. This default is
// used ONLY by the advisory evalStalenessShadow below, never by computeU.
const SHADOW_BASE_HALF_LIFE_DAYS = 7;

const ENERGY_PRECISION = 1e9;

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------
//
// These weights are hand-tuned, not learned. They encode the policy described
// above. Override per-call via the `weights` argument if a specific dispatch
// scenario requires a different weighting.

export const DEFAULT_WEIGHTS = Object.freeze({
  alpha: 1.0,    // entropy(claimPromotionDistribution) — uncertainty about claim status
  beta: 2.0,     // wasserstein1(claimed, verified) — ordinal drift between claim and evidence (energyFormulaVersion 3; was klDivergence ≤ v2)
  gamma: 1.0,    // logLoss(predictions, outcomes) — forecast calibration penalty
  delta: 1.0,    // brierScore(forecasts, results) — forecast accuracy penalty
  epsilon: 1.0,  // -informationGain(prior, posterior) — info gain LOWERS energy
  zeta: 0.5,    // sum(staleness) — stale evidence dragging state up
  eta: 100.0,   // protectedPathViolations — catastrophic, high weight
  theta: 10.0,  // promotionLadderInversions — high weight
  iota: 0.1,    // -verifiedEvidenceCount — verified evidence subtracts from U (saturating)
  kappa: 5.0,   // repeatedFailurePenalty — per-event count of confidently-wrong predictions
  lambda: 50.0, // malformedForecastPenalty — out-of-range/non-finite forecast inputs fail CLOSED
  mu: 0.5,      // overconfidenceDrift — μ·conc(claimed)·W₁: penalizes a CONCENTRATED claim DRIFTED from evidence (restores the confidence dimension W₁ dropped). μ=0.25·β by design → a fully-confident error costs 25% more than an uncertain one (cost-ratio derived). MAGNITUDE-only (no verdict flip at threshold 0); defense-in-depth (the exploit it guards is structurally unreachable on the live ≤6-class feeder). Keep μ ≤ β if calibrated.
});

// Live enforcing path: any per-claim ladder inversion above this absolute level trips the L∞
// floor. gateProposal keeps Infinity as its API default for compatibility (red-team #5).
// cap=1 (owner decision D1, 2026-06-10): a single honest VERIFY-FIRST inversion is
// workflow per the gate's own calibration text (claim-cortex.mjs); ≥2 rungs is
// laundering and vetoes. Honest residual: a depth-1↔depth-1 content swap stays
// uncaught at the L∞ level until the v2 claim ledger supplies content hashes.
// NOTE: yuri-originator.mjs deliberately pins its own stricter cap=0 locally.
export const DEFAULT_MAX_LADDER_INVERSION_CAP = 1;

// Saturation cap for the verified-evidence credit (bounds U BELOW). The credit is
// -iota·log1p(min(count, CAP)): logarithmic AND capped, so it has a finite infimum
// (-iota·log1p(CAP)). Without this the credit was linear -> U unbounded below ->
// no infimum -> the "descent/Lyapunov" claim is vacuous and evidence buys an
// arbitrarily large masking budget.
const VERIFIED_EVIDENCE_CREDIT_CAP = 50;

function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  const supplied = weights || {};
  for (const key of Object.keys(supplied)) {
    if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) {
      throw new Error(`unknown yuri-energy weight: ${key}`);
    }
  }

  const normalized = { ...DEFAULT_WEIGHTS };
  for (const [key, value] of Object.entries({ ...DEFAULT_WEIGHTS, ...supplied })) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`weight ${key} must be finite`);
    if (numeric < 0) throw new Error(`weight ${key} must be non-negative`);
    normalized[key] = numeric;
  }
  return normalized;
}

function roundEnergy(value) {
  const rounded = Math.round(value * ENERGY_PRECISION) / ENERGY_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function readNonNegativeField(state, field, warnings) {
  if (!Object.hasOwn(state, field) || state[field] === null || state[field] === undefined || state[field] === '') {
    return 0;
  }

  const value = Number(state[field]);
  if (!Number.isFinite(value)) {
    warnings.push(`${field} ignored: expected finite non-negative number`);
    return 0;
  }
  if (value < 0) {
    warnings.push(`${field} clamped to 0: negative values cannot lower U`);
    return 0;
  }
  return value;
}

function serializeComponent(component) {
  if (component.skipped) {
    return {
      skipped: true,
      reason: component.reason,
      ...(component.warnings?.length ? { warnings: component.warnings } : {}),
    };
  }
  return {
    value: component.value,
    ...(component.warnings?.length ? { warnings: component.warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// Component evaluators — each one is safe against missing/empty state fields.
// Returns { value, skipped: false } on success or { skipped: true, reason } on
// missing data. The composition uses 0 contribution for skipped components,
// not NaN — this keeps U finite for partial state snapshots.
// ---------------------------------------------------------------------------

function evalEntropy(distribution) {
  if (!distribution) return { skipped: true, reason: 'no claimPromotionDistribution' };
  const values = Array.isArray(distribution) ? distribution : Object.values(distribution);
  if (values.length === 0) return { skipped: true, reason: 'empty distribution' };
  // FAIL-CLOSED on poisoned entries (GAP-2 / red-team F1, 2026-06-14): a non-finite or
  // negative count previously made kernel entropy throw → the α term skipped → contributed
  // 0 (silent fail-OPEN: a garbage distribution scored as clean). Now a poisoned entry is
  // treated as MAXIMUM entropy (ln N) — the conservative high-energy reading — so it RAISES
  // U instead of vanishing. Inert on clean input: every-finite-non-negative passes this guard
  // untouched and takes the unchanged all-zeros / entropy() path below (clean U byte-identical).
  // (Closes the documented-accepted α seam the original comment named; the live cortexSnapshot
  // feeder emits non-negative counts so the live verdict is unchanged.)
  if (values.some((v) => { const n = Number(v); return !Number.isFinite(n) || n < 0; })) {
    return {
      value: Math.log(values.length),
      skipped: false,
      warnings: ['poisoned claimPromotionDistribution (non-finite/negative entry) — treated as maximum entropy'],
    };
  }
  if (values.every((v) => v === 0)) return { value: 0, skipped: false };
  try {
    return { value: entropy(values), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `entropy failed: ${err.message}` };
  }
}

// Clamp distribution entries away from 0 (mirror of the logLoss epsilon clamp).
// Without this, a provable-lie verified=[0,1] makes klDivergence throw "infinite"
// -> evalKL returns skipped -> the term contributes 0 -> the gate ACCEPTS the
// worst case. Clamping yields a large but FINITE KL -> large positive ΔU -> reject.
const KL_EPSILON = 1e-12;
function clampDistribution(arr) {
  return arr.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > KL_EPSILON ? n : KL_EPSILON;
  });
}

// A distribution is POISONED when any entry is non-finite or negative, or when the
// whole vector carries no real mass (every entry ≤ KL_EPSILON, e.g. all-zero):
// clampDistribution would map those to 1e-12 vectors that kernel klDivergence
// normalizes to uniform → KL=0 → the β term silently launders the worst case.
function distributionPoisoned(arr) {
  let mass = false;
  for (const v of arr) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return true; // type/sign poison
    if (n > KL_EPSILON) mass = true;
  }
  return !mass; // zero-mass vector normalizes to uniform → KL launders to 0
}

function evalKL({ claimed, verified }) {
  if (!claimed || !verified) return { skipped: true, reason: 'no claimed/verified pair' };
  if (!Array.isArray(claimed) || !Array.isArray(verified)) {
    return { skipped: true, reason: 'claimed/verified must be arrays' };
  }
  if (claimed.length !== verified.length) {
    // Attack-finding fix: a length mismatch is itself a structurally invalid claim.
    // klDivergence throws on unequal length -> evalKL would skip -> the drift term
    // contributes 0 -> the gate ACCEPTS the worst case. Treat a mismatch as maximal
    // drift (large finite KL) so it REJECTS, symmetric to the zero-value clamp.
    return {
      value: Math.log(1 / KL_EPSILON),
      skipped: false,
      warnings: ['claimed/verified length mismatch — treated as maximal drift'],
    };
  }
  // Fail-CLOSED on poisoned inputs (deliberate deviation from kernel-throw: a throw
  // here would be caught → skipped → 0 contribution → fail-OPEN, the exact disease).
  // The same throw→skip→0 family exists in sibling evaluators (evalEntropy /
  // evalInfoGain / evalLogLoss / evalBrier) — this closes the β seam only; the live
  // feeders (cortexSnapshot) floor + normalize their distributions, so those seams
  // are reachable only by direct garbage-feeding callers (accepted risk, documented).
  if (distributionPoisoned(claimed) || distributionPoisoned(verified)) {
    return {
      value: Math.log(1 / KL_EPSILON),
      skipped: false,
      warnings: ['poisoned claimed/verified distribution (non-finite/negative/zero-mass entry) — treated as maximal drift'],
    };
  }
  try {
    // HIGH bug #3 fix: clamp BOTH sides so KL is finite + monotonic in drift.
    return { value: klDivergence(clampDistribution(claimed), clampDistribution(verified)), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `KL failed: ${err.message}` };
  }
}

// ── Wasserstein-1 (Earth-Mover) ordinal drift — the LIVE β/drift term (energyFormulaVersion 3) ──
// REPLACES evalKL. KL on concentrated beliefs SATURATED at the belief floor: a hard 1e-9 floor in
// the claim-cortex feeders made KL(claimed‖verified) hit ln(1e9)=20.72 for ANY rung mismatch
// (β·=41.45, 71% of the live reject corpus) and it was DISTANCE-BLIND — a 1-rung and a 5-rung
// mismatch cost the same. The ε=0.02 floor-soften (v2) only capped the ceiling at ~11; still flat.
// W₁ on a 1-D ORDINAL support is the L1 distance between CDFs: distance-aware (1-rung < 5-rung),
// bounded by N-1, multimodal-native, and needs NO floor (no log, no zero-in-denominator → the
// saturation that broke KL structurally cannot exist). For two one-hots at rungs i,j it equals |i-j|.
//   W₁(P,Q) = Σ_{k=0}^{N-2} | CDF_P(k) − CDF_Q(k) |     (rung units)
// evalKL + the klDivergence import are kept defined (NOT called by computeU) for legacy-record
// reconstruction and A/B; the live drift term is evalWasserstein.
function normalizeForW1(arr) {
  let s = 0;
  for (const v of arr) s += Number(v);
  if (!(s > 0)) return null; // zero-mass → caller forces the poison sentinel
  return arr.map((v) => Number(v) / s);
}
export function wasserstein1(p, q) {
  const n = p.length;
  let cp = 0;
  let cq = 0;
  let acc = 0;
  for (let k = 0; k < n - 1; k += 1) {
    cp += p[k];
    cq += q[k];
    acc += Math.abs(cp - cq);
  }
  return acc;
}

// The fail-CLOSED guard the un-saturatable W₁ term REQUIRES. KL could fail-closed by clamping to a
// huge finite value (ln(1/1e-12)=27.63); W₁ structurally cannot blow up, so a poisoned / all-zero /
// NaN / length-mismatched distribution would yield a MODEST W₁ → fail-OPEN (the exact disease the KL
// poison guard was built to stop). Fix: detect poison on the RAW signal and force the MAXIMAL
// legitimate W₁ = (support-1) so β·(N-1) ≈ 11 — identical to a oneHot(0)-vs-oneHot(top) worst case,
// NOT 27.63 (which would contaminate the calibration percentile scale as an out-of-band outlier).
// Garbage = maximal drift, indistinguishable from the worst real claim: correct fail-closed semantics.
export function evalWasserstein({ claimed, verified }) {
  if (!claimed || !verified) return { skipped: true, reason: 'no claimed/verified pair' };
  if (!Array.isArray(claimed) || !Array.isArray(verified)) {
    return { skipped: true, reason: 'claimed/verified must be arrays' };
  }
  const n = claimed.length;
  if (verified.length !== n || n < 2) {
    // length mismatch / degenerate support = structurally invalid claim → maximal drift over the
    // widest declared support (derive the span from the inputs; no ladder import → no circular dep).
    const span = Math.max(1, Math.max(claimed.length, verified.length) - 1);
    return {
      value: span,
      skipped: false,
      warnings: ['claimed/verified length mismatch or degenerate support — treated as maximal drift'],
    };
  }
  // Fail-CLOSED on poisoned inputs (non-finite/negative/zero-mass) BEFORE the divergence, on the RAW
  // signal — W₁ cannot self-saturate, so this is the only line standing between garbage and fail-open.
  if (distributionPoisoned(claimed) || distributionPoisoned(verified)) {
    return {
      value: n - 1,
      skipped: false,
      warnings: ['poisoned claimed/verified distribution (non-finite/negative/zero-mass) — treated as maximal drift'],
    };
  }
  const cn = normalizeForW1(claimed);
  const vn = normalizeForW1(verified);
  if (!cn || !vn) {
    // Belt-and-suspenders: UNREACHABLE by design (distributionPoisoned above already returns true for any
    // all-≤KL_EPSILON / zero-mass vector, so a survivor here has positive sum and normalizeForW1 cannot
    // return null). Kept fail-CLOSED so that if the poison detector is ever loosened, a zero-mass survivor
    // still forces the ceiling instead of crashing — never silently a small W₁.
    return {
      value: n - 1,
      skipped: false,
      warnings: ['zero-mass distribution — treated as maximal drift'],
    };
  }
  return { value: wasserstein1(cn, vn), skipped: false };
}

// ── Overconfidence-coupling term (the μ weight) — restores the confidence dimension W₁ dropped ──
// W₁ is distance-aware but CONFIDENCE-BLIND: it drops the dimension KL carried. This term penalizes the
// DANGEROUS QUADRANT — a CONCENTRATED claimed belief that is DRIFTED from evidence ("confident AND wrong" is
// worse than "uncertain AND wrong", because downstream actuators act decisively on concentrated beliefs).
//   conc(claimed) = 1 − H(claimed)/ln(N) ∈ [0,1]: 0 for a uniform/uncertain claim (NOT overconfident → no
//   penalty), 1 for a one-hot.   overconfidenceDrift = conc · W₁   →   μ·conc·W₁ in U.
// μ DEFAULT = 0.5 = 0.25·β: a fully-confident error costs 25% more than an uncertain one (cost-ratio derived,
// not tuned to a test). HONEST SCOPE (cross-family verify, 2026-06-14):
//   • MAGNITUDE-ONLY, not a verdict-flipper. At threshold 0, β·W₁>0 already rejects ANY drift, so zeroing μ
//     never flips a verdict — μ scales the ΔU MAGNITUDE (feeds the trace, salience/surprise encoding, and
//     flips only at threshold>0). It is a severity aggravator, NOT an independent decider; the ablation
//     measures it as an ENERGY-signal weight, not a decision-signal one.
//   • DEFENSE-IN-DEPTH, not a live-hole fix. The entropy-collapse-funded-drift exploit it guards is already
//     STRUCTURALLY UNREACHABLE on the live feeder (claimPromotionDistribution is keyed on the 6 ladder rungs
//     → ≤6 classes → max entropy credit α·ln(6)=1.79 < β·1.0=2.0, so β alone rejects). No finite μ eliminates
//     the exploit in general (entropy credit is unbounded in class-count); μ does not claim to.
//   • conc is a GLOBAL concentration (1−H/lnN), not error-localized: the μ-COMPONENT alone under-rates a
//     bimodal-far claim, but the TOTAL drift penalty still tracks danger because β·W₁ dominates and W₁
//     captures the larger transport of bimodal mass. An error-localized conc (mass outside an evidence band)
//     is a parked refinement. Cross-weight constraint for calibration: keep μ ≤ β (secondary ≤ primary).
// ADDITIVE, not a σ-gate on the entropy term: the calibration contract reconstructs each term linearly
// (basis = conc·W₁, recoverable as contribution/μ), which a multiplicative gate on entropy would break.
// A NEW additive component (not a drift-scale change) → it does NOT bump energyFormulaVersion: v3 records
// before/after the coupling stay drift-commensurable (W₁ unchanged); handled by reconstruction's absent-
// component path (same as a newer record carrying κ/λ).
export function claimedConcentration(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return 1;       // degenerate support → max concentration (fail-closed; also avoids 1−H/ln(1)=0/0)
  if (distributionPoisoned(arr)) return 1;                   // poison → max overconfidence (fail-closed)
  const norm = normalizeForW1(arr);
  if (!norm) return 1;
  let H = 0;
  for (const p of norm) if (p > 0) H -= p * Math.log(p);     // Shannon entropy (nats)
  const conc = 1 - H / Math.log(arr.length);                 // normalize by ln(N) → conc ∈ [0,1]
  return Math.min(1, Math.max(0, conc));
}

export function evalOverconfidenceDrift({ claimed, verified }) {
  const w = evalWasserstein({ claimed, verified });
  if (w.skipped) return { skipped: true, reason: w.reason }; // no belief pair → no overconfidence signal
  const conc = claimedConcentration(claimed);                // poison claimed → conc=1, w.value=n-1 → max penalty
  return { value: conc * w.value, skipped: false };
}

// Per-event repeated-failure penalty (HIGH bug #6). logLoss/brier are MEANS, so
// the 2nd..Nth confidently-wrong prediction adds ~0 to a saturated average and
// the gate stops penalizing repeated lies. This counts confidently-wrong events
// (high-confidence prediction on the wrong side) and penalizes per COUNT, so each
// additional failure raises U — breaking the windowed-mean plateau.
function evalRepeatedFailure(preds, outs) {
  if (!Array.isArray(preds) || !Array.isArray(outs)) {
    return { skipped: true, reason: 'no predictions/outcomes' };
  }
  if (preds.length === 0) return { value: 0, skipped: false };
  let count = 0;
  for (let i = 0; i < preds.length; i += 1) {
    const p = Number(preds[i]);
    const o = Number(outs[i]);
    if (!Number.isFinite(p) || !Number.isFinite(o)) continue; // malformed -> evalMalformedForecast
    // Bucket fractional/out-of-range outcomes to the nearest label (0.0001 -> 0,
    // 0.9999 -> 1) so a near-miss report cannot evade the count. Strict, symmetric
    // boundary: the uninformative midpoint p=0.5 is counted on NEITHER side.
    // NO confidence threshold: p=0.5001 counts as fully "confidently wrong" the
    // same as p=0.99 — documented, not tuned (the live tick path always emits
    // p=0.9, so the low-confidence band is dormant; a threshold knob is a future
    // wired-knob decision, not a silent change).
    const oLabel = o >= 0.5 ? 1 : 0;
    if ((p > 0.5 && oLabel === 0) || (p < 0.5 && oLabel === 1)) count += 1;
  }
  return { value: count, skipped: false };
}

// Fail-CLOSED guard on malformed forecast inputs (attack-finding fix). logLoss and
// brier throw -> skip -> contribute 0 on any prediction/outcome outside [0,1], and a
// skipped term lets the gate ACCEPT the worst case (verified: outcome=2 flipped a
// reject to accept). This counts every out-of-range / non-finite forecast entry and
// RAISES U at high weight, so an attacker-controlled invalid forecast vector cannot
// drive ΔU to 0 and slip a transition through gateProposal.
function isValidProbability(x) {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
function countMalformed(arr) {
  if (!Array.isArray(arr)) return 0;
  let c = 0;
  for (const x of arr) if (!isValidProbability(x)) c += 1;
  return c;
}
function evalMalformedForecast(state) {
  let count = countMalformed(state.predictions) + countMalformed(state.outcomes)
    + countMalformed(state.forecasts) + countMalformed(state.results);
  // Length-mismatch fail-CLOSED (attack-finding): logLoss/brier THROW on unequal
  // length -> evalLogLoss/evalBrier skip -> contribute 0 -> the gate ACCEPTS the worst
  // case (a calibration penalty silently vanishes). evalKL already hardened its own
  // mismatch; the forecast pairs must too. Count each mismatched pair so lambda (the
  // high malformed-forecast weight) raises U and the transition cannot slip through.
  if (Array.isArray(state.predictions) && Array.isArray(state.outcomes)
      && state.predictions.length !== state.outcomes.length) count += 1;
  if (Array.isArray(state.forecasts) && Array.isArray(state.results)
      && state.forecasts.length !== state.results.length) count += 1;
  if (count === 0) return { skipped: true, reason: 'no malformed forecast inputs' };
  return { value: count, skipped: false };
}

function evalLogLoss(preds, outs) {
  if (!preds || !outs) return { skipped: true, reason: 'no predictions/outcomes' };
  if (preds.length === 0) return { value: 0, skipped: false };
  try {
    return { value: logLoss(preds, outs), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `logLoss failed: ${err.message}` };
  }
}

function evalBrier(preds, outs) {
  if (!preds || !outs) return { skipped: true, reason: 'no forecasts/results' };
  if (preds.length === 0) return { value: 0, skipped: false };
  try {
    return { value: brierScore(preds, outs), skipped: false };
  } catch (err) {
    return { skipped: true, reason: `brier failed: ${err.message}` };
  }
}

// Divisive normalization of the info-gain credit (info-gain buy-back fix, part a).
//
// informationGain = entropy(prior) - entropy(posterior), in nats (math-kernel base=e).
// Its UPPER BOUND is the information-theoretic ceiling of the prior support:
// H(prior) ≤ log(n) for an n-outcome distribution. The pre-fix credit was
// -epsilon·gain in RAW nats, so an attacker who fabricates a large-n prior
// (e.g. a 200k-element uniform that "collapses") manufactures gain ≈ ln(200000)
// ≈ 12.2 nats of credit — unbounded below as n grows — and buys back a real
// structural defect (promotionLadderInversions·theta = 10). Raw Shannon-info is
// NOT real surprise: a giant flat distribution is max-entropy/min-belief-shift
// (NEU-SAL-09 white-snow guardrail; corpus _SYSTEM/knowledge/neuroscience-corpus.md).
//
// Fix: divide gain by its own ceiling log(n) so the credit is in normalized [0,1]
// units REGARDLESS of n — the same divisive-normalization / adaptive-coding the
// midbrain applies to reward-prediction-error firing (bounded rates, context-
// relative gain; PNAS 10.1073/pnas.1119969109) and the multiplicative homeostatic
// synaptic scaling that renormalizes gain while preserving the relative pattern
// (NEU-PLAS-06). n=3 collapse and n=200000 collapse now both normalize to 1.0;
// a realistic partial update (e.g. [.25×4]→[.7,.1,.1,.1]) normalizes to ~0.32.
// Legitimate learning keeps proportional credit; fabricated state-space inflation
// gains nothing. The ceiling uses the prior's support size (the # of entries the
// proposer declared), so inflating n cannot raise the ceiling-normalized credit.
function infoGainCeiling(prior) {
  // Support size = number of declared outcomes. log(n) is the max possible entropy
  // (and thus max possible gain, since posterior entropy ≥ 0). n ≤ 1 -> ceiling 0.
  const values = Array.isArray(prior) ? prior : Object.values(prior ?? {});
  const n = values.length;
  if (n <= 1) return 0;
  return Math.log(n);
}

function evalInfoGain({ prior, posterior }) {
  if (!prior || !posterior) return { skipped: true, reason: 'no prior/posterior' };
  // FAIL-CLOSED on poisoned prior/posterior (GAP-2 / red-team F4, 2026-06-14): infoGain is a
  // CREDIT term (−ε·value subtracts from U). A poisoned distribution that did NOT happen to make
  // kernel entropy throw could yield a garbage rawGain → an UNEARNED credit that lowers U. Suppress
  // the credit explicitly (value 0) on any non-finite/negative/zero-mass input. Inert on clean
  // input (distributionPoisoned is false for a positive-mass distribution → unchanged path below).
  const priorArr = Array.isArray(prior) ? prior : Object.values(prior ?? {});
  const posteriorArr = Array.isArray(posterior) ? posterior : Object.values(posterior ?? {});
  if (distributionPoisoned(priorArr) || distributionPoisoned(posteriorArr)) {
    return {
      value: 0,
      skipped: false,
      warnings: ['poisoned prior/posterior (non-finite/negative/zero-mass) — info-gain credit suppressed'],
    };
  }
  try {
    const rawGain = informationGain(prior, posterior);
    const ceiling = infoGainCeiling(prior);
    // Degenerate single-outcome prior (ceiling 0) carries no information and earns
    // no credit. Clamp the normalized credit to [0,1]: rawGain cannot exceed the
    // ceiling analytically, but rounding/coercion must not push it past 1.0 and
    // re-open the buy-back. Negative gain (posterior LESS certain than prior — a
    // belief that got muddier) yields a clamped 0: muddying is not a learning credit.
    // roundEnergy collapses the tiny float gap left by rounding numerator and
    // denominator independently (e.g. n=200000 -> 0.9999999999987814 -> 1) so the
    // normalized credit is stable and the [0,1] clamp is exact.
    const normalized = ceiling > 0 ? Math.max(0, Math.min(1, roundEnergy(rawGain / ceiling))) : 0;
    return {
      value: normalized,
      skipped: false,
      ...(ceiling > 0 ? {} : { warnings: ['degenerate prior (support ≤ 1): info-gain credit suppressed'] }),
    };
  } catch (err) {
    return { skipped: true, reason: `infoGain failed: ${err.message}` };
  }
}

function evalStaleness(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { skipped: true, reason: 'no evidence array' };
  }
  let total = 0;
  const warnings = [];
  for (const [index, item] of evidence.entries()) {
    try {
      const decayed = confidenceDecay(item);
      total += Math.max(0, item.base - decayed);
    } catch (err) {
      warnings.push(`evidence[${index}] skipped: ${err.message}`);
    }
  }
  if (warnings.length === evidence.length) {
    // FAIL-CLOSED (GAP-2 / red-team F5, 2026-06-14): a PRESENT evidence array whose items are ALL
    // malformed previously skipped → contributed 0 staleness (silent fail-OPEN: unverifiable freshness
    // scored as perfectly fresh). Treat each phantom item as maximally stale (1 unit) so it RAISES U.
    // Bounded + count-based (mirrors the λ/repeatedFailure counting pattern), not an out-of-band ceiling.
    // Inert on clean input: any valid item keeps warnings.length < evidence.length → normal sum path below.
    return {
      value: evidence.length,
      skipped: false,
      warnings: [...warnings, 'all evidence items malformed — treated as maximally stale'],
    };
  }
  return { value: roundEnergy(total), skipped: false, warnings };
}

// ---------------------------------------------------------------------------
// evalStalenessShadow — ENG-01 ADVISORY-ONLY Cox per-class evidence aging.
//
// COMPUTED, NOT WIRED. This reproduces evalStaleness but scales each record's
// effective halfLife by a per-class hazard multiplier (catalog card 18):
//   effectiveHalfLife = halfLife / hazardMultiplier(sourceClass)
// A runtime_trace (0.3) ages SLOW (longer effective halfLife → less staleness);
// council-text advisory/report (3.0) ages FAST (shorter halfLife → more staleness).
//
// This is emitted to the trace as a SHADOW metric for the energy-landscape study.
// computeU does NOT consume it: the live `staleness` contribution still calls the
// flat evalStaleness above, so the live verdict is byte-identical. Live wiring is
// owner-gated Wave-3.
//
// A record with multiplier 1.0 and a real age MUST reproduce the flat
// confidenceDecay to the digit (the regression canary, asserted in tests).
export function evalStalenessShadow(evidence, opts = {}) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { skipped: true, reason: 'no evidence array' };
  }
  const baseHalfLife = Number.isFinite(opts.baseHalfLife)
    ? opts.baseHalfLife
    : SHADOW_BASE_HALF_LIFE_DAYS;
  let total = 0;
  const warnings = [];
  const perClass = {};
  for (const [index, item] of evidence.entries()) {
    try {
      const it = (item && typeof item === 'object') ? item : {};
      const sourceClass = typeof it.sourceClass === 'string' ? it.sourceClass : 'unknown';
      const multiplier = hazardMultiplier(sourceClass);
      // A present per-record halfLife wins; otherwise the shadow baseline. The
      // multiplier shortens the effective halfLife for fast-aging classes.
      const halfLife = (Number.isFinite(it.halfLife) ? it.halfLife : baseHalfLife) / multiplier;
      const base = Number.isFinite(it.base) ? it.base : 1.0;
      const age = Number.isFinite(it.age) ? it.age : 0;
      const decayed = confidenceDecay({ base, age, halfLife });
      const contribution = Math.max(0, base - decayed);
      total += contribution;
      perClass[sourceClass] = roundEnergy((perClass[sourceClass] ?? 0) + contribution);
    } catch (err) {
      warnings.push(`evidence[${index}] skipped: ${err.message}`);
    }
  }
  if (warnings.length === evidence.length) {
    return { skipped: true, reason: 'all evidence items malformed', warnings };
  }
  return { value: roundEnergy(total), skipped: false, perClass, warnings };
}

// ---------------------------------------------------------------------------
// computeU — scalar potential over a YURI control-plane state snapshot.
// ---------------------------------------------------------------------------

export function computeU(state = {}, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const validationWarnings = [];

  const components = {
    entropy: evalEntropy(state.claimPromotionDistribution),
    // β/drift term, energyFormulaVersion 3: Wasserstein-1 (distance-aware ordinal drift). Replaces
    // the saturated/distance-blind klDivergence term; both bind to w.beta. Legacy records carry a
    // `klDivergence` contribution; v3 records carry `wasserstein` — calibration partitions by era.
    wasserstein: evalWasserstein({
      claimed: state.claimedDistribution,
      verified: state.verifiedDistribution,
    }),
    // Confidence-coupling (μ): penalizes a CONCENTRATED claimed belief that is DRIFTED from evidence —
    // closes the W₁ confidence-blind residual. Reads the SAME feeders as the drift term; additive.
    overconfidenceDrift: evalOverconfidenceDrift({
      claimed: state.claimedDistribution,
      verified: state.verifiedDistribution,
    }),
    logLoss: evalLogLoss(state.predictions, state.outcomes),
    brier: evalBrier(state.forecasts, state.results),
    repeatedFailure: evalRepeatedFailure(state.predictions, state.outcomes),
    malformedForecast: evalMalformedForecast(state),
    informationGain: evalInfoGain({
      prior: state.priorState,
      posterior: state.posteriorState,
    }),
    staleness: evalStaleness(state.evidence),
  };

  const contributions = {};
  let U = 0;

  if (!components.entropy.skipped) {
    contributions.entropy = w.alpha * components.entropy.value;
    U += contributions.entropy;
  }
  if (!components.wasserstein.skipped) {
    contributions.wasserstein = w.beta * components.wasserstein.value;
    U += contributions.wasserstein;
  }
  if (!components.overconfidenceDrift.skipped) {
    contributions.overconfidenceDrift = w.mu * components.overconfidenceDrift.value;
    U += contributions.overconfidenceDrift;
  }
  if (!components.logLoss.skipped) {
    contributions.logLoss = w.gamma * components.logLoss.value;
    U += contributions.logLoss;
  }
  if (!components.brier.skipped) {
    contributions.brier = w.delta * components.brier.value;
    U += contributions.brier;
  }
  if (!components.repeatedFailure.skipped) {
    contributions.repeatedFailure = roundEnergy(w.kappa * components.repeatedFailure.value);
    U += contributions.repeatedFailure;
  }
  if (!components.malformedForecast.skipped) {
    contributions.malformedForecast = roundEnergy(w.lambda * components.malformedForecast.value);
    U += contributions.malformedForecast;
  }
  if (!components.informationGain.skipped) {
    // roundEnergy normalizes -0 -> 0 and stabilizes the float (the credit is already
    // divisively normalized to [0,1] in evalInfoGain).
    contributions.informationGain = roundEnergy(-w.epsilon * components.informationGain.value);
    U += contributions.informationGain;
  }
  if (!components.staleness.skipped) {
    contributions.staleness = w.zeta * components.staleness.value;
    U += contributions.staleness;
  }

  const protectedPathViolations = readNonNegativeField(state, 'protectedPathViolations', validationWarnings);
  const promotionLadderInversions = readNonNegativeField(state, 'promotionLadderInversions', validationWarnings);
  const verifiedEvidenceCount = readNonNegativeField(state, 'verifiedEvidenceCount', validationWarnings);

  contributions.protectedPathViolations = roundEnergy(w.eta * protectedPathViolations);
  contributions.promotionLadderInversions = roundEnergy(w.theta * promotionLadderInversions);
  const cappedEvidence = Math.min(verifiedEvidenceCount, VERIFIED_EVIDENCE_CREDIT_CAP);
  contributions.verifiedEvidenceCredit = roundEnergy(-w.iota * Math.log1p(cappedEvidence));

  U += contributions.protectedPathViolations;
  U += contributions.promotionLadderInversions;
  U += contributions.verifiedEvidenceCredit;

  const value = roundEnergy(U);

  return makeMathResult({
    operation: 'yuri-energy.computeU',
    input: { state, weights: w },
    result: {
      U: value,
      components: Object.fromEntries(
        Object.entries(components).map(([k, v]) => [k, serializeComponent(v)]),
      ),
      contributions,
      validationWarnings,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      weights: w,
      note: 'Hand-tuned weights; not learned. See methodology paper §5 (Honest Limitations).',
    },
  });
}

// ---------------------------------------------------------------------------
// computeDeltaU — gradient between two states.
// ---------------------------------------------------------------------------

export function computeDeltaU(stateBefore, stateAfter, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const before = computeU(stateBefore, w);
  const after = computeU(stateAfter, w);
  const deltaU = roundEnergy(after.result.U - before.result.U);

  const componentDeltas = {};
  const keys = new Set([
    ...Object.keys(before.result.contributions),
    ...Object.keys(after.result.contributions),
  ]);
  for (const key of keys) {
    const b = before.result.contributions[key] ?? 0;
    const a = after.result.contributions[key] ?? 0;
    componentDeltas[key] = roundEnergy(a - b);
  }

  return makeMathResult({
    operation: 'yuri-energy.computeDeltaU',
    input: { stateBefore, stateAfter, weights: w },
    result: {
      deltaU,
      uBefore: before.result.U,
      uAfter: after.result.U,
      componentDeltas,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      lyapunovProperty: deltaU <= 0 ? 'descending' : 'ascending',
    },
  });
}

// ---------------------------------------------------------------------------
// gateProposal — Lyapunov gate on a proposed state transition.
// ---------------------------------------------------------------------------

export function gateProposal({
  stateBefore,
  stateAfter,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
  maxLadderInversionCap = Infinity,
  conformalCalibration = null,
  corrSources = {},
} = {}) {
  if (!stateBefore || !stateAfter || Array.isArray(stateBefore) || Array.isArray(stateAfter)) {
    throw new Error('gateProposal requires stateBefore and stateAfter');
  }
  const normalizedThreshold = Number(threshold);
  if (!Number.isFinite(normalizedThreshold)) {
    throw new Error('gateProposal threshold must be finite');
  }
  // L∞ max-severity floor cap. Default Infinity = DISABLED (backward-compatible: no
  // existing caller is affected and the malformed-field guard below stays inert). A
  // finite cap ARMS an absolute-level veto on the single deepest ladder inversion.
  const capArmed = maxLadderInversionCap !== Infinity;
  if (capArmed && (!Number.isFinite(Number(maxLadderInversionCap)) || Number(maxLadderInversionCap) < 0)) {
    throw new Error('gateProposal maxLadderInversionCap must be Infinity or a finite non-negative number');
  }
  const cap = capArmed ? Number(maxLadderInversionCap) : Infinity;
  const w = normalizeWeights(weights);
  const delta = computeDeltaU(stateBefore, stateAfter, w);
  const deltaU = delta.result.deltaU;
  const passesThreshold = deltaU <= normalizedThreshold;
  // KNOWN EDGE (documented, unreachable-from-live): allowOverride=true with a
  // NaN ΔU accepts (NaN <= t is false → passesThreshold false → override arm).
  // The live tick path never sets allowOverride and its +1 increments cannot
  // produce a NaN ΔU; the render side maps non-finite to null (dash-round9-8e).
  const overrideAllowed = allowOverride === true;

  // ── Conformal-calibrated pReject (DISARMED: YURI_CONFORMAL_GATE env flag) ──
  // When the env flag is set AND a conformalCalibration object with a pReject
  // function is provided, compute a calibrated rejection probability from |deltaU|.
  // The pReject is surfaced in the result but does NOT change the accept/reject
  // decision — it is advisory-only for the caller. When the flag is OFF or no
  // calibration is provided, the gate is byte-identical to the unmodified path.
  let conformalPReject = null;
  const conformalGateArmed = process.env.YURI_CONFORMAL_GATE === '1';
  if (conformalGateArmed && conformalCalibration && typeof conformalCalibration.pReject === 'function') {
    try {
      const raw = conformalCalibration.pReject(deltaU);
      conformalPReject = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : null;
    } catch {
      conformalPReject = null; // fail-open: calibration error does not crash the gate
    }
  }

  // HARD VETO (HIGH bug #4): a protected-path violation INCREASE is catastrophic
  // and NON-offsettable — no evidence credit (masking) and no override may accept
  // it. This now lives in the LIVE gate, not just the simulator. A masking attack
  // (huge verifiedEvidenceCount pushing ΔU back under threshold) cannot pass here.
  const vetoWarnings = [];
  const protectedBefore = readNonNegativeField(stateBefore, 'protectedPathViolations', vetoWarnings);
  const protectedAfter = readNonNegativeField(stateAfter, 'protectedPathViolations', vetoWarnings);
  // Fail-CLOSED on a malformed protected-path field (attack-finding): readNonNegativeField
  // coerces NaN / a non-numeric string / an object to 0, so a stateAfter reporting
  // protectedPathViolations as garbage would slip past `after > before` and DEFEAT the
  // non-offsettable veto by changing the field's TYPE instead of its magnitude. Treat a
  // PRESENT-but-unparseable value as "cannot prove no increase" -> veto.
  const rawAfter = stateAfter.protectedPathViolations;
  // A4 (red-team, 2026-06-14): a PRESENT-but-NEGATIVE count is as invalid as a non-numeric one —
  // readNonNegativeField silently clamps it to 0, so `5 → -5` read as a repair and slipped the veto
  // (verified). Fail-CLOSED on negative too, same "cannot prove no increase" logic. Inert on the live
  // path (cortexSnapshot counters are non-negative integers → Number(raw) < 0 is never true).
  const afterMalformed = rawAfter !== undefined && rawAfter !== null && rawAfter !== ''
    && (!Number.isFinite(Number(rawAfter)) || Number(rawAfter) < 0);
  const protectedPathVeto = afterMalformed || (protectedAfter > protectedBefore);

  // STRUCTURAL FLOOR (info-gain buy-back fix, part b): a promotion-ladder inversion
  // INCREASE is a real structural defect whose theta-weighted penalty must SURVIVE
  // into the accept decision — it is NON-offsettable by the summed SOFT credits
  // (normalized info-gain credit + verified-evidence credit), exactly as the
  // protected-path veto is non-offsettable by evidence inflation.
  //
  // This is defense-in-depth on top of part (a): part (a) caps the info-gain credit
  // at epsilon·1.0 so a single inflated state space cannot fund the buy-back; part
  // (b) guarantees that even if MANY soft credits summed past the penalty under some
  // future weighting, a genuine structural-defect increase still cannot be masked.
  // Mirrors the brain's hard, non-negotiable error signals: homeostatic/credit
  // mechanisms renormalize gain but do not erase a structural fault.
  //
  // Lyapunov preservation: the floor only ever RESTRICTS acceptance (turns an accept
  // into a reject when a structural penalty is positive). It never accepts a
  // transition the ΔU≤threshold rule would have rejected, so it cannot create an
  // ascending accept — the descent guarantee on accepted transitions is unchanged
  // for every state where the floor does not fire, and strengthened where it does.
  //
  // The floor keys on the ladder term's OWN delta, NOT a summed structural delta.
  // Adversarial finding: summing structural terms let a protected-path REPAIR
  // (-eta, e.g. 1→0 = -100) drag the summed structural delta negative while a NEW
  // ladder inversion (+theta = +10) rode along — a repair on one axis masking a
  // defect on another. Each structural defect must be individually non-offsettable,
  // so the test is the ladder term's isolated theta-weighted increase.
  const ladderBefore = readNonNegativeField(stateBefore, 'promotionLadderInversions', vetoWarnings);
  const ladderAfter = readNonNegativeField(stateAfter, 'promotionLadderInversions', vetoWarnings);
  const ladderPenaltyDelta = delta.result.componentDeltas.promotionLadderInversions ?? 0;
  const rawLadderAfter = stateAfter.promotionLadderInversions;
  // A4: present-but-negative is invalid too (clamped to 0 → slips the floor). Fail-CLOSED. Inert on live.
  const ladderAfterMalformed = rawLadderAfter !== undefined && rawLadderAfter !== null && rawLadderAfter !== ''
    && (!Number.isFinite(Number(rawLadderAfter)) || Number(rawLadderAfter) < 0);
  // Fire the floor when a ladder inversion was introduced (its own theta-weighted
  // penalty delta exceeds threshold AND the raw count rose) OR the ladder field is
  // present-but-unparseable (fail-CLOSED, same as the protected-path type-confusion
  // guard). The protected-path case keeps its own hard veto; this is the ladder term.
  //
  // Red-team #1: the structural floor keys on the RAW ladder-count increase, NOT the
  // theta-weighted delta vs threshold — otherwise a config theta=0 or a raised threshold
  // silently forges the floor open. A structural inversion is non-offsettable like the
  // protected-path veto; the soft `threshold` budget does not apply to it. (ladderPenaltyDelta
  // is still surfaced in the reason string below.)
  const structuralFloorVeto = !protectedPathVeto
    && (ladderAfterMalformed || (ladderAfter > ladderBefore));

  // L∞ MAX-SEVERITY FLOOR — delta-gate severity-laundering closure.
  // The structural floor above keys on the ladder term's *delta*. A DELTA gate — on
  // the sum, the convex sum, OR the L∞ max — is CONSERVED under an equal-magnitude
  // swap: resolve one depth-5 over-claim honestly while smuggling in a fresh depth-5
  // fabrication and max 5→5, convex-sum 25→25, so a delta gate is blind (the round-2
  // C-residual: equal-magnitude swaps, Pythagorean 3²+4²=5² partitions). The term that
  // catches it is an ABSOLUTE-LEVEL floor on the deepest per-claim inversion AFTER the
  // transition: the after-state still CONTAINS a depth-5 inversion, and no amount of
  // resolving OTHER claims lowers that max — so the veto is genuinely non-offsettable.
  // Fail-CLOSED on a present-but-unparseable field (type-confusion guard, mirroring the
  // protected-path veto). Only evaluated when a finite cap is armed (default Infinity =
  // disabled), so every existing caller is unaffected. Lyapunov: like the other vetoes
  // it only ever RESTRICTS acceptance — it never accepts a transition ΔU≤threshold rejects.
  let maxLadderAfter = 0;
  let maxLadderAfterMalformed = false;
  let maxSeverityVeto = false;
  if (capArmed) {
    maxLadderAfter = readNonNegativeField(stateAfter, 'maxLadderInversion', vetoWarnings);
    const rawMaxAfter = stateAfter.maxLadderInversion;
    // A4: present-but-negative is invalid too (clamped to 0 → slips the L∞ floor). Fail-CLOSED. Inert on live.
    maxLadderAfterMalformed = rawMaxAfter !== undefined && rawMaxAfter !== null && rawMaxAfter !== ''
      && (!Number.isFinite(Number(rawMaxAfter)) || Number(rawMaxAfter) < 0);
    maxSeverityVeto = maxLadderAfterMalformed || (maxLadderAfter > cap);
  }

  const accept = (protectedPathVeto || structuralFloorVeto || maxSeverityVeto)
    ? false
    : (passesThreshold || overrideAllowed);

  const reason = protectedPathVeto
    ? (afterMalformed
        ? `protected-path field malformed in stateAfter (${JSON.stringify(rawAfter)}) — HARD VETO, fail-closed`
        : `protected-path violation increase (${protectedBefore}→${protectedAfter}) — HARD VETO, non-offsettable (ΔU and override ignored)`)
    : structuralFloorVeto
      ? (ladderAfterMalformed
          ? `promotion-ladder field malformed in stateAfter (${JSON.stringify(rawLadderAfter)}) — STRUCTURAL FLOOR, fail-closed`
          : `promotion-ladder inversion increase (${ladderBefore}→${ladderAfter}; ladderΔ=${roundEnergy(ladderPenaltyDelta)}) — STRUCTURAL FLOOR, non-offsettable by soft credit (info-gain/evidence cannot buy it back)`)
      : maxSeverityVeto
        ? (maxLadderAfterMalformed
            ? `max-ladder-inversion field malformed in stateAfter (${JSON.stringify(stateAfter.maxLadderInversion)}) — L∞ MAX-SEVERITY FLOOR, fail-closed`
            : `max per-claim ladder inversion depth ${maxLadderAfter} > cap ${cap} — L∞ MAX-SEVERITY FLOOR, absolute level (non-offsettable, closes equal-magnitude swap)`)
      : passesThreshold
        ? `ΔU=${deltaU} ≤ threshold=${normalizedThreshold} (descending or held)`
        : overrideAllowed
          ? `ΔU=${deltaU} > threshold=${normalizedThreshold} but override allowed`
          : `ΔU=${deltaU} > threshold=${normalizedThreshold} (ascending — energy raised, reject)`;

  let dominantTerm = null;
  if (deltaU > normalizedThreshold) {
    const positive = Object.entries(delta.result.componentDeltas)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    dominantTerm = positive[0]?.[0] ?? null;
  }

  // B4 GROUND-TRUTH SEAM (substrate-frontier-grade, 2026-06-14): record this verdict to
  // the resolved-outcome log. OPT-IN (YURI_GATE_TRACE) + FAIL-OPEN: a no-op when disabled
  // and never throws, so the return below is byte-identical whether or not tracing is on.
  // The fire-time normalized weights `w` are passed so the weight fingerprint binds to the
  // exact config used here (drift-defense for the later resolution). Placed AFTER the
  // verdict is fully computed and BEFORE the return — it reads the decision, never alters it.
  maybeTraceGateVerdict({
    stateBefore, stateAfter, weights: w, threshold: normalizedThreshold, cap,
    allowOverride, accept, reason, deltaU,
    ...corrSources,
  });

  return makeMathResult({
    operation: 'yuri-energy.gateProposal',
    input: { stateBefore, stateAfter, weights: w, threshold: normalizedThreshold, allowOverride },
    result: {
      accept,
      reason,
      deltaU,
      threshold: normalizedThreshold,
      override: !protectedPathVeto && !structuralFloorVeto && !maxSeverityVeto && !passesThreshold && overrideAllowed,
      protectedPathVeto,
      structuralFloorVeto,
      maxSeverityVeto,
      dominantTerm: protectedPathVeto
        ? 'protectedPathViolations'
        : structuralFloorVeto
          ? 'promotionLadderInversions'
          : maxSeverityVeto
            ? 'maxLadderInversion'
            : dominantTerm,
      componentDeltas: delta.result.componentDeltas,
      conformalPReject,
    },
    proof: {
      advisory_only: true,
      local_truth_claim: false,
      // Keyed on the SIGN of ΔU (matching computeDeltaU): the accept decision is
      // policy, the Lyapunov label is physics — they must not share a key. An
      // accepted-under-positive-threshold transition with ΔU>0 is ascending.
      lyapunovProperty: deltaU <= 0 ? 'descending' : 'ascending',
    },
  });
}

// ---------------------------------------------------------------------------
// CLI worked example — runs two demo scenarios when invoked directly.
// ---------------------------------------------------------------------------

function workedExample() {
  // Scenario A — descending transition: a new claim gets verified, KL drift drops.
  const stateA_before = {
    claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3, runtime_tested: 1 },
    claimedDistribution: [0.5, 0.3, 0.2],
    verifiedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 12,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
  const stateA_after = {
    claimPromotionDistribution: { draft: 4, research: 8, fixture_ready: 4, runtime_tested: 1 },
    claimedDistribution: [0.4, 0.3, 0.3],
    verifiedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 13,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };

  const gateA = gateProposal({ stateBefore: stateA_before, stateAfter: stateA_after });

  // Scenario B — ascending transition: a protected-path violation is introduced.
  const stateB_before = {
    claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
    verifiedEvidenceCount: 20,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
  const stateB_after = {
    claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
    verifiedEvidenceCount: 20,
    protectedPathViolations: 1,
    promotionLadderInversions: 0,
  };

  const gateB = gateProposal({ stateBefore: stateB_before, stateAfter: stateB_after });

  return {
    scenarioA_descent: {
      accept: gateA.result.accept,
      deltaU: gateA.result.deltaU,
      reason: gateA.result.reason,
      componentDeltas: gateA.result.componentDeltas,
    },
    scenarioB_ascent_protected_path: {
      accept: gateB.result.accept,
      deltaU: gateB.result.deltaU,
      reason: gateB.result.reason,
      dominantTerm: gateB.result.dominantTerm,
      componentDeltas: gateB.result.componentDeltas,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worked-example' || argv.length === 0) {
    console.log(JSON.stringify(workedExample(), null, 2));
  } else if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(
      [
        'YURI Energy Function — Lyapunov-gated promotion potential',
        '',
        'Usage:',
        '  node _SYSTEM/Scripts/math/yuri-energy.mjs --worked-example',
        '',
        'Programmatic:',
        '  import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS }',
        '    from "_SYSTEM/Scripts/math/yuri-energy.mjs";',
      ].join('\n'),
    );
  } else {
    console.error(`unknown argument: ${argv[0]}`);
    process.exit(2);
  }
}
