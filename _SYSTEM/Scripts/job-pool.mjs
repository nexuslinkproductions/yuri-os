#!/usr/bin/env node
// @capability: job-pool
// @serves: job pool | job list | open work queue | company jobs | tasks to complete | job recommendations | what should the company do next | autonomous work queue | improvement backlog
// @does: the company's job pool — a first-class `jobs` table in work-ledger.db where open work + improvement recommendations live as OpenProcess-shaped rows, ranked by OpenMass (openprocess-pool) so the autonomous company-runner always picks the highest-leverage open job. Jobs come from three sources: the OS open-work organ (seed), the company's own recommender (self-improvement proposals), and manual/owner adds. Completing a job writes a build report back onto the row.
// @use: import { openPool, addJob, listJobs, rankJobs, claimJob, completeJob, recommendJob, jobStats, seedPool } from job-pool.mjs. CLI: node job-pool.mjs --list | --rank | --stats | --seed | --add '<json>'. Shares work-ledger.db (gitignored). Pure store — does NOT execute jobs (that's nexus-company.mjs).
// @exports: openPool, ensureJobsSchema, addJob, listJobs, rankJobs, claimJob, completeJob, recommendJob, jobStats, seedPool, JOB_TYPES, JOB_STATES, PRIORITY
//
// Authority: descriptive store + ranking. The pool RECORDS what should be done + how urgent; it never executes,
// commits, or arms. Execution + finalize stay with nexus-company.mjs (gated) and the owner.

import crypto from 'node:crypto';
import { openLedger } from './work-ledger.mjs';
import { rankPool } from './openprocess-pool.mjs';

export const JOB_TYPES = Object.freeze(['gap', 'arm', 'improvement', 'infra', 'maintenance', 'research', 'external', 'blender']);
export const JOB_STATES = Object.freeze(['open', 'active', 'blocked', 'done', 'recommended', 'dropped']);
export const PRIORITY = Object.freeze({ low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 });

const nowIso = () => new Date().toISOString();
const jid = (title) => `job-${crypto.createHash('sha256').update(String(title)).digest('hex').slice(0, 10)}`;
const daysSince = (iso) => { if (!iso) return 30; const d = (Date.now() - new Date(iso).getTime()) / 86400000; return Number.isFinite(d) ? Math.max(0, d) : 30; };

export function openPool() {
  const db = openLedger();
  ensureJobsSchema(db);
  return db;
}

