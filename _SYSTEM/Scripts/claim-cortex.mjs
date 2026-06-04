#!/usr/bin/env node
/**
 * Claim-Evidence Cortex — claim-cortex.mjs
 *
 * The LIVE EPISTEMIC SENSOR that the energy gate was always missing.
 *
 * `energy-tick-core.mjs` reads the session as a stream of TOOL EVENTS (an edit
 * landed, a Bash command failed, a protected path was touched). That feeds five
 * of computeU's eleven terms: iota/gamma/delta/eta/kappa. But a single tool
 * event has no notion of a CLAIM's life over time — so four terms never fire
 * from real work:
 *
 *   alpha (entropy)      — uncertainty about where claims sit on the ladder
 *   beta  (klDivergence) — drift between what is CLAIMED and what evidence VERIFIES
 *   epsilon (infoGain)   — uncertainty a verification collapsed (prior -> posterior)
 *   zeta  (staleness)    — recurring evidence aging out from under a claim
 *
 * and the structural floor term —
 *
 *   theta (promotionLadderInversions) — a claim sitting HIGHER on the ladder than
 *                                       its evidence has earned (an over-claim)
 *
 * The whole point of the YURI energy system is to read work as CLAIMS, not tool
 * events alone (owner directive, [[claim-evidence-ledger]]). This module is that
 * missing organ: it maintains an in-session ledger of claims, tracks each claim's
 * claimed-vs-evidenced ladder rank, ages its evidence, models the prior->posterior
 * belief shift on verification, and emits a snapshot in EXACTLY the field shape
 * `computeU` consumes. Drop that snapshot into `gateProposal` and the four dark
 * terms light up on real epistemic work, parallel to the tool-event axis.
 *
 * Design boundaries (what this is NOT):
 *   - NOT the durable promotion ledger (operator-gated, hash-chained, Track-A
 *     governance — see _SYSTEM/reports/YURI_PROMOTION_LEDGER_RESEARCH_2026-05-25.md,
 *     still unbuilt). This is an additive, in-session OBSERVABILITY sensor: no
 *     operator gate, no commit authority, no canonical-memory write.
 *   - NOT a claim-language scanner. `claim-integrity-gate.mjs` lints PROSE for
 *     over-claim vocabulary; this models the LIFECYCLE of structured claims. They
 *     share one thing — the canonical ladder — which is imported, not re-declared.
 *
 * Purity / determinism: the core functions are pure and take `nowMs` explicitly
 * (mirroring energy-tick-core's injected `nowIso`), so the resume journal and the
 * tests are deterministic. No Date.now() in the core.
 *
 * KNOWN LIMITATION (owner-gated, tracked) — delta-gate severity laundering:
 *   gateProposal is a DELTA (Lyapunov) gate: it vetoes an INCREASE in the structural
 *   inversion field, not an absolute level. The convex (depth²) penalty here closes
 *   count->depth fungibility, but a delta gate fundamentally cannot catch an
 *   EQUAL-MAGNITUDE swap (resolve one 5-rung over-claim honestly while smuggling a
 *   fresh 5-rung fabrication; field 25->25 conserved) or a Pythagorean partition
 *   (3²+4²=5²). Fully closing this needs an L∞ MAX-severity veto term added INSIDE
 *   gateProposal — the OWNER-GATED enforcing energy core. This module emits the
 *   `maxLadderInversion` signal (see cortexSnapshot return) as groundwork; any wiring
 *   of the cortex to the enforcing gate MUST land that core change first. Until then
 *   the cortex is an additive OBSERVABILITY sensor with no live consumer of its veto.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs        (computeU contract this feeds)
 *   - _SYSTEM/Scripts/math/math-kernel.mjs        (confidenceDecay/entropy primitives)
 *   - _SYSTEM/Scripts/energy-tick-core.mjs        (the parallel tool-event sensor)
 *   - _SYSTEM/Scripts/claim-integrity-gate.mjs    (canonical PROMOTION_STATES source)
 */

import { PROMOTION_STATES } from './claim-integrity-gate.mjs';
// MATH-07 seam: the cortex composes kernel primitives TRANSITIVELY through
// yuri-energy.mjs (never a direct math-kernel import), keeping one energy↔kernel edge.
// maxEntBelief is re-exported by yuri-energy as a pure pass-through.
import { computeU, gateProposal, DEFAULT_WEIGHTS, maxEntBelief } from './math/yuri-energy.mjs';

// ---------------------------------------------------------------------------
// The ladder — single-sourced from claim-integrity-gate.mjs.
// ---------------------------------------------------------------------------
//
// PROMOTION_STATES is [draft, research, fixture_ready, runtime_tested,
// operator_validated, trusted, deprecated]. `deprecated` is a SINK, not a rung:
// a deprecated claim is off the promotion ladder entirely, so it is excluded from
// the ranked ladder and carries a sentinel rank. Everything else ranks by index.

export const LADDER = Object.freeze(PROMOTION_STATES.filter((s) => s !== 'deprecated'));
export const DEPRECATED = 'deprecated';

const RANK_OF = Object.freeze(
  LADDER.reduce((acc, state, index) => ({ ...acc, [state]: index }), {}),
);

// Named rungs used by the verdict policy (resolved from the ladder, never hardcoded
// to a magic number — if the ladder gains a rung these track it).
const RANK_RESEARCH = RANK_OF.research;
const RANK_RUNTIME_TESTED = RANK_OF.runtime_tested;
const RANK_TRUSTED = RANK_OF.trusted;

/**
 * Rank of a ladder state. Fail-CLOSED: an unknown / malformed status is NOT a rung
 * we can place, so it cannot be treated as "low rank" (which would understate the
 * inversion and let an over-claim through). `deprecated` is the sink (rank -1, off
 * ladder); any other unrecognized string is a structural fault -> sentinel null
 * rank that rankClaimed maps to the MAXIMAL over-claim (top of ladder).
 */
function ladderRank(status) {
  if (status === DEPRECATED) return -1;
  const r = RANK_OF[status];
  return Number.isInteger(r) ? r : null; // null = unrecognized (fail-closed sentinel)
}

// A claimed status we cannot recognize must be treated as the MOST ambitious claim
// (top of ladder) so its inversion against weak evidence is maximal — a malformed
// claimed status can never quietly lower U.
function rankClaimed(status) {
  const r = ladderRank(status);
  if (r === null) return RANK_TRUSTED; // unrecognized claim -> assume maximal over-claim
  if (r === -1) return 0;              // deprecated claim asserts nothing -> floor
  return r;
}

