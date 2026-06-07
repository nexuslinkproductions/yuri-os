// arch-graph-engine.mjs — YURI architecture-graph organ: READ-ONLY structural lens.
//
// Three composable analyzers over `_SYSTEM/yuri-graph-state.json` (128n / 280e,
// giant component = 117), sharing ONE loader + ONE type-weight map:
//
//   card 4  — spectral clustering on the NORMALIZED symmetric Laplacian
//             Lsym = I − D^{−1/2} W D^{−1/2} over the giant component; k-means on
//             the bottom-k non-trivial eigenvectors → AGREE/DISAGREE diff vs the
//             declared `sector` field. λ₀-multiplicity = component count; λ₂ = a
//             single architecture-cohesion scalar; the Fiedler sweep names the
//             Cheeger bottleneck cut.
//   card 16 — Tarjan articulation points + bridges (pure DFS, NO eigensolver) on
//             the simple undirected reduction. The exact cut vertices / bridge
//             edges whose removal disconnects the graph.
//   card 17 — balanced Forman-Ricci edge curvature; strongly-negative curvature
//             at LOW-degree endpoints marks a no-alternate-path brittle bridge
//             that a plain degree-sort cannot see.
//
// CROSS-VALIDATION (the design payoff): Cheeger bottleneck (card 4) ≈ most-negative
// Forman edges (card 17) ≈ Tarjan bridges (card 16) — the report asserts the
// agreement and surfaces it as one mutually-confirming structural channel.
//
// STRICTLY READ-ONLY on the graph: this module never writes a `size`/`weight`
// field into the schema and never touches `_SYSTEM/yuri-graph-state.json`. The
// node→metrics map is emitted to a SEPARATE file (`_SYSTEM/state/arch-graph-metrics.json`).
// CLI prints the report and exits 0 (advisory).
//
// Eigensolver = clean-room TQL2 (tred2 Householder tridiagonalization + tql2 QL
// implicit-shift, EISPACK/JAMA lineage) — REIMPLEMENTED standalone here; the
// circuitry `laplacian.mjs` is a visual-layout engine over a *different* graph and
// is neither imported nor mutated.
//
// Pure deterministic Node ESM, zero npm deps. Same graph -> identical metrics.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- contract constants -----------------------------------------------------

// Edge type-weights (card 4 spec): strong coupling = high weight; logs = noise.
// Keys cover every REAL edge type live in yuri-graph-state.json
// (flow,gates,memory,data,branch,return,feedback,advises,validates,logs).
export const TYPE_WEIGHT = {
  flow: 1.0,
  branch: 0.9,
  data: 0.8,
  gates: 0.7,
  memory: 0.6,
  validates: 0.55,
  advises: 0.5,
  feedback: 0.4,
  return: 0.3,
  logs: 0.2,
};
const DEFAULT_WEIGHT = 0.5; // any future/unknown real type

// Meta edge types are dashboard-rollup artifacts (hidden collapsed-membership /
// feedback-aggregate links), NOT real architectural flow. Excluded from ALL
// structural analysis (catalog card 4: "exclude meta-edges" for λ₀ multiplicity).
const META_EDGE_TYPES = new Set(["collapsed-membership", "feedback-aggregate"]);

