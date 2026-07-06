#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: fuzzy-cross-surface-match
// @serves: fuzzy match | near duplicate | entity resolution | dedup | similarity | cross surface recall | compare across surfaces | idf | boilerplate weighting | rare term weighting | ppmi | feature space
// @does: One union-trained PPMI + global-IDF feature space across all surfaces; rare features up-weighted (boilerplate down-weighted, corpus-derived). Cross-surface recall (memory<->code) via containment + RRF.
// @use: Reach for this before building any fuzzy matching, dedup, IDF/boilerplate weighting, or cross-surface comparison.
// @exports: buildGlobalFeatureFn, buildIdf
/**
 * yuri-match-global-space.mjs — one union-trained feature space for yuri-match surfaces.
 *
 * The existing yuri-match service is already complete for each registered corpus because every
 * index/query pair uses the same featureFn inside that corpus. This module removes the per-corpus
 * PPMI vocabulary split by fitting makeFeatureFn once over the union of all surfaces, then registering
 * each surface with that same featureFn. It also computes global IDF weights over the same union so
 * cross-surface scores can be compared with one weighted-Jaccard scale.
 */
import { makeFeatureFn } from './math/yuri-token-expand.mjs';
import { buildIndex, matchExact, matchPrefixFilter } from './corpus-match.mjs';

export const DEFAULT_GLOBAL_THRESHOLD = 0.3;

function safeThreshold(threshold, fallback = DEFAULT_GLOBAL_THRESHOLD) {
  const t = threshold == null ? fallback : Number(threshold);
  if (!Number.isFinite(t) || t <= 0 || t > 1) throw new Error(`threshold must be in (0,1], got ${threshold}`);
  return t;
}

function normalizeItem(item, idx, corpusId) {
  const id = String(item?.id ?? '').trim();
  const text = String(item?.text ?? '').trim();
  if (!id) throw new Error(`${corpusId}[${idx}] missing id`);
  if (!text) throw new Error(`${corpusId}[${idx}] missing text`);
  return { id, text };
}

export function normalizeSurfaces(allSurfaces) {
  if (!allSurfaces || (typeof allSurfaces !== 'object' && !Array.isArray(allSurfaces))) {
    throw new Error('allSurfaces must be an object map or array of {corpusId,items}');
  }
  const entries = Array.isArray(allSurfaces)
    ? allSurfaces.map((surface, idx) => {
      const corpusId = String(surface?.corpusId ?? surface?.surfaceId ?? surface?.name ?? `surface_${idx}`).trim();
      return [corpusId, surface?.items ?? surface?.records ?? surface];
    })
    : Object.entries(allSurfaces);

  return entries.map(([rawId, rawItems]) => {
    const corpusId = String(rawId ?? '').trim();
    if (!corpusId) throw new Error('surface corpusId is required');
    const items = typeof rawItems === 'function' ? rawItems() : (rawItems?.items ?? rawItems);
    if (!Array.isArray(items)) throw new Error(`surface ${corpusId} must resolve to an item array`);
    return { corpusId, items: items.map((item, idx) => normalizeItem(item, idx, corpusId)) };
  }).filter((surface) => surface.items.length > 0);
}

function flattenSurfaces(surfaces) {
  return surfaces.flatMap((surface) => surface.items.map((item) => ({
    id: `${surface.corpusId}:${item.id}`,
    text: item.text,
    corpusId: surface.corpusId,
    localId: item.id,
  })));
}

function buildIdf(featureFn, unionItems) {
  const df = new Map();
  for (const item of unionItems) {
    for (const feature of featureFn(item.text)) df.set(feature, (df.get(feature) || 0) + 1);
  }
  const N = unionItems.length;
  const idf = new Map();
  for (const [feature, count] of df) idf.set(feature, Number((Math.log((1 + N) / (1 + count)) + 1).toFixed(12)));
  return { idf, df, docs: N };
}

