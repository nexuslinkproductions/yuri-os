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
import { gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { loadEnergyConfig } from './math/yuri-energy-config.mjs';
import { currentUserHandle } from './yuri-user.mjs';
import { freshLedger, applyClaimTransition, claimGateFields } from './claim-ledger.mjs';

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
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
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

export function freshState() {
  return {
    verifiedEvidenceCount: 0,
    evidence: [],
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
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
    protectedPathViolations: Number(base.protectedPathViolations) || 0,
    promotionLadderInversions: Number(base.promotionLadderInversions) || 0,
    predictions: Array.isArray(base.predictions) ? base.predictions.slice() : [],
    outcomes: Array.isArray(base.outcomes) ? base.outcomes.slice() : [],
  };
  // Only meaningful work (a mutating edit or a Bash command) moves the gate.
  const meaningful = t.isMutating || t.isBash;
  if (t.protectedHit) {
    // A protected-path write is a violation, not progress → catastrophic eta=100
    // term only (no evidence credit). The gate rejects.
    s.protectedPathViolations += 1;
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

/** Map a snapshot to the shape computeU consumes (brier mirrors the calibration signal). */
export function toGateState(s) {
  const v = (s && typeof s === 'object') ? s : freshState();
  return {
    verifiedEvidenceCount: Number(v.verifiedEvidenceCount) || 0,
    evidence: Array.isArray(v.evidence) ? v.evidence : [],
    protectedPathViolations: Number(v.protectedPathViolations) || 0,
    promotionLadderInversions: Number(v.promotionLadderInversions) || 0,
    predictions: Array.isArray(v.predictions) ? v.predictions : [],
    outcomes: Array.isArray(v.outcomes) ? v.outcomes : [],
    forecasts: Array.isArray(v.predictions) ? v.predictions : [],
    results: Array.isArray(v.outcomes) ? v.outcomes : [],
  };
}

/** Pure gate read on a transition — returns {deltaU, accept, dominantTerm, nextState}. */
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
  // lights the 4 starved dark terms (α/β/ε) on real work. Carried across ticks via the
  // snapshot. claimGateFields is fail-open (errors → no claim fields → tool-event-only
  // state, current behavior) and OMITS the veto fields, so it can raise U but can never
  // introduce a protected-path / structural-floor veto. The breaker keys on the raw state.
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
    return { state: prevState, tier, traced: false, depth: opts.depth ?? 0, recentAbs: opts.recentAbs ?? [], surpriseEngaged: false, deepEngaged: false, ledger };
  }
  const nextState = applyTransition(prevState, t, nowIso);
  // Fail-OPEN on the ledger axis too (not just claimGateFields). A throw from the claim
  // bridge must NEVER drop the persist/trace/breaker for the rest of the session (wire
  // red-team: a poisoned snapshot ledger wedged observability). On any fault, carry the
  // prior ledger forward and keep ticking.
  let nextLedger;
  try { nextLedger = applyClaimTransition(ledger, t, nowMs); } catch { nextLedger = ledger; }
  const { record } = traceGateEvaluation({
    lane: 'session',
    runId: String(opts.runId || `session-${nowIso}`),
    user: opts.user || currentUserHandle(),
    regime: 'action', // everyday-workflow ΔU is always a real, distinct before/after
    // Tool-event terms (iota/gamma/delta/eta) PLUS the cortex's claim-distribution terms
    // (alpha entropy / beta KL / epsilon infoGain) from the live ledger — the missing wire.
    stateBefore: { ...toGateState(prevState), ...claimGateFields(ledger, nowMs) },
    stateAfter: { ...toGateState(nextState), ...claimGateFields(nextLedger, nowMs) },
    weights,
    threshold,
    traceOptions: opts.traceOptions || {},
  });
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
  return { state: nextState, tier, traced: true, deltaU, depth, recentAbs, surpriseEngaged: surprised, deepEngaged, ledger: nextLedger };
}