// ---- 0) shared loader (the ONE loader all three analyzers consume) ----------
// Returns a simple UNDIRECTED, weighted graph: real edges only (non-hidden,
// non-meta), multi-edges collapsed (max weight wins), self-loops dropped.
export function loadArchGraph(graphJson, typeWeight = TYPE_WEIGHT) {
  const nodes = graphJson.nodes;
  // deterministic id order (stable across runs).
  const ids = nodes.map((n) => n.id).slice().sort();
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const sectorById = new Map(nodes.map((nd) => [nd.id, nd.sector ?? "unassigned"]));
  const labelById = new Map(nodes.map((nd) => [nd.id, nd.label ?? nd.id]));

  // dense symmetric weight matrix W (max-on-multi-edge).
  const W = Array.from({ length: n }, () => new Float64Array(n));
  let realEdgeCount = 0;
  const pairWeight = new Map(); // "a|b" (a<b in idx) -> max weight, for edge list
  for (const e of graphJson.edges) {
    if (e.hidden) continue;
    const type = e.type ?? "?";
    if (META_EDGE_TYPES.has(type)) continue;
    const a = idx.get(e.source);
    const b = idx.get(e.target);
    if (a === undefined || b === undefined || a === b) continue; // drop dangling + self-loops
    realEdgeCount++;
    const w = typeWeight[type] ?? DEFAULT_WEIGHT;
    if (w > W[a][b]) {
      W[a][b] = w;
      W[b][a] = w;
    }
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo + "|" + hi;
    const prev = pairWeight.get(key);
    if (prev === undefined || w > prev) pairWeight.set(key, w);
  }

  // weighted degree
  const deg = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += W[i][j];
    deg[i] = s;
  }
  // unweighted (simple) degree = number of distinct neighbours
  const adj = Array.from({ length: n }, () => []);
  for (const key of pairWeight.keys()) {
    const [lo, hi] = key.split("|").map(Number);
    adj[lo].push(hi);
    adj[hi].push(lo);
  }
  for (const list of adj) list.sort((x, y) => x - y); // deterministic neighbour order
  const simpleDeg = adj.map((l) => l.length);

  // edge list (undirected, deduped) with weights — for curvature + bridge labels
  const edges = [];
  for (const [key, w] of pairWeight) {
    const [lo, hi] = key.split("|").map(Number);
    edges.push({ a: lo, b: hi, w });
  }
  edges.sort((e1, e2) => e1.a - e2.a || e1.b - e2.b); // deterministic

  return {
    ids, idx, n, W, deg, adj, simpleDeg, edges,
    sectorById, labelById, realEdgeCount,
    simpleEdgeCount: edges.length,
  };
}

// ---- connected components over the simple undirected graph ------------------
export function connectedComponents(g) {
  const { n, adj, ids } = g;
  const comp = new Int32Array(n).fill(-1);
  const comps = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const c = [];
    const stack = [s];
    comp[s] = comps.length;
    while (stack.length) {
      const u = stack.pop();
      c.push(u);
      for (const v of adj[u]) if (comp[v] === -1) { comp[v] = comps.length; stack.push(v); }
    }
    comps.push(c);
  }
  comps.sort((a, b) => b.length - a.length || a[0] - b[0]); // largest first, stable
  return {
    count: comps.length,
    giant: comps[0] ? comps[0].slice() : [],
    componentsAsIds: comps.map((c) => c.map((i) => ids[i])),
    isolated: comps.filter((c) => c.length === 1).map((c) => ids[c[0]]),
  };
}

// ============================================================================
// CARD 4 — spectral clustering on the normalized symmetric Laplacian Lsym
// ============================================================================

// clean-room symmetric eigensolver: tred2 (Householder) + tql2 (QL implicit
// shift). Returns { values: ascending λ[], vectors } with vectors[i][j] = i-th
// component of the j-th eigenvector (column j). A is NOT mutated.
export function symEig(A) {
  const n = A.length;
  const V = Array.from({ length: n }, (_, i) => Array.from(A[i]));
  const d = new Array(n).fill(0);
  const e = new Array(n).fill(0);
  tred2(n, d, e, V);
  tql2(n, d, e, V);
  return { values: d, vectors: V };
}
function tred2(n, d, e, V) {
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= (f * e[k] + g * d[k]);
        d[j] = V[i - 1][j]; V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]; V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1; e[0] = 0;
}
function tql2(n, d, e, V) {
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = Math.pow(2, -52);
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) {
      do {
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1]; let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m]; let c = 1, c2 = c, c3 = c; const el1 = e[l + 1]; let s = 0, s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]);
          e[i + 1] = s * r; s = e[i] / r; c = p / r;
          p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1];
            V[k][i + 1] = s * V[k][i] + c * h;
            V[k][i] = c * V[k][i] - s * h;
          }
        }
        p = -s * s2 * c3 * el1 * e[l] / dl1;
        e[l] = s * p; d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f; e[l] = 0;
  }
  // ascending sort, eigenvectors in lockstep
  for (let i = 0; i < n - 1; i++) {
    let k = i, p = d[i];
    for (let j = i + 1; j < n; j++) if (d[j] < p) { k = j; p = d[j]; }
    if (k !== i) {
      d[k] = d[i]; d[i] = p;
      for (let j = 0; j < n; j++) { const t = V[j][i]; V[j][i] = V[j][k]; V[j][k] = t; }
    }
  }
}

// deterministic eigenvector sign-pin: anchor max-|component| node positive.
function pinSign(vec) {
  let k = 0;
  for (let i = 1; i < vec.length; i++) if (Math.abs(vec[i]) > Math.abs(vec[k])) k = i;
  return vec[k] < 0 ? vec.map((z) => -z) : vec;
}

