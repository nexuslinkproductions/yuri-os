#!/usr/bin/env node
// @capability: retrieval-candidates
// @serves: retrieval structure bakeoff candidate resolvers | BM25 tokenizer variants | serves-based query expansion
// @does: candidate resolver cores for the 2026-07-28 retrieval-structure bakeoff (Hermes brief):
//   the fastlex base query path extracted so variants share it, C2 identifier-aware tokenization
//   (camelCase/snake/kebab/dot splitting), and C6 serves-phrase co-occurrence query expansion.
//   Everything is deterministic and derive-only: expansion vocabulary comes exclusively from
//   capabilities.json serves phrases already in the repo; no generated text, no fitted constants.
// @use: reached by _SYSTEM/eval/atlas-score.mjs resolver arms (thin adapters) and by
//   _SYSTEM/Scripts/atlas/timing-probe.mjs so accuracy and latency measure the SAME code path.
//   Do not re-implement these in the eval file — arms stay thin.
// @exports: FASTLEX_STOP, fastlexTerms, fastlexQuery, splitIdentifierTerms, buildSynonymLayer,
//   expandQueryTerms, openFastlexStmt

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const CAPABILITIES_PATH = path.join(REPO_ROOT, '_SYSTEM/capabilities.json');

// Same stopword list as the fastlex arm in _SYSTEM/eval/atlas-score.mjs — the
// bakeoff compares STRUCTURES, so the baseline query path must be identical.
export const FASTLEX_STOP = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'where', 'how', 'do', 'i', 'to',
  'in', 'of', 'for', 'and', 'or', 'that', 'this', 'it', 'my', 'we', 'our', 'before', 'after', 'which',
  'does', 'so', 'not', 'no', 'any', 'can', 'use', 'used', 'uses', 'run', 'get', 'got', 'me', 'you',
  'need', 'want', 'when', 'why', 'with', 'from', 'into', 'out', 'up', 'on', 'at', 'by']);

/** Base fastlex tokenizer: lowercase, [a-z0-9_.-]{3,}, stopword-drop, deduped. */
export function fastlexTerms(question) {
  const toks = String(question).toLowerCase().match(/[a-z0-9_.-]{3,}/g) || [];
  return [...new Set(toks.filter((t) => !FASTLEX_STOP.has(t)))];
}

/** Open (readonly) the FTS5 index and prepare the bounded BM25 statement. */
export async function openFastlexStmt(dbPath = DEFAULT_INDEX_DB) {
  if (!existsSync(dbPath)) {
    const err = new Error(`search index not built at ${dbPath}`);
    err.exitCode = 2;
    throw err;
  }
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  return db.prepare('SELECT path, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?');
}

/**
 * Shared fastlex query path: quoted OR terms, LIMIT, dedupe by path.
 * `termsFn` is the only thing that varies across candidates — C1 passes
 * fastlexTerms, C2 passes splitIdentifierTerms, C6 wraps with expandQueryTerms.
 */
export function fastlexQuery(stmt, question, top, termsFn = fastlexTerms, limit = 50) {
  const terms = termsFn(question).map((t) => `"${t}"`);
  if (!terms.length) return { paths: [], hops: 1 };
  let rows = [];
  try {
    rows = stmt.all(terms.join(' OR '), limit);
  } catch {
    return { paths: [], hops: 1 }; // malformed FTS5 MATCH -> no hits, never abort the run
  }
  const seen = new Set();
  const paths = [];
  for (const r of rows) {
    if (r && typeof r.path === 'string' && !seen.has(r.path)) {
      seen.add(r.path);
      paths.push(r.path);
      if (paths.length >= top) break;
    }
  }
  return { paths, hops: 1 };
}

