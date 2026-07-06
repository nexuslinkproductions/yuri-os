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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFtsCorpus, buildIndex, matchPrefixFilter, matchLSH } from './corpus-match.mjs';
import { extractCircuitryRecords } from './circuitry-auto-register.mjs';
import { pearson, spearman } from './math/math-kernel.mjs';

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

// pearson/spearman come from the kernel (tie-corrected average ranks; the old
// local encounter-order ranking returned ±1 on constant-vs-monotone input).
// NOTE: kernel pearson returns 0 for constant vectors — under the median headline
// a half-constant signal set pulls the median DOWN (correct direction); those 0s
// are degenerate-input markers, not measured decorrelation.

export function runCorpus(name, all) {
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
  const judged = judgeSignals({ predTop1, realTop1, predConc, realConc });
  const mae = predTop1.reduce((a, p, i) => a + Math.abs(p - realTop1[i]), 0) / (predTop1.length || 1);
  const cover = predTop1.filter((p, i) => Math.abs(p - realTop1[i]) <= 0.15).length / (predTop1.length || 1);
  return {
    name, indexed: corpus.length, cues: cues.length,
    meanAbsErr_top1: +mae.toFixed(4), coverage_0p15: +cover.toFixed(4),
    exactCompleteRate: +(exactComplete / (cues.length || 1)).toFixed(4),
    ...judged,
  };
}

// HEADLINE = median of the 4 estimates (max-of-4 correlated estimates was a
// selection-biased headline). tieFraction GATES the verdict: heavy tie mass
// inflates even tie-corrected rho, so a tie-dominated run caps at PARTIAL —
// a wrong-direction predictor on a zero-heavy corpus must not ship CONFIRMED.
// Exported so the verdict logic is node --test reachable (the file no longer
// self-executes at import).
export function judgeSignals({ predTop1, realTop1, predConc, realConc }) {
  const rTop1 = pearson(predTop1, realTop1), sTop1 = spearman(predTop1, realTop1);
  const rConc = pearson(predConc, realConc), sConc = spearman(predConc, realConc);
  const signals = [rTop1, sTop1, rConc, sConc].slice().sort((a, b) => a - b);
  const medianSignal = (signals[1] + signals[2]) / 2;
  const maxSignal = signals[3];
  const counts = new Map();
  for (const v of predTop1) counts.set(v, (counts.get(v) || 0) + 1);
  const modalCount = Math.max(0, ...counts.values());
  const modalValue = [...counts.entries()].find(([, c]) => c === modalCount)?.[0];
  const tieFraction = predTop1.length ? modalCount / predTop1.length : 1;
  const tieDominated = tieFraction > 0.5;
  let nonModalSignals = null;
  if (tieDominated) {
    const keep = predTop1.map((v, i) => i).filter((i) => predTop1[i] !== modalValue);
    if (keep.length >= 10) {
      const sub = (xs) => keep.map((i) => xs[i]);
      nonModalSignals = {
        top1: { pearson: +pearson(sub(predTop1), sub(realTop1)).toFixed(4), spearman: +spearman(sub(predTop1), sub(realTop1)).toFixed(4) },
        concentration: { pearson: +pearson(sub(predConc), sub(realConc)).toFixed(4), spearman: +spearman(sub(predConc), sub(realConc)).toFixed(4) },
        n: keep.length,
      };
    }
  }
  const verdict = (medianSignal >= 0.6 && !tieDominated) ? 'CONFIRMED'
    : (medianSignal >= 0.6 && tieDominated) ? 'PARTIAL'
    : medianSignal >= 0.35 ? 'PARTIAL' : 'KILLED';
  return {
    top1: { pearson: +rTop1.toFixed(4), spearman: +sTop1.toFixed(4) },
    concentration: { pearson: +rConc.toFixed(4), spearman: +sConc.toFixed(4) },
    signals: { rTop1: +rTop1.toFixed(4), sTop1: +sTop1.toFixed(4), rConc: +rConc.toFixed(4), sConc: +sConc.toFixed(4) },
    medianSignal: +medianSignal.toFixed(4),
    maxSignal: +maxSignal.toFixed(4),
    tieFraction: +tieFraction.toFixed(4),
    ...(tieDominated ? { tieDominated: true, tieReason: 'tie-dominated signal — modal pred value covers >50% of cues; verdict capped at PARTIAL' } : {}),
    ...(nonModalSignals ? { nonModalSignals } : {}),
    verdict,
  };
}

function run() {
  const results = [];
  for (const c of CORPORA) {
    try { results.push(runCorpus(c.name, c.load())); }
    catch (e) { results.push({ name: c.name, error: String(e?.message || e).slice(0, 140) }); }
  }
  const scored = results.filter((r) => typeof r.medianSignal === 'number');
  const agg = scored.length ? scored.reduce((a, r) => a + r.medianSignal, 0) / scored.length : 0;
  const allConfirmed = scored.length > 0 && scored.every((r) => r.verdict === 'CONFIRMED');
  const overall = {
    experiment: 'gpd-confirm-matcher — ALL corpora (predict-vs-realize recall value)',
    nonCircular: 'predictor = matchLSH (cheap approx); scorer = matchPrefixFilter (exact complete); held-out cues disjoint from index.',
    perCorpus: results,
    aggregateMedianSignal: +agg.toFixed(4),
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

// CLI guard: the full multi-corpus experiment must not fire at import — runCorpus
// is exported so the verdict logic is node --test reachable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
