#!/usr/bin/env node
// @capability: work-ledger
// @serves: work ledger | organize all created work | artifact funnel | run registry | company work index | track agentic output | what work was produced | work database
// @does: the auto-funnel for everything the agentic system (MURE / runSwarm / sessions) produces — a SQLite relational store (runs × artifacts × role_outputs × activity × links) that auto-captures from three sources (.claude/jobs/*/manifest.json run records, per-run results packets, and a bounded sweep of the durable output dirs), and exposes a single overview() query matching the dashboard data contract. The missing unified funnel on top of YURI's filing-system + artifact-registry + search corpus (capability-first: those handle placement/catalog/full-text; this is the run+output ledger that ties them together). The archivist role's backing organ.
// @use: import { openLedger, ingestAll, overview } from work-ledger.mjs. CLI: node work-ledger.mjs --ingest | --overview | --stats | --recent. DB at _SYSTEM/OS_KERNEL/work-ledger.db (gitignored). Read-only on the repo; only writes its own DB.
// @exports: openLedger, ensureSchema, ingestRun, ingestArtifact, recordActivity, ingestJobs, ingestOutputs, ingestActiveRuns, pruneMissing, ingestAll, overview, getRunDetail, getArtifactsByRole, getThroughputTrend, getConvergenceTrend, getRoleProductivityTrends, DB_PATH, OUTPUT_ROOTS
//
// Authority: descriptive index. The ledger RECORDS what was produced; it never mutates the artifacts it
// indexes and never finalizes. Idempotent (INSERT OR REPLACE on stable keys) — safe to re-ingest every poll.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { loadRoster } from '../mure/role-registry.mjs';
import { isMureArmed, MURE_NAME } from '../mure/company.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'work-ledger.db');
const JOBS_DIR = path.join(REPO_ROOT, '.claude', 'jobs');
// Bounded output roots — the durable agentic output surfaces, NOT the whole repo.
export const OUTPUT_ROOTS = [
  { dir: path.join(REPO_ROOT, '_SYSTEM', 'mure'), recurse: false },
  { dir: path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH'), recurse: true, maxDepth: 2 },
];

const nowIso = () => new Date().toISOString();
const sha8 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);

export function openLedger(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSchema(db);
  return db;
}

