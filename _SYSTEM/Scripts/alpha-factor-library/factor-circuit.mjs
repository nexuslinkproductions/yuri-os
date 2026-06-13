#!/usr/bin/env node
// @capability: quantum-factor-sequencing
// @serves: factor circuit | quantum factor sequencing | non-commutative factor combination | order-dependent factor application | optimal factor ordering | factor commutativity | circuit DAG | quantum advantage over classical combination | factor resonance
// @does: AFL Phase-2 MOAT — treats each alpha factor as a rank-1 projector in R^N, finds the order-optimal (non-commutative) factor application sequence via phi-sampled permutations + cross-entropy optimization, guards the corner-law catastrophe (izanagi-bridge vertex enumeration), degenerate-case short-circuits to the classical order-blind combination when all factors commute, and records circuit-quality ΔU through the energy gate.
// @use: when combining 2+ alpha factors and the application ORDER matters (non-commuting projectors) — reach here instead of a naive equal-weight blend; it proves whether a quantum (order-aware) advantage actually exists (circuitQuality ratio > 1) and refuses to fake one when factors commute.
// @exports: factorVector, commutatorNorm, buildCommutativityMatrix, lehmerDecode, sampleOrderings, scoreOrdering, robustOptimalOrdering, buildCircuitDAG, cornerGuard, flipConditions, schmidtCoupling, productJointState, circuitQuality, recordCircuitEnergy, optimizeFactorCircuit
/**
 * factor-circuit.mjs — AFL Phase-2 quantum sequencing engine (the MOAT).
 *
 * DESIGN (afl-organ-design §4, validated by afl-quantum-validation):
 *   Each factor -> a rank-1 projector P_i = |v_i><v_i| in R^N where v_i is a DETERMINISTIC
 *   feature vector derived from the factor's METADATA (category one-hot + correlation_cluster
 *   + data_inputs multi-hot + sharpe_tier ordinal), normalized. Reproducible, not random.
 *
 *   >>> PHASE-3+ NOTE: This synthetic metadata embedding is a STAND-IN. When real market data
 *       lands, v_i is replaced by the factor's actual return/exposure vector (e.g. the factor's
 *       cross-sectional return series projected onto its principal directions). The quantum
 *       sequencing machinery (projectors, commutators, ordering optimization, DAG, corner guard,
 *       energy ΔU) is IDENTICAL — only the source of v_i changes. Document at the call site when
 *       you swap embeddings so the commutativity structure can be re-validated against live data.
 *
 *   Applying factors is ORDER-DEPENDENT: |psi_out> = P_{σ(k)}...P_{σ(1)}|psi>; the jointProbability
 *   ||P_{σ(k)}...P_{σ(1)}|psi>||^2 measures the factor combination's "resonance" with the state.
 *   Validation: ordering effect reached 1,134,061x best/worst; only ~11% of pairs commute; some
 *   orderings annihilate the state (score 0).
 *
 *   DEGENERATE CASE (validation FM-1, MANDATORY): if ALL pairwise commutators < tol, the factors
 *   commute — order is irrelevant — so SKIP quantum sequencing and return the classical
 *   order-independent combination. No faked quantum advantage.
 *
 *   CORNER LAW (izanagi-bridge, NOT optional for 3+ factors): an affine/multilinear objective's
 *   worst case sits at a VERTEX of the uncertainty box, which interior sampling hits with
 *   probability 0. cornerGuard enumerates the corners; the interior can look smooth while a
 *   corner hides catastrophe (state annihilation under a worst-case psi orientation).
 *
 *   circuitQuality = quantumScore / classicalScore (>1 = real quantum advantage); recorded as a
 *   ΔU trace via energy-tick-core.
 *
 * Pure live primitives — proven in afl-validation.mjs:
 *   quantum-hypothesis-tracker.mjs : matMul, projector, stateVector, measureSequential,
 *                                    schmidtDecomposition, normalize, add, scale, dot
 *   math/yuri-phi.mjs              : phiSequence (anti-resonant low-discrepancy 1-D spread)
 *   decision-sim.mjs              : crossEntropyOptimize, robustScore, makeRng
 *   izanagi-bridge.mjs            : cornerAwareReadout, flipThresholds, vertices
 *   energy-tick-core.mjs          : freshState, tickAndTrace
 *
 * HARD CONSTRAINTS (YURI-OS): ESM .mjs, fileURLToPath for paths, no commit/push, no protected
 * paths. Writes only this file. Advisory until local evidence verifies it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  matMul, projector, stateVector, measureSequential, schmidtDecomposition, normalize,
} from '../quantum-hypothesis-tracker.mjs';
import { phiSequence } from '../math/yuri-phi.mjs';
import { crossEntropyOptimize } from '../decision-sim.mjs';
import { cornerAwareReadout, flipThresholds } from '../izanagi-bridge.mjs';
import { freshState, tickAndTrace } from '../energy-tick-core.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

// ───────────────────────────────────────────────────────────────────────────
// §1 — DETERMINISTIC FACTOR FEATURE VECTOR (the synthetic embedding)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Hilbert-space dimension. N=16 layout:
 *   [0..7]   category one-hot over the 8 canonical AFL categories (CATEGORY_SLOTS),
 *            with an overflow bucket (slot 7) for any unrecognized category.
 *   [8..11]  correlation_cluster hashed into 4 buckets (cluster identity → resonance grouping).
 *   [12..14] data_inputs multi-hot hashed into 3 buckets (shared data sources → coupling).
 *   [15]     sharpe_tier ordinal (low=0.33, medium=0.66, high=1.0) — a continuous quality axis.
 * Then L2-normalized. Two factors that share category + cluster + inputs land near-parallel
 * (their projectors nearly commute); factors across categories/clusters get angle separation
 * (non-commuting), which is exactly the structure the quantum sequencer exploits.
 */
