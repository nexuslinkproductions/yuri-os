// K2 self-test -- synthetic floorplan fixture (no K1 dependency) + real-graph smoke run.
// Asserts the 5 routing invariants. Prints PASS/FAIL lines.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import routeOrthogonal from "./K2-router.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = "/Users/marcelspatz/YURI-OS-MUSUBI";

let FAILS = 0;
function ok(cond, msg) {
  if (cond) console.log("PASS " + msg);
  else { console.log("FAIL " + msg); FAILS++; }
}

// ----------------------------------------------------------------------------
// SYNTHETIC FIXTURE -- shaped exactly like K1's output:
// { blocks:[{layer,x,y,w,h,moat,cols,rows,labelH}], cells:{id:{x,y,w,h,cx,cy,layer}},
//   canvas:{w,h}, channels:{vGutters,hGutters} }
// 3 blocks in a row with channels between them. 6 cells. 8 graph edges incl. a hub.
// ----------------------------------------------------------------------------
function buildFixture() {
  const labelH = 20;
  // Block A (left), Block B (center/moat), Block C (right)
  const blocks = [
    { layer: "Energy & Math", x: 40, y: 60, w: 160, h: 200, moat: true, cols: 1, rows: 2, labelH },
    { layer: "Memory & Subconscious", x: 320, y: 60, w: 160, h: 200, moat: true, cols: 1, rows: 2, labelH },
    { layer: "Governance & Safety", x: 600, y: 60, w: 160, h: 200, moat: false, cols: 1, rows: 2, labelH },
  ];
  // gutters: vertical channels between blocks, horizontal channels above/below.
  const channels = {
    vGutters: [260, 540],            // x-centers of inter-block channels
    hGutters: [40, 290],             // y-centers of channels above and below the row
  };
  // 2 cells per block (stacked).
  function cellsFor(b) {
    const innerY = b.y + b.labelH;
    const innerH = b.h - b.labelH;
    const ch = innerH / 2;
    const cw = b.w - 16;
    const cx0 = b.x + 8;
    return [0, 1].map((r) => {
      const y = innerY + r * ch + 4;
      const w = cw, h = ch - 8;
      return { x: cx0, y, w, h, cx: cx0 + w / 2, cy: y + h / 2, layer: b.layer };
    });
  }
  const [a0, a1] = cellsFor(blocks[0]);
  const [b0, b1] = cellsFor(blocks[1]);
  const [c0, c1] = cellsFor(blocks[2]);
  const cells = {
    A0: a0, A1: a1,
    B0: b0, B1: b1,
    C0: c0, C1: c1,
  };
  // graph edges (to is a real cell id). Include a hub (A0 -> many) and intra+cross.
  const graphEdges = [
    { from: "A0", to: "B0", kind: "calls", description: "x" },
    { from: "A0", to: "B1", kind: "reads", description: "x" },
    { from: "A0", to: "C0", kind: "calls", description: "x" }, // long cross
    { from: "A1", to: "B0", kind: "writes", description: "x" },
    { from: "B0", to: "C0", kind: "calls", description: "x" },
    { from: "B0", to: "C1", kind: "reads", description: "x" },
    { from: "B1", to: "C1", kind: "calls", description: "x" },
    { from: "A0", to: "A1", kind: "writes", description: "intra-block" }, // same block
    // an edge with a missing endpoint -> must be skipped
    { from: "A0", to: "GHOST", kind: "calls", description: "skip me" },
  ];
  const canvas = { w: 800, h: 320 };
  return { blocks, cells, graphEdges, channels, canvas };
}

// ----- invariant checks -----
const TOL = 2.5; // boundary tolerance (>= blockMargin so grazes are fine)

function isAxisAligned(pts) {
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    const sameX = Math.abs(px - cx) <= 1e-6;
    const sameY = Math.abs(py - cy) <= 1e-6;
    if (!sameX && !sameY) return false;
  }
  return true;
}

function onCellBoundary(pt, cell, tol) {
  const [px, py] = pt;
  const onLR = (Math.abs(px - cell.x) <= tol || Math.abs(px - (cell.x + cell.w)) <= tol) &&
    py >= cell.y - tol && py <= cell.y + cell.h + tol;
  const onTB = (Math.abs(py - cell.y) <= tol || Math.abs(py - (cell.y + cell.h)) <= tol) &&
    px >= cell.x - tol && px <= cell.x + cell.w + tol;
  return onLR || onTB;
}

