#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
/**
 * yuri-jaccard.mjs — embedding-free hot-tier saturation probe for the memory consolidator.
 *
 * SOURCE THEORY — Hopfield associative-memory capacity (Amit-Gutfreund-Sompolinsky):
 *   past an interference threshold, mutual crosstalk between stored patterns degrades
 *   recall super-linearly. Saturation is governed by INTERFERENCE, not just per-item decay.
 *
 * THE TRANSFER — a deterministic hot-tier saturation probe over MEMORY.md hot entries:
 *   (1) token-set vectorize each entry (embedding-free — no shared coordinate space);
 *   (2) pairwise Jaccard (or tf-cosine) overlap;
 *   (3) load = (count of pairs above an overlap threshold) / N — an AGS-shaped
 *       saturation RATIO in [0, (n-1)/2], NOT a probability (it can exceed 1);
 *   (4) flag "over-capacity → consolidate/dedup before recall degrades" when load crosses
 *       an EMPIRICALLY-CALIBRATED threshold, and surface the most-overlapping pairs as
 *       DETERMINISTIC merge candidates.
 *
 * This DOWNGRADES the LLM-eyeball dedup in kagami-memory-consolidator.mjs from primary
 * detector to tie-breaker — dedup signal now exists whether or not rapid-mlx is up.
 *
 * MISMATCH / RISK (per catalog card 30): do NOT hard-code the 0.138 AGS constant — it is
 * cited only as structural justification for super-linear degradation; the load/overlap
 * thresholds are TUNED knobs (sourced from energy-weights.json). The Hopfield pattern-
 * completion / recall mechanism is PARKED (blocked by the embedding-free constraint).
 *
 * Pure + injectable: no I/O, no clock, no config read. Mirrors yuri-fsrs.mjs house style.
 */

// Tokenizer: lowercase, split on non-word, drop length-<3 tokens (stopword-ish noise that
// inflates overlap between unrelated entries). Returns a Set (token-set vectorizer).
const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
  'her', 'was', 'one', 'our', 'out', 'has', 'had', 'his', 'how', 'its', 'who', 'get', 'got',
  'this', 'that', 'with', 'from', 'into', 'they', 'them', 'then', 'than', 'over', 'when',
  'what', 'were', 'will', 'your', 'have', 'been', 'also']);

// RED-TEAM fix: hard input cap so an adversarial multi-MB query/doc can't allocate unbounded
// token structures. 200k chars ≫ any real title/query; longer inputs are truncated, not refused.
const MAX_TOKENIZE_CHARS = 200000;
export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return new Set();
  const s = text.length > MAX_TOKENIZE_CHARS ? text.slice(0, MAX_TOKENIZE_CHARS) : text;
  const out = new Set();
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOP.has(raw)) out.add(raw);
  }
  return out;
}

/** Token-frequency map (for tf-cosine), embedding-free. */
export function tokenFreq(text) {
  const map = new Map();
  if (typeof text !== 'string' || text.length === 0) return map;
  const s = text.length > MAX_TOKENIZE_CHARS ? text.slice(0, MAX_TOKENIZE_CHARS) : text; // RED-TEAM r2: cap (was tokenize-only)
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOP.has(raw)) map.set(raw, (map.get(raw) || 0) + 1);
  }
  return map;
}

/** Jaccard similarity |A∩B| / |A∪B| ∈ [0,1]. Two empty sets → 0 (no shared signal). */
export function jaccard(setA, setB) {
  const a = setA instanceof Set ? setA : new Set();
  const b = setB instanceof Set ? setB : new Set();
  if (a.size === 0 && b.size === 0) return 0;     // no signal → not "identical"
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** tf-cosine similarity over the shared vocabulary ∈ [0,1]. Empty either side → 0. */
export function tfCosine(freqA, freqB) {
  const a = freqA instanceof Map ? freqA : new Map();
  const b = freqB instanceof Map ? freqB : new Map();
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [t, v] of small) { const w = large.get(t); if (w) dot += v * w; }
  let na = 0; for (const v of a.values()) na += v * v;
  let nb = 0; for (const v of b.values()) nb += v * v;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Hot-tier saturation probe. Pairwise overlap across entries; flags the most-overlapping
 * pairs as deterministic merge candidates and reports a saturation `load`.
 *
 * @param {Array<{id:string, text:string}>} entries
 * @param {object} [opts]
 * @param {number} [opts.overlapThreshold]  pair flagged as overlapping at/above this (default 0.6)
 * @param {number} [opts.loadThreshold]     over-capacity when load >= this (default 0.15, TUNED — cites AGS only structurally)
 * @param {'jaccard'|'cosine'} [opts.metric]  similarity metric (default 'jaccard')
 * @param {number} [opts.topK]              max merge pairs surfaced (default 20)
 * @returns {{ n:number, load:number, overCapacity:boolean, mergePairs:Array, overlapThreshold:number, loadThreshold:number, metric:string }}
 */
export function saturationProbe(entries, opts = {}) {
  const { overlapThreshold = 0.6, loadThreshold = 0.15, metric = 'jaccard', topK = 20 } = opts;
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e.text === 'string') : [];
  const n = list.length;
  if (n < 2) {
    return { n, load: 0, overCapacity: false, mergePairs: [], overlapThreshold, loadThreshold, metric };
  }
  // Pre-vectorize once (O(n) tokenization, not O(n²)).
  const vecs = list.map((e) => (metric === 'cosine' ? tokenFreq(e.text) : tokenize(e.text)));
  const sim = metric === 'cosine' ? tfCosine : jaccard;
  const pairs = [];
  let highOverlapPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = sim(vecs[i], vecs[j]);
      if (s >= overlapThreshold) {
        highOverlapPairs++;
        pairs.push({ a: list[i].id, b: list[j].id, overlap: Number(s.toFixed(4)) });
      }
    }
  }
  // load = high-overlap pairs / N (entries), not / pairCount — keeps the AGS "P/N" shape:
  // saturation rises with redundant patterns relative to the store size.
  const load = highOverlapPairs / n;
  pairs.sort((x, y) => y.overlap - x.overlap);
  return {
    n,
    load: Number(load.toFixed(4)),
    overCapacity: load >= loadThreshold,
    mergePairs: pairs.slice(0, topK),
    overlapThreshold,
    loadThreshold,
    metric,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = [
    { id: 'a', text: 'session resume cortex decoder circuitry build plan next steps wire engine' },
    { id: 'b', text: 'session resume cortex decoder circuitry build plan next steps wire engine extra' },
    { id: 'c', text: 'cold call opener objection rebuttal social selling outreach sequence buyer persona' },
  ];
  console.log(JSON.stringify(saturationProbe(entries, { overlapThreshold: 0.6, loadThreshold: 0.15 }), null, 2));
}