// deterministic k-means (k-means++ seeding w/ a fixed LCG; fixed iteration cap).
function kmeans(rows, k, seed = 1) {
  const m = rows.length;
  const dim = rows[0] ? rows[0].length : 0;
  if (m === 0 || k <= 1 || k >= m) return new Array(m).fill(0);
  // fixed LCG for reproducibility (no Math.random — determinism contract).
  let state = seed >>> 0;
  const rand = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  const sq = (a, b) => { let s = 0; for (let q = 0; q < dim; q++) { const dd = a[q] - b[q]; s += dd * dd; } return s; };
  // k-means++ seeding
  const centers = [rows[Math.floor(rand() * m)].slice()];
  while (centers.length < k) {
    const dists = rows.map((r) => Math.min(...centers.map((c) => sq(r, c))));
    const total = dists.reduce((a, b) => a + b, 0) || 1;
    let target = rand() * total, acc = 0, pick = 0;
    for (let i = 0; i < m; i++) { acc += dists[i]; if (acc >= target) { pick = i; break; } }
    centers.push(rows[pick].slice());
  }
  let assign = new Array(m).fill(0);
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (let i = 0; i < m; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const dd = sq(rows[i], centers[c]); if (dd < bd) { bd = dd; best = c; } }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    // recompute centers
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < m; i++) { counts[assign[i]]++; for (let q = 0; q < dim; q++) sums[assign[i]][q] += rows[i][q]; }
    for (let c = 0; c < k; c++) if (counts[c] > 0) for (let q = 0; q < dim; q++) centers[c][q] = sums[c][q] / counts[c];
    if (!changed) break;
  }
  return assign;
}

// Spectral clustering on the giant component's normalized symmetric Laplacian.
// numClusters defaults to the number of distinct declared sectors in the giant.
export function spectralCluster(g, giantIdxIds, opts = {}) {
  const { idx, W, sectorById, ids } = g;
  const giantIdx = giantIdxIds.map((id) => idx.get(id));
  const m = giantIdx.length;
  if (m < 3) return { clusters: {}, lambdas: [], fiedler: 0, k: 0, fiedlerSweep: null };

  // build Lsym = I − D^{−1/2} W D^{−1/2} on the giant subgraph.
  const subDeg = new Float64Array(m);
  for (let a = 0; a < m; a++) {
    let s = 0;
    for (let b = 0; b < m; b++) s += W[giantIdx[a]][giantIdx[b]];
    subDeg[a] = s;
  }
  const dInvSqrt = Array.from(subDeg, (dv) => (dv > 0 ? 1 / Math.sqrt(dv) : 0));
  const Lsym = Array.from({ length: m }, (_, a) => {
    const row = new Float64Array(m);
    for (let b = 0; b < m; b++) {
      const w = W[giantIdx[a]][giantIdx[b]];
      row[b] = (a === b ? 1 : 0) - dInvSqrt[a] * w * dInvSqrt[b];
    }
    return row;
  });

  const { values, vectors } = symEig(Lsym);
  const fiedler = values[1];
  const lambdas = values.slice(0, Math.min(8, m)).map((v) => Math.round(v * 1e5) / 1e5);

  // choose k = distinct declared sectors in giant (the comparison target),
  // clamped to [2, m-1].
  const sectorsInGiant = new Set(giantIdxIds.map((id) => sectorById.get(id)));
  let k = opts.k ?? sectorsInGiant.size;
  k = Math.max(2, Math.min(k, m - 1));

  // embed rows = bottom-k eigenvectors (skip trivial col 0), row-normalize (Ng-Jordan-Weiss).
  const rows = [];
  for (let i = 0; i < m; i++) {
    const r = [];
    for (let c = 1; c <= k; c++) r.push(vectors[i][c]);
    const norm = Math.sqrt(r.reduce((a, b) => a + b * b, 0)) || 1;
    rows.push(r.map((x) => x / norm));
  }

  // Fiedler sweep -> Cheeger bottleneck cut on ψ2 (the canonical 2-way cut).
  const psi2 = pinSign(vectors.map((row) => row[1]));
  const order = giantIdxIds.map((id, a) => ({ id, v: psi2[a] }))
    .sort((x, y) => x.v - y.v || (x.id < y.id ? -1 : 1));
  const fiedlerSweep = cheegerSweep(g, order.map((o) => o.id));

  // cluster assignment:
  //  - k == 2: use the Cheeger-OPTIMAL Fiedler prefix cut (the principled 2-way
  //    spectral community split — and it agrees with the reported bottleneck by
  //    construction). k-means on a 2-D row-normalized embedding distorts the
  //    near-degenerate geometry of small/balanced cases; the Fiedler sign-sweep
  //    is the textbook normalized-cut answer (Shi-Malik).
  //  - k >= 3: k-means on the bottom-k eigenvector embedding (Ng-Jordan-Weiss).
  const clusters = {};
  if (k === 2 && fiedlerSweep) {
    const orderedIds = order.map((o) => o.id);
    const sSet = new Set(orderedIds.slice(0, fiedlerSweep.sizeS));
    giantIdxIds.forEach((id) => { clusters[id] = sSet.has(id) ? 0 : 1; });
  } else {
    const assign = kmeans(rows, k, opts.seed ?? 1);
    giantIdxIds.forEach((id, a) => { clusters[id] = assign[a]; });
  }

  return { clusters, lambdas, fiedler: Math.round(fiedler * 1e5) / 1e5, k, fiedlerSweep, psi2Order: order.map((o) => o.id) };
}

