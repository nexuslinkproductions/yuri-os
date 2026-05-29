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
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const INDEX_DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'search-index.db');

// Meaningful corpus roots — the stuff worth finding. NOT the whole repo.
export const DEFAULT_ROOTS = ['_SYSTEM', 'skills', '01_PROJECTS', '04_ARCHIVE', '.claude/rules'];

// Hard exclusions (path substring). Protected surfaces + churny/duplicate/binary noise.
const EXCLUDE_SUBSTR = [
  'node_modules/', '/.git/', 'backend/data/', '.claude/projects/', '/worktrees/',
  '.codex-worktrees/', '.smart-env/', '/archive/legacy-purge', '.claude/state/',
  '.claude/history', 'OS_KERNEL/memory.db', 'OS_KERNEL/semantic-memory.db', 'search-index.db',
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
  const roots = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--root' && argv[i + 1]) roots.push(argv[++i]);
  const useRoots = roots.length ? roots : DEFAULT_ROOTS;

  const db = new Database(INDEX_DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db, full);

  const getFile = db.prepare('SELECT mtime FROM files WHERE path = ?');
  const delDocs = db.prepare('DELETE FROM docs WHERE path = ?');
  const delFile = db.prepare('DELETE FROM files WHERE path = ?');
  const insDoc = db.prepare('INSERT INTO docs (path, title, body) VALUES (?, ?, ?)');
  const upFile = db.prepare('INSERT OR REPLACE INTO files (path, mtime, indexed_at) VALUES (?, ?, ?)');

  let indexed = 0, skipped = 0, removed = 0, errors = 0;
  const seen = new Set();
  const now = new Date().toISOString();

  // Batched commits: each flush is its own transaction → small WAL, visible progress, no giant
  // single-transaction stall. Checkpoint the WAL periodically so it never balloons.
  const flush = db.transaction((items) => {
    for (const it of items) {
      delDocs.run(it.rel);
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

  for (const root of useRoots) {
    const absRoot = path.resolve(REPO_ROOT, root);
    for (const { abs, rel } of walk(absRoot)) {
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
  }
  commit();

  // Prune entries whose files no longer exist (own transaction).
  db.transaction(() => {
    for (const { path: p } of db.prepare('SELECT path FROM files').all()) {
      if (!seen.has(p)) { delDocs.run(p); delFile.run(p); removed++; }
    }
  })();

  db.pragma('wal_checkpoint(TRUNCATE)');
  const total = db.prepare('SELECT COUNT(*) c FROM docs').get().c;
  db.close();
  console.log(JSON.stringify({
    ok: true, mode: full ? 'full' : 'incremental', roots: useRoots,
    indexed, skipped, removed, errors, totalDocs: total, db: path.relative(REPO_ROOT, INDEX_DB_PATH),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) run();
