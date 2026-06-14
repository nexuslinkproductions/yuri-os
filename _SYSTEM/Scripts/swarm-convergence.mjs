#!/usr/bin/env node
// @capability: swarm-convergence
// @serves: swarm convergence | when is the swarm done | stop the nano-swarm loop | convergence gate | loop-until-converged | swarm damping | recursive swarm governor | did the fan-out finish | obligation floor | adversarial done-check
// @does: the 3-layer convergence GATE + damping for YURI nano-swarm round loops — transferred from irys-stateful-swarms (the GATE, not their LLM-as-controller; wraps YURI's native fan-out). Layer 1: deterministic obligation-ledger floor (every decomposition leaf has a conforming RESULT_LABEL via contract-conformance, passTypeNorm in {X,P}, non-empty). Layer 2: deterministic critical-signal block (any unresolved CRITICAL signal — e.g. a canonical-store contested claim). Layer 3: adversarial peer pass ("swarm says done — find what's missing: verification/edge-case/test/integration"), gaps re-injected as next-round work. Damping (circuit breaker): marginal-value cutoff + budget governor force-stop a blocked-but-not-progressing loop; seen-finding dedup + action cooldown stop oscillation. DISARMED by default (passthrough converged:true) until YURI_SWARM_CONVERGENCE=1.
// @use: const ledger = buildObligationLedger(decomposition) once; each round call converge({ledger, poolOutputs, signals, adversarialResult, damping, round}); if !converged dispatch nextRoundWork and loop. This is the GOVERNOR a recursive spawn_nano tool needs — depth/cost/oscillation bounds. Adversarial pass runs via runAdversarialPass({runner}) (runner injectable; default would dispatch a non-work peer lane via nano-external).
// @exports: buildObligationLedger, checkObligationFloor, checkCriticalSignalBlock, runAdversarialPass, checkDamping, dedupeWork, converge, isArmed, hashFinding, ADVERSARIAL_PROMPT, CONVERGENCE_STATE_DIR, ARM_ENV
//
// Authority: ADVISORY gate. Converge verdicts never mutate source/commits/protected surfaces — a pure
// decision + ephemeral per-run damping state. DISARMED-default + reversible (delete this file + its test).
// Provenance: 02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/04-MOVE1-PLAN.md (4-lane converged).

import crypto from 'node:crypto';
import { parseResultLabel } from './contract-conformance.mjs';

export const CONVERGENCE_STATE_DIR = '_SYSTEM/state/swarm-convergence'; // ephemeral per-run damping state
export const ARM_ENV = 'YURI_SWARM_CONVERGENCE';

/** Armed only when the env flag is set. DISARMED → converge() is a passthrough that never blocks a run. */
export function isArmed() { return process.env[ARM_ENV] === '1'; }

/** Stable short hash of a finding/gap string — dedup key so the same gap isn't re-chased every round. */
export function hashFinding(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex').slice(0, 16);
}

/**
 * Layer 1 input. Build the obligation ledger from a decomposition.
 * Accepts {leaves:[{id,role,expectedOutputType}]} OR {nodes:[{id,...}], edges:[{from,to}]}
 * (leaves = DAG nodes with no outgoing edge). The ledger is a HYPOTHESIS, not ground truth —
 * open-ended work can spawn scope the decomposition never anticipated (honest meta-break).
 */
export function buildObligationLedger(decomposition = {}) {
  let leafTasks = [];
  if (Array.isArray(decomposition.leaves)) {
    leafTasks = decomposition.leaves.map((l) => ({
      id: l.id, role: l.role ?? l.id, expectedOutputType: l.expectedOutputType ?? 'any',
    }));
  } else if (Array.isArray(decomposition.nodes)) {
    const hasOutgoing = new Set((decomposition.edges || []).map((e) => e.from));
    leafTasks = decomposition.nodes
      .filter((n) => !hasOutgoing.has(n.id))
      .map((n) => ({ id: n.id, role: n.role ?? n.id, expectedOutputType: n.expectedOutputType ?? 'any' }));
  }
  return { leafTasks, leafCount: leafTasks.length };
}

