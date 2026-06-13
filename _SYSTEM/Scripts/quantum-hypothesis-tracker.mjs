// @capability: quantum-hypothesis-simulation
// @serves: quantum sim | order effect | hypothesis superposition | sequential evidence | quantum vs bayes | schmidt coupling | non-commuting evidence | question order
// @does: real-valued Hilbert-space hypothesis tracking — superposition until measurement, order-dependent sequential evidence combination, QQ-equality order-effect test, and Schmidt coupling (the cross-ref engine's coupling criterion); gated to beat classical Bayes on order-sensitive data without spurious control wins.
// @use: when evidence ORDER matters / hypotheses interfere / you need the coupling criterion — not plain order-blind Bayes.
// @exports: hypothesisPosteriors, measureSequential, qqEquality, schmidtDecomposition, bayesSequential
/**
 * quantum-hypothesis-tracker.mjs
 *
 * GATE STATUS: PASSED 2026-06-11 — `quantum-vs-bayes-benchmark.mjs` 4/4 (machinery
 * recovery exact; QQ-coincidence fraction 0.96% under the marginal-matching classical
 * family on Gallup Clinton/Gore order data; no spurious win on order-free control).
 * Caveat: the real joint cells are literature-recalled, flagged OWNER-VERIFY.
 * Wired as an instrument of probabilistic-decision-core (see its SKILL.md section).
 *
 * Quantum probability hypothesis-tracking layer for YURI's claim/pulse machinery.
 * Hypothesis superposition until evidence forces projection; order-effect-aware
 * evidence combination; Schmidt coupling test as cross-reference engine's
 * mathematical coupling criterion.
 *
 * TRADEOFF: Real-valued Hilbert space ℝ^N only — no complex numbers.
 * All phases are 0 or π (sign flips). Sufficient for real-valued hypothesis and
 * evidence projectors. Complex ℂ^N needed for full quantum interference models;
 * for YURI's claim machinery, real-valued is adequate since hypotheses and
 * evidence are naturally real-valued projections.
 *
 * PROMOTION PATH: domain-blind proof gate — must beat the classical Bayes baseline
 * on order-sensitive logged decision sequences before touching any live organ.
 *
 * @module quantum-hypothesis-tracker
 */

// ═══════════════════════════════════════════════════════════════════
// §1 — VECTOR OPERATIONS (ℝ^N)
// ═══════════════════════════════════════════════════════════════════

/** Dot product ⟨u|v⟩ in ℝ^N. */
export function dot(u, v) {
  let s = 0;
  for (let i = 0; i < u.length; i++) s += u[i] * v[i];
  return s;
}

/** Euclidean norm ‖v‖. */
export function norm(v) {
  return Math.sqrt(dot(v, v));
}

/** Scalar–vector product c·v. */
export function scale(c, v) {
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = c * v[i];
  return out;
}

/** Vector addition u + v. */
export function add(u, v) {
  const out = new Array(u.length);
  for (let i = 0; i < u.length; i++) out[i] = u[i] + v[i];
  return out;
}

/** Normalize v to unit length; returns zero vector when ‖v‖ < tol. */
export function normalize(v, tol = 1e-15) {
  const n = norm(v);
  if (n < tol) return v.map(() => 0);
  return scale(1 / n, v);
}

// ═══════════════════════════════════════════════════════════════════
// §2 — MATRIX OPERATIONS (row-major ℝ^{m×n})
// ═══════════════════════════════════════════════════════════════════

/** Matrix–vector product M|v⟩. */
export function matVec(M, v) {
  const out = new Array(M.length);
  for (let i = 0; i < M.length; i++) {
    let s = 0;
    for (let j = 0; j < v.length; j++) s += M[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

/** Matrix product A·B (m×k times k×n → m×n). */
export function matMul(A, B) {
  const m = A.length, n = B[0].length, k = B.length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let p = 0; p < k; p++)
        C[i][j] += A[i][p] * B[p][j];
  return C;
}

/** Transpose M^T. */
export function transpose(M) {
  const m = M.length, n = M[0].length;
  const T = Array.from({ length: n }, () => new Array(m));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      T[j][i] = M[i][j];
  return T;
}

/** n×n identity matrix. */
export function identity(n) {
  return Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    row[i] = 1;
    return row;
  });
}

