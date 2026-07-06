// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Design-by-Contract runtime assertion layer for computeU results
//                + weight inputs. Candidate I of the substrate-frontier-grade
//                mission (T1/T6). Peer-built by Mimo, Claude-verified.
//   target:      NEW file only. Reads a computeU result object; no gate behavior.
//   constraints: pure, dependency-free; NEVER throws unless {assert:true};
//                observe-mode; reversible by deletion.
//   acceptance:  C1–C6 postconditions + W-* preconditions each have a passing
//                AND a deliberately-violating test (non-vacuous).
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-contracts.test.mjs
//   rollback:    rm this file + its .test.mjs.
// ===========================================================================
//
// @capability: energy-contract-checker
// @serves: design-by-contract runtime checks for computeU | verify a gate result obeys its postconditions | precondition check on energy weights | fail-fast assertion on a scoring result
// @does: checks 6 computeU postconditions (finite U, sum==U, U-floor, known-keys, credit-signs, barrier-dominance) returning {ok,violations[]} without throwing (opt-in {assert:true} throws), plus a weight precondition checker mirroring computeU's fail-closed non-negative rule
// @use: wrap a computeU call site (or a test) to assert the result obeys the gate's contract on every input — turns implicit invariants into explicit, greppable contract violations
// @exports: checkComputeUResult, checkWeights, KNOWN_CONTRIBUTION_KEYS, CREDIT_KEYS, BARRIER_KEY, U_FLOOR, SUM_TOL
//
// Frontier transfer: Eiffel/contracts-typescript Design-by-Contract → the YURI
// scoring function. Pairs with yuri-energy-invariants.mjs (PBT proves the
// invariants ∀-inputs; this checks a SINGLE result obeys them, cheap + inline).

// ─── Known domain constants ────────────────────────────────────────────

/** The 12 canonical contribution keys emitted by computeU. */
const KNOWN_CONTRIBUTION_KEYS = new Set([
  'entropy', 'wasserstein', 'logLoss', 'brier', 'informationGain', 'staleness',
  'protectedPathViolations', 'promotionLadderInversions', 'verifiedEvidenceCredit',
  'repeatedFailure', 'malformedForecast', 'overconfidenceDrift',
]);

/** Contribution keys allowed to carry negative values (credit terms). */
const CREDIT_KEYS = new Set(['informationGain', 'verifiedEvidenceCredit']);

/** The barrier contribution key whose presence forces U > 0. */
const BARRIER_KEY = 'protectedPathViolations';

/** Theoretical lower bound on U: −(1 + 0.1·ln(51)) ≈ −1.3932; −1.4 adds margin. */
const U_FLOOR = -1.4;

/** Tolerance for C2 (sum ≈ U). */
const SUM_TOL = 1e-6;

// ─── Postcondition checker (C1–C6) ─────────────────────────────────────

/**
 * Validate a computeU return value against contracts C1–C6. Accepts the full
 * envelope `{ result: { U, contributions } }` OR the inner object directly.
 * Returns { ok, violations:[{contract,detail}] }. Throws ONLY with {assert:true}.
 */
function checkComputeUResult(result, opts = {}) {
  const violations = [];

  const inner = result != null && 'result' in result ? result.result : result;
  const U = inner != null ? inner.U : undefined;
  const contributions = inner != null ? inner.contributions : undefined;

  // C1: U is finite
  if (typeof U !== 'number' || !Number.isFinite(U)) {
    violations.push({ contract: 'C1', detail: `U is not a finite number (got ${String(U)})` });
  }

  const uIsFinite = typeof U === 'number' && Number.isFinite(U);
  const contribsIsObj = contributions != null && typeof contributions === 'object';

  // C2: sum(contributions) ≈ U
  if (contribsIsObj && uIsFinite) {
    const sum = Object.values(contributions).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    const delta = Math.abs(sum - U);
    if (delta > SUM_TOL) {
      violations.push({ contract: 'C2', detail: `sum(contributions)=${sum} differs from U=${U} by ${delta}` });
    }
  }

  // C3: U ≥ −1.4 (credit floor)
  if (uIsFinite && U < U_FLOOR) {
    violations.push({ contract: 'C3', detail: `U=${U} < floor ${U_FLOOR}` });
  }

  // C4: every contribution key ∈ known-12 set
  if (contribsIsObj) {
    for (const key of Object.keys(contributions)) {
      if (!KNOWN_CONTRIBUTION_KEYS.has(key)) {
        violations.push({ contract: 'C4', detail: `unknown contribution key: "${key}"` });
      }
    }
  }

  // C5: credit keys ≤ 0; all other present keys ≥ 0
  if (contribsIsObj) {
    for (const [key, val] of Object.entries(contributions)) {
      if (typeof val !== 'number') continue;
      if (CREDIT_KEYS.has(key)) {
        if (val > 0) violations.push({ contract: 'C5', detail: `credit key "${key}"=${val} must be <= 0` });
      } else if (val < 0) {
        violations.push({ contract: 'C5', detail: `non-credit key "${key}"=${val} must be >= 0` });
      }
    }
  }

  // C6: barrier-dominance — protectedPathViolations > 0 ⇒ U > 0
  if (contribsIsObj && uIsFinite) {
    const barrier = contributions[BARRIER_KEY];
    if (typeof barrier === 'number' && barrier > 0 && U <= 0) {
      violations.push({ contract: 'C6', detail: `protectedPathViolations=${barrier} > 0 but U=${U} <= 0` });
    }
  }

  const ok = violations.length === 0;
  if (!ok && opts.assert === true) {
    const first = violations[0];
    throw new Error(`[energy-contract] ${first.contract} violated: ${first.detail}`);
  }
  return { ok, violations };
}

// ─── Precondition checker (W-*) ────────────────────────────────────────

/**
 * Validate weight inputs before calling computeU: non-null object, every value
 * finite and ≥ 0 (computeU itself fail-closes on negatives).
 */
function checkWeights(weights) {
  const violations = [];
  if (weights == null || typeof weights !== 'object') {
    violations.push({ contract: 'W-shape', detail: `weights is not a non-null object (got ${String(weights)})` });
    return { ok: false, violations };
  }
  for (const [key, val] of Object.entries(weights)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      violations.push({ contract: 'W-finite', detail: `weight "${key}"=${String(val)} is not a finite number` });
    } else if (val < 0) {
      violations.push({ contract: 'W-nonneg', detail: `weight "${key}"=${val} is negative` });
    }
  }
  return { ok: violations.length === 0, violations };
}

export {
  checkComputeUResult, checkWeights,
  KNOWN_CONTRIBUTION_KEYS, CREDIT_KEYS, BARRIER_KEY, U_FLOOR, SUM_TOL,
};
