#!/usr/bin/env node
/**
 * yuri-search-index.mjs — build/refresh the YURI corpus SEARCH index (FTS5/BM25).
 *
 * This is SEARCH, not MEMORY. It indexes the big pile of docs/code so you can FIND things
 * on demand. It is NOT loaded into context, NOT curated, NOT coupled to memory.db. See
 * _SYSTEM/reports/MEMORY_VS_SEARCH_DESIGN_2026-05-29.md.
 *
 *   Dependency: better-sqlite3 (already in repo) + its bundled SQLite FTS5. No Ollama, no embeddings.
 *   Store:      _SYSTEM/OS_KERNEL/search-index.db (separate DB — enforces the memory/search wall)
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-search-index.mjs            # incremental (only changed files, by mtime)
 *   node _SYSTEM/Scripts/yuri-search-index.mjs --full     # rebuild from scratch
 *   node _SYSTEM/Scripts/yuri-search-index.mjs --root <dir> [--root <dir>...]   # override roots
 *   node _SYSTEM/Scripts/yuri-search-index.mjs --file <path> [--file <path>...] # exact additive refresh
 *   node _SYSTEM/Scripts/yuri-search-index.mjs --additive     # refresh visible corpus without pruning
 *
 * External full-corpus staging (for a sparse canonical checkout):
 *   YURI_SEARCH_REPO_ROOT=/path/to/full-tree node .../yuri-search-index.mjs --full
 * Optional output override: YURI_SEARCH_INDEX_DB=/path/to/search-index.db
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function resolveSearchPaths(env = process.env, defaultRoot = path.resolve(__dirname, '../..')) {
  const repoRoot = path.resolve(env.YURI_SEARCH_REPO_ROOT || defaultRoot);
  const indexDbPath = path.resolve(env.YURI_SEARCH_INDEX_DB || path.join(repoRoot, '_SYSTEM', 'OS_KERNEL', 'search-index.db'));
  return { repoRoot, indexDbPath };
}
const SEARCH_PATHS = resolveSearchPaths();
export const REPO_ROOT = SEARCH_PATHS.repoRoot;
export const INDEX_DB_PATH = SEARCH_PATHS.indexDbPath;

// Meaningful corpus roots — the stuff worth finding. NOT the whole repo.
// wave-2 R.14: '.claude/memory' (Track B behavioral memories) joins the corpus —
// standing corrections were invisible to `ai search`. MEMORY.md stays excluded
// below (generated index, not source content).
export const DEFAULT_ROOTS = ['00_COMMAND-CENTER', '_SYSTEM', 'skills', '01_PROJECTS', '02_RESOURCES', '03_NEXUS-LINK', '04_ARCHIVE', '.claude/rules', '.claude/memory'];

// Hard exclusions (path substring). Protected surfaces + churny/duplicate/binary noise.
const EXCLUDE_SUBSTR = [
  'node_modules/', '/.git/', 'backend/data/', '.claude/projects/', '/worktrees/',
  '.codex-worktrees/', '.smart-env/', '/archive/legacy-purge', '.claude/state/',
  '.claude/history', 'OS_KERNEL/memory.db', 'OS_KERNEL/semantic-memory.db', 'search-index.db',
  '.claude/memory/MEMORY.md',
];
const INDEX_EXT = new Set(['.md', '.mjs', '.js', '.ts', '.json', '.sh', '.py', '.txt', '.html']);
const MAX_FILE_BYTES = 1_000_000;   // skip files larger than 1MB (logs, dumps)
const MAX_BODY_CHARS = 40_000;      // cap stored body per file (plenty for FTS match + snippets)
const BATCH = 400;                  // commit every N files — keeps the WAL small + shows progress
const NUL = String.fromCharCode(0); // null byte → binary-file guard

export function included(rel) {
  if (EXCLUDE_SUBSTR.some((s) => rel.includes(s))) return false;
  if (isProtectedPath(rel)) return false; // defense-in-depth: never index a protected surface
  return INDEX_EXT.has(path.extname(rel).toLowerCase());
}

function normalizedRepoRelative(candidate) {
  const absolute = path.resolve(REPO_ROOT, candidate);
  const rel = path.relative(REPO_ROOT, absolute).replaceAll(path.sep, '/');
  if (!rel || rel === '.' || rel === '..' || rel.startsWith('../')) {
    throw new Error(`index target must be a file or directory inside the repo: ${candidate}`);
  }
  return { absolute, rel: rel.replace(/\/+$/, '') };
}

/**
 * Whether an indexed path is inside the current refresh/prune scope.
 * Exact --file refreshes must never prune the rest of a sparse checkout's corpus.
 * Explicit --root refreshes likewise prune only beneath those requested roots.
 */
