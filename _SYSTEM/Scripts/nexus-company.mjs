#!/usr/bin/env node
// @capability: nexus-company-runner
// @serves: autonomous company | run the company | complete jobs autonomously | job runner cron | company cycle | self improving company | tackle open work | build reports
// @does: the autonomous NEXUS LINK company loop — one cycle: rank the job pool (OpenMass × Build-Doctrine direction-fit) → governance-gate each candidate (MURE 6-gate) → owner-gated/high-blast jobs are HELD (planned, never auto-run) → self-governable jobs are PLANNED (disarmed) or EXECUTED via MURE runCompany (armed) → GRADE each executed job against the doctrine axes → write a build report (with a doctrine self-assessment: axis coverage + under-served directions) → recommend new improvement jobs incl. one targeting the most under-served axis. DISARMED by default = plan + recommend only (zero spend, zero mutation). ARMED still NEVER auto-commits/pushes (finalize = owner) and obeys a budget cap + kill-switch. The cron beat runs this.
// @use: node nexus-company.mjs [--cycle] [--max 1] [--armed] [--dry-run]. Armed via YURI_COMPANY_ARMED=1 OR flag _SYSTEM/state/company.enabled; halt via _SYSTEM/state/company.halt. Reports → _SYSTEM/state/company-reports/.
// @exports: runJobCycle, jobDecision, isCompanyArmed, isHalted, jobAxes, gradeJob, ARM_ENV, ARM_FLAG, HALT_FLAG, REPORTS_DIR
//
// Authority: the runner EXECUTES self-governable jobs (when armed) but FINALIZE stays with the owner — it never
// commits/pushes/publishes. Owner-gated + high-blast + arm/blender jobs are HELD with a finished plan. Arming the
// cron (loading the plist) and arming this runner (the flag) are both owner-gated.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openPool, rankJobs, claimJob, completeJob, recommendJob, jobStats, listJobs } from './job-pool.mjs';
import { evaluateGovernance, CLASS } from '../mure/governance.mjs';
import { loadDoctrine, rankByDirection, grade, underServedAxes, axisCoverage, TYPE_AXIS_HINTS } from '../mure/doctrine.mjs';

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

export const FINALIZE_BRANCH = 'nexus-company/work';
function gitOut(args, env) { return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env }).trim(); }
/**
 * Append a build report to the REVIEW branch via git PLUMBING — a temp index + commit-tree → update-ref. NO
 * checkout, NO pre-commit hooks, NO touch of the live working tree / real index / main. The owner-chosen
 * finalize gate: autonomous work lands on a review branch the owner merges, never auto-pushed to main.
 */
export function finalizeToBranch(reportPath, cycleId, branch = FINALIZE_BRANCH) {
  const ref = `refs/heads/${branch}`;
  const idx = path.join(os.tmpdir(), `nexus-idx-${cycleId}`);
  try {
    let parent; try { parent = gitOut(['rev-parse', '--verify', ref]); } catch { parent = gitOut(['rev-parse', 'HEAD']); }
    gitOut(['read-tree', parent], { GIT_INDEX_FILE: idx });                         // seed temp index from the branch tip
    const blob = gitOut(['hash-object', '-w', reportPath]);                         // write the report blob
    gitOut(['update-index', '--add', '--cacheinfo', `100644,${blob},company-reports/${cycleId}.md`], { GIT_INDEX_FILE: idx });
    const tree = gitOut(['write-tree'], { GIT_INDEX_FILE: idx });
    const commit = gitOut(['commit-tree', tree, '-p', parent, '-m', `company: build report ${cycleId}`]); // no hooks
    gitOut(['update-ref', ref, commit]);
    return { branch, sha: commit.slice(0, 9), ok: true };
  } catch (e) { return { branch, ok: false, error: String(e?.message || e).slice(0, 200) }; }
  finally { try { fs.rmSync(idx, { force: true }); } catch { /* */ } }
}

// ── Build-Doctrine integration (direction lens) ──────────────────────────────
/** The doctrine axes a job advances: explicit job.fit keys, else the type-hint priors (mure/doctrine). */
export function jobAxes(job = {}) {
  if (job.fit && typeof job.fit === 'object') return Object.keys(job.fit);
  return TYPE_AXIS_HINTS[job.type] || [];
}
/** Grade a completed job vs the doctrine (v1: its primary axis; advanced iff the run succeeded — the run IS the
 * local evidence; partial otherwise). Returns the grade object or null when no doctrine / no mappable axis. */
