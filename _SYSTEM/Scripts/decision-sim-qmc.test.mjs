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
