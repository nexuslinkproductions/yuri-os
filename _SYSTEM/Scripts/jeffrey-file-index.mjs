#!/usr/bin/env node
/**
 * jeffrey-file-index.mjs — Jeffrey's LOCAL knowledge of René's own files (FTS5/BM25).
 *
 * Builds a searchable index over René's real folders (CGS CAD, holster blocking, laser projects,
 * business docs) so Jeffrey can answer "what do I have about X". SEPARATE from the repo corpus and
 * from memory — the DB lives OUTSIDE git (gitignored), so personal/customer data NEVER leaves the
 * machine and never enters the repo (Rule B: local-only).
 *
 *   Dependency: better-sqlite3 (already in repo) + its bundled SQLite FTS5. No embeddings, no install.
 *   Store:      _SYSTEM/state/jeffrey/files-index.db  (gitignored — local only)
 *   Roots:      _SYSTEM/state/jeffrey/index-roots.json  (["C:/Users/rene/Desktop/CAD", ...]) or --root
 *
 * What it indexes:
 *   - EVERY file's path + name + extension + folder  → so filename search works over binaries too
 *     (STL, .shapr, .3mf, .step, .dxf, images — "do I have a Glock 17 TLR-1 design?").
 *   - CONTENT (full text) for text-extractable extensions (md, txt, csv, svg, gcode, json, …), capped.
 *   - PDF/Word/Excel text = NOT yet (needs a package install — owner-gated; flagged, see --help).
 *
 * Usage:
 *   node _SYSTEM/Scripts/jeffrey-file-index.mjs                       # incremental index of configured roots
 *   node _SYSTEM/Scripts/jeffrey-file-index.mjs --full                # rebuild from scratch
 *   node _SYSTEM/Scripts/jeffrey-file-index.mjs --root "C:/path" ...  # override roots
 *   node _SYSTEM/Scripts/jeffrey-file-index.mjs --query "glock 17 tlr1" [--limit 10]   # search (JSON)
 */
// @capability: jeffrey-file-index
// @serves: index my local files | what do I have | second brain over my files | search my CAD | do I have a design for | jeffrey knows my files | local file RAG
// @does: FTS5/BM25 index over René's OWN folders (CGS CAD, holster designs, laser, business docs) into a SEPARATE gitignored local DB — filename+path for every file, full text for text-extractable formats. Powers the Jeffrey brain's search_files tool.
// @use: node _SYSTEM/Scripts/jeffrey-file-index.mjs [--full|--root <dir>|--query "<q>"]. Roots from _SYSTEM/state/jeffrey/index-roots.json. Local-only (Rule B) — never commit the DB.
// @exports: query, loadRoots, INDEX_DB_PATH, ROOTS_CONFIG
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const JEFFREY_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'jeffrey');
export const INDEX_DB_PATH = process.env.JEFFREY_INDEX_DB || path.join(JEFFREY_DIR, 'files-index.db');
export const ROOTS_CONFIG = path.join(JEFFREY_DIR, 'index-roots.json');

// Extensions whose CONTENT is worth indexing (plain text / text-based formats — no install needed).
const TEXT_EXT = new Set([
  '.md', '.txt', '.csv', '.tsv', '.json', '.xml', '.svg', '.html', '.htm', '.ini', '.cfg', '.conf',
  '.log', '.yaml', '.yml', '.rtf', '.nc', '.gcode', '.g', '.tap', '.ngc', '.cnc', '.py', '.mjs',
  '.js', '.ts', '.sh', '.bat', '.ps1', '.sql', '.dxf', '.gbr', '.eps',
]);
// Directory names never worth walking (churn / caches / system).
const SKIP_DIR = new Set([
  'node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', '.cache', '__pycache__',
  'AppData', '.tmp', 'tmp',
]);
const MAX_CONTENT_BYTES = 2_000_000;  // only read content for text files under 2MB
const MAX_BODY_CHARS = 40_000;        // cap stored body per file
const BATCH = 500;
const NUL = String.fromCharCode(0);

export function loadRoots(cliRoots) {
  if (cliRoots && cliRoots.length) return cliRoots;
  try {
    const j = JSON.parse(fs.readFileSync(ROOTS_CONFIG, 'utf8'));
    if (Array.isArray(j)) return j.filter((r) => typeof r === 'string' && r.trim());
    if (Array.isArray(j.roots)) return j.roots.filter((r) => typeof r === 'string' && r.trim());
  } catch { /* no config yet */ }
  return [];
}

