#!/usr/bin/env node
/**
 * yuri-containment-match.mjs — asymmetric query containment for cross-scale recall.
 *
 * containment(q, d) = |F(q) intersect F(d)| / |F(q)|
 *
 * This is intentionally separate from corpus-match's Jaccard prefix-filter. The complete
 * candidate filter for containment >= t counts postings for every query feature and keeps
 * docs whose shared-feature count reaches ceil(t * |F(q)|). That removes the peer-length
 * band that makes short cues unable to match long documents.
 */
import { tokenize } from './math/yuri-jaccard.mjs';

function safeThreshold(threshold, fallback = 0.3) {
  const t = threshold == null ? fallback : Number(threshold);
  if (!Number.isFinite(t) || t <= 0 || t > 1) {
    throw new Error(`threshold must be in (0,1], got ${threshold}`);
  }
  return t;
}

export function containment(queryFeatures, docFeatures) {
  const q = queryFeatures instanceof Set ? queryFeatures : new Set();
  const d = docFeatures instanceof Set ? docFeatures : new Set();
  if (q.size === 0 || d.size === 0) return 0;
  let shared = 0;
  for (const feature of q) if (d.has(feature)) shared++;
  return shared / q.size;
}

export function buildContainmentIndex(items, opts = {}) {
  if (!Array.isArray(items)) throw new Error('items must be an array of {id,text}');
  const featureFn = opts.featureFn || tokenize;
  const ids = [];
  const sets = [];
  const postings = new Map();

  items.forEach((item, idx) => {
    const id = String(item?.id ?? '').trim();
    const text = String(item?.text ?? '');
    if (!id) throw new Error(`items[${idx}] missing id`);
    ids.push(id);
    const features = featureFn(text);
    sets.push(features);
    for (const feature of features) {
      let list = postings.get(feature);
      if (!list) {
        list = [];
        postings.set(feature, list);
      }
      list.push(idx);
    }
  });

  return { ids, sets, postings, featureFn, n: ids.length };
}

export function matchContainment(index, queryText, opts = {}) {
  if (!index || !index.postings || !index.sets || !index.ids) {
    throw new Error('index must be a containment index');
  }
  const threshold = safeThreshold(opts.threshold, 0.3);
  const top = Number.isInteger(opts.top) && opts.top > 0 ? opts.top : 0;
  const t0 = process.hrtime.bigint();
  const qset = (index.featureFn || tokenize)(String(queryText ?? ''));
  const requiredShared = qset.size === 0 ? Infinity : Math.ceil(threshold * qset.size);
  const counts = new Map();

  for (const feature of qset) {
    const list = index.postings.get(feature);
    if (!list) continue;
    for (const idx of list) counts.set(idx, (counts.get(idx) || 0) + 1);
  }

  const out = [];
  for (const [idx, shared] of counts) {
    if (shared < requiredShared) continue;
    const score = qset.size === 0 ? 0 : shared / qset.size;
    if (score >= threshold) {
      out.push({
        id: index.ids[idx],
        score: Number(score.toFixed(4)),
        sharedFeatures: shared,
        queryFeatures: qset.size,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || b.sharedFeatures - a.sharedFeatures || a.id.localeCompare(b.id));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    matches: top > 0 ? out.slice(0, top) : out,
    totalAboveThreshold: out.length,
    candidates: counts.size,
    scanned: index.n,
    ms: Number(ms.toFixed(2)),
    mode: 'containment',
    metric: 'containment',
    threshold,
    complete: true,
    requiredShared: Number.isFinite(requiredShared) ? requiredShared : 0,
    queryFeatures: qset.size,
  };
}