// ---------------------------------------------------------------------------
// Evidence model.
// ---------------------------------------------------------------------------
//
// Each evidence record mirrors the canonical claimEvidence schema kinds
// (yuri.promotion-ladder.v0.schema.json): test, runtime_trace, fixture, schema,
// report, advisory, operator_note. Each kind has a CEILING — the highest ladder
// rung that kind of evidence can, by itself, justify. This is the live-sensor
// reading of the research doc's Transition Policy: advisory/model output is
// advisory-only (research ceiling); a passing test earns runtime_tested; only an
// operator note earns operator_validated; trusted needs recurrence (handled below).

const EVIDENCE_CEILING = Object.freeze({
  advisory: RANK_OF.research,           // model / lane output — advisory only
  report: RANK_OF.research,
  schema: RANK_OF.fixture_ready,
  fixture: RANK_OF.fixture_ready,
  runtime_trace: RANK_OF.runtime_tested,
  test: RANK_OF.runtime_tested,         // a passing executable test
  operator_note: RANK_OF.operator_validated,
});

// Default evidence half-life (days). Recurring evidence decays so a once-passing
// test cannot prop up a `trusted` claim forever — the research doc's "stale evidence
// must degrade, not silently persist" made mechanical. Per-record override allowed.
export const DEFAULT_EVIDENCE_HALFLIFE_DAYS = 30;

// Strength floor below which decayed evidence no longer counts toward a rank. Tied
// to confidenceDecay: an evidence record at half-life one step (decayed to 0.5·base)
// still counts; two-plus half-lives (<=0.25·base for base 1) is stale.
const FRESHNESS_FLOOR = 0.25;

// Number of distinct fresh runtime-grade evidence records required to justify the
// `trusted` rung (research doc: "at least two passing recurring evidence checks").
const TRUSTED_RECURRENCE = 2;

// Upper bound on a per-record half-life override. A caller-supplied evidence record
// is UNTRUSTED agent work; without a ceiling, halfLifeDays=1e9 makes a decade-old
// test read as eternally fresh, zeroing the inversion penalty the enforcing gate
// keys on (red-team Cluster A). Cap at a small multiple of the default so a single
// record can never self-certify as immortal.
export const MAX_EVIDENCE_HALFLIFE_DAYS = DEFAULT_EVIDENCE_HALFLIFE_DAYS * 4; // 120d

// Bounded forward-skew tolerance (round-2 Cluster G). nowMs is an INJECTED clock; a
// record's capturedAt comes from a DIFFERENT source (CI host, file mtime, sibling
// process). Two honest clocks disagreeing by sub-second NTP/multi-host jitter is the
// normal case, not forgery. A strict `captured <= nowSafe` false-RETRACTed honest
// verified work AND epoch-0-stamped it (poisoning the staleness term). Allow a few
// seconds of forward skew — far below any meaningful date-forgery — and clamp a
// within-tolerance stamp to "just now" rather than maximally stale.
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

// Epoch-ms plausibility window for the injected clock (round-2 Cluster F). requireClock
// validated sign/finiteness but NOT scale, so a seconds-scale (~1.7e9) or micros-scale
// (~1.7e15) nowMs slipped through and silently mis-aged every record against a hardcoded
// MS_PER_DAY — the canonical seconds-vs-milliseconds bug. Reject anything outside a sane
// epoch-MILLISECONDS band so a scale slip fails CLOSED (throws) instead of mis-grading.
const MIN_PLAUSIBLE_CLOCK_MS = 1e12; // ~2001-09
const MAX_PLAUSIBLE_CLOCK_MS = 4e12; // ~2096-10 (widen if the system must outlive that)

const MS_PER_DAY = 86_400_000;

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Normalize one raw evidence record into the cortex's internal shape. Fail-CLOSED
 * on every attacker-controlled field — an evidence record is UNTRUSTED agent work:
 *   - unknown kind          -> ceiling 0 (proves nothing)
 *   - strength out of [0,1]  -> clamped
 *   - halfLifeDays          -> bounded to MAX_EVIDENCE_HALFLIFE_DAYS (no immortal record)
 *   - capturedAt missing / unparseable / NON-POSITIVE / FUTURE -> NO provenance ->
 *     stamped to epoch 0 (maximally stale) and forced not-fresh.
 *
 * The provenance rule is the red-team's Cluster-A fix: the previous code substituted
 * `nowMs` for a missing/unparseable timestamp and clamped a future age to 0, both of
 * which MANUFACTURED maximal freshness for evidence with no real provenance — a
 * fail-OPEN that let an unsupported `trusted` over-claim read as ASSERT and pass the
 * enforcing gate. Absent or impossible provenance must earn nothing.
 */
export function normalizeEvidence(raw, nowMs) {
  const e = (raw && typeof raw === 'object') ? raw : {};
  const now = Number(nowMs);
  // A non-finite clock cannot establish freshness: treat as epoch 0 so EVERY record
  // ages out (fail-closed). Callers should validate the clock; this is belt-and-braces.
  const nowSafe = Number.isFinite(now) ? now : 0;
  const kind = typeof e.kind === 'string' ? e.kind : '';
  const ceiling = Object.hasOwn(EVIDENCE_CEILING, kind) ? EVIDENCE_CEILING[kind] : 0;
  // base strength: explicit [0,1] strength, else 1.0 for a recognized kind, else 0.
  const base = e.strength === undefined
    ? (Object.hasOwn(EVIDENCE_CEILING, kind) ? 1.0 : 0)
    : clamp01(e.strength);
  const halfLife = Number(e.halfLifeDays);
  const halfLifeDays = Number.isFinite(halfLife) && halfLife > 0
    ? Math.min(halfLife, MAX_EVIDENCE_HALFLIFE_DAYS)
    : DEFAULT_EVIDENCE_HALFLIFE_DAYS;
  const captured = Number(e.capturedAt);
  // Provenance must be a finite, positive, NON-FUTURE (within skew tolerance) epoch-ms.
  // Anything else carries no provenance -> epoch 0 -> maximally stale. A stamp inside the
  // forward-skew tolerance is benign clock jitter, not forgery: accept it but CLAMP it to
  // nowSafe so it reads "just now" (age 0, fresh), never epoch-0-stale.
  const validTs = Number.isFinite(captured) && captured > 0 && captured <= nowSafe + CLOCK_SKEW_TOLERANCE_MS;
  const effectiveCaptured = validTs ? Math.min(captured, nowSafe) : 0;
  const ageDays = Math.max(0, (nowSafe - effectiveCaptured) / MS_PER_DAY);
  // decayed confidence at snapshot time (confidenceDecay's exact formula, inlined to
  // avoid a throw on the [0,1]/positivity preconditions we have already enforced).
  const decayed = base * Math.pow(0.5, ageDays / halfLifeDays);
  return {
    kind,
    ceiling,
    base,
    ageDays,
    halfLifeDays,
    decayed,
    // A record with no valid provenance can NEVER be fresh, regardless of decay.
    fresh: validTs && decayed >= FRESHNESS_FLOOR && base > 0 && ceiling > 0,
    reference: typeof e.reference === 'string' ? e.reference : '',
  };
}