export const N = 16;

const CATEGORY_SLOTS = Object.freeze({
  momentum: 0, trend: 1, volatility: 2, volume: 3,
  value: 4, quality: 5, 'mean-reversion': 6,
  // slot 7 = overflow / unrecognized
});
const CATEGORY_OVERFLOW = 7;
const CLUSTER_BASE = 8;   // slots 8..11
const CLUSTER_SLOTS = 4;
const INPUT_BASE = 12;    // slots 12..14
const INPUT_SLOTS = 3;
const TIER_SLOT = 15;

const TIER_ORDINAL = Object.freeze({ low: 1 / 3, medium: 2 / 3, high: 1.0 });

/** Deterministic non-negative string hash (djb2). */
function strHash(s) {
  let h = 5381;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/**
 * factorVector(factor) -> deterministic NORMALIZED feature vector in R^N (N=16).
 * Derived ONLY from metadata (category / correlation_cluster / data_inputs / sharpe_tier).
 * Same factor metadata ⇒ byte-identical vector (reproducible, never random). Returns a zero
 * vector ONLY if every feature is absent (degenerate; the caller's projector would be all-zero).
 */
export function factorVector(factor) {
  const f = (factor && typeof factor === 'object') ? factor : {};
  const v = new Array(N).fill(0);

  // category one-hot (overflow bucket for unknowns)
  const cat = typeof f.category === 'string' ? f.category.toLowerCase() : '';
  const catSlot = Object.prototype.hasOwnProperty.call(CATEGORY_SLOTS, cat)
    ? CATEGORY_SLOTS[cat] : CATEGORY_OVERFLOW;
  v[catSlot] += 1.0;

  // correlation_cluster -> one of 4 buckets (weighted below the category so identity dominates)
  if (f.correlation_cluster) {
    const b = CLUSTER_BASE + (strHash(f.correlation_cluster) % CLUSTER_SLOTS);
    v[b] += 0.7;
  }

  // data_inputs multi-hot -> 3 buckets (shared inputs ⇒ coupling)
  const inputs = Array.isArray(f.data_inputs) ? f.data_inputs : [];
  for (const inp of inputs) {
    const b = INPUT_BASE + (strHash(inp) % INPUT_SLOTS);
    v[b] += 0.5;
  }

  // sharpe_tier ordinal — a graded quality axis
  const tier = typeof f.sharpe_tier === 'string' ? f.sharpe_tier.toLowerCase() : '';
  v[TIER_SLOT] += TIER_ORDINAL[tier] ?? 0;

  // normalize() returns the zero vector when ‖v‖ < tol — preserved intentionally.
  return normalize(v);
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — COMMUTATOR NORM + COMMUTATIVITY MATRIX
// ───────────────────────────────────────────────────────────────────────────

/** Frobenius norm of the matrix difference ‖A − B‖_F. */
function frobeniusNorm(A, B) {
  let s = 0;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++)
      s += (A[i][j] - B[i][j]) ** 2;
  return Math.sqrt(s);
}

/**
 * commutatorNorm(P_i, P_j) -> Frobenius ‖P_i·P_j − P_j·P_i‖_F.
 * 0 ⇒ the projectors commute (order irrelevant); > tol ⇒ non-commuting (order matters).
 * Identical definition to afl-validation.mjs's local commutatorNorm (the proven reference).
 */
export function commutatorNorm(P_i, P_j) {
  return frobeniusNorm(matMul(P_i, P_j), matMul(P_j, P_i));
}

/**
 * buildCommutativityMatrix(factors, {tol}) ->
 *   { matrix, commutingPairs, nonCommutingPairs, allCommute, classes, projectors, vectors }
 * matrix[i][j] = commutatorNorm. classes = union-find equivalence classes over the COMMUTING
 * relation (factors that mutually commute can be applied in any order ⇒ collapse into a class).
 *
 * NOTE on tol: rank-1 projector commutators in R^N are tiny even for moderately separated
 * directions; the validation reference used ~0.15 as an *approximate* commutativity band. The
 * default here (1e-9) is the STRICT mathematical threshold — pass a larger tol (e.g. 0.15) to
 * treat near-commuting same-category factors as commuting for the degenerate short-circuit.
 */
export function buildCommutativityMatrix(factors, { tol = 1e-9 } = {}) {
  const fs = Array.isArray(factors) ? factors : [];
  const n = fs.length;
  const vectors = fs.map(factorVector);
  const projectors = vectors.map(projector);

  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cn = commutatorNorm(projectors[i], projectors[j]);
      matrix[i][j] = cn;
      matrix[j][i] = cn;
    }
  }

  const commutingPairs = [];
  const nonCommutingPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rec = { i, j, idA: fs[i]?.id ?? i, idB: fs[j]?.id ?? j, norm: matrix[i][j] };
      if (matrix[i][j] < tol) commutingPairs.push(rec);
      else nonCommutingPairs.push(rec);
    }
  }
  // allCommute is meaningful only for n>=2; a 0/1-factor set is trivially order-blind.
  const allCommute = n < 2 ? true : nonCommutingPairs.length === 0;

  // Union-find equivalence classes over the COMMUTING relation.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const p of commutingPairs) union(p.i, p.j);
  const classMap = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!classMap.has(r)) classMap.set(r, []);
    classMap.get(r).push(fs[i]?.id ?? i);
  }
  const classes = [...classMap.values()];

  return {
    matrix, commutingPairs, nonCommutingPairs, allCommute, classes, projectors, vectors,
    commutingFraction: (commutingPairs.length + nonCommutingPairs.length) > 0
      ? commutingPairs.length / (commutingPairs.length + nonCommutingPairs.length) : 1,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — LEHMER CODE (rank ↔ permutation bijection) + PHI-SAMPLED ORDERINGS
// ───────────────────────────────────────────────────────────────────────────

function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

/**
 * lehmerDecode(index, n) -> permutation array of [0..n-1].
 * Factorial-number-system bijection: rank in [0, n!) ↦ a unique permutation. Same as the
 * afl-validation reference. index is clamped into [0, n!) (mod n!) so any phi/CE value maps.
 */
export function lehmerDecode(index, n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`lehmerDecode: n must be a non-negative integer, got ${n}`);
  // Finite-index guard (peer-review/Mimo fix): a NaN/Infinity index would survive the modulo wrap as
  // NaN and silently produce a permutation of NaN — poisoning scoreOrdering → measureSequential →
  // the CE optimizer's elite selection with a NaN jointProbability. Fail loud instead.
  if (!Number.isFinite(index)) throw new Error(`lehmerDecode: index must be finite, got ${index}`);
  if (n === 0) return [];
  const total = factorial(n);
  // Bijection domain is [0, n!); wrap so phi/CE samples always land in range.
  let remaining = ((Math.floor(index) % total) + total) % total;
  const available = Array.from({ length: n }, (_, i) => i);
  const perm = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = factorial(n - 1 - i);
    const idx = Math.floor(remaining / f);
    remaining %= f;
    perm[i] = available[idx];
    available.splice(idx, 1);
  }
  return perm;
}

