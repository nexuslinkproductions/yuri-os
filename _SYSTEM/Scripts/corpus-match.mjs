#!/usr/bin/env node
/**
 * corpus-match.mjs — a deterministic, COMPLETE, cheap mathematical MATCHING engine.
 *
 * Given a task/query, returns the COMPLETE set of corpus items above a set-similarity threshold
 * + the true total count — deterministically, faster/cheaper than re-running a BM25 scan, and
 * catching variant phrasings BM25's term-overlap misses. CORPUS-AGNOSTIC: works on any
 * collection of {id, text} (bug-bounty reports, memory entries, code symbols, the FTS5 docs).
 *
 * THE MATH (two paths, one engine — math to improve, not complicate):
 *  1. EXACT scan  — O(N) Jaccard/tf-cosine of the query token-set vs every item. GUARANTEES
 *     completeness (no false negatives): every item with similarity ≥ t is returned, with the
 *     true count. For N up to ~1M with short texts this is milliseconds — already the win over
 *     BM25's ranked-and-truncated top-N. This is the ground truth + the default.
 *  2. LSH-accelerated — MinHash signatures + LSH banding (yuri-minhash) generate candidates in
 *     sublinear time for HUGE N / all-pairs; exact Jaccard reranks them. Recall vs the exact scan
 *     is REPORTED (LSH has false negatives; we never hide that — completeness claims carry their
 *     real recall, per the no-silent-truncation law).
 *
 * vs FTS5/BM25: BM25 ranks by term-frequency relevance and you take top-N (incomplete, lexical).
 * This returns ALL above a similarity threshold + the count (complete, set-similarity, deterministic).
 *
 * Reuses yuri-jaccard (tokenize/jaccard/tfCosine) + yuri-minhash (signatures/LSH). Read-only on
 * any source DB. No embeddings, no clock in the math, no RNG at query.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokenize, tokenFreq, jaccard, tfCosine } from './math/yuri-jaccard.mjs';
import { makeHashes, minhashSignature, lshBands, tuneBands } from './math/yuri-minhash.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── corpus adapters (generalization layer) ──────────────────────────────────────────────────
// RED-TEAM fix: SQL identifiers (table/columns) are interpolated, not bindable. Whitelist them to
// a strict SQL-identifier shape and reject anything else (an idCol like "(SELECT v FROM secrets)"
// otherwise exfiltrates other tables). The end-user QUERY is separately parameterized via MATCH ?.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name, what = 'identifier') {
  const s = String(name ?? '');
  if (!IDENT_RE.test(s)) throw new Error(`unsafe SQL ${what}: ${JSON.stringify(s)}`);
  return s;
}
// HARDEN (A3 stress-test): an IDENT-shaped name can still be a SQLite SYSTEM table whose read leaks
// the whole DB schema/DDL (sqlite_master/schema). Deny system tables at the table boundary — the corpus
// loader only reads real data tables. (Explicit deny-set, no over-broad shadow-suffix heuristic.)
const DENY_TABLES = new Set(['sqlite_master', 'sqlite_schema', 'sqlite_temp_master', 'sqlite_temp_schema', 'sqlite_sequence', 'sqlite_stat1', 'sqlite_stat4']);
function safeTable(name) {
  const s = ident(name, 'table');
  if (DENY_TABLES.has(s.toLowerCase())) throw new Error(`disallowed SQLite system table: ${JSON.stringify(s)}`);
  return s;
}
// HARDEN (A3 #5): validate LIMIT is a positive integer (was `Number(limit)` → -1 = no-limit, NaN = SQL error).
function safeLimit(limit) {
  if (limit == null) return '';
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new Error(`invalid LIMIT: ${JSON.stringify(limit)}`);
  return ` LIMIT ${n}`;
}

/**
 * Load a corpus as [{id, text}] from any FTS5 (or normal) table. Generalizes the engine across
 * domains: pick the id column + the text columns to concatenate per row.
 */
export function loadFtsCorpus(dbPath, table, { idCol, textCols, limit } = {}) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const tbl = safeTable(table);
    const id = ident(idCol, 'idCol');
    const txt = (textCols || []).map((c) => ident(c, 'textCol'));
    const cols = [id, ...txt].join(', ');
    const rows = db.prepare(`SELECT ${cols} FROM ${tbl}${safeLimit(limit)}`).all();
    return rows.map((r) => ({
      id: String(r[idCol] ?? ''),
      text: textCols.map((c) => String(r[c] ?? '')).join(' ').trim(),
    })).filter((x) => x.text.length > 0);
  } finally { db.close(); }
}