/**
 * The ladder rank the current evidence set defensibly supports.
 *
 * No single evidence KIND earns the top `trusted` rung — the strongest kind
 * (operator_note) ceilings at operator_validated. Trusted is earned by a
 * COMBINATION: an operator-grade record AND at least TRUSTED_RECURRENCE distinct
 * fresh runtime-grade (>= runtime_tested) records, matching the research doc's
 * "two passing recurring evidence checks". Stale evidence contributes nothing —
 * so a claim whose only test has decayed below the freshness floor drops back
 * down the ladder, surfacing an inversion ("stale must degrade, not persist").
 */
export function evidenceStatusRank(evidenceRecords) {
  const fresh = evidenceRecords.filter((e) => e.fresh);
  if (fresh.length === 0) return 0;
  let rank = Math.max(...fresh.map((e) => e.ceiling)); // <= operator_validated by construction
  const hasOperator = fresh.some((e) => e.ceiling >= EVIDENCE_CEILING.operator_note);
  // Recurrence = DISTINCT executable checks (test / runtime_trace), NOT the operator
  // note — the approval and the recurring proof are separate gates (research doc).
  //
  // De-dup by IDENTITY (kind, reference) ONLY. Round 2 proved a capture-DAY component
  // was attacker-controlled both ways: re-stamping ONE logical test across two rounded
  // days faked two "distinct cycles" (bypass), while two genuine same-suite cycles a few
  // hours apart collapsed to one (false-veto). The age axis is the attacker's, so it
  // cannot carry distinctness. Distinct cycles must instead be DECLARED by distinct
  // REFERENCES (a run-id / suite-id the caller supplies) — copies of one result share
  // kind+reference and collapse to one check however their timestamps are spaced, while
  // two different KINDS (test + runtime_trace) still count as two. A missing reference
  // cannot distinguish same-kind cycles, so same-suite reruns need distinct run-ids
  // (fail-closed). True cryptographic per-evidence provenance is the durable ledger's
  // job (Track A, sha256); this is the sensor-level floor.
  const recurringKeys = new Set(
    fresh
      .filter((e) => e.kind === 'test' || e.kind === 'runtime_trace')
      .map((e) => `${e.kind}::${e.reference}`),
  );
  if (hasOperator && recurringKeys.size >= TRUSTED_RECURRENCE) rank = RANK_TRUSTED;
  return rank;
}

// ---------------------------------------------------------------------------
// Belief distributions over the ladder (for the epsilon / infoGain term).
// ---------------------------------------------------------------------------
//
// A claim's "belief" is a distribution over which rung it REALLY sits at. Before
// new evidence the belief is diffuse (high entropy); a verification sharpens it
// (low entropy). informationGain = H(prior) - H(posterior) > 0 credits that
// collapse. We model belief as a softmax-free triangular mass centered on a rank
// with a width that shrinks as evidence accrues — a transparent, monotonic stand-in
// for a full Bayesian posterior, sufficient to drive the energy term honestly.

const LADDER_N = LADDER.length;

/** A normalized belief vector (length = ladder rungs) peaked at `center`, spread `width`. */
export function beliefVector(center, width) {
  const c = Number.isFinite(center) ? center : 0;
  const w = Math.max(0.5, Number(width) || 0.5); // width 0 would be a degenerate one-hot
  const raw = LADDER.map((_, rank) => Math.exp(-((rank - c) ** 2) / (2 * w * w)));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  // clamp away from exact zero so downstream entropy/KL never hit a log(0) edge.
  return raw.map((v) => Math.max(v / sum, 1e-9));
}

/**
 * Maximum-entropy belief over the ladder centered on `meanRank` (card 28 / ENG-06).
 *
 * REPLACES the legacy `beliefVector(center, beliefWidth(n))` Gaussian whose spread was
 * the hand-tuned magic constant `beliefWidth = LADDER_N/(2(n+1))`. maxEntBelief solves
 * `p_i ∝ exp(λ·i)` for the λ matching `E[i] = meanRank` — the least-assuming distribution
 * for a single mean constraint, so the spread FALLS OUT of λ + the support instead of
 * being asserted. The assumptions become AUDITABLE (one named constraint), not absent.
 * Imported TRANSITIVELY from yuri-energy (MATH-07 seam). meanRank is clamped to the
 * legal [0, LADDER_N-1] support window, and every mass clamped away from 0 so the
 * downstream entropy/KL/info-gain terms never hit a log(0) edge (mirrors beliefVector).
 */
function maxEntBeliefVector(meanRank) {
  const m = Number.isFinite(meanRank) ? meanRank : 0;
  const clampedMean = Math.min(LADDER_N - 1, Math.max(0, m));
  const raw = maxEntBelief(clampedMean, LADDER_N);
  return raw.map((v) => Math.max(v, 1e-9));
}

// De-duped DISTINCT fresh-evidence count (card 34). The legacy belief fed RAW
// `fresh.length`, which an attacker inflates by re-stamping ONE logical check across
// copies (the same fail-open evidenceStatusRank's recurrence dedup closed). Distinctness
// is keyed on IDENTITY (kind, reference) — NOT the attacker-controlled age axis — exactly
// as the trusted-recurrence gate keys it. This distinct count is the principled `n_i` the
// UCB1 HEDGE tiebreaker consumes (the global-effort coupling), so copies of one result
// cannot self-explore their way to ASSERT.
function distinctFreshCount(freshRecords) {
  const keys = new Set(freshRecords.map((e) => `${e.kind}::${e.reference}`));
  return keys.size;
}