/**
 * sampleOrderings(n, sampleCount) -> permutations[] via phiSequence + lehmerDecode.
 * phiSequence gives an anti-resonant (three-distance) low-discrepancy 1-D spread in [0,1); each
 * sample maps to a permutation rank via Lehmer decode. For large n the perm space (n!) is huge,
 * so this is quasi-uniform sampling, NOT enumeration. De-duplicates collisions and, when
 * sampleCount >= n! (small n), falls back to FULL enumeration so nothing is missed.
 * CONTRACT: returns AT MOST min(sampleCount, n!) distinct orderings — under heavy Lehmer collision
 * it may return fewer than sampleCount; callers must read `.length`, not assume sampleCount.
 */
export function sampleOrderings(n, sampleCount) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`sampleOrderings: n must be a non-negative integer, got ${n}`);
  if (n === 0) return [];
  if (n === 1) return [[0]];
  const total = factorial(n);
  const want = Math.max(1, Math.floor(sampleCount) || 1);

  // Small space: enumerate exactly (validation used brute force at 5!).
  if (want >= total || total <= 64) {
    return Array.from({ length: total }, (_, idx) => lehmerDecode(idx, n));
  }

  const seen = new Set();
  const out = [];
  // ONE consistent low-discrepancy stream, over-requested (4x) so Lehmer collisions are absorbed by
  // the SAME phiSequence rather than a hand-rolled recurrence. (peer-review/Mimo fix: the old top-up
  // reimplemented the golden-ratio recurrence with a different offset — a fragile coupling to
  // phiSequence's internals that broke the low-discrepancy guarantee if phiSequence ever changed.)
  const phis = phiSequence(want * 4);
  for (const phiVal of phis) {
    if (out.length >= want) break;
    const idx = Math.floor(phiVal * total);
    const perm = lehmerDecode(idx, n);
    const key = perm.join(',');
    if (!seen.has(key)) { seen.add(key); out.push(perm); }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — SCORE AN ORDERING (sequential measurement)
// ───────────────────────────────────────────────────────────────────────────

/**
 * scoreOrdering(orderingPerm, projectors, psi) -> jointProbability.
 * Applies P_{σ(k)}...P_{σ(1)}|psi> via measureSequential and returns ‖result‖² — the resonance
 * of this factor ordering with the state. The order of multiplication follows the perm left→right
 * (σ(0) applied first), matching the afl-validation reference: ordered = perm.map(i => proj[i]).
 */
export function scoreOrdering(orderingPerm, projectors, psi) {
  if (!Array.isArray(orderingPerm)) throw new Error('scoreOrdering: orderingPerm must be an array');
  const ordered = orderingPerm.map((i) => projectors[i]);
  const { jointProbability } = measureSequential(ordered, psi);
  return jointProbability;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — ROBUST OPTIMAL ORDERING (cross-entropy over sampled perms × state angle)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a default state vector ψ in R^N. Deterministic, anti-resonant via phiSequence so it is
 * not axis-aligned with any single projector (an axis-aligned ψ trivially annihilates under
 * orthogonal factors). Reproducible.
 */
export function defaultPsi(dim = N) {
  const comps = phiSequence(dim).map((p, i) => (p - 0.5) + 0.05 * Math.cos(i)); // spread, non-zero
  const sv = stateVector(comps);
  // stateVector normalizes; if it ever returned all-zero (impossible here), fall back to e_0.
  return sv.some((x) => x !== 0) ? sv : stateVector(Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0)));
}

/**
 * Rotate ψ by a small "state-uncertainty angle" theta in the plane (e_a, e_b) deterministically.
 * Models that the true market state ψ is not known exactly — the optimal ordering should be
 * robust to a band of plausible ψ orientations, which is what the CE continuous axis explores.
 */
function rotatePsi(psi, theta) {
  const v = psi.slice();
  const a = 0, b = 1 % v.length;
  if (a === b) return v;
  const ca = Math.cos(theta), sa = Math.sin(theta);
  const va = v[a], vb = v[b];
  v[a] = ca * va - sa * vb;
  v[b] = sa * va + ca * vb;
  return normalize(v);
}

