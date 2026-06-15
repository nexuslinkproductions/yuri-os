#!/usr/bin/env node
/**
 * yuri-minhash.mjs — deterministic MinHash + LSH banding (pure math, embedding-free).
 *
 * THE PROBLEM IT SOLVES — the corpus matcher needs to find, for a task query, the COMPLETE set
 * of candidate corpus items similar to it, deterministically and in a fraction of the compute of
 * a full O(N) Jaccard scan or a BM25 re-rank-and-truncate. MinHash gives an approximately unbiased estimator of
 * Jaccard set-similarity from a fixed-length signature; LSH banding turns "find all items with
 * Jaccard ≥ t" into O(1)-ish bucket lookups instead of N pairwise comparisons.
 *
 * SOURCE THEORY:
 *   - MinHash (Broder 1997): for a random permutation π of the universe, P[min π(A) = min π(B)] =
 *     Jaccard(A,B). Average over k permutations → an approximately unbiased Jaccard estimate
 *     (2-universal affine family, not min-wise independent; measured bias −0.001 at 192k draws)
 *     with stderr ~1/√k.
 *   - LSH banding (Indyk-Motwani 1998 / Leskovec-Rajaraman-Ullman MMDS ch.3): split the k-length
 *     signature into b bands of r rows (k=b·r); two sets collide in ≥1 band with probability
 *     1−(1−s^r)^b — an S-curve with threshold ≈ (1/b)^(1/r). Tune (b,r) to the desired t.
 *
 * DETERMINISM: the k permutations are generated from a FIXED seed via an LCG, and token hashing is
 * FNV-1a — same input → same signature on every machine/run. No clock, no RNG, no I/O. Honors the
 * no-embedding / FTS5-only house law (this is set-similarity over tokens, not vector search).
 *
 * Universal-hashing permutation family: h_i(x) = ((a_i · x + b_i) mod p), p = 2^31−1 (Mersenne
 * prime). min over tokens of h_i(hash(token)) = the i-th MinHash coordinate.
 */

const MERSENNE = 2147483647; // 2^31 − 1, prime — the modulus for the permutation family
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** FNV-1a 32-bit hash of a string → uint32. Deterministic. */
export function fnv1a(str) {
  let h = FNV_OFFSET >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic LCG → a stream of pseudo-random uint32 from a fixed seed (for the hash params). */
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; };
}

/**
 * Build k deterministic permutation params {a, b}. Same seed → same params, always.
 * a forced odd & in [1, p), b in [0, p).
 */
export function makeHashes(k, seed = 0x9e3779b1) {
  if (!Number.isInteger(k) || k < 1) throw new Error(`makeHashes: k must be a positive integer, got ${k}`); // RED-TEAM r2
  const rnd = lcg(seed);
  const a = new Int32Array(k);
  const b = new Int32Array(k);
  for (let i = 0; i < k; i++) {
    // a ∈ [1, p−1]: every nonzero a < p is invertible mod the prime p, so it's a valid
    // permutation coefficient. (RED-TEAM fix: the old `| 1` could turn p−1 into p === MERSENNE,
    // making modAffine collapse to the constant b — a degenerate, non-permuting coordinate.)
    a[i] = (rnd() % (MERSENNE - 1)) + 1;           // in [1, p−1]
    b[i] = rnd() % MERSENNE;                       // in [0, p)
  }
  return { k, a, b, seed };
}

// Empty-set signature coordinate. Real coordinates are mod p < 2^31-1 < 0xffffffff,
// so sig[0] === SENTINEL iff the input set was empty (signatures are all-or-nothing).
// Contract: applies to signatures produced by minhashSignature.
const SENTINEL = 0xffffffff;

/**
 * MinHash signature of a token Set (or array). Returns a Uint32Array of length k.
 * Empty input → all-SENTINEL signature; estimateJaccard treats it as ∅ (similarity 0).
 * Carries a `seed` comparability stamp (plain property — dropped at FFI/serialization
 * boundaries, where the seed guard silently disarms: an in-process advisory guard,
 * documented-not-chased).
 */
export function minhashSignature(tokens, hashes) {
  const { k, a, b } = hashes;
  const sig = new Uint32Array(k).fill(SENTINEL);
  sig.seed = hashes.seed; // comparability stamp
  const iter = tokens instanceof Set ? tokens : new Set(tokens);
  if (iter.size === 0) return sig;
  // Pre-hash each token once (FNV), then apply the k affine permutations.
  for (const t of iter) {
    const x = fnv1a(t);
    for (let i = 0; i < k; i++) {
      // (a*x + b) mod p — use Number math; a,b < 2^31, x < 2^32 → product < 2^63, exact in f64? No.
      // Reduce x mod p first (x can exceed p), then multiply in BigInt-free safe range via modmul.
      const hv = modAffine(a[i], x, b[i]);
      if (hv < sig[i]) sig[i] = hv;
    }
  }
  return sig;
}

