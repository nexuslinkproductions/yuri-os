import { test } from 'node:test';
import assert from 'node:assert/strict';
import { halton, makeQmcRng, makeRng, robustScore } from './decision-sim.mjs';

test('halton produces the known low-discrepancy values', () => {
  assert.equal(halton(1, 2), 0.5);
  assert.equal(halton(2, 2), 0.25);
  assert.equal(halton(3, 2), 0.75);
  assert.ok(Math.abs(halton(1, 3) - 1 / 3) < 1e-12);
});

test('makeQmcRng cycles dimensions then advances the draw; deterministic', () => {
  const a = makeQmcRng({ dim: 2, draws: 4, seed: 1 });
  const b = makeQmcRng({ dim: 2, draws: 4, seed: 1 });
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB, 'same seed → identical sequence');
  assert.notEqual(seqA[0], seqA[1], 'dim 0 vs dim 1 differ within a draw');
  assert.notEqual(seqA[0], seqA[2], 'draw 0 vs draw 1 differ in dim 0');
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('degrades to seeded MC when dim exceeds the prime table (never throws)', () => {
  const rng = makeQmcRng({ dim: 99, draws: 10, seed: 7 });
  for (let i = 0; i < 5; i += 1) { const v = rng(); assert.ok(v >= 0 && v < 1); }
});

test('DISARMED: robustScore with qmc=false is byte-identical to the no-qmc path', () => {
  const problem = {
    discrete: {}, continuous: {},
    sampleParams: (rng) => ({ a: rng(), b: rng() }),
    value: (_c, p) => p.a * p.b,
  };
  const base = robustScore(problem, {}, { draws: 200, rng: makeRng(42) });
  const off = robustScore(problem, {}, { draws: 200, rng: makeRng(42), qmc: false });
  assert.equal(off, base, 'qmc=false must not perturb the result at all');
});

// ---- effect-size benchmark: QMC vs MC on a SMOOTH 2-D integrand (true mean of x*y = 0.25) ----
function estErr({ qmc, seed, n }) {
  const dim = 2;
  const rng = qmc ? makeQmcRng({ dim, draws: n, seed }) : makeRng(seed);
  let s = 0;
  for (let i = 0; i < n; i += 1) { const x = rng(); const y = rng(); s += x * y; }
  return Math.abs(s / n - 0.25);
}
function avgErr(qmc, n, seeds) {
  let t = 0; for (const sd of seeds) t += estErr({ qmc, seed: sd, n }); return t / seeds.length;
}

test('effect size: RQMC beats MC on a smooth low-dim integrand (variance reduction)', () => {
  const N = 400;
  const seeds = Array.from({ length: 12 }, (_, i) => 1000 + i * 137);
  const mc = avgErr(false, N, seeds);
  const qmc = avgErr(true, N, seeds);
  const ratio = mc / qmc; // >1 means QMC has the smaller error (variance reduction)
  // effect-size, not a binary threshold: QMC reliably ≥2× on this smooth 2-D integrand.
  assert.ok(ratio > 2, `expected QMC clearly better; mc=${mc.toExponential(2)} qmc=${qmc.toExponential(2)} ratio=${ratio.toFixed(2)}`);
});

test('negative: QMC advantage SHRINKS on a discontinuous integrand (documented limitation)', () => {
  // discontinuous indicator f = [x+y < 0.5], true mean = 0.125 (triangle area)
  const N = 400;
  const seeds = Array.from({ length: 12 }, (_, i) => 5000 + i * 91);
  const errMC = (qmc) => {
    let t = 0;
    for (const sd of seeds) {
      const rng = qmc ? makeQmcRng({ dim: 2, draws: N, seed: sd }) : makeRng(sd);
      let s = 0; for (let i = 0; i < N; i += 1) { const x = rng(); const y = rng(); s += (x + y < 0.5 ? 1 : 0); }
      t += Math.abs(s / N - 0.125);
    }
    return t / seeds.length;
  };
  const discontRatio = errMC(false) / errMC(true);
  // smooth ratio recomputed for comparison
  const smoothSeeds = Array.from({ length: 12 }, (_, i) => 1000 + i * 137);
  const smoothRatio = avgErr(false, N, smoothSeeds) / avgErr(true, N, smoothSeeds);
  assert.ok(smoothRatio > discontRatio, `QMC edge must be larger on smooth (${smoothRatio.toFixed(2)}) than discontinuous (${discontRatio.toFixed(2)})`);
  assert.ok(Number.isFinite(discontRatio) && discontRatio > 0, 'QMC still produces valid bounded estimates (graceful degradation)');
});

// ============================ RED (mutation / discrimination) ============================
// Proves the effect-size GREEN test is NOT vacuous: a mutant "QMC" that is secretly iid MC (no
// low-discrepancy structure) must FAIL the ratio>2 bar. If this passed, the green test would
// rubber-stamp a broken sampler. This is the mutant the green test must kill.
test('RED: a fake-QMC (iid uniform, no low-discrepancy) does NOT clear the >2 variance-reduction bar', () => {
  const N = 400;
  const seeds = Array.from({ length: 12 }, (_, i) => 1000 + i * 137);
  const mc = avgErr(false, N, seeds);
  const fake = seeds.reduce((t, sd) => {
    const rng = makeRng(sd + 9991);               // mutant: plain MC masquerading as QMC
    let s = 0; for (let i = 0; i < N; i += 1) s += rng() * rng();
    return t + Math.abs(s / N - 0.25);
  }, 0) / seeds.length;
  const ratio = mc / fake;
  assert.ok(ratio < 2, `mutant (fake QMC) must NOT clear >2 (got ${ratio.toFixed(2)}) — green test discriminates`);
});

// ============================ GREY (independent oracle + metamorphic) =====================
// Independent oracle: low star-discrepancy is the DEFINING property of QMC — measured directly,
// integrand-agnostic. Kills mutants that happen to reduce variance on x*y but aren't truly uniform.
function starDiscrepancy1D(points) {
  const xs = [...points].sort((a, b) => a - b); const N = xs.length;
  let d = 0; for (let i = 0; i < N; i += 1) d = Math.max(d, Math.abs(xs[i] - (i + 0.5) / N));
  return d;
}
test('GREY oracle: QMC 1-D points are more uniform than random by the star-discrepancy measure', () => {
  const N = 512;
  const q = makeQmcRng({ dim: 1, draws: N, seed: 1 });
  const qp = Array.from({ length: N }, () => q());
  const r = makeRng(1);
  const rp = Array.from({ length: N }, () => r());
  const dq = starDiscrepancy1D(qp), dr = starDiscrepancy1D(rp);
  assert.ok(dq < dr, `QMC discrepancy ${dq.toExponential(2)} must be < random ${dr.toExponential(2)}`);
});
test('GREY metamorphic: error shrinks as N grows, and the sequence is seed-deterministic', () => {
  const errAt = (n) => { const g = makeQmcRng({ dim: 2, draws: n, seed: 1 }); let s = 0; for (let i = 0; i < n; i += 1) s += g() * g(); return Math.abs(s / n - 0.25); };
  assert.ok(errAt(2000) < errAt(125), 'metamorphic: 16x draws → strictly smaller error');
  const a = makeQmcRng({ dim: 2, draws: 8, seed: 3 });
  const b = makeQmcRng({ dim: 2, draws: 8, seed: 3 });
  assert.deepEqual(Array.from({ length: 16 }, () => a()), Array.from({ length: 16 }, () => b()), 'same seed → identical sequence (deterministic)');
});
