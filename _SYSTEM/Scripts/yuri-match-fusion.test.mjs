#!/usr/bin/env node
import { clearCorpora, registerCorpus } from './yuri-match.mjs';
import { fuseRecallAll, normalizeFuse, rrf } from './yuri-match-fusion.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass += 1; else { fail += 1; console.log(`  FAIL ${name}`); } };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function surface(corpusId, hits) {
  return {
    corpusId,
    complete: true,
    totalAboveThreshold: hits.length,
    threshold: 0.2,
    buildThreshold: 0.2,
    matches: hits.map(([id, score]) => ({
      id,
      score,
      corpusId,
      complete: true,
      totalAboveThreshold: hits.length,
      threshold: 0.2,
      buildThreshold: 0.2,
      cue: 'fixture',
    })),
  };
}

const base = [
  surface('memory', [['m-top', 0.42], ['m-mid', 0.31], ['m-low', 0.21]]),
  surface('code', [['c-top', 42], ['c-mid', 31], ['c-low', 21]]),
];
const shifted = [
  surface('memory', [['m-top', 0.42], ['m-mid', 0.31], ['m-low', 0.21]]),
  surface('code', [['c-top', 42000], ['c-mid', 31000], ['c-low', 21000]]),
];

const baseRrf = rrf(base, { k: 60 });
const shiftedRrf = rrf(shifted, { k: 60 });
ok(sameJson(baseRrf.matches.map((m) => [m.id, m.fusedScore]), shiftedRrf.matches.map((m) => [m.id, m.fusedScore])), 'RRF is immune to monotonic score-scale shifts inside one surface');
ok(baseRrf.matches.length === 6 && baseRrf.totalInputMatches === 6, 'RRF preserves every per-surface hit without truncation');

const z = normalizeFuse(base, { method: 'zscore' });
const mTop = z.matches.find((m) => m.id === 'm-top').provenance[0].normalizedScore;
const cTop = z.matches.find((m) => m.id === 'c-top').provenance[0].normalizedScore;
const mLow = z.matches.find((m) => m.id === 'm-low').provenance[0].normalizedScore;
const cLow = z.matches.find((m) => m.id === 'c-low').provenance[0].normalizedScore;
ok(near(mTop, cTop) && near(mLow, cLow), 'z-score aligns same-shaped distributions across different raw score scales');

const minmax = normalizeFuse(base, { method: 'minmax', combiner: 'combMNZ' });
ok(minmax.matches.length === 6 && minmax.kind === 'normalize:minmax:combMNZ', 'normalizeFuse supports combMNZ without truncating inputs');

const q1 = normalizeFuse(base, { method: 'quantile' });
const q2 = normalizeFuse(base, { method: 'quantile' });
ok(sameJson(q1, q2), 'normalizeFuse is deterministic');

clearCorpora();
registerCorpus('memory', [
  { id: 'memory-energy', text: 'energy lyapunov gate veto memory governance recall' },
  { id: 'memory-archive', text: 'calendar archive css rendering note' },
], { threshold: 0.2, expandedFeatures: false });
registerCorpus('docs', [
  { id: 'docs-energy', text: 'energy lyapunov gate veto documentation control plane' },
  { id: 'docs-layout', text: 'layout typography visual report' },
], { threshold: 0.2, expandedFeatures: false });
registerCorpus('code', [
  { id: 'code-energy', text: 'energy lyapunov gate veto function module test' },
  { id: 'code-worker', text: 'worker tmux capture harness' },
], { threshold: 0.2, expandedFeatures: false });

const fused = fuseRecallAll('energy lyapunov gate veto', { threshold: 0.2, fusion: 'rrf' });
const fusedSurfaces = new Set(fused.fused.matches.flatMap((m) => m.provenance.map((p) => p.corpusId)));
ok(fused.fused.complete === true && fused.fused.completenessPreserved === true, 'fuseRecallAll carries the complete matcher contract');
ok(fusedSurfaces.has('memory') && fusedSurfaces.has('docs') && fusedSurfaces.has('code'), 'fuseRecallAll fused result spans registered surfaces');
ok(fused.fused.matches.length === fused.recall.totalAboveThreshold, 'fuseRecallAll keeps the complete per-surface result set');

console.log(`\nyuri-match-fusion.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