export function ensureSchema(db) {
  // Check if we need to migrate from old schema
  const oldSchema = db.prepare("SELECT sql FROM sqlite_master WHERE name='runs' AND sql LIKE '%run_id%'").get();
  if (oldSchema) {
    // Drop old tables and recreate with new schema
    db.exec(`DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS activity; DROP TABLE IF EXISTS role_outputs; DROP TABLE IF EXISTS artifacts; DROP TABLE IF EXISTS runs;`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, kind TEXT, summary TEXT, status TEXT,
      started TEXT, finished TEXT, rounds INTEGER, leaf_count INTEGER,
      converged INTEGER, finalize_ok INTEGER, roles TEXT, session TEXT, ingested_at TEXT
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, kind TEXT, title TEXT, path TEXT UNIQUE, run TEXT, role TEXT,
      created TEXT, tags TEXT, status TEXT, bytes INTEGER, ingested_at TEXT
    );
    CREATE TABLE IF NOT EXISTS role_outputs (
      run_id TEXT, role TEXT, label TEXT, status TEXT, chars INTEGER, PRIMARY KEY (run_id, role)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY, ts TEXT, type TEXT, detail TEXT
    );
    CREATE TABLE IF NOT EXISTS links ( from_id TEXT, to_id TEXT, type TEXT, PRIMARY KEY (from_id, to_id, type) );
    CREATE INDEX IF NOT EXISTS idx_art_kind ON artifacts(kind);
    CREATE INDEX IF NOT EXISTS idx_art_created ON artifacts(created);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started);
  `);
}

const upsertRun = (db) => db.prepare(`INSERT INTO runs (id,kind,summary,status,started,finished,rounds,leaf_count,converged,finalize_ok,roles,session,ingested_at)
  VALUES (@id,@kind,@summary,@status,@started,@finished,@rounds,@leaf_count,@converged,@finalize_ok,@roles,@session,@ingested_at)
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,finished=excluded.finished,rounds=excluded.rounds,converged=excluded.converged,finalize_ok=excluded.finalize_ok,roles=excluded.roles,ingested_at=excluded.ingested_at`);
const upsertArtifact = (db) => db.prepare(`INSERT INTO artifacts (id,kind,title,path,run,role,created,tags,status,bytes,ingested_at)
  VALUES (@id,@kind,@title,@path,@run,@role,@created,@tags,@status,@bytes,@ingested_at)
  ON CONFLICT(path) DO UPDATE SET kind=excluded.kind,title=excluded.title,bytes=excluded.bytes,status=excluded.status,ingested_at=excluded.ingested_at`);
const upsertRoleOut = (db) => db.prepare(`INSERT INTO role_outputs (run_id,role,label,status,chars) VALUES (@run_id,@role,@label,@status,@chars)
  ON CONFLICT(run_id,role) DO UPDATE SET label=excluded.label,status=excluded.status,chars=excluded.chars`);
const upsertActivity = (db) => db.prepare(`INSERT OR IGNORE INTO activity (id,ts,type,detail) VALUES (@id,@ts,@type,@detail)`);

export function recordActivity(db, type, detail, ts = nowIso()) {
  upsertActivity(db).run({ id: sha8(`${type}|${detail}|${ts}`), ts, type, detail });
}

/** Ingest one runSwarm/MURE manifest object. Returns the run id. */
export function ingestRun(db, manifest, { session = null } = {}) {
  if (!manifest || !manifest.runId) return null;
  const roles = Array.isArray(manifest.leaves) ? manifest.leaves : [];
  const status = manifest.converged ? 'converged' : (manifest.forced ? 'forced' : (manifest.finishedAt ? 'failed' : 'running'));
  upsertRun(db).run({
    id: manifest.runId, kind: manifest.kind || 'swarm',
    summary: manifest.summary || `${roles.length}-leaf run`, status,
    started: manifest.startedAt || null, finished: manifest.finishedAt || null,
    rounds: Number(manifest.rounds || 0), leaf_count: roles.length,
    converged: manifest.converged ? 1 : 0, finalize_ok: manifest.finalizeOk ? 1 : 0,
    roles: JSON.stringify(roles), session, ingested_at: nowIso(),
  });
  // per-run result packets → role_outputs + artifacts
  const resultsDir = manifest.runDir || path.join(JOBS_DIR, manifest.runId, 'results');
  try {
    for (const f of fs.readdirSync(resultsDir).filter((x) => x.endsWith('.json'))) {
      try {
        const pkt = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
        upsertRoleOut(db).run({ run_id: manifest.runId, role: pkt.role || f.replace('.json', ''), label: pkt.resultLabel || '', status: pkt.status || 'fail', chars: (pkt.text || '').length });
      } catch { /* skip malformed packet */ }
    }
  } catch { /* no results dir */ }
  recordActivity(db, 'run', `${manifest.runId} ${status} (${roles.join(', ')})`, manifest.finishedAt || manifest.startedAt || nowIso());
  return manifest.runId;
}

const KIND_BY_EXT = (p) => {
  if (/\.test\.mjs$/.test(p)) return 'test';
  if (/\.mjs$/.test(p)) return 'module';
  if (/\.html$/.test(p)) return 'blueprint';
  if (/manifest\.json$/.test(p)) return 'manifest';
  if (/\.json$/.test(p)) return 'config';
  if (/00-.*BLUEPRINT|blueprint/i.test(p)) return 'blueprint';
  if (/\.md$/.test(p)) return 'doc';
  return 'file';
};

export function ingestArtifact(db, { absPath, run = null, role = null, tags = [] }) {
  let st;
  try { st = fs.statSync(absPath); } catch { return null; }
  if (!st.isFile()) return null;
  const rel = path.relative(REPO_ROOT, absPath);
  const title = path.basename(absPath);
  upsertArtifact(db).run({
    id: sha8(rel), kind: KIND_BY_EXT(rel), title, path: rel, run, role,
    created: st.birthtime ? new Date(st.birthtime).toISOString() : new Date(st.mtime).toISOString(),
    tags: JSON.stringify(tags), status: 'active', bytes: st.size, ingested_at: nowIso(),
  });
  return rel;
}

// Scan the per-run manifests under .claude/jobs (one manifest.json per run) into runs + outputs.
export function ingestJobs(db) {
  let n = 0;
  let dirs;
  try { dirs = fs.readdirSync(JOBS_DIR); } catch { return 0; }
  for (const d of dirs) {
    const mf = path.join(JOBS_DIR, d, 'manifest.json');
    try {
      if (fs.existsSync(mf)) { ingestRun(db, JSON.parse(fs.readFileSync(mf, 'utf8'))); n += 1; }
    } catch { /* skip */ }
  }
  return n;
}

/** Bounded sweep of the durable output roots → artifacts. */
export function ingestOutputs(db, roots = OUTPUT_ROOTS) {
  let n = 0;
  const walk = (dir, depth, maxDepth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) walk(full, depth + 1, maxDepth); continue; }
      if (e.name.startsWith('.')) continue;
      if (ingestArtifact(db, { absPath: full })) n += 1;
    }
  };
  for (const r of roots) walk(r.dir, 0, r.recurse ? (r.maxDepth || 3) : 0);
  return n;
}

/** Full incremental ingest (idempotent — safe every poll). */
// Drop artifact rows whose file no longer exists on disk — the funnel must reflect REALITY (deleted /
// relocated work disappears), not accumulate ghosts. Runs are historical (their manifests persist) and are
// left intact.
export function pruneMissing(db) {
  let removed = 0;
  const del = db.prepare('DELETE FROM artifacts WHERE path = ?');
  for (const { path: p } of db.prepare('SELECT path FROM artifacts').all()) {
    if (!fs.existsSync(path.join(REPO_ROOT, p))) { del.run(p); removed += 1; }
  }
  return removed;
}

export function ingestAll(db) {
  const runs = ingestJobs(db);
  const active = ingestActiveRuns(db);
  const arts = ingestOutputs(db);
  const pruned = pruneMissing(db);
  return { runs, active, artifacts: arts, pruned };
}

/** Parse a run dir's live-state artifacts: status.json (runSwarm rounds) + spawns.jsonl (fleet child spawns). */
function readRunLiveState(runId, jobsDir = JOBS_DIR) {
  const base = path.join(jobsDir, runId);
  let status = null; let spawns = [];
  try { const p = path.join(base, 'status.json'); if (fs.existsSync(p)) status = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* malformed status */ }
  try {
    const p = path.join(base, 'spawns.jsonl');
    if (fs.existsSync(p)) spawns = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* unreadable spawns */ }
  return { status, spawns };
}

/**
 * Live-run ingest — runs that have NOT yet written a final manifest become visible from their
 * in-flight artifacts: status.json (runSwarm round loop) and/or spawns.jsonl (glm/ollama fleet
 * child spawns). manifest.json stays the final truth: once it exists, ingestJobs owns the row.
 */
export function ingestActiveRuns(db, jobsDir = JOBS_DIR) {
  let n = 0;
  let dirs;
  try { dirs = fs.readdirSync(jobsDir); } catch { return 0; }
  for (const d of dirs) {
    if (fs.existsSync(path.join(jobsDir, d, 'manifest.json'))) continue; // final truth already ingested
    const { status, spawns } = readRunLiveState(d, jobsDir);
    if (!status && !spawns.length) continue;
    // open spawns = spawned lines without a matching ended line (keyed by label|pid)
    const open = new Map();
    for (const s of spawns) {
      const k = `${s.label}|${s.pid}`;
      if (s.spawnedAt) open.set(k, s);
      if (s.endedAt) open.delete(k);
      if (s.spawnedAt) recordActivity(db, 'spawn', `${d}/${s.label} lane=${s.lane || '?'} pid=${s.pid}`, s.spawnedAt);
      if (s.endedAt) recordActivity(db, 'spawn-end', `${d}/${s.label} pid=${s.pid} exit=${s.exitCode ?? '?'} ${s.status || ''}`.trim(), s.endedAt);
    }
    const live = status ? ['running', 'running-stragglers'].includes(status.status) : open.size > 0;
    const started = status?.startedAt || spawns.find((s) => s.spawnedAt)?.spawnedAt || null;
    const finished = status?.endedAt
      || (!live && spawns.length ? spawns.filter((s) => s.endedAt).map((s) => s.endedAt).sort().pop() || null : null);
    const runStatus = live ? 'running' : (status?.status === 'failed' ? 'failed' : (spawns.length || status ? 'done' : 'unknown'));
    if (runStatus === 'unknown') continue;
    const labels = [...new Set(spawns.map((s) => s.label).filter(Boolean))];
    upsertRun(db).run({
      id: d, kind: d.split('-')[0] || 'run',
      summary: status?.summary || `${status?.totalLeaves ?? labels.length}-lane run (live)`,
      status: runStatus, started, finished,
      rounds: Number(status?.round || 0),
      leaf_count: Number(status?.totalLeaves ?? labels.length),
      converged: status?.converged ? 1 : 0, finalize_ok: 0,
      roles: JSON.stringify(status?.pending?.length ? status.pending : labels),
      session: null, ingested_at: nowIso(),
    });
    n += 1;
  }
  return n;
}

/** The single overview() query — matches the dashboard data contract exactly. */
export function overview(db) {
  const roster = loadRoster();
  const runRoleCounts = {}; const artRoleCounts = {}; const roleLast = {};
  for (const r of db.prepare('SELECT roles, started FROM runs').all()) {
    for (const rid of JSON.parse(r.roles || '[]')) { runRoleCounts[rid] = (runRoleCounts[rid] || 0) + 1; if (!roleLast[rid] || (r.started || '') > roleLast[rid]) roleLast[rid] = r.started; }
  }
  for (const a of db.prepare("SELECT role, COUNT(*) c FROM artifacts WHERE role IS NOT NULL GROUP BY role").all()) artRoleCounts[a.role] = a.c;
  const activeRoleIds = new Set(db.prepare("SELECT roles FROM runs WHERE status='running'").all().flatMap((r) => JSON.parse(r.roles || '[]')));

  const roles = roster.roles.map((r) => ({
    id: r.id, name: r.name, group: r.group, archetype: r.archetype,
    substrate: r.substrate, lane: r.lane, autonomyClass: r.autonomyClass,
    capabilities: Array.isArray(r.capabilities) ? r.capabilities : [], mission: r.mission || '',
    runs: runRoleCounts[r.id] || 0, artifacts: artRoleCounts[r.id] || 0,
    lastActive: roleLast[r.id] || null, status: activeRoleIds.has(r.id) ? 'active' : 'idle',
  }));
  const groupOf = Object.fromEntries(roster.roles.map((r) => [r.id, r.group]));

  const runs = db.prepare('SELECT * FROM runs ORDER BY COALESCE(started, ingested_at) DESC LIMIT 60').all().map((r) => ({
    id: r.id, kind: r.kind, summary: r.summary, status: r.status, started: r.started, finished: r.finished,
    rounds: r.rounds, leafCount: r.leaf_count, roles: JSON.parse(r.roles || '[]'), finalizeOk: !!r.finalize_ok,
  }));
  // Recent list for the table (bounded for payload size); the dashboard renders the most recent of these.
  const artifacts = db.prepare('SELECT * FROM artifacts ORDER BY created DESC LIMIT 500').all().map((a) => ({
    id: a.id, kind: a.kind, title: a.title, path: a.path, run: a.run, role: a.role,
    created: a.created, tags: JSON.parse(a.tags || '[]'), status: a.status, bytes: a.bytes,
  }));
  // Counts / bars / throughput aggregate over the FULL artifacts table (not the capped recent list) so the
  // panel reflects everything, not just the last N. (Fix: the 200-cap made counts wrong vs totalArtifacts.)
  const byKind = {}; for (const a of db.prepare("SELECT COALESCE(kind,'file') k, COUNT(*) c FROM artifacts GROUP BY k").all()) byKind[a.k] = a.c;
  const byGroup = {}; for (const [rid, c] of Object.entries(artRoleCounts)) { const g = groupOf[rid]; if (g) byGroup[g] = (byGroup[g] || 0) + c; }
  const throughMap = {}; for (const a of db.prepare("SELECT substr(created,1,10) d, COUNT(*) c FROM artifacts WHERE created IS NOT NULL GROUP BY d").all()) throughMap[a.d] = a.c;
  const throughput = Object.entries(throughMap).sort().slice(-21).map(([date, count]) => ({ date, count }));
  const today = nowIso().slice(0, 10);

  const totalRuns = db.prepare('SELECT COUNT(*) c FROM runs').get().c;
  const totalArtifacts = db.prepare('SELECT COUNT(*) c FROM artifacts').get().c;
  const activeRuns = db.prepare("SELECT COUNT(*) c FROM runs WHERE status='running'").get().c;
  const convergedRuns = db.prepare("SELECT COUNT(*) c FROM runs WHERE converged=1").get().c;
  const activity = db.prepare('SELECT ts,type,detail FROM activity ORDER BY ts DESC LIMIT 40').all();

  return {
    company: { name: roster.meta.name || MURE_NAME, kanji: roster.meta.kanji || '', armed: isMureArmed(), roleCount: roster.roles.length, generatedAt: nowIso() },
    kpis: {
      totalRuns, totalArtifacts, activeRuns,
      rolesActive: roles.filter((r) => r.status === 'active').length,
      artifactsToday: db.prepare('SELECT COUNT(*) c FROM artifacts WHERE substr(created,1,10)=?').get(today).c,
      convergenceRate: totalRuns ? +(convergedRuns / totalRuns).toFixed(2) : 0,
    },
    roles, groups: ['orchestration', 'research', 'engineering', 'verification', 'knowledge', 'operations'],
    runs, artifacts, stats: { byKind, byGroup, throughput }, activity,
  };
}

const mapArtifactRow = (a) => ({
  id: a.id, kind: a.kind, title: a.title, path: a.path, run: a.run, role: a.role,
  created: a.created, tags: JSON.parse(a.tags || '[]'), status: a.status, bytes: a.bytes,
});

/** Drawer contract for GET /api/run?id= — {run, roleOutputs, artifacts, spawns, liveStatus}. */
export function getRunDetail(db, runId) {
  const r = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!r) return null;
  const run = {
    id: r.id, kind: r.kind, summary: r.summary, status: r.status, started: r.started, finished: r.finished,
    rounds: r.rounds, leafCount: r.leaf_count, converged: !!r.converged, finalizeOk: !!r.finalize_ok,
    roles: JSON.parse(r.roles || '[]'),
  };
  const roleOutputs = db.prepare('SELECT role, label, status, chars FROM role_outputs WHERE run_id = ? ORDER BY role').all(runId);
  const artifacts = db.prepare('SELECT * FROM artifacts WHERE run = ? ORDER BY created DESC LIMIT 100').all(runId).map(mapArtifactRow);
  const { status, spawns } = readRunLiveState(runId);
  return { run, roleOutputs, artifacts, spawns, liveStatus: status };
}

/** GET /api/artifacts?role=&run=&limit= — flat artifact list, newest first. */
export function getArtifactsByRole(db, { roleId = null, runId = null, limit = 100 } = {}) {
  const where = []; const args = [];
  if (roleId) { where.push('role = ?'); args.push(roleId); }
  if (runId) { where.push('run = ?'); args.push(runId); }
  const sql = `SELECT * FROM artifacts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created DESC LIMIT ?`;
  return db.prepare(sql).all(...args, Math.min(Number(limit) || 100, 500)).map(mapArtifactRow);
}

/** GET /api/trends?type=throughput — daily artifact counts over the window: [{date, count, avg}]. */
export function getThroughputTrend(db, days = 30, smoothWindow = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare("SELECT substr(created,1,10) d, COUNT(*) c FROM artifacts WHERE created IS NOT NULL AND substr(created,1,10) >= ? GROUP BY d ORDER BY d").all(since);
  const byDate = Object.fromEntries(rows.map((r) => [r.d, r.c]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, count: byDate[date] || 0 });
  }
  const w = Math.max(1, Number(smoothWindow) || 1);
  for (let i = 0; i < out.length; i += 1) {
    const slice = out.slice(Math.max(0, i - w + 1), i + 1);
    out[i].avg = +(slice.reduce((s, x) => s + x.count, 0) / slice.length).toFixed(2);
  }
  return out;
}

/** GET /api/trends?type=convergence — recent runs (oldest→newest) with cumulative runningRate. */
export function getConvergenceTrend(db, limit = 60) {
  const rows = db.prepare('SELECT id, started, converged FROM runs ORDER BY COALESCE(started, ingested_at) DESC LIMIT ?').all(Math.min(Number(limit) || 60, 500)).reverse();
  let seen = 0; let converged = 0;
  return rows.map((r) => {
    seen += 1; if (r.converged) converged += 1;
    return { id: r.id, started: r.started, converged: !!r.converged, runningRate: +(converged / seen).toFixed(3) };
  });
}

/** GET /api/trends?type=productivity — per-role daily artifact counts over the window. */
export function getRoleProductivityTrends(db, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare("SELECT role, substr(created,1,10) d, COUNT(*) c FROM artifacts WHERE role IS NOT NULL AND created IS NOT NULL AND substr(created,1,10) >= ? GROUP BY role, d ORDER BY role, d").all(since);
  const byRole = {};
  for (const r of rows) {
    (byRole[r.role] ||= { role: r.role, total: 0, days: [] });
    byRole[r.role].total += r.c;
    byRole[r.role].days.push({ date: r.d, count: r.c });
  }
  return Object.values(byRole).sort((a, b) => b.total - a.total);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const db = openLedger();
  if (argv.includes('--ingest') || argv.length === 0) {
    const r = ingestAll(db);
    process.stdout.write(`ingested ${r.runs} run-manifest(s) + ${r.artifacts} artifact(s) → ${path.relative(REPO_ROOT, DB_PATH)}\n`);
  }
  if (argv.includes('--overview')) process.stdout.write(`${JSON.stringify(overview(db), null, 2)}\n`);
  if (argv.includes('--stats')) {
    const o = overview(db);
    process.stdout.write(`${o.company.name} ${o.company.kanji} — runs:${o.kpis.totalRuns} artifacts:${o.kpis.totalArtifacts} active:${o.kpis.activeRuns} conv:${o.kpis.convergenceRate}\n`);
    process.stdout.write(`byKind ${JSON.stringify(o.stats.byKind)}\n`);
  }
  if (argv.includes('--recent')) {
    for (const r of overview(db).runs.slice(0, 12)) process.stdout.write(`  ${r.status.padEnd(10)} ${r.id}  [${r.roles.join(',')}]\n`);
  }
  db.close();
}