/**
 * robustOptimalOrdering(projectors, opts) ->
 *   { bestOrdering, score, ceResult, sampledCount, problem }
 * Builds a decision-sim crossEntropyOptimize problem:
 *   discrete.ordering = the phi-sampled permutations (quasi-uniform anti-resonant coverage),
 *   continuous.theta  = a state-uncertainty angle [0, 2π) perturbing ψ,
 *   value(config, params) = jointProbability of config.ordering applied to ψ rotated by theta.
 * CE finds the ordering whose resonance is robust (CVaR-scored) across the ψ-angle band, not just
 * peaked at one orientation. Returns the best ordering + its nominal (theta=0) score.
 */
export function robustOptimalOrdering(projectors, opts = {}) {
  const {
    sampleCount = 200, draws = 100, iters = 5, seed = 42, pop = 50, elite = 8,
    psi: psiIn,
  } = opts;
  const dim = projectors.length ? projectors[0].length : N;
  const n = projectors.length;
  if (n < 1) return { bestOrdering: [], score: 0, ceResult: null, sampledCount: 0, problem: null };
  if (n === 1) {
    const psi = psiIn || defaultPsi(dim);
    return { bestOrdering: [0], score: scoreOrdering([0], projectors, psi), ceResult: null, sampledCount: 1, problem: null };
  }

  const psi = psiIn || defaultPsi(dim);
  const orderings = sampleOrderings(n, sampleCount);
  // Deterministic baseline = the IDENTITY ordering (factors in natural index order). Used by the flip
  // analysis as the do-nothing reference. (peer-review/DeepSeek fix: the old nullValue used
  // orderings[0], which only *happens* to be identity because phiSequence[0]==0 — an implicit, fragile
  // coupling that would silently become an accidental random permutation if the sampler ever changed.)
  const nullOrdering = projectors.map((_, i) => i);

  const problem = {
    name: 'factor-circuit-ordering',
    discrete: { ordering: orderings },
    continuous: { theta: [0, 2 * Math.PI] },
    paramSpace: { theta: [0, 2 * Math.PI] },
    sampleParams(rng) { return { theta: rng() * 2 * Math.PI }; },
    value(config, params) {
      // config.ordering is one of the sampled permutation arrays.
      const perm = Array.isArray(config.ordering) ? config.ordering : orderings[0];
      const rotated = rotatePsi(psi, params.theta);
      return scoreOrdering(perm, projectors, rotated);
    },
    // NULL = the IDENTITY ordering's score under the same psi (deterministic baseline for flip rules).
    nullValue(config, params) {
      const rotated = rotatePsi(psi, params.theta);
      return scoreOrdering(nullOrdering, projectors, rotated);
    },
  };

  const ceResult = crossEntropyOptimize(problem, { draws, iters, pop, elite, seed });
  const bestOrdering = (ceResult.best && Array.isArray(ceResult.best.ordering))
    ? ceResult.best.ordering
    : orderings[0];
  // Report the NOMINAL (theta=0) jointProbability of the chosen ordering — the headline score.
  const score = scoreOrdering(bestOrdering, projectors, psi);

  return { bestOrdering, score, ceResult, sampledCount: orderings.length, problem };
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — CIRCUIT DAG (parallel commuting / sequenced non-commuting)
// ───────────────────────────────────────────────────────────────────────────

/**
 * buildCircuitDAG(commMatrix, optimalOrdering, {tol}) -> { nodes, edges, acyclic }.
 * Nodes = factor indices in the order they appear in optimalOrdering. An edge u->w is added ONLY
 * for a NON-commuting pair (commutator >= tol) and points in the direction the optimal ordering
 * applies them (earlier-applied -> later-applied). Commuting pairs get NO edge (parallel). Because
 * every edge follows the strict ordering position, the result is a DAG (acyclic by construction).
 */
export function buildCircuitDAG(commMatrix, optimalOrdering, { tol = 1e-9 } = {}) {
  const matrix = (commMatrix && Array.isArray(commMatrix.matrix)) ? commMatrix.matrix
    : (Array.isArray(commMatrix) ? commMatrix : []);
  const order = Array.isArray(optimalOrdering) ? optimalOrdering : [];
  const pos = new Map(order.map((idx, p) => [idx, p])); // factor index -> ordering position

  const nodes = order.map((idx, p) => ({ index: idx, position: p }));
  const edges = [];
  for (let p = 0; p < order.length; p++) {
    for (let q = p + 1; q < order.length; q++) {
      const u = order[p], w = order[q];
      const cn = (matrix[u] && Number.isFinite(matrix[u][w])) ? matrix[u][w] : 0;
      if (cn >= tol) {
        // non-commuting → ordering matters → directed edge earlier->later
        edges.push({ from: u, to: w, commutator: cn, reason: 'non-commuting' });
      }
      // commuting (cn < tol) → no edge → parallel
    }
  }
  // Acyclic by construction (every edge respects the strict position order); assert it cheaply.
  const acyclic = edges.every((e) => pos.get(e.from) < pos.get(e.to));
  return { nodes, edges, acyclic, parallelizable: edges.length < (order.length * (order.length - 1)) / 2 };
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — CORNER-LAW GUARD + FLIP CONDITIONS (izanagi-bridge)
// ───────────────────────────────────────────────────────────────────────────

/**
 * cornerGuard(problem, config, opts) -> robustness verdict (worst case across the ψ-uncertainty band).
 * The objective here (jointProbability of an ordering vs a ψ-ROTATION angle θ) is PERIODIC and
 * QUADRATIC in ψ — NOT affine/multilinear — so the corner law (worst case at a box vertex) does NOT
 * apply: the two endpoints of a periodic axis [0,2π] are the IDENTICAL state, making vertex
 * enumeration a vacuous, false-safety guard. The correct instrument is a DENSE worst-case scan over
 * the band (periodicity-respecting — the duplicate endpoint is omitted). That is the primary verdict;
 * izanagi's cornerAwareReadout is retained as a clearly-labeled `affineVertexReadout`, valid ONLY for
 * an affine objective over a genuine box (e.g. a future component-perturbation uncertainty set).
 * (red-team fix: periodic single-axis vertices are identical → the corner law could not see the worst case.)
 */
export function cornerGuard(problem, config, opts = {}) {
  if (!problem || typeof problem.value !== 'function') {
    throw new Error('cornerGuard: problem with value() required (use robustOptimalOrdering().problem)');
  }
  const samples = Math.max(8, opts.samples || 256);
  const space = problem.continuous || problem.paramSpace || {};
  const axisKey = Object.keys(space)[0] || 'theta';
  const [lo, hi] = Array.isArray(space[axisKey]) ? space[axisKey] : [0, 2 * Math.PI];
  let worstCase = Infinity, worstAt = lo, bestCase = -Infinity, bestAt = lo;
  for (let k = 0; k < samples; k++) {
    const t = lo + (hi - lo) * (k / samples); // omit the duplicate periodic endpoint (k/samples, not /(samples-1))
    const val = problem.value(config, { [axisKey]: t });
    if (val < worstCase) { worstCase = val; worstAt = t; }
    if (val > bestCase) { bestCase = val; bestAt = t; }
  }
  const nominal = problem.value(config, { [axisKey]: lo });
  let affineVertexReadout = null;
  try { affineVertexReadout = cornerAwareReadout(problem, [config], opts); }
  catch (e) { affineVertexReadout = { error: String((e && e.message) || e) }; }
  return {
    method: 'dense-periodic-scan',
    axis: axisKey, samples, range: [lo, hi],
    worstCase, worstAt, bestCase, bestAt, nominal,
    robust: worstCase > 0, // the ordering never annihilates the signal anywhere in the uncertainty band
    drawdownFromNominal: nominal > 0 ? (nominal - worstCase) / nominal : null,
    affineVertexReadout, // izanagi vertex readout — AFFINE-objective-only, kept labeled (not the guard here)
  };
}

/**
 * flipConditions(problem, config) -> flipThresholds result (per-axis human-readable failure rules).
 * "this ordering's advantage over the baseline crosses zero when theta <,> t". Requires
 * problem.nullValue (robustOptimalOrdering attaches one).
 */
export function flipConditions(problem, config, opts = {}) {
  if (!problem || typeof problem.nullValue !== 'function') {
    throw new Error('flipConditions: problem.nullValue required (use robustOptimalOrdering().problem)');
  }
  return flipThresholds(problem, config, opts);
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — SCHMIDT COUPLING (are two factors entangled?)
// ───────────────────────────────────────────────────────────────────────────

/**
 * schmidtCoupling(psiAB, m, n) -> { rank, entangled, singularValues }.
 * FAITHFUL Schmidt rank of a GENUINE bipartite joint state psiAB (length m*n) via schmidtDecomposition.
 * rank 1 ⇒ separable/product (subsystems UNCOUPLED); rank > 1 ⇒ entangled (COUPLED). No synthetic
 * entangling term — the caller supplies the real joint state. A plain tensor product a⊗b of two
 * independent factor vectors is ALWAYS rank 1 (use productJointState for that uncoupled baseline);
 * genuine factor coupling comes from a correlated joint distribution (Phase-3 real returns). For the
 * order-sensitivity sense of "coupled", commutatorNorm is the direct measure.
 * (red-team fix: the old hardcoded +0.3 diagonal forced rank>=2 for any dim>=2 — it could never
 * discriminate a product from an entangled state; ALWAYS reported "entangled".)
 */
export function schmidtCoupling(psiAB, m, n) {
  const v = Array.isArray(psiAB) ? psiAB : [];
  if (!Number.isInteger(m) || !Number.isInteger(n) || m < 1 || n < 1) {
    throw new Error('schmidtCoupling(psiAB, m, n): integer subsystem dims m,n required');
  }
  if (v.length !== m * n) {
    throw new Error(`schmidtCoupling: joint state length ${v.length} != m*n (${m}*${n})`);
  }
  const sd = schmidtDecomposition(normalize(v), m, n);
  return { rank: sd.rank, entangled: sd.rank > 1, singularValues: sd.singularValues };
}

/** productJointState(a, b) -> flattened outer product a⊗b — the UNCOUPLED baseline (always Schmidt rank 1). */
export function productJointState(a, b) {
  const out = new Array(a.length * b.length);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i * b.length + j] = a[i] * b[j];
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// §9 — CIRCUIT QUALITY (quantum vs classical) + ENERGY ΔU
// ───────────────────────────────────────────────────────────────────────────

/**
 * meanProjectorScore — the order-blind single-shot baseline: average the factor projectors into one
 * matrix and apply it ONCE to ψ. Returns ‖(meanP)ψ‖². This is the DEGENERATE answer used when all
 * factors commute (order is irrelevant, so one combined application is the whole story). It is NOT a
 * fair comparator for an order-DEPENDENT sequence (a single projection vs a k-fold product), so it is
 * reported as a diagnostic field, never as the advantage denominator. (red-team fix: the original
 * circuitQuality divided a k-fold sequential product by this single-shot score → ratio<1 by
 * construction, falsely labeling every real circuit a "disadvantage".)
 */
export function meanProjectorScore(projectors, psi) {
  const n = projectors.length;
  if (n === 0) return 0;
  const dim = projectors[0].length;
  const mean = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const P of projectors)
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++)
        mean[i][j] += P[i][j] / n;
  const { jointProbability } = measureSequential([mean], psi);
  return jointProbability;
}

/**
 * meanOrderingScore — the HONEST classical baseline for an order-dependent sequence: the expected
 * jointProbability of applying the factors in a RANDOM order, i.e. the mean sequential score over
 * all (or sampled) orderings. This is exactly "what you get if you don't bother optimizing the
 * order." The quantum advantage is best-ordering / this-mean: how much the sequencer lifts the
 * circuit above a naive arbitrary order. Same units as quantumScore (both are k-fold sequential
 * products), so the ratio is dimensionally fair.
 */
export function meanOrderingScore(projectors, psi, opts = {}) {
  const n = projectors.length;
  if (n === 0) return 0;
  if (n === 1) return scoreOrdering([0], projectors, psi);
  const sampleCount = opts.sampleCount ?? 200;
  const orderings = sampleOrderings(n, sampleCount);
  let sum = 0;
  for (const perm of orderings) sum += scoreOrdering(perm, projectors, psi);
  return sum / orderings.length;
}

/**
 * circuitQuality(optimalOrderedProjectors, classicalProjectors, psi) ->
 *   { quantumScore, classicalScore, meanProjectorScore, ratio, deltaU }.
 *   quantumScore       = jointProbability of the OPTIMAL sequence (optimalOrderedProjectors is
 *                        already in applied order ⇒ measured with the identity permutation),
 *   classicalScore     = meanOrderingScore = expected jointProbability of a RANDOM order over the
 *                        SAME factor set (the honest order-agnostic baseline; same k-fold units),
 *   meanProjectorScore = the order-blind single-shot mean-projector diagnostic (NOT the denominator),
 *   ratio              = quantumScore / classicalScore (>1 ⇒ the optimal ordering genuinely beats a
 *                        naive arbitrary order — the real, dimensionally-fair quantum advantage),
 *   deltaU             = -log(ratio): advantage (ratio>1) ⇒ ΔU<0 (descent/progress); no lift
 *                        (ratio≤1) ⇒ ΔU≥0 (ascent). Matches the energy landscape (descent = healthy).
 */
export function circuitQuality(optimalOrderedProjectors, classicalProjectors, psi, opts = {}) {
  const opt = Array.isArray(optimalOrderedProjectors) ? optimalOrderedProjectors : [];
  const cls = Array.isArray(classicalProjectors) ? classicalProjectors : [];
  const idPerm = opt.map((_, i) => i);
  const quantumScore = opt.length ? scoreOrdering(idPerm, opt, psi) : 0;
  const classicalScore = meanOrderingScore(cls, psi, opts);        // order-averaged sequential mean
  const meanProj = meanProjectorScore(cls, psi);                   // single-shot diagnostic only
  const safeC = classicalScore > 1e-30 ? classicalScore : 1e-30;
  const ratio = quantumScore / safeC;
  const deltaU = -Math.log(ratio > 1e-30 ? ratio : 1e-30);
  return { quantumScore, classicalScore, meanProjectorScore: meanProj, ratio, deltaU };
}

/**
 * recordCircuitEnergy(beforeState, quality) -> the tickAndTrace result (a ΔU trace entry).
 * Constructs the EVENT shape energy-tick-core expects (a Claude-Code-style tool event). A real
 * quantum advantage (quality.ratio > 1) is HEALTHY progress → modeled as a successful Bash
 * "verification" event (iota evidence credit, ΔU↓); a quantum DISadvantage (ratio <= 1) is a
 * failed verification (ΔU↑). The circuit-quality ratio is what we are recording as the work's ΔU.
 * Never throws — wraps the tick so a trace I/O fault can't break the optimizer.
 */
export function recordCircuitEnergy(beforeState, quality, opts = {}) {
  const before = (beforeState && typeof beforeState === 'object') ? beforeState : freshState();
  const advantage = !!(quality && Number.isFinite(quality.ratio) && quality.ratio > 1);
  const event = {
    tool_name: 'Bash',
    tool_input: { command: `factor-circuit: circuitQuality ratio=${quality?.ratio?.toFixed?.(6) ?? 'n/a'}` },
    tool_response: { is_error: !advantage }, // advantage = passing verification; disadvantage = failure
  };
  try {
    const res = tickAndTrace(before, event, {
      runId: opts.runId || `factor-circuit-${Date.now()}`,
      depth: opts.depth ?? 0,
      recentAbs: opts.recentAbs ?? [],
      recentSigned: opts.recentSigned ?? [],
      // Keep the energy gate's enforce path inert here: this is a recording, not a session mutation.
    });
    return { ...res, advantage, circuitRatio: quality?.ratio ?? null };
  } catch (err) {
    return { traced: false, advantage, circuitRatio: quality?.ratio ?? null, error: String(err && err.message || err), state: before };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// §10 — END-TO-END ORCHESTRATION
// ───────────────────────────────────────────────────────────────────────────

/**
 * optimizeFactorCircuit(factors, opts) ->
 *   { allCommute, bestOrdering, dag, quality, corner, flips, commMatrix, classes, degenerate, psi }
 *
 * Pipeline:
 *   1. buildCommutativityMatrix(factors, {tol})
 *   2. DEGENERATE SHORT-CIRCUIT (validation FM-1): if allCommute, return the classical
 *      order-blind combination, allCommute:true, degenerate:true — DO NOT run the quantum
 *      optimizer (no faked advantage).
 *   3. Otherwise: robustOptimalOrdering → buildCircuitDAG → cornerGuard (corner law, 3+ factors)
 *      → flipConditions → circuitQuality → recordCircuitEnergy.
 */
export function optimizeFactorCircuit(factors, opts = {}) {
  const {
    tol = 1e-9, psi: psiIn, sampleCount = 200, draws = 100, iters = 5, seed = 42,
    energyBefore, recordEnergy = true,
  } = opts;
  const fs = Array.isArray(factors) ? factors : [];
  const commMatrix = buildCommutativityMatrix(fs, { tol });
  const projectors = commMatrix.projectors;
  const dim = projectors.length ? projectors[0].length : N;
  const psi = psiIn || defaultPsi(dim);

  // ── DEGENERATE SHORT-CIRCUIT (FM-1): all factors commute ⇒ order is irrelevant. ──
  if (commMatrix.allCommute) {
    // Order-blind: every ordering yields the same sequential score, so the order-averaged baseline
    // IS the answer. Report it for both quantum and classical → ratio 1, ΔU 0 (no advantage to fake).
    const classicalScore = meanOrderingScore(projectors, psi, { sampleCount });
    const identityOrdering = fs.map((_, i) => i);
    const quality = {
      quantumScore: classicalScore,   // no sequencing advantage available
      classicalScore,
      meanProjectorScore: meanProjectorScore(projectors, psi),
      ratio: 1,                        // by construction — order-blind == best
      deltaU: 0,
    };
    return {
      allCommute: true,
      degenerate: true,
      bestOrdering: identityOrdering,
      classicalOrdering: identityOrdering,
      dag: { nodes: identityOrdering.map((index, position) => ({ index, position })), edges: [], acyclic: true, parallelizable: true },
      quality,
      corner: null,   // no quantum optimizer ⇒ no corner law to guard
      flips: null,
      commMatrix,
      classes: commMatrix.classes,
      psi,
      note: 'All factor projectors commute (< tol) — classical order-independent combination used; quantum sequencing skipped (validation FM-1 degenerate-case guard).',
    };
  }

  // ── QUANTUM PATH: factors are non-commuting ⇒ order matters. ──
  const { bestOrdering, score, ceResult, problem } = robustOptimalOrdering(projectors, {
    sampleCount, draws, iters, seed, psi,
  });

  const dag = buildCircuitDAG(commMatrix, bestOrdering, { tol });

  // Corner law is mandatory for 3+ factors; cheap and harmless for 2, so always run when we have a problem.
  let corner = null, flips = null;
  if (problem) {
    try { corner = cornerGuard(problem, { ordering: bestOrdering }); } catch (e) { corner = { error: String(e.message || e) }; }
    try { flips = flipConditions(problem, { ordering: bestOrdering }); } catch (e) { flips = { error: String(e.message || e) }; }
  }

  // circuitQuality: optimal SEQUENCE vs order-blind classical. The optimal-ordered projector list
  // is the projectors permuted by bestOrdering (so it is measured with the identity permutation).
  const optimalOrderedProjectors = bestOrdering.map((i) => projectors[i]);
  const quality = circuitQuality(optimalOrderedProjectors, projectors, psi, { sampleCount });

  let energy = null;
  if (recordEnergy) {
    energy = recordCircuitEnergy(energyBefore || freshState(), quality, { runId: opts.runId });
  }

  return {
    allCommute: false,
    degenerate: false,
    bestOrdering,
    bestOrderingScore: score,
    ceResult,
    dag,
    quality,
    corner,
    flips,
    energy,
    commMatrix,
    classes: commMatrix.classes,
    psi,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §11 — SMOKE TEST (node factor-circuit.mjs --smoke)
// ───────────────────────────────────────────────────────────────────────────

async function smoke() {
  const out = { tests: {} };

  // Dynamic import so the store dep loads only when actually smoke-testing.
  const { getFactor } = await import('./alpha-factor-store.mjs');

  // (a) 2-factor NON-COMMUTING pair shows an ordering effect: A->B != B->A jointProbability.
  {
    // Pick two factors from DIFFERENT categories/clusters so their projectors don't commute.
    const fA = { id: 'synthA', category: 'momentum', correlation_cluster: 'MOM-X', data_inputs: ['close'], sharpe_tier: 'high' };
    const fB = { id: 'synthB', category: 'volatility', correlation_cluster: 'VOL-Y', data_inputs: ['high', 'low'], sharpe_tier: 'low' };
    const cm = buildCommutativityMatrix([fA, fB], { tol: 1e-9 });
    const psi = defaultPsi(N);
    const sAB = scoreOrdering([0, 1], cm.projectors, psi);
    const sBA = scoreOrdering([1, 0], cm.projectors, psi);
    out.tests.a_orderingEffect = {
      commutatorNorm: +cm.matrix[0][1].toFixed(10),
      nonCommuting: cm.matrix[0][1] >= 1e-9,
      scoreAB: +sAB.toFixed(10),
      scoreBA: +sBA.toFixed(10),
      orderMatters: Math.abs(sAB - sBA) > 1e-12,
      ratio: +(Math.max(sAB, sBA) / (Math.min(sAB, sBA) || 1e-30)).toFixed(4),
    };
  }

  // (b) buildCommutativityMatrix on 5 seeded REAL factors returns a matrix + classes.
  {
    const ids = ['accruals', 'altman-z-score', 'amihud-illiquidity', 'book-to-market', 'chaikin-ad-line'];
    const factors = ids.map(getFactor).filter(Boolean);
    const usedIds = factors.map((f) => f.id);
    const cm = buildCommutativityMatrix(factors, { tol: 1e-9 });
    out.tests.b_commMatrix5 = {
      usedIds,
      matrixSize: `${cm.matrix.length}x${cm.matrix[0]?.length ?? 0}`,
      commutingPairs: cm.commutingPairs.length,
      nonCommutingPairs: cm.nonCommutingPairs.length,
      commutingFraction: +cm.commutingFraction.toFixed(4),
      allCommute: cm.allCommute,
      classCount: cm.classes.length,
      classes: cm.classes,
      sampleNorms: cm.nonCommutingPairs.slice(0, 3).map((p) => ({ pair: `${p.idA}|${p.idB}`, norm: +p.norm.toFixed(6) })),
    };
  }

  // (c) robustOptimalOrdering returns a valid permutation + score.
  {
    const ids = ['accruals', 'altman-z-score', 'amihud-illiquidity', 'book-to-market', 'chaikin-ad-line'];
    const factors = ids.map(getFactor).filter(Boolean);
    const cm = buildCommutativityMatrix(factors, { tol: 1e-9 });
    const r = robustOptimalOrdering(cm.projectors, { sampleCount: 200, draws: 100, iters: 5, seed: 42 });
    const n = factors.length;
    const isValidPerm = Array.isArray(r.bestOrdering)
      && r.bestOrdering.length === n
      && new Set(r.bestOrdering).size === n
      && r.bestOrdering.every((x) => Number.isInteger(x) && x >= 0 && x < n);
    out.tests.c_robustOptimal = {
      bestOrdering: r.bestOrdering,
      validPermutation: isValidPerm,
      score: +r.score.toFixed(10),
      sampledCount: r.sampledCount,
      ceTopMass: r.ceResult?.confidence?.ordering?.mass ?? null,
    };
  }

  // (d) ALL-COMMUTING synthetic set triggers the degenerate short-circuit.
  {
    // Identical metadata ⇒ identical vector ⇒ identical projector ⇒ commutator EXACTLY 0.
    const meta = { category: 'value', correlation_cluster: 'VALUE-SAME', data_inputs: ['fundamentals'], sharpe_tier: 'medium' };
    const factors = [
      { id: 'c1', ...meta }, { id: 'c2', ...meta }, { id: 'c3', ...meta },
    ];
    const cm = buildCommutativityMatrix(factors, { tol: 1e-9 });
    const result = optimizeFactorCircuit(factors, { tol: 1e-9, recordEnergy: false });
    out.tests.d_degenerate = {
      maxCommutator: +Math.max(...cm.matrix.flat()).toFixed(12),
      allCommute: result.allCommute,
      degenerate: result.degenerate,
      ranOptimizer: result.ceResult != null,           // must be false/undefined
      shortCircuited: result.degenerate === true && result.ceResult == null,
      classCount: result.classes.length,                // should collapse to 1 class
      qualityRatio: result.quality.ratio,               // 1 by construction
      cornerSkipped: result.corner === null,
    };
  }

  // (e) circuitQuality ratio computed on the non-commuting real-factor circuit.
  {
    const ids = ['accruals', 'altman-z-score', 'amihud-illiquidity', 'book-to-market', 'chaikin-ad-line'];
    const factors = ids.map(getFactor).filter(Boolean);
    const result = optimizeFactorCircuit(factors, { tol: 1e-9, recordEnergy: false });
    out.tests.e_circuitQuality = {
      allCommute: result.allCommute,
      quantumScore: +result.quality.quantumScore.toFixed(10),
      classicalScore: +result.quality.classicalScore.toFixed(10),
      ratio: +result.quality.ratio.toFixed(6),
      deltaU: +result.quality.deltaU.toFixed(6),
      quantumAdvantage: result.quality.ratio > 1,
      dagEdges: result.dag.edges.length,
      dagAcyclic: result.dag.acyclic,
      cornerMethod: result.corner?.method ?? null,
      cornerWorstCase: Number.isFinite(result.corner?.worstCase) ? +result.corner.worstCase.toFixed(8) : null,
      cornerRobust: result.corner?.robust ?? null,
    };
  }

  // (f) recordCircuitEnergy returns a trace without throwing.
  {
    const ids = ['accruals', 'altman-z-score', 'amihud-illiquidity', 'book-to-market', 'chaikin-ad-line'];
    const factors = ids.map(getFactor).filter(Boolean);
    const result = optimizeFactorCircuit(factors, { tol: 1e-9, recordEnergy: false });
    const energy = recordCircuitEnergy(freshState(), result.quality, { runId: 'smoke-f' });
    out.tests.f_recordEnergy = {
      threw: false,
      traced: energy.traced === true,
      tier: energy.tier ?? null,
      deltaU: Number.isFinite(energy.deltaU) ? +energy.deltaU.toFixed(6) : energy.deltaU ?? null,
      advantage: energy.advantage,
      verdictAccept: energy.verdict?.accept ?? null,
      error: energy.error ?? null,
    };
  }

  // Bonus: schmidtCoupling discriminates — product joint state is rank 1, Bell state is rank 2.
  {
    const prod = productJointState([1, 0], [0, 1]); // |0>|1> product => Schmidt rank 1 (uncoupled)
    const bell = [1, 0, 0, 1];                       // (|00>+|11>)/√2 => Schmidt rank 2 (entangled)
    const pr = schmidtCoupling(prod, 2, 2), be = schmidtCoupling(bell, 2, 2);
    out.tests.g_schmidt = { productRank: pr.rank, bellRank: be.rank, discriminates: pr.rank === 1 && be.rank === 2 };
  }

  console.log(JSON.stringify(out, null, 2));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--smoke')) {
    smoke().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
  } else {
    console.log('factor-circuit: AFL Phase-2 quantum sequencing engine (non-commutative factor optimizer).');
    console.log('  node factor-circuit.mjs --smoke');
    console.log('  import { optimizeFactorCircuit, buildCommutativityMatrix, ... } from "./factor-circuit.mjs"');
  }
}
