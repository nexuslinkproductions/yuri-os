#!/usr/bin/env node
/**
 * yuri-match.mjs — universal complete-recall service.
 *
 * One deterministic prefix-filter matcher, many registered {id,text} corpora.
 * Every recall result carries completeness + provenance; no top-N silent truncation.
 */
import { buildIndex, matchPrefixFilter } from './corpus-match.mjs';
import { makeFeatureFn, plainFeatureFn } from './math/yuri-token-expand.mjs';
import { buildContainmentIndex, matchContainment } from './yuri-containment-match.mjs';

const DEFAULT_THRESHOLD = 0.3;
const corpora = new Map();

function assertCorpusId(corpusId) {
  const id = String(corpusId ?? '').trim();
  if (!id) throw new Error('corpusId is required');
  return id;
}

function safeThreshold(threshold, fallback = DEFAULT_THRESHOLD) {
  const t = threshold == null ? fallback : Number(threshold);
  if (!Number.isFinite(t) || t <= 0 || t > 1) {
    throw new Error(`threshold must be in (0,1], got ${threshold}`);
  }
  return t;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) throw new Error('items must be an array of {id,text}');
  return items.map((item, idx) => {
    const id = String(item?.id ?? '').trim();
    const text = String(item?.text ?? '').trim();
    if (!id) throw new Error(`items[${idx}] missing id`);
    if (!text) throw new Error(`items[${idx}] missing text`);
    return { id, text };
  });
}

function featureRank(feature) {
  if (feature.startsWith('tok:')) return 0;
  if (feature.startsWith('sem2:')) return 1;
  if (feature.startsWith('sem:')) return 2;
  if (feature.startsWith('c4:')) return 3;
  return 4;
}

function sortedSharedFeatures(a, b, limit) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const shared = [];
  for (const feature of small) if (large.has(feature)) shared.push(feature);
  shared.sort((x, y) => featureRank(x) - featureRank(y) || x.localeCompare(y));
  return shared.slice(0, limit);
}

function envelope(corpus, cue, requestedThreshold, result) {
  return {
    corpusId: corpus.corpusId,
    complete: result.complete === true,
    totalAboveThreshold: result.totalAboveThreshold,
    threshold: requestedThreshold,
    buildThreshold: corpus.buildThreshold,
    candidates: result.candidates,
    scanned: result.scanned,
    matches: result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      corpusId: corpus.corpusId,
      complete: result.complete === true,
      totalAboveThreshold: result.totalAboveThreshold,
      threshold: requestedThreshold,
      buildThreshold: corpus.buildThreshold,
      cue,
    })),
  };
}

function asymEnvelope(corpus, cue, requestedThreshold, result) {
  return {
    corpusId: corpus.corpusId,
    complete: result.complete === true,
    totalAboveThreshold: result.totalAboveThreshold,
    threshold: requestedThreshold,
    buildThreshold: corpus.buildThreshold,
    candidates: result.candidates,
    scanned: result.scanned,
    metric: result.metric,
    requiredShared: result.requiredShared,
    queryFeatures: result.queryFeatures,
    precisionGated: result.precisionGated,
    minQueryFeatures: result.minQueryFeatures,
    sharpCount: result.sharpCount,
    matches: result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      idfScore: match.idfScore,
      sharp: match.sharp,
      corpusId: corpus.corpusId,
      complete: result.complete === true,
      totalAboveThreshold: result.totalAboveThreshold,
      threshold: requestedThreshold,
      buildThreshold: corpus.buildThreshold,
      cue,
      metric: result.metric,
      sharedFeatures: match.sharedFeatures,
      queryFeatures: match.queryFeatures,
    })),
  };
}

/**
 * Register one corpus as a deterministic prefix-filter index.
 * opts:
 *   threshold: build threshold; recalls below it are marked complete:false
 *   featureFn: optional explicit text -> Set feature function
 *   featureOptions: passed to makeFeatureFn when featureFn is not supplied
 *   expandedFeatures: false uses tok+c4 only; default uses corpus-derived makeFeatureFn
 */
