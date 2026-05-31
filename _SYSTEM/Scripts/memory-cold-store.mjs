#!/usr/bin/env node
/**
 * memory-cold-store.mjs — the "subconscious": the indexed long-term store demoted
 * memories relocate INTO (never deleted). A SEPARATE database from the search corpus
 * (search-index.db) so the MEMORY_VS_SEARCH wall stays intact — cold memory has its own
 * BM25 index, it does not flow into the doc-search corpus.
 *
 * Two tables, mirroring yuri-search-index.mjs's better-sqlite3 + FTS5 house pattern:
 *   cold_docs  — FTS5 (slug UNINDEXED, title, body, trig)  → cue-matchable text
 *   cold_meta  — static-at-demotion metadata (salience, base stability, crosslinks,
 *                source path, demotedAt, reason). Live use (useCount/lastUsed) is NOT
 *                duplicated here — the recall-event ledger (memory-usage.mjs) is the
 *                single source of truth for that, keyed by the same slug.
 *
 * Relocation = upsertCold (body preserved verbatim). Recall = queryCold (BM25 cue match
 * + meta for ranking). Promotion-back = getCold + removeCold. Embedding-free, FTS5/BM25
 * only. Handle-injected (callers pass the db; tests use ':memory:') for unit-testability.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(_HERE, '..'); // _SYSTEM/Scripts -> _SYSTEM
export const COLD_DB_PATH = path.join(SYSTEM_ROOT, 'OS_KERNEL', 'memory-cold.db');

// Mirror yuri-search.mjs buildMatch: lowercase word tokens -> OR of quoted terms
// (recall-friendly; bm25 ranks multi-term hits higher). Inlined to keep this a
// self-contained foundational module (no import-time coupling to the search CLI).
export function buildMatch(raw) {
  const terms = String(raw || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  const uniq = [...new Set(terms)].slice(0, 24);
  if (!uniq.length) return null;
  return uniq.map((t) => `"${t}"`).join(' OR ');
}

export function openColdStore(dbPath = COLD_DB_PATH) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS cold_docs USING fts5(
      slug UNINDEXED, title, body, trig, tokenize='porter unicode61'
    );
    CREATE TABLE IF NOT EXISTS cold_meta (
      slug TEXT PRIMARY KEY,
      title TEXT,
      source_path TEXT,
      salience REAL DEFAULT 0,
      base_stability_days REAL DEFAULT 1,
      crosslinks TEXT DEFAULT '',
      demoted_at INTEGER,
      reason TEXT
    );
  `);
  return db;
}

/** Relocate a memory into cold storage (body verbatim). Idempotent per slug. */
export function upsertCold(db, item = {}) {
  const {
    slug, title = '', body = '', trig = '', salience = 0, baseStabilityDays = 1,
    crosslinks = '', sourcePath = '', reason = '', nowMs = Date.now(),
  } = item;
  if (!slug || typeof slug !== 'string') throw new Error('upsertCold requires a string slug');
  const links = Array.isArray(crosslinks) ? crosslinks.join(',') : String(crosslinks || '');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cold_docs WHERE slug = ?').run(slug);
    db.prepare('INSERT INTO cold_docs (slug, title, body, trig) VALUES (?, ?, ?, ?)').run(slug, title, body, trig);
    db.prepare(`INSERT OR REPLACE INTO cold_meta
      (slug, title, source_path, salience, base_stability_days, crosslinks, demoted_at, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(slug, title, sourcePath, Number(salience) || 0, Number(baseStabilityDays) || 1, links, Math.trunc(Number(nowMs) || 0), reason);
  });
  tx();
  return slug;
}

/** Cue-match the cold store. Returns FTS5 candidates + meta for downstream blended ranking. */
export function queryCold(db, cueRaw, { topK = 5 } = {}) {
  const match = buildMatch(cueRaw);
  if (!match) return [];
  // Over-fetch (topK*4) so the Layer-5 blended re-rank (recency/salience/crosslinks) has
  // headroom; the final top-K cap is applied by the recall layer, not here.
  return db.prepare(`
    SELECT d.slug AS slug,
           m.title AS title,
           snippet(cold_docs, 2, '⟦', '⟧', '…', 14) AS snip,
           bm25(cold_docs) AS bm25,
           m.salience AS salience,
           m.crosslinks AS crosslinks
    FROM cold_docs d JOIN cold_meta m ON m.slug = d.slug
    WHERE cold_docs MATCH ? ORDER BY bm25 LIMIT ?
  `).all(match, Math.max(1, topK * 4));
}

/** Full record for promotion-back (body verbatim + meta). */
export function getCold(db, slug) {
  const doc = db.prepare('SELECT slug, title, body, trig FROM cold_docs WHERE slug = ?').get(slug);
  if (!doc) return null;
  const meta = db.prepare('SELECT source_path, salience, base_stability_days, crosslinks, demoted_at, reason FROM cold_meta WHERE slug = ?').get(slug) || {};
  return { ...doc, ...meta };
}

/** Remove from cold storage (on promotion-back, after the body is restored to a warm/active .md). */
export function removeCold(db, slug) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cold_docs WHERE slug = ?').run(slug);
    db.prepare('DELETE FROM cold_meta WHERE slug = ?').run(slug);
  });
  tx();
}

export function coldCount(db) {
  return db.prepare('SELECT COUNT(*) AS c FROM cold_meta').get().c;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openColdStore();
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'count') console.log(JSON.stringify({ cold: coldCount(db), db: COLD_DB_PATH }));
  else if (cmd === 'query' && arg) console.log(JSON.stringify(queryCold(db, arg), null, 2));
  else console.log('usage: memory-cold-store.mjs count | query <cue>');
  db.close();
}
