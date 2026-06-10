#!/usr/bin/env node
/**
 * openprocess-pool.mjs — the OpenProcess Sum Pool (mathematical memory for started-but-unclosed work).
 *
 * Users + lanes start tasks, research, ideas, todos, skill builds, bugs, experiments, handoffs over days/weeks;
 * many stay open and fall out of human working memory. YURI preserves them as OpenProcess objects and ranks them
 * by OPEN MASS so the operator can ask "what did we start but not finish?" and get a math-grounded answer, not a
 * memory vibe. UI-agnostic — the pool is YURI-native, the same across Codex / Claude / Gemma / DeepSeek surfaces.
 *
 *   OpenMass_i = w_status·status_open_i
 *              + w_age·hazard_decay(age_i, halfLife_i)      [STALENESS — stale-but-open rises back into attention]
 *              + w_dep·dependency_centrality_i               [via yuri-navigate.aggregateProcessCentrality]
 *              + w_risk·unfinished_risk_i
 *              + w_value·operator_value_i
 *              − w_verify·verified_closure_evidence_i
 *
 * Deterministic: no Math.random / Date.now (ages are carried on the evidence; the caller stamps "now" once and
 * passes ages in). hazard reuse: math-kernel confidenceDecay (freshness = base·0.5^(age/halfLife); staleness = 1−freshness).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confidenceDecay } from './math/math-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const OPEN_PROCESS_TYPES = Object.freeze(['task', 'research', 'idea', 'todo', 'skill', 'bug', 'experiment', 'handoff']);
export const OPEN_PROCESS_STATES = Object.freeze(['open', 'active', 'blocked', 'stale', 'closed']);

export const DEFAULT_WEIGHTS = Object.freeze({ status: 1.0, age: 1.0, dep: 1.5, risk: 1.0, value: 1.2, verify: 2.0 });

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ZERO_TERMS = Object.freeze({ status: 0, age: 0, dep: 0, risk: 0, value: 0, verify: 0 });
const isProcessObject = (proc) => Boolean(proc && typeof proc === 'object' && !Array.isArray(proc));

// STALENESS of the freshest piece of evidence: 1 − base·0.5^(age/halfLife). A process whose evidence ages without
// renewal accrues staleness → rises back into attention. No evidence ⇒ maximally stale (1).
export function staleness(proc) {
  const ev = isProcessObject(proc) && Array.isArray(proc.evidence) ? proc.evidence : [];
  if (!ev.length) return 1;
  // the most recently-grounded evidence (smallest age) sets freshness; staleness = 1 − that freshness.
  let bestFresh = 0;
  for (const e of ev) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const base = Number.isFinite(e.base) ? clamp01(e.base) : 0.5;
    const age = Number.isFinite(e.age) ? Math.max(0, e.age) : 0;
    const halfLife = Number.isFinite(e.halfLife) && e.halfLife > 0 ? e.halfLife : 14;
    bestFresh = Math.max(bestFresh, confidenceDecay({ base, age, halfLife }));
  }
  return clamp01(1 - bestFresh);
}

function statusOpen(proc) {
  if (proc.state === 'closed') return 0;
  return proc.state === 'blocked' || proc.state === 'stale' || proc.state === 'open' || proc.state === 'active' ? 1 : 1;
}
function unfinishedRisk(proc) {
  // explicit field, else: blocked is high-risk, a deep dependency chain raises it.
  if (Number.isFinite(proc.risk)) return clamp01(proc.risk);
  const depCount = Array.isArray(proc.dependencies) ? proc.dependencies.length : 0;
  const blocked = proc.state === 'blocked' ? 0.4 : 0;
  return clamp01(blocked + Math.min(0.5, depCount * 0.1) + 0.2);
}
function operatorValue(proc) {
  return Number.isFinite(proc.value) ? clamp01(proc.value) : 0.5;
}
// verified closure evidence: a closed process with grounding, or an explicit field. Subtracts mass (it's done).
function verifiedClosureEvidence(proc) {
  if (Number.isFinite(proc.verifiedClosure)) return clamp01(proc.verifiedClosure);
  if (proc.state === 'closed') return 1;
  return 0;
}

// dependency_centrality: pluggable. If opts.centralityOf(anchors)->number is provided (e.g. wrapping
// yuri-navigate.aggregateProcessCentrality), use it; else 0 (the term is honestly absent, not faked).
function dependencyCentrality(proc, opts) {
  if (typeof opts.centralityOf === 'function') {
    try { const v = opts.centralityOf(Array.isArray(proc.anchors) ? proc.anchors : []); return Number.isFinite(v) ? v : 0; } catch { return 0; }
  }
  return 0;
}

export function openMass(proc, opts = {}) {
  if (!isProcessObject(proc)) {
    // Malformed pool entries should degrade explicitly, not crash the whole OpenProcess ranking.
    return { id: undefined, type: undefined, mass: 0, terms: { ...ZERO_TERMS }, invalid: true, reason: 'invalid process entry' };
  }
  // Poisoned weights (Infinity / NaN / non-number) must not silently corrupt the whole ranking:
  // accept an override only when it is a finite number, otherwise fall back to the default weight.
  const overrides = (opts.weights && typeof opts.weights === 'object' && !Array.isArray(opts.weights)) ? opts.weights : {};
  const w = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    w[k] = Number.isFinite(overrides[k]) ? overrides[k] : DEFAULT_WEIGHTS[k];
  }
  const terms = {
    status: w.status * statusOpen(proc),
    age: w.age * staleness(proc),
    dep: w.dep * dependencyCentrality(proc, opts),
    risk: w.risk * unfinishedRisk(proc),
    value: w.value * operatorValue(proc),
    verify: -w.verify * verifiedClosureEvidence(proc),
  };
  const mass = Object.values(terms).reduce((a, b) => a + b, 0);
  return { id: proc.id, type: proc.type, mass: Number(mass.toFixed(6)), terms };
}

export function rankPool(processes, opts = {}) {
  const scored = (Array.isArray(processes) ? processes : []).map((p) => openMass(p, opts)).filter((x) => !x.invalid);
  scored.sort((a, b) => b.mass - a.mass || String(a.id).localeCompare(String(b.id)));
  return scored;
}

export function poolTotal(processes, opts = {}) {
  return Number(rankPool(processes, opts).reduce((s, x) => s + x.mass, 0).toFixed(6));
}

export function categoryPools(processes, opts = {}) {
  const out = {};
  for (const x of rankPool(processes, opts)) out[x.type] = Number(((out[x.type] || 0) + x.mass).toFixed(6));
  return out;
}

// the operator's question: "what did we start but not finish?" → top-N open processes by mass, with the
// next candidate action that would reduce each one's mass.
// IMPORTANT: pair each process INSTANCE with its own score (no re-lookup by id). A prior version used
// processes.find(q => q.id === x.id), which returns the FIRST match — so when two processes share an id and
// the first is closed, the genuinely-open one was silently dropped (the continuity organ lying that work is
// done). Scoring per-instance guarantees every open process surfaces, even under duplicate ids.
export function whatIsUnfinished(processes, opts = {}) {
  const list = Array.isArray(processes) ? processes : [];
  const scored = list.map((p) => ({ p, score: openMass(p, opts) })).filter(({ score }) => !score.invalid);
  const open = scored.filter(({ p }) => p && p.state !== 'closed');
  open.sort((a, b) => b.score.mass - a.score.mass || String(a.score.id).localeCompare(String(b.score.id)));
  // Honor top:0; falsy defaulting silently returned 10 rows when callers requested none.
  const n = Number.isInteger(opts.top) && opts.top >= 0 ? opts.top : 10;
  const top = open.slice(0, n);
  return top.map(({ p, score }) => ({
    id: score.id,
    type: score.type,
    title: p.title,
    mass: score.mass,
    state: p.state,
    nextCandidateAction: p.nextCandidateAction,
    closureCondition: p.closureCondition,
  }));
}

// optional: a centralityOf() backed by yuri-navigate, for the w_dep term. Lazy so the pool stays self-contained.
export async function navigateCentrality() {
  try {
    const nav = await import('./yuri-navigate.mjs');
    const graph = nav.loadUnifiedGraph();
    return (anchors) => {
      if (!Array.isArray(anchors) || !anchors.length) return 0;
      try { const r = nav.aggregateProcessCentrality(graph, anchors, { aggregate: 'max' }); return r.dependency_centrality / Math.max(1, graph.nodeCount - 1); } catch { return 0; }
    };
  } catch { return () => 0; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write('openprocess-pool: library — import { openMass, rankPool, whatIsUnfinished, navigateCentrality }\n');
}