function pointInBlockInterior(px, py, b, margin) {
  return (
    px > b.x + margin + 1e-6 && px < b.x + b.w - margin - 1e-6 &&
    py > b.y + margin + 1e-6 && py < b.y + b.h - margin - 1e-6
  );
}

// sample N points along each segment, check none inside a non-endpoint block.
function segmentCutsBlock(pts, blocks, endpointBlocks, margin, samples = 40) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      for (const b of blocks) {
        if (endpointBlocks.has(b)) continue;
        if (pointInBlockInterior(px, py, b, margin)) {
          return { b, px, py };
        }
      }
    }
  }
  return null;
}

function blocksForCell(blocks, cell) {
  return blocks.filter((b) =>
    cell.cx >= b.x - 1e-6 && cell.cx <= b.x + b.w + 1e-6 &&
    cell.cy >= b.y - 1e-6 && cell.cy <= b.y + b.h + 1e-6
  );
}

// segment normalize key for overlap test (invariant 5)
function segKey(p0, p1) {
  const [x0, y0] = p0, [x1, y1] = p1;
  if (Math.abs(y0 - y1) < 1e-6) {
    return `H:${y0.toFixed(2)}:${Math.min(x0, x1).toFixed(2)}:${Math.max(x0, x1).toFixed(2)}`;
  }
  return `V:${x0.toFixed(2)}:${Math.min(y0, y1).toFixed(2)}:${Math.max(y0, y1).toFixed(2)}`;
}
// detect overlapping (not just identical) co-linear spans between two routes
function overlap1D(a0, a1, b0, b1) {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return hi - lo > 1.0; // > 1px shared run = overdraw
}

