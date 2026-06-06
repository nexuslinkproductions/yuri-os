#!/usr/bin/env node
/**
 * memory-match.mjs — COMPLETE prefix-filter recall over memory/subconscious records.
 *
 * This augments the cold-store BM25 path without replacing it: BM25 stays useful for cheap lexical
 * ranking, while this matcher returns the complete set above a deterministic Expanded Feature
 * Jaccard threshold. No embeddings, no clock in the core, no writes.
 */
import { buildIndex, matchPrefixFilter } from './corpus-match.mjs';
import { makeFeatureFn } from './math/yuri-token-expand.mjs';
import { COLD_DB_PATH, openColdStore } from './memory-cold-store.mjs';

function normalizeRecord(record) {
  const id = String(record?.id ?? record?.slug ?? '').trim();
  if (!id) throw new Error('memory record requires an id or slug');
  const text = String(record?.text ?? [
    record?.slug,
    record?.title,
    record?.description,
    record?.body,
    record?.trig,
  ].filter((x) => x != null && x !== '').join(' ')).trim();
  return { id, text };
}

/**
 * Build a COMPLETE prefix-filter memory index from [{id,text}] or cold/markdown-shaped records.
 * The index is valid for recall thresholds >= buildThreshold.
 */
export function buildMemoryIndex(records, { threshold = 0.3, featureOptions = {} } = {}) {
  const items = records.map(normalizeRecord).filter((r) => r.text.length > 0);
  const { featureFn, stats, expansionMap, secondOrderMap } = makeFeatureFn(items, {
    minCooc: 2,
    ppmiFloor: 1.0,
    topN: 4,
    ...featureOptions,
  });
  const index = buildIndex(items, { threshold, featureFn, lsh: false, prefixFilter: true });
  return { ...index, items, memory: { stats, expansionMap, secondOrderMap, buildThreshold: threshold } };
}

/** Recall the complete, score-ranked set of memory ids above threshold. */
export function recallMemory(index, cue, { threshold = 0.3, top = 0 } = {}) {
  const res = matchPrefixFilter(index, cue, { threshold, top });
  return {
    matches: res.matches.map((m) => ({ id: m.id, score: m.score })),
    totalAboveThreshold: res.totalAboveThreshold,
    candidates: res.candidates,
    scanned: res.scanned,
    ms: res.ms,
    threshold: res.threshold,
    complete: res.complete,
  };
}

/**
 * Convert the cold store's cold_docs rows to matcher records. Accepts an injected db for tests.
 * If no db is supplied, opens the live cold store read/write-compatible through the existing API.
 */
export function coldStoreToRecords(db = null) {
  const handle = db || openColdStore(COLD_DB_PATH);
  const ownsDb = !db;
  try {
    return handle.prepare(`
      SELECT slug, title, body, trig
      FROM cold_docs
      ORDER BY slug
    `).all().map((r) => ({
      id: String(r.slug || ''),
      text: [r.slug, r.title, r.body, r.trig].filter((x) => x != null && x !== '').join(' ').trim(),
    })).filter((r) => r.id && r.text);
  } finally {
    if (ownsDb) handle.close();
  }
}

/**
 * Union BM25 candidates with complete matcher hits and retain provenance.
 * bm25 rows may use {slug}; matcher rows may use {id}. Existing row fields are preserved.
 */
export function blendMemoryRecall(bm25Candidates = [], matcherMatches = []) {
  const byId = new Map();
  const ensure = (id) => {
    const key = String(id || '');
    if (!key) return null;
    if (!byId.has(key)) byId.set(key, { id: key, provenance: [] });
    return byId.get(key);
  };
  for (const row of bm25Candidates || []) {
    const entry = ensure(row.slug ?? row.id);
    if (!entry) continue;
    entry.provenance.push('bm25');
    entry.bm25 = row;
  }
  const matches = Array.isArray(matcherMatches) ? matcherMatches : matcherMatches?.matches || [];
  for (const row of matches || []) {
    const entry = ensure(row.id ?? row.slug);
    if (!entry) continue;
    entry.provenance.push('matcher');
    entry.matcher = { id: entry.id, score: Number(row.score || 0) };
  }
  return [...byId.values()]
    .map((entry) => ({ ...entry, provenance: [...new Set(entry.provenance)] }))
    .sort((a, b) => (Number(b.matcher?.score || 0) - Number(a.matcher?.score || 0)) || a.id.localeCompare(b.id));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cue = process.argv.slice(2).join(' ');
  if (!cue) {
    console.log('usage: memory-match.mjs "<cue>"');
    process.exit(0);
  }
  const records = coldStoreToRecords();
  const index = buildMemoryIndex(records);
  console.log(JSON.stringify(recallMemory(index, cue), null, 2));
}