// ── index build ──────────────────────────────────────────────────────────────────────────────
/**
 * Build a match index over [{id, text}]. Precomputes token sets (+ optional MinHash/LSH).
 * @param {Array<{id,text}>} items
 * @param {object} [opts] { metric:'jaccard'|'cosine', k:128, threshold:0.3, lsh:true }
 */
export function buildIndex(items, opts = {}) {
  const { metric = 'jaccard', k = 128, lsh = true, prefixFilter = true } = opts;
  // RED-TEAM fix: validate threshold ∈ (0,1]. At t=0 every item "matches" (Jaccard ≥ 0) but the
  // prefix-filter only returns shared-prefix candidates → it would falsely report complete:true.
  const threshold = opts.threshold ?? 0.3;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`buildIndex threshold must be in (0,1], got ${threshold}`);
  }
  // featureFn: text → Set. Default = raw tokens. Pass yuri-token-expand makeFeatureFn().featureFn
  // to bridge the tokenization collapse (tok:+c4:+sem: features) — used IDENTICALLY here and at
  // query time, so the prefix-filter stays COMPLETE for the expanded-feature Jaccard (Codex rule).
  const featureFn = opts.featureFn || tokenize;
  const ids = [], sets = [], freqs = [];
  for (const it of items) {
    ids.push(it.id);
    sets.push(featureFn(it.text));
    if (metric === 'cosine') freqs.push(tokenFreq(it.text));
  }
  const index = { ids, sets, freqs, metric, n: ids.length, lsh: null, pf: null, featureFn };

  // ── PREFIX-FILTER inverted index (Bayardo AllPairs 2007 / Xiao PPJoin 2008) ──────────────────
  // COMPLETE + sublinear: sort tokens by global rarity; any pair with Jaccard ≥ t MUST share a
  // token in their prefixes (prefix len = |s| − ⌈t·|s|⌉ + 1). Index each item's prefix; a query
  // probes only its own prefix tokens → candidates are exactly the mathematically-possible ones,
  // then exact Jaccard verifies. No false negatives (unlike LSH). Built at the LOWEST threshold to
  // be valid for any query t ≥ buildThreshold (lower t → longer, more-conservative prefix).
  if (prefixFilter && metric === 'jaccard') {
    const df = new Map();                                   // token → document frequency
    for (const s of sets) for (const tok of s) df.set(tok, (df.get(tok) || 0) + 1);
    const rank = new Map();                                 // token → global order (rarest first)
    [...df.keys()].sort((a, b) => (df.get(a) - df.get(b)) || (a < b ? -1 : 1)).forEach((tok, i) => rank.set(tok, i));
    const sorted = sets.map((s) => [...s].sort((a, b) => rank.get(a) - rank.get(b)));
    const prefixLenAt = (len, t) => Math.max(1, len - Math.ceil(t * len) + 1);
    const inverted = new Map();                             // prefix token → [itemIdx]
    sorted.forEach((toks, idx) => {
      const pl = prefixLenAt(toks.length, threshold);
      for (let i = 0; i < pl && i < toks.length; i++) {
        let arr = inverted.get(toks[i]); if (!arr) { arr = []; inverted.set(toks[i], arr); } arr.push(idx);
      }
    });
    index.pf = { rank, sorted, inverted, buildThreshold: threshold, prefixLenAt };
  }
  if (lsh) {
    const hashes = makeHashes(k);
    const { b, r } = tuneBands(k, threshold);
    const sigs = sets.map((s) => minhashSignature(s, hashes));
    const buckets = new Map(); // bandKey -> [itemIdx]
    sigs.forEach((sig, idx) => {
      for (const key of lshBands(sig, b, r)) {
        let arr = buckets.get(key); if (!arr) { arr = []; buckets.set(key, arr); } arr.push(idx);
      }
    });
    index.lsh = { hashes, b, r, k, sigs, buckets, threshold };
  }
  return index;
}