/** A pool output is a conforming PASS iff it has non-empty text AND a parseable RESULT_LABEL with passTypeNorm in {X,P}. */
function isConformingPass(output) {
  if (!output) return false;
  const text = String(output.text ?? output.output ?? '').trim();
  if (text.length === 0) return false;
  const p = parseResultLabel(output.label ?? '');
  if (!p || !p.ok) return false;
  return p.passTypeNorm === 'X' || p.passTypeNorm === 'P';
}

/** Layer 1: deterministic obligation-ledger floor. poolOutputs = { [leafId]: { label, text } }. */
export function checkObligationFloor(ledger = { leafTasks: [] }, poolOutputs = {}) {
  const missing = [];
  const nonConforming = [];
  for (const leaf of ledger.leafTasks || []) {
    const out = poolOutputs[leaf.id];
    if (out == null) { missing.push(leaf.id); continue; }
    if (!isConformingPass(out)) nonConforming.push(leaf.id);
  }
  return { ok: missing.length === 0 && nonConforming.length === 0, missing, nonConforming };
}

/** Layer 2: deterministic critical-signal block. signals = [{id|hash, severity, resolved}]. */
export function checkCriticalSignalBlock(signals = []) {
  const blockers = (signals || [])
    .filter((s) => s && !s.resolved && String(s.severity).toUpperCase() === 'CRITICAL')
    .map((s) => s.id ?? s.hash ?? 'critical-signal');
  return { blocked: blockers.length > 0, blockers };
}

export const ADVERSARIAL_PROMPT = 'The swarm reports its work COMPLETE. Find what is MISSING: verification gaps, untested edge cases, integration breaks, incomplete evidence. Return only gaps that are material AND specific AND actionable.';

/**
 * Layer 3: adversarial peer pass. `runner` is injectable (default production runner dispatches a
 * non-work peer lane via nano-external; tests inject a fake). Fail-soft: a runner error never blocks
 * (returns ok:true) — the gate must not become a single point of failure on an LLM call.
 * Only material∧specific∧actionable gaps (r.actionable===true && r.gap) count.
 */
export async function runAdversarialPass({ poolOutputs = {}, lanes = [], runner, opts = {} } = {}) {
  if (typeof runner !== 'function') return { ok: true, rejections: [], skipped: 'no-runner' };
  let raw;
  try { raw = await runner({ prompt: ADVERSARIAL_PROMPT, poolOutputs, lanes, opts }); }
  catch (e) { return { ok: true, rejections: [], failSoft: true, error: String(e?.message || e).slice(0, 200) }; }
  const rejections = (Array.isArray(raw?.rejections) ? raw.rejections : [])
    .filter((r) => r && r.actionable === true && r.gap)
    .map((r) => ({ leafId: r.leafId ?? null, gap: String(r.gap), actionable: true }));
  return { ok: rejections.length === 0, rejections };
}

/**
 * Damping circuit breaker — the STOP decision when the loop is blocked. Forces termination on
 * marginal-value cutoff (last K round-yields all below threshold) or budget exhaustion, so a
 * blocked-but-not-progressing loop can't oscillate forever. Pure: state in, decision + state out.
 */
export function checkDamping(state = {}, opts = {}) {
  const yields = Array.isArray(state.roundYields) ? state.roundYields : [];
  const window = opts.marginalWindow ?? 2;
  const threshold = opts.marginalThreshold ?? 1;
  const budgetCap = opts.budgetCap ?? Infinity;
  const budgetUsed = state.budgetUsed ?? 0;
  if (budgetUsed >= budgetCap) return { continue: false, reason: 'budget-exhausted', updatedState: state };
  if (yields.length >= window && yields.slice(-window).every((y) => y < threshold)) {
    return { continue: false, reason: 'marginal-value-cutoff', updatedState: state };
  }
  return { continue: true, reason: 'progressing', updatedState: state };
}

