#!/usr/bin/env node
/**
 * energy-tick core — turns LIVE Claude Code session transitions into real ΔU.
 *
 * The everyday-workflow ΔU source that replaces the retired legacy dispatch
 * surfaces (offload/shintai/codex-final-pass). A PostToolUse hook feeds genuine
 * transitions here; this builds a real before/after control-plane state pair and
 * lets the energy gate measure descent (healthy work) vs ascent (failed
 * verification, protected-path violation). See
 * `_SYSTEM/docs/energy-landscape-integration-audit.md`.
 *
 * Step 1 (observability-first) wires the four highest-signal terms that today
 * never fire from real usage:
 *   iota  — verified-evidence credit on a successful Edit/Write/passing Bash (ΔU↓)
 *   gamma — logLoss calibration: a confidently-wrong (failed) action (ΔU↑)
 *   delta — brierScore calibration sibling of the same signal (ΔU↑)
 *   eta   — protected-path violation, weight 100 → gate REJECTS (ΔU≈100)
 *
 * Staleness (zeta), claim-entropy (alpha), and informationGain (epsilon) land in
 * Step 1b. Pure functions here; the hook wrapper does stdin + snapshot I/O.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceGateEvaluation } from './math/yuri-energy-trace.mjs';
import { gateProposal, DEFAULT_WEIGHTS, DEFAULT_MAX_LADDER_INVERSION_CAP } from './math/yuri-energy.mjs';
import { loadEnergyConfig } from './math/yuri-energy-config.mjs';
import { currentUserHandle } from './yuri-user.mjs';
import { freshLedger, applyClaimTransition, claimGateFields } from './claim-ledger.mjs';
import { cusum, scalarKalman } from './math/math-kernel.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(_HERE, '..', '..');

// Bound the rolling arrays so a long session never grows the snapshot unbounded.
const CAP = 50;

// Protected-path patterns — mirror yuri-origin.md "Protected Surfaces".
export const PROTECTED_PATTERNS = [
  /(^|\/)\.env$/,
  /(^|\/)backend\/data\//,
  /(^|\/)\.claude\/(state|history|file-history)\//,
  /(^|\/)\.claude\/projects\/[^/]+\/(history|state|file-history|worktrees|transcripts)\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.amp\//,
];

export function isProtectedPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  return PROTECTED_PATTERNS.some((re) => re.test(filePath));
}

const MUTATING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Extract the genuine transition from a Claude Code hook event payload. */
export function classifyTransition(event) {
  const e = event && typeof event === 'object' ? event : {};
  const tool = typeof e.tool_name === 'string' ? e.tool_name : '';
  const ti = e.tool_input && typeof e.tool_input === 'object' ? e.tool_input : {};
  const filePath = (typeof ti.file_path === 'string' && ti.file_path)
    || (typeof ti.path === 'string' && ti.path) || '';
  const isError = !!(e.tool_response && typeof e.tool_response === 'object' && e.tool_response.is_error);
  const isMutating = MUTATING_TOOLS.has(tool);
  const isBash = tool === 'Bash';
  return {
    tool,
    filePath,
    success: !isError,
    isMutating,
    isBash,
    protectedHit: isMutating && isProtectedPath(filePath),
  };
}

/**
 * Salience tiers — the front door that answers "do we need mathematical clarity
 * and determinism for THIS transition?" BEFORE any energy math runs. The gate
 * fires only on WORK + CRITICAL; SKIP transitions (reads, navigation, trivial
 * ops) produce no state change and no trace — keeping the ΔU stream signal-dense
 * and cheap instead of one tick per keystroke.
 *
 * This is the deterministic floor. A richer semantic layer (classify the stakes
 * of a transition, or drive the decision from the formula-bank selectionGuidance
 * useWhen rules) layers ON TOP of these tiers without replacing them.
 */
export const TIER = Object.freeze({ SKIP: 0, WORK: 1, CRITICAL: 2 });

export function salience(transition) {
  const t = transition && typeof transition === 'object' ? transition : {};
  // CRITICAL — the truth moments where determinism matters most.
  if (t.protectedHit) return TIER.CRITICAL;            // protected-path violation
  if (t.isBash && t.success === false) return TIER.CRITICAL;     // failed verification
  if (t.isMutating && t.success === false) return TIER.CRITICAL; // failed edit on claimed work
  // WORK — genuine progress worth measuring.
  if (t.isMutating && t.success) return TIER.WORK;     // a real edit landed
  if (t.isBash && t.success) return TIER.WORK;         // a command / test passed
  // SKIP — reads, navigation, lookups: no state change, no math.
  return TIER.SKIP;
}