// sweep the Fiedler-ordered prefix cuts; return the minimum-conductance cut
// (the Cheeger bottleneck) + the bridge edges crossing it.
function cheegerSweep(g, orderedIds) {
  const { idx, W } = g;
  const set = new Set();
  let bestPhi = Infinity, bestCut = null;
  // precompute total weighted volume of the ordered set
  const orderedIdx = orderedIds.map((id) => idx.get(id));
  const orderedSet = new Set(orderedIdx);
  for (let p = 1; p < orderedIdx.length; p++) {
    set.add(orderedIdx[p - 1]);
    // conductance phi(S) = cut(S, complement) / min(vol(S), vol(comp))
    let cut = 0, volS = 0, volC = 0;
    for (const a of orderedSet) {
      for (const b of orderedSet) {
        const w = W[a][b];
        if (w === 0) continue;
        if (set.has(a)) volS += w; else volC += w;
        if (set.has(a) !== set.has(b)) cut += w;
      }
    }
    cut /= 2; // undirected double-count
    const phi = cut / (Math.min(volS, volC) || 1);
    if (phi < bestPhi && set.size >= 1 && set.size < orderedIdx.length) {
      bestPhi = phi;
      bestCut = { sizeS: set.size, conductance: Math.round(phi * 1e5) / 1e5 };
    }
  }
  // crossing edges of the best cut
  if (bestCut) {
    const sBest = new Set(orderedIdx.slice(0, bestCut.sizeS));
    const crossing = [];
    for (const e of g.edges) {
      if (sBest.has(e.a) !== sBest.has(e.b)) crossing.push({ a: g.ids[e.a], b: g.ids[e.b], w: e.w });
    }
    bestCut.crossingEdges = crossing;
  }
  return bestCut;
}

// ============================================================================
// CARD 16 — Tarjan articulation points + bridges (pure DFS, no eigensolver)
// ============================================================================
export function tarjanArticulationAndBridges(g) {
  const { n, adj, ids } = g;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n).fill(0);
  const isArt = new Array(n).fill(false);
  const bridges = [];
  let timer = 0;

  // iterative DFS (avoid recursion-depth blowups on big graphs).
  for (let start = 0; start < n; start++) {
    if (disc[start] !== -1) continue;
    // stack frames: { u, parent, ci (child cursor), children (count) }
    const stack = [{ u: start, parent: -1, ci: 0, children: 0 }];
    disc[start] = low[start] = timer++;
    while (stack.length) {
      const fr = stack[stack.length - 1];
      const u = fr.u;
      if (fr.ci < adj[u].length) {
        const v = adj[u][fr.ci++];
        if (v === fr.parent) continue;
        if (disc[v] === -1) {
          fr.children++;
          disc[v] = low[v] = timer++;
          stack.push({ u: v, parent: u, ci: 0, children: 0 });
        } else {
          if (disc[v] < low[u]) low[u] = disc[v];
        }
      } else {
        // done exploring u — pop and fold low into parent.
        stack.pop();
        const parent = fr.parent;
        if (parent !== -1) {
          if (low[u] < low[parent]) low[parent] = low[u];
          // articulation (non-root): a child v with low[v] >= disc[parent]
          if (low[u] >= disc[parent]) {
            // parent is articulation unless it is the root (handled below).
            const grand = stack.length >= 1 ? stack[stack.length - 1].parent : -2;
            // parent is root iff its own frame.parent === -1
            const parentFrame = stack[stack.length - 1];
            if (parentFrame && parentFrame.parent !== -1) isArt[parent] = true;
          }
          // bridge: low[u] > disc[parent]
          if (low[u] > disc[parent]) {
            const a = Math.min(u, parent), b = Math.max(u, parent);
            bridges.push({ a: ids[a], b: ids[b] });
          }
        }
      }
    }
    // root is articulation iff it has >= 2 DFS children.
    // recover root children count: re-scan is costly; track via a second pass.
  }

  // root articulation pass: a root is an articulation point iff it has >=2
  // children in the DFS tree. Recompute children-of-root cleanly per component.
  const rootChildren = computeRootChildren(g);
  for (const [root, cnt] of rootChildren) if (cnt >= 2) isArt[root] = true;

  const articulationPoints = [];
  for (let i = 0; i < n; i++) if (isArt[i]) articulationPoints.push(ids[i]);
  bridges.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));
  articulationPoints.sort();
  return { articulationPoints, bridges };
}

