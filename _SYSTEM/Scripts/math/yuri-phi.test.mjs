#!/usr/bin/env node
/**
 * yuri-phi.test.mjs — cold-provable tests for the NEXUS CORE π/φ/Fibonacci primitives.
 * Every assertion can FAIL: defining identities (φ²=φ+1), convergence (golden-section finds the true
 * min), correctness-vs-brute-force (Fibonacci search === linear-scan argmin on random unimodal arrays),
 * the three-distance theorem for the φ low-discrepancy sequence, and the golden-angle geometry.
 *
 * Determinism throughout: no RNG in the primitives. The test's own random arrays use a SEEDED LCG so
 * the brute-force verification is reproducible.
 */
import {
  PHI, INV_PHI, INV_PHI_SQ, GOLDEN_ANGLE,
  fib, fibBig, fibSequence, goldenSectionSearch, fibonacciSearchMin,
  phiPoint, phiSequence, goldenAnglePoint, goldenAnglePoints,
} from './yuri-phi.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── constants: defining identities ───────────────────────────────────────────────────────────
ok(approx(PHI, 1.618033988749895), 'PHI ≈ 1.6180339887');
ok(approx(PHI * PHI, PHI + 1), 'φ² === φ + 1 (defining identity)');
ok(approx(INV_PHI, PHI - 1), '1/φ === φ − 1');
ok(approx(INV_PHI, 1 / PHI), '1/φ === reciprocal of φ');
ok(approx(INV_PHI + INV_PHI_SQ, 1), '1/φ + 1/φ² === 1 (the two golden-section cuts partition the unit)');
ok(approx(GOLDEN_ANGLE, Math.PI * (3 - Math.sqrt(5))) && approx(GOLDEN_ANGLE * 180 / Math.PI, 137.5077640500378, 1e-6), 'GOLDEN_ANGLE === π(3−√5) ≈ 137.508° (fuses π and φ)');

// ── fib / fibBig / fibSequence ─────────────────────────────────────────────────────────────────
ok(fib(0) === 0 && fib(1) === 1 && fib(2) === 1 && fib(10) === 55 && fib(20) === 6765, 'fib cold vectors (0,1,1,55,6765)');
{ let good = true; for (let i = 2; i <= 40; i++) if (fib(i) !== fib(i - 1) + fib(i - 2)) good = false; ok(good, 'fib recurrence F(n)=F(n-1)+F(n-2) holds 2..40'); }
ok(approx(fib(30) / fib(29), PHI, 1e-6), 'consecutive fib ratio → φ');
ok(fibBig(100) === 354224848179261915075n, 'fibBig(100) exact BigInt (Number would lose precision)');
ok(Number(fibBig(78)) === fib(78) && BigInt(fib(78)) === fibBig(78), 'fib and fibBig agree at the Number-exact boundary F(78)');
{ let threw = false; try { fib(79); } catch { threw = true; } ok(threw, 'fib(79) throws (beyond Number exactness → use fibBig)'); }
{ let threw = false; try { fib(-1); } catch { threw = true; } ok(threw, 'fib(-1) throws'); }
{ let threw = false; try { fib(2.5); } catch { threw = true; } ok(threw, 'fib(2.5) throws (non-integer)'); }
ok(JSON.stringify(fibSequence(8)) === JSON.stringify([0, 1, 1, 2, 3, 5, 8, 13]), 'fibSequence(8) cold vector');

// ── goldenSectionSearch: converges to the true minimizer of unimodal objectives ────────────────
{
  const q = goldenSectionSearch((x) => (x - 2) ** 2, 0, 5);
  ok(approx(q.x, 2, 1e-4), `golden-section min of (x−2)² → x≈2 (got ${q.x.toFixed(6)})`);
  ok(q.fx < 1e-7, 'golden-section drives the objective to ~0 at the minimum');
  const p = goldenSectionSearch((x) => (x - Math.PI) ** 2, 0, 5);
  ok(approx(p.x, Math.PI, 1e-4), 'golden-section min of (x−π)² → x≈π');
  const cmin = goldenSectionSearch(Math.cos, 0, 2 * Math.PI); // cos min at x=π
  ok(approx(cmin.x, Math.PI, 1e-3), 'golden-section min of cos on [0,2π] → x≈π');
  // determinism + bracket-shrink + sublinear-ish eval count
  const a = goldenSectionSearch((x) => (x - 2) ** 2, 0, 5);
  const b = goldenSectionSearch((x) => (x - 2) ** 2, 0, 5);
  ok(a.x === b.x && a.iters === b.iters, 'goldenSectionSearch deterministic');
  ok(a.bracket[1] - a.bracket[0] <= 1e-10 + 1e-12, 'final bracket width ≤ tol');
  ok(a.evals === a.iters + 2, 'golden-section uses exactly ONE new evaluation per iteration (+2 seed)');
  { let threw = false; try { goldenSectionSearch((x) => x, 5, 0); } catch { threw = true; } ok(threw, 'goldenSectionSearch throws on b ≤ a'); }
}