// ═══════════════════════════════════════════════════════════════════
// §3 — STATE VECTOR & PROJECTORS
// ═══════════════════════════════════════════════════════════════════

/** Normalized state vector ψ = normalize(components). */
export function stateVector(components) {
  return normalize(components);
}

/** Rank-1 projector P = |v⟩⟨v| from unit vector v. */
export function projector(v) {
  const n = v.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => v[i] * v[j])
  );
}

/** Diagonal projector P = Σ mask[i] |e_i⟩⟨e_i| (commuting in the standard basis). */
export function diagonalProjector(mask) {
  const n = mask.length;
  return Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    row[i] = mask[i];
    return row;
  });
}

// ═══════════════════════════════════════════════════════════════════
// §4 — MEASUREMENT (projection + renormalization)
// ═══════════════════════════════════════════════════════════════════

/**
 * Apply projector P to state ψ.
 * Returns { probability: ‖Pψ‖², postState: Pψ / ‖Pψ‖ }.
 * postState is the zero vector when ‖Pψ‖² < tol.
 */
export function measure(P, psi, tol = 1e-15) {
  const projected = matVec(P, psi);
  const prob = dot(projected, projected);
  const postState = prob > tol
    ? scale(1 / Math.sqrt(prob), projected)
    : projected.map(() => 0);
  return { probability: prob, postState };
}

/**
 * Sequential projection P_k ··· P_2 P_1 |ψ⟩.
 * Returns { jointProbability: Π ‖P_i ψ_{i-1}‖², postState }.
 */
export function measureSequential(projectors, psi, tol = 1e-15) {
  let state = psi;
  let jointProb = 1;
  for (const P of projectors) {
    const { probability, postState } = measure(P, state, tol);
    jointProb *= probability;
    state = postState;
    if (jointProb < tol) break;
  }
  return { jointProbability: jointProb, postState: state };
}

/**
 * Posterior for each hypothesis after an evidence sequence.
 * Pr(Hi | E1..Ek) = ‖P_Hi P_Ek ··· P_E1 ψ‖² / ‖P_Ek ··· P_E1 ψ‖².
 * For rank-1 hypothesis projectors this reduces to |⟨Hi|ψ_post⟩|².
 */
export function hypothesisPosteriors(state, hypotheses, evidence = []) {
  let postState = state;
  for (const P of evidence) {
    const { probability, postState: ps } = measure(P, postState);
    if (probability < 1e-15) return hypotheses.map(() => 0);
    postState = ps;
  }
  return hypotheses.map(P_H => measure(P_H, postState).probability);
}

// ═══════════════════════════════════════════════════════════════════
// §5 — ORDER EFFECTS & QQ EQUALITY (Wang & Busemeyer 2013)
// ═══════════════════════════════════════════════════════════════════

/**
 * QQ equality for two yes/no questions A, B.
 * P_A, P_B are "yes" projectors; "no" is I − P.
 * Returns { p_AyBn, p_AnBy, sAB, p_ByAn, p_BnAy, sBA, qqStatistic }.
 * Quantum model guarantees qqStatistic = sAB − sBA ≈ 0.
 */
export function qqEquality(state, P_A, P_B) {
  const n = state.length;
  const I = identity(n);
  const Q_A = I.map((row, i) => row.map((v, j) => v - P_A[i][j]));
  const Q_B = I.map((row, i) => row.map((v, j) => v - P_B[i][j]));

  const applyPair = (M, N, v) => matVec(M, matVec(N, v));
  const sqNorm = v => dot(v, v);

  const p_AyBn = sqNorm(applyPair(Q_B, P_A, state));
  const p_AnBy = sqNorm(applyPair(P_B, Q_A, state));
  const sAB = p_AyBn + p_AnBy;

  const p_ByAn = sqNorm(applyPair(Q_A, P_B, state));
  const p_BnAy = sqNorm(applyPair(P_A, Q_B, state));
  const sBA = p_ByAn + p_BnAy;

  return { p_AyBn, p_AnBy, sAB, p_ByAn, p_BnAy, sBA, qqStatistic: sAB - sBA };
}

