#!/usr/bin/env node
/**
 * wasm-conformance.test.mjs — PROVE the wasm build of NEXUS is bit-exact with the JS reference (and
 * therefore with the napi build), by loading pkg/nexus.js (wasm-pack --target nodejs) and comparing to
 * the JS modules on fixed inputs. Same contract as conformance.test.mjs (napi): ints/strings EXACT,
 * floats 1e-9. Proves the SAME pure Rust core is correct across BOTH delivery targets.
 *
 * Build:  wasm-pack build --target nodejs --out-dir pkg -- --features wasm-binding   then  node wasm-conformance.test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const w = require('./pkg/nexus.js');

import { fnv1a as jsFnv, makeHashes as jsMakeHashes, minhashSignature as jsMinhash, estimateJaccard as jsEstJaccard, lshBands as jsLshBands, tuneBands as jsTuneBands } from '../Scripts/math/yuri-minhash.mjs';
import { tokenize as jsTokenize, jaccard as jsJaccard } from '../Scripts/math/yuri-jaccard.mjs';
import { fib as jsFib, phiSequence as jsPhiSeq, goldenAnglePoint as jsGoldenAngle, goldenSectionSearch as jsGolden } from '../Scripts/math/yuri-phi.mjs';
import { buildIndex, matchExact, matchPrefixFilter } from '../Scripts/corpus-match.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const arrEq = (a, b) => { const A = [...a], B = [...b]; return A.length === B.length && A.every((v, i) => v === B[i]); };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every((x) => B.has(x)); };

for (const s of ['', 'login', 'subdomain takeover', 'café', '日本語', 'A1_b2']) ok(w.fnv1a(s) === jsFnv(s), `fnv1a EXACT "${s}"`);

for (const [k, seed] of [[4, 42], [16, 7], [128, 0x9e3779b1], [2000, 0xbeef]]) {
  const jh = jsMakeHashes(k, seed);
  ok(arrEq([...jh.a], w.make_hashes_a(k, seed)) && arrEq([...jh.b], w.make_hashes_b(k, seed)), `makeHashes(${k},${seed}) a+b EXACT`);
}

{
  const jh = jsMakeHashes(64, 0x9e3779b1);
  for (const toks of [['a', 'b', 'c'], ['cross', 'site', 'scripting', 'login', 'form'], []]) {
    const jsig = [...jsMinhash(toks, jh)];
    const rsig = [...w.minhash_signature(toks, Uint32Array.from(jh.a), Uint32Array.from(jh.b))];
    ok(arrEq(jsig, rsig), `minhashSignature EXACT [${toks.slice(0, 3).join(',')}...]`);
  }
}

{
  const jh = jsMakeHashes(256, 1);
  const sA = [...jsMinhash(['a', 'b', 'c', 'd', 'e'], jh)], sB = [...jsMinhash(['c', 'd', 'e', 'f', 'g'], jh)];
  ok(close(w.estimate_jaccard(Uint32Array.from(sA), Uint32Array.from(sB)), jsEstJaccard(Uint32Array.from(sA), Uint32Array.from(sB))), 'estimateJaccard');
}

{
  const jh = jsMakeHashes(128, 0x9e3779b1);
  const sig = [...jsMinhash(['authentication', 'bypass', 'token', 'replay', 'session'], jh)];
  ok(arrEq(jsLshBands(Uint32Array.from(sig), 16, 8), w.lsh_bands(Uint32Array.from(sig), 16, 8)), 'lshBands EXACT keys');
}

for (const [k, t] of [[128, 0.5], [64, 0.3], [256, 0.8]]) {
  const jt = jsTuneBands(k, t);
  ok(jt.b === w.tune_bands_b(k, t) && jt.r === w.tune_bands_r(k, t), `tuneBands(${k},${t}) b,r`);
}

for (const s of ['The Quantum Engine and the cortex DECODER for you', 'ai abc ab abcd', 'reflected XSS in login-form input!!!'])
  ok(setEq([...jsTokenize(s)], w.tokenize(s)), `tokenize EXACT "${s.slice(0, 20)}"`);

for (const [a, b] of [['cross site scripting login', 'reflected cross site scripting login form'], ['alpha beta', 'gamma delta'], ['', '']])
  ok(close(w.jaccard_text(a, b), jsJaccard(jsTokenize(a), jsTokenize(b))), `jaccardText "${a.slice(0, 14)}"`);

for (const n of [0, 1, 10, 20, 50, 78]) ok(w.fib(n) === jsFib(n), `fib(${n}) EXACT`);

{ const r = [...w.phi_sequence(20, 0)], j = jsPhiSeq(20, 0); ok(r.length === j.length && r.every((v, i) => close(v, j[i], 1e-12)), 'phiSequence(20) 1e-12'); }

for (const n of [0, 1, 5, 100]) ok(close(w.golden_angle_point(n), jsGoldenAngle(n), 1e-12), `goldenAnglePoint(${n})`);

{ const r = w.golden_section_min_quadratic(2, 0, 5); const j = jsGolden((x) => (x - 2) ** 2, 0, 5).x; ok(close(r, j, 1e-6) && close(r, 2, 1e-4), 'goldenSection min → 2'); }

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
      const rsEx = w.corpus_match_exact_ids(ids, texts, q, t);
      const rsPf = w.corpus_match_prefix_ids(ids, texts, q, t);
      ok(setEq(jsEx, rsEx), `corpus exact JS==wasm t=${t} q="${q.slice(0, 16)}"`);
      ok(setEq(rsPf, rsEx), `corpus wasm prefix==exact (COMPLETE) t=${t} q="${q.slice(0, 16)}"`);
    }
  }
}

console.log(`\nnexus wasm conformance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
