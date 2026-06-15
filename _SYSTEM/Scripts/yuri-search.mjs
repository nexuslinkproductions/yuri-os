#!/usr/bin/env node
/**
 * yuri-search.mjs — query the YURI corpus SEARCH index (FTS5/BM25). On-demand lookup.
 *
 * This is SEARCH, not MEMORY: it answers "where did I write about X" over ~26k docs/code files.
 * Results are file + snippet you pull when needed — NOT auto-injected into context, NOT memory.
 * Build/refresh the index with: node _SYSTEM/Scripts/yuri-search-index.mjs [--full]
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-search.mjs "energy substrate descent"
 *   node _SYSTEM/Scripts/yuri-search.mjs "ICM MWP" --top 15
 *   node _SYSTEM/Scripts/yuri-search.mjs "protected path" --json
 *   node _SYSTEM/Scripts/yuri-search.mjs '"exact phrase here"'     # phrase: wrap in quotes
 *
 * Tokenizer behavior (FTS5 porter unicode61 — see yuri-search-index.mjs):
 *   - snake_case / kebab-case SPLIT into sub-tokens: 'energy_tick' matches 'energy' OR 'tick'
 *   - camelCase is ONE token: search 'scoreHit' for the exact identifier, 'score' for the stem
 *   - terms under 3 chars are dropped from OR queries (R.18 shared floor); use a quoted
 *     phrase ("ai") to search a short term deliberately
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOKENIZE_MIN_LENGTH } from './xref-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'search-index.db');

// Turn arbitrary user input into a safe FTS5 MATCH expression.
// - a quoted "phrase" → phrase search
// - otherwise → OR of quoted terms (recall-friendly; bm25 ranks multi-term hits higher)
export function buildMatch(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;
  // Quoted "phrase" → phrase search (strip outer quotes, drop any inner quotes for safety).
  if (q.length >= 2 && q.startsWith('"') && q.endsWith('"')) {
    const inner = q.slice(1, -1).replace(/"/g, '').trim();
    return inner ? `"${inner}"` : null;
  }
  // Otherwise → OR of quoted terms (recall-friendly; bm25 ranks multi-term hits higher).
  // wave-2 R.18: unified token floor (shared with xref tokenize) — 2-char terms
  // were FTS5-visible but invisible to every other retrieval leg. Quoted phrase
  // search above still reaches short terms deliberately.
  const terms = q.split(/\s+/).map((t) => t.replace(/["']/g, '')).filter((t) => t.length >= TOKENIZE_MIN_LENGTH);
  return terms.length ? terms.map((t) => `"${t}"`).join(' OR ') : null;
}

// wave-2 R.9 (D-R2: warning-only, never auto-reindex, never block the search).
// Stale = the latest commit landed more than STALENESS_GRACE_MS after the index
// was last written — commits since reindex mean the corpus moved under the index.
// Every failure path is fail-open ({stale:false, reason}).
const STALENESS_GRACE_MS = 60 * 60 * 1000;
export function indexStaleness(dbPath = INDEX_DB_PATH) {
  try {
    const indexMtimeMs = fs.statSync(dbPath).mtimeMs;
    const out = execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 3000,
    }).trim();
    const lastCommitMs = parseInt(out, 10) * 1000;
    if (!Number.isFinite(lastCommitMs)) return { stale: false, reason: 'no-commit-time' };
    return {
      stale: lastCommitMs - indexMtimeMs > STALENESS_GRACE_MS,
      indexMtime: new Date(indexMtimeMs).toISOString(),
      lastCommit: new Date(lastCommitMs).toISOString(),
    };
  } catch (err) {
    return { stale: false, reason: err && err.code === 'ETIMEDOUT' ? 'git-timeout' : 'check-failed' };
  }
}

function run() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let top = 10;
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--top' && argv[i + 1]) { top = Math.max(1, Math.min(50, parseInt(argv[++i], 10) || 10)); }
    else if (argv[i] === '--json') { /* flag */ }
    else parts.push(argv[i]);
  }
  const rawQuery = parts.join(' ');
  const match = buildMatch(rawQuery);

  if (!fs.existsSync(INDEX_DB_PATH)) {
    const msg = 'search index not built — run: node _SYSTEM/Scripts/yuri-search-index.mjs --full';
    console.log(json ? JSON.stringify({ ok: false, error: msg }) : `⬡ ${msg}`);
    process.exitCode = 1; return;
  }
  if (!match) {
    console.log(json ? JSON.stringify({ ok: false, error: 'empty query' }) : '⬡ usage: yuri-search "<query>" [--top N] [--json]');
    process.exitCode = 1; return;
  }

  const db = new Database(INDEX_DB_PATH, { readonly: true });
  let rows;
  try {
    rows = db.prepare(
      `SELECT path, snippet(docs, 2, '⟦', '⟧', '…', 14) AS snip, bm25(docs) AS rank
       FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?`
    ).all(match, top);
  } catch (err) {
    console.log(json ? JSON.stringify({ ok: false, error: String(err.message) }) : `⬡ query error: ${err.message}`);
    db.close(); process.exitCode = 1; return;
  }
  const total = db.prepare('SELECT COUNT(*) c FROM docs').get().c;
  // wave-2 R.4 (house law): report how many docs MATCHED, not just the corpus
  // size — top-10-of-500 must be distinguishable from exactly-10. '?' on FTS5
  // count failure, never a crash.
  let matchCount = '?';
  try { matchCount = db.prepare('SELECT COUNT(*) c FROM docs WHERE docs MATCH ?').get(match).c; } catch { /* keep '?' */ }
  db.close();

  const staleness = indexStaleness();
  if (json) { console.log(JSON.stringify({ ok: true, query: rawQuery, match, indexed: total, matchCount, stale: staleness.stale, staleness, results: rows }, null, 2)); return; }
  if (staleness.stale) {
    console.log(`⚠ [STALE INDEX — last reindex: ${staleness.indexMtime.slice(0, 16)}; commits since then; run 'ai reindex' to refresh]`);
  }
  if (!rows.length) { console.log(`⬡ no matches for "${rawQuery}" (index: ${total} docs)`); return; }
  console.log(`⬡ ${rows.length} hit(s) of ${matchCount} matches for "${rawQuery}"  ·  ${total} docs indexed\n`);
  for (const r of rows) {
    const snip = r.snip.replace(/\s+/g, ' ').trim().slice(0, 240);
    console.log(`  ${r.path}`);
    console.log(`    ${snip}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) run();
