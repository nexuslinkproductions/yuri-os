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

// Below this many query features, a short cue is "contained" in almost everything (DS3 frontier:
// a 2-word cue floods). We never DROP results (that would silently break completeness) — we mark
// them sharp:false so the fusion/consumer layer can down-weight without a silent miss.
const DEFAULT_MIN_QUERY_FEATURES = 4;

function safeThreshold(threshold, fallback = 0.3) {
  const t = threshold == null ? fallback : Number(threshold);
  if (!Number.isFinite(t) || t <= 0 || t > 1) {
    throw new Error(`threshold must be in (0,1], got ${threshold}`);
  }
  return t;
}

// IDF over the index's own document frequencies. A shared rare feature ("lyapunov") weighs heavily;
// a shared common feature ("system") weighs ~nothing. BM25-flavored always-positive
// smoothed IDF + query-mass normalization — NOT BM25's RSJ idf (which goes negative
// for df>N/2); no tf-saturation, no length norm. Registry: math/CONVENTIONS.md axis 1.
function idfOf(df, n) {
  return Math.log((n + 1) / ((df || 0) + 0.5));
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
  const minQueryFeatures = Number.isInteger(opts.minQueryFeatures) && opts.minQueryFeatures > 0
    ? opts.minQueryFeatures : DEFAULT_MIN_QUERY_FEATURES;
  // The IDF floor a hit must clear (on rare-feature mass) to count as "sharp". Defaults to the raw
  // containment threshold so the precision gate is at least as strict as the recall gate.
  const sharpFloor = opts.sharpFloor == null ? threshold : Number(opts.sharpFloor);
  const t0 = process.hrtime.bigint();
  const qset = (index.featureFn || tokenize)(String(queryText ?? ''));
  const requiredShared = qset.size === 0 ? Infinity : Math.ceil(threshold * qset.size);
  const counts = new Map();
  const idfShared = new Map();           // per-candidate Σ idf(shared query feature)
  let qIdfTotal = 0;                      // Σ idf(f) over all query features (the denominator)

  for (const feature of qset) {
    const list = index.postings.get(feature);
    const df = list ? list.length : 0;
    const w = idfOf(df, index.n);
    qIdfTotal += w;
    if (!list) continue;
    for (const idx of list) {
      counts.set(idx, (counts.get(idx) || 0) + 1);
      idfShared.set(idx, (idfShared.get(idx) || 0) + w);
    }
  }

  // A query short enough to be contained in everything: keep the results (completeness), flag soft.
  const precisionGated = qset.size > 0 && qset.size < minQueryFeatures;
  const out = [];
  for (const [idx, shared] of counts) {
    if (shared < requiredShared) continue;
    const score = qset.size === 0 ? 0 : shared / qset.size;
    if (score >= threshold) {
      const idfScore = qIdfTotal > 0 ? (idfShared.get(idx) || 0) / qIdfTotal : 0;
      out.push({
        id: index.ids[idx],
        score: Number(score.toFixed(4)),
        idfScore: Number(idfScore.toFixed(4)),
        sharp: !precisionGated && idfScore >= sharpFloor,
        sharedFeatures: shared,
        queryFeatures: qset.size,
      });
    }
  }

  // Primary order stays raw-score (determinism + completeness); idfScore is the precision tiebreak.
  out.sort((a, b) => b.score - a.score || b.idfScore - a.idfScore
    || b.sharedFeatures - a.sharedFeatures || a.id.localeCompare(b.id));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    matches: top > 0 ? out.slice(0, top) : out,
    totalAboveThreshold: out.length,
    sharpCount: out.reduce((s, m) => s + (m.sharp ? 1 : 0), 0),
    candidates: counts.size,
    scanned: index.n,
    ms: Number(ms.toFixed(2)),
    mode: 'containment',
    metric: 'containment',
    threshold,
    precisionGated,
    minQueryFeatures,
    complete: true,
    requiredShared: Number.isFinite(requiredShared) ? requiredShared : 0,
    queryFeatures: qset.size,
  };
}