function* walk(absRoot) {
  let entries;
  try { entries = fs.readdirSync(absRoot, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(absRoot, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      yield* walk(abs);
      continue;
    }
    if (e.isFile()) yield abs;
  }
}

function initSchema(db, full) {
  if (full) db.exec('DROP TABLE IF EXISTS files_fts; DROP TABLE IF EXISTS files_meta;');
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path UNINDEXED, name, ext, folder, body, tokenize='porter unicode61'
    );
    CREATE TABLE IF NOT EXISTS files_meta (
      path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL, indexed_at TEXT NOT NULL
    );
  `);
}

function indexRun({ full, cliRoots }) {
  const roots = loadRoots(cliRoots);
  fs.mkdirSync(JEFFREY_DIR, { recursive: true });
  const db = new Database(INDEX_DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db, full);

  if (!roots.length) {
    db.close();
    return { ok: false, error: 'no roots configured', hint: `write ${path.relative(REPO_ROOT, ROOTS_CONFIG)} (JSON array of absolute folders) or pass --root`, db: path.relative(REPO_ROOT, INDEX_DB_PATH) };
  }

  const getMeta = db.prepare('SELECT mtime FROM files_meta WHERE path = ?');
  const delFts = db.prepare('DELETE FROM files_fts WHERE path = ?');
  const delMeta = db.prepare('DELETE FROM files_meta WHERE path = ?');
  const insFts = db.prepare('INSERT INTO files_fts (path, name, ext, folder, body) VALUES (?, ?, ?, ?, ?)');
  const upMeta = db.prepare('INSERT OR REPLACE INTO files_meta (path, mtime, size, indexed_at) VALUES (?, ?, ?, ?)');

  let indexed = 0, contentIndexed = 0, skipped = 0, removed = 0, errors = 0;
  const seen = new Set();
  const now = new Date().toISOString();

  const flush = db.transaction((items) => {
    for (const it of items) {
      delFts.run(it.path);
      insFts.run(it.path, it.name, it.ext, it.folder, it.body);
      upMeta.run(it.path, it.mtime, it.size, now);
    }
  });
  let pending = [];
  const commit = () => {
    if (!pending.length) return;
    flush(pending); pending = [];
    db.pragma('wal_checkpoint(PASSIVE)');
    process.stderr.write(`  indexed ${indexed} (content ${contentIndexed})…\n`);
  };

  for (const root of roots) {
    const absRoot = path.resolve(root);
    for (const abs of walk(absRoot)) {
      const norm = abs.replaceAll(path.sep, '/');
      seen.add(norm);
      let st;
      try { st = fs.statSync(abs); } catch { errors++; continue; }
      const mtime = Math.floor(st.mtimeMs);
      const prior = getMeta.get(norm);
      if (!full && prior && prior.mtime === mtime) { skipped++; continue; }
      const ext = path.extname(abs).toLowerCase();
      const name = path.basename(abs);
      const folder = path.dirname(norm);
      let body = '';
      if (TEXT_EXT.has(ext) && st.size <= MAX_CONTENT_BYTES) {
        try {
          const raw = fs.readFileSync(abs, 'utf8');
          if (!raw.includes(NUL)) { body = raw.slice(0, MAX_BODY_CHARS); contentIndexed++; }
        } catch { /* unreadable → filename-only row */ }
      }
      pending.push({ path: norm, name, ext, folder, body, mtime, size: st.size });
      indexed++;
      if (pending.length >= BATCH) commit();
    }
  }
  commit();

  db.transaction(() => {
    for (const { path: p } of db.prepare('SELECT path FROM files_meta').all()) {
      if (!seen.has(p)) { delFts.run(p); delMeta.run(p); removed++; }
    }
  })();

  db.pragma('wal_checkpoint(TRUNCATE)');
  const total = db.prepare('SELECT COUNT(*) c FROM files_fts').get().c;
  db.close();
  return { ok: true, mode: full ? 'full' : 'incremental', roots, indexed, contentIndexed, skipped, removed, errors, totalFiles: total, db: path.relative(REPO_ROOT, INDEX_DB_PATH) };
}

// FTS5 query escaping: wrap each bareword token in double-quotes so punctuation in a spoken query
// (e.g. "tlr-1", "p320.") can't break the MATCH grammar. OR the tokens for recall-friendly search.
function ftsQuery(q) {
  const toks = String(q).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!toks.length) return null;
  return toks.map((t) => `"${t}"`).join(' OR ');
}

export function query(q, limit = 10) {
  if (!fs.existsSync(INDEX_DB_PATH)) return { ok: false, error: 'index not built', hits: [] };
  const match = ftsQuery(q);
  if (!match) return { ok: true, hits: [] };
  const db = new Database(INDEX_DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(
      `SELECT path, name, ext, snippet(files_fts, 4, '[', ']', ' … ', 8) AS snip, bm25(files_fts) AS score
       FROM files_fts WHERE files_fts MATCH ? ORDER BY score LIMIT ?`
    ).all(match, limit);
    return { ok: true, hits: rows.map((r) => ({ path: r.path, name: r.name, ext: r.ext, snippet: (r.snip || '').trim() })) };
  } catch (e) {
    return { ok: false, error: String(e.message || e), hits: [] };
  } finally { db.close(); }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('jeffrey-file-index.mjs — index/search René\'s local files. See header for usage.\n' +
      'PDF/Word/Excel text extraction is NOT enabled (needs an owner-approved package install).\n');
    return;
  }
  const qi = argv.indexOf('--query');
  if (qi !== -1) {
    const q = argv[qi + 1] || '';
    const li = argv.indexOf('--limit');
    const limit = li !== -1 ? Math.max(1, parseInt(argv[li + 1], 10) || 10) : 10;
    process.stdout.write(JSON.stringify(query(q, limit), null, 2) + '\n');
    return;
  }
  const roots = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--root' && argv[i + 1]) roots.push(argv[++i]);
  const out = indexRun({ full: argv.includes('--full'), cliRoots: roots });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exitCode = out.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
