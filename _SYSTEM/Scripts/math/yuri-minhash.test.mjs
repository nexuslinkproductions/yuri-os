#!/usr/bin/env node
/**
 * yuri-minhash.test.mjs — full-surface unit + invariant + mutation-killing tests for the MinHash/LSH
 * core (yuri-minhash.mjs). Covers EVERY export, determinism, the load-bearing math invariants
 * (permutation coefficient a ∈ [1, p−1], coords reduced mod p, unbiased Jaccard estimate), and the
 * red-team edges (makeHashes(0) throws, empty-set sentinel, modAffine on a max-hash token).
 *
 * House style: synchronous, no framework. `ok(cond, name)`; cold checks that can FAIL.
 */
import { fnv1a, makeHashes, minhashSignature, estimateJaccard, lshBands, tuneBands } from './yuri-minhash.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const trueJaccard = (A, B) => { const a = new Set(A), b = new Set(B); let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };

const MERSENNE = 2147483647; // 2^31 − 1
const U32_MAX = 0xffffffff;  // 4294967295 — the empty-set sentinel

// ── fnv1a ──────────────────────────────────────────────────────────────────────────────────────
// Cold determinism vector: the empty string processes zero bytes → returns the FNV offset basis.
ok(fnv1a('') === 2166136261, 'fnv1a("") === FNV offset basis 2166136261 (cold vector)');
ok(fnv1a('login') === 3380555570, 'fnv1a("login") === 3380555570 (cold vector — pins the algorithm, not just determinism)');
ok(fnv1a('login') === fnv1a('login'), 'fnv1a deterministic (same input → same hash)');
ok(fnv1a('login') !== fnv1a('signin'), 'fnv1a distinguishes distinct inputs');
{
  const h = fnv1a('subdomain takeover');
  ok(Number.isInteger(h) && h >= 0 && h <= U32_MAX, 'fnv1a returns a uint32 (integer in [0, 2^32))');
  ok((h >>> 0) === h, 'fnv1a output already unsigned-32 normalized');
}
ok(fnv1a(123) === fnv1a('123'), 'fnv1a coerces non-string via String() (123 === "123")');

// ── makeHashes: guard + shape + determinism + the a∈[1,p−1] invariant ───────────────────────────
let threw = false; try { makeHashes(0); } catch { threw = true; } ok(threw, 'makeHashes(0) throws (M25 — k must be ≥1)');
threw = false; try { makeHashes(-3); } catch { threw = true; } ok(threw, 'makeHashes(-3) throws');
threw = false; try { makeHashes(1.5); } catch { threw = true; } ok(threw, 'makeHashes(1.5) throws (non-integer)');
threw = false; try { makeHashes('x'); } catch { threw = true; } ok(threw, 'makeHashes("x") throws (non-number)');
{
  const h = makeHashes(16, 42);
  ok(h.k === 16 && h.a.length === 16 && h.b.length === 16, 'makeHashes returns {k,a,b} of length k');
  ok(h.seed === 42, 'makeHashes preserves seed');
  const h2 = makeHashes(16, 42);
  ok([...h.a].every((v, i) => v === h2.a[i]) && [...h.b].every((v, i) => v === h2.b[i]), 'makeHashes deterministic (same seed → identical a,b)');
  const h3 = makeHashes(16, 43);
  ok([...h.a].some((v, i) => v !== h3.a[i]), 'makeHashes seed-sensitive (different seed → different params)');
  const hd1 = makeHashes(8), hd2 = makeHashes(8);
  ok([...hd1.a].every((v, i) => v === hd2.a[i]), 'makeHashes default seed reproducible');
  // COLD VECTORS (C8 #5): pin BOTH a and b for a fixed seed — kills a mutant that makes b constant
  // or seed-insensitive while keeping a varying (which a-only checks would miss).
  const hp = makeHashes(4, 42);
  ok(JSON.stringify([...hp.a]) === '[1083814274,331920222,1613448262,1921058496]', 'makeHashes(4,42).a pinned exact');
  ok(JSON.stringify([...hp.b]) === '[378494188,955863294,110225632,508781842]', 'makeHashes(4,42).b pinned exact');
}
{
  // INVARIANT (red-team r2): a ∈ [1, p−1] — every nonzero a < p is an invertible permutation
  // coefficient. a=0 collapses the coord to constant b; a=p === MERSENNE makes modAffine degenerate.
  // Large k surfaces edge draws. Kills the `| 1` regression and the off-by-one on MERSENNE−1.
  const big = makeHashes(4000, 0xbeef);
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  for (let i = 0; i < big.k; i++) { aMin = Math.min(aMin, big.a[i]); aMax = Math.max(aMax, big.a[i]); bMin = Math.min(bMin, big.b[i]); bMax = Math.max(bMax, big.b[i]); }
  ok(aMin >= 1 && aMax <= MERSENNE - 1, `a ∈ [1, p−1] for all coords (got [${aMin}, ${aMax}])`);
  ok(aMin >= 1, 'no a === 0 (would collapse coord to constant b)');
  ok(aMax !== MERSENNE, 'no a === p (would make modAffine degenerate)');
  ok(bMin >= 0 && bMax < MERSENNE, `b ∈ [0, p) for all coords (got [${bMin}, ${bMax}])`);
}

