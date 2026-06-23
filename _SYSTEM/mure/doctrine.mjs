#!/usr/bin/env node
// @capability: doctrine-reader
// @serves: build doctrine | direction fit | improvement axes | grade build report | which direction is improvement | company strategy lens | under-served axes | advancement assessment | direction of improvement
// @does: reads the NEXUS LINK Build Doctrine (config/improvement-doctrine.json) and exposes the executable lens — directionFit(job) to SELECT work by vector-weighted axis contribution, grade(claim) to ASSESS finished work (evidence-gated advanced/partial/none/regressed), underServedAxes() to steer the recommender. Schema-generic: axes/vector/rubrics come from the JSON, not hardcoded. READ-ONLY: it never writes the doctrine — the self-grading guardrail (company proposes, owner ratifies) enforced at the code level.
// @use: import { loadDoctrine, directionFit, grade, underServedAxes } from mure/doctrine.mjs. directionFit(job).score blends with OpenMass in the ranker; grade(claim) runs on a build report's axis claim; never call from a cycle to EDIT the json (owner-gated).
// @exports: loadDoctrine, directionFit, grade, axisCoverage, underServedAxes, weightOf, blend, shouldAutoExec, TYPE_AXIS_HINTS, DOCTRINE_PATH
//
// Authority: this is the *reader* of direction doctrine. It computes; it does not decide authority or safety —
// governance.mjs owns the safety gate, openprocess-pool owns urgency. Doctrine changes stay owner-gated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const DOCTRINE_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'improvement-doctrine.json');

// Default axis priors when a job carries no explicit `fit` map — a mild +1 to the axes a job type usually
// advances. Lets directionFit score the EXISTING pool immediately; an explicit job.fit always overrides.
export const TYPE_AXIS_HINTS = Object.freeze({
  gap: ['A1'],
  arm: ['A3', 'A7'],
  improvement: ['A8a'],
  infra: ['A1', 'A6'],
  maintenance: ['A2', 'A6'],
  research: ['A6'],
  external: ['A9'],
  blender: ['A9', 'A1'],
});

let _cache = null;
/** Load + lightly validate the doctrine JSON. Cached (pass {fresh:true} to bypass). Throws on unreadable/invalid. */
export function loadDoctrine(opts = {}) {
  const p = opts.path || DOCTRINE_PATH;
  if (_cache && _cache._p === p && !opts.fresh) return _cache;
  const raw = fs.readFileSync(p, 'utf8');
  const d = JSON.parse(raw);
  if (!Array.isArray(d.axes) || !d.axes.length) throw new Error('doctrine: no axes');
  if (!d.currentVector || typeof d.currentVector !== 'object') throw new Error('doctrine: no currentVector');
  d._p = p;
  _cache = d;
  return d;
}

/**
 * Resolve a vector weight for an axis. A numeric weight pushes selection; the string "floor" is a
 * non-negotiable constraint (weight 0 for the positive push, but a REGRESSION on it is a hard violation).
 * Missing / malformed → 0 (an axis the current vector ignores).
 */
export function weightOf(axisId, vector = {}) {
  const v = vector[axisId];
  if (v === 'floor') return { weight: 0, floor: true };
  const n = Number(v);
  return { weight: Number.isFinite(n) && n > 0 ? n : 0, floor: false };
}

/** The per-axis expected effect of a job: explicit job.fit wins; else type-hint priors. */
function fitMap(job = {}, doctrine) {
  if (job.fit && typeof job.fit === 'object') return job.fit;
  const m = {};
  for (const a of (TYPE_AXIS_HINTS[job.type] || [])) m[a] = 1;
  return m;
}

/**
 * directionFit — vector-weighted sum of a job's per-axis expected effect.
 * @returns {{score, byAxis, floorViolation}} — score feeds the ranker blend; floorViolation flags a job that
 *   would REGRESS a floor axis (e.g. Safety) → the caller should treat that as disqualifying, not just low.
 */
export function directionFit(job = {}, opts = {}) {
  const doctrine = opts.doctrine || loadDoctrine(opts);
  const vec = doctrine.currentVector || {};
  const fit = fitMap(job, doctrine);
  let score = 0;
  const byAxis = {};
  let floorViolation = false;
  for (const axis of doctrine.axes) {
    const id = axis.id;
    const f = Number(fit[id]);
    if (!Number.isFinite(f) || f === 0) continue;
    const w = weightOf(id, vec);
    if (w.floor) {
      if (f < 0) floorViolation = true;          // regressing a floor axis is a hard violation
      byAxis[id] = { fit: f, weight: 0, contrib: 0, floor: true };
      continue;
    }
    const contrib = w.weight * f;
    score += contrib;
    byAxis[id] = { fit: f, weight: w.weight, contrib };
  }
  return { score, byAxis, floorViolation };
}

const VERDICT_SCORE = Object.freeze({ advanced: 1, partial: 0.5, none: 0, regressed: -1 });
/**
 * grade — assess one axis claim from a build report. Enforces the doctrine's evidence rule:
 * "no advance/partial without local evidence" → downgraded to 'none'. Net subtracts side-effect regressions.
 * @param claim {{axis, verdict, evidence, magnitude, regressions:[]}}
 */
