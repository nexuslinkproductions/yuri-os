#!/usr/bin/env node
// @capability: mure-goal-engine
// @serves: self goal setting agent | agent proposes its own goals | goal scoring | propose score gate execute learn | capability frontier | mure goal engine | autonomous goal loop bounded
// @does: the self-goal-setting loop for a MURE role — PROPOSE (at the capability frontier, Voyager-style) -> pre-filter (constitution hard-stop: protected-path / arming / outward / scope-violation / intent-drift are DISCARDED before scoring) -> SCORE (5 weighted dims, composite >=0.75 advances; decision-sim robust ranking across candidates) -> GATE (governance 6-gate -> self-governable vs owner-held) -> classify into selected / held / parked / discarded, with hard caps (iteration ceiling <=4, scope-lock, intent-drift) preventing runaway/drift. DISARMED-safe: pure planning, executes nothing itself.
// @use: import { runGoalCycle, scoreGoal } from mure/goal-engine.mjs; runGoalCycle(candidateGoals, context, {maxCycles,cycle,threshold}). A candidate goal = {id,role,summary,scope,capabilityFit,reversible,blastRadius,evidenceDecidable,inDoctrine,outwardFacing,contended,arming,files,tags}.
// @exports: runGoalCycle, scoreGoal, preFilter, SCORE_WEIGHTS, ADVANCE_THRESHOLD, MAX_CYCLES
//
// Authority: ADVISORY planning. The engine RANKS + CLASSIFIES candidate goals; it never executes. Execution
// (and finalize) stays with the orchestrator/owner. The constitution hard-stop and the governance gate are
// inviolable — a high composite score never overrides a veto or owner-gating.

import { evaluateGovernance, CLASS, BLAST } from './governance.mjs';
import { scoreOptions } from './math-bridge.mjs';

export const SCORE_WEIGHTS = Object.freeze({ capabilityFit: 0.25, reversibility: 0.25, blast: 0.20, evidenceDecidability: 0.20, doctrineFit: 0.10 });
export const ADVANCE_THRESHOLD = 0.75;
export const MAX_CYCLES = 4; // Voyager repair-cycle ceiling — then mandatory escalation.

function blastRank(b) {
  if (typeof b === 'number') return (Number.isInteger(b) && b >= 0 && b <= BLAST.CRITICAL) ? b : BLAST.HIGH; // malformed → HIGH
  const k = String(b || 'HIGH').toUpperCase();
  return Object.prototype.hasOwnProperty.call(BLAST, k) ? BLAST[k] : BLAST.HIGH;
}
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/**
 * Constitution hard-stop pre-filter (runs BEFORE scoring, never after — lane-04 rule).
 * DISCARD a candidate that: touches a protected path, arms a gate, is outward-facing, touches secrets,
 * violates the role's scope, drifts from the task intent, or tries to modify the governance gate itself.
 * @returns {{kept:boolean, reason:string|null}}
 */
export function preFilter(goal = {}, context = {}, role = {}) {
  // gate-self-modification: a goal that would edit the governance gate is always discarded (separator-normalized).
  const files = (Array.isArray(goal.files) ? goal.files : []).map((f) => String(f).replace(/\\/g, '/'));
  if (files.some((f) => /(^|\/)mure\/governance\.mjs$/i.test(f))) return { kept: false, reason: 'gate-self-modification' };
  if (goal.arming === true) return { kept: false, reason: 'arming-hard-stop' };
  if (goal.outwardFacing === true) return { kept: false, reason: 'outward-facing-hard-stop' };
  if (goal.touchesSensitive) return { kept: false, reason: 'sensitive-data-hard-stop' };
  // protected-path: defer the actual check to governance (energy isProtectedPath); cheap pre-screen here.
  if (files.some((f) => /(^|\/)(\.env$|\.claude\/(state|history|file-history)\/|backend\/data\/|node_modules\/)/i.test(String(f)))) {
    return { kept: false, reason: 'protected-path-hard-stop' }; // /i: case-insensitive FS (native red-team #2)
  }
  // scope-lock: the goal's scope must be within the role's declared goalScope (if both present).
  const roleScope = Array.isArray(role.goalScope) ? role.goalScope : null;
  if (roleScope && goal.scope && !roleScope.includes(goal.scope)) return { kept: false, reason: `scope-violation:${goal.scope}` };
  // intent-drift: if context tags AND goal tags are both present, require at least one overlap.
  const ctxTags = Array.isArray(context.tags) ? context.tags : null;
  const goalTags = Array.isArray(goal.tags) ? goal.tags : null;
  if (ctxTags && ctxTags.length && goalTags && goalTags.length && !goalTags.some((t) => ctxTags.includes(t))) {
    return { kept: false, reason: 'intent-drift' };
  }
  return { kept: true, reason: null };
}

