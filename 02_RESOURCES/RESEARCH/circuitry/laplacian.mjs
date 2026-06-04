// laplacian.mjs — YURI circuitry ATLAS lens: DETERMINISTIC spectral layout.
// Built to BUILD-MANUAL.md §6. Pure deterministic Node ESM, zero npm deps.
//
//   every node coordinate = a SOLVED eigenvector of the graph Laplacian.
//   no Math.random, no force sim, no wall-clock. same graph -> identical pixels.
//
// Pipeline:  buildLaplacian -> connectedComponents -> symEig(giant) -> psi2/psi3
//            -> gauge-pin -> orphan orbital ring -> per-layer Catmull-Rom coastlines.
//
// Provenance (see BUILD-MANUAL §5): spectral layout = Hall 1970 / Fiedler 1973
// (circuitry-layout-theory-2026-06-04.md). Eigensolver = clean-room TQL2 (tred2+tql2,
// EISPACK/JAMA lineage) from CODE-BIBLE/mechanisms/symmetric-laplacian-eigensolve.md.
// Hull/Catmull/collision harvested from verified kernel K3.

// ---- contract constants -----------------------------------------------------
export const LAYER_ORDER = [
  "Cognition & Persona", "Energy & Math", "Memory & Subconscious",
  "Retrieval & Knowledge", "Learning & Continuity", "Governance & Safety",
  "Skills & Orchestration", "Token-Efficiency & Session",
  "Hidden / Meta / Self-referential",
];
export const MOAT_LAYERS = new Set([
  "Energy & Math", "Cognition & Persona", "Memory & Subconscious",
]);
// edge type-weights: calls (import/invoke) carry the strongest coupling.
export const TYPE_WEIGHT = { calls: 1.0, writes: 0.8, reads: 0.6 };

