#!/usr/bin/env node
/**
 * conformance.test.mjs — PROVE the Rust NEXUS CORE kernel is bit-exact with the JS reference by
 * calling the Rust .node binding DIRECTLY from Node and comparing to the JS modules on fixed inputs.
 * Integer/string outputs (the cross-machine determinism contract) must be EXACTLY equal; floats 1e-9.
 *
 * Run:  npm run build  (or: napi build --features napi-binding)  then  node conformance.test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const rust = require('./index.js'); // napi-generated CJS wrapper around the .node

import { fnv1a as jsFnv, makeHashes as jsMakeHashes, minhashSignature as jsMinhash, estimateJaccard as jsEstJaccard, lshBands as jsLshBands, tuneBands as jsTuneBands } from '../Scripts/math/yuri-minhash.mjs';
import { tokenize as jsTokenize, jaccard as jsJaccard } from '../Scripts/math/yuri-jaccard.mjs';
import { fib as jsFib, phiSequence as jsPhiSeq, goldenAnglePoint as jsGoldenAngle, goldenSectionSearch as jsGolden } from '../Scripts/math/yuri-phi.mjs';
import { buildIndex, matchExact, matchPrefixFilter } from '../Scripts/corpus-match.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every((x) => B.has(x)); };

// ── fnv1a (EXACT) ──
for (const s of ['', 'login', 'subdomain takeover', 'café', '日本語', 'A1_b2']) ok(rust.fnv1A(s) === jsFnv(s), `fnv1a EXACT "${s}"`); // napi camelCased fnv1a → fnv1A

// ── makeHashes (EXACT a + b arrays) ──
for (const [k, seed] of [[4, 42], [16, 7], [128, 0x9e3779b1], [2000, 0xbeef]]) {
  const jh = jsMakeHashes(k, seed); const rh = rust.makeHashes(k, seed);
  ok(arrEq([...jh.a], rh.a) && arrEq([...jh.b], rh.b), `makeHashes(${k},${seed}) a+b EXACT`);
}

// ── minhashSignature (EXACT) — the cross-machine determinism contract ──
{
  const jh = jsMakeHashes(64, 0x9e3779b1);
  for (const toks of [['a', 'b', 'c'], ['cross', 'site', 'scripting', 'login', 'form'], []]) {
    const jsig = [...jsMinhash(toks, jh)];
    const rsig = rust.minhashSignature(toks, [...jh.a], [...jh.b]);
    ok(arrEq(jsig, rsig), `minhashSignature EXACT [${toks.slice(0, 3).join(',')}...]`);
  }
}

// ── estimateJaccard ──
{
  const jh = jsMakeHashes(256, 1);
  const sA = [...jsMinhash(['a', 'b', 'c', 'd', 'e'], jh)], sB = [...jsMinhash(['c', 'd', 'e', 'f', 'g'], jh)];
  ok(close(rust.estimateJaccard(sA, sB), jsEstJaccard(Uint32Array.from(sA), Uint32Array.from(sB))), 'estimateJaccard');
}

// ── lshBands (EXACT) ──
{
  const jh = jsMakeHashes(128, 0x9e3779b1);
  const sig = [...jsMinhash(['authentication', 'bypass', 'token', 'replay', 'session'], jh)];
  ok(arrEq(jsLshBands(Uint32Array.from(sig), 16, 8), rust.lshBands(sig, 16, 8)), 'lshBands EXACT keys');
}

// ── tuneBands (EXACT b,r) ──
for (const [k, t] of [[128, 0.5], [64, 0.3], [256, 0.8]]) {
  const jt = jsTuneBands(k, t), rt = rust.tuneBands(k, t);
  ok(jt.b === rt.b && jt.r === rt.r && close(jt.crossover, rt.crossover, 1e-12), `tuneBands(${k},${t}) b,r,crossover`);
}

// ── tokenize (EXACT set) ──
for (const s of ['The Quantum Engine and the cortex DECODER for you', 'ai abc ab abcd', 'reflected XSS in login-form input!!!']) {
  ok(setEq([...jsTokenize(s)], rust.tokenize(s)), `tokenize EXACT "${s.slice(0, 20)}"`);
}

// ── jaccardText (1e-9) ──
for (const [a, b] of [['cross site scripting login', 'reflected cross site scripting login form'], ['alpha beta', 'gamma delta'], ['', '']]) {
  ok(close(rust.jaccardText(a, b), jsJaccard(jsTokenize(a), jsTokenize(b))), `jaccardText "${a.slice(0, 14)}"≈"${b.slice(0, 14)}"`);
}

// ── fib (EXACT) ──
for (const n of [0, 1, 10, 20, 50, 78]) ok(rust.fib(n) === jsFib(n), `fib(${n}) EXACT`);

// ── phiSequence (1e-12) ──
{
  const r = rust.phiSequence(20, 0), j = jsPhiSeq(20, 0);
  ok(r.length === j.length && r.every((v, i) => close(v, j[i], 1e-12)), 'phiSequence(20) 1e-12');
}

// ── goldenAnglePoint (1e-12) ──
for (const n of [0, 1, 5, 100]) ok(close(rust.goldenAnglePoint(n), jsGoldenAngle(n), 1e-12), `goldenAnglePoint(${n})`);

// ── goldenSection (1e-6) ──
{
  const r = rust.goldenSectionMinQuadratic(2, 0, 5);
  const j = jsGolden((x) => (x - 2) ** 2, 0, 5).x;
  ok(close(r, j, 1e-6) && close(r, 2, 1e-4), 'goldenSection min of (x-2)^2 → 2');
}

// ── corpus matcher: Rust prefix == Rust exact == JS exact (completeness, cross-language) ──
{
  const items = [
    { id: '1', text: 'reflected cross site scripting in login form' },
    { id: '2', text: 'stored cross site scripting in comment field' },
    { id: '3', text: 'cross site scripting reflected via search parameter' },
    { id: '4', text: 'subdomain takeover dangling dns cname record' },
    { id: '5', text: 'authentication bypass on admin login portal' },
    { id: '6', text: 'login authentication bypass via token replay' },
    { id: '7', text: 'reflected xss login form input not sanitized' },
  ];
  const ids = items.map((x) => x.id), texts = items.map((x) => x.text);
  const jsIndex = buildIndex(items, { threshold: 0.15, lsh: false });
  for (const q of ['cross site scripting reflected login', 'authentication bypass login token', 'subdomain dns']) {
    for (const t of [0.15, 0.25, 0.4, 0.6]) {
      const jsEx = matchExact(jsIndex, q, { threshold: t }).matches.map((m) => m.id);
      const jsPf = matchPrefixFilter(jsIndex, q, { threshold: t }).matches.map((m) => m.id);
      const rsEx = rust.corpusMatchExact(ids, texts, q, t).ids;
      const rsPf = rust.corpusMatchPrefix(ids, texts, q, t).ids;
      ok(setEq(jsEx, rsEx), `corpus exact JS==Rust t=${t} q="${q.slice(0, 16)}"`);
      ok(setEq(rsPf, rsEx), `corpus Rust prefix==exact (COMPLETE) t=${t} q="${q.slice(0, 16)}"`);
      ok(setEq(jsPf, rsPf), `corpus prefix JS==Rust t=${t} q="${q.slice(0, 16)}"`);
    }
  }
}

console.log(`\nnexus napi conformance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
