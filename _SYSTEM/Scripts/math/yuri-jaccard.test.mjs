import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, tokenFreq, jaccard, tfCosine, saturationProbe } from './yuri-jaccard.mjs';

test('tokenize: lowercases, drops short + stopwords, returns a Set', () => {
  const t = tokenize('The Quantum Engine and the cortex DECODER for you');
  assert.ok(t.has('quantum') && t.has('engine') && t.has('cortex') && t.has('decoder'));
  assert.ok(!t.has('the') && !t.has('and') && !t.has('for') && !t.has('you'), 'stopwords dropped');
  assert.ok(t instanceof Set);
});

test('jaccard: identical sets → 1, disjoint → 0, two empty → 0', () => {
  const a = tokenize('alpha beta gamma delta');
  assert.equal(jaccard(a, a), 1);
  assert.equal(jaccard(tokenize('alpha beta'), tokenize('gamma delta')), 0);
  assert.equal(jaccard(new Set(), new Set()), 0, 'empty/empty is no-signal, not identical');
});

test('jaccard: near-identical session-resume bodies → > 0.6 (the merge-candidate case)', () => {
  const a = tokenize('session resume cortex decoder circuitry build plan next steps wire the engine module');
  const b = tokenize('session resume cortex decoder circuitry build plan next steps wire the engine module extra');
  assert.ok(jaccard(a, b) > 0.6, `near-identical bodies should overlap > 0.6, got ${jaccard(a, b).toFixed(3)}`);
});

test('jaccard: orthogonal feedback rules → < 0.2', () => {
  const a = tokenize('cold call opener objection rebuttal social selling outreach buyer persona sequence');
  const b = tokenize('quantum tunneling josephson junction flux qubit coherence barrier potential niobium');
  assert.ok(jaccard(a, b) < 0.2, `orthogonal topics should overlap < 0.2, got ${jaccard(a, b).toFixed(3)}`);
});

test('tfCosine: identical → 1, empty either side → 0', () => {
  const a = tokenFreq('engine engine cortex decoder');
  assert.ok(Math.abs(tfCosine(a, a) - 1) < 1e-9);
  assert.equal(tfCosine(new Map(), a), 0);
});

test('saturationProbe: surfaces the overlapping pair, flags over-capacity', () => {
  const entries = [
    { id: 'r1', text: 'session resume cortex decoder circuitry build plan next steps wire the engine module' },
    { id: 'r2', text: 'session resume cortex decoder circuitry build plan next steps wire the engine module extra word' },
    { id: 'x', text: 'cold call opener objection rebuttal social selling outreach buyer persona ad creative' },
  ];
  const res = saturationProbe(entries, { overlapThreshold: 0.6, loadThreshold: 0.15 });
  assert.equal(res.n, 3);
  assert.ok(res.mergePairs.length >= 1, 'the near-duplicate pair surfaces as a merge candidate');
  const pair = res.mergePairs[0];
  assert.deepEqual([pair.a, pair.b].sort(), ['r1', 'r2']);
  assert.equal(res.overCapacity, true, 'load crosses threshold with 1 dup pair over 3 entries');
});

test('NEGATIVE CONTROL: a known-unique memory is NOT flagged', () => {
  const entries = [
    { id: 'a', text: 'cold call opener objection rebuttal social selling outreach buyer persona' },
    { id: 'b', text: 'quantum tunneling josephson junction flux qubit coherence barrier potential' },
    { id: 'unique', text: 'persistent homology betti numbers filtration simplicial complex topological holes' },
  ];
  const res = saturationProbe(entries, { overlapThreshold: 0.6, loadThreshold: 0.15 });
  assert.equal(res.mergePairs.length, 0, 'no overlapping pairs among orthogonal memories');
  assert.equal(res.overCapacity, false);
  assert.ok(!res.mergePairs.some((p) => p.a === 'unique' || p.b === 'unique'), 'unique memory not flagged');
});

test('saturationProbe: cosine metric path also works', () => {
  const entries = [
    { id: 'r1', text: 'engine engine cortex decoder circuitry build plan wire module' },
    { id: 'r2', text: 'engine engine cortex decoder circuitry build plan wire module' },
  ];
  const res = saturationProbe(entries, { overlapThreshold: 0.9, metric: 'cosine' });
  assert.equal(res.metric, 'cosine');
  assert.equal(res.mergePairs.length, 1);
});

test('edge: <2 entries, empty, garbage → no throw, empty merge set', () => {
  assert.equal(saturationProbe([]).mergePairs.length, 0);
  assert.equal(saturationProbe([{ id: 'a', text: 'only one entry here' }]).load, 0);
  assert.equal(saturationProbe(null).n, 0);
  assert.equal(saturationProbe([{ id: 'a' }, { bad: true }]).n, 0, 'entries without text filtered');
});