export function gradeJob(job, ok, doctrine) {
  if (!doctrine) return null;
  const axis = jobAxes(job)[0];
  if (!axis) return null;
  return grade({ axis, verdict: ok ? 'advanced' : 'partial', evidence: ok ? 'executed: swarm run (local)' : '', magnitude: 'small' }, { doctrine });
}
/** Cumulative axis coverage from completed jobs (v1: each done job advanced its primary axis). */
function doctrineCoverage(db, doctrine) {
  if (!doctrine) return {};
  const grades = listJobs(db, { state: 'done', limit: 200 }).map((j) => gradeJob(j, true, doctrine)).filter(Boolean);
  return axisCoverage(grades, { doctrine });
}

/**
 * Assess the OS + company state and propose improvement jobs. The engine of compounding self-improvement.
 * Recommendations land as state=recommended; owner promotes to open.
 *
 * Assessment dimensions:
 * - Gaps: incomplete roles/skills/infra
 * - Arm-readiness: DISARMED flags that could be armed with safety
 * - Infra: missing runtimes, tooling, or integrations
 * - Research: unclear mechanisms, missing documentation, unverified claims
 *
 * Returns array of recommended job ids.
 */
function recommend(db) {
  const out = [];
  const stats = jobStats(db);
  const open = listJobs(db, { state: 'open', limit: 100 });
  const done = listJobs(db, { state: 'done', limit: 100 });
  const recommended = listJobs(db, { state: 'recommended', limit: 50 });

  // TRACK: gap types we've already recommended to avoid duplication
  const recommendedTitles = new Set(recommended.map((j) => j.title.toLowerCase()));
  const openTitles = new Set(open.map((j) => j.title.toLowerCase()));

  const isDup = (title) => recommendedTitles.has(title.toLowerCase()) || openTitles.has(title.toLowerCase());

  // 1. ARM-READINESS GAP: detect DISARMED flags that could be armed safely
  const repoRoot = path.dirname(path.dirname(HERE));
  const checkFlag = (relPath) => { try { return fs.existsSync(path.join(repoRoot, relPath)); } catch { return false; } };

  const mureArmed = isCompanyArmed() || (process.env[ARM_ENV] === '1');
  const companyFlag = checkFlag('_SYSTEM/state/company.enabled');
  const mureFlag = checkFlag('_SYSTEM/state/mure.enabled');

  if (!mureArmed && !companyFlag && !isDup('Arm the autonomous company runner')) {
    out.push(recommendJob(db, {
      type: 'arm',
      title: 'Arm the autonomous company runner',
      detail: 'The NEXUS LINK company runner is DISARMED by default (plan + recommend only). Review the MURE governance charter, risk thresholds, and the 6-gate implementation. If you trust the self-governability of the work, arm via YURI_COMPANY_ARMED=1 or the _SYSTEM/state/company.enabled flag.',
      value: 0.8,
      risk: 0.4,
      priority: 'high',
      source: 'recommender',
      nextAction: 'Review nexus-company.mjs governance logic + Self-Governance Charter; decide whether to arm the runner.',
      closureCondition: 'Armed via flag or explicit decision NOT to arm documented.',
    }));
  }

  // 2. INFRA GAPS: check for missing capability files or runtimes
  const infraChecks = [
    {
      title: 'Set up local model runtime for GLM fleet',
      detail: 'The GLM fleet substrate requires a local model runtime (e.g., ollama, local-glm) to self-dispatch without paid calls. Configure _SYSTEM/Scripts/llm-lane.mjs lane targets and test node ollama-lane.mjs.',
      files: ['_SYSTEM/Scripts/ollama-lane.mjs', '_SYSTEM/Scripts/llm-lane.mjs'],
    },
    {
      title: 'Configure MURE role registry for full autonomy',
      detail: 'The MURE role roster (_SYSTEM/config/fleet-roles.json, loaded by _SYSTEM/mure/role-registry.mjs) defines roles, capabilities, and lane targets. Ensure all roles are configured and lanes resolve correctly.',
      files: ['_SYSTEM/config/fleet-roles.json', '_SYSTEM/mure/role-registry.mjs'],
    },
  ];

  for (const gap of infraChecks) {
    const missing = gap.files.some((f) => !checkFlag(f));
    if (missing && !isDup(gap.title)) {
      out.push(recommendJob(db, {
        type: 'infra',
        title: gap.title,
        detail: gap.detail,
        value: 0.7,
        risk: 0.3,
        priority: 'medium',
        source: 'recommender',
        nextAction: 'Audit the listed files + paths; set up missing infrastructure.',
        closureCondition: 'All checked paths exist or are documented as skipped.',
      }));
    }
  }

  // 3. GAPS: a role roster must exist (MURE fleet-roles.json). Recommend building one ONLY if absent/empty —
  // the real roster carries 20 archetypes (helmsman/architect/steward/…), so don't false-fire on guessed names.
  const roleRegistryPath = path.join(repoRoot, '_SYSTEM/config/fleet-roles.json');
  let roles = [];
  try { roles = JSON.parse(fs.readFileSync(roleRegistryPath, 'utf8')).roles || []; } catch { /* */ }
  if (!roles.length && !isDup('Build the MURE role roster')) {
    out.push(recommendJob(db, {
      type: 'gap',
      title: 'Build the MURE role roster',
      detail: 'No role roster found at _SYSTEM/config/fleet-roles.json. Define the MURE company roles (archetype, capabilities, substrate+lane, autonomyClass, mathHooks).',
      value: 0.75,
      risk: 0.2,
      priority: 'medium',
      source: 'recommender',
      nextAction: 'Create fleet-roles.json with the role definitions; validate via role-registry.mjs.',
      closureCondition: 'fleet-roles.json exists with >=1 role and the roster validates.',
    }));
  }

  // 4. RESEARCH: missing documentation or unclear mechanisms
  const researchGaps = [
    {
      title: 'Document the OpenProcess Sum Pool usage pattern',
      detail: 'The OpenProcess Sum Pool (openprocess-pool.mjs) ranks unfinished work by OpenMass. Document how operators should use it for backlog attention and how the company cycle integrates it.',
      check: () => checkFlag('_SYSTEM/docs/yuri-openprocess-sum-pool.md'),
    },
    {
      title: 'Verify and document math substrate safety guarantees',
      detail: 'The math substrate (_SYSTEM/Scripts/math/) provides formula banks and proof gates. Verify the proof traces for critical formulas and document the safety guarantees.',
      check: () => checkFlag('_SYSTEM/docs/yuri-math-safety-guarantees.md'),
    },
  ];

  for (const gap of researchGaps) {
    if (!gap.check() && !isDup(gap.title)) {
      out.push(recommendJob(db, {
        type: 'research',
        title: gap.title,
        detail: gap.detail,
        value: 0.6,
        risk: 0.1,
        priority: 'low',
        source: 'recommender',
        nextAction: gap.nextAction || 'Create the documentation + verify claims with local evidence.',
        closureCondition: 'Documentation exists at the specified path.',
      }));
    }
  }

  // 5. MAINTENANCE: detect stale or blocked jobs
  const blockedJobs = open.filter((j) => j.state === 'blocked' || j.state === 'stale');
  if (blockedJobs.length > 0 && !isDup('Clear blocked/stale job backlog')) {
    out.push(recommendJob(db, {
      type: 'maintenance',
      title: 'Clear blocked/stale job backlog',
      detail: `${blockedJobs.length} jobs are blocked or stale. Review each one, unblock if possible, or close if obsolete. This keeps the job pool healthy.`,
      value: 0.5,
      risk: 0.1,
      priority: 'medium',
      source: 'recommender',
      nextAction: 'Review blocked/stale jobs; update state or add resolution notes.',
      closureCondition: 'Blocked/stale job count reduced or explained.',
    }));
  }

  // 6. COMPOUNDING: if the company has completed ≥3 jobs, recommend a pattern review
  if (stats.done >= 3 && !isDup('Review completed jobs for improvement patterns')) {
    out.push(recommendJob(db, {
      type: 'research',
      title: 'Review completed jobs for improvement patterns',
      detail: `The company has completed ${stats.done} jobs. Read the build reports, identify patterns (what worked, what failed, what gaps emerged), and propose 1-3 concrete follow-up jobs. This is the compounding self-improvement loop.`,
      value: 0.7,
      risk: 0.2,
      priority: 'medium',
      source: 'recommender',
      nextAction: 'Read build reports from _SYSTEM/state/company-reports/; synthesize patterns; propose jobs.',
      closureCondition: 'Pattern synthesis note + ≥1 new job recommendation exists.',
    }));
  }

  // 7. DOCTRINE: target the most UNDER-SERVED axis of the current vector (the compounding direction steer).
  try {
    const doctrine = loadDoctrine();
    const under = underServedAxes(doctrineCoverage(db, doctrine), { doctrine });
    const top = under[0];
    const title = top ? `Advance ${top.axis} (${top.name}) — under-served direction` : null;
    if (top && !isDup(title)) {
      out.push(recommendJob(db, {
        type: 'improvement',
        title,
        detail: `Build Doctrine: the current vector weights ${top.axis} (${top.name}) at ${top.weight} but cumulative advancement is ${top.coverage} (deficit ${top.deficit}). Propose + do work that advances ${top.name}. See _SYSTEM/mure/BUILD-DOCTRINE.md.`,
        value: 0.7, risk: 0.2, priority: 'medium', source: 'recommender',
        nextAction: `Pick or build a job that advances axis ${top.axis} (${top.name}); grade it on completion.`,
        closureCondition: `A completed job advances ${top.axis} with local evidence; the vector deficit shrinks.`,
      }));
    }
  } catch { /* doctrine unreadable — skip the direction steer, never crash the cycle */ }

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
  const doctrine = (() => { try { return loadDoctrine(); } catch { return null; } })();
  const openJobs = rankJobs(db).filter((j) => j.state === 'open');
  // SELECT by OpenMass × Build-Doctrine direction-fit (fail-soft to pure OpenMass if doctrine unreadable).
  const ranked = doctrine ? rankByDirection(openJobs, { doctrine }) : openJobs;
  const results = [];
  let executed = 0; // budget counts EXECUTIONS only — held + deferred jobs are free.

  for (const job of ranked) {
    const decision = jobDecision(job);
    if (decision.class === CLASS.OWNER) {
      results.push({ job: job.id, title: job.title, action: 'held', class: 'owner-gated', reason: decision.ownerFloor ? 'owner-floor' : 'gate' });
      continue; // owner-gated jobs are surfaced but NEVER consume the execution budget
    }
    if (!armed) {
      results.push({ job: job.id, title: job.title, action: 'planned (disarmed)', class: 'self-governable' });
      continue;
    }
    if (executed >= max) {
      results.push({ job: job.id, title: job.title, action: 'deferred (budget)', class: 'self-governable' });
      continue;
    }
    // ARMED + self-governable → execute via MURE (finalize gated: runCompany dispatches the GLM substrate +
    // emits native specs; it does NOT commit/push). Report captures the result; job → done (awaiting owner review).
    try {
      claimJob(db, job.id);
      const { runCompany } = await import('../mure/company.mjs');
      const r = await runCompany(jobToTask(job), { rounds: 1, concurrency: 2 });
      const g = gradeJob(job, !!r.swarm?.converged, doctrine);
      const report = `# ${job.title}\n\ncycle ${cycleId} · executed ${new Date().toISOString()}\n\n- swarm: ${r.swarm?.runId || '(none)'} converged=${r.swarm?.converged}\n- doctrine: ${g ? `${g.axis} → ${g.verdict} (net ${g.net})` : 'n/a'}\n- native specs (for Opus): ${(r.nativeSpecs || []).map((n) => n.id).join(', ') || '(none)'}\n- held: ${(r.held || []).map((h) => h.subtaskId).join(', ') || '(none)'}\n\nNEXT: owner review — finalize (commit) is gated.`;
      completeJob(db, job.id, report);
      executed += 1;
      results.push({ job: job.id, title: job.title, action: 'executed', swarm: r.swarm?.runId, converged: r.swarm?.converged, grade: g ? { axis: g.axis, verdict: g.verdict, net: g.net } : null });
    } catch (e) {
      results.push({ job: job.id, title: job.title, action: 'error', error: String(e?.message || e) });
    }
  }

  const recommended = recommend(db); // ALWAYS recommend (safe, disarmed-friendly)
  const stats = jobStats(db);
  const coverage = doctrineCoverage(db, doctrine);
  const under = doctrine ? underServedAxes(coverage, { doctrine }) : [];
  const body = [
    `# NEXUS LINK company cycle ${cycleId}`,
    `armed=${armed} halted=${halted} · ${new Date().toISOString()}`,
    `executed=${executed} · ${results.length} jobs touched`,
    '', '## actions',
    ...results.map((r) => `- [${r.action}] ${r.title}${r.grade ? ` · ${r.grade.axis} ${r.grade.verdict}` : ''}${r.swarm ? ` (swarm ${r.swarm})` : ''}`),
    '', '## doctrine (direction self-assessment)',
    doctrine ? `- current vector: ${JSON.stringify(doctrine.currentVector)}` : '- doctrine: (unreadable — selection fell back to pure OpenMass)',
    `- axis coverage: ${JSON.stringify(coverage)}`,
    `- under-served: ${under.map((u) => `${u.axis}(${u.deficit})`).join(' ') || '(none)'}`,
    '', `## recommended (${recommended.length})`,
    ...recommended.map((id) => `- ${id}`),
    '', `## pool`, '```json', JSON.stringify(stats, null, 2), '```',
  ].join('\n');
  writeReport(cycleId, body);
  // FINALIZE GATE — armed cycles commit the build report to the review branch (isolated worktree), never main.
  let finalize = null;
  if (armed && opts.finalizeBranch !== false) finalize = finalizeToBranch(path.join(REPORTS_DIR, `${cycleId}.md`), cycleId);
  return { cycleId, armed, halted, executed, picked: results.map((r) => r.job), results, recommended, stats, reportPath: path.join(REPORTS_DIR, `${cycleId}.md`), finalize };
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
