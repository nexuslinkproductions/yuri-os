// @capability: afl-organ-adapter
// @serves: wire alpha factors into the epistemic organs | factor claim cortex | factor energy gate | factor promotion gate | factor prediction ledger | factor truth maintenance | factor lineage retraction cascade
// @does: the AFL integration keystone — maps an alpha factor onto a claim-cortex claim, gates factor promotions through the energy gate, records/resolves factor forecasts on an ISOLATED prediction ledger, and threads factor lineage through a JTMS for retraction cascades
// @use: when an AFL factor's lifecycle (status promotion, backtest evidence, forecast vs outcome, derivation-from-parent invalidation) must be scored by YURI's epistemic organs instead of an ad-hoc heuristic
// @exports: AFL_LEDGER, factorToClaim, gateFactorTransition, recordFactorSignal, resolveFactorSignal, factorCalibration, buildFactorTms, factorRetractionCascade
/**
 * afl-organ-adapter.mjs — AFL ⇄ epistemic-organ integration keystone.
 *
 * Wires the Alpha Factor Library into four existing YURI organs using their
 * VERIFIED call conventions (the AFL design doc got several wrong — corrected here):
 *
 *   claim-cortex.mjs       — a factor becomes a CLAIM on the promotion ladder; its
 *                            backtest becomes decaying EVIDENCE. assessClaim scores it.
 *                            gateClaimTransition is THE promotion bridge (identity veto
 *                            + delta gate). opts.nowMs is REQUIRED & fail-closed.
 *   yuri-energy.mjs        — gateProposal reads accept at verdict.result.accept; it
 *                            takes {stateBefore, stateAfter} (NOT {before, after}).
 *                            (We reach the gate THROUGH gateClaimTransition, which
 *                            builds the cortex states and reads .result.accept itself.)
 *   prediction-ledger.mjs  — a factor's forecast (factor → return-effect) is recorded
 *                            and resolved on an ISOLATED ledger file. EVERY call passes
 *                            {file: AFL_LEDGER} so factor forecasts never corrupt the
 *                            DEFAULT ledger (_SYSTEM/state/prediction-ledger.jsonl) that
 *                            yuri-homeostat.mjs reads as YURI's OWN self-model accuracy.
 *   truth-maintenance.mjs  — factor LINEAGE (parent derives child) becomes JTMS
 *                            justifications; retracting a premise factor cascades OUT
 *                            through every factor derived from it.
 *
 * Status mapping (the core trap the design doc missed):
 *   AFL factor.status values are {hypothesis, candidate, validated, deployed, retired, ...}.
 *   claim-cortex's claimedStatus MUST be one of PROMOTION_STATES
 *   (draft/research/fixture_ready/runtime_tested/operator_validated/trusted) — an
 *   UNRECOGNIZED status is treated by rankClaimed() as the MAXIMAL over-claim (top of
 *   ladder) and self-RETRACTs. So we map explicitly, and an unknown AFL status fails
 *   to the lowest hypothesis rung ('research'), never silently to the top.
 *
 * Evidence mapping: a backtest is an executable runtime-grade demonstration of a factor.
 *   The cortex's recognized evidence kinds are {test, runtime_trace, fixture, schema,
 *   report, advisory, operator_note}. A backtest maps to 'runtime_trace' (ceiling =
 *   runtime_tested). The design's {type:'backtest', sharpe} keys are NOT recognized and
 *   self-RETRACT; we emit {kind:'runtime_trace', capturedAt, strength, reference}.
 *
 * Purity: nowMs is injected on every cortex/ledger call (no Date.now in the mapping
 * core) so the smoke test and any future regression are deterministic.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assessClaim,
  cortexSnapshot,
  gateClaimTransition,
  LADDER,
} from '../claim-cortex.mjs';
import {
  recordPrediction,
  recordOutcome,
  scorePrediction,
  calibrationReport,
  readLedger,
} from '../prediction-ledger.mjs';
import {
  createTms,
  assertPremise,
  addJustification,
  retract,
  affectedBy,
} from '../truth-maintenance.mjs';
import { getFactor } from './alpha-factor-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// alpha-factor-library/ -> Scripts/ -> _SYSTEM/ ... ISOLATED ledger lives in _SYSTEM/state/
export const AFL_LEDGER = path.resolve(
  __dirname,
  '..',
  '..',
  'state',
  'afl-prediction-ledger.jsonl',
);

// ---------------------------------------------------------------------------
// Status mapping — AFL factor.status  ->  claim-cortex claimedStatus (a real rung).
// ---------------------------------------------------------------------------
//
// The ladder (LADDER, single-sourced from claim-integrity-gate): draft, research,
// fixture_ready, runtime_tested, operator_validated, trusted. ('deprecated' is the sink.)
//
// An AFL factor climbs: hypothesis (an idea) -> candidate (backtested, under review) ->
// validated (passing recurring backtests) -> deployed (live in a strategy) -> retired.
// We map each to the rung whose EVIDENCE BAR matches what that AFL stage has earned:
//   hypothesis  -> research          (an idea/hypothesis; no executable demonstration required)
//   candidate   -> fixture_ready     (has a backtest fixture but not yet recurring-proven)
//   validated   -> runtime_tested    (recurring backtest runtime demonstration)
//   deployed    -> operator_validated (owner put it live — an operator-grade decision)
//   retired/deprecated -> deprecated  (off the ladder; the JTMS-side retraction handles cascade)
// An UNKNOWN status maps to the lowest hypothesis rung ('research'), NEVER the top —
// the cortex would otherwise self-RETRACT an unrecognized status as a maximal over-claim.
const AFL_STATUS_TO_LADDER = Object.freeze({
  hypothesis: 'research',
  candidate: 'fixture_ready',
  validated: 'runtime_tested',
  deployed: 'operator_validated',
  // sinks / explicit off-ladder
  retired: 'deprecated',
  deprecated: 'deprecated',
});

const UNKNOWN_STATUS_FALLBACK = 'research'; // lowest hypothesis rung — never the top

function mapStatusToLadder(status) {
  const s = typeof status === 'string' ? status.toLowerCase() : '';
  return AFL_STATUS_TO_LADDER[s] ?? UNKNOWN_STATUS_FALLBACK;
}

// A backtest is the executable demonstration of a factor's edge -> runtime_trace
// (ceiling runtime_tested). 'test' or 'runtime_trace' both qualify as EXECUTABLE
// evidence; runtime_trace reads as "a recorded run", the honest framing for a backtest.
const BACKTEST_EVIDENCE_KIND = 'runtime_trace';

// ---------------------------------------------------------------------------
// Backtest -> evidence strength.
// ---------------------------------------------------------------------------
//
// A factor's backtest_results JSON is freeform; we look for a sharpe-like signal and
// squash it into a [0,1] evidence strength. A sharpe of ~2 is excellent (->~1.0), ~0
// is worthless (->~0.0). Logistic squash centered at sharpe=0.5 (a weak-but-real edge),
// scale 1.0. This is the EVIDENCE STRENGTH the cortex decays; it is NOT a claim of truth.
function sharpeToStrength(sharpe) {
  const s = Number(sharpe);
  if (!Number.isFinite(s)) return 0.5; // a present-but-unparseable backtest: neutral, mid strength
  // logistic: 1 / (1 + e^-(s - 0.5))
  return 1 / (1 + Math.exp(-(s - 0.5)));
}

// Pull a sharpe-like number + a capturedAt + a run reference out of a factor's
// backtest_results / sharpe_estimate, tolerating the loose shapes a backtest JSON takes.
function extractBacktest(factor) {
  const br = factor && typeof factor === 'object' ? factor.backtest_results : null;
  let sharpe;
  let capturedAt;
  let reference;
  if (br && typeof br === 'object') {
    sharpe = br.sharpe ?? br.sharpe_ratio ?? br.sharpeRatio;
    capturedAt = br.capturedAt ?? br.ts ?? br.timestamp ?? br.run_at;
    reference = br.reference ?? br.run_id ?? br.runId ?? br.id;
  }
  if (sharpe === undefined && factor && factor.sharpe_estimate != null) {
    sharpe = factor.sharpe_estimate;
  }
  return { sharpe, capturedAt, reference };
}

// ---------------------------------------------------------------------------
// factorToClaim — an AFL factor as a claim-cortex claim.
// ---------------------------------------------------------------------------

/**
 * Map an alpha factor onto a claim-cortex claim object.
 *
 * @param {object} factor  an AFL factor row (id, status, backtest_results, sharpe_estimate, ...)
 * @param {object} opts    { nowMs }  REQUIRED — the injected epoch-ms clock the cortex needs.
 * @returns {object} claim = { id, claimedStatus, contentHash, evidence:[{kind,capturedAt,strength,reference}] }
 *
 * The factor's status -> a REAL claimedStatus rung; its backtest -> a recognized
 * runtime_trace evidence record with a real capturedAt (epoch ms) + decayable strength.
 * A factor with no backtest produces a claim with no evidence (a pure hypothesis), which
 * at the 'research' rung assesses to EXPLORE — never RETRACT.
 */