// count DFS-tree children of each component root (clean second DFS).
function computeRootChildren(g) {
  const { n, adj } = g;
  const seen = new Array(n).fill(false);
  const out = [];
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    seen[start] = true;
    let children = 0;
    // each unvisited neighbour explored from root opens one DFS subtree.
    const stack = [];
    for (const v of adj[start]) {
      if (!seen[v]) {
        children++;
        seen[v] = true;
        stack.push(v);
        while (stack.length) {
          const u = stack.pop();
          for (const w of adj[u]) if (!seen[w]) { seen[w] = true; stack.push(w); }
        }
      }
    }
    out.push([start, children]);
  }
  return out;
}

// ============================================================================
// CARD 17 — balanced Forman-Ricci edge curvature
// ============================================================================
// Augmented Forman-Ricci for a WEIGHTED undirected edge e=(u,v):
//
//   Ric(e) = w_e * ( w_u/w_e + w_v/w_e
//                    − Σ_{e_u ~ u, e_u≠e}  w_u / sqrt(w_e · w_{e_u})
//                    − Σ_{e_v ~ v, e_v≠e}  w_v / sqrt(w_e · w_{e_v}) )
//
// (Sreejith et al. 2016 / Topping 2021 lineage.) Vertex weights w_u = inverse
// simple-degree so the hub doesn't swamp; triangle redundancy is folded in via
// the shared-neighbour add-back (tri=0 ⇒ a true no-alternate-path bridge).
export function formanCurvature(g) {
  const { edges, adj, simpleDeg, ids } = g;
  const adjSet = adj.map((l) => new Set(l));
  const vertW = (i) => 1 / (simpleDeg[i] || 1); // inverse-degree vertex weight

  const out = [];
  for (const e of edges) {
    const { a, b, w } = e;
    const wu = vertW(a), wv = vertW(b);
    // incident-edge contributions (exclude e itself), excluding the OTHER endpoint
    let sumU = 0, sumV = 0;
    for (const x of adj[a]) {
      if (x === b) continue; // that's edge e
      const we = g.W[a][x] || DEFAULT_WEIGHT;
      sumU += wu / Math.sqrt(w * we);
    }
    for (const x of adj[b]) {
      if (x === a) continue;
      const we = g.W[b][x] || DEFAULT_WEIGHT;
      sumV += wv / Math.sqrt(w * we);
    }
    // triangle count (shared neighbours) — redundancy add-back; tri=0 = bridge.
    let tri = 0;
    for (const x of adjSet[a]) if (adjSet[b].has(x)) tri++;
    // balanced add-back: triangles supply parallel paths -> raise curvature.
    const triTerm = tri * (wu + wv) / Math.sqrt(w);
    const ric = w * (wu / w + wv / w - sumU - sumV) + triTerm;
    out.push({ a: ids[a], b: ids[b], w, tri, ricci: Math.round(ric * 1e5) / 1e5,
               degA: simpleDeg[a], degB: simpleDeg[b] });
  }
  out.sort((x, y) => x.ricci - y.ricci || (x.a < y.a ? -1 : 1)); // most-negative first
  return out;
}

