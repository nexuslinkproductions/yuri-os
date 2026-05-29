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
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const terms = q.split(/\s+/).map((t) => t.replace(/["']/g, '')).filter((t) => t.length >= 2);
  return terms.length ? terms.map((t) => `"${t}"`).join(' OR ') : null;
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
  db.close();

  if (json) { console.log(JSON.stringify({ ok: true, query: rawQuery, match, indexed: total, results: rows }, null, 2)); return; }
  if (!rows.length) { console.log(`⬡ no matches for "${rawQuery}" (index: ${total} docs)`); return; }
  console.log(`⬡ ${rows.length} hit(s) for "${rawQuery}"  ·  ${total} docs indexed\n`);
  for (const r of rows) {
    const snip = r.snip.replace(/\s+/g, ' ').trim().slice(0, 240);
    console.log(`  ${r.path}`);
    console.log(`    ${snip}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) run();
