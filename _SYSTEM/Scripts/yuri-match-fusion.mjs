#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
/**
 * yuri-match-fusion.mjs — distribution-free fusion for yuri-match recallAll results.
 *
 * The matcher remains the completeness boundary. This module never truncates matcher output;
 * it only makes per-surface result sets comparable by rank or by surface-local score shape.
 */
import { recallAll } from './yuri-match.mjs';

const EPS = 1e-12;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function itemKey(hit) {
  return String(hit?.id ?? '').trim();
}

function compareHits(a, b) {
  const byScore = safeNumber(b.score) - safeNumber(a.score);
  if (Math.abs(byScore) > EPS) return byScore;
  return `${a.corpusId}:${a.id}`.localeCompare(`${b.corpusId}:${b.id}`);
}

function sortFused(a, b) {
  const byScore = safeNumber(b.fusedScore) - safeNumber(a.fusedScore);
  if (Math.abs(byScore) > EPS) return byScore;
  const byCount = safeNumber(b.surfaceCount) - safeNumber(a.surfaceCount);
  if (byCount) return byCount;
  return a.id.localeCompare(b.id);
}

function normalizeInput(perSurfaceResults) {
  const surfaces = new Map();
  let complete = true;
  let totalAboveThreshold = 0;
  let threshold = null;

  const addSurface = (surface) => {
    const corpusId = String(surface?.corpusId ?? '').trim();
    if (!corpusId) return;
    const matches = Array.isArray(surface.matches) ? surface.matches.slice().sort(compareHits) : [];
    complete = complete && surface.complete === true;
    totalAboveThreshold += Number.isInteger(surface.totalAboveThreshold) ? surface.totalAboveThreshold : matches.length;
    if (threshold == null && surface.threshold != null) threshold = surface.threshold;
    surfaces.set(corpusId, {
      corpusId,
      complete: surface.complete === true,
      totalAboveThreshold: Number.isInteger(surface.totalAboveThreshold) ? surface.totalAboveThreshold : matches.length,
      threshold: surface.threshold,
      buildThreshold: surface.buildThreshold,
      matches,
    });
  };

  if (Array.isArray(perSurfaceResults)) {
    perSurfaceResults.forEach(addSurface);
  } else if (Array.isArray(perSurfaceResults?.matches)) {
    const byCorpus = new Map();
    for (const hit of perSurfaceResults.matches) {
      const corpusId = String(hit?.corpusId ?? '').trim();
      if (!corpusId) continue;
      if (!byCorpus.has(corpusId)) byCorpus.set(corpusId, []);
      byCorpus.get(corpusId).push(hit);
    }
    const summaries = new Map((perSurfaceResults.corpora || []).map((c) => [c.corpusId, c]));
    for (const corpusId of [...byCorpus.keys()].sort()) {
      const summary = summaries.get(corpusId) || {};
      addSurface({
        corpusId,
        matches: byCorpus.get(corpusId),
        complete: summary.complete ?? perSurfaceResults.complete,
        totalAboveThreshold: summary.totalAboveThreshold,
        threshold: summary.threshold ?? perSurfaceResults.threshold,
        buildThreshold: summary.buildThreshold,
      });
    }
    for (const summary of perSurfaceResults.corpora || []) {
      if (!surfaces.has(summary.corpusId)) addSurface({ ...summary, matches: [] });
    }
    complete = perSurfaceResults.complete === true;
    totalAboveThreshold = Number.isInteger(perSurfaceResults.totalAboveThreshold)
      ? perSurfaceResults.totalAboveThreshold
      : totalAboveThreshold;
    threshold = perSurfaceResults.threshold ?? threshold;
  } else {
    throw new Error('perSurfaceResults must be recallAll output or an array of corpus recall envelopes');
  }

  return {
    surfaces: [...surfaces.values()].sort((a, b) => a.corpusId.localeCompare(b.corpusId)),
    complete,
    totalAboveThreshold,
    threshold,
  };
}

function rankedRows(surface) {
  return surface.matches.map((hit, idx) => ({
    key: itemKey(hit),
    hit,
    corpusId: surface.corpusId,
    rank: idx + 1,
  })).filter((row) => row.key);
}

function emptyFusion(kind, normalized) {
  return {
    kind,
    complete: normalized.complete,
    completenessPreserved: normalized.complete,
    totalInputMatches: normalized.totalAboveThreshold,
    totalFused: 0,
    surfaces: normalized.surfaces.map((s) => ({
      corpusId: s.corpusId,
      complete: s.complete,
      totalAboveThreshold: s.totalAboveThreshold,
      returned: s.matches.length,
    })),
    matches: [],
  };
}

function upsertFused(map, row, contribution) {
  let entry = map.get(row.key);
  if (!entry) {
    entry = {
      id: row.key,
      fusedScore: 0,
      surfaceCount: 0,
      provenance: [],
    };
    map.set(row.key, entry);
  }
  entry.fusedScore += contribution;
  entry.surfaceCount += 1;
  entry.provenance.push({
    corpusId: row.corpusId,
    id: row.hit.id,
    rawScore: row.hit.score,
    rank: row.rank,
    normalizedScore: row.normalizedScore,
    contribution,
  });
}