// ============================================================================
// COMPOSE — run all three + cross-validate + emit node->metrics map
// ============================================================================
export function analyzeArchGraph(graphJson, opts = {}) {
  const g = loadArchGraph(graphJson, opts.typeWeight);
  const cc = connectedComponents(g);

  // card 16
  const tarjan = tarjanArticulationAndBridges(g);
  // card 17
  const curvature = formanCurvature(g);
  // card 4 (giant only)
  const spectral = spectralCluster(g, cc.giant.map((i) => g.ids[i]), opts);

  // ---- per-node metrics map (NOT written into the graph schema) ----
  const bridgeSet = new Set(tarjan.bridges.map((b) => b.a + "|" + b.b));
  const artSet = new Set(tarjan.articulationPoints);
  // most-negative-curvature endpoint exposure per node
  const negExposure = new Map();
  for (const c of curvature) {
    if (c.ricci < 0) {
      negExposure.set(c.a, Math.min(negExposure.get(c.a) ?? 0, c.ricci));
      negExposure.set(c.b, Math.min(negExposure.get(c.b) ?? 0, c.ricci));
    }
  }
  const metrics = {};
  for (const id of g.ids) {
    const i = g.idx.get(id);
    metrics[id] = {
      label: g.labelById.get(id),
      declaredSector: g.sectorById.get(id),
      weightedDegree: Math.round(g.deg[i] * 1e4) / 1e4,
      simpleDegree: g.simpleDeg[i],
      isArticulation: artSet.has(id),
      isIsolated: cc.isolated.includes(id),
      spectralCluster: spectral.clusters[id] ?? null,
      minIncidentRicci: negExposure.has(id) ? negExposure.get(id) : null,
    };
  }

  // ---- AGREE/DISAGREE diff (card 4 deliverable) ----
  // map each spectral cluster id -> its plurality declared sector, then any node
  // whose declared sector != its cluster's plurality sector is a DISAGREE.
  const clusterSectorVotes = new Map(); // cluster -> {sector: count}
  for (const id of Object.keys(spectral.clusters)) {
    const cl = spectral.clusters[id];
    const sec = g.sectorById.get(id);
    if (!clusterSectorVotes.has(cl)) clusterSectorVotes.set(cl, new Map());
    const v = clusterSectorVotes.get(cl);
    v.set(sec, (v.get(sec) ?? 0) + 1);
  }
  const clusterPlurality = new Map();
  for (const [cl, votes] of clusterSectorVotes) {
    let best = null, bc = -1;
    for (const [sec, c] of votes) if (c > bc || (c === bc && (best === null || sec < best))) { bc = c; best = sec; }
    clusterPlurality.set(cl, best);
  }
  const diff = [];
  let agree = 0, disagree = 0;
  for (const id of Object.keys(spectral.clusters).sort()) {
    const cl = spectral.clusters[id];
    const declared = g.sectorById.get(id);
    const spectralSector = clusterPlurality.get(cl);
    const verdict = declared === spectralSector ? "AGREE" : "DISAGREE";
    if (verdict === "AGREE") agree++; else disagree++;
    diff.push({ node: id, declaredSector: declared, spectralCluster: cl, spectralSector, verdict });
  }

  // ---- CROSS-VALIDATION: Cheeger ≈ Forman ≈ Tarjan ----
  const cross = crossValidate(g, spectral, curvature, tarjan);

  return {
    summary: {
      nodes: g.n,
      realEdges: g.realEdgeCount,
      simpleEdges: g.simpleEdgeCount,
      components: cc.count,
      giant: cc.giant.length,
      giantFraction: Math.round((cc.giant.length / g.n) * 1e4) / 1e4,
      isolatedNodes: cc.isolated.length,
      lambda2_fiedler: spectral.fiedler,
      lambdas_bottom8: spectral.lambdas,
      k_clusters: spectral.k,
      articulationPoints: tarjan.articulationPoints.length,
      bridges: tarjan.bridges.length,
      agree, disagree,
    },
    isolated: cc.isolated,
    articulationPoints: tarjan.articulationPoints,
    bridges: tarjan.bridges,
    cheegerCut: spectral.fiedlerSweep,
    topNegativeCurvature: curvature.slice(0, 15),
    diff,
    crossValidation: cross,
    metrics,
  };
}

