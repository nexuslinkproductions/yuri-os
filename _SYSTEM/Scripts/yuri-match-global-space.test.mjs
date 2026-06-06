#!/usr/bin/env node
import * as yuriMatch from './yuri-match.mjs';
import { buildIndex, matchExact, matchPrefixFilter } from './corpus-match.mjs';
import {
  buildGlobalFeatureFn,
  measureWithinSurfaceShift,
  registerWithGlobalSpace,
  verifyPrefixCompleteness,
} from './yuri-match-global-space.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = (result) => result.matches.map((m) => m.id).sort().join(',');

const surfaces = {
  code: [
    { id: 'code-auth-gate', text: 'auth gate login credential token veto access control module' },
    { id: 'code-energy', text: 'energy lyapunov gate veto stability controller module' },
    { id: 'code-render', text: 'canvas rendering layout resize observer component' },
  ],
  docs: [
    { id: 'doc-auth-gate', text: 'authentication gateway signin credentials token denial access policy documentation' },
    { id: 'doc-energy', text: 'lyapunov energy guard veto stability proof documentation' },
    { id: 'doc-render', text: 'visual layout rendering resize observer notes' },
  ],
  memory: [
    { id: 'mem-auth', text: 'remember login authentication token gate bypass hardening' },
    { id: 'mem-energy', text: 'memory note energy lyapunov veto gate proof' },
    { id: 'mem-calendar', text: 'calendar archive reminder cleanup thread' },
  ],
};

const opts = { threshold: 0.18, featureOptions: { minCooc: 1, ppmiFloor: 0.2, topN: 5 } };
const global = buildGlobalFeatureFn(surfaces, opts);

ok(global.surfaces.length === 3 && global.unionItems.length === 9, 'buildGlobalFeatureFn normalizes all surfaces into one union corpus');
ok(global.stats.expansionTerms > 0 && global.stats.features > 0, 'global space has shared PPMI expansions and IDF features');
ok(global.idf.get('tok:credential') !== undefined || global.idf.get('tok:credentials') !== undefined, 'global IDF contains token features from the union');
ok((global.idf.get('tok:calendar') || 0) > (global.idf.get('tok:gate') || 0), 'global IDF gives rarer union features higher weight');

const pairA = surfaces.code[0].text;
const pairB = surfaces.docs[0].text;
const ab = Number(global.score(pairA, pairB).toFixed(12));
const ba = Number(global.score(pairB, pairA).toFixed(12));
ok(ab === ba && ab > 0.1, 'cross-surface weighted Jaccard is symmetric and non-zero in the shared space');

yuriMatch.clearCorpora();
const regA = registerWithGlobalSpace(yuriMatch, surfaces, opts);
const recallA = yuriMatch.recallAll('login credential token access gate', { threshold: 0.18 });
const regB = registerWithGlobalSpace(yuriMatch, surfaces, opts);
const recallB = yuriMatch.recallAll('login credential token access gate', { threshold: 0.18 });
ok(regA.corpusCount === 3 && regA.itemCount === 9, 'registerWithGlobalSpace registers every surface through yuri-match');
ok(sameJson(recallA, recallB) && sameJson(regA.globalSpace.stats, regB.globalSpace.stats), 'global-space registration and recall are deterministic');
ok(recallA.complete === true && new Set(recallA.matches.map((m) => m.corpusId)).size >= 2, 'recallAll returns complete cross-surface hits in the shared space');

for (const surface of global.surfaces) {
  const index = buildIndex(surface.items, { threshold: 0.18, featureFn: global.featureFn, lsh: false, prefixFilter: true });
  for (const cue of ['login credential token access gate', surface.items[0].text]) {
    const exact = matchExact(index, cue, { threshold: 0.18 });
    const prefix = matchPrefixFilter(index, cue, { threshold: 0.18 });
    ok(ids(exact) === ids(prefix) && prefix.complete === true, `prefix-filter equals exact in global space for ${surface.corpusId}`);
  }
}

const proof = verifyPrefixCompleteness(surfaces, opts);
ok(proof.complete === true && proof.checks.length >= 3, 'verifyPrefixCompleteness reports exact==prefix for global-space indexes');

const shift = measureWithinSurfaceShift(surfaces, opts);
ok(shift.comparedQueries === 9, 'measureWithinSurfaceShift compares deterministic local-vs-global cues');
ok(shift.changedRatio >= 0 && shift.changedRatio <= 1 && shift.maxTopScoreDelta >= 0, 'within-surface shift is quantified with bounded metrics');

console.log(`\nyuri-match-global-space.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