// UCB1-INSPIRED global-effort uncertainty bonus (card 34) — bounded to [0, c].
//
// CARD-INTERNAL CORRECTION (documented, owner-flagged): card 34's LITERAL formula
// `c·√(ln(max(e,totalChecks)) / nDistinct)` GROWS with totalChecks, which contradicts the
// card's OWN behavioral contract — "a single green pass while the whole system has barely
// been checked stays uncertain" and "ASSERT must become HEDGE as totalSystemChecks shrinks
// toward 1 and recover as it grows." The literal √(ln T) numerator does the opposite. The
// behavioral spec (the stated test) is the contract, so the bonus DECAYS as global effort
// grows: `bonus = c · √( 1 / (totalChecks · nDistinct) )`, bounded in [0, c]. At T=1,n=1 the
// bonus is c (max uncertainty); it falls as 1/√T (the surviving UCB shape) and as 1/√n (more
// distinct checks for THIS claim shrink it). Only the SHAPE transfers, NOT UCB1's O(log t)
// regret bound (kinds are not i.i.d. arm pulls). c=1.0 (√2 is a worst-case bound, too tight).
const UCB_C = 1.0;
// ASSERT requires confidence (1 − bonus) at or above this; otherwise HEDGE. 0.5 = a claim
// whose global+local checking leaves >50% residual uncertainty stays a HEDGE.
const UCB_ASSERT_CONFIDENCE = 0.5;
function ucbBonus(totalSystemChecks, nDistinct) {
  const t = Math.max(1, Number(totalSystemChecks) || 0);
  const n = Math.max(1, Number(nDistinct) || 0);
  return Math.min(UCB_C, UCB_C * Math.sqrt(1 / (t * n)));
}

// ---------------------------------------------------------------------------
// jeffreyPosterior — Jeffrey conditioning / probability kinematics (card 36).
// ---------------------------------------------------------------------------
//
// ADVISORY / FLAG-GATED (default OFF). Within a single KIND, the MaxEnt posterior is
// reliability-BLIND: a fresh advisory (decayed≈1.0) and a barely-fresh advisory
// (decayed≈0.28) of the same kind both center the posterior on the SAME evidenceRank,
// yielding identical ε/info-gain credit (their ΔU gap today is entirely ζ/staleness,
// NOT ε). Jeffrey's soft-evidence update fixes that WITHIN ε: a single-tick BATCH
//   P'(rank) = Σ_i P(rank | E_i)·reliability_i  +  leftoverMass·prior
// where each record E_i contributes its OWN MaxEnt belief P(rank|E_i) = maxEnt at the
// record's CEILING rank, weighted by reliability_i = decayed_strength_i. Leftover mass
// (1 − Σ reliability_i, floored at 0) stays on the prior — a reliable record moves the
// posterior nearly fully, a weak one fractionally, so the weak-only case earns strictly
// LESS info-gain credit. Single batch over the current record set (commutative within a
// tick); never an online stream. Rigidity caveat (card 36): if a record retroactively
// re-weights how kinds map to rungs, REBUILD the partition rather than Jeffrey-through it.
//
// DOUBLE-COUNT GUARD (the mandatory ε-vs-ζ canary's subject): reliability uses
// decayed_strength, the SAME signal evalStaleness (ζ) consumes. Jeffrey deliberately
// routes the within-kind reliability into ε (the posterior SHARPNESS), while ζ scores the
// base−decayed DROP. These are orthogonal projections of decay — sharpness vs magnitude —
// so a weak record loses ε credit (diffuse posterior) AND pays ζ, but the two are not the
// SAME number applied twice: ε reads the posterior shape, ζ reads the strength shortfall.
// The canary asserts ε FIRES (a real value, not the silent skip evalInfoGain takes on a
// malformed posterior) and that turning Jeffrey ON does not alter ζ.
function jeffreyPosterior(freshRecords, prior) {
  if (!Array.isArray(freshRecords) || freshRecords.length === 0) return prior.slice();
  const acc = new Array(LADDER_N).fill(0);
  let usedMass = 0;
  for (const e of freshRecords) {
    const reliability = clamp01(e.decayed); // decayed_strength_i in [0,1]
    if (reliability <= 0) continue;
    const pGivenE = maxEntBeliefVector(e.ceiling); // P(rank | E_i): MaxEnt at the kind ceiling
    for (let i = 0; i < LADDER_N; i += 1) acc[i] += reliability * pGivenE[i];
    usedMass += reliability;
  }
  // Leftover mass stays on the prior (rigidity: untouched-partition mass is preserved).
  const leftover = Math.max(0, 1 - usedMass);
  for (let i = 0; i < LADDER_N; i += 1) acc[i] += leftover * prior[i];
  // Normalize + clamp away from 0 (entropy/KL/info-gain log-safety, mirrors maxEntBeliefVector).
  const sum = acc.reduce((a, b) => a + b, 0) || 1;
  return acc.map((v) => Math.max(v / sum, 1e-9));
}

// ---------------------------------------------------------------------------
// Verdicts — the per-claim epistemic decision.
// ---------------------------------------------------------------------------

export const VERDICTS = Object.freeze({
  ASSERT: 'ASSERT',             // claimed <= evidenced, fresh + confident: state it plainly
  HEDGE: 'HEDGE',               // supported but soft/stale/uncertain: assert WITH a qualifier
  VERIFY_FIRST: 'VERIFY-FIRST', // claimed one rung above evidence: get evidence before asserting
  RETRACT: 'RETRACT',           // claimed >= 2 rungs above evidence, or verified-tier with none: pull it
  EXPLORE: 'EXPLORE',           // hypothesis stage (draft/research, no evidence): gated free divergence
});

// Verdict severity ladder for the do-operator ablation (card 8). Higher = more
// distrustful / worse for the claim. A record's NECESSITY is the rung-drop its
// removal forces (ASSERT 0 -> ... -> RETRACT 3). EXPLORE is the hypothesis floor:
// it carries no over-claim, so it shares the ASSERT/healthy tier (severity 0) — an
// ablation that lands on EXPLORE has not "dropped" a healthy ASSERT into distrust.
const VERDICT_SEVERITY = Object.freeze({
  [VERDICTS.ASSERT]: 0,
  [VERDICTS.EXPLORE]: 0,
  [VERDICTS.HEDGE]: 1,
  [VERDICTS.VERIFY_FIRST]: 2,
  [VERDICTS.RETRACT]: 3,
});