// ═══════════════════════════════════════════════════════════════════
// §6 — SCHMIDT DECOMPOSITION / COUPLING TEST
// ═══════════════════════════════════════════════════════════════════

/** One-sided Jacobi SVD for a small m×n matrix. Returns { rank, singularValues }. */
function jacobiSVD(A, m, n, tol = 1e-12) {
  const B = A.map(row => [...row]);
  const V = identity(n);
  const maxIter = 100;

  for (let iter = 0; iter < maxIter; iter++) {
    let converged = true;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let alpha = 0, beta = 0, gamma = 0;
        for (let k = 0; k < m; k++) {
          alpha += B[k][i] * B[k][i];
          beta  += B[k][j] * B[k][j];
          gamma += B[k][i] * B[k][j];
        }
        if (Math.abs(gamma) <= tol * Math.sqrt(alpha * beta)) continue;
        converged = false;

        const tau = (beta - alpha) / (2 * gamma);
        const t = tau >= 0
          ?  1 / ( tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < m; k++) {
          const bi = B[k][i], bj = B[k][j];
          B[k][i] = c * bi - s * bj;
          B[k][j] = s * bi + c * bj;
        }
        for (let k = 0; k < n; k++) {
          const vi = V[k][i], vj = V[k][j];
          V[k][i] = c * vi - s * vj;
          V[k][j] = s * vi + c * vj;
        }
      }
    }
    if (converged) break;
  }

  const singularValues = new Array(n);
  for (let j = 0; j < n; j++) {
    let s2 = 0;
    for (let i = 0; i < m; i++) s2 += B[i][j] * B[i][j];
    singularValues[j] = Math.sqrt(s2);
  }
  singularValues.sort((a, b) => b - a);

  return { rank: singularValues.filter(s => s > tol).length, singularValues };
}

/**
 * Schmidt decomposition of joint state ψ_AB ∈ ℝ^{m·n}.
 * Reshapes to m×n (row-major: ψ[i·n+j] = c_{ij}) then Jacobi SVD.
 * rank 1 ⟹ product / uncoupled; rank > 1 ⟹ entangled / coupled.
 */
export function schmidtDecomposition(psi_AB, m, n, tol = 1e-10) {
  const A = Array.from({ length: m }, (_, i) => psi_AB.slice(i * n, (i + 1) * n));
  return jacobiSVD(A, m, n, tol);
}

// ═══════════════════════════════════════════════════════════════════
// §7 — CLASSICAL BAYES BASELINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Single-step Bayes posterior: P(Hi|E) = P(E|Hi) P(Hi) / Σ_j P(E|Hj) P(Hj).
 * Returns normalised posterior array.
 */
export function bayesPosterior(prior, likelihoods) {
  const unnorm = prior.map((p, i) => p * likelihoods[i]);
  const total = unnorm.reduce((a, b) => a + b, 0);
  return total < 1e-15 ? prior.map(() => 0) : unnorm.map(u => u / total);
}

/**
 * Multi-step Bayes: P(Hi | E1..Ek) ∝ P(Hi) Π_k P(Ek|Hi).
 * prior: array; likelihoodSequence: array of per-evidence likelihood arrays.
 * Returns normalised posterior.
 */
export function bayesSequential(prior, likelihoodSequence) {
  const combined = prior.map((p, i) => {
    let prod = p;
    for (const lk of likelihoodSequence) prod *= lk[i];
    return prod;
  });
  const total = combined.reduce((a, b) => a + b, 0);
  return total < 1e-15 ? prior.map(() => 0) : combined.map(c => c / total);
}
