#!/usr/bin/env node
import {
  clearCorpora,
  explain,
  listCorpora,
  recall,
  recallAll,
  registerCorpus,
} from './yuri-match.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

clearCorpora();

registerCorpus('memory', [
  { id: 'm1', text: 'authentication bypass login token recall memory' },
  { id: 'm2', text: 'login authentication bypass session replay memory' },
  { id: 'm3', text: 'archive cleanup calendar rendering notes' },
], { threshold: 0.2, expandedFeatures: false });

registerCorpus('docs', [
  { id: 'd1', text: 'authentication bypass login control plane documentation' },
  { id: 'd2', text: 'complete recall prefix filter provenance envelope' },
  { id: 'd3', text: 'css layout report generation archive' },
], { threshold: 0.2, expandedFeatures: false });

ok(listCorpora().map((c) => c.corpusId).join(',') === 'docs,memory', 'registerCorpus stores deterministic corpus registry');

const mem = recall('memory', 'authentication bypass login token', { threshold: 0.2 });
ok(mem.complete === true, 'recall reports complete:true at or above build threshold');
ok(mem.totalAboveThreshold === 2, 'recall reports the true full count above threshold');
ok(mem.matches.every((m) => m.corpusId === 'memory' && m.complete === true), 'recall tags every hit with provenance and completeness');

const all = recallAll('authentication bypass login token', { threshold: 0.2 });
const corpora = new Set(all.matches.map((m) => m.corpusId));
ok(all.complete === true, 'recallAll reports complete:true when every corpus is complete');
ok(corpora.has('memory') && corpora.has('docs'), 'recallAll spans corpora and tags corpusId');
ok(all.totalAboveThreshold === all.corpora.reduce((sum, c) => sum + c.totalAboveThreshold, 0), 'recallAll preserves complete per-corpus counts');

const a = recallAll('authentication bypass login token', { threshold: 0.2 });
const b = recallAll('authentication bypass login token', { threshold: 0.2 });
ok(sameJson(a, b), 'same input produces deterministic recallAll output');

const below = recall('memory', 'authentication bypass login token', { threshold: 0.1 });
ok(below.complete === false && below.threshold === 0.1 && below.buildThreshold === 0.2, 'below build threshold marks complete:false');
ok(below.matches.every((m) => m.complete === false), 'below-threshold fault is carried on every hit');

const why = explain(mem.matches[0]);
ok(why.sharedFeatures.includes('tok:authentication') && why.sharedFeatures.includes('tok:login'), 'explain returns top shared features for a hit');
ok(why.corpusId === mem.matches[0].corpusId && why.id === mem.matches[0].id, 'explain preserves hit provenance');

console.log(`\nyuri-match.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