export function registerCorpus(corpusId, items, opts = {}) {
  const id = assertCorpusId(corpusId);
  const normalized = normalizeItems(items);
  const buildThreshold = safeThreshold(opts.threshold, DEFAULT_THRESHOLD);
  const itemById = new Map(normalized.map((item) => [item.id, item]));

  let featureFn = opts.featureFn;
  let featureProvenance = 'custom';
  let featureStats = null;
  if (!featureFn) {
    if (opts.expandedFeatures === false) {
      featureFn = plainFeatureFn;
      featureProvenance = 'plainFeatureFn';
    } else {
      const built = makeFeatureFn(normalized, opts.featureOptions || {});
      featureFn = built.featureFn;
      featureStats = {
        docs: built.stats.N,
        terms: built.stats.df.size,
        expansionTerms: built.expansionMap.size,
        secondOrderTerms: built.secondOrderMap ? built.secondOrderMap.size : 0,
      };
      featureProvenance = 'makeFeatureFn';
    }
  }

  const index = buildIndex(normalized, {
    threshold: buildThreshold,
    featureFn,
    lsh: false,
    prefixFilter: true,
  });
  const containmentIndex = buildContainmentIndex(normalized, { featureFn });
  const corpus = {
    corpusId: id,
    items: normalized,
    itemById,
    index,
    containmentIndex,
    featureFn,
    featureProvenance,
    featureStats,
    buildThreshold,
  };
  corpora.set(id, corpus);
  return {
    corpusId: id,
    registered: true,
    count: normalized.length,
    buildThreshold,
    completeForThresholdGte: buildThreshold,
    featureProvenance,
  };
}

export function recall(corpusId, cue, opts = {}) {
  const id = assertCorpusId(corpusId);
  const corpus = corpora.get(id);
  if (!corpus) throw new Error(`unknown corpus: ${id}`);
  const query = String(cue ?? '').trim();
  if (!query) throw new Error('cue is required');
  const threshold = safeThreshold(opts.threshold, corpus.buildThreshold);
  const result = matchPrefixFilter(corpus.index, query, { threshold });
  return envelope(corpus, query, threshold, result);
}

export function recallAsym(corpusId, cue, opts = {}) {
  const id = assertCorpusId(corpusId);
  const corpus = corpora.get(id);
  if (!corpus) throw new Error(`unknown corpus: ${id}`);
  const query = String(cue ?? '').trim();
  if (!query) throw new Error('cue is required');
  const metric = opts.metric || 'containment';
  if (metric !== 'containment') throw new Error(`unsupported asymmetric metric: ${metric}`);
  const threshold = safeThreshold(opts.threshold, corpus.buildThreshold);
  const result = matchContainment(corpus.containmentIndex, query, {
    threshold, top: opts.top, minQueryFeatures: opts.minQueryFeatures, sharpFloor: opts.sharpFloor,
  });
  return asymEnvelope(corpus, query, threshold, result);
}

export function recallAll(cue, opts = {}) {
  const query = String(cue ?? '').trim();
  if (!query) throw new Error('cue is required');
  const threshold = opts.threshold == null ? DEFAULT_THRESHOLD : safeThreshold(opts.threshold);
  const corporaResults = [...corpora.keys()].sort().map((corpusId) => recall(corpusId, query, { threshold }));
  const matches = corporaResults
    .flatMap((result) => result.matches)
    .sort((a, b) => b.score - a.score || a.corpusId.localeCompare(b.corpusId) || a.id.localeCompare(b.id));
  return {
    complete: corporaResults.every((result) => result.complete === true),
    totalAboveThreshold: corporaResults.reduce((sum, result) => sum + result.totalAboveThreshold, 0),
    threshold,
    corpusCount: corporaResults.length,
    corpora: corporaResults.map((result) => ({
      corpusId: result.corpusId,
      complete: result.complete,
      totalAboveThreshold: result.totalAboveThreshold,
      threshold: result.threshold,
      buildThreshold: result.buildThreshold,
    })),
    matches,
  };
}

export function explain(hit, opts = {}) {
  const corpusId = assertCorpusId(hit?.corpusId);
  const corpus = corpora.get(corpusId);
  if (!corpus) throw new Error(`unknown corpus: ${corpusId}`);
  const id = String(hit?.id ?? '').trim();
  const item = corpus.itemById.get(id);
  if (!item) throw new Error(`unknown hit id for corpus ${corpusId}: ${id}`);
  const cue = String(hit?.cue ?? opts.cue ?? '').trim();
  if (!cue) throw new Error('explain requires hit.cue or opts.cue');
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 12;
  const cueFeatures = corpus.featureFn(cue);
  const itemFeatures = corpus.featureFn(item.text);
  const sharedFeatures = sortedSharedFeatures(cueFeatures, itemFeatures, limit);
  return {
    corpusId,
    id,
    score: hit.score,
    complete: hit.complete,
    threshold: hit.threshold,
    sharedFeatures,
    sharedFeatureCount: sharedFeatures.length,
    featureProvenance: corpus.featureProvenance,
  };
}

export function clearCorpora() {
  corpora.clear();
}

export function listCorpora() {
  return [...corpora.values()].map((corpus) => ({
    corpusId: corpus.corpusId,
    count: corpus.items.length,
    buildThreshold: corpus.buildThreshold,
    featureProvenance: corpus.featureProvenance,
  })).sort((a, b) => a.corpusId.localeCompare(b.corpusId));
}