export function pathInScope(rel, { all = false, files = [], roots = [] } = {}) {
  const normalized = String(rel).replaceAll(path.sep, '/').replace(/^\.\//, '');
  if (all) return true;
  if (files.length) return files.includes(normalized);
  return roots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

/**
 * Git sparse checkouts cannot prove that an unseen corpus path was deleted. Detect
 * that condition before choosing a pruning scope; archive/external staging roots
 * have no Git worktree metadata and therefore evaluate as complete candidates.
 */
export function isSparseCheckoutRoot(repoRoot = REPO_ROOT) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'config', '--bool', 'core.sparseCheckout'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === 'true';
  } catch {
    return false;
  }
}

export function determinePruneScope({ full = false, additive = false, files = [], roots = [], sparseCheckout = false } = {}) {
  if (full && additive) throw new Error('--full and --additive are mutually exclusive');
  if (full && sparseCheckout) {
    throw new Error('--full is refused in a sparse checkout; rebuild from a complete external staging root');
  }
  if (files.length) return { files };
  if (additive) return {};
  if (sparseCheckout) return {}; // additive-only: absence is not deletion evidence
  if (roots.length) return { roots };
  return { all: true };
}

/** Delete FTS rows in bounded sets so UNINDEXED path matching scans once per
 * batch rather than once per file. */
export function deleteDocsByPaths(db, paths, batchSize = BATCH) {
  for (let offset = 0; offset < paths.length; offset += batchSize) {
    const batch = paths.slice(offset, offset + batchSize);
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    db.prepare(`DELETE FROM docs WHERE path IN (${placeholders})`).run(...batch);
  }
}

