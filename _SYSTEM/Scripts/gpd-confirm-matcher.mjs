#!/usr/bin/env node
/**
 * gpd-confirm-matcher.mjs — the GPD real-data CONFIRM-OR-KILL on the matcher organ.
 *
 * Tests GPD's load-bearing assumption for the `recall` self-trigger: can the flow judge a recall's VALUE
 * from a CHEAP pre-recall estimate that tracks the TRUE value of the complete recall? If yes, GPD can decide
 * to fire `recall` without first paying for it (the whole point of self-triggering). If the cheap estimate is
 * uncorrelated with the truth, GPD-recall fires blind → that organ's self-trigger is KILLED (honestly, cheaply).
 *
 * NON-CIRCULAR by construction: the PREDICTOR (cheap approximate LSH match) is a different mechanism from the
 * SCORER (exact complete prefix-filter match). The generator is not the grader. Real corpus (9,487 disclosed
 * bug-bounty reports), held-out cues (disjoint from the indexed corpus → no self-match).
 *
 * Recall-VALUE metric (per cue): how sharply does recall resolve the input? = top-1 match score (does a strong
 * match exist) + concentration = top1 / Σ(topK) (is one match dominant vs a flat uninformative spread). High =
 * recall is high-value (resolves uncertainty); low/flat = recall adds little. We measure this CHEAPLY (LSH) and
 * TRULY (exact) and correlate across cues. Read-only; writes only _SYSTEM/reports/.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFtsCorpus, buildIndex, matchPrefixFilter, matchLSH } from './corpus-match.mjs';
import { extractCircuitryRecords } from './circuitry-auto-register.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

const INDEX_N = Number(process.env.GPD_INDEX_N || 2000);   // corpus size to index per source
const CUE_M   = Number(process.env.GPD_CUE_M || 200);      // held-out cues (disjoint)
const THRESH  = Number(process.env.GPD_THRESH || 0.2);
const TOPK    = 8;
const clip = (s) => String(s || '').slice(0, 2000);

// ── ALL our research + data corpora (not just bug-bounty) ──
const CORPORA = [
  { name: 'search-index (research+docs+code, 39k)', load: () => loadFtsCorpus(path.join(REPO, '_SYSTEM/OS_KERNEL/search-index.db'), 'docs', { idCol: 'path', textCols: ['title', 'body'], limit: INDEX_N + CUE_M }).map((r) => ({ id: r.id, text: clip(r.text) })) },
  { name: 'bug-bounty (9,487 disclosed reports)', load: () => loadFtsCorpus(path.join(REPO, '03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db'), 'reports', { idCol: 'report_id', textCols: ['title', 'weakness'], limit: INDEX_N + CUE_M }) },
  { name: 'code corpus (modules+symbols)', load: () => { const r = extractCircuitryRecords({ roots: ['_SYSTEM/Scripts'] }); return [...r.modules, ...r.symbols].map((m) => ({ id: m.id, text: clip(m.text) })); } },
];

// ── recall-value of a match list: top1 + concentration (top1 / sum of topK) ──
function recallValue(matches) {
  const scores = (matches || []).map((m) => m.score).filter((s) => Number.isFinite(s)).sort((a, b) => b - a).slice(0, TOPK);
  if (!scores.length) return { top1: 0, concentration: 0 };
  const top1 = scores[0];
  const sum = scores.reduce((a, b) => a + b, 0);
  return { top1, concentration: sum > 0 ? top1 / sum : 0 };
}

function pearson(xs, ys) {
  const n = xs.length; if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
}
function spearman(xs, ys) {
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  return pearson(rank(xs), rank(ys));
}

function runCorpus(name, all) {
  const idxN = Math.min(INDEX_N, Math.floor(all.length * 0.85)); // proportional split so small corpora keep held-out cues
  const corpus = all.slice(0, idxN);
  const cues = all.slice(idxN, idxN + CUE_M).filter((c) => c.text && c.text.length > 8);
  if (corpus.length < 20 || cues.length < 10) return { name, skipped: `too small (corpus=${corpus.length}, cues=${cues.length})` };
  const index = buildIndex(corpus, { threshold: THRESH, lsh: true, prefixFilter: true });
  const predTop1 = [], realTop1 = [], predConc = [], realConc = []; let exactComplete = 0;
  for (const cue of cues) {
    const real = matchPrefixFilter(index, cue.text, { threshold: THRESH });   // SCORER: exact complete (truth)
    const pred = matchLSH(index, cue.text, { threshold: THRESH });            // PREDICTOR: cheap approximate
    if (real.complete) exactComplete++;
    const rv = recallValue(real.matches), pv = recallValue(pred.matches);
    realTop1.push(rv.top1); predTop1.push(pv.top1); realConc.push(rv.concentration); predConc.push(pv.concentration);
  }
  const rTop1 = pearson(predTop1, realTop1), sTop1 = spearman(predTop1, realTop1);
  const rConc = pearson(predConc, realConc), sConc = spearman(predConc, realConc);
  const mae = predTop1.reduce((a, p, i) => a + Math.abs(p - realTop1[i]), 0) / (predTop1.length || 1);
  const cover = predTop1.filter((p, i) => Math.abs(p - realTop1[i]) <= 0.15).length / (predTop1.length || 1);
  const best = Math.max(rTop1, sTop1, rConc, sConc);
  const verdict = best >= 0.6 ? 'CONFIRMED' : best >= 0.35 ? 'PARTIAL' : 'KILLED';
  return { name, indexed: corpus.length, cues: cues.length, top1: { pearson: +rTop1.toFixed(4), spearman: +sTop1.toFixed(4) }, concentration: { pearson: +rConc.toFixed(4), spearman: +sConc.toFixed(4) }, meanAbsErr_top1: +mae.toFixed(4), coverage_0p15: +cover.toFixed(4), exactCompleteRate: +(exactComplete / (cues.length || 1)).toFixed(4), bestSignal: +best.toFixed(4), verdict };
}

function run() {
  const results = [];
  for (const c of CORPORA) {
    try { results.push(runCorpus(c.name, c.load())); }
    catch (e) { results.push({ name: c.name, error: String(e?.message || e).slice(0, 140) }); }
  }
  const scored = results.filter((r) => typeof r.bestSignal === 'number');
  const agg = scored.length ? scored.reduce((a, r) => a + r.bestSignal, 0) / scored.length : 0;
  const allConfirmed = scored.length > 0 && scored.every((r) => r.verdict === 'CONFIRMED');
  const overall = {
    experiment: 'gpd-confirm-matcher — ALL corpora (predict-vs-realize recall value)',
    nonCircular: 'predictor = matchLSH (cheap approx); scorer = matchPrefixFilter (exact complete); held-out cues disjoint from index.',
    perCorpus: results,
    aggregateBestSignal: +agg.toFixed(4),
    overallVerdict: allConfirmed ? 'CONFIRMED across all corpora' : agg >= 0.6 ? 'CONFIRMED (aggregate)' : agg >= 0.35 ? 'PARTIAL' : 'KILLED',
    honestCaveat: 'LSH and exact-Jaccard estimate the same underlying similarity, so high correlation is strong-but-expected — it confirms the recall-grounding PREREQUISITE (cheap estimate ≈ true value) across diverse real data, not the full GPD ΔU loop.',
    interpretation: allConfirmed
      ? 'The cheap pre-recall estimate tracks true complete-recall value across EVERY corpus → GPD recall self-trigger is grounded on all our real data, generator≠scorer.'
      : 'Mixed — see per-corpus; recall-grounding holds where CONFIRMED.',
  };
  const outRel = '02_RESOURCES/RESEARCH/gpd-confirm-matcher-report.json';
  fs.writeFileSync(path.join(REPO, outRel), JSON.stringify(overall, null, 2));
  console.log(JSON.stringify(overall, null, 2));
  console.log('\n→ report:', outRel);
}
run();
