#!/usr/bin/env node
/**
 * afl-phase2.test.mjs — Phase-2 test suite for the AFL quantum sequencing engine.
 *
 * Exercises factor-circuit.mjs against the LIVE quantum/optimization primitives proven in
 * afl-validation.mjs (quantum-hypothesis-tracker, yuri-phi, decision-sim, izanagi-bridge,
 * energy-tick-core). No mocks. Reads factor metadata READ-ONLY via the AFL store (getFactor),
 * never mutates the live DB, and writes nothing of its own.
 *
 * node:test. Run:  node --test _SYSTEM/Scripts/alpha-factor-library/afl-phase2.test.mjs
 *
 * Coverage map (task spec):
 *  (1) commutatorNorm symmetry + commuting pair (~0) + orthogonal-ish pair (>0)
 *  (2) ordering effect: scoreOrdering([0,1]) != scoreOrdering([1,0]) materially
 *  (3) lehmerDecode bijection (all n! distinct) + sampleOrderings returns valid perms
 *  (4) DEGENERATE: all-commuting set → optimizeFactorCircuit allCommute:true, no throw
 *  (5) buildCircuitDAG acyclic + edges only between non-commuting pairs
 *  (6) cornerGuard runs + returns a robustness verdict
 *  (7) circuitQuality ratio finite and > 0
 *  (8) recordCircuitEnergy produces an energy trace
 *  (9) end-to-end optimizeFactorCircuit on 5 seeded factors → complete result
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  N,
  factorVector,
  commutatorNorm,
  buildCommutativityMatrix,
  lehmerDecode,
  sampleOrderings,
  scoreOrdering,
  robustOptimalOrdering,
  buildCircuitDAG,
  cornerGuard,
  flipConditions,
  schmidtCoupling,
  productJointState,
  circuitQuality,
  recordCircuitEnergy,
  optimizeFactorCircuit,
} from './factor-circuit.mjs';

import { projector, normalize, stateVector } from '../quantum-hypothesis-tracker.mjs';
import { freshState } from '../energy-tick-core.mjs';
import { getFactor } from './alpha-factor-store.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

// ───────────────────────────────────────────────────────────────────────────
// Shared fixtures — DETERMINISTIC synthetic factor metadata (no DB mutation).
// ───────────────────────────────────────────────────────────────────────────

// Cross-category factors ⇒ separated directions ⇒ non-commuting projectors.
const FACT_MOM = { id: 'synthMom', category: 'momentum', correlation_cluster: 'MOM-X', data_inputs: ['close'], sharpe_tier: 'high' };
const FACT_VOL = { id: 'synthVol', category: 'volatility', correlation_cluster: 'VOL-Y', data_inputs: ['high', 'low'], sharpe_tier: 'low' };
const FACT_VOLU = { id: 'synthVolu', category: 'volume', correlation_cluster: 'VOLU-Z', data_inputs: ['volume'], sharpe_tier: 'medium' };

// Five seeded REAL factors (read-only) — confirmed present in the live store.
const SEED_IDS = ['accruals', 'altman-z-score', 'amihud-illiquidity', 'book-to-market', 'chaikin-ad-line'];
function seededFactors() {
  return SEED_IDS.map(getFactor).filter(Boolean);
}

// Two orthonormal unit vectors in R^N (e_0, e_1) → rank-1 projectors that do NOT share an eigenvector.
function basisProjector(slot, dim = N) {
  const v = new Array(dim).fill(0);
  v[slot] = 1;
  return projector(normalize(v));
}

const STRICT_TOL = 1e-9;
const BAND_TOL = 0.15; // approximate-commutativity band used by the validation reference

// ═══════════════════════════════════════════════════════════════════════════
// (1) commutatorNorm: symmetry + commuting (~0) + orthogonal-ish (>0)
// ═══════════════════════════════════════════════════════════════════════════

test('(1a) commutatorNorm is symmetric: ||[A,B]|| == ||[B,A]||', () => {
  const A = basisProjector(0);
  const B = basisProjector(3);
  const ab = commutatorNorm(A, B);
  const ba = commutatorNorm(B, A);
  // ||AB-BA|| vs ||BA-AB|| are Frobenius norms of negated matrices ⇒ identical.
  assert.ok(Number.isFinite(ab) && Number.isFinite(ba), 'both norms finite');
  assert.ok(Math.abs(ab - ba) < 1e-12, `symmetry: ${ab} vs ${ba}`);
});

test('(1b) identical projectors commute exactly: ||[P,P]|| ~ 0', () => {
  const v = normalize([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const P = projector(v);
  const cn = commutatorNorm(P, P);
  assert.ok(cn < STRICT_TOL, `identical projector commutator should be ~0, got ${cn}`);
});

test('(1c) parallel projectors (same direction, different scale) commute ~ 0', () => {
  // projector() normalizes the direction, so a scaled vector yields the same projector.
  const v1 = normalize([2, -1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const v2 = normalize([4, -2, 1.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // parallel to v1
  const cnParallel = commutatorNorm(projector(v1), projector(v2));
  assert.ok(cnParallel < STRICT_TOL, `parallel projectors should commute, got ${cnParallel}`);
});

test('(1d) orthogonal basis projectors share an eigenbasis ⇒ commute (AB = BA = 0)', () => {
  // Honesty note: orthogonal rank-1 projectors are NOT a non-commuting example — AB = 0 = BA, so
  // they commute. The strictly-positive (non-commuting) case is the non-orthogonal pair in (1e).
  const A = basisProjector(0); // |e0><e0|
  const B = basisProjector(1); // |e1><e1|  (orthogonal direction)
  const cn = commutatorNorm(A, B);
  assert.ok(cn < STRICT_TOL, `axis-aligned basis projectors share an eigenbasis ⇒ commute, got ${cn}`);
});

test('(1e) generic non-aligned, non-orthogonal projectors do NOT commute: ||[A,B]|| > 0', () => {
  const A = projector(normalize([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const B = projector(normalize([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])); // 45° to A, not orthogonal
  const cn = commutatorNorm(A, B);
  assert.ok(cn > STRICT_TOL, `non-commuting pair should have positive commutator, got ${cn}`);
  // And the cross-category synthetic factors are likewise non-commuting (the structure the engine exploits).
  const cm = buildCommutativityMatrix([FACT_MOM, FACT_VOL], { tol: STRICT_TOL });
  assert.ok(cm.matrix[0][1] > STRICT_TOL, `cross-category factors should be non-commuting, got ${cm.matrix[0][1]}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) ordering effect: scoreOrdering([0,1]) != scoreOrdering([1,0]) materially
// ═══════════════════════════════════════════════════════════════════════════

test('(2) at least one factor pair where ordering [0,1] != [1,0] materially', () => {
  const cm = buildCommutativityMatrix([FACT_MOM, FACT_VOL], { tol: STRICT_TOL });
  assert.ok(cm.matrix[0][1] >= STRICT_TOL, 'fixture pair must be non-commuting for an ordering effect');

  // Use the deterministic engine psi (defaultPsi) implicitly by constructing one here.
  const psi = stateVector(Array.from({ length: N }, (_, i) => Math.cos(i * 0.7) + 0.1));
  const sAB = scoreOrdering([0, 1], cm.projectors, psi);
  const sBA = scoreOrdering([1, 0], cm.projectors, psi);

  assert.ok(Number.isFinite(sAB) && Number.isFinite(sBA), 'both ordering scores finite');
  assert.ok(sAB >= 0 && sBA >= 0, 'jointProbability is non-negative');
  // "Materially" different — relative gap well above float noise.
  const rel = Math.abs(sAB - sBA) / (Math.max(sAB, sBA) || 1e-30);
  assert.ok(rel > 0.05, `ordering effect should be material: AB=${sAB}, BA=${sBA}, rel=${rel}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) lehmerDecode bijection (all n! distinct) + sampleOrderings valid perms
// ═══════════════════════════════════════════════════════════════════════════

function isValidPerm(perm, n) {
  if (!Array.isArray(perm) || perm.length !== n) return false;
  const seen = new Set(perm);
  if (seen.size !== n) return false;
  return perm.every((x) => Number.isInteger(x) && x >= 0 && x < n);
}

test('(3a) lehmerDecode is a bijection: all n! ranks → distinct valid perms (n=1..5)', () => {
  for (let n = 1; n <= 5; n++) {
    const total = (() => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; })();
    const keys = new Set();
    for (let idx = 0; idx < total; idx++) {
      const perm = lehmerDecode(idx, n);
      assert.ok(isValidPerm(perm, n), `n=${n} idx=${idx} produced invalid perm ${perm}`);
      keys.add(perm.join(','));
    }
    assert.equal(keys.size, total, `n=${n}: expected ${total} distinct perms, got ${keys.size}`);
  }
});

test('(3b) lehmerDecode wraps out-of-range/non-integer indices into the valid domain', () => {
  // index is clamped via mod n!, so an over-range or fractional value still yields a valid perm.
  const p1 = lehmerDecode(120, 5);   // == rank 0 (mod 120)
  const p2 = lehmerDecode(0, 5);
  assert.deepEqual(p1, p2, 'index 120 mod 5! == index 0');
  assert.ok(isValidPerm(lehmerDecode(7.9, 4), 4), 'fractional index floors into a valid perm');
  assert.deepEqual(lehmerDecode(5, 0), [], 'n=0 yields the empty permutation');
});

test('(3c) sampleOrderings returns only valid permutations (small enumerates, large samples)', () => {
  // Small n: full enumeration (n! <= 64 OR want >= n!).
  const small = sampleOrderings(4, 5);
  assert.equal(small.length, 24, 'n=4 enumerates all 4! = 24 orderings');
  for (const perm of small) assert.ok(isValidPerm(perm, 4), `invalid small perm ${perm}`);

  // Larger n: quasi-uniform phi sampling, de-duplicated, each a valid perm.
  const big = sampleOrderings(7, 40);
  assert.ok(big.length > 0 && big.length <= 40 * 4, `sampled count in range, got ${big.length}`);
  const keys = new Set();
  for (const perm of big) {
    assert.ok(isValidPerm(perm, 7), `invalid sampled perm ${perm}`);
    keys.add(perm.join(','));
  }
  assert.equal(keys.size, big.length, 'sampled orderings are de-duplicated');

  // Edge cases.
  assert.deepEqual(sampleOrderings(0, 10), [], 'n=0 → no orderings');
  assert.deepEqual(sampleOrderings(1, 10), [[0]], 'n=1 → single trivial ordering');
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) DEGENERATE: all-commuting set → allCommute:true, no throw, no faked advantage
// ═══════════════════════════════════════════════════════════════════════════

test('(4) all-commuting (identical-metadata) factors → degenerate short-circuit, no throw', () => {
  const meta = { category: 'value', correlation_cluster: 'VALUE-SAME', data_inputs: ['fundamentals'], sharpe_tier: 'medium' };
  const factors = [{ id: 'c1', ...meta }, { id: 'c2', ...meta }, { id: 'c3', ...meta }];

  // Identical metadata ⇒ identical vector ⇒ identical projector ⇒ commutator EXACTLY 0.
  const cm = buildCommutativityMatrix(factors, { tol: STRICT_TOL });
  assert.equal(cm.allCommute, true, 'identical projectors all commute');
  assert.equal(Math.max(...cm.matrix.flat()), 0, 'max commutator is exactly 0');

  let result;
  assert.doesNotThrow(() => { result = optimizeFactorCircuit(factors, { tol: STRICT_TOL, recordEnergy: false }); },
    'degenerate path must not throw');

  assert.equal(result.allCommute, true, 'allCommute flag set');
  assert.equal(result.degenerate, true, 'degenerate flag set');
  assert.equal(result.ceResult, undefined, 'the quantum optimizer (ceResult) must NOT run on the degenerate path');
  assert.equal(result.corner, null, 'no corner law to guard when sequencing is skipped');
  assert.equal(result.quality.ratio, 1, 'ratio is 1 by construction (no faked advantage)');
  assert.equal(result.quality.deltaU, 0, 'deltaU is 0 (order-blind == best)');
  assert.equal(result.classes.length, 1, 'all factors collapse into a single equivalence class');
  assert.ok(isValidPerm(result.bestOrdering, factors.length), 'bestOrdering is the identity permutation');
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) buildCircuitDAG: acyclic + edges only between non-commuting pairs
// ═══════════════════════════════════════════════════════════════════════════

test('(5a) buildCircuitDAG on non-commuting circuit is acyclic with edges only on non-commuting pairs', () => {
  const factors = seededFactors();
  assert.ok(factors.length === 5, `expected 5 seeded factors, got ${factors.length}`);
  const cm = buildCommutativityMatrix(factors, { tol: STRICT_TOL });
  const ordering = [3, 0, 1, 2, 4];
  const dag = buildCircuitDAG(cm, ordering, { tol: STRICT_TOL });

  assert.equal(dag.acyclic, true, 'DAG must be acyclic by construction');
  assert.equal(dag.nodes.length, ordering.length, 'one node per factor in the ordering');

  // Every edge points earlier→later in the ordering (the source of acyclicity).
  const posOf = new Map(ordering.map((idx, p) => [idx, p]));
  for (const e of dag.edges) {
    assert.ok(posOf.get(e.from) < posOf.get(e.to), `edge ${e.from}->${e.to} must respect ordering position`);
    // Edge exists ONLY because the pair is non-commuting (commutator >= tol).
    assert.ok(cm.matrix[e.from][e.to] >= STRICT_TOL, `edge ${e.from}->${e.to} must be a non-commuting pair`);
    assert.equal(e.reason, 'non-commuting', 'edge reason is non-commuting');
  }
});

test('(5b) buildCircuitDAG on an ALL-commuting matrix produces NO edges (fully parallel)', () => {
  // Synthetic all-commuting matrix: every off-diagonal commutator below tol.
  const order = [0, 1, 2, 3];
  const zero = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const dag = buildCircuitDAG({ matrix: zero }, order, { tol: STRICT_TOL });
  assert.equal(dag.edges.length, 0, 'commuting pairs get no edges');
  assert.equal(dag.acyclic, true, 'empty edge set is trivially acyclic');
  assert.equal(dag.parallelizable, true, 'all-commuting circuit is fully parallelizable');
});

// ═══════════════════════════════════════════════════════════════════════════
// (6) cornerGuard runs and returns a robustness verdict
// ═══════════════════════════════════════════════════════════════════════════

test('(6) cornerGuard runs on the optimizer problem and returns a corner-law robustness verdict', () => {
  const factors = seededFactors();
  const cm = buildCommutativityMatrix(factors, { tol: STRICT_TOL });
  const r = robustOptimalOrdering(cm.projectors, { sampleCount: 60, draws: 40, iters: 3, seed: 42 });
  assert.ok(r.problem && typeof r.problem.value === 'function', 'robustOptimalOrdering exposes a problem with value()');

  const verdict = cornerGuard(r.problem, { ordering: r.bestOrdering }, { samples: 256 });

  // Periodicity-correct dense worst-case scan (red-team fix: vertex enumeration of a periodic [0,2π]
  // axis is vacuous — its two endpoints are the SAME state). The honest guard is a dense band scan.
  assert.equal(verdict.method, 'dense-periodic-scan', 'uses the periodicity-correct worst-case scan, not vacuous vertex enumeration');
  assert.ok(Number.isFinite(verdict.worstCase) && Number.isFinite(verdict.bestCase), 'worst/best case finite');
  assert.ok(verdict.worstCase <= verdict.nominal + 1e-12, 'dense scan found a worst-case <= nominal (it actually searches the band)');
  assert.ok(verdict.worstCase <= verdict.bestCase, 'worst <= best');
  assert.equal(typeof verdict.robust, 'boolean', 'robust is a boolean verdict (signal never annihilated across the band)');
  assert.ok(verdict.affineVertexReadout, 'izanagi affine vertex readout retained as a labeled secondary');

  // flipConditions is the companion per-axis verdict — exercise it too (uses problem.nullValue).
  const flips = flipConditions(r.problem, { ordering: r.bestOrdering });
  assert.ok(flips && typeof flips === 'object', 'flipConditions returns an object');
  assert.ok('theta' in flips, 'flip verdict keyed by the theta axis');
});

// ═══════════════════════════════════════════════════════════════════════════
// (7) circuitQuality ratio is finite and > 0
// ═══════════════════════════════════════════════════════════════════════════

test('(7) circuitQuality ratio is finite and strictly > 0', () => {
  const factors = seededFactors();
  const cm = buildCommutativityMatrix(factors, { tol: STRICT_TOL });
  const projectors = cm.projectors;
  const psi = stateVector(Array.from({ length: N }, (_, i) => Math.sin(i * 0.9) + 0.2));

  const ordering = [3, 0, 1, 2, 4];
  const optimalOrdered = ordering.map((i) => projectors[i]);
  const q = circuitQuality(optimalOrdered, projectors, psi, { sampleCount: 60 });

  assert.ok(Number.isFinite(q.ratio), `ratio must be finite, got ${q.ratio}`);
  assert.ok(q.ratio > 0, `ratio must be > 0, got ${q.ratio}`);
  assert.ok(Number.isFinite(q.quantumScore) && q.quantumScore >= 0, 'quantumScore finite & non-negative');
  assert.ok(Number.isFinite(q.classicalScore) && q.classicalScore >= 0, 'classicalScore finite & non-negative');
  assert.ok(Number.isFinite(q.deltaU), `deltaU finite, got ${q.deltaU}`);
  // deltaU = -log(ratio): advantage (ratio>1) ⇒ deltaU<0.
  if (q.ratio > 1) assert.ok(q.deltaU < 0, 'a real advantage maps to a descending deltaU');
});

// ═══════════════════════════════════════════════════════════════════════════
// (8) recordCircuitEnergy produces an energy trace
// ═══════════════════════════════════════════════════════════════════════════

test('(8) recordCircuitEnergy produces an energy trace without throwing', () => {
  const factors = seededFactors();
  const result = optimizeFactorCircuit(factors, { tol: STRICT_TOL, recordEnergy: false });

  let energy;
  assert.doesNotThrow(() => { energy = recordCircuitEnergy(freshState(), result.quality, { runId: 'afl-phase2-test-8' }); },
    'recordCircuitEnergy must never throw');

  assert.ok(energy && typeof energy === 'object', 'returns a result object');
  assert.equal(energy.error ?? null, null, `no trace error, got ${energy.error}`);
  assert.equal(energy.traced, true, 'a trace was produced');
  assert.equal(typeof energy.advantage, 'boolean', 'advantage flag present');
  // ratio>1 ⇒ advantage true (modeled as a passing verification event).
  assert.equal(energy.advantage, result.quality.ratio > 1, 'advantage flag tracks the quality ratio');
  assert.ok(Number.isFinite(energy.deltaU), `energy ΔU finite, got ${energy.deltaU}`);

  // Degenerate (ratio == 1) → NOT an advantage, still traces cleanly.
  const meta = { category: 'value', correlation_cluster: 'VS', data_inputs: ['fundamentals'], sharpe_tier: 'low' };
  const degen = optimizeFactorCircuit([{ id: 'z1', ...meta }, { id: 'z2', ...meta }], { tol: STRICT_TOL, recordEnergy: false });
  const e2 = recordCircuitEnergy(freshState(), degen.quality, { runId: 'afl-phase2-test-8-degen' });
  assert.equal(e2.advantage, false, 'ratio == 1 is not an advantage');
});

// ═══════════════════════════════════════════════════════════════════════════
// (9) end-to-end optimizeFactorCircuit on 5 seeded factors → complete result
// ═══════════════════════════════════════════════════════════════════════════

test('(9) end-to-end optimizeFactorCircuit on 5 seeded factors returns a complete result', () => {
  const factors = seededFactors();
  assert.equal(factors.length, 5, 'all 5 seed factors resolved from the store');

  const result = optimizeFactorCircuit(factors, { tol: STRICT_TOL, sampleCount: 60, draws: 40, iters: 3, seed: 42 });

  // Structural completeness.
  assert.equal(result.allCommute, false, 'cross-category real factors are non-commuting (quantum path)');
  assert.equal(result.degenerate, false, 'not a degenerate circuit');
  assert.ok(isValidPerm(result.bestOrdering, 5), `bestOrdering is a valid 5-perm, got ${result.bestOrdering}`);
  assert.ok(Number.isFinite(result.bestOrderingScore) && result.bestOrderingScore >= 0, 'bestOrderingScore finite & non-negative');
  assert.ok(result.ceResult && typeof result.ceResult === 'object', 'cross-entropy result attached');

  // DAG.
  assert.equal(result.dag.acyclic, true, 'DAG acyclic');
  assert.ok(result.dag.edges.length >= 1, 'a non-commuting circuit has at least one ordering edge');
  assert.equal(result.dag.nodes.length, 5, 'one DAG node per factor');

  // Quality.
  assert.ok(Number.isFinite(result.quality.ratio) && result.quality.ratio > 0, 'quality ratio finite & > 0');
  assert.ok(Number.isFinite(result.quality.deltaU), 'quality deltaU finite');

  // Corner guard + flips ran (not skipped on the quantum path).
  assert.ok(result.corner && result.corner.method === 'dense-periodic-scan'
    && Number.isFinite(result.corner.worstCase) && typeof result.corner.robust === 'boolean',
    'corner guard produced a dense-scan robustness verdict');
  assert.ok(result.flips && typeof result.flips === 'object', 'flip conditions produced');

  // Energy recorded by default (recordEnergy defaults true).
  assert.ok(result.energy && typeof result.energy === 'object', 'energy trace attached');

  // Commutativity bookkeeping.
  assert.ok(Array.isArray(result.classes) && result.classes.length >= 1, 'equivalence classes present');
  assert.equal(result.commMatrix.matrix.length, 5, 'commutativity matrix is 5x5');
  assert.ok(Array.isArray(result.psi) && result.psi.length === N, 'psi state vector attached with dim N');

  // schmidtCoupling DISCRIMINATES (red-team fix): a product joint state is Schmidt rank 1 (uncoupled),
  // a Bell state is rank 2 (entangled). The old +0.3-diagonal version reported rank>=2 for everything.
  const prodJ = productJointState([1, 0], [0, 1]);  // |0>|1> => rank 1
  const scProd = schmidtCoupling(prodJ, 2, 2);
  assert.equal(scProd.rank, 1, 'product joint state is Schmidt rank 1 (uncoupled)');
  assert.equal(scProd.entangled, false, 'product state correctly NOT entangled');
  const scBell = schmidtCoupling([1, 0, 0, 1], 2, 2); // (|00>+|11>)/√2 => rank 2
  assert.equal(scBell.rank, 2, 'Bell state is Schmidt rank 2 (entangled)');
  assert.ok(scBell.entangled, 'Bell state correctly entangled');
});

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY DB invariant — the suite must not have mutated the store.
// ═══════════════════════════════════════════════════════════════════════════

test('(inv) store remains read-only: synthetic test ids were never written', () => {
  // None of the synthetic fixtures (synthMom/c1/z1...) should exist in the live store.
  for (const id of ['synthMom', 'synthVol', 'synthVolu', 'c1', 'c2', 'c3', 'z1', 'z2']) {
    assert.equal(getFactor(id), null, `synthetic id "${id}" must NOT have been written to the live DB`);
  }
  // And the seed factors are still intact (read-only access).
  for (const id of SEED_IDS) {
    const f = getFactor(id);
    assert.ok(f && f.id === id, `seed factor ${id} still present`);
  }
});
