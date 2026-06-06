#!/usr/bin/env node
/**
 * yuri-token-expand.mjs — embedding-free semantic bridging to kill TOKENIZATION COLLAPSE.
 *
 * THE PROBLEM — Jaccard over raw token sets returns 0 for semantic duplicates with DISJOINT
 * vocabulary ("login bypass" vs "authentication circumvention"). Synonyms + morphology + spelling
 * variants are invisible. Fix it WITHOUT neural embeddings (house law: deterministic, CPU, no
 * trained model, no GPU, no RNG-at-query). The corpus itself supplies the semantics.
 *
 * THREE COMPOSABLE BRIDGES (each a deliberate, bounded layer):
 *  1. CHAR-N-GRAM shingles  — morphology + spelling variants (script≈scripting≈scripts). Pure,
 *     corpus-free. Two tokens are "near" if their char-3-gram Jaccard ≥ τ.
 *  2. FIRST-ORDER PPMI expansion — SYNTAGMATIC association: terms that co-occur in documents
 *     (login↔password↔credential). PPMI(a,b)=max(0, log2 [p(a,b)/(p(a)p(b))]). Expand a token to
 *     its top-N PPMI neighbors above a threshold. Corpus-derived, deterministic.
 *  3. SECOND-ORDER distributional similarity (slot below) — PARADIGMATIC/synonym bridge: terms
 *     with similar PPMI co-occurrence PROFILES are synonyms even if they never co-occur
 *     (login≈signin). Levy-Goldberg 2014: PPMI-vector cosine ≈ word2vec. Method (PPMI-vector
 *     cosine vs Random Indexing, Kanerva 2000) chosen per the Phase-A research, then wired here.
 *
 * PRECISION CONTROL (expansion adds recall but risks false matches — bound it):
 *  - minCooc: ignore term pairs co-occurring < this (kills spurious rare pairs).
 *  - ppmiFloor: only neighbors with PPMI ≥ floor.
 *  - topN: cap neighbors per term.
 *  - expansion tokens are TAGGED (prefix '~') so a weighted-Jaccard can down-weight them vs
 *    original tokens — recall without letting expansion dominate the score.
 *
 * Pure + injectable: no I/O, no clock, no RNG. Mirrors yuri-jaccard / yuri-fsrs house style.
 */
import { tokenize } from './yuri-jaccard.mjs';

// ── 1. CHAR-N-GRAM (morphology / spelling) ───────────────────────────────────────────────────
export function charShingles(token, k = 3) {
  const s = '^' + String(token).toLowerCase() + '$';
  const out = new Set();
  if (s.length <= k) { out.add(s); return out; }
  for (let i = 0; i + k <= s.length; i++) out.add(s.slice(i, i + k));
  return out;
}

/** char-gram Jaccard similarity of two tokens ∈ [0,1] — catches morphology/spelling variants. */
export function tokenCharSim(a, b, k = 3) {
  if (a === b) return 1;
  const A = charShingles(a, k), B = charShingles(b, k);
  let inter = 0; const [sm, lg] = A.size <= B.size ? [A, B] : [B, A];
  for (const g of sm) if (lg.has(g)) inter++;
  const u = A.size + B.size - inter;
  return u === 0 ? 0 : inter / u;
}

// ── 2. CO-OCCURRENCE → PPMI (first-order syntagmatic) ─────────────────────────────────────────
/**
 * Build term doc-frequency + term-term co-occurrence from a corpus of texts. Co-occurrence =
 * # documents in which both terms appear. Deterministic, single O(Σ|doc|²-per-doc) pass; cap
 * per-doc tokens to keep it bounded on long docs.
 */
export function buildCooccurrence(texts, opts = {}) {
  // RED-TEAM fix: hard-clamp the per-doc token cap — an Infinity/large override restores the
  // O(tokens²) per-doc cost the cap exists to bound.
  const maxTokensPerDoc = Math.min(Number.isFinite(opts.maxTokensPerDoc) && opts.maxTokensPerDoc > 0 ? opts.maxTokensPerDoc : 40, 200);
  const df = new Map();           // term → doc count
  const cooc = new Map();         // "ab" (a<b) → co-doc count
  const N = texts.length;
  for (const text of texts) {
    const toks = [...tokenize(text)].slice(0, maxTokensPerDoc).sort();
    for (let i = 0; i < toks.length; i++) {
      df.set(toks[i], (df.get(toks[i]) || 0) + 1);
      for (let j = i + 1; j < toks.length; j++) {
        const key = toks[i] + '' + toks[j];
        cooc.set(key, (cooc.get(key) || 0) + 1);
      }
    }
  }
  return { df, cooc, N };
}

/** PPMI(a,b) from the co-occurrence stats. max(0, log2[p(a,b)/(p(a)p(b))]). */
export function ppmi(a, b, { df, cooc, N }) {
  if (a === b) return 0;
  const key = a < b ? a + '' + b : b + '' + a;
  const cab = cooc.get(key) || 0;
  if (cab === 0) return 0;
  const pa = (df.get(a) || 0) / N, pb = (df.get(b) || 0) / N, pab = cab / N;
  if (pa === 0 || pb === 0) return 0;
  return Math.max(0, Math.log2(pab / (pa * pb)));
}

/**
 * Build a first-order expansion map: term → [top-N PPMI neighbors] (bounded by precision knobs).
 * @returns {Map<string, string[]>}
 */
