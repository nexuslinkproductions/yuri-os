#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { tokenize } from './math/yuri-jaccard.mjs';
import { buildContainmentIndex, containment, matchContainment } from './yuri-containment-match.mjs';
import { clearCorpora, recall, recallAsym, registerCorpus } from './yuri-match.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  try {
    assert.ok(cond, name);
    pass++;
  } catch {
    fail++;
    console.log(`  FAIL ${name}`);
  }
};

const q = tokenize('energy lyapunov gate veto');
const longDoc = tokenize('energy lyapunov gate veto control plane consequence budget calibration governance graph pagerank bridge');
const partialDoc = tokenize('energy lyapunov unrelated notes');

ok(containment(q, longDoc) === 1, 'containment(q,longDoc) = 1 when every query token is covered');
ok(containment(q, partialDoc) === 0.5, 'containment(q,partialDoc) counts query coverage only');
ok(containment(new Set(), longDoc) === 0, 'empty query has zero containment signal');

const items = [
  {
    id: 'long',
    text: 'energy lyapunov gate veto control plane consequence budget calibration governance graph pagerank bridge ' +
      'structural fusion similarity edge navigation deterministic bounded walk restart decay threshold sharpness',
  },
  { id: 'partial', text: 'energy lyapunov unrelated notes' },
  { id: 'miss', text: 'calendar archive layout css report notes' },
];
const containmentIndex = buildContainmentIndex(items, { featureFn: tokenize });
const contained = matchContainment(containmentIndex, 'energy lyapunov gate veto', { threshold: 0.75 });
ok(contained.complete === true && contained.requiredShared === 3, 'containment filter is complete with ceil(t*|q|) shared-feature bound');
ok(contained.matches.map((m) => m.id).join(',') === 'long', 'containment filter recalls long doc and rejects partial/miss at threshold');
ok(contained.candidates === 2 && contained.scanned === 3, 'containment filter only scores docs sharing query features');

clearCorpora();
registerCorpus('docs', items, { threshold: 0.3, featureFn: tokenize });

const asym = recallAsym('docs', 'energy lyapunov gate veto', { threshold: 0.75, metric: 'containment' });
ok(asym.complete === true && asym.metric === 'containment', 'recallAsym returns complete containment envelope');
ok(asym.matches.length === 1 && asym.matches[0].id === 'long' && asym.matches[0].score === 1, 'recallAsym fixes short-cue to long-doc recall');

const jaccard = recall('docs', 'energy lyapunov gate veto', { threshold: 0.4 });
ok(jaccard.matches.length === 0, 'existing Jaccard recall path remains length-sensitive and unaffected');

let badMetric = false;
try {
  recallAsym('docs', 'energy lyapunov gate veto', { metric: 'jaccard' });
} catch {
  badMetric = true;
}
ok(badMetric, 'recallAsym rejects unsupported asymmetric metrics');

// — precision gate (DS3): IDF-weighted containment + length-gate + sharp flag, completeness intact —
const sharpHit = recallAsym('docs', 'energy lyapunov gate veto', { threshold: 0.75, metric: 'containment' });
ok(sharpHit.matches[0].sharp === true && typeof sharpHit.matches[0].idfScore === 'number',
  'specific >=4-feature cue is marked sharp with an idfScore');
ok(sharpHit.precisionGated === false && sharpHit.complete === true,
  'a >=4-feature cue is not precision-gated and stays complete');

// a 2-feature cue is "contained" broadly → results KEPT (completeness) but flagged soft, never dropped
const shortCue = recallAsym('docs', 'energy gate', { threshold: 0.5, metric: 'containment' });
ok(shortCue.precisionGated === true, 'a <4-feature cue raises precisionGated');
ok(shortCue.matches.every((m) => m.sharp === false), 'precision-gated matches are all sharp:false');
ok(shortCue.complete === true && shortCue.totalAboveThreshold === shortCue.matches.length,
  'precision gate never silently drops a complete result (no silent miss)');

console.log(`\nyuri-containment-match.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