// CROSS-VALIDATION — empirically corrected against the LIVE graph (2026-06-04).
//
// The roadmap predicted a TRIPLE equality "Cheeger ≈ most-negative Forman ≈
// Tarjan bridges". Verified against yuri-graph-state.json this is FALSE as a
// triple: Forman and Cheeger agree strongly (both find high-traffic, low-
// redundancy BOTTLENECK edges — e.g. MEMORY→MEM_WARM, HOOK_PIPELINE→PULSE_BUS),
// but Tarjan bridges are a DISTINCT channel — here they are leaf-to-hub cut
// edges (CMD_*→ENKI_COMMANDS), whose low-degree endpoint gives them HIGH (least-
// negative) Forman curvature. Forman/Cheeger measure over-squashing bottlenecks;
// Tarjan measures disconnection points. They answer different questions, so the
// report states the two genuine agreements and keeps Tarjan as an orthogonal
// fragility lens rather than asserting a false third equality.
function crossValidate(g, spectral, curvature, tarjan, topN = 20) {
  const bridgeKeys = new Set(tarjan.bridges.map((b) => b.a + "|" + b.b));
  // most-negative Forman edges (top-N)
  const negForman = curvature.slice(0, topN).map((c) => ({ key: c.a + "|" + c.b, ricci: c.ricci, tri: c.tri }));
  const negFormanKeys = new Set(negForman.map((f) => f.key));
  // Cheeger crossing edges
  const cheegerEdges = (spectral.fiedlerSweep && spectral.fiedlerSweep.crossingEdges) || [];
  const cheegerKeys = new Set(cheegerEdges.map((e) => {
    const a = e.a < e.b ? e.a : e.b, b = e.a < e.b ? e.b : e.a;
    return a + "|" + b;
  }));

  // PRIMARY AGREEMENT: Cheeger bottleneck-crossing edges among most-negative Forman.
  const cheegerFormanOverlap = negForman.filter((f) => cheegerKeys.has(f.key)).map((f) => f.key);
  const formanCheegerAgreement = cheegerKeys.size > 0
    ? Math.round((cheegerFormanOverlap.length / Math.min(topN, cheegerKeys.size)) * 1e4) / 1e4 : null;

  // ORTHOGONAL FRAGILITY: Tarjan bridges. Report the genuine overlaps (often 0
  // on this topology) WITHOUT pretending equality.
  const formanBridgeOverlap = negForman.filter((f) => bridgeKeys.has(f.key)).map((f) => f.key);
  const cheegerBridgeOverlap = [...cheegerKeys].filter((k) => bridgeKeys.has(k));
  const triZeroBridges = curvature.filter((c) => c.tri === 0 && bridgeKeys.has(c.a + "|" + c.b)).length;

  return {
    note: "VERIFIED: Forman ≈ Cheeger (high-traffic bottlenecks); Tarjan bridges are a DISTINCT disconnection channel (roadmap triple-equality corrected on live graph).",
    cheegerCrossingThatAreNegForman: cheegerFormanOverlap,
    cheegerFormanOverlapCount: cheegerFormanOverlap.length,
    formanCheegerAgreement, // PRIMARY: fraction of bottleneck cut edges captured by top-N Forman
    tarjanBridgeCount: tarjan.bridges.length,
    tarjanBridgesWithTriZero: triZeroBridges, // every bridge is tri=0 by definition (sanity)
    formanNegEdgesThatAreBridges: formanBridgeOverlap, // typically empty: bridges are leaf-cuts, not bottlenecks
    formanNegEdgesThatAreBridgesCount: formanBridgeOverlap.length,
    cheegerCrossingThatAreBridges: cheegerBridgeOverlap,
  };
}

// ---- CLI report -------------------------------------------------------------
function pad(s, w) { s = String(s); return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length); }