/**
 * Score a candidate goal across the 5 weighted dimensions → composite in [0,1].
 * @returns {{composite, dims, advance}}
 */
export function scoreGoal(goal = {}) {
  const dims = {
    capabilityFit: clamp01(goal.capabilityFit),
    reversibility: goal.reversible === true ? 1 : 0,
    blast: 1 - blastRank(goal.blastRadius) / BLAST.CRITICAL, // LOW=1 … CRITICAL=0
    evidenceDecidability: goal.evidenceDecidable === true ? 1 : 0,
    doctrineFit: goal.inDoctrine === true ? 1 : 0,
  };
  const composite = +(
    SCORE_WEIGHTS.capabilityFit * dims.capabilityFit
    + SCORE_WEIGHTS.reversibility * dims.reversibility
    + SCORE_WEIGHTS.blast * dims.blast
    + SCORE_WEIGHTS.evidenceDecidability * dims.evidenceDecidability
    + SCORE_WEIGHTS.doctrineFit * dims.doctrineFit
  ).toFixed(4);
  return { composite, dims, advance: composite >= ADVANCE_THRESHOLD };
}

/**
 * The self-goal-setting cycle for one role.
 * propose (candidates given) -> pre-filter -> score -> robust rank -> gate -> classify.
 * @param {Array<object>} candidates  candidate goals (proposed by the role)
 * @param {object} context  {tags?, goalSpine?, ...}
 * @param {object} role     the role definition (for scope-lock)
 * @param {{maxCycles?,cycle?,threshold?}} opts
 * @returns {{halted, haltReason, selected, held, parked, discarded, ranked, cycle}}
 */
export function runGoalCycle(candidates = [], context = {}, role = {}, opts = {}) {
  const maxCycles = Number(opts.maxCycles ?? MAX_CYCLES);
  const cycle = Number(opts.cycle ?? 0);
  const threshold = Number(opts.threshold ?? ADVANCE_THRESHOLD);
  if (cycle >= maxCycles) {
    return { halted: true, haltReason: 'iteration-ceiling', selected: [], held: [], parked: [], discarded: [], ranked: [], cycle };
  }
  const list = Array.isArray(candidates) ? candidates : [];
  const discarded = [];
  const survivors = [];
  for (const g of list) {
    const pf = preFilter(g, context, role);
    if (!pf.kept) { discarded.push({ goal: g, reason: pf.reason }); continue; }
    const sc = scoreGoal(g);
    survivors.push({ goal: g, score: sc });
  }
  // Robust rank across survivors (decision-sim cross-reference): mean=composite, uncertainty from a confidence
  // field if present (else 0). Deterministic + advisory; the composite threshold + gate still decide.
  const ranked = scoreOptions(
    survivors.map((s) => ({ id: String(s.goal.id || s.goal.summary || 'goal'), score: Number(s.score.composite), uncertainty: clamp01(s.goal.uncertainty) })),
    { seed: 12345 },
  ).ranked;
  const orderById = new Map(ranked.map((r, i) => [r.id, i]));
  survivors.sort((a, b) => (orderById.get(String(a.goal.id || a.goal.summary || 'goal')) ?? 0) - (orderById.get(String(b.goal.id || b.goal.summary || 'goal')) ?? 0));

  const selected = []; const held = []; const parked = [];
  for (const s of survivors) {
    if (s.score.composite < threshold) { parked.push({ goal: s.goal, score: s.score, reason: 'below-threshold' }); continue; }
    const ruling = evaluateGovernance(s.goal);
    if (ruling.class === CLASS.SELF) selected.push({ goal: s.goal, score: s.score, ruling });
    else held.push({ goal: s.goal, score: s.score, ruling });
  }
  return { halted: false, haltReason: null, selected, held, parked, discarded, ranked, cycle };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--candidates');
  let candidates = [];
  if (i >= 0) { try { candidates = JSON.parse(argv[i + 1]); } catch { /* */ } }
  process.stdout.write(`${JSON.stringify(runGoalCycle(candidates, {}, {}, {}), null, 2)}\n`);
}