function runChecks(label, fixture) {
  console.log(`\n=== ${label} ===`);
  const { blocks, cells, graphEdges, channels } = fixture;
  const margin = 2; // matches kernel blockMargin
  const out = routeOrthogonal(blocks, cells, graphEdges, channels, { blockMargin: margin });
  const routes = out.routes;

  // ---- Invariant 1: every graph edge with both endpoints present -> exactly one route.
  const present = (id) => Object.prototype.hasOwnProperty.call(cells, id);
  const expected = graphEdges.filter((e) => present(e.from) && present(e.to) && e.from !== e.to);
  ok(routes.length === expected.length,
    `INV1 every-valid-edge-routed: routes=${routes.length} expected=${expected.length}`);

  // also: no route for the GHOST/missing edge
  const ghost = routes.find((r) => r.to === "GHOST" || r.from === "GHOST");
  ok(!ghost, `INV1b missing-endpoint-edge-skipped`);

  let inv2 = true, inv3 = true, inv4 = true;
  let inv4Detail = "";
  for (const r of routes) {
    const pts = r._pts;
    // INV2 axis-aligned
    if (!isAxisAligned(pts)) { inv2 = false; }
    // INV3 endpoints on cell boundary
    const sCell = cells[r.from], dCell = cells[r.to];
    const first = pts[0], last = pts[pts.length - 1];
    if (!onCellBoundary(first, sCell, TOL)) inv3 = false;
    if (!onCellBoundary(last, dCell, TOL)) inv3 = false;
    // INV4 no interior cut of non-endpoint blocks
    const epBlocks = new Set([...blocksForCell(blocks, sCell), ...blocksForCell(blocks, dCell)]);
    const cut = segmentCutsBlock(pts, blocks, epBlocks, margin);
    if (cut) { inv4 = false; inv4Detail = `${r.from}->${r.to} cuts ${cut.b.layer} at (${cut.px.toFixed(1)},${cut.py.toFixed(1)})`; }
  }
  ok(inv2, `INV2 all-segments-axis-aligned`);
  ok(inv3, `INV3 endpoints-on-cell-boundary (tol=${TOL})`);
  ok(inv4, `INV4 no-route-cuts-nonendpoint-block-interior${inv4Detail ? " | " + inv4Detail : ""}`);

  // ---- Invariant 5: parallel co-channel routes lane-separated (no identical overlapping seg).
  // Build per-route segment list, then compare all pairs for overlapping collinear runs
  // on the SAME gridline that aren't just touching at a shared endpoint.
  const segsByRoute = routes.map((r) => {
    const segs = [];
    for (let i = 0; i < r._pts.length - 1; i++) segs.push([r._pts[i], r._pts[i + 1]]);
    return segs;
  });
  let overdraw = null;
  for (let a = 0; a < segsByRoute.length && !overdraw; a++) {
    for (let b = a + 1; b < segsByRoute.length && !overdraw; b++) {
      for (const sa of segsByRoute[a]) {
        for (const sb of segsByRoute[b]) {
          const aH = Math.abs(sa[0][1] - sa[1][1]) < 1e-6;
          const bH = Math.abs(sb[0][1] - sb[1][1]) < 1e-6;
          if (aH !== bH) continue; // different orientation can't overdraw collinearly
          if (aH) {
            if (Math.abs(sa[0][1] - sb[0][1]) < 1e-6 &&
                overlap1D(sa[0][0], sa[1][0], sb[0][0], sb[1][0])) {
              overdraw = { a: routes[a], b: routes[b], y: sa[0][1] };
            }
          } else {
            if (Math.abs(sa[0][0] - sb[0][0]) < 1e-6 &&
                overlap1D(sa[0][1], sa[1][1], sb[0][1], sb[1][1])) {
              overdraw = { a: routes[a], b: routes[b], x: sa[0][0] };
            }
          }
          if (overdraw) break;
        }
        if (overdraw) break;
      }
    }
  }
  ok(!overdraw, `INV5 no-parallel-overdraw${overdraw ? ` | ${overdraw.a.from}->${overdraw.a.to} vs ${overdraw.b.from}->${overdraw.b.to}` : ""}`);

  // extra: path strings present & non-empty, bends counted
  const allPaths = routes.every((r) => typeof r.path === "string" && r.path.startsWith("M"));
  ok(allPaths, `EXTRA all-routes-have-svg-path-string`);
  const bendsOk = routes.every((r) => Number.isInteger(r.bends) && r.bends >= 0);
  ok(bendsOk, `EXTRA all-routes-have-bend-count`);

  // determinism: run twice, identical output
  const out2 = routeOrthogonal(blocks, cells, graphEdges, channels, { blockMargin: margin });
  const same = JSON.stringify(out.routes.map(stripPts)) === JSON.stringify(out2.routes.map(stripPts));
  ok(same, `EXTRA deterministic-rerun-identical`);

  // INV6 -- order-invariance: shuffling the input edge order must NOT change output
  // geometry. (Greedy lane occupancy makes this a real risk; the content-hash
  // ordering is what guarantees it.) Shuffle with a fixed seeded permutation.
  const shuffled = seededShuffle(graphEdges, 0x1234abcd);
  const out3 = routeOrthogonal(blocks, cells, shuffled, channels, { blockMargin: margin });
  const norm = (o) => o.routes.map((r) => `${r.from}>${r.to}:${r.path}:${r.bends}`).sort().join("|");
  ok(norm(out) === norm(out3), `INV6 order-invariant-routing (input-shuffle stable)`);

  return routes;
}
function stripPts(r) { const { _pts, ...rest } = r; return rest; }
function seededShuffle(arr, seed) {
  let a = seed >>> 0;
  const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ----------------------------------------------------------------------------
// REAL GRAPH fixture: build a minimal real floorplan deterministically from the
// graph (grid of layer-blocks). We don't have K1, so synthesize a layout that
// has real cells + channels and run the router over all 77 real graph edges.
// ----------------------------------------------------------------------------
function buildRealFixture() {
  const graphPath = resolve(REPO, "02_RESOURCES/RESEARCH/yuri-circuitry-graph.json");
  const g = JSON.parse(readFileSync(graphPath, "utf8"));
  const ids = new Set(g.nodes.map((n) => n.id));
  const graphEdges = g.edges.filter((e) => ids.has(e.to));

  const LAYER_ORDER = [
    "Cognition & Persona", "Energy & Math", "Memory & Subconscious",
    "Retrieval & Knowledge", "Learning & Continuity", "Governance & Safety",
    "Skills & Orchestration", "Token-Efficiency & Session",
    "Hidden / Meta / Self-referential",
  ];
  // group nodes by layer
  const byLayer = new Map(LAYER_ORDER.map((l) => [l, []]));
  for (const n of g.nodes) { if (byLayer.has(n.layer)) byLayer.get(n.layer).push(n); }

  // lay blocks in a 3-col grid; cells in a grid inside each block.
  const labelH = 22, pad = 10, cellW = 150, cellH = 40, gapX = 90, gapY = 70;
  const blocks = [], cells = {};
  const COLS = 3;
  let bi = 0;
  const colW = new Array(COLS).fill(0);
  const blockMeta = [];
  for (const layer of LAYER_ORDER) {
    const ns = byLayer.get(layer);
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ns.length))));
    const rows = Math.ceil(ns.length / cols);
    const w = pad * 2 + cols * cellW + (cols - 1) * 10;
    const h = labelH + pad * 2 + rows * cellH + (rows - 1) * 10;
    blockMeta.push({ layer, ns, cols, rows, w, h });
  }
  // place in grid of COLS blocks per row
  let cursorX = 60, cursorY = 60, rowMaxH = 0, colIdx = 0;
  const rowGap = 80, blockGapX = 140;
  for (const m of blockMeta) {
    if (colIdx === COLS) { cursorX = 60; cursorY += rowMaxH + rowGap; rowMaxH = 0; colIdx = 0; }
    const b = { layer: m.layer, x: cursorX, y: cursorY, w: m.w, h: m.h, moat: false, cols: m.cols, rows: m.rows, labelH };
    blocks.push(b);
    // cells
    let ci = 0;
    for (const n of m.ns) {
      const cc = ci % m.cols, cr = Math.floor(ci / m.cols);
      const x = b.x + pad + cc * (cellW + 10);
      const y = b.y + labelH + pad + cr * (cellH + 10);
      cells[n.id] = { x, y, w: cellW, h: cellH, cx: x + cellW / 2, cy: y + cellH / 2, layer: m.layer };
      ci++;
    }
    cursorX += m.w + blockGapX;
    rowMaxH = Math.max(rowMaxH, m.h);
    colIdx++;
  }
  const canvasW = Math.max(...blocks.map((b) => b.x + b.w)) + 60;
  const canvasH = cursorY + rowMaxH + 60;
  // channels: vertical gutters at midpoints between block columns; horizontal between rows.
  const xsEdges = [...new Set(blocks.flatMap((b) => [b.x, b.x + b.w]))].sort((a, z) => a - z);
  const ysEdges = [...new Set(blocks.flatMap((b) => [b.y, b.y + b.h]))].sort((a, z) => a - z);
  const vGutters = [];
  for (let i = 0; i < xsEdges.length - 1; i++) { const mid = (xsEdges[i] + xsEdges[i + 1]) / 2; if (mid - xsEdges[i] > 20) vGutters.push(mid); }
  const hGutters = [];
  for (let i = 0; i < ysEdges.length - 1; i++) { const mid = (ysEdges[i] + ysEdges[i + 1]) / 2; if (mid - ysEdges[i] > 20) hGutters.push(mid); }
  // also add outer channels
  vGutters.push(30, canvasW - 30);
  hGutters.push(30, canvasH - 30);

  return { blocks, cells, graphEdges, channels: { vGutters: [...new Set(vGutters)], hGutters: [...new Set(hGutters)] }, canvas: { w: canvasW, h: canvasH } };
}

// ---------- run ----------
const synth = buildFixture();
runChecks("SYNTHETIC FIXTURE", synth);

const real = buildRealFixture();
const realRoutes = runChecks("REAL GRAPH (77 graph edges, synthesized floorplan)", real);

// report summary stats on the real run
const ids = new Set(Object.keys(real.cells));
const realEdges = real.graphEdges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
const totalBends = realRoutes.reduce((s, r) => s + r.bends, 0);
const avgBends = (totalBends / realRoutes.length).toFixed(2);
const maxBends = Math.max(...realRoutes.map((r) => r.bends));
console.log(`\nSTATS real: edges=${realEdges.length} routes=${realRoutes.length} avgBends=${avgBends} maxBends=${maxBends}`);

console.log(`\n${FAILS === 0 ? "PASS ALL-INVARIANTS-GREEN" : `FAIL ${FAILS}-CHECKS-FAILED`}`);
process.exit(FAILS === 0 ? 0 : 1);