/** True when a transition warrants firing the energy gate. */
export function shouldGate(transition) {
  return salience(transition) !== TIER.SKIP;
}

// ---------------------------------------------------------------------------
// Layer C — depth-gated |ΔU| surprise trigger (owner refinement 2026-05-30).
//
// The deep mathematical evaluation (Steps 2+3: formula-bank selectionGuidance
// picker + stranded equations) should fire ONLY when a work thread is deep
// enough that determinism matters AND something surprising happened. Below that,
// Layers A+B (boundary + deterministic tiers) carry the load.
//
// Defaults are STANDARDS, not law — tunable via the cockpit/config. See
// _SYSTEM/docs/icm-mwp-energy-governance-and-firing-policy.md §3.
// ---------------------------------------------------------------------------

export const DEFAULT_SALIENCE = Object.freeze({
  depthThreshold: 6,   // meaningful transitions before the surprise tier can engage
  surpriseK: 2.0,      // |ΔU| must exceed median + K·MAD of the recent band
  surpriseWindow: 20,  // how many recent |ΔU| samples define the band
});

function median(xs) {
  // Boundary pre-filter (registry axis 9): a NaN in the |ΔU| window silently
  // poisoned the sort comparator and the surprise band. Empty→0 fail-safe
  // semantics deliberately differ from the kernel's throw (hook path).
  const finite = xs.filter(Number.isFinite);
  if (!finite.length) return 0;
  const s = [...finite].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Robust, scale-free spread (median absolute deviation) — no fixed ΔU number.
function mad(xs, med) {
  if (!xs.length) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

/** True iff |ΔU| stands out from the recent band (median + K·MAD). Needs a baseline. */
export function isSurprise(absDeltaU, recentAbs, cfg = DEFAULT_SALIENCE) {
  if (!Array.isArray(recentAbs) || recentAbs.length < 3) return false; // no band yet
  const med = median(recentAbs);
  const spread = mad(recentAbs, med) || med || 1; // guard a zero-spread (all-equal) band
  return absDeltaU >= med + cfg.surpriseK * spread;
}

/** Layer C decision: fire the deep evaluation iff deep enough AND surprising. */
export function surpriseEngaged({ depth, deltaU, recentAbs, cfg = DEFAULT_SALIENCE } = {}) {
  if (!Number.isFinite(depth) || depth < cfg.depthThreshold) return false;
  return isSurprise(Math.abs(Number(deltaU) || 0), recentAbs, cfg);
}

// ---------------------------------------------------------------------------
// ADVISORY SHADOW DETECTORS (ENG-04 Kalman/NIS · ENG-05 CUSUM) — COMPUTED, NOT
// WIRED. These run a Kalman-recovery surprise band (card 1) and an upper CUSUM
// slow-rot regime alarm (card 2) over the recent ΔU stream as SHADOW metrics.
//
// Hard safety contract: NOTHING here feeds the live verdict. The live
// surpriseEngaged / deepEngaged decision still keys ONLY on isSurprise(MAD) and the
// CRITICAL tier. These functions are emitted as additive return fields and exist so
// the energy-landscape study can compare the shadow band to MAD on a real trace and
// the eventual swap (owner-gated) is proven on equivalence first. Both fail-safe:
// any throw or short stream → an inert {available:false} readout, never an alarm.
//
// Scale-free dials (no fixed ΔU number — honoring the discipline): k=kFactor·MAD,
// h=hFactor·MAD over the |ΔU| band already tracked, so the alarm threshold rides the
// observed spread instead of a magic constant.
// ---------------------------------------------------------------------------

export const SHADOW_TREND = Object.freeze({
  minSamples: 4,   // need a baseline before a Kalman/CUSUM readout is meaningful
  kFactor: 0.5,    // CUSUM slack as a fraction of MAD
  hFactor: 5,      // CUSUM alarm threshold as a multiple of MAD
  qFactor: 0.3,    // Kalman process noise (re-sensitization speed) as a fraction of MAD
});

/**
 * Pure: a Kalman-recovery surprise band + an upper CUSUM regime alarm over a SIGNED
 * ΔU stream. Returns numeric/boolean-only fields (privacy-gate clean if ever traced).
 * ENG-04 (Kalman) reads |ΔU| innovations for the high-tail NIS gate; ENG-05 (CUSUM)
 * integrates the SIGNED stream to catch slow directional rot the MAD shock-band is
 * blind to. Advisory: NEVER consumed by the gate.
 */
export function shadowTrendReadout(signedStream, cfg = SHADOW_TREND) {
  const flat = {
    available: false,
    cusumAlarm: false, cusumChangeIndex: -1, cusumStatistic: 0, cusumPeak: 0,
    kalmanEstimate: 0, kalmanSurprisedCount: 0, kalmanLastSurprised: false,
    samples: 0,
  };
  try {
    const stream = (Array.isArray(signedStream) ? signedStream : []).filter((x) => Number.isFinite(x));
    const minSamples = Number.isFinite(cfg.minSamples) && cfg.minSamples > 0 ? cfg.minSamples : 4;
    if (stream.length < minSamples) return flat;
    const mu0 = median(stream);
    // Scale-free dial sourced from the SIGNED stream's spread; guard a zero-spread
    // (constant) stream so cusum's h>0 contract is never violated.
    const scale = mad(stream, mu0) || median(stream.map((x) => Math.abs(x))) || 0;
    if (!(scale > 0)) {
      return { ...flat, available: true, samples: stream.length };
    }
    const k = (Number.isFinite(cfg.kFactor) ? cfg.kFactor : 0.5) * scale;
    const h = (Number.isFinite(cfg.hFactor) ? cfg.hFactor : 5) * scale;
    const c = cusum(stream, { k, h, mu0 });
    // Kalman recovery readout over the SAME signed stream (q drives re-sensitization
    // within ~2 ticks where MAD stays numb ~10 after a CRITICAL spike).
    const ka = scalarKalman(stream, {
      q: (Number.isFinite(cfg.qFactor) ? cfg.qFactor : 0.3) * scale,
      r: Math.max(scale, 1e-9),
    });
    const lastSurprise = ka.surprises.length ? ka.surprises[ka.surprises.length - 1] : null;
    return {
      available: true,
      cusumAlarm: c.alarm === true,
      cusumChangeIndex: c.changeIndex,
      cusumStatistic: c.statistic,
      cusumPeak: c.peak,
      kalmanEstimate: ka.estimate,
      kalmanSurprisedCount: ka.surprisedCount,
      kalmanLastSurprised: lastSurprise ? lastSurprise.surprised === true : false,
      samples: stream.length,
    };
  } catch {
    return flat;
  }
}

export function freshState() {
  return {
    verifiedEvidenceCount: 0,
    evidence: [],
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
    maxLadderInversion: 0,
    predictions: [],
    outcomes: [],
  };
}

function capped(arr) { return arr.length > CAP ? arr.slice(arr.length - CAP) : arr; }

/**
 * Pure: apply a classified transition to the prior state, returning the next
 * state. Never mutates the input.
 */
export function applyTransition(prev, t, nowIso = '') {
  const base = (prev && typeof prev === 'object') ? prev : freshState();
  const s = {
    verifiedEvidenceCount: Number(base.verifiedEvidenceCount) || 0,
    // Deep-copy each evidence record, not just the array (.slice() shared element refs, so a
    // downstream mutation of a record could reach back into `prev` — breaking the "never mutates
    // the input" contract). Records are flat {base,age,capturedAt}, so a shallow spread suffices.
    evidence: Array.isArray(base.evidence) ? base.evidence.map((e) => (e && typeof e === 'object' ? { ...e } : e)) : [],
    protectedPathViolations: base.protectedPathViolations ?? 0,
    promotionLadderInversions: base.promotionLadderInversions ?? 0,
    maxLadderInversion: base.maxLadderInversion ?? 0,
    predictions: Array.isArray(base.predictions) ? base.predictions.slice() : [],
    outcomes: Array.isArray(base.outcomes) ? base.outcomes.slice() : [],
  };
  // Only meaningful work (a mutating edit or a Bash command) moves the gate.
  const meaningful = t.isMutating || t.isBash;
  if (t.protectedHit) {
    // A protected-path write is a violation, not progress → catastrophic eta=100
    // term only (no evidence credit). The gate rejects.
    const current = Number(s.protectedPathViolations);
    s.protectedPathViolations = (Number.isFinite(current) && current >= 0 ? current : 0) + 1;
  } else if (meaningful && t.success) {
    // Healthy progress → verified-evidence credit (ΔU↓). No calibration penalty:
    // logLoss/brier of a confident-correct claim is small but nonzero and would
    // otherwise drown the credit — so a correct claim is simply not penalized.
    s.verifiedEvidenceCount += 1;
    s.evidence = capped([...s.evidence, { base: 1.0, age: 0, capturedAt: String(nowIso) }]);
  } else if (meaningful && !t.success) {
    // Confidently-wrong: the action implicitly claimed success (p=0.9) and failed
    // (outcome 0) → logLoss (gamma) + brier (delta) raise U (ΔU↑).
    s.predictions = capped([...s.predictions, 0.9]);
    s.outcomes = capped([...s.outcomes, 0]);
  }
  return s;
}

/** Map a snapshot to the shape computeU consumes. forecasts/results are NOT
 * aliased from predictions/outcomes anymore: the alias double-counted λ per
 * malformed entry (100 instead of 50) and lit the δ(brier) term with the same
 * data γ(logLoss) already reads — observability theater. δ goes honestly dark
 * until a real forecast source populates those fields. */
export function toGateState(s) {
  const v = (s && typeof s === 'object') ? s : freshState();
  return {
    verifiedEvidenceCount: Number(v.verifiedEvidenceCount) || 0,
    evidence: Array.isArray(v.evidence) ? v.evidence : [],
    protectedPathViolations: v.protectedPathViolations ?? 0,
    promotionLadderInversions: v.promotionLadderInversions ?? 0,
    maxLadderInversion: v.maxLadderInversion ?? 0,
    predictions: Array.isArray(v.predictions) ? v.predictions : [],
    outcomes: Array.isArray(v.outcomes) ? v.outcomes : [],
  };
}

/** Pure gate read on a transition — returns {deltaU, accept, dominantTerm, nextState}.
 * TEST-ONLY surface: calls gateProposal with API defaults (cap Infinity, no claim
 * fields, no tuned weights) — it is NOT the live gate; the live book is
 * tickAndTrace's single traced evaluation. */
export function evaluateTransition(prevState, event, nowIso = '') {
  const t = classifyTransition(event);
  const nextState = applyTransition(prevState, t, nowIso);
  const gate = gateProposal({ stateBefore: toGateState(prevState), stateAfter: toGateState(nextState) });
  return {
    transition: t,
    nextState,
    deltaU: gate.result.deltaU,
    accept: gate.result.accept,
    dominantTerm: gate.result.dominantTerm,
  };
}

/**
 * Side-effecting: evaluate a transition AND append a real-ΔU trace record
 * (regime='action', lane='session', user-attributed). Returns nextState.
 * Caller persists nextState. Error-isolated by the hook wrapper.
 */
export function tickAndTrace(prevState, event, opts = {}) {
  const nowIso = opts.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso) || 0;
  // Claim ledger — the LIVE BRIDGE that finally gives the claim-cortex a consumer and
  // lights the starved dark terms (α/β/ε) on real work. Carried across ticks via the
  // snapshot. claimGateFields omits promotionLadderInversions/protectedPathViolations
  // (cannot fire the structural-floor or protected-path vetoes) but DOES carry
  // maxLadderInversion — under the armed L∞ cap that IS a veto path, deliberately.
  // Since the breaker verdict derives from this same traced evaluation, the claim
  // axis reaches the deny layer too. Read failures are bounded-fail-open: a distinct
  // FAILED sentinel feeds a consecutive-failure counter that trips gateErrorVeto at 3.
  const ledger = (opts.ledger && Array.isArray(opts.ledger.claims)) ? opts.ledger : freshLedger();
  // Live config: a value tuned in the cockpit and persisted to energy-weights.json
  // steers the real gate here. Absent/invalid → standards (fail-safe).
  const fileCfg = loadEnergyConfig(opts.configFile);
  const cfg = { ...DEFAULT_SALIENCE, ...(opts.salience || {}), ...(fileCfg.salience || {}) };
  const weights = { ...DEFAULT_WEIGHTS, ...(fileCfg.weights || {}) };
  const threshold = Number.isFinite(fileCfg.threshold) ? fileCfg.threshold : 0;
  const t = classifyTransition(event);
  const tier = salience(t);
  // Salience front door: SKIP transitions never reach the math — no trace, no
  // state/depth change. Keeps the ΔU stream dense, no tick per keystroke.
  if (tier === TIER.SKIP) {
    // SKIP = reads/navigation: no claim authored, ledger passes through unchanged.
    // recentSigned + shadowTrend are ADVISORY passthroughs (ENG-04/05) — inert here.
    // claimFieldFailures passes through unchanged: a SKIP tick reads no claims, so
    // it must neither reset nor extend the bounded fail-open window.
    return {
      state: prevState, tier, traced: false, depth: opts.depth ?? 0,
      recentAbs: opts.recentAbs ?? [], surpriseEngaged: false, deepEngaged: false, ledger,
      recentSigned: Array.isArray(opts.recentSigned) ? opts.recentSigned : [],
      shadowTrend: shadowTrendReadout(Array.isArray(opts.recentSigned) ? opts.recentSigned : []),
      verdict: null,
      claimFieldFailures: Number(opts.claimFieldFailures) || 0,
    };
  }
  const nextState = applyTransition(prevState, t, nowIso);
  // Fail-OPEN on the ledger axis too (not just claimGateFields). A throw from the claim
  // bridge must NEVER drop the persist/trace/breaker for the rest of the session (wire
  // red-team: a poisoned snapshot ledger wedged observability). On any fault, carry the
  // prior ledger forward and keep ticking. (Deliberately NOT counted by the
  // claimFieldFailures counter: the old ledger stays readable, so the floor stays armed.)
  let nextLedger;
  try { nextLedger = applyClaimTransition(ledger, t, nowMs); } catch { nextLedger = ledger; }
  // ζ staleness (flag-gated, owner decision D6): when energy-weights.json carries
  // staleness.halfLifeDays, hydrate evidence AT READ TIME — age from capturedAt vs
  // nowMs, halfLife from config. The persisted snapshot keeps {base, age:0,
  // capturedAt} untouched. Absent flag → byte-identical prior behavior (ζ skipped).
  // HONESTY: both states hydrate at the SAME nowMs, so records common to
  // before/after contribute EQUAL staleness — ζ lights U levels + trace component
  // contributions but is ΔU-NEUTRAL for shared records; ΔU moves only when the
  // CAP slice drops an old record.
  const zHL = (fileCfg.staleness && Number.isFinite(fileCfg.staleness.halfLifeDays))
    ? fileCfg.staleness.halfLifeDays : null;
  const gateState = (s) => (zHL === null
    ? toGateState(s)
    : { ...toGateState(s), evidence: hydrateEvidence(s && s.evidence, nowMs, zHL) });
  // Bounded fail-open (claim axis): read claim fields ONCE per ledger; a FAILED
  // sentinel (distinct from legit-empty {}) increments the consecutive counter,
  // any clean read resets it.
  const cgfB = claimGateFields(ledger, nowMs);
  const cgfA = claimGateFields(nextLedger, nowMs);
  const claimReadFailed = cgfB.claimGateFieldsFailed === true || cgfA.claimGateFieldsFailed === true;
  const claimFieldFailures = claimReadFailed ? (Number(opts.claimFieldFailures) || 0) + 1 : 0;
  const clean = (f) => (f && f.claimGateFieldsFailed === true ? {} : f);
  const { record, gateResult } = traceGateEvaluation({
    lane: 'session',
    runId: String(opts.runId || `session-${nowIso}`),
    user: opts.user || currentUserHandle(),
    regime: 'action', // everyday-workflow ΔU is always a real, distinct before/after
    // Tool-event terms (iota/gamma/eta) PLUS the cortex's claim-distribution terms
    // (alpha entropy / beta KL / epsilon infoGain) from the live ledger. The claim
    // spread carries no `evidence` key (claim-ledger omits it), so it can never
    // clobber the ζ hydration above — load-bearing for the spread order.
    stateBefore: { ...gateState(prevState), ...clean(cgfB) },
    stateAfter: { ...gateState(nextState), ...clean(cgfA) },
    weights,
    threshold,
    maxLadderInversionCap: DEFAULT_MAX_LADDER_INVERSION_CAP,
    traceOptions: opts.traceOptions || {},
  });
  // ONE BOOK: the breaker verdict derives from the SAME gateResult that produced
  // the trace — claim fields, tuned weights, threshold, and cap included. The
  // claim-blind second evaluation (verdictFromStates on raw states) is dead on the
  // live path. gateErrorVeto here covers the bounded claim-read fail-open only;
  // a traceGateEvaluation throw still kills the tick before any breaker write
  // (fail-closed by absence).
  const g = (gateResult && gateResult.result) ? gateResult.result : {};
  const verdict = {
    accept: g.accept === true,
    protectedPathVeto: g.protectedPathVeto === true,
    structuralFloorVeto: g.structuralFloorVeto === true,
    maxSeverityVeto: g.maxSeverityVeto === true,
    gateErrorVeto: false,
    deltaU: Number.isFinite(g.deltaU) ? g.deltaU : 0,
    dominantTerm: g.dominantTerm || null,
  };
  if (claimFieldFailures >= 3) {
    verdict.gateErrorVeto = true;
    verdict.accept = false;
    verdict.reason = 'claim-ledger unreadable for 3 consecutive ticks — epistemic sensor down, fail-closed';
  }
  // Layer C: depth-gated |ΔU| surprise. Judge THIS ΔU against the band BEFORE
  // adding it; then advance depth and roll the band forward.
  const deltaU = (record && Number.isFinite(record.deltaU)) ? record.deltaU : 0;
  const priorRecent = Array.isArray(opts.recentAbs) ? opts.recentAbs : [];
  const depth = (Number.isFinite(opts.depth) ? opts.depth : 0) + 1;
  // Surprise is judged against the WORK band; see below for why CRITICAL is excluded.
  const surprised = surpriseEngaged({ depth, deltaU, recentAbs: priorRecent, cfg });
  // Fire the deep evaluation when the moment inherently demands determinism
  // (CRITICAL — violation/failure) OR when a WORK transition is deep-and-surprising.
  const deepEngaged = tier === TIER.CRITICAL || (tier === TIER.WORK && surprised);
  // Only WORK |ΔU| feeds the surprise band. CRITICAL is force-kept anyway, and its
  // huge |ΔU| (e.g. protected-path eta=100) would desensitize the band for the
  // WORK transitions the surprise tier exists to catch (tuning insight, live data).
  const recentAbs = tier === TIER.WORK
    ? [...priorRecent, Math.abs(deltaU)].slice(-cfg.surpriseWindow)
    : priorRecent;
  // ADVISORY ONLY (ENG-04/05): a SIGNED ΔU window feeds the shadow Kalman/CUSUM
  // detectors. Unlike recentAbs (WORK-only, by design — see above), the signed window
  // includes ALL gated transitions: CUSUM slow-rot and Kalman recovery are exactly the
  // detectors that must see the CRITICAL spikes the MAD band deliberately excludes.
  // Judged against the PRIOR window (same discipline as MAD), then rolled forward.
  const priorSigned = Array.isArray(opts.recentSigned) ? opts.recentSigned : [];
  const shadowTrend = shadowTrendReadout(priorSigned);
  const recentSigned = [...priorSigned, deltaU].slice(-cfg.surpriseWindow);
  return {
    state: nextState, tier, traced: true, deltaU, depth, recentAbs,
    surpriseEngaged: surprised, deepEngaged, ledger: nextLedger,
    recentSigned, shadowTrend, verdict, claimFieldFailures,
  };
}

const MS_PER_DAY = 86400000;
/** ζ hydration (read-time only): age from capturedAt vs nowMs, halfLife from config. */
function hydrateEvidence(evidence, nowMs, halfLifeDays) {
  return (Array.isArray(evidence) ? evidence : []).map((e) => {
    const t = Date.parse((e && e.capturedAt) || '');
    const age = Number.isFinite(t) ? Math.max(0, (nowMs - t) / MS_PER_DAY) : 0;
    return { base: Number.isFinite(e && e.base) ? e.base : 1.0, age, halfLife: halfLifeDays };
  });
}