// ── EXACT match: O(N), guaranteed complete ────────────────────────────────────────────────────
export function matchExact(index, queryText, { threshold = 0.2, top = 0 } = {}) {
  const t0 = process.hrtime.bigint();
  const qset = (index.featureFn || tokenize)(queryText);
  const qfreq = index.metric === 'cosine' ? tokenFreq(queryText) : null;
  const out = [];
  for (let i = 0; i < index.n; i++) {
    const s = index.metric === 'cosine' ? tfCosine(qfreq, index.freqs[i]) : jaccard(qset, index.sets[i]);
    if (s >= threshold) out.push({ id: index.ids[i], score: Number(s.toFixed(4)) });
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { matches: top > 0 ? out.slice(0, top) : out, totalAboveThreshold: out.length, scanned: index.n, ms: Number(ms.toFixed(2)), mode: 'exact', threshold };
}

// ── LSH-accelerated match: sublinear candidate gen + exact rerank + reported recall ──────────────
export function matchLSH(index, queryText, { threshold = 0.2, top = 0 } = {}) {
  if (!index.lsh) throw new Error('index built without lsh');
  // RED-TEAM r2: MinHash/LSH estimates JACCARD; reranking a cosine index with Jaccard surfaces
  // matches exact-cosine rejects. LSH is Jaccard-only — use matchExact for the cosine metric.
  if (index.metric === 'cosine') throw new Error('matchLSH supports the jaccard metric only (MinHash); use matchExact for cosine');
  const t0 = process.hrtime.bigint();
  const { hashes, b, r } = index.lsh;
  const qset = (index.featureFn || tokenize)(queryText); // RED-TEAM fix: was bare tokenize → 0% recall on featureFn indexes
  const qsig = minhashSignature(qset, hashes);
  const candIdx = new Set();
  for (const key of lshBands(qsig, b, r)) { const arr = index.lsh.buckets.get(key); if (arr) for (const i of arr) candIdx.add(i); }
  const out = [];
  for (const i of candIdx) {
    const s = jaccard(qset, index.sets[i]);
    if (s >= threshold) out.push({ id: index.ids[i], score: Number(s.toFixed(4)) });
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { matches: top > 0 ? out.slice(0, top) : out, totalAboveThreshold: out.length, candidates: candIdx.size, scanned: index.n, ms: Number(ms.toFixed(2)), mode: 'lsh', threshold, bands: { b, r } };
}

// ── PREFIX-FILTER match: COMPLETE + sublinear (no false negatives) ───────────────────────────────
export function matchPrefixFilter(index, queryText, { threshold = 0.2, top = 0 } = {}) {
  if (!index.pf) throw new Error('index built without prefixFilter');
  const t0 = process.hrtime.bigint();
  const t = Math.max(threshold, index.pf.buildThreshold); // index valid only for t ≥ buildThreshold
  const qset = (index.featureFn || tokenize)(queryText);
  const qsorted = [...qset].sort((a, b) => (index.pf.rank.has(a) ? index.pf.rank.get(a) : Infinity) - (index.pf.rank.has(b) ? index.pf.rank.get(b) : Infinity));
  const qlen = qsorted.length;
  const qprefixLen = index.pf.prefixLenAt(qlen, t);
  // length filter: |x| ∈ [⌈t·|q|⌉, ⌊|q|/t⌋] is necessary for Jaccard ≥ t
  const loLen = Math.ceil(t * qlen), hiLen = Math.floor(qlen / t);
  const cand = new Set();
  for (let i = 0; i < qprefixLen && i < qlen; i++) {
    const arr = index.pf.inverted.get(qsorted[i]);
    if (arr) for (const idx of arr) { const L = index.sets[idx].size; if (L >= loLen && L <= hiLen) cand.add(idx); }
  }
  const out = [];
  for (const idx of cand) {
    const s = jaccard(qset, index.sets[idx]);
    if (s >= threshold) out.push({ id: index.ids[idx], score: Number(s.toFixed(4)) });
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { matches: top > 0 ? out.slice(0, top) : out, totalAboveThreshold: out.length, candidates: cand.size, scanned: index.n, ms: Number(ms.toFixed(2)), mode: 'prefix-filter', threshold, complete: threshold > 0 && threshold >= index.pf.buildThreshold };
}

// ── FTS5/BM25 comparison (the engine we're beating on completeness) ──────────────────────────────
export function ftsQuery(dbPath, table, queryText, { top = 10 } = {}) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const tbl = safeTable(table); // whitelist shape + deny SQLite system tables (A3 stress-test)
    const t0 = process.hrtime.bigint();
    const safe = String(queryText).replace(/["']/g, ' ').split(/\s+/).filter((w) => w.length >= 3).map((w) => `"${w}"`).join(' OR ');
    if (!safe) return { matches: [], ms: 0, total: 0 };
    const rows = db.prepare(`SELECT rowid, bm25(${tbl}) AS rank FROM ${tbl} WHERE ${tbl} MATCH ? ORDER BY rank LIMIT ?`).all(safe, top);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const total = db.prepare(`SELECT count(*) AS c FROM ${tbl} WHERE ${tbl} MATCH ?`).get(safe).c;
    return { matches: rows, ms: Number(ms.toFixed(2)), returnedTop: rows.length, totalMatched: total };
  } finally { db.close(); }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
function run() {
  const argv = process.argv.slice(2);
  const dbPath = argv[0], table = argv[1];
  const flags = {}; const parts = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--threshold') flags.threshold = parseFloat(argv[++i]);
    else if (argv[i] === '--top') flags.top = parseInt(argv[++i], 10);
    else if (argv[i] === '--cols') flags.cols = argv[++i];
    else if (argv[i] === '--id') flags.id = argv[++i];
    else parts.push(argv[i]);
  }
  const query = parts.join(' ');
  if (!dbPath || !table || !query) {
    console.log('usage: corpus-match.mjs <db> <table> "<query>" [--threshold 0.2] [--top N] [--id col] [--cols c1,c2]');
    process.exit(1);
  }
  const idCol = flags.id || 'report_id';
  const textCols = (flags.cols || 'title,weakness,asset_type').split(',');
  const threshold = flags.threshold ?? 0.2;

  const tb0 = process.hrtime.bigint();
  const items = loadFtsCorpus(dbPath, table, { idCol, textCols });
  const index = buildIndex(items, { threshold });
  const buildMs = Number(process.hrtime.bigint() - tb0) / 1e6;

  const ex = matchExact(index, query, { threshold });
  const pf = matchPrefixFilter(index, query, { threshold });
  const ls = matchLSH(index, query, { threshold });
  const pfRecall = ex.totalAboveThreshold ? pf.totalAboveThreshold / ex.totalAboveThreshold : 1;
  const lsRecall = ex.totalAboveThreshold ? ls.totalAboveThreshold / ex.totalAboveThreshold : 1;
  const fts = ftsQuery(dbPath, table, query, { top: flags.top || 10 });

  console.log(`\n⬡ corpus-match  db=${path.basename(dbPath)} table=${table}  query="${query}"  threshold=${threshold}`);
  console.log(`  corpus N=${index.n}  (index build ${buildMs.toFixed(1)}ms, one-time)\n`);
  console.log(`  EXACT         (complete, O(N)):       ${ex.totalAboveThreshold} matches in ${ex.ms}ms  (scanned ${ex.scanned})`);
  console.log(`  PREFIX-FILTER (${pf.complete ? 'complete' : 'PARTIAL — t<buildThreshold'} + sublinear): ${pf.totalAboveThreshold} matches in ${pf.ms}ms  (candidates ${pf.candidates}/${pf.scanned}, recall vs exact ${(pfRecall * 100).toFixed(1)}%)`);
  console.log(`  LSH           (approx accelerator):   ${ls.totalAboveThreshold} matches in ${ls.ms}ms  (candidates ${ls.candidates}/${ls.scanned}, recall vs exact ${(lsRecall * 100).toFixed(1)}%)`);
  console.log(`  FTS5          (BM25 ranked top-N):     returned ${fts.returnedTop || 0}, totalMatched ${fts.totalMatched || 0} in ${fts.ms || 0}ms\n`);
  console.log(`  top matches (exact, set-similarity):`);
  for (const m of ex.matches.slice(0, flags.top || 12)) {
    const it = items[index.ids.indexOf(m.id)];
    console.log(`    ${m.score.toFixed(3)}  [${m.id}] ${(it ? it.text : '').slice(0, 90)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