export function weightedFeatureJaccard(setA, setB, idf) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let inter = 0, uni = 0;
  const seen = new Set();
  for (const feature of setA) {
    seen.add(feature);
    uni += idf.get(feature) ?? 1;
  }
  for (const feature of setB) {
    const w = idf.get(feature) ?? 1;
    if (seen.has(feature)) inter += w;
    else uni += w;
  }
  return uni === 0 ? 0 : inter / uni;
}

/**
 * Fit makeFeatureFn once over every surface item. All downstream indexes and queries should use the
 * returned featureFn; globalScore uses the same features plus union-wide IDF weights.
 */
export function buildGlobalFeatureFn(allSurfaceItems, opts = {}) {
  const surfaces = normalizeSurfaces(allSurfaceItems);
  const unionItems = flattenSurfaces(surfaces);
  if (unionItems.length === 0) throw new Error('cannot build a global feature space from zero items');

  const built = makeFeatureFn(unionItems, opts.featureOptions || opts);
  const { idf, df, docs } = buildIdf(built.featureFn, unionItems);
  const global = {
    featureFn: built.featureFn,
    idf,
    df,
    surfaces,
    unionItems,
    docs,
    featureProvenance: 'global makeFeatureFn + union IDF',
    stats: {
      docs: built.stats.N,
      terms: built.stats.df.size,
      expansionTerms: built.expansionMap.size,
      secondOrderTerms: built.secondOrderMap ? built.secondOrderMap.size : 0,
      features: idf.size,
    },
    featureStats: built,
  };
  global.score = (a, b) => weightedFeatureJaccard(global.featureFn(a), global.featureFn(b), global.idf);
  return global;
}

/**
 * Register every surface into an existing yuri-match module using the shared global featureFn.
 * Pass the imported yuri-match namespace: registerWithGlobalSpace(yuriMatch, surfaces).
 */
export function registerWithGlobalSpace(yuriMatch, allSurfaces, opts = {}) {
  if (!yuriMatch || typeof yuriMatch.registerCorpus !== 'function') {
    throw new Error('registerWithGlobalSpace requires the yuri-match module namespace');
  }
  const buildThreshold = safeThreshold(opts.threshold, DEFAULT_GLOBAL_THRESHOLD);
  const globalSpace = opts.globalSpace || buildGlobalFeatureFn(allSurfaces, opts);
  if (opts.clear !== false && typeof yuriMatch.clearCorpora === 'function') yuriMatch.clearCorpora();
  const registrations = [];
  for (const surface of globalSpace.surfaces) {
    registrations.push(yuriMatch.registerCorpus(surface.corpusId, surface.items, {
      threshold: buildThreshold,
      featureFn: globalSpace.featureFn,
    }));
  }
  return {
    globalSpace,
    registrations,
    corpusCount: registrations.length,
    itemCount: globalSpace.unionItems.length,
    buildThreshold,
    completeForThresholdGte: buildThreshold,
  };
}

function ids(result) {
  return result.matches.map((m) => m.id).sort();
}

function symmetricDifferenceCount(a, b) {
  const A = new Set(a), B = new Set(b);
  let diff = 0;
  for (const x of A) if (!B.has(x)) diff++;
  for (const x of B) if (!A.has(x)) diff++;
  return diff;
}