// ── fibonacciSearchMin: EXACT argmin vs brute-force on random unimodal arrays, sublinear evals ──
{
  // seeded LCG for reproducible random unimodal arrays
  let s = 20260606;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  let mismatches = 0, trials = 0;
  for (let t = 0; t < 300; t++) {
    const n = 2 + Math.floor(rnd() * 200);
    const minIdx = Math.floor(rnd() * n);
    // strictly unimodal: FIXED per-side slopes (constant across i) so each side is genuinely monotonic.
    // (A per-element random slope would break monotonicity and violate the search's precondition.)
    const slopeL = 1 + Math.floor(rnd() * 5);
    const slopeR = 1 + Math.floor(rnd() * 5);
    const arr = new Array(n);
    for (let i = 0; i < n; i++) arr[i] = i < minIdx ? slopeL * (minIdx - i) : i > minIdx ? slopeR * (i - minIdx) : -1;
    const res = fibonacciSearchMin((i) => arr[i], n);
    const brute = arr.indexOf(Math.min(...arr));
    if (res.index !== brute) mismatches++;
    trials++;
  }
  ok(mismatches === 0, `fibonacciSearchMin === brute-force argmin on ${trials} random unimodal arrays (mismatches=${mismatches})`);

  // sublinear: a large domain must not be fully scanned
  const big = 100000, mIdx = 73421;
  const r = fibonacciSearchMin((i) => Math.abs(i - mIdx), big);
  ok(r.index === mIdx, 'fibonacciSearchMin finds the min of a large unimodal domain');
  ok(r.evals < 100, `fibonacciSearchMin is sublinear: ${r.evals} evals over ${big} (≪ n)`);

  ok(fibonacciSearchMin((i) => i, 1).index === 0, 'fibonacciSearchMin n=1 → index 0');
  { let threw = false; try { fibonacciSearchMin((i) => i, 0); } catch { threw = true; } ok(threw, 'fibonacciSearchMin throws on n<1'); }
}

// ── phiPoint / phiSequence: range, determinism, three-distance theorem (optimal evenness) ───────
{
  const seq = phiSequence(50);
  ok(seq.every((v) => v >= 0 && v < 1), 'phiSequence values ∈ [0,1)');
  ok(seq[0] === 0 && approx(seq[1], INV_PHI), 'phiSequence starts 0, 1/φ');
  ok(JSON.stringify(phiSequence(5)) === JSON.stringify(phiSequence(5)), 'phiSequence deterministic');
  ok(new Set(seq.map((v) => v.toFixed(12))).size === 50, 'phiSequence has no duplicate points (50 distinct)');
  // THREE-DISTANCE THEOREM: the gaps between sorted points of an irrational rotation take AT MOST 3
  // distinct values — the signature of an optimally-even 1-D spread (φ is the extremal case).
  const sorted = [...seq].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.push(1 - sorted[sorted.length - 1] + sorted[0]); // wrap gap
  const distinct = new Set(gaps.map((g) => g.toFixed(9)));
  ok(distinct.size <= 3, `three-distance theorem: ≤3 distinct gap sizes (got ${distinct.size})`);
  ok(Math.max(...gaps) < INV_PHI + 1e-9, 'φ-sequence max gap < 1/φ (no large blind spot)');
  // anti-resonance vs a fixed periodic cadence: φ cadence avoids the lock-step a rational 1/k produces
  ok(Math.max(...gaps) < 2 / 50 * 2, 'φ-sequence gaps stay small (even coverage at 50 points)');
  { let threw = false; try { phiPoint(-1); } catch { threw = true; } ok(threw, 'phiPoint(-1) throws'); }
}

// ── goldenAngle / goldenAnglePoints: geometry + evenness ────────────────────────────────────────
{
  ok(approx(goldenAnglePoint(0), 0) && goldenAnglePoint(5) >= 0 && goldenAnglePoint(5) < 2 * Math.PI, 'goldenAnglePoint ∈ [0,2π)');
  const pts = goldenAnglePoints(200, { radius: 10 });
  ok(pts.length === 200, 'goldenAnglePoints returns n points');
  ok(pts.every((p) => p.r <= 10 + 1e-9 && Math.hypot(p.x, p.y) <= 10 + 1e-9), 'all points within the disk radius');
  ok(new Set(pts.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size === 200, 'no two points coincide (even spread)');
  // consecutive angular increment is exactly the golden angle (mod 2π)
  const d = (goldenAnglePoint(1) - goldenAnglePoint(0) + 2 * Math.PI) % (2 * Math.PI);
  ok(approx(d, GOLDEN_ANGLE, 1e-9), 'consecutive golden-angle increment === GOLDEN_ANGLE');
  ok(JSON.stringify(goldenAnglePoints(3)) === JSON.stringify(goldenAnglePoints(3)), 'goldenAnglePoints deterministic');
}

console.log(`\nyuri-phi.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