export function grade(claim = {}, opts = {}) {
  const doctrine = opts.doctrine || loadDoctrine(opts);
  const verdicts = doctrine.assessmentRubric?.verdicts || ['advanced', 'partial', 'none', 'regressed'];
  let verdict = String(claim.verdict || 'none').toLowerCase();
  if (!verdicts.includes(verdict)) verdict = 'none';
  const hasEvidence = !!(claim.evidence && String(claim.evidence).trim());
  let downgraded = false;
  if ((verdict === 'advanced' || verdict === 'partial') && !hasEvidence) { verdict = 'none'; downgraded = true; }
  const regressions = Array.isArray(claim.regressions) ? claim.regressions : [];
  const churn = Math.max(0, Number(claim.churn) || 0);  // bloat penalty: big diff/token-cost for a small delta
  const score = VERDICT_SCORE[verdict] ?? 0;
  const net = score - regressions.length - churn;     // gains − side-effect regressions − churn (GLM-5.2)
  return { axis: claim.axis || null, verdict, hasEvidence, downgraded, magnitude: claim.magnitude || null, regressions, churn, score, net };
}

/** Sum graded net per axis across many claims/reports → cumulative advancement map {A1: net, ...}. */
export function axisCoverage(grades = [], opts = {}) {
  const cov = {};
  for (const g0 of grades) {
    const g = (g0 && typeof g0.net === 'number') ? g0 : grade(g0, opts);
    if (!g.axis) continue;
    cov[g.axis] = (cov[g.axis] || 0) + g.net;
  }
  return cov;
}

/**
 * underServedAxes — pushed axes (weight>0) whose cumulative advancement lags their weight. The recommender's
 * targeting list: the company should propose jobs that advance the most-deficient sanctioned direction.
 */
export function underServedAxes(coverageMap = {}, opts = {}) {
  const doctrine = opts.doctrine || loadDoctrine(opts);
  const vec = doctrine.currentVector || {};
  const out = [];
  for (const axis of doctrine.axes) {
    const w = weightOf(axis.id, vec);
    if (!w.weight) continue;                          // ignore 0-weight + floor for positive targeting
    const cov = Number(coverageMap[axis.id] || 0);
    const deficit = w.weight - cov;
    if (deficit > 0) out.push({ axis: axis.id, name: axis.name, weight: w.weight, coverage: cov, deficit });
  }
  return out.sort((a, b) => b.deficit - a.deficit);
}

/**
 * blend — combine OpenMass urgency with directionFit into a selection priority (the doctrine's §3 rule, v1).
 * Urgency leads; direction modulates and breaks ties; a floor violation sinks the job. alpha keeps direction
 * subordinate to urgency (small) — tune after GLM-5.2 review. A negative directionFit demotes below an
 * equally-urgent axis-advancing job, per the doctrine.
 */
export function blend(openMass = 0, fitResult = {}, opts = {}) {
  const wDir = Number.isFinite(opts.wDir) ? opts.wDir
    : Number.isFinite(opts.doctrine?.selectionRubric?.wDir) ? opts.doctrine.selectionRubric.wDir
      : 1.0;                                            // OpenMass + wDir·directionFit (GLM-5.2: arithmetic, no bands)
  const fitScore = typeof fitResult === 'number' ? fitResult : Number(fitResult.score || 0);
  let pr = Number(openMass) + wDir * fitScore;
  if (fitResult && fitResult.floorViolation) pr -= 1e6;  // a floor regression sinks the candidate
  return pr;
}

/**
 * Auto-exec direction veto (the doctrine's §3 hard floor): a job is NOT eligible for AUTONOMOUS execution if it
 * would regress a floor axis, OR if it moves no sanctioned direction (directionFit<=0) AND isn't urgent enough
 * (OpenMass < staleThreshold). Governance class filters on top — this is the DIRECTION veto only.
 */
export function shouldAutoExec(openMass = 0, fitResult = {}, opts = {}) {
  const stale = Number.isFinite(opts.staleThreshold) ? opts.staleThreshold
    : Number.isFinite(opts.doctrine?.selectionRubric?.staleThreshold) ? opts.doctrine.selectionRubric.staleThreshold
      : 2.5;
  const score = typeof fitResult === 'number' ? fitResult : Number(fitResult.score || 0);
  if (fitResult && fitResult.floorViolation) return false;
  if (score <= 0 && Number(openMass) < stale) return false;
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const d = loadDoctrine({ fresh: true });
  if (argv.includes('--fit')) {
    const job = JSON.parse(val('--fit'));
    process.stdout.write(`${JSON.stringify(directionFit(job, { doctrine: d }), null, 2)}\n`);
  } else if (argv.includes('--grade')) {
    const claim = JSON.parse(val('--grade'));
    process.stdout.write(`${JSON.stringify(grade(claim, { doctrine: d }), null, 2)}\n`);
  } else {
    const vec = d.currentVector;
    process.stdout.write(`Build Doctrine v${d.version} · ratified=${d.ratified}\naxes: ${d.axes.map((a) => a.id + '=' + a.name).join(', ')}\nvector: ${JSON.stringify(vec)}\nunder-served (empty coverage): ${JSON.stringify(underServedAxes({}, { doctrine: d }).map((u) => u.axis + '(' + u.deficit + ')'))}\n`);
  }
}