export function ensureJobsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, type TEXT, title TEXT, detail TEXT, state TEXT,
      value REAL, risk REAL, priority TEXT, source TEXT,
      next_action TEXT, closure TEXT, report TEXT, evidence TEXT,
      created_at TEXT, updated_at TEXT, completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
    CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
  `);
}

const upsert = (db) => db.prepare(`INSERT INTO jobs (id,type,title,detail,state,value,risk,priority,source,next_action,closure,report,evidence,created_at,updated_at,completed_at)
  VALUES (@id,@type,@title,@detail,@state,@value,@risk,@priority,@source,@next_action,@closure,@report,@evidence,@created_at,@updated_at,@completed_at)
  ON CONFLICT(id) DO UPDATE SET type=excluded.type,title=excluded.title,detail=excluded.detail,priority=excluded.priority,value=excluded.value,risk=excluded.risk,next_action=excluded.next_action,closure=excluded.closure,updated_at=excluded.updated_at`);

/** Add (or upsert) a job. Returns the job id. Stable id from the title so re-seeding is idempotent. */
export function addJob(db, job = {}) {
  const id = job.id || jid(job.title || 'job');
  const now = nowIso();
  const existing = db.prepare('SELECT created_at FROM jobs WHERE id=?').get(id);
  const pr = (job.priority && PRIORITY[job.priority] != null) ? job.priority : 'medium';
  upsert(db).run({
    id, type: JOB_TYPES.includes(job.type) ? job.type : 'improvement',
    title: job.title || 'untitled job', detail: job.detail || '', state: JOB_STATES.includes(job.state) ? job.state : 'open',
    value: Number.isFinite(job.value) ? job.value : 0.6, risk: Number.isFinite(job.risk) ? job.risk : 0.4,
    priority: pr, source: job.source || 'manual',
    next_action: job.nextAction || '', closure: job.closureCondition || '', report: job.report || '',
    evidence: JSON.stringify(job.evidence || []),
    created_at: existing?.created_at || now, updated_at: now, completed_at: job.completedAt || null,
  });
  return id;
}

const rowToJob = (r) => ({
  id: r.id, type: r.type, title: r.title, detail: r.detail, state: r.state,
  value: r.value, risk: r.risk, priority: r.priority, source: r.source,
  nextAction: r.next_action, closureCondition: r.closure, report: r.report,
  evidence: JSON.parse(r.evidence || '[]'),
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
});

export function listJobs(db, { state, type, limit = 200 } = {}) {
  let sql = 'SELECT * FROM jobs WHERE 1=1'; const p = {};
  if (state) { sql += ' AND state=@state'; p.state = state; }
  if (type) { sql += ' AND type=@type'; p.type = type; }
  sql += ' ORDER BY updated_at DESC LIMIT @limit'; p.limit = limit;
  return db.prepare(sql).all(p).map(rowToJob);
}

/**
 * Rank OPEN jobs by OpenMass (openprocess-pool) + a priority boost. Returns [{...job, mass, terms}] desc.
 * Maps each job to an OpenProcess: staleness from days-since-update, value/risk carried, priority adds mass.
 */
export function rankJobs(db, { includeStates = ['open', 'active', 'blocked'] } = {}) {
  const jobs = listJobs(db, {}).filter((j) => includeStates.includes(j.state));
  const procs = jobs.map((j) => ({
    id: j.id, type: j.type, title: j.title, state: j.state === 'active' ? 'active' : j.state === 'blocked' ? 'blocked' : 'open',
    value: j.value, risk: j.risk,
    evidence: [{ age: daysSince(j.updatedAt), halfLife: 14, base: 0.5 }],
  }));
  const ranked = rankPool(procs);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return ranked.map((r) => {
    const j = byId.get(r.id);
    const boost = PRIORITY[j.priority] || 0.5;
    return { ...j, mass: Number((r.mass + boost).toFixed(4)), terms: r.terms };
  }).sort((a, b) => b.mass - a.mass);
}

/** Mark a job active (claimed by a runner). */
export function claimJob(db, id) {
  db.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=? AND state IN (?,?,?)').run('active', nowIso(), id, 'open', 'blocked', 'active');
  return rowToJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
}

/** Complete a job with a build report. state→done. */
export function completeJob(db, id, report) {
  const now = nowIso();
  db.prepare('UPDATE jobs SET state=?, report=?, updated_at=?, completed_at=? WHERE id=?').run('done', String(report || ''), now, now, id);
  return rowToJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
}

/** Record a company self-improvement recommendation as a 'recommended' job (owner promotes to 'open'). */
export function recommendJob(db, job = {}) {
  return addJob(db, { ...job, state: 'recommended', source: job.source || 'recommender' });
}

export function jobStats(db) {
  const byState = {}; for (const r of db.prepare('SELECT state, COUNT(*) c FROM jobs GROUP BY state').all()) byState[r.state] = r.c;
  const byType = {}; for (const r of db.prepare('SELECT type, COUNT(*) c FROM jobs GROUP BY type').all()) byType[r.type] = r.c;
  const total = db.prepare('SELECT COUNT(*) c FROM jobs').get().c;
  return { total, byState, byType, open: byState.open || 0, done: byState.done || 0, recommended: byState.recommended || 0 };
}

/** Idempotently seed the pool with a set of jobs (upsert by stable id). Returns count. */
export function seedPool(db, jobs = []) {
  let n = 0; for (const j of jobs) { addJob(db, j); n += 1; } return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2); const db = openPool();
  if (argv.includes('--seed')) { import('./job-pool-seed.mjs').then((m) => { const n = seedPool(db, m.SEED_JOBS); process.stdout.write(`seeded ${n} jobs\n`); }).catch((e) => process.stderr.write(`seed: ${e.message}\n`)); }
  else if (argv.includes('--rank')) { for (const j of rankJobs(db).slice(0, 20)) process.stdout.write(`  ${String(j.mass).padStart(7)}  [${j.priority}/${j.type}] ${j.title}\n`); }
  else if (argv.includes('--stats')) { process.stdout.write(`${JSON.stringify(jobStats(db), null, 2)}\n`); }
  else if (argv.includes('--add')) { const i = argv.indexOf('--add'); try { const id = addJob(db, JSON.parse(argv[i + 1])); process.stdout.write(`added ${id}\n`); } catch (e) { process.stderr.write(`add: ${e.message}\n`); } }
  else { for (const j of listJobs(db, {}).slice(0, 30)) process.stdout.write(`  ${j.state.padEnd(11)} [${j.priority}/${j.type}] ${j.title}\n`); }
}