export function buildExpansionMap(stats, { minCooc = 3, ppmiFloor = 1.5, topN = 4 } = {}) {
  const { df, cooc } = stats;
  const neigh = new Map(); // term → [{t, s}]
  for (const [key, c] of cooc) {
    if (c < minCooc) continue;
    const [a, b] = key.split('');
    const s = ppmi(a, b, stats);
    if (s < ppmiFloor) continue;
    (neigh.get(a) || neigh.set(a, []).get(a)).push({ t: b, s });
    (neigh.get(b) || neigh.set(b, []).get(b)).push({ t: a, s });
  }
  const map = new Map();
  for (const [term, arr] of neigh) {
    arr.sort((x, y) => y.s - x.s);
    map.set(term, arr.slice(0, topN).map((x) => x.t));
  }
  return map;
}

/**
 * Expand a text's token set with PPMI neighbors (tagged '~' so a weighted scorer can down-weight).
 * Original tokens kept at full weight; expansion tokens added tagged.
 */
export function expandTokenSet(text, expansionMap, { perToken = 4 } = {}) {
  const base = tokenize(text);
  const expanded = new Set(base);
  for (const t of base) {
    const ns = expansionMap.get(t);
    if (ns) for (let i = 0; i < ns.length && i < perToken; i++) expanded.add('~' + ns[i]);
  }
  return expanded;
}

/** Weighted Jaccard where '~'-tagged (expansion) tokens count `expWeight` < 1 (precision guard). */
export function weightedJaccard(setA, setB, { expWeight = 0.5 } = {}) {
  const w = (t) => (t.startsWith('~') ? expWeight : 1);
  let inter = 0, uni = 0;
  const seen = new Set();
  for (const t of setA) { seen.add(t); uni += w(t); }
  for (const t of setB) { if (seen.has(t)) inter += w(t); else uni += w(t); }
  return uni === 0 ? 0 : inter / uni;
}

// ── EXPANDED FEATURE JACCARD (Codex design) — the COMPLETE-compatible collapse fix ──────────────
// Change the matching UNIT from raw tokens to a deterministic namespaced FEATURE set:
//   tok:<t>   raw token (full weight)
//   c4:<gram> char-4-gram of tokens len≥5 (morphology/spelling: script≈scripting)
//   sem:<a~b> symmetric PPMI concept-edge (topical/synonym bridge: login~password, cortex~circuitry)
// Used IDENTICALLY in buildIndex + query + scoring, the prefix-filter (Bayardo) stays COMPLETE —
// the theorem only needs a total order + the same set representation on both sides.
const CHARGRAM_K = 4, CHARGRAM_MINLEN = 5, CHARGRAM_MAX = 6;
export function features(text, { expansionMap = null, semPerToken = 4 } = {}) {
  const toks = tokenize(text);
  const F = new Set();
  for (const t of toks) {
    F.add('tok:' + t);
    if (t.length >= CHARGRAM_MINLEN) {
      let added = 0;
      for (let i = 0; i + CHARGRAM_K <= t.length && added < CHARGRAM_MAX; i++, added++) F.add('c4:' + t.slice(i, i + CHARGRAM_K));
    }
    if (expansionMap) {
      const ns = expansionMap.get(t);
      if (ns) for (let i = 0; i < ns.length && i < semPerToken; i++) {
        const u = ns[i]; F.add('sem:' + (t < u ? t + '~' + u : u + '~' + t));
      }
    }
  }
  return F;
}

/**
 * Build a corpus-derived feature function: stats + expansion map from the items, then a pure
 * featureFn(text) → namespaced feature Set. Drop-in for corpus-match buildIndex({featureFn}).
 * Precision knobs (Codex): minCooc, ppmiFloor, topN, semPerToken — bound the sem: edges.
 */
export function makeFeatureFn(items, opts = {}) {
  const texts = items.map((it) => it.text);
  const stats = buildCooccurrence(texts, opts);
  const expansionMap = buildExpansionMap(stats, opts);
  const semPerToken = opts.semPerToken ?? 4;
  const featureFn = (text) => features(text, { expansionMap, semPerToken });
  return { featureFn, stats, expansionMap };
}

/** Plain feature fn (tok + c4 only, no corpus) — morphology bridge with zero corpus dependency. */
export function plainFeatureFn(text) { return features(text, { expansionMap: null }); }

if (import.meta.url === `file://${process.argv[1]}`) {
  // demo: a tiny corpus where "login" and "signin" never co-occur but share context (auth/password)
  const corpus = [
    'login requires a password and auth token',
    'signin requires a password and auth token',
    'login form auth credential check',
    'signin form auth credential check',
    'subdomain takeover dangling dns record',
  ];
  const stats = buildCooccurrence(corpus);
  const map = buildExpansionMap(stats, { minCooc: 2, ppmiFloor: 0.5, topN: 4 });
  const A = expandTokenSet('login password', map);
  const B = expandTokenSet('signin password', map);
  console.log(JSON.stringify({
    expand_login: map.get('login'), expand_signin: map.get('signin'),
    A: [...A], B: [...B],
    weightedJaccard: weightedJaccard(A, B).toFixed(3),
    charSim_script_scripting: tokenCharSim('script', 'scripting').toFixed(3),
  }, null, 2));
}
