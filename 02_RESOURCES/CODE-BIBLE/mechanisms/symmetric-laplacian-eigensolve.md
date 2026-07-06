# Mechanism Card — symmetric-laplacian-eigensolve

**Source:** mljs/matrix (ml-matrix) · `src/dc/evd.js` + `src/dc/util.js` @ `master`
**URL:** https://raw.githubusercontent.com/mljs/matrix/master/src/dc/evd.js
**License:** MIT (permissive) — © 2014 Michaël Zasso · safe to study + reimplement
**Verified read:** quoted `V.set(k, i + 1, s * V.get(k, i) + c * h);` and the ascending-sort guard `if (d[j] < p)` from the live `tql2`; `Math.abs(a) * Math.sqrt(1 + r * r)` from `hypotenuse`.

## Mechanism
Eigendecompose a dense **symmetric** matrix in two stages (the EISPACK/JAMA **TQL2** lineage):
1. **`tred2` — Householder tridiagonalization.** Reflect `A` to a similar symmetric tridiagonal `T = QᵀAQ` (diagonal in `d[]`, sub-diagonal in `e[]`), back-accumulating the reflectors so `V` enters the next stage as the orthogonal `Q`.
2. **`tql2` — implicit-shift QL.** Sweep Givens rotations to drive `e[]` to zero; **every rotation is also applied to the columns of `V`**, so on convergence `V`'s columns are the orthonormal eigenvectors and `d[]` the eigenvalues. A final selection-sort orders eigenvalues **ascending**, swapping `V` columns in lockstep.

`assumeSymmetric:true` skips the `isSymmetric()` scan and the entire non-symmetric `orthes`/`hqr2` branch — correct for a Laplacian, which is symmetric by construction.

## Core algorithm steps
- **Tridiagonalize:** `Hₖ = I − uₖuₖᵀ/hₖ`, `hₖ = ½‖uₖ‖²`, applied left+right, accumulated into `V`.
- **Locate split:** first `m` with `|e[m]| ≤ ε·tst1`, `tst1 = maxₗ(|d_l|+|e_l|)`.
- **Implicit Wilkinson shift:** `p = (d_{l+1}−d_l)/(2·e_l)`, `r = sign(p)·hypot(p,1)`, deflate `d_l = e_l/(p+r)`.
- **Givens sweep** (m−1 → l): each `(c,s)` from `r = hypot(p, e_i)`, `c = p/r`, `s = e_i/r`, applied to `V` cols `(i, i+1)`.
- **Converge:** `|e_l| ≤ ε·tst1`. **Sort:** ascending by `d[j]`, swap `V` columns.

## Math / formulas
```
A = V·diag(λ)·Vᵀ           (A symmetric → real λ, orthonormal V)
T = QᵀAQ                    Householder, Hₖ = I − uₖuₖᵀ/hₖ
shift:  p = (d_{l+1}−d_l)/(2 e_l),  r = sign(p)·hypot(p,1)
Givens: c = p/r, s = e_i/r  from r = hypot(p, e_i)
hypot(a,b) = |a|·√(1+(b/a)²)   (|a|>|b|; overflow-safe)
converge:  |e_l| ≤ ε·maxₗ(|d_l|+|e_l|)
Fiedler:   L·psi_2 = λ_2·psi_2,  λ_1=0 ≤ λ_2 ≤ … (connected graph)
```

## YURI application — SPECTRAL ATLAS
- Build `L = D − W` for the ~83-node circuitry graph: `W` = symmetric type-weighted edge weights, `D` = diagonal degrees.
- Solve `L` with clean-room TQL2, `assumeSymmetric:true`.
- Sorted ascending ⇒ **col 0** = trivial λ≈0 constant mode; **col 1 = psi_2 (Fiedler)** = x; **col 2 = psi_3** = y.
- **Deterministic K3 rebuild:** no force sim, no random seed, no iteration-order dependence — identical `L` → identical layout. Pin the global eigenvector sign by anchoring the sign of the max-|component| node so flips don't jitter the atlas.
- **Scale path:** full `tred2+tql2` is O(n³) but trivial at n≈83. If the graph grows to thousands of nodes, switch to **power-iteration + Hotelling deflation** on `(cI − L)` to get only the bottom-k eigenpairs without the full dense decomposition.

## Clean-room sketch (my form, not a copy)
```js
// Build Laplacian, solve bottom eigenpairs, return (x,y) per node.
function spectralAtlas(adjacency /* n×n symmetric W */) {
  const n = adjacency.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    let deg = 0;
    for (let j = 0; j < n; j++) { deg += adjacency[i][j]; L[i][j] = -adjacency[i][j]; }
    L[i][i] += deg;                       // L = D − W
  }
  const { values, vectors } = symEig(L); // tred2 + tql2, eigenvalues ascending
  const x = pinSign(vectors.col(1));     // psi_2 (Fiedler)
  const y = pinSign(vectors.col(2));     // psi_3
  return x.map((xi, i) => ({ x: xi, y: y[i] }));
}
function pinSign(v) {                      // remove the global eigenvector flip
  let k = 0; for (let i = 1; i < v.length; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i;
  return v[k] < 0 ? v.map(z => -z) : v;
}
// overflow-safe magnitude reused by the QL shift/rotation:
const hypot = (a, b) => { const A = Math.abs(a), B = Math.abs(b);
  if (A > B) { const r = B / A; return A * Math.sqrt(1 + r * r); }
  if (B !== 0) { const r = A / B; return B * Math.sqrt(1 + r * r); }
  return 0; };
```

## Pitfalls
- **Disconnected graph** → λ_1 = λ_2 = 0 (multiplicity = #components); Fiedler becomes degenerate. Ensure connectivity or operate per-component.
- **Eigenvector sign + degenerate-eigenvalue rotation** are arbitrary; pin sign, and for near-equal λ the (x,y) axes can rotate within the eigenspace — acceptable for layout, not for per-node identity.
- `assumeSymmetric:true` trusts the caller — feed it an exactly symmetric `L` (build both halves from one weight, don't risk float asymmetry).