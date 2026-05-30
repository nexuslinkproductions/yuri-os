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
import { gateProposal } from './math/yuri-energy.mjs';
import { currentUserHandle } from './yuri-user.mjs';

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
    evidence: Array.isArray(base.evidence) ? base.evidence.slice() : [],
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
  const t = classifyTransition(event);
  // Salience front door: SKIP transitions never reach the math — no trace, no
  // state change. Keeps the ΔU stream dense and avoids one tick per keystroke.
  if (salience(t) === TIER.SKIP) return { state: prevState, tier: TIER.SKIP, traced: false };
  const nextState = applyTransition(prevState, t, nowIso);
  traceGateEvaluation({
    lane: 'session',
    runId: String(opts.runId || `session-${nowIso}`),
    user: opts.user || currentUserHandle(),
    regime: 'action', // everyday-workflow ΔU is always a real, distinct before/after
    stateBefore: toGateState(prevState),
    stateAfter: toGateState(nextState),
    traceOptions: opts.traceOptions || {},
  });
  return { state: nextState, tier: salience(t), traced: true };
}