// ── minhashSignature: shape + sentinel + determinism + mod-p reduction + order-invariance ────────
{
  const h = makeHashes(64);
  const sig = minhashSignature(['cross', 'site', 'scripting'], h);
  ok(sig instanceof Uint32Array && sig.length === 64, 'minhashSignature → Uint32Array length k');

  // empty input → all-MAX sentinel (collides with nothing meaningful).
  const sEmptySet = minhashSignature(new Set(), h);
  const sEmptyArr = minhashSignature([], h);
  ok([...sEmptySet].every((v) => v === U32_MAX), 'empty Set → all-0xffffffff sentinel');
  ok([...sEmptyArr].every((v) => v === U32_MAX), 'empty array → all-0xffffffff sentinel');

  // determinism: identical content (Set vs array, any order) → identical signature.
  const a1 = minhashSignature(['a', 'b', 'c'], h);
  const a2 = minhashSignature(['c', 'a', 'b'], h);
  const a3 = minhashSignature(new Set(['b', 'c', 'a']), h);
  ok(a1.every((v, i) => v === a2[i]) && a1.every((v, i) => v === a3[i]), 'minhashSignature order-invariant + Set/array-equivalent + deterministic');

  // mod-p reduction: every non-empty coordinate is a real hash value in [0, p) — NOT the sentinel,
  // and STRICTLY below MERSENNE. Kills a modAffine mutant that drops the `% p` (would exceed p) or
  // overflows f64 (the hi/lo split exists precisely to keep a*x exact). Tested over many tokens so
  // a large-x token (fnv1a near 2^32−1) exercises the reduction path (the "modAffine extreme").
  const many = Array.from({ length: 300 }, (_, i) => 'tok_' + (i * 2654435761 >>> 0).toString(36));
  const sigMany = minhashSignature(many, h);
  ok([...sigMany].every((v) => v < MERSENNE), 'all non-empty coords reduced mod p (< 2^31−1) — modAffine overflow/mod guard');
  ok([...sigMany].every((v) => v !== U32_MAX), 'non-empty signature has no leftover sentinel coords');

  // COLD VECTOR (C8 #4): pin the EXACT coordinates for a fixed (tokens, seed) — kills a mutant that
  // returns all-zeros (or any constant) for non-empty input, which "< MERSENNE && != sentinel" misses.
  const hpin = makeHashes(4, 42);
  ok(JSON.stringify([...minhashSignature(['a', 'b', 'c'], hpin)]) === '[1149165645,131699668,138982230,328598279]', 'minhashSignature pins exact coords for (["a","b","c"], seed 42)');
}

