#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: session-work-logger
// @serves: log main-session work to the ledger | dashboard reflect reality | close pool job | record operator-lane work | sync commits to job pool | main session work not on dashboard | what did this session do
// @does: closes the observability gap where work the OPERATOR/main session does directly (not via nexus-company) never reaches the job pool, so the dashboard only shows cycle-run work. Three moves: (1) syncCommits — log main-branch git commits as DONE jobs (idempotent, stable id from sha, conventional-prefix → type), so every commit shows on the dashboard; (2) closeJob — mark an existing open pool job done (operator finished it by hand); (3) logCompleted — record a standalone completed work item. Pure store writes to the SAME gitignored work-ledger.db the company uses. Wired to fire automatically via the _SYSTEM/git-hooks/post-commit hook.
// @use: node session-work-logger.mjs --sync [sinceRef] | --done <id|match> [--report "..."] | --log '<json>' | --list-session. Import { syncCommits, closeJob, logCompleted } for programmatic use.
// @exports: syncCommits, closeJob, logCompleted, inferType, OPERATOR_SOURCE
import { execFileSync } from 'node:child_process';
import { openPool, addJob, completeJob, listJobs } from './job-pool.mjs';

export const OPERATOR_SOURCE = 'operator-lane';
const US = '\x1f'; // git format unit separator (won't appear in subjects)

// conventional-commit prefix → JOB_TYPES bucket (best-effort; the title carries the real detail)
const TYPE_MAP = { feat: 'improvement', fix: 'maintenance', refactor: 'maintenance', chore: 'maintenance', docs: 'maintenance', test: 'maintenance', memory: 'maintenance', research: 'research', perf: 'maintenance', build: 'infra', ci: 'infra' };
export function inferType(subject) {
  const m = /^([a-z]+)(\([^)]*\))?!?:/i.exec(String(subject || ''));
  return (m && TYPE_MAP[m[1].toLowerCase()]) || 'improvement';
}

function gitLog(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
  catch { return ''; }
}

/** Log main-branch commits as DONE jobs. Idempotent: id = commit-<sha10>, re-run skips already-logged. */
export function syncCommits(db = openPool(), { sinceRef = null, limit = 50, lane = OPERATOR_SOURCE } = {}) {
  const range = sinceRef ? `${sinceRef}..HEAD` : null;
  const args = ['log', `--pretty=format:%H${US}%cI${US}%s`, ...(range ? [range] : [`-n${limit}`]), 'HEAD'];
  const raw = gitLog(args).trim();
  if (!raw) return { logged: 0, skipped: 0, ids: [] };
  let logged = 0, skipped = 0; const ids = [];
  for (const line of raw.split('\n')) {
    const [sha, cdate, subject] = line.split(US);
    if (!sha || !subject) continue;
    const id = `commit-${sha.slice(0, 10)}`;
    if (db.prepare('SELECT 1 FROM jobs WHERE id=?').get(id)) { skipped++; continue; }
    addJob(db, {
      id, title: subject.slice(0, 120), detail: `commit ${sha.slice(0, 10)}`, type: inferType(subject),
      state: 'done', source: lane, priority: 'medium', report: `landed ${sha.slice(0, 10)}`,
      evidence: [sha], completedAt: cdate || null,
    });
    logged++; ids.push(id);
  }
  return { logged, skipped, ids };
}

/** Close an EXISTING open pool job the operator finished by hand. idOrMatch = exact id or a title regex. */
export function closeJob(db = openPool(), idOrMatch, report = '') {
  if (!idOrMatch) throw new Error('closeJob needs an id or title match');
  let job = listJobs(db, { limit: 500 }).find((j) => j.id === idOrMatch);
  if (!job) { const re = new RegExp(idOrMatch, 'i'); job = listJobs(db, { state: 'open', limit: 500 }).find((j) => re.test(j.title)); }
  if (!job) return { ok: false, reason: 'no matching job' };
  completeJob(db, job.id, report);
  return { ok: true, id: job.id, title: job.title };
}

/** Record a standalone completed work item; if its title matches an existing OPEN job, close that instead. */
export function logCompleted(db = openPool(), { title, detail = '', type = 'improvement', report = '', evidence = [], source = OPERATOR_SOURCE } = {}) {
  if (!title) throw new Error('logCompleted needs a title');
  const existing = listJobs(db, { limit: 500 }).find((j) => j.title === title);
  if (existing && existing.state !== 'done') { completeJob(db, existing.id, report || detail); return { id: existing.id, closed: true }; }
  const id = addJob(db, { title, detail, type, state: 'done', source, report, evidence, completedAt: new Date().toISOString() });
  return { id, closed: false };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2); const db = openPool();
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--sync')) {
    const r = syncCommits(db, { sinceRef: val('--sync') && !val('--sync').startsWith('--') ? val('--sync') : null });
    process.stdout.write(`synced: ${r.logged} logged, ${r.skipped} already-logged\n`);
  } else if (argv.includes('--done')) {
    const r = closeJob(db, val('--done'), val('--report') || 'closed by operator lane');
    process.stdout.write(r.ok ? `closed ${r.id} → ${r.title}\n` : `not closed: ${r.reason}\n`);
  } else if (argv.includes('--log')) {
    try { const r = logCompleted(db, JSON.parse(val('--log'))); process.stdout.write(`${r.closed ? 'closed' : 'logged'} ${r.id}\n`); }
    catch (e) { process.stderr.write(`log: ${e.message}\n`); process.exit(1); }
  } else if (argv.includes('--list-session')) {
    for (const j of listJobs(db, { state: 'done', limit: 500 }).filter((j) => j.source === OPERATOR_SOURCE)) process.stdout.write(`  ${j.completedAt?.slice(0, 10) || ''}  ${j.title}\n`);
  } else {
    process.stdout.write('usage: session-work-logger.mjs --sync [ref] | --done <id|match> [--report ..] | --log \'<json>\' | --list-session\n');
  }
}