// ---------------------------------------------------------------------------
// C2 — identifier-aware tokenization.
// Questions name identifiers in prose ("sparse-checkout", "xref-query.mjs",
// "capabilityRecall"). The base tokenizer keeps "xref-query.mjs" as ONE term,
// which FTS5 then re-tokenizes its own way; splitting identifier shape at the
// QUERY side makes the intent explicit: each hyphen/underscore/dot/camelCase
// segment becomes its own term, alongside the original. Deterministic, no
// constants to tune (segment floor 3 chars matches the base tokenizer's).
// ---------------------------------------------------------------------------
export function splitIdentifierTerms(question) {
  const base = fastlexTerms(question);
  const out = new Set(base);
  // Case-SENSITIVE pass over the raw question: fastlexTerms lowercases first,
  // which destroys camelCase boundaries ("capabilityRecall" -> "capabilityrecall"),
  // so identifier shape must be read from the original text.
  const rawTokens = String(question).match(/[A-Za-z0-9_.-]{3,}/g) || [];
  for (const raw of rawTokens) {
    for (const seg of raw.split(/[-_.]/)) {
      const segLow = seg.toLowerCase();
      if (segLow.length >= 3 && !FASTLEX_STOP.has(segLow)) out.add(segLow);
      // camelCase boundaries within a segment: capabilityRecall -> capability, recall
      for (const camel of seg.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[a-z])(?=[0-9])/)) {
        const c = camel.toLowerCase();
        if (c.length >= 3 && !FASTLEX_STOP.has(c)) out.add(c);
      }
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// C6 — serves-phrase co-occurrence query expansion.
// capabilities.json `serves` phrases are curated intent vocabulary. Terms that
// co-occur inside one serves phrase are topic-linked BY CONSTRUCTION (a human
// wrote them as one intent). Expansion: a query term pulls in its strongest
// co-occurring partners, so "routing" can reach "dispatch" when they co-serve.
// Fan-out is capped (default 3 partners per term, standard query-expansion
// practice to bound query drift); ties break alphabetically — deterministic.
// ---------------------------------------------------------------------------
export function buildSynonymLayer(capabilitiesPath = CAPABILITIES_PATH) {
  const list = JSON.parse(readFileSync(capabilitiesPath, 'utf8'));
  const entries = Array.isArray(list && list.capabilities) ? list.capabilities : [];
  // Dedupe serves phrases per canonical mechanism path FIRST: multiple
  // capability records can share one path (eval-processing.mjs has 4), and
  // counting them independently would inflate co-occurrence weights 4x — the
  // same df-honesty contract the id-map merge already enforces.
  const byMechanism = new Map(); // path -> Set(phrase)
  for (const c of entries) {
    const mech = typeof c.mechanism === 'string' ? c.mechanism : null;
    const serves = Array.isArray(c.serves) ? c.serves.filter((s) => typeof s === 'string') : [];
    if (!mech || serves.length === 0) continue;
    if (!byMechanism.has(mech)) byMechanism.set(mech, new Set());
    const set = byMechanism.get(mech);
    for (const s of serves) set.add(s);
  }
  const cooc = new Map(); // term -> Map<partner, count>
  for (const phrases of byMechanism.values()) {
    for (const phrase of phrases) {
      const terms = fastlexTerms(phrase);
      for (const a of terms) {
        if (!cooc.has(a)) cooc.set(a, new Map());
        const m = cooc.get(a);
        for (const b of terms) {
          if (b !== a) m.set(b, (m.get(b) || 0) + 1);
        }
      }
    }
  }
  return cooc;
}

export function expandQueryTerms(question, cooc, { fanout = 3 } = {}) {
  const base = fastlexTerms(question);
  const out = new Set(base);
  for (const t of base) {
    const partners = cooc.get(t);
    if (!partners) continue;
    const ranked = [...partners.entries()].sort((x, y) => (y[1] - x[1]) || x[0].localeCompare(y[0]));
    for (const [p] of ranked.slice(0, fanout)) out.add(p);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// SELF-TEST — synthetic only, no repo state touched beyond reading
// capabilities.json (read-only) for the synonym layer.
// ---------------------------------------------------------------------------
export function runSelfTest() {
  let pass = true;
  const check = (name, cond) => {
    console.log(`[retrieval-candidates --test] ${name}: ${cond ? 'PASS' : 'FAIL'}`);
    if (!cond) pass = false;
  };

  const base = fastlexTerms('what does xref-query.mjs do before broad exploration?');
  check('base tokenizer drops stopwords', !base.includes('what') && !base.includes('does'));
  check('base tokenizer keeps identifier', base.includes('xref-query.mjs'));

  const split = splitIdentifierTerms('what does xref-query.mjs do?');
  check('C2 splits kebab identifier', split.includes('xref') && split.includes('query'));
  check('C2 keeps original token too', split.includes('xref-query.mjs'));
  const camel = splitIdentifierTerms('where is capabilityRecall wired');
  check('C2 splits camelCase', camel.includes('capability') && camel.includes('recall'));

  const cooc = buildSynonymLayer();
  check('synonym layer non-empty', cooc.size > 100);
  const expanded = expandQueryTerms('model routing decision', cooc);
  check('C6 expansion retains base terms', ['model', 'routing', 'decision'].every((t) => expanded.includes(t)));
  check('C6 expansion deterministic', JSON.stringify(expandQueryTerms('model routing decision', cooc)) === JSON.stringify(expanded));

  console.log(`[retrieval-candidates --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes('--test')) {
    process.exit(runSelfTest() ? 0 : 1);
  }
  console.log('usage: retrieval-candidates.mjs --test');
}