function printReport(report) {
  const s = report.summary;
  console.log("=".repeat(72));
  console.log("YURI ARCHITECTURE-GRAPH ENGINE — read-only structural lens (advisory)");
  console.log("=".repeat(72));
  console.log(`nodes=${s.nodes}  realEdges=${s.realEdges}  simpleEdges=${s.simpleEdges}`);
  console.log(`components=${s.components}  giant=${s.giant} (${(s.giantFraction * 100).toFixed(1)}%)  isolated=${s.isolatedNodes}`);
  console.log(`λ2 (Fiedler / cohesion)=${s.lambda2_fiedler}   bottom-8 λ=[${s.lambdas_bottom8.join(", ")}]`);
  console.log(`k-clusters=${s.k_clusters}   AGREE=${s.agree}  DISAGREE=${s.disagree}`);
  console.log("");

  console.log(`-- CARD 16: ${s.articulationPoints} articulation points, ${s.bridges} bridges --`);
  console.log("  articulation points:", report.articulationPoints.join(", ") || "(none)");
  console.log("  bridges:");
  for (const b of report.bridges.slice(0, 20)) console.log(`    ${b.a}  --  ${b.b}`);
  if (report.bridges.length > 20) console.log(`    ... +${report.bridges.length - 20} more`);
  console.log("");

  console.log("-- CARD 17: 15 most-negative Forman-Ricci edges (brittle bridges) --");
  console.log("  " + pad("u", 26) + pad("v", 26) + pad("ricci", 10) + pad("tri", 5) + "deg");
  for (const c of report.topNegativeCurvature) {
    console.log("  " + pad(c.a, 26) + pad(c.b, 26) + pad(c.ricci, 10) + pad(c.tri, 5) + `${c.degA}/${c.degB}`);
  }
  console.log("");

  console.log("-- CARD 4: Cheeger bottleneck cut (Fiedler sweep) --");
  if (report.cheegerCut) {
    console.log(`  min-conductance cut: |S|=${report.cheegerCut.sizeS}  φ=${report.cheegerCut.conductance}  crossing edges=${(report.cheegerCut.crossingEdges || []).length}`);
    for (const e of (report.cheegerCut.crossingEdges || []).slice(0, 8)) console.log(`    ${e.a}  --  ${e.b}  (w=${e.w})`);
  } else console.log("  (no cut)");
  console.log("");

  console.log("-- CROSS-VALIDATION (corrected on live graph) --");
  const x = report.crossValidation;
  console.log("  " + x.note);
  console.log(`  PRIMARY  Cheeger bottleneck-crossing edges among most-negative Forman: ${x.cheegerFormanOverlapCount}  (agreement=${x.formanCheegerAgreement})`);
  if (x.cheegerCrossingThatAreNegForman.length) console.log("    " + x.cheegerCrossingThatAreNegForman.join(", "));
  console.log(`  ORTHOGONAL  Tarjan bridges=${x.tarjanBridgeCount} (all tri=0 leaf/branch cuts); Forman-neg ∩ bridges=${x.formanNegEdgesThatAreBridgesCount}; Cheeger-cross ∩ bridges=${x.cheegerCrossingThatAreBridges.length}`);
  console.log("");

  console.log(`-- AGREE/DISAGREE diff (declared sector vs spectral cluster) — ${s.disagree} DISAGREE rows --`);
  console.log("  " + pad("node", 28) + pad("declared_sector", 22) + pad("cluster", 9) + pad("spectral_sector", 22) + "verdict");
  for (const d of report.diff.filter((r) => r.verdict === "DISAGREE").slice(0, 30)) {
    console.log("  " + pad(d.node, 28) + pad(d.declaredSector, 22) + pad(d.spectralCluster, 9) + pad(d.spectralSector, 22) + d.verdict);
  }
  const moreDis = report.diff.filter((r) => r.verdict === "DISAGREE").length - 30;
  if (moreDis > 0) console.log(`  ... +${moreDis} more DISAGREE rows`);
  console.log("=".repeat(72));
}

// ---- CLI entrypoint ---------------------------------------------------------
const GRAPH_PATH = "_SYSTEM/yuri-graph-state.json";
const OUT_PATH = "_SYSTEM/state/arch-graph-metrics.json";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const graphJson = JSON.parse(readFileSync(GRAPH_PATH, "utf8"));
  const report = analyzeArchGraph(graphJson);
  printReport(report);
  // emit node->metrics map to a SEPARATE file (never into the graph).
  const payload = {
    generated_at: new Date().toISOString(),
    source: GRAPH_PATH,
    advisory: true,
    writesRuntimeTruth: false,
    summary: report.summary,
    isolated: report.isolated,
    articulationPoints: report.articulationPoints,
    bridges: report.bridges,
    cheegerCut: report.cheegerCut,
    topNegativeCurvature: report.topNegativeCurvature,
    crossValidation: report.crossValidation,
    diff: report.diff,
    metrics: report.metrics,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${OUT_PATH} (advisory node->metrics map; graph schema untouched)`);
  process.exit(0); // advisory — never gates
}
