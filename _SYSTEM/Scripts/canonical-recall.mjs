#!/usr/bin/env node
// @capability: canonical-recall
// @serves: read canonical truth | recall canonical | query canonical store | consume canonical memory | any lane reads canonical | canonical lookup | contested claims surface | what does canonical say
// @does: the peer-open READ/RECALL surface for the canonical-truth store — turns a write-only store into a
//        CONSUMED one (it had ZERO real readers before this). recallCanonical({subject,predicate,domain,minTier,
//        freeText,...}) filters + ranks the live canonical claim set; recallByKey/recallBySubject for exact
//        lookups; contestedClaims() surfaces lane disagreements from the materialized read-view. Pure read:
//        no wrapper, no lease, zero privilege (the store's peer-open contract). freeText ranks by yuri-match's
//        weightedFeatureJaccard primitive (capability-first) over token features + a local df-idf. Every result
//        is advisory (canonical truth is a CLAIM — the caller verifies before citing) and carries a contested flag.
// @use: recallCanonical({ freeText:'jan' }) from ANY lane to consult canonical truth; CLI `node canonical-recall.mjs "<q>"`.
//       This is the surface behind xref-GROUND fusion + any session bootstrap — both just call recallCanonical.
// @exports: recallCanonical, recallByKey, recallBySubject, contestedClaims, claimText, TIER_RANK
// @depends: memory-canonical-store.mjs (loadCanonical, readView, keyOf), yuri-match-global-space.mjs (weightedFeatureJaccard)

import { loadCanonical, readView, keyOf } from './memory-canonical-store.mjs';
import { weightedFeatureJaccard } from './yuri-match-global-space.mjs';

// String tiers in this store (Track-A scope-derived: permanent > project; advisory lowest). Map to a rank for
// minTier floors. Genesis claims may carry a numeric/absent tier -> rank conservatively.
export const TIER_RANK = { permanent: 3, project: 2, advisory: 1 };
const tierRank = (t) => TIER_RANK[t] ?? (t == null ? 0 : (Number.isFinite(t) ? t : 1));

// SAFE text of a claim — object may be a string, number, null, or {content,...} (Track-A bridge). NEVER blindly
// .toLowerCase() a non-string (the classic crash). content-bearing objects expose their content; others stringify.
export function claimText(c) {
  const o = c.object;
  const objStr = o == null ? '' : (typeof o === 'object' ? (o.content ?? JSON.stringify(o)) : String(o));
  return `${c.subject} ${c.predicate} ${objStr}`;
}

const tokenize = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g) || []);

/**
 * Peer-open recall over the live canonical claim set. All filters optional; freeText ranks by weighted token
 * overlap. Returns advisory claims (each with provenance + a contested flag); the caller verifies before citing.
 * includeAdvisory surfaces filing-lane claims (off by default — store contract). opts.dir flows to the store (tests).
 */
export function recallCanonical(opts = {}) {
  const { subject, predicate, domain, minTier, freeText, limit = 20, includeAdvisory = false } = opts;
  const contested = new Set(Object.keys(readView(opts).contested || {}));   // contested = key set from the read-view (NOT a memory_type)
  let claims = loadCanonical({ ...opts, includeAdvisory });
  if (subject) claims = claims.filter((c) => c.subject === subject);
  if (predicate) claims = claims.filter((c) => c.predicate === predicate);
  if (domain) claims = claims.filter((c) => c.domain === domain);
  if (minTier != null) claims = claims.filter((c) => tierRank(c.tier) >= tierRank(minTier));

  let ranked;
  if (freeText) {
    const docs = claims.map((c) => tokenize(claimText(c)));
    const df = new Map();
    for (const d of docs) for (const f of d) df.set(f, (df.get(f) || 0) + 1);
    const N = docs.length || 1;
    const idf = new Map([...df].map(([f, c]) => [f, Math.log(1 + N / c)]));  // local df-idf; yuri-match global space is the scale-path ranker
    const q = tokenize(freeText);
    ranked = claims
      .map((c, i) => ({ c, score: weightedFeatureJaccard(q, docs[i], idf) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => ({ ...r.c, _score: Number(r.score.toFixed(4)) }));
  } else {
    ranked = claims.map((c) => ({ ...c }));
  }

  return ranked.slice(0, limit).map((c) => ({
    subject: c.subject, predicate: c.predicate, object: c.object,
    tier: c.tier ?? null, domain: c.domain ?? null, provenance: c.provenance, eventId: c.eventId,
    contested: contested.has(keyOf(c)), advisory: true, ...(c._score != null ? { _score: c._score } : {}),
  }));
}

/** Exact (subject,predicate) lookup -> the winning claim or null. */
export function recallByKey(subject, predicate, opts = {}) {
  return recallCanonical({ ...opts, subject, predicate, limit: 1 })[0] || null;
}

/** All claims for a subject. */
export function recallBySubject(subject, opts = {}) {
  return recallCanonical({ ...opts, subject, limit: opts.limit ?? 50 });
}

/** Lane disagreements: every contested key + its competing (lane,object) set, from the read-view. */
export function contestedClaims(opts = {}) {
  const c = readView(opts).contested || {};
  return Object.entries(c).map(([key, v]) => ({ key, competing: v.competing || [] }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = process.argv.slice(2).join(' ').trim();
  if (!q) {
    console.log(JSON.stringify({ totalClaims: loadCanonical().length, contested: contestedClaims().length }, null, 2));
  } else {
    const hits = recallCanonical({ freeText: q });
    console.log(`⬡ canonical recall "${q}" — ${hits.length} hit(s)`);
    for (const h of hits) {
      const obj = typeof h.object === 'object' && h.object ? (h.object.content?.slice(0, 64) ?? JSON.stringify(h.object).slice(0, 64)) : h.object;
      console.log(`  [${h.tier ?? '-'}] ${h.subject} · ${h.predicate} → ${obj}${h.contested ? '  ⚠CONTESTED' : ''}  (${h._score ?? ''})`);
    }
  }
}