/**
 * Dedup next-round work: drop gaps already seen and actions still under cooldown, so the swarm doesn't
 * re-chase the same finding round after round (the find-gap→fill→re-find oscillation). Updates state.
 */
export function dedupeWork(work = [], state = {}, round = 0, opts = {}) {
  const seen = new Set(state.seenFindingHashes || []);
  const cooldown = { ...(state.actionCooldown || {}) };
  const coolRounds = opts.cooldownRounds ?? 2;
  const fresh = [];
  for (const w of work) {
    const h = hashFinding(w.gap ?? w.description ?? JSON.stringify(w));
    const key = `${w.action ?? 'work'}:${w.leafId ?? w.target ?? ''}`;
    if (seen.has(h)) continue;
    if (typeof cooldown[key] === 'number' && round < cooldown[key]) continue;
    seen.add(h);
    cooldown[key] = round + coolRounds;
    fresh.push(w);
  }
  return { fresh, updatedState: { ...state, seenFindingHashes: [...seen], actionCooldown: cooldown } };
}

/**
 * Single entry point — call once per fan-out round. Runs the 3 layers, short-circuit-free (collects all
 * blocking reasons), then lets damping force-stop if blocked-but-stalled. Returns
 * { converged, reason, blocking[], nextRoundWork[], damping, forced? }.
 * DISARMED (or opts.armed===false) → passthrough { converged:true, reason:'gate-disarmed' }.
 * `adversarialResult` is precomputed by the caller (runAdversarialPass) so this stays pure + sync.
 */
export function converge({ ledger, poolOutputs = {}, signals = [], adversarialResult = null, damping = {}, round = 0, opts = {} } = {}) {
  const armed = (opts.armed !== undefined) ? opts.armed : isArmed();
  if (!armed) return { converged: true, reason: 'gate-disarmed', blocking: [], nextRoundWork: [], damping };

  const blocking = [];
  const nextRoundWork = [];

  const floor = checkObligationFloor(ledger || { leafTasks: [] }, poolOutputs);
  if (!floor.ok) {
    for (const id of floor.missing) blocking.push({ layer: 'obligation-floor', leafId: id, kind: 'missing' });
    for (const id of floor.nonConforming) blocking.push({ layer: 'obligation-floor', leafId: id, kind: 'non-conforming' });
  }

  const block = checkCriticalSignalBlock(signals);
  if (block.blocked) for (const id of block.blockers) blocking.push({ layer: 'critical-signal', signalId: id });

  if (adversarialResult && adversarialResult.ok === false) {
    for (const r of adversarialResult.rejections || []) {
      blocking.push({ layer: 'adversarial', leafId: r.leafId, gap: r.gap });
      nextRoundWork.push({ action: 're-extract', leafId: r.leafId, gap: r.gap });
    }
  }

  if (blocking.length === 0) {
    return { converged: true, reason: 'all-layers-satisfied', blocking: [], nextRoundWork: [], damping };
  }

  const damp = checkDamping(damping, opts);
  if (!damp.continue) {
    return { converged: true, reason: `forced-stop:${damp.reason}`, forced: true, blocking, nextRoundWork: [], damping: damp.updatedState };
  }

  const dd = dedupeWork(nextRoundWork, damping, round, opts);
  return { converged: false, reason: 'blocked', blocking, nextRoundWork: dd.fresh, damping: dd.updatedState };
}

// CLI: quick self-describe (no live dispatch). `node swarm-convergence.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify({
    module: 'swarm-convergence', armed: isArmed(), armEnv: ARM_ENV,
    exports: ['buildObligationLedger', 'checkObligationFloor', 'checkCriticalSignalBlock', 'runAdversarialPass', 'checkDamping', 'dedupeWork', 'converge'],
    note: 'DISARMED-default 3-layer nano-swarm convergence gate + damping. Set YURI_SWARM_CONVERGENCE=1 to arm.',
  }, null, 2)}\n`);
}