/** (a*x + b) mod p, overflow-safe for a,b < p < 2^31 and x < 2^32, without BigInt. */
function modAffine(a, x, b) {
  // x mod p
  const xm = x % MERSENNE;
  // a*xm can be up to ~2^31 * 2^31 = 2^62 → not exact in f64 (53-bit mantissa). Split xm into hi/lo.
  // a*xm = a*(hi*2^16 + lo) = (a*hi)*2^16 + a*lo, reduce mod p stepwise.
  const hi = Math.floor(xm / 65536);
  const lo = xm % 65536;
  let r = ((a * hi) % MERSENNE) * 65536 % MERSENNE; // (a*hi mod p)*2^16 mod p
  r = (r + (a * lo) % MERSENNE) % MERSENNE;
  r = (r + b) % MERSENNE;
  return r >>> 0;
}

/** Estimate Jaccard from two signatures = fraction of matching coordinates.
 * Empty-set convention: agrees with house jaccard(∅,∅)=0 — no signal is not identity.
 * Throws on a seed mismatch when BOTH signatures carry the in-process seed stamp. */
export function estimateJaccard(sigA, sigB) {
  const k = Math.min(sigA.length, sigB.length);
  if (!k) return 0;
  // Sentinel check BEFORE the seed guard: two empty docs are incomparable-but-harmless
  // (0), never a throw — regardless of which hash family produced them.
  if (sigA[0] === SENTINEL || sigB[0] === SENTINEL) return 0;
  if (sigA.seed !== undefined && sigB.seed !== undefined && sigA.seed !== sigB.seed) {
    throw new Error(`estimateJaccard: signatures built from different seeds (${sigA.seed} vs ${sigB.seed}) are not comparable`);
  }
  let m = 0;
  for (let i = 0; i < k; i++) if (sigA[i] === sigB[i]) m++;
  return m / k;
}

/**
 * LSH band keys for a signature: split k into b bands of r rows; each band → a string bucket key
 * "band#:hash". Two items sharing ANY band key are LSH candidates. Returns b keys.
 */
export function lshBands(sig, b, r) {
  // Rust-parity guard (nexus-rs rejects the same call): silent out-of-range bands
  // hashed `undefined >>> 0` = 0 and returned fake keys. Boundary b*r === sig.length
  // stays VALID (conformance pin).
  if (!sig || !Number.isInteger(sig.length) || !Number.isInteger(b) || !Number.isInteger(r) || b < 1 || r < 1 || b * r > sig.length) {
    throw new Error(`lshBands: need integer b,r >= 1 with b*r <= sig.length (got b=${b}, r=${r}, k=${sig && sig.length})`);
  }
  const keys = new Array(b);
  for (let band = 0; band < b; band++) {
    let h = FNV_OFFSET >>> 0;
    const start = band * r;
    for (let i = 0; i < r; i++) {
      const v = sig[start + i] >>> 0;
      h ^= v & 0xff; h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (v >>> 8) & 0xff; h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (v >>> 16) & 0xff; h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (v >>> 24) & 0xff; h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    keys[band] = band + ':' + (h >>> 0);
  }
  return keys;
}

/**
 * Choose (b, r) for a target Jaccard threshold t given k rows. The LSH S-curve crossover is
 * ≈ (1/b)^(1/r); we pick the (b,r) with b*r ≤ k whose crossover is closest to t. Deterministic.
 */
export function tuneBands(k, t) {
  let best = { b: 1, r: k, err: Infinity };
  for (let r = 1; r <= k; r++) {
    const b = Math.floor(k / r);
    if (b < 1) break;
    const crossover = Math.pow(1 / b, 1 / r);
    const err = Math.abs(crossover - t);
    if (err < best.err) best = { b, r, err, crossover };
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const h = makeHashes(128);
  const A = new Set('cross site scripting reflected xss login form'.split(' '));
  const B = new Set('reflected xss in the login form input field'.split(' '));
  const C = new Set('subdomain takeover via dangling dns cname record'.split(' '));
  const sigA = minhashSignature(A, h), sigB = minhashSignature(B, h), sigC = minhashSignature(C, h);
  const jac = (x, y) => { const u = new Set([...x, ...y]); let i = 0; for (const t of x) if (y.has(t)) i++; return i / u.size; };
  console.log(JSON.stringify({
    estAB: estimateJaccard(sigA, sigB).toFixed(3), trueAB: jac(A, B).toFixed(3),
    estAC: estimateJaccard(sigA, sigC).toFixed(3), trueAC: jac(A, C).toFixed(3),
    bands_t05: tuneBands(128, 0.5),
  }, null, 2));
}