export function measureWithinSurfaceShift(allSurfaces, opts = {}) {
  const threshold = safeThreshold(opts.threshold, DEFAULT_GLOBAL_THRESHOLD);
  const globalSpace = opts.globalSpace || buildGlobalFeatureFn(allSurfaces, opts);
  const maxCuesPerSurface = Number.isInteger(opts.maxCuesPerSurface) && opts.maxCuesPerSurface > 0 ? opts.maxCuesPerSurface : 3;
  const perSurface = [];
  let comparedQueries = 0, changedQueries = 0, totalSymmetricDiff = 0, maxTopScoreDelta = 0;

  for (const surface of globalSpace.surfaces) {
    const localBuilt = makeFeatureFn(surface.items, opts.localFeatureOptions || opts.featureOptions || {});
    const localIndex = buildIndex(surface.items, { threshold, featureFn: localBuilt.featureFn, lsh: false, prefixFilter: true });
    const globalIndex = buildIndex(surface.items, { threshold, featureFn: globalSpace.featureFn, lsh: false, prefixFilter: true });
    const cues = (opts.cuesBySurface?.[surface.corpusId] || surface.items.slice(0, maxCuesPerSurface).map((item) => item.text));
    let surfaceChanged = 0, surfaceDiff = 0, surfaceMaxDelta = 0;
    for (const cue of cues) {
      const local = matchPrefixFilter(localIndex, cue, { threshold });
      const shared = matchPrefixFilter(globalIndex, cue, { threshold });
      const diff = symmetricDifferenceCount(ids(local), ids(shared));
      const delta = Math.abs((local.matches[0]?.score || 0) - (shared.matches[0]?.score || 0));
      comparedQueries++;
      totalSymmetricDiff += diff;
      maxTopScoreDelta = Math.max(maxTopScoreDelta, delta);
      surfaceDiff += diff;
      surfaceMaxDelta = Math.max(surfaceMaxDelta, delta);
      if (diff > 0 || delta > 0) {
        changedQueries++;
        surfaceChanged++;
      }
    }
    perSurface.push({
      corpusId: surface.corpusId,
      cueCount: cues.length,
      changedQueries: surfaceChanged,
      symmetricDiffCount: surfaceDiff,
      maxTopScoreDelta: Number(surfaceMaxDelta.toFixed(4)),
    });
  }
  return {
    threshold,
    comparedQueries,
    changedQueries,
    changedRatio: comparedQueries ? Number((changedQueries / comparedQueries).toFixed(4)) : 0,
    symmetricDiffCount: totalSymmetricDiff,
    maxTopScoreDelta: Number(maxTopScoreDelta.toFixed(4)),
    perSurface,
  };
}

export function verifyPrefixCompleteness(allSurfaces, opts = {}) {
  const threshold = safeThreshold(opts.threshold, DEFAULT_GLOBAL_THRESHOLD);
  const globalSpace = opts.globalSpace || buildGlobalFeatureFn(allSurfaces, opts);
  const checks = [];
  for (const surface of globalSpace.surfaces) {
    const index = buildIndex(surface.items, { threshold, featureFn: globalSpace.featureFn, lsh: false, prefixFilter: true });
    const cues = (opts.cuesBySurface?.[surface.corpusId] || surface.items.slice(0, 3).map((item) => item.text));
    for (const cue of cues) {
      const exact = matchExact(index, cue, { threshold });
      const prefix = matchPrefixFilter(index, cue, { threshold });
      checks.push({
        corpusId: surface.corpusId,
        cue: String(cue).slice(0, 80),
        exact: exact.totalAboveThreshold,
        prefix: prefix.totalAboveThreshold,
        complete: prefix.complete === true && symmetricDifferenceCount(ids(exact), ids(prefix)) === 0,
      });
    }
  }
  return {
    complete: checks.every((check) => check.complete),
    threshold,
    checks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const query = process.argv.slice(2).join(' ') || 'energy lyapunov gate veto';
  const yuriMatch = await import('./yuri-match.mjs');
  const { allAdapters } = await import('./yuri-match-adapters.mjs');
  const loaders = allAdapters({ docs: { limit: 400 } });
  const surfaces = Object.fromEntries(Object.entries(loaders).map(([name, load]) => [name, load()]));
  const registration = registerWithGlobalSpace(yuriMatch, surfaces, {
    threshold: 0.12,
    featureOptions: { minCooc: 2, ppmiFloor: 0.8, topN: 4 },
  });
  const result = yuriMatch.recallAll(query, { threshold: 0.12 });
  console.log(JSON.stringify({
    query,
    corpusCount: registration.corpusCount,
    itemCount: registration.itemCount,
    globalStats: registration.globalSpace.stats,
    complete: result.complete,
    totalAboveThreshold: result.totalAboveThreshold,
    topMatches: result.matches.slice(0, 12).map((m) => ({ corpusId: m.corpusId, id: m.id, score: m.score })),
  }, null, 2));
}
