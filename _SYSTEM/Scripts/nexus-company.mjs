#!/usr/bin/env node
// @capability: nexus-company-runner
// @serves: autonomous company | run the company | complete jobs autonomously | job runner cron | company cycle | self improving company | tackle open work | build reports
// @does: the autonomous NEXUS LINK company loop — one cycle: rank the job pool (OpenMass) → governance-gate each candidate (MURE 6-gate) → owner-gated/high-blast jobs are HELD (planned, never auto-run) → self-governable jobs are PLANNED (disarmed) or EXECUTED via MURE runCompany (armed) → write a build report → recommend new improvement jobs. DISARMED by default = plan + recommend only (zero spend, zero mutation). ARMED still NEVER auto-commits/pushes (finalize = owner) and obeys a budget cap + kill-switch. The cron beat runs this.
// @use: node nexus-company.mjs [--cycle] [--max 1] [--armed] [--dry-run]. Armed via YURI_COMPANY_ARMED=1 OR flag _SYSTEM/state/company.enabled; halt via _SYSTEM/state/company.halt. Reports → _SYSTEM/state/company-reports/.
// @exports: runJobCycle, jobDecision, isCompanyArmed, isHalted, ARM_ENV, ARM_FLAG, HALT_FLAG, REPORTS_DIR
//
// Authority: the runner EXECUTES self-governable jobs (when armed) but FINALIZE stays with the owner — it never
// commits/pushes/publishes. Owner-gated + high-blast + arm/blender jobs are HELD with a finished plan. Arming the
// cron (loading the plist) and arming this runner (the flag) are both owner-gated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPool, rankJobs, claimJob, completeJob, recommendJob, jobStats, listJobs } from './job-pool.mjs';
import { evaluateGovernance, CLASS } from '../mure/governance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const ARM_ENV = 'YURI_COMPANY_ARMED';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'company.enabled');
export const HALT_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'company.halt');
export const REPORTS_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'company-reports');
const BUDGET_CAP = 3; // max jobs executed per cycle (hard ceiling on autonomous spend)

export function isHalted() { try { return fs.existsSync(HALT_FLAG); } catch { return false; } }
export function isCompanyArmed() {
  if (isHalted()) return false; // kill-switch dominates
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

/**
 * Map a job to a governance decision (MURE 6-gate). Owner-source / blender / arm jobs are owner-gated by FLOOR
 * (held even when armed); risk drives blast. The gate decides auto-execute vs hold.
 */
export function jobDecision(job = {}) {
  const risk = Number.isFinite(job.risk) ? job.risk : 0.5;
  const base = {
    id: job.id, summary: job.title,
    reversible: risk < 0.6,                 // finalize is gated anyway; this is the auto-execute reversibility
    evidenceDecidable: true,
    inDoctrine: true,
    blastRadius: risk > 0.6 ? 'HIGH' : risk > 0.35 ? 'MEDIUM' : 'LOW',
    outwardFacing: false,
    contended: false,
    arming: job.type === 'arm',             // an arm job proposes arming → owner-gated by construction
  };
  const ruling = evaluateGovernance(base);
  // Owner-floor: owner-delegated + blender + critical jobs are always held for the owner.
  if (job.source === 'owner' || job.type === 'blender' || job.priority === 'critical') {
    return { ...ruling, class: CLASS.OWNER, ownerFloor: true };
  }
  return ruling;
}

/** Build the runCompany task spec for a job (its nextAction decomposed by the helmsman). */
function jobToTask(job) {
  return {
    summary: job.title,
    tags: [job.type],
    subtasks: [{
      id: job.id, prompt: `${job.title}\n\n${job.detail}\n\nNEXT ACTION: ${job.nextAction}\nDONE WHEN: ${job.closureCondition}`,
      blastRadius: job.risk > 0.6 ? 'HIGH' : job.risk > 0.35 ? 'MEDIUM' : 'LOW',
    }],
  };
}

function writeReport(cycleId, body) {
  try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); fs.writeFileSync(path.join(REPORTS_DIR, `${cycleId}.md`), body); } catch { /* best-effort */ }
}

/** v1 heuristic recommender — proposes self-improvement jobs from observable pool state (honest, lightweight;
 * the deep web-research recommender is itself a seeded job). */
