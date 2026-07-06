#!/usr/bin/env node
/**
 * nexus-numerology.test.mjs — cold checks for deterministic numerology encoding channels.
 */
import {
  gematria, digitalRoot, harmonicSignature, numerologyFeatures,
} from './nexus-numerology.mjs';
import { features, makeFeatureFn } from './yuri-token-expand.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const setEq = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};

// determinism + bounded integer contract
ok(gematria('Alpha beta 123') === gematria('Alpha beta 123'), 'gematria deterministic');
ok(Number.isInteger(gematria('Alpha beta 123')) && gematria('Alpha beta 123') >= 0 && gematria('Alpha beta 123') <= 0xffffffff, 'gematria returns a bounded uint32 integer');
ok(gematria('') === 0 && gematria('     ') === 0, 'gematria empty/space-only text has no signal');
ok(gematria('abc') !== gematria('acb'), 'gematria is order-sensitive (basic collision sanity)');
ok(gematria('cafe') === gematria('café'), 'gematria normalizes combining marks deterministically');

// digital-root mod-9 property
for (const n of [1, 8, 9, 10, 18, 123456, -98765]) {
  const dr = digitalRoot(n);
  ok(dr >= 1 && dr <= 9, `digitalRoot(${n}) in 1..9`);
  ok(dr % 9 === Math.abs(Math.trunc(n)) % 9, `digitalRoot(${n}) preserves mod-9 residue`);
}
ok(digitalRoot(0) === 0, 'digitalRoot(0) === 0 no-signal bucket');
ok(digitalRoot(12345678901234567890n) === Number(((12345678901234567890n - 1n) % 9n) + 1n), 'digitalRoot handles BigInt deterministically');

// harmonic signature finite/bounded
{
  const sig = harmonicSignature('login requires password auth token', { maxPairs: 4 });
  ok(Array.isArray(sig) && sig.length <= 4, 'harmonicSignature returns a small vector capped by maxPairs');
  ok(sig.every((x) => typeof x === 'string' && /^[0-9]+_[0-9]+$/.test(x)), 'harmonicSignature buckets are finite ratio labels');
  ok(setEq(sig, harmonicSignature('login requires password auth token', { maxPairs: 4 })), 'harmonicSignature deterministic');
  ok(harmonicSignature('one', { maxPairs: 4 }).length === 0, 'harmonicSignature needs adjacent token values');
}

// feature channel contract + clean merge
{
  const nf = numerologyFeatures('login requires password auth token');
  ok([...nf].some((x) => x.startsWith('num:')), 'numerologyFeatures emits num: bucket');
  ok([...nf].some((x) => x.startsWith('dr:')), 'numerologyFeatures emits dr: bucket');
  ok([...nf].some((x) => x.startsWith('harm:')), 'numerologyFeatures emits harm: bucket');
  ok([...nf].every((x) => /^(num|dr|harm):/.test(x)), 'numerologyFeatures emits only namespaced feature channels');

  const off = features('login requires password auth token');
  const on = features('login requires password auth token', { numerology: true });
  ok(![...off].some((x) => /^(num|dr|harm):/.test(x)), 'features numerology OFF by default');
  ok([...on].some((x) => /^(num|dr|harm):/.test(x)), 'features {numerology:true} merges the channel');
  ok([...off].every((x) => on.has(x)), 'numerology merge preserves existing tok/c4/sem feature surface');
}

// makeFeatureFn opt-in stays off by default
{
  const items = [
    { id: '1', text: 'login requires password auth token' },
    { id: '2', text: 'signin requires password auth token' },
  ];
  const off = makeFeatureFn(items, { minCooc: 2 });
  const on = makeFeatureFn(items, { minCooc: 2, numerology: true });
  ok(off.numerology === false, 'makeFeatureFn numerology OFF by default');
  ok(on.numerology === true, 'makeFeatureFn {numerology:true} records opt-in');
  ok(![...off.featureFn('login password')].some((x) => /^(num|dr|harm):/.test(x)), 'makeFeatureFn default featureFn emits no numerology channels');
  ok([...on.featureFn('login password')].some((x) => /^(num|dr|harm):/.test(x)), 'makeFeatureFn opt-in featureFn emits numerology channels');
}

console.log(`\nnexus-numerology.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
