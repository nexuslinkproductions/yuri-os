#!/usr/bin/env node
// @capability: work-ledger
// @serves: work ledger | organize all created work | artifact funnel | run registry | company work index | track agentic output | what work was produced | work database
// @does: the auto-funnel for everything the agentic system (MURE / runSwarm / sessions) produces — a SQLite relational store (runs × artifacts × role_outputs × activity × links) that auto-captures from three sources (.claude/jobs/*/manifest.json run records, per-run results packets, and a bounded sweep of the durable output dirs), and exposes a single overview() query matching the dashboard data contract. The missing unified funnel on top of YURI's filing-system + artifact-registry + search corpus (capability-first: those handle placement/catalog/full-text; this is the run+output ledger that ties them together). The archivist role's backing organ.
// @use: import { openLedger, ingestAll, overview } from work-ledger.mjs. CLI: node work-ledger.mjs --ingest | --overview | --stats | --recent. DB at _SYSTEM/OS_KERNEL/work-ledger.db (gitignored). Read-only on the repo; only writes its own DB.
// @exports: openLedger, ensureSchema, ingestRun, ingestArtifact, recordActivity, ingestJobs, ingestOutputs, pruneMissing, ingestAll, overview, DB_PATH, OUTPUT_ROOTS
//
// Authority: descriptive index. The ledger RECORDS what was produced; it never mutates the artifacts it
// indexes and never finalizes. Idempotent (INSERT OR REPLACE on stable keys) — safe to re-ingest every poll.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
  const arts = ingestOutputs(db);
  const pruned = pruneMissing(db);
  return { runs, artifacts: arts, pruned };
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
  const artifacts = db.prepare('SELECT * FROM artifacts ORDER BY created DESC LIMIT 200').all().map((a) => ({
    id: a.id, kind: a.kind, title: a.title, path: a.path, run: a.run, role: a.role,
    created: a.created, tags: JSON.parse(a.tags || '[]'), status: a.status, bytes: a.bytes,
  }));
  const byKind = {}; for (const a of artifacts) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  const byGroup = {}; for (const a of artifacts) { const g = a.role ? groupOf[a.role] : null; if (g) byGroup[g] = (byGroup[g] || 0) + 1; }
  const throughMap = {}; for (const a of artifacts) { const d = (a.created || '').slice(0, 10); if (d) throughMap[d] = (throughMap[d] || 0) + 1; }
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
      artifactsToday: artifacts.filter((a) => (a.created || '').slice(0, 10) === today).length,
      convergenceRate: totalRuns ? +(convergedRuns / totalRuns).toFixed(2) : 0,
    },
    roles, groups: ['orchestration', 'research', 'engineering', 'verification', 'knowledge', 'operations'],
    runs, artifacts, stats: { byKind, byGroup, throughput }, activity,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