// ---- small deterministic helpers (harvested from K3) ------------------------
function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy) || 1e-9;
}
function round1(n) { const r = Math.round(n * 10) / 10; return Object.is(r, -0) ? 0 : r; }
function fmt(n) { const r = Math.round(n * 100) / 100; return Object.is(r, -0) ? 0 : r; }
function centroidOf(pts) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; }
  return { x: cx / pts.length, y: cy / pts.length };
}
function convexHull(pts) {
  if (pts.length <= 2) return pts.slice();
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function expandRing(ring, margin) {
  const c = centroidOf(ring);
  return ring.map((p) => {
    const d = dist(p.x, p.y, c.x, c.y);
    const s = (d + margin) / d;
    return { x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s };
  });
}
// centripetal-flavoured closed Catmull-Rom -> cubic Bezier SVG path (K3 form).
function catmullRomClosedPath(ring) {
  const n = ring.length;
  if (n === 0) return "";
  if (n <= 2) {
    const c = centroidOf(ring.length ? ring : [{ x: 0, y: 0 }]);
    const r = n === 2 ? Math.max(dist(ring[0].x, ring[0].y, c.x, c.y) + 24, 30) : 30;
    return `M ${fmt(c.x - r)} ${fmt(c.y)} a ${r} ${r} 0 1 0 ${fmt(2 * r)} 0 a ${r} ${r} 0 1 0 ${fmt(-2 * r)} 0 Z`;
  }
  const P = (i) => ring[((i % n) + n) % n];
  let d = `M ${fmt(P(0).x)} ${fmt(P(0).y)} `;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)} `;
  }
  return d + "Z";
}
function resolveCollisions(pos, minDist, maxPasses) {
  let movedEver = false;
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i], b = pos[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) {
          if (d < 1e-6) { const ang = ((i * 131 + j * 977) % 360) * Math.PI / 180; dx = Math.cos(ang); dy = Math.sin(ang); d = 1e-6; }
          const overlap = (minDist - d) / 2 + 1e-3, ux = dx / d, uy = dy / d;
          a.x += ux * overlap; a.y += uy * overlap; b.x -= ux * overlap; b.y -= uy * overlap;
          moved = true; movedEver = true;
        }
      }
    if (!moved) break;
  }
  return movedEver;
}

// ---- 1) Laplacian ----------------------------------------------------------
// Build the symmetric type-weighted weight matrix W over the 77 GRAPH edges.
// Returns dense Float64 rows + id index. L = D - W is formed inside symEig.
export function buildLaplacian(nodes, graphEdges, typeWeight = TYPE_WEIGHT) {
  const ids = nodes.map((n) => n.id).slice().sort(); // deterministic id order
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const W = Array.from({ length: n }, () => new Float64Array(n));
  for (const e of graphEdges) {
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a === undefined || b === undefined || a === b) continue; // graph edges only
    const w = typeWeight[e.kind] ?? 0.5;
    if (w > W[a][b]) { W[a][b] = w; W[b][a] = w; } // symmetric, max on multi-edge
  }
  const deg = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += W[i][j]; deg[i] = s; }
  return { ids, idx, W, deg, n };
}

// connected components over W>0 (BFS), returned as arrays of ids, largest first.
export function connectedComponents({ ids, W, n }) {
  const seen = new Array(n).fill(false), comps = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const stack = [s], comp = []; seen[s] = true;
    while (stack.length) {
      const u = stack.pop(); comp.push(u);
      for (let v = 0; v < n; v++) if (!seen[v] && W[u][v] > 0) { seen[v] = true; stack.push(v); }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length || a[0] - b[0]); // largest first, stable
  return comps.map((c) => c.map((i) => ids[i]));
}

// ---- 2) symmetric eigensolver: tred2 + tql2 (clean-room JAMA/EISPACK) -------
// Returns { values: ascending λ[], vectors: V } where V[i][j] = i-th component
// of the j-th eigenvector (column j). A is not mutated.
export function symEig(A) {
  const n = A.length;
  const V = Array.from({ length: n }, (_, i) => Array.from(A[i]));
  const d = new Array(n).fill(0), e = new Array(n).fill(0);
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
  let f = 0, tst1 = 0; const eps = Math.pow(2, -52);
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

// pin the global eigenvector sign: anchor the max-|component| node positive.
function pinSign(vec) {
  let k = 0;
  for (let i = 1; i < vec.length; i++) if (Math.abs(vec[i]) > Math.abs(vec[k])) k = i;
  return vec[k] < 0 ? vec.map((z) => -z) : vec;
}

// ---- 3) full atlas ---------------------------------------------------------
export function buildSpectralAtlas(nodes, graphEdges, opts = {}) {
  const o = {
    w: opts.w ?? 1600, h: opts.h ?? 1600, pad: opts.pad ?? 96,
    coreFrac: opts.coreFrac ?? 0.62,   // giant component fills this fraction of the half-canvas
    ringFrac: opts.ringFrac ?? 0.84,   // orphans/small comps orbit here
    collision: opts.collision ?? 30,   // hard min node separation (anti-mush)
    hullMargin: opts.hullMargin ?? 46,
  };
  const lap = buildLaplacian(nodes, graphEdges);
  const { ids, idx, W, deg, n } = lap;
  const comps = connectedComponents(lap);
  const giant = comps[0] || [];
  const giantSet = new Set(giant);

  const cx = o.w / 2, cy = o.h / 2;
  const raw = {}; // id -> {x,y} pre-normalization

  // --- giant component: spectral embed via psi2/psi3 ---
  if (giant.length >= 3) {
    const gi = giant.map((id) => idx.get(id));
    const m = gi.length;
    const sub = Array.from({ length: m }, (_, a) => {
      const row = new Float64Array(m);
      for (let b = 0; b < m; b++) row[b] = -W[gi[a]][gi[b]];
      return row;
    });
    for (let a = 0; a < m; a++) { let s = 0; for (let b = 0; b < m; b++) if (b !== a) s += -sub[a][b]; sub[a][a] = s; }
    const { values, vectors } = symEig(sub);
    // col 0 = trivial (λ≈0); col 1 = ψ2 (Fiedler) = x; col 2 = ψ3 = y
    const psi2 = pinSign(vectors.map((row) => row[1]));
    const psi3 = pinSign(vectors.map((row) => row[2]));
    giant.forEach((id, a) => { raw[id] = { x: psi2[a], y: psi3[a] }; });
    raw.__fiedler = values[1];
    raw.__lambdas = values.slice(0, 4);
  } else {
    giant.forEach((id, a) => { raw[id] = { x: Math.cos(a), y: Math.sin(a) }; });
    raw.__fiedler = 0;
  }

  // normalize giant raw coords into a centred disk of radius coreFrac*halfMin
  const gpts = giant.map((id) => raw[id]);
  if (gpts.length) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of gpts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    const half = Math.min(o.w, o.h) / 2 - o.pad;
    const R = half * o.coreFrac;
    for (const id of giant) {
      const p = raw[id];
      raw[id] = { x: cx + ((p.x - (minX + maxX) / 2) / spanX) * 2 * R, y: cy + ((p.y - (minY + maxY) / 2) / spanY) * 2 * R };
    }
  }

  // --- orphans + small components: deterministic orbital ring ---
  const orphans = [];
  for (const c of comps.slice(1)) for (const id of c) orphans.push(id);
  // stable order: by (component size desc already via comps order) then id
  if (orphans.length) {
    const ringR = (Math.min(o.w, o.h) / 2 - o.pad) * o.ringFrac;
    orphans.forEach((id, i) => {
      const ang = (i / orphans.length) * Math.PI * 2 - Math.PI / 2;
      raw[id] = { x: cx + Math.cos(ang) * ringR, y: cy + Math.sin(ang) * ringR };
    });
  }

  // orientation gauge: flip so the MOAT centroid lands upper-left (deterministic).
  const moatPts = nodes.filter((nd) => MOAT_LAYERS.has(nd.layer) && raw[nd.id]).map((nd) => raw[nd.id]);
  if (moatPts.length) {
    const mc = centroidOf(moatPts);
    const flipX = mc.x > cx, flipY = mc.y > cy;
    if (flipX || flipY) for (const id of Object.keys(raw)) {
      if (id.startsWith("__")) continue;
      if (flipX) raw[id].x = 2 * cx - raw[id].x;
      if (flipY) raw[id].y = 2 * cy - raw[id].y;
    }
  }

  // hard de-overlap (deterministic tie-break) + clamp into padded canvas
  const arr = nodes.map((nd) => ({ id: nd.id, x: raw[nd.id].x, y: raw[nd.id].y }));
  resolveCollisions(arr, o.collision, 200);
  for (const p of arr) { p.x = Math.max(o.pad, Math.min(o.w - o.pad, p.x)); p.y = Math.max(o.pad, Math.min(o.h - o.pad, p.y)); }
  resolveCollisions(arr, o.collision, 80);

  const positions = {};
  for (const p of arr) positions[p.id] = { x: round1(p.x), y: round1(p.y) };

  // radii ∝ sqrt(degree)
  const degById = new Map(ids.map((id, i) => [id, deg[i]]));
  let maxDeg = 0; for (const v of deg) maxDeg = Math.max(maxDeg, v);
  const radii = {};
  for (const nd of nodes) {
    const t = maxDeg > 0 ? Math.sqrt(degById.get(nd.id)) / Math.sqrt(maxDeg) : 0;
    radii[nd.id] = round1(9 + 17 * t);
  }

  // per-layer coastlines over GIANT members only (clean hulls; orphans excluded)
  const hulls = [];
  for (const L of LAYER_ORDER) {
    const members = nodes.filter((nd) => nd.layer === L && giantSet.has(nd.id));
    if (members.length < 1) continue;
    const pts = members.map((nd) => positions[nd.id]);
    const base = pts.length >= 3 ? convexHull(pts.map((p) => ({ x: p.x, y: p.y }))) : pts.map((p) => ({ x: p.x, y: p.y }));
    const path = catmullRomClosedPath(expandRing(base.length >= 3 ? base : pts.map((p) => ({ x: p.x, y: p.y })), o.hullMargin));
    const cen = centroidOf(pts);
    hulls.push({ layer: L, moat: MOAT_LAYERS.has(L), path, labelX: round1(cen.x), labelY: round1(cen.y) });
  }

  return {
    positions, radii, hulls,
    canvas: { w: o.w, h: o.h },
    meta: {
      components: comps.length, giant: giant.length, orphans: orphans.length,
      fiedler: Math.round((raw.__fiedler || 0) * 1e5) / 1e5,
      lambdas: (raw.__lambdas || []).map((v) => Math.round(v * 1e4) / 1e4),
    },
  };
}

export default buildSpectralAtlas;

// ---- self-verify (run directly: `node laplacian.mjs`) ----------------------
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = new URL(".", import.meta.url).pathname;
  const graph = JSON.parse(readFileSync(here + "../yuri-circuitry-graph.json", "utf8"));
  const nodes = graph.nodes, edges = graph.edges;
  const nodeIds = new Set(nodes.map((n) => n.id));
  const graphEdges = edges.filter((e) => nodeIds.has(e.to));
  let pass = 0, fail = 0;
  const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); c ? pass++ : fail++; };

  const A = buildSpectralAtlas(nodes, graphEdges);
  const B = buildSpectralAtlas(nodes, graphEdges);

  ok(Object.keys(A.positions).length === nodes.length, `all ${nodes.length} nodes positioned (got ${Object.keys(A.positions).length})`);
  ok(JSON.stringify(A) === JSON.stringify(B), "DETERMINISTIC — two runs byte-identical");
  // min pairwise distance (anti-mush)
  const ps = nodes.map((n) => A.positions[n.id]);
  let minD = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) minD = Math.min(minD, dist(ps[i].x, ps[i].y, ps[j].x, ps[j].y));
  ok(minD >= 29.0, `no mush — min pairwise dist ${round1(minD)} >= 29`);
  // eigensolver sanity: a known 2x2 symmetric [[2,1],[1,2]] -> eigvals 1,3
  const t = symEig([[2, 1], [1, 2]]);
  ok(Math.abs(t.values[0] - 1) < 1e-9 && Math.abs(t.values[1] - 3) < 1e-9, `eigensolver correct on [[2,1],[1,2]] -> [${round1(t.values[0])},${round1(t.values[1])}]`);
  // Fiedler of giant should be > 0 (connected giant)
  ok(A.meta.fiedler > 1e-6, `giant Fiedler λ2 = ${A.meta.fiedler} > 0`);
  ok(A.hulls.every((hh) => hh.path.endsWith("Z")), `all ${A.hulls.length} hull paths closed`);
  ok(ps.every((p) => p.x >= 0 && p.x <= A.canvas.w && p.y >= 0 && p.y <= A.canvas.h), "all nodes within canvas");

  console.log(`\nCOMPONENTS=${A.meta.components} giant=${A.meta.giant} orphans=${A.meta.orphans} fiedler=${A.meta.fiedler}`);
  console.log(`giant bottom-4 eigenvalues: [${A.meta.lambdas.join(", ")}]`);
  console.log(`\n${pass} passed, ${fail} failed`);

  // emit a styled debug atlas to eyeball (ground + hulls + the 77 wires + glowing nodes)
  const W = A.canvas.w, H = A.canvas.h;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const edgeCol = { calls: "#C9A14A", writes: "#4FB3A6", reads: "#6E8FB0" };
  const edgesSvg = graphEdges.filter((e) => A.positions[e.from] && A.positions[e.to]).map((e) => {
    const a = A.positions[e.from], b = A.positions[e.to];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${edgeCol[e.kind] || "#6E8FB0"}" stroke-width="1" opacity="0.16"/>`;
  }).join("");
  const commHull = A.hulls.filter((h) => !h.moat).map((h) => `<path d="${h.path}" fill="rgba(246,244,238,0.014)" stroke="rgba(246,244,238,0.10)" stroke-width="1.2"/>`).join("");
  const moatHull = A.hulls.filter((h) => h.moat).map((h) => `<path d="${h.path}" fill="rgba(201,161,74,0.05)" stroke="rgba(201,161,74,0.42)" stroke-width="1.8"/>`).join("");
  const dots = nodes.map((nd) => {
    const p = A.positions[nd.id], r = A.radii[nd.id], moat = MOAT_LAYERS.has(nd.layer);
    const fill = moat ? "#E3C677" : "#4FB3A6";
    return `<circle cx="${p.x}" cy="${p.y}" r="${r * 0.6}" fill="${fill}" opacity="0.16"/><circle cx="${p.x}" cy="${p.y}" r="${Math.max(2.5, r * 0.34)}" fill="${fill}" opacity="${moat ? 0.96 : 0.66}"/>`;
  }).join("");
  const labels = A.hulls.map((h) => `<text x="${h.labelX}" y="${h.labelY}" fill="${h.moat ? "#E3C677" : "#8E929D"}" font-family="Palatino, Georgia, serif" font-size="22" font-style="italic" text-anchor="middle" opacity="0.5">${esc(h.layer)}</text>`).join("");
  writeFileSync(here + "atlas-debug.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0%" stop-color="#161A24"/><stop offset="62%" stop-color="#0C0E13"/><stop offset="100%" stop-color="#07080B"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>${commHull}${moatHull}${edgesSvg}${dots}${labels}</svg>`);
  console.log("wrote atlas-debug.svg");
  if (fail) process.exit(1);
}