function recommend(db) {
  const out = [];
  const stats = jobStats(db);
  // If nothing is recommended yet, seed a standing self-assessment recommendation.
  if (!stats.recommended) {
    out.push(recommendJob(db, {
      type: 'research', title: 'Cycle self-assessment — what did the company learn + what is next',
      detail: 'After each batch of completed jobs, assess outcomes (build reports), update the improvement pattern, and propose the next highest-leverage jobs (gaps, infra, arm-readiness). Grounds compounding improvement.',
      value: 0.7, risk: 0.2, priority: 'medium',
      nextAction: 'Read recent build reports + jobStats; propose 1-3 concrete follow-up jobs.',
      closureCondition: 'A self-assessment note + ≥1 follow-up job recommendation exists.',
    }));
  }
  return out;
}

/**
 * Run one company cycle. DISARMED → plan + recommend only. ARMED → also execute self-governable jobs via MURE
 * (finalize still gated; budget-capped; kill-switch honored).
 * @returns {Promise<{cycleId,armed,halted,picked,results,recommended,stats,reportPath}>}
 */
export async function runJobCycle(opts = {}) {
  const db = openPool();
  const armed = opts.armed != null ? !!opts.armed : isCompanyArmed();
  const halted = isHalted();
  const max = Math.max(1, Math.min(BUDGET_CAP, Number(opts.max || 1)));
  const cycleId = `cycle-${Date.now().toString(36)}`;
  const ranked = rankJobs(db).filter((j) => j.state === 'open');
  const picked = ranked.slice(0, max);
  const results = [];

  for (const job of picked) {
    const decision = jobDecision(job);
    if (decision.class === CLASS.OWNER) {
      results.push({ job: job.id, title: job.title, action: 'held', class: 'owner-gated', reason: decision.ownerFloor ? 'owner-floor' : decision.ruling, plan: jobToTask(job) });
      continue;
    }
    if (!armed) {
      results.push({ job: job.id, title: job.title, action: 'planned (disarmed)', class: 'self-governable', plan: jobToTask(job) });
      continue;
    }
    // ARMED + self-governable → execute via MURE (finalize gated: runCompany dispatches the GLM substrate +
    // emits native specs; it does NOT commit/push). Report captures the result; job → done (awaiting owner review).
    try {
      claimJob(db, job.id);
      const { runCompany } = await import('../mure/company.mjs');
      const r = await runCompany(jobToTask(job), { rounds: 1, concurrency: 2 });
      const report = `# ${job.title}\n\ncycle ${cycleId} · executed ${new Date().toISOString()}\n\n- swarm: ${r.swarm?.runId || '(none)'} converged=${r.swarm?.converged}\n- native specs (for Opus): ${(r.nativeSpecs || []).map((n) => n.id).join(', ') || '(none)'}\n- held: ${(r.held || []).map((h) => h.subtaskId).join(', ') || '(none)'}\n\nNEXT: owner review — finalize (commit) is gated.`;
      completeJob(db, job.id, report);
      results.push({ job: job.id, title: job.title, action: 'executed', swarm: r.swarm?.runId, converged: r.swarm?.converged });
    } catch (e) {
      results.push({ job: job.id, title: job.title, action: 'error', error: String(e?.message || e) });
    }
  }

  const recommended = armed ? recommend(db) : [];
  const stats = jobStats(db);
  const body = [
    `# NEXUS LINK company cycle ${cycleId}`,
    `armed=${armed} halted=${halted} · ${new Date().toISOString()}`,
    '', `## picked (${picked.length})`,
    ...results.map((r) => `- [${r.action}] ${r.title}${r.swarm ? ` (swarm ${r.swarm})` : ''}`),
    '', `## recommended (${recommended.length})`,
    ...recommended.map((id) => `- ${id}`),
    '', `## pool`, '```json', JSON.stringify(stats, null, 2), '```',
  ].join('\n');
  writeReport(cycleId, body);
  return { cycleId, armed, halted, picked: picked.map((j) => j.id), results, recommended, stats, reportPath: path.join(REPORTS_DIR, `${cycleId}.md`) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  const opts = { max: Number(val('--max', 1)) };
  if (argv.includes('--dry-run')) opts.armed = false;
  else if (argv.includes('--armed')) opts.armed = true;
  runJobCycle(opts).then((r) => {
    process.stdout.write(`${JSON.stringify({ cycleId: r.cycleId, armed: r.armed, halted: r.halted, results: r.results, recommended: r.recommended.length, report: r.reportPath }, null, 2)}\n`);
    process.exit(0);
  }).catch((e) => { process.stderr.write(`company cycle error: ${String(e?.message || e)}\n`); process.exit(1); });
}