// ── estimateJaccard: identity, bounds, mismatched length, unbiasedness ───────────────────────────
{
  const h = makeHashes(512); // big k → tight stderr (~1/√512 ≈ 0.044)
  const A = Array.from({ length: 20 }, (_, i) => 't' + i);            // {t0..t19}
  const B = Array.from({ length: 20 }, (_, i) => 't' + (i + 10));     // {t10..t29}  → J = 10/30 = 0.333
  const sigA = minhashSignature(A, h), sigB = minhashSignature(B, h);
  ok(estimateJaccard(sigA, sigA) === 1, 'estimateJaccard(sig, sig) === 1 (identity)');
  const est = estimateJaccard(sigA, sigB), tru = trueJaccard(A, B);
  ok(est >= 0 && est <= 1, 'estimateJaccard ∈ [0,1]');
  // The estimate is fully DETERMINISTIC (fixed A/B/k=512/seed) → pin the exact value (C8 #3); a biased
  // mutant inside the ±0.1 band would otherwise survive. The looser ±0.1 stays as the unbiasedness sanity.
  ok(est === 0.310546875, `estimateJaccard exact deterministic value === 0.310546875 (got ${est})`);
  ok(approx(est, tru, 0.1), `estimateJaccard unbiased: est=${est.toFixed(3)} ≈ true=${tru.toFixed(3)} (±0.1)`);
  // disjoint sets → low estimate
  const C = Array.from({ length: 20 }, (_, i) => 'z' + i);
  ok(estimateJaccard(sigA, minhashSignature(C, h)) < 0.15, 'disjoint sets → low Jaccard estimate');
  // mismatched signature lengths → min-length compare, no crash, still ∈ [0,1]
  const small = makeHashes(8); const sgS = minhashSignature(A, small);
  const em = estimateJaccard(sigA, sgS); ok(em >= 0 && em <= 1, 'estimateJaccard tolerates mismatched lengths (uses min k)');
  ok(estimateJaccard(new Uint32Array(0), new Uint32Array(0)) === 0, 'estimateJaccard of empty sigs === 0 (no k)');
}

// ── lshBands: shape + format + determinism + collision/separation ────────────────────────────────
{
  const h = makeHashes(128);
  const sig = minhashSignature(['authentication', 'bypass', 'token', 'replay'], h);
  const keys = lshBands(sig, 16, 8);
  ok(Array.isArray(keys) && keys.length === 16, 'lshBands → b keys');
  ok(keys.every((kk, i) => kk.startsWith(i + ':')), 'lshBands key format "band#:hash" with correct band index');
  const keys2 = lshBands(sig, 16, 8);
  ok(keys.every((kk, i) => kk === keys2[i]), 'lshBands deterministic');
  // COLD VECTOR (C8 #7): pin exact band keys — kills byte-order / hash-mixing mutants that still
  // produce well-formatted, deterministic, distinct keys (shape checks alone miss them).
  const h8 = makeHashes(8, 42);
  const sig8 = minhashSignature(['authentication', 'bypass', 'token', 'replay'], h8);
  ok(JSON.stringify(lshBands(sig8, 2, 4)) === '["0:1454477764","1:1956211075"]', 'lshBands pins exact band keys for (seed 42, 4 tokens, b=2 r=4)');
  // identical signatures share ALL band keys (the LSH collision guarantee at s=1).
  const sigSame = minhashSignature(['authentication', 'bypass', 'token', 'replay'], h);
  const ksame = lshBands(sigSame, 16, 8);
  ok(keys.every((kk, i) => kk === ksame[i]), 'identical signatures → identical band keys (collide in every band)');
  // a clearly different signature differs in at least one band (no all-collision on disjoint input).
  const sigDiff = minhashSignature(['subdomain', 'takeover', 'dangling', 'cname'], h);
  const kdiff = lshBands(sigDiff, 16, 8);
  ok(keys.some((kk, i) => kk !== kdiff[i]), 'distinct signatures → at least one differing band key');
}

// ── tuneBands: b·r ≤ k, crossover near t, determinism ────────────────────────────────────────────
{
  const t = 0.5, k = 128;
  const bestA = tuneBands(k, t), bestB = tuneBands(k, t);
  ok(bestA.b * bestA.r <= k, `tuneBands: b·r ≤ k (${bestA.b}·${bestA.r}=${bestA.b * bestA.r} ≤ ${k})`);
  ok(bestA.b >= 1 && bestA.r >= 1, 'tuneBands: b ≥ 1, r ≥ 1');
  ok(JSON.stringify(bestA) === JSON.stringify(bestB), 'tuneBands deterministic');
  ok(approx(bestA.crossover, t, 0.15), `tuneBands crossover ≈ t (${bestA.crossover.toFixed(3)} ≈ ${t})`);
  // brute-force optimality: no (b,r) with b·r≤k has a crossover closer to t than the returned one.
  let bruteErr = Infinity;
  for (let r = 1; r <= k; r++) { const b = Math.floor(k / r); if (b < 1) break; bruteErr = Math.min(bruteErr, Math.abs(Math.pow(1 / b, 1 / r) - t)); }
  ok(approx(bestA.err, bruteErr, 1e-12), 'tuneBands returns the crossover-optimal (b,r)');
}

console.log(`\nyuri-minhash.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