function finish(kind, normalized, map, extra = {}) {
  const matches = [...map.values()].map((entry) => ({
    ...entry,
    fusedScore: Number(entry.fusedScore.toFixed(8)),
    provenance: entry.provenance.sort((a, b) => a.corpusId.localeCompare(b.corpusId) || a.rank - b.rank),
  })).sort(sortFused).map((entry, idx) => ({ ...entry, fusedRank: idx + 1 }));
  return {
    kind,
    complete: normalized.complete,
    completenessPreserved: normalized.complete,
    totalInputMatches: normalized.totalAboveThreshold,
    totalFused: matches.length,
    surfaces: normalized.surfaces.map((s) => ({
      corpusId: s.corpusId,
      complete: s.complete,
      totalAboveThreshold: s.totalAboveThreshold,
      returned: s.matches.length,
    })),
    matches,
    ...extra,
  };
}

export function rrf(perSurfaceResults, { k = 60 } = {}) {
  const kk = safeNumber(k, 60);
  if (kk <= 0) throw new Error(`k must be positive, got ${k}`);
  const normalized = normalizeInput(perSurfaceResults);
  if (normalized.totalAboveThreshold === 0) return emptyFusion('rrf', normalized);
  const map = new Map();
  for (const surface of normalized.surfaces) {
    for (const row of rankedRows(surface)) upsertFused(map, row, 1 / (kk + row.rank));
  }
  return finish('rrf', normalized, map, { k: kk });
}

function zScores(rows) {
  const vals = rows.map((r) => safeNumber(r.hit.score));
  const mean = vals.reduce((sum, v) => sum + v, 0) / Math.max(1, vals.length);
  const variance = vals.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(variance);
  return rows.map((row, idx) => ({ ...row, normalizedScore: sd <= EPS ? 0 : (vals[idx] - mean) / sd }));
}

function minMaxScores(rows) {
  const vals = rows.map((r) => safeNumber(r.hit.score));
  const min = Math.min(...vals), max = Math.max(...vals);
  return rows.map((row, idx) => ({ ...row, normalizedScore: Math.abs(max - min) <= EPS ? 0.5 : (vals[idx] - min) / (max - min) }));
}

function quantileScores(rows) {
  const n = rows.length;
  return rows.map((row, idx) => ({ ...row, normalizedScore: n <= 1 ? 1 : 1 - (idx / (n - 1)) }));
}

function normalizedRows(surface, method) {
  const rows = rankedRows(surface);
  if (rows.length === 0) return [];
  if (method === 'zscore') return zScores(rows);
  if (method === 'minmax') return minMaxScores(rows);
  if (method === 'quantile') return quantileScores(rows);
  throw new Error(`unknown normalization method: ${method}`);
}

export function combSUM(rows) {
  const map = new Map();
  for (const row of rows) upsertFused(map, row, safeNumber(row.normalizedScore));
  return map;
}

export function combMNZ(rows) {
  const map = combSUM(rows);
  for (const entry of map.values()) entry.fusedScore *= entry.surfaceCount;
  return map;
}

export function normalizeFuse(perSurfaceResults, { method = 'zscore', combiner = 'combSUM' } = {}) {
  if (combiner === 'combMNZ' && method === 'zscore') {
    // CombMNZ multiplies the summed score by surfaceCount; over SIGNED z-scores
    // this AMPLIFIES negative agreement (2 agreeing surfaces → −4.71 vs −1.18
    // for 1). Canonical CombMNZ assumes non-negative normalized scores.
    // (fuseRecallAll routes any fusion!=='rrf' here with method defaulting to
    // 'zscore' — a config {fusion:'normalize', combiner:'combMNZ'} hits this.)
    throw new Error('combMNZ requires a non-negative normalizer — use method:"minmax" or "quantile"');
  }
  const normalized = normalizeInput(perSurfaceResults);
  if (normalized.totalAboveThreshold === 0) return emptyFusion(`normalize:${method}:${combiner}`, normalized);
  const rows = normalized.surfaces.flatMap((surface) => normalizedRows(surface, method));
  const map = combiner === 'combMNZ' ? combMNZ(rows) : combiner === 'combSUM' ? combSUM(rows) : null;
  if (!map) throw new Error(`unknown combiner: ${combiner}`);
  return finish(`normalize:${method}:${combiner}`, normalized, map, { method, combiner });
}

export function fuseRecallAll(cue, opts = {}) {
  const {
    fusion = 'rrf',
    k = 60,
    method = 'zscore',
    combiner = 'combSUM',
    recallOptions = {},
    ...directRecallOptions
  } = opts;
  const effectiveRecallOptions = { ...directRecallOptions, ...recallOptions };
  delete effectiveRecallOptions.fusion;
  delete effectiveRecallOptions.k;
  delete effectiveRecallOptions.method;
  delete effectiveRecallOptions.combiner;
  const recall = recallAll(cue, effectiveRecallOptions);
  const fused = fusion === 'rrf'
    ? rrf(recall, { k })
    : normalizeFuse(recall, { method, combiner });
  return {
    cue,
    fusion,
    recall,
    fused,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('usage: import { rrf, normalizeFuse, fuseRecallAll } from "./yuri-match-fusion.mjs"');
}