export function factorToClaim(factor, opts = {}) {
  const nowMs = Number(opts.nowMs);
  const f = factor && typeof factor === 'object' ? factor : {};
  const claimedStatus = mapStatusToLadder(f.status);

  const evidence = [];
  const { sharpe, capturedAt, reference } = extractBacktest(f);
  const hasBacktest = sharpe !== undefined || (f.backtest_results && typeof f.backtest_results === 'object');
  if (hasBacktest) {
    // capturedAt: a valid epoch-ms from the backtest, else "just now" (nowMs) so a
    // freshly-attached backtest is fresh rather than maximally stale. The cortex
    // fail-closes a future/garbage stamp to epoch 0, so a sane fallback is correct.
    const capMs = Number(capturedAt);
    const captured = Number.isFinite(capMs) && capMs > 0 ? capMs : nowMs;
    evidence.push({
      kind: BACKTEST_EVIDENCE_KIND,
      capturedAt: captured,
      strength: sharpeToStrength(sharpe),
      // a stable run reference lets the cortex count distinct recurring backtests
      // toward the trusted recurrence floor; fall back to the factor id + 'backtest'.
      reference: typeof reference === 'string' && reference
        ? reference
        : `${f.id ?? 'factor'}::backtest`,
    });
  }

  return {
    id: f.id ?? null,
    claimedStatus,
    // contentHash binds the claim SUBSTANCE (the factor's formula) so gateClaimTransition's
    // content-swap check can detect a swapped factor body reusing an old id. Statement-only
    // (the formula), NOT the evidence array (which legitimately accrues backtests).
    contentHash: typeof f.formula === 'string' && f.formula ? f.formula : undefined,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// gateFactorTransition — promote/demote a factor through the energy gate.
// ---------------------------------------------------------------------------

/**
 * Gate a factor lifecycle transition (e.g. candidate -> validated) through the cortex's
 * gateClaimTransition — THE promotion bridge. It composes the per-claim identity veto
 * (a factor becoming a new-or-deeper over-claim) with the energy delta gate
 * (gateProposal under the hood, which reads accept at verdict.result.accept).
 *
 * @param {object} factorBefore  the factor BEFORE the transition (its prior status/evidence)
 * @param {object} factorAfter   the factor AFTER  the transition
 * @param {object} opts          { nowMs }  REQUIRED injected clock.
 * @returns {object} { accept:boolean, reason:string, deltaU:number, identityVeto, worsened }
 *
 * accept is a BOOLEAN. A factor promoted to 'validated' (runtime_tested) WITHOUT a
 * backtest is a >=2-rung over-claim -> RETRACT -> identity veto -> accept:false. A
 * promotion whose evidence justifies the new rung passes.
 */
export function gateFactorTransition(factorBefore, factorAfter, opts = {}) {
  const nowMs = Number(opts.nowMs);
  const claimBefore = factorToClaim(factorBefore, { nowMs });
  const claimAfter = factorToClaim(factorAfter, { nowMs });
  // gateClaimTransition builds both cortexSnapshots, OR's the identity veto on top of
  // the energy delta gate, and returns a flat { accept, reason, deltaGate:{deltaU,...} }.
  const gate = gateClaimTransition([claimBefore], [claimAfter], { nowMs });
  return {
    accept: gate.accept === true,
    reason: gate.reason,
    deltaU: gate.deltaGate ? gate.deltaGate.deltaU : undefined,
    identityVeto: gate.identityVeto === true,
    worsened: gate.worsened ?? [],
  };
}

// ---------------------------------------------------------------------------
// Factor forecasts on the ISOLATED ledger (homeostat-corruption guard).
// ---------------------------------------------------------------------------

/**
 * Record a factor's forecast: "this factor will move <target> by <effect> at <confidence>".
 *
 * Maps onto prediction-ledger.recordPrediction with the CORRECT shape — the design's
 * {claim, horizon} keys are silently dropped; the real schema is
 * {subject, change, predictedEffects:[{target, effect, confidence}], source, ts}.
 * EVERY call passes {file: AFL_LEDGER} — never the default (homeostat self-model).
 *
 * @param {object} factor   the AFL factor making the forecast (id used as subject)
 * @param {object} effect   { target, effect, confidence } — the single predicted effect
 * @param {object} opts     { nowMs, id? }  nowMs used as ts; id optional override
 * @returns {object} { ok, row }  the recorded prediction row (row.id is the prediction id)
 */
export function recordFactorSignal(factor, effect = {}, opts = {}) {
  const nowMs = Number(opts.nowMs);
  const f = factor && typeof factor === 'object' ? factor : {};
  const predictedEffects = [
    {
      target: effect.target,
      effect: effect.effect,
      confidence: effect.confidence,
    },
  ];
  return recordPrediction(
    {
      subject: f.id ?? 'factor',
      change: `signal:${f.status ?? 'unknown'}`,
      predictedEffects,
      source: 'afl-organ-adapter',
      ts: nowMs,
      ...(opts.id ? { id: opts.id } : {}),
    },
    { file: AFL_LEDGER }, // ISOLATED ledger — never corrupts the homeostat self-model
  );
}

/**
 * Resolve a recorded factor forecast against observed effects.
 *
 * Maps onto prediction-ledger.recordOutcome with the CORRECT shape — a SCALAR outcome
 * is dropped; the real schema is {predictionId, observedEffects:[{target, effect}], ts}.
 * Passes {file: AFL_LEDGER}.
 *
 * @param {string} predictionId   the prediction row id from recordFactorSignal
 * @param {Array}  observedEffects [{ target, effect }]
 * @param {object} opts            { nowMs }  nowMs used as ts
 * @returns {object} { ok, row }
 */
export function resolveFactorSignal(predictionId, observedEffects = [], opts = {}) {
  const nowMs = Number(opts.nowMs);
  const effects = Array.isArray(observedEffects) ? observedEffects : [];
  return recordOutcome(
    {
      predictionId,
      observedEffects: effects.map((o) => ({ target: o.target, effect: o.effect })),
      ts: nowMs,
    },
    { file: AFL_LEDGER }, // ISOLATED ledger
  );
}

/**
 * Calibration report over the ISOLATED factor ledger only.
 * Reads {file: AFL_LEDGER} — the homeostat's default ledger is never read here.
 * @returns {object} { n, meanBrier, byConfidenceBucket, unresolved }
 */
export function factorCalibration() {
  return calibrationReport({ file: AFL_LEDGER });
}

// ---------------------------------------------------------------------------
// Factor lineage -> JTMS, retraction cascade.
// ---------------------------------------------------------------------------

/**
 * Build a JTMS over a set of factors and their lineage (derivation) edges.
 *
 * Each ROOT factor (one that is not derived from any other in the edge set) is asserted
 * as a PREMISE. Each derived factor gets a justification consequent <- inList:[parent(s)]:
 * a derived factor is IN only while its parent(s) are IN. Retracting a premise factor
 * then cascades OUT through everything derived from it.
 *
 * @param {Array}  factors        [{ id, ... }] — the factor nodes
 * @param {Array}  lineageEdges   [{ parentId, childId, transform? }] — derivation edges
 * @returns {{ tms }} the built TMS (use factorRetractionCascade to query a retraction)
 */
export function buildFactorTms(factors, lineageEdges) {
  const tms = createTms();
  const factorList = Array.isArray(factors) ? factors : [];
  const edges = Array.isArray(lineageEdges) ? lineageEdges : [];

  // A node is "derived" if it appears as a childId in any edge; everything else is a root premise.
  const derived = new Set();
  for (const e of edges) {
    if (e && e.childId != null) derived.add(String(e.childId));
  }

  // Assert every non-derived factor as a premise.
  for (const f of factorList) {
    if (!f || f.id == null) continue;
    const id = String(f.id);
    if (!derived.has(id)) assertPremise(tms, id, 'factor-root');
  }
  // Also assert any parent that is referenced but not in the factor list (a dangling root).
  for (const e of edges) {
    if (!e || e.parentId == null) continue;
    const pid = String(e.parentId);
    if (!derived.has(pid)) assertPremise(tms, pid, 'factor-root');
  }

  // Group child -> [parents] so a child derived from MULTIPLE parents needs all of them IN.
  const parentsOf = new Map();
  for (const e of edges) {
    if (!e || e.childId == null || e.parentId == null) continue;
    const cid = String(e.childId);
    if (!parentsOf.has(cid)) parentsOf.set(cid, []);
    parentsOf.get(cid).push(String(e.parentId));
  }
  for (const [cid, parents] of parentsOf) {
    addJustification(tms, {
      consequent: cid,
      inList: parents,
      informant: 'factor-lineage',
    });
  }

  return { tms };
}

/**
 * Retract a premise factor and return the cascade: which factors got pulled OUT.
 *
 * @param {object} tms        the TMS from buildFactorTms
 * @param {string} premiseId  the factor id to retract
 * @returns {{ retracted:string, affected:string[] }}
 *   affected = every factor whose belief depends (transitively) on the retracted premise.
 */
export function factorRetractionCascade(tms, premiseId) {
  const id = String(premiseId);
  // affectedBy is the static dependency set (everything derived from this premise) —
  // captured BEFORE the retract so we report the full blast radius, not the post-prune graph.
  const affected = [...affectedBy(tms, id)];
  retract(tms, id);
  return { retracted: id, affected };
}

// ---------------------------------------------------------------------------
// CLI / quick self-check (advisory; uses the seeded store + an in-memory clock).
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nowMs = 1_700_000_000_000; // fixed deterministic epoch-ms (~2023-11), in-band
  const f = getFactor('rsi-14') ?? { id: 'rsi-14', status: 'hypothesis', formula: 'x' };
  const claim = factorToClaim(f, { nowMs });
  const a = assessClaim(claim, { nowMs });
  const snap = cortexSnapshot([claim], { nowMs });
  console.log(JSON.stringify({
    AFL_LEDGER,
    factor: { id: f.id, status: f.status },
    claim,
    assessment: { verdict: a.verdict, claimedRank: a.claimedRank, evidenceRank: a.evidenceRank, reason: a.reason },
    snapshotLiveClaims: snap.liveClaims,
    ladder: LADDER,
  }, null, 2));
}