function* walk(absRoot) {
  let entries;
  try { entries = fs.readdirSync(absRoot, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const abs = path.join(absRoot, e.name);
    const rel = path.relative(REPO_ROOT, abs).replaceAll(path.sep, '/');
    if (EXCLUDE_SUBSTR.some((s) => (rel + '/').includes(s))) continue;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { yield* walk(abs); continue; }
    if (e.isFile() && included(rel)) yield { abs, rel };
  }
}

function firstHeading(body, rel) {
  const m = body.match(/^#{1,3}\s+(.+)$/m) || body.match(/^\s*(?:\/\/|#|\*)?\s*(.{4,80})$/m);
  return (m ? m[1] : path.basename(rel)).trim().slice(0, 120);
}

function initSchema(db, full) {
  if (full) { db.exec('DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS files;'); }
  // wave-2 R.19 — tokenizer contract for callers: porter unicode61 SPLITS on
  // _ and - (snake/kebab identifiers become sub-tokens: energy_tick → energy,
  // tick) but camelCase stays ONE token (scoreHit is a single term). So: search
  // 'scoreHit' for the exact camelCase identifier, 'score' for stem hits across
  // identifiers, and a quoted phrase ("energy tick") for adjacency.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
      path UNINDEXED, title, body, tokenize='porter unicode61'
    );
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, indexed_at TEXT NOT NULL
    );
  `);
}

function run() {
  const argv = process.argv.slice(2);
  const full = argv.includes('--full');
  const additive = argv.includes('--additive');
  const roots = [];
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) roots.push(argv[++i]);
    else if (argv[i] === '--file' && argv[i + 1]) files.push(argv[++i]);
  }
  if (files.length && roots.length) throw new Error('--file and --root are mutually exclusive');
  if (files.length && full) throw new Error('--full cannot be combined with --file');
  const useRoots = roots.length ? roots : DEFAULT_ROOTS;
  const fileTargets = files.map(normalizedRepoRelative);
  const rootTargets = roots.map(normalizedRepoRelative);
  const sparseCheckout = isSparseCheckoutRoot();
  const pruneScope = determinePruneScope({
    full,
    additive,
    sparseCheckout,
    files: fileTargets.map((target) => target.rel),
    roots: rootTargets.map((target) => target.rel),
  });

  fs.mkdirSync(path.dirname(INDEX_DB_PATH), { recursive: true });

  const db = new Database(INDEX_DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db, full);

  const getFile = db.prepare('SELECT mtime FROM files WHERE path = ?');
  const delFile = db.prepare('DELETE FROM files WHERE path = ?');
  const insDoc = db.prepare('INSERT INTO docs (path, title, body) VALUES (?, ?, ?)');
  const upFile = db.prepare('INSERT OR REPLACE INTO files (path, mtime, indexed_at) VALUES (?, ?, ?)');

  let indexed = 0, skipped = 0, removed = 0, errors = 0;
  const seen = new Set();
  const now = new Date().toISOString();

  // Batched commits: each flush is its own transaction → small WAL, visible progress, no giant
  // single-transaction stall. Checkpoint the WAL periodically so it never balloons.
  const flush = db.transaction((items) => {
    deleteDocsByPaths(db, items.map((item) => item.rel));
    for (const it of items) {
      insDoc.run(it.rel, it.title, it.body);
      upFile.run(it.rel, it.mtime, now);
    }
  });
  let pending = [];
  const commit = () => {
    if (!pending.length) return;
    flush(pending);
    pending = [];
    db.pragma('wal_checkpoint(PASSIVE)');
    process.stderr.write(`  indexed ${indexed}…\n`);
  };

  const sources = function* () {
    if (fileTargets.length) {
      for (const { absolute: abs, rel } of fileTargets) {
        let st;
        try { st = fs.statSync(abs); } catch { continue; }
        if (!st.isFile()) throw new Error(`--file target is not a file: ${rel}`);
        if (included(rel)) yield { abs, rel };
      }
      return;
    }
    for (const root of useRoots) {
      const absRoot = path.resolve(REPO_ROOT, root);
      yield* walk(absRoot);
    }
  };

  for (const { abs, rel } of sources()) {
      seen.add(rel);
      let st;
      try { st = fs.statSync(abs); } catch { errors++; continue; }
      if (st.size > MAX_FILE_BYTES) { skipped++; continue; }
      const mtime = Math.floor(st.mtimeMs);
      const prior = getFile.get(rel);
      if (!full && prior && prior.mtime === mtime) { skipped++; continue; }
      let body;
      try { body = fs.readFileSync(abs, 'utf8'); } catch { errors++; continue; }
      if (body.includes(NUL)) { skipped++; continue; } // binary guard
      pending.push({ rel, title: firstHeading(body, rel), mtime, body: body.slice(0, MAX_BODY_CHARS) });
      indexed++;
      if (pending.length >= BATCH) commit();
  }
  commit();

  // Prune entries whose files no longer exist inside THIS invocation's scope. This distinction is
  // mandatory for sparse worktrees: unseen paths outside an exact --file/--root refresh are still
  // valid corpus entries and must not be erased.
  db.transaction(() => {
    const stale = [];
    for (const { path: p } of db.prepare('SELECT path FROM files').all()) {
      if (pathInScope(p, pruneScope) && !seen.has(p)) stale.push(p);
    }
    deleteDocsByPaths(db, stale);
    for (const p of stale) delFile.run(p);
    removed = stale.length;
  })();

  db.pragma('wal_checkpoint(TRUNCATE)');
  const total = db.prepare('SELECT COUNT(*) c FROM docs').get().c;
  db.close();
  console.log(JSON.stringify({
    ok: true, mode: full ? 'full' : files.length ? 'exact-files' : 'incremental', roots: files.length ? [] : useRoots,
    files: fileTargets.map((target) => target.rel),
    sparseCheckout,
    pruneMode: pruneScope.all ? 'all' : pruneScope.files?.length ? 'exact-files' : pruneScope.roots?.length ? 'roots' : 'additive-only',
    indexed, skipped, removed, errors, totalDocs: total, db: path.relative(REPO_ROOT, INDEX_DB_PATH),
  }, null, 2));
}

// wave-2 R.9b: `--check-staleness` — exit 1 if the index predates the latest
// commit (warning-only contract lives in yuri-search.mjs; this is the CI/cron
// probe form). No reindex is triggered (D-R2).
async function checkStaleness() {
  const { indexStaleness } = await import('./yuri-search.mjs');
  const s = indexStaleness(INDEX_DB_PATH);
  console.log(JSON.stringify(s));
  process.exitCode = s.stale ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check-staleness')) await checkStaleness();
  else run();
}