// Convex penalty for an over-claim's DEPTH. The structural floor in gateProposal
// keys on the promotionLadderInversions field's delta, and a brain that summed raw
// rung-counts could be laundered: collapse five 1-rung inversions (sum 5) into one
// fabricated 5-rung `trusted`-no-evidence RETRACT (also 5) and the sum is CONSERVED
// -> the floor stays blind while the KL term masks the swap (red-team Cluster C, a
// reproduced fail-open). Squaring makes depth non-fungible with count: 5×1²=5 but
// 1×5²=25, so introducing a severe over-claim ALWAYS raises the field the floor reads,
// even when an equal count of shallow inversions is simultaneously resolved.
function inversionPenalty(deltaRank) {
  const d = deltaRank > 0 ? deltaRank : 0;
  return d * d;
}

// Fail-CLOSED clock gate. The cortex's freshness verdicts are only meaningful against
// a trustworthy clock; a missing/NaN/string nowMs must NOT silently coerce to epoch 0
// and relabel stale evidence as fresh (red-team Cluster A). A snapshot that cannot
// establish a clock throws — the documented-safest outcome — rather than emit a
// freshness reading the caller might trust. Callers inject the clock (like the
// energy-tick hook injects nowIso) and error-isolate.
function requireClock(nowMs) {
  const n = Number(nowMs);
  // Must be a finite, positive epoch-ms. Rejects NaN/undefined/strings AND the null->0
  // and negative coercions, so no caller can establish a degenerate clock that ages
  // every record from (or to) the epoch.
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`claim-cortex: nowMs must be a finite, positive epoch-ms clock (got ${JSON.stringify(nowMs)})`);
  }
  // ...and at MILLISECONDS scale. A seconds/micros scale slip is the canonical time bug;
  // reject it loudly (fail-closed, denial-of-sensor) rather than silently mis-age records.
  if (n < MIN_PLAUSIBLE_CLOCK_MS || n > MAX_PLAUSIBLE_CLOCK_MS) {
    throw new Error(`claim-cortex: nowMs must be epoch-MILLISECONDS in [${MIN_PLAUSIBLE_CLOCK_MS}, ${MAX_PLAUSIBLE_CLOCK_MS}] (scale slip? got ${JSON.stringify(nowMs)})`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// assessClaim — the per-claim energy + verdict.
// ---------------------------------------------------------------------------

/**
 * Assess a single claim: where it is claimed to sit, where evidence puts it, the
 * resulting energy U (via computeU on a single-claim state), and the verdict.
 *
 * @param {object} claim     { id, text, claimedStatus, evidence: [...] }
 * @param {object} opts      { nowMs, weights }
 * @returns {object} { id, claimedStatus, claimedRank, evidenceRank, deltaRank,
 *                     inversions, freshCount, staleCount, U, verdict, reason,
 *                     prior, posterior }
 */
export function assessClaim(claim, opts = {}) {
  const nowMs = requireClock(opts.nowMs); // fail-closed: no trustworthy clock -> no freshness verdict
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const c = (claim && typeof claim === 'object') ? claim : {};
  const rawEvidence = Array.isArray(c.evidence) ? c.evidence : [];
  const records = rawEvidence.map((e) => normalizeEvidence(e, nowMs));
  const fresh = records.filter((e) => e.fresh);

  const claimedRank = rankClaimed(c.claimedStatus);
  const rawEvidenceRank = evidenceStatusRank(records);
  // Hypothesis rungs (draft/research) require no executable evidence — a claim that
  // only reaches a hypothesis rung is self-supporting and can never be an inversion.
  // Above research, the claim is measured STRICTLY against what evidence earns.
  const evidenceRank = claimedRank <= RANK_RESEARCH
    ? Math.max(rawEvidenceRank, claimedRank)
    : rawEvidenceRank;
  const deltaRank = claimedRank - evidenceRank;
  const inversions = deltaRank > 0 ? deltaRank : 0;

  // De-duped DISTINCT fresh count (card 34) — IDENTITY-keyed, not raw fresh.length, so
  // re-stamped copies of one check cannot inflate confidence. Drives the UCB tiebreaker.
  const nDistinct = distinctFreshCount(fresh);

  // belief prior (before this assessment's evidence) vs posterior (after). Both are
  // MAXIMUM-ENTROPY beliefs (card 28 / ENG-06): prior centered on the CLAIMED rank,
  // posterior on the EVIDENCED rank. This retires the magic Gaussian width constant
  // `beliefWidth = LADDER_N/(2(n+1))` — the spread now derives from the MaxEnt λ for the
  // mean constraint, making the info-gain credit principled rather than an artifact of a
  // hand-tuned law. A verification that confirms a lower true rank sharpens belief ->
  // infoGain credit, exactly as before, but on an auditable prior.
  const prior = maxEntBeliefVector(claimedRank);
  // Posterior: MaxEnt-at-evidenceRank by default. Jeffrey conditioning (card 36) is
  // ADVISORY / FLAG-GATED (opts.jeffrey === true) — it reliability-weights the posterior
  // within-kind so a weak record earns strictly less ε credit, but it is NOT in the
  // approved live-wiring scope and stays off so the live verdict + aggregateU are the
  // beliefWidth-corrected baseline. When armed it composes per-record soft evidence.
  const posterior = opts.jeffrey === true
    ? jeffreyPosterior(fresh, prior)
    : maxEntBeliefVector(evidenceRank);

  // Single-claim computeU state. alpha (entropy of a one-claim distribution) is 0 by
  // construction; the meaningful terms here are beta (claimed!=evidenced drift),
  // theta (inversion), zeta (staleness), epsilon (infoGain) and the iota credit.
  const state = {
    claimPromotionDistribution: { [String(c.claimedStatus ?? 'draft')]: 1 },
    claimedDistribution: oneHot(claimedRank),
    verifiedDistribution: oneHot(evidenceRank),
    priorState: prior,
    posteriorState: posterior,
    evidence: records.map((e) => ({ base: e.base, age: e.ageDays, halfLife: e.halfLifeDays })),
    promotionLadderInversions: inversionPenalty(deltaRank),
    verifiedEvidenceCount: fresh.length,
  };
  const U = computeU(state, weights).result.U;

  const verdict = decideVerdict({
    claimedRank,
    evidenceRank,
    deltaRank,
    freshCount: fresh.length,
    nDistinct,
    // strongest = best fresh evidence's decayed confidence. If even the best support
    // has aged past one half-life (< 0.5), a claim at-or-below its rank still HEDGEs.
    strongest: fresh.length ? Math.max(...fresh.map((e) => e.decayed)) : 0,
    // UCB1 global-effort coupling (card 34). DISABLED by default (undefined) so the
    // ASSERT/HEDGE boundary is byte-identical for standalone assessment; a session
    // caller arms it with a real distinct-check counter to require "one green pass while
    // the whole system is barely checked stays a HEDGE."
    totalSystemChecks: opts.totalSystemChecks,
  });

  return {
    id: c.id ?? null,
    claimedStatus: c.claimedStatus ?? null,
    claimedRank,
    evidenceStatus: LADDER[evidenceRank],
    evidenceRank,
    deltaRank,
    inversions,
    freshCount: fresh.length,
    staleCount: records.length - fresh.length,
    U,
    verdict: verdict.verdict,
    reason: verdict.reason,
    prior,
    posterior,
  };
}

// ---------------------------------------------------------------------------
// evidenceNecessity — Pearl do-operator / counterfactual ablation (card 8).
// ---------------------------------------------------------------------------
//
// PURE, ADDITIVE READOUT. It deep-CLONES the claim, removes one evidence record,
// re-runs the EXISTING assessClaim under the SAME injected clock, and measures the
// verdict-ladder rung-drop that ablation causes. It touches NO computeU-consumed
// field — it never mutates the input claim, never feeds a snapshot, and is not read
// by gateProposal. It is a parallel-safe diagnostic the energy gate is blind to:
// assessClaim/maxLadderInversion only see EXISTING over-claims, not the FRAGILITY of
// a currently-healthy ASSERT. This surfaces LOAD-BEARING vs DECORATIVE evidence and a
// single-point-of-failure flag (one record's removal forces a healthy verdict to RETRACT).
//
// necessity(record) = severity(verdict_without_record) − severity(verdict_with_all),
// floored at 0 (removing evidence can only ever weaken or hold a claim, never
// strengthen it; a negative is a numerical artifact and is clamped). Scope is STRICT
// counterfactual ablation — records are modeled independent, no SCM dependency DAG.
export function evidenceNecessity(claim, opts = {}) {
  const nowMs = requireClock(opts.nowMs); // fail-closed: no trustworthy clock -> no verdict
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const c = (claim && typeof claim === 'object') ? claim : {};
  const records = Array.isArray(c.evidence) ? c.evidence : [];

  // Baseline verdict with the FULL evidence set (deep-cloned so the caller's object is
  // never observed-then-mutated; assessClaim is pure but we clone for belt-and-braces).
  const baseline = assessClaim(structuredClone(c), { nowMs, weights });
  const baseSeverity = VERDICT_SEVERITY[baseline.verdict] ?? 0;

  const perRecord = records.map((_, dropIndex) => {
    // do(remove r): clone the claim with exactly this one record deleted, re-assess.
    const ablatedEvidence = records.filter((__, i) => i !== dropIndex);
    const ablatedClaim = { ...structuredClone(c), evidence: structuredClone(ablatedEvidence) };
    const ablated = assessClaim(ablatedClaim, { nowMs, weights });
    const dropSeverity = VERDICT_SEVERITY[ablated.verdict] ?? 0;
    const necessity = Math.max(0, dropSeverity - baseSeverity); // weakening only
    return {
      index: dropIndex,
      kind: typeof records[dropIndex]?.kind === 'string' ? records[dropIndex].kind : '',
      reference: typeof records[dropIndex]?.reference === 'string' ? records[dropIndex].reference : '',
      baselineVerdict: baseline.verdict,
      ablatedVerdict: ablated.verdict,
      necessity,
      loadBearing: necessity > 0,
      // single point of failure: removing THIS one record collapses a non-RETRACT
      // (currently-defensible) claim all the way to RETRACT.
      singlePointOfFailure: baseline.verdict !== VERDICTS.RETRACT && ablated.verdict === VERDICTS.RETRACT,
    };
  });

  return {
    id: c.id ?? null,
    baselineVerdict: baseline.verdict,
    recordCount: records.length,
    // a claim is fragile if ANY single record is a single point of failure.
    singlePointOfFailure: perRecord.some((r) => r.singlePointOfFailure),
    loadBearingCount: perRecord.filter((r) => r.loadBearing).length,
    decorativeCount: perRecord.filter((r) => !r.loadBearing).length,
    perRecord,
  };
}

function decideVerdict({ claimedRank, evidenceRank, deltaRank, freshCount, strongest, nDistinct, totalSystemChecks }) {
  const noSupport = freshCount === 0;
  // Verified-tier claim (>= runtime_tested) with no fresh support — the canonical over-claim.
  if (claimedRank >= RANK_RUNTIME_TESTED && noSupport) {
    return { verdict: VERDICTS.RETRACT, reason: `claimed ${LADDER[claimedRank]} with no fresh evidence` };
  }
  // Claimed two or more rungs above what evidence earns — structurally unsupportable.
  if (deltaRank >= 2) {
    return { verdict: VERDICTS.RETRACT, reason: `claimed ${deltaRank} rungs above evidence (${LADDER[evidenceRank]})` };
  }
  // Claimed exactly one rung above evidence — close, but get the evidence first.
  if (deltaRank === 1) {
    return { verdict: VERDICTS.VERIFY_FIRST, reason: `one rung above evidence — verify before asserting ${LADDER[claimedRank]}` };
  }
  // deltaRank <= 0 from here: the claim is at or below what evidence supports.
  // Hypothesis stage: a draft/research claim with nothing measured yet -> free, gated divergence.
  if (claimedRank <= RANK_RESEARCH && noSupport) {
    return { verdict: VERDICTS.EXPLORE, reason: 'hypothesis stage — explore freely, promote on evidence' };
  }
  // Supported, but the best fresh evidence has aged past one half-life — qualify it.
  if (strongest < 0.5) {
    return { verdict: VERDICTS.HEDGE, reason: 'supported but evidence aging — assert with an explicit qualifier' };
  }
  // UCB1-inspired global-effort HEDGE tiebreaker (card 34). ONLY fires when a session caller
  // arms `totalSystemChecks` with a real distinct-check counter; default-undefined keeps the
  // ASSERT/HEDGE boundary byte-identical for standalone assessment. When armed, confidence =
  // (1 − bonus): a single green pass while the whole system has barely been checked has high
  // residual uncertainty (bonus near c) -> confidence below the threshold -> stays a HEDGE. As
  // global effort grows (and as THIS claim gains distinct checks) the bonus decays and the
  // claim recovers to ASSERT. Pure tiebreaker — it never PROMOTES a claim, only holds it at
  // HEDGE; copies of one check share kind+reference so the distinct count cannot be inflated.
  if (Number.isFinite(totalSystemChecks)) {
    const bonus = ucbBonus(totalSystemChecks, nDistinct);
    const confidence = 1 - bonus;
    if (confidence < UCB_ASSERT_CONFIDENCE) {
      return {
        verdict: VERDICTS.HEDGE,
        reason: `global verification effort thin (UCB bonus ${bonus.toFixed(3)}, confidence ${confidence.toFixed(3)} over ${nDistinct} distinct check(s)) — hedge until more of the system is checked`,
      };
    }
  }
  return { verdict: VERDICTS.ASSERT, reason: `evidence (${LADDER[evidenceRank]}) meets or exceeds claim — assert plainly` };
}

// ---------------------------------------------------------------------------
// cortexSnapshot — aggregate the whole ledger into a computeU state.
// ---------------------------------------------------------------------------

/**
 * Fold an array of claims into a single state snapshot in computeU's field shape.
 * This is what a PostToolUse / claim-update hook would feed to gateProposal to get
 * a real epistemic ΔU — the four dark terms light up here because the AGGREGATE
 * carries the distributions a single claim cannot.
 *
 * Deprecated claims are excluded from the live distributions (they assert nothing)
 * but their evidence is NOT counted toward credits.
 */
export function cortexSnapshot(claims, opts = {}) {
  const nowMs = requireClock(opts.nowMs); // fail-closed: a non-finite clock cannot establish freshness
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const list = Array.isArray(claims) ? claims : [];

  const claimPromotionDistribution = Object.fromEntries(LADDER.map((s) => [s, 0]));
  const claimedHist = new Array(LADDER_N).fill(0);
  const verifiedHist = new Array(LADDER_N).fill(0);
  const priorAgg = new Array(LADDER_N).fill(0);
  const posteriorAgg = new Array(LADDER_N).fill(0);
  const evidence = [];
  let promotionLadderInversions = 0;
  let verifiedEvidenceCount = 0;
  let liveClaims = 0;
  let retractCount = 0;
  let maxLadderInversion = 0;

  const assessments = [];
  for (const claim of list) {
    // Fail-closed: a null/undefined/non-object entry asserts nothing and must not
    // abort the whole epistemic read (red-team Cluster D — a stray null threw and
    // suppressed the entire snapshot, hiding every real inversion in that tick).
    if (!claim || typeof claim !== 'object') continue;
    // Round-2 D-residual: a VALID object whose field-getter THROWS on read (e.g. a
    // poisoned evidence[].reference or claimedStatus accessor) must likewise be skipped,
    // not allowed to abort the whole tick. Error-isolate per entry — fail-closed,
    // identical treatment to a null entry, while every other claim still gets assessed.
    let a;
    try {
      a = assessClaim(claim, { nowMs, weights });
    } catch {
      continue;
    }
    assessments.push(a);
    if (claim.claimedStatus === DEPRECATED) continue; // off-ladder: no distribution mass
    liveClaims += 1;
    const cs = LADDER[a.claimedRank] ?? 'draft';
    claimPromotionDistribution[cs] += 1;
    claimedHist[a.claimedRank] += 1;
    verifiedHist[a.evidenceRank] += 1;
    for (let i = 0; i < LADDER_N; i += 1) {
      priorAgg[i] += a.prior[i];
      posteriorAgg[i] += a.posterior[i];
    }
    // Convex (depth-squared) aggregation so a severe over-claim cannot be laundered
    // through a count-conserving swap (Cluster C). The structural floor reads this field.
    promotionLadderInversions += inversionPenalty(a.inversions);
    // Max per-claim inversion depth (L∞ severity signal). The convex SUM is still
    // partition-fungible (3²+4²=5² — round-2 C-residual), and the energy gate is a
    // DELTA gate that cannot see an equal-magnitude swap. Fully closing that requires
    // an owner-gated max-severity veto INSIDE gateProposal; the cortex emits the signal
    // here as groundwork so wiring the cortex to the enforcing gate can OR it into the
    // structural floor. Not yet consumed by computeU — see header "Known limitation".
    maxLadderInversion = Math.max(maxLadderInversion, a.inversions);
    if (a.verdict === VERDICTS.RETRACT) retractCount += 1;
    verifiedEvidenceCount += a.freshCount;
    const records = Array.isArray(claim.evidence) ? claim.evidence : [];
    for (const raw of records) {
      const e = normalizeEvidence(raw, nowMs);
      evidence.push({ base: e.base, age: e.ageDays, halfLife: e.halfLifeDays });
    }
  }

  // Normalize the histograms / belief aggregates into valid distributions. Empty
  // ledger -> uniform (max entropy, "we know nothing"), the honest prior.
  const claimedDistribution = normalizeHist(claimedHist);
  const verifiedDistribution = normalizeHist(verifiedHist);
  const priorState = normalizeHist(priorAgg);
  const posteriorState = normalizeHist(posteriorAgg);

  const state = {
    claimPromotionDistribution,
    claimedDistribution,
    verifiedDistribution,
    priorState,
    posteriorState,
    evidence,
    promotionLadderInversions,
    verifiedEvidenceCount,
  };

  return { state, assessments, liveClaims, retractCount, maxLadderInversion };
}

// ---------------------------------------------------------------------------
// gateClaimTransition — the SWAP-IMMUNE, identity-aware claim-transition gate.
// ---------------------------------------------------------------------------
//
// The energy core's gateProposal is a DELTA gate: it vetoes an INCREASE in an
// aggregate scalar. Every MAGNITUDE aggregate (sum, convex sum, even L∞ max) is
// CONSERVED under an equal-magnitude swap — resolve one 5-rung over-claim honestly
// while smuggling a fresh 5-rung fabrication and the aggregate is unchanged, so the
// floor is blind and the soft KL/info-gain credit funds a negative ΔU -> ACCEPT
// (the round-2 C-residual: equal-magnitude swaps, Pythagorean 3²+4²=5² partitions,
// recurrence-buyback decreases).
//
// The thing that is NOT conserved under a swap is per-claim IDENTITY: the launder
// introduces (or deepens) a SPECIFIC claim's over-claim, and no amount of resolving
// OTHER claims makes that one earned. So this gate composes the delta gate with a
// per-claim, NON-OFFSETTABLE identity veto: reject when any claim becomes a
// new-or-deeper RETRACT-verdict inversion, independent of what happened elsewhere.
//
// It lives HERE (cortex layer), not in gateProposal, so the owner-gated enforcing
// energy core stays untouched — the identity veto is OR'd ON TOP of the delta gate,
// exactly as the enforce hook sits as layer-2 on top of the operator-write-guard.
//
// Calibration: only RETRACT-verdict claims (>=2-rung, or verified-tier with no fresh
// evidence — the severe over-claims the launder targets) trigger the identity veto.
// An honest in-progress VERIFY-FIRST (1-rung) claim does not — though introducing it
// still moves the delta gate's aggregate, which keys on the earned-rank discipline.
// Claims MUST carry a stable `id` to be tracked across the transition; an inverting
// RETRACT claim with no id cannot be proven not-new and fails CLOSED (veto).
export function gateClaimTransition(claimsBefore, claimsAfter, opts = {}) {
  const before = cortexSnapshot(claimsBefore, opts);
  const after = cortexSnapshot(claimsAfter, opts);

  // Baseline: the deepest inversion depth per tracked claim-id BEFORE the transition.
  const beforeDepth = new Map();
  for (const a of before.assessments) {
    if (a.inversions > 0 && a.id != null) {
      const id = String(a.id);
      beforeDepth.set(id, Math.max(beforeDepth.get(id) ?? 0, a.inversions));
    }
  }

  // Identity veto: any RETRACT claim in AFTER whose inversion is new-or-deeper vs its
  // own baseline. Resolving other claims cannot offset this.
  const worsened = [];
  let untrackedRetract = 0;
  for (const a of after.assessments) {
    if (a.verdict !== VERDICTS.RETRACT || a.inversions <= 0) continue;
    if (a.id == null) { untrackedRetract += 1; continue; } // cannot track -> fail-closed
    const prev = beforeDepth.get(String(a.id)) ?? 0;
    if (a.inversions > prev) worsened.push({ id: String(a.id), from: prev, to: a.inversions });
  }
  const identityVeto = worsened.length > 0 || untrackedRetract > 0;

  // Compose with the delta gate. We inject each snapshot's L∞ max-inversion signal
  // (returned separately by cortexSnapshot, not part of the public state shape) so the
  // gate's absolute-level MAX-SEVERITY floor can fire. opts.maxLadderInversionCap arms
  // it (default Infinity = disabled): belt-and-suspenders alongside the identity veto —
  // the identity veto catches a NEW-or-deeper per-claim over-claim, the level floor
  // refuses any after-state whose deepest inversion exceeds the cap regardless of id.
  const gate = gateProposal({
    stateBefore: { ...before.state, maxLadderInversion: before.maxLadderInversion },
    stateAfter: { ...after.state, maxLadderInversion: after.maxLadderInversion },
    weights: opts.weights || DEFAULT_WEIGHTS,
    threshold: opts.threshold,
    allowOverride: opts.allowOverride,
    maxLadderInversionCap: opts.maxLadderInversionCap ?? Infinity,
  });

  const accept = !identityVeto && gate.result.accept;
  const reason = identityVeto
    ? (worsened.length
        ? `claim-identity veto: ${worsened.length} claim(s) became a new-or-deeper RETRACT over-claim (e.g. ${worsened[0].id}: ${worsened[0].from}→${worsened[0].to}) — non-offsettable by resolving others`
        : `claim-identity veto: ${untrackedRetract} RETRACT over-claim(s) with no stable id — cannot prove not-new (fail-closed)`)
    : gate.result.reason;

  return {
    accept,
    identityVeto,
    worsened,
    untrackedRetract,
    reason,
    deltaGate: {
      accept: gate.result.accept,
      deltaU: gate.result.deltaU,
      structuralFloorVeto: gate.result.structuralFloorVeto,
      maxSeverityVeto: gate.result.maxSeverityVeto,
      reason: gate.result.reason,
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function oneHot(rank) {
  const v = new Array(LADDER_N).fill(1e-9); // clamped away from 0 for KL/entropy safety
  const r = Number.isInteger(rank) && rank >= 0 && rank < LADDER_N ? rank : 0;
  v[r] = 1;
  return v;
}

function normalizeHist(hist) {
  const sum = hist.reduce((a, b) => a + b, 0);
  if (sum <= 0) return new Array(LADDER_N).fill(1 / LADDER_N); // uniform: honest "unknown"
  return hist.map((v) => Math.max(v / sum, 1e-9));
}

// ---------------------------------------------------------------------------
// CLI — worked example over a small mixed ledger.
// ---------------------------------------------------------------------------

function workedExample() {
  const nowMs = 1_000_000_000_000; // fixed, deterministic
  const day = MS_PER_DAY;
  const claims = [
    // honest: claimed fixture_ready, has a fresh fixture -> ASSERT, no inversion.
    { id: 'c1', claimedStatus: 'fixture_ready', evidence: [{ kind: 'fixture', capturedAt: nowMs - day }] },
    // over-claim: claimed trusted, only a stale test -> RETRACT + inversion.
    { id: 'c2', claimedStatus: 'trusted', evidence: [{ kind: 'test', capturedAt: nowMs - 120 * day }] },
    // hypothesis: claimed research, no evidence -> EXPLORE.
    { id: 'c3', claimedStatus: 'research', evidence: [] },
    // near-miss: claimed runtime_tested, only a fixture -> VERIFY-FIRST.
    { id: 'c4', claimedStatus: 'runtime_tested', evidence: [{ kind: 'fixture', capturedAt: nowMs - day }] },
  ];
  const { state, assessments, liveClaims } = cortexSnapshot(claims, { nowMs });
  const U = computeU(state).result.U;
  return {
    liveClaims,
    aggregateU: U,
    verdicts: assessments.map((a) => ({ id: a.id, verdict: a.verdict, deltaRank: a.deltaRank, U: a.U, reason: a.reason })),
    litTerms: {
      entropy: state.claimPromotionDistribution,
      inversions: state.promotionLadderInversions,
      verifiedEvidenceCount: state.verifiedEvidenceCount,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worked-example' || argv.length === 0) {
    console.log(JSON.stringify(workedExample(), null, 2));
  } else if (argv[0] === '--help' || argv[0] === '-h') {
    console.log([
      'Claim-Evidence Cortex — live epistemic sensor feeding computeU',
      '',
      'Usage:',
      '  node _SYSTEM/Scripts/claim-cortex.mjs --worked-example',
      '',
      'Programmatic:',
      '  import { assessClaim, cortexSnapshot, LADDER, VERDICTS }',
      '    from "_SYSTEM/Scripts/claim-cortex.mjs";',
    ].join('\n'));
  } else {
    console.error(`unknown argument: ${argv[0]}`);
    process.exit(2);
  }
}
