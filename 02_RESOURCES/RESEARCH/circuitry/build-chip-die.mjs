#!/usr/bin/env node
// build-chip-die.mjs
// ELABORATE CYBERPUNK SILICON-DIE generator — the interactive YURI circuitry hero.
//
//   node 02_RESOURCES/RESEARCH/circuitry/build-chip-die.mjs
//
// Fuses the verified kernels into one interactive, self-contained instrument:
//   K1 buildFloorplan  -> die-block + cell floorplan (3x3 moat-centred lattice)
//   (this file)        -> STRUCTURAL SIZING: degree-ranked variable die-cell footprints
//                         (master-plan §10.1 nodeSize=f(structure); degree now,
//                          betweenness/spectral = the Wave-1 architecture-graph engine)
//   K2 routeOrthogonal -> Manhattan metal traces (channel-assigned, lane-separated, vias)
//   (this file)        -> the ELABORATE render: die-seal guard ring, I/O bond-pad ring,
//                         power-rail mesh, corner fiducials, sub-cell array texture,
//                         multi-metal-layer traces, neon bloom, scanlines, signal pulses,
//                         + the full interactive shell (pan/zoom/pinch/minimap/panel/
//                         search/moat-spotlight/chips/keyboard/legend/HUD telemetry).
//
// Source of truth : ../yuri-circuitry-graph.json (83 nodes / 77 graph edges)
// Aesthetic target : ./yuri-circuitry-chip.svg, ELEVATED — a real cyberpunk silicon die,
//                    not flat labelled boxes. Data is INLINED so it opens via file://.
// Output           : ./yuri-chip-die.html
//
// Pure Node ESM, zero npm deps. Deterministic (kernels are seeded; no wall-clock in layout).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFloorplan } from "./K1-floorplan.mjs";
import routeOrthogonal from "./K2-router.mjs";
import { buildRadialFloorplan } from "./K1r-radial.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "yuri-circuitry-graph.json");
const OUT = join(HERE, "yuri-chip-die.html");

const graph = JSON.parse(readFileSync(SRC, "utf8"));
const nodes = graph.nodes ?? [];
const edges = graph.edges ?? [];

const MOAT_LAYERS = new Set(["Energy & Math", "Cognition & Persona", "Memory & Subconscious"]);

// short etched block names + ring colour class (matches the loved SVG vocabulary)
const BLOCK_SHORT = {
  "Cognition & Persona": "COGNITION",
  "Energy & Math": "ENERGY · MATH",
  "Memory & Subconscious": "MEMORY",
  "Retrieval & Knowledge": "RETRIEVAL",
  "Learning & Continuity": "LEARNING",
  "Governance & Safety": "GOVERNANCE",
  "Skills & Orchestration": "SKILLS",
  "Token-Efficiency & Session": "SESSION · TOKENS",
  "Hidden / Meta / Self-referential": "HIDDEN · META",
};

// --- status from prose (live / dormant / phantom) ---
function statusOf(n) {
  const d = (n.description || "") + " " + (n.label || "");
  if (!n.files || n.files.length === 0 || /\bPHANTOM\b/.test(d)) return "phantom";
  if (/\bUNWIRED\b|\bDORMANT\b|\bSUPERSEDED\b|NO live trigger|no live hook|currently surfaces nothing/i.test(d))
    return "dormant";
  return "live";
}

// ----------------------------------------------------------------------------
// 1) FLOORPLAN — K1 gives uniform slots; we keep the slot grid (clean packing)
//    and shrink each cell within its slot by a STRUCTURAL size factor.
// ----------------------------------------------------------------------------
const LAYOUT = "radial"; // "radial" core-and-rings | "die" orthogonal 3x3 floorplan

// graph edges = both endpoints are real node ids (the 77 wired traces).
const nodeIds = new Set(nodes.map((n) => n.id));
const graphEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);

const OPTS = { cell: 128, cellGap: 22, gutter: 84, pad: 22, labelH: 38, margin: 84 };
const ROPTS = { cell: 116, cellGap: 18, pad: 20, labelH: 34 };
const floor = LAYOUT === "radial" ? buildRadialFloorplan(nodes, graphEdges, ROPTS) : buildFloorplan(nodes, OPTS);
const center = floor.center || { x: floor.canvas.w / 2, y: floor.canvas.h / 2 };

// artifact I/O = edges whose target is a file/state path, not a node (shown in panel).
const artifactIO = new Map();
for (const e of edges) {
  if (!nodeIds.has(e.to)) {
    if (!artifactIO.has(e.from)) artifactIO.set(e.from, []);
    artifactIO.get(e.from).push({ kind: e.kind, target: e.to, description: e.description });
  }
}

// ----------------------------------------------------------------------------
// 2) STRUCTURAL SIZING — degree-ranked, normalized so hubs can't swamp (Kiali
//    rank-then-normalize). nodeSize = f(degree, moat). Wave-1 will add
//    betweenness + spectral-centrality via the architecture-graph engine.
// ----------------------------------------------------------------------------
const degree = new Map(nodes.map((n) => [n.id, 0]));
for (const e of graphEdges) {
  degree.set(e.from, (degree.get(e.from) || 0) + 1);
  degree.set(e.to, (degree.get(e.to) || 0) + 1);
}
// rank-normalize degree to a percentile in [0,1] (ties share a rank).
const degVals = [...degree.values()].sort((a, b) => a - b);
function pctRank(v) {
  // fraction of values strictly below v -> stable, swamp-proof
  let lo = 0;
  while (lo < degVals.length && degVals[lo] < v) lo++;
  return degVals.length <= 1 ? 1 : lo / (degVals.length - 1);
}
const SIZE_MIN = 0.6, SIZE_MAX = 1.0; // fraction of the slot footprint
function sizeScaleFor(id, moat) {
  const r = pctRank(degree.get(id) || 0);
  let s = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * r;
  if (moat) s = Math.min(SIZE_MAX, s + 0.07); // moat organs read a touch heavier
  return s;
}

// scale each cell within its slot (centre fixed = slot centre so traces stay centred).
const cells = {};
for (const [id, c] of Object.entries(floor.cells)) {
  const moat = MOAT_LAYERS.has(c.layer);
  const s = sizeScaleFor(id, moat);
  const w = Math.round(c.w * s), h = Math.round(c.h * s);
  const x = Math.round(c.cx - w / 2), y = Math.round(c.cy - h / 2);
  cells[id] = { x, y, w, h, cx: c.cx, cy: c.cy, layer: c.layer, sizeScale: s, slotW: c.w, slotH: c.h };
}

// ----------------------------------------------------------------------------
// 3) ROUTE — K2 over the scaled cells (general over any cell rects).
// ----------------------------------------------------------------------------
function curvedRoutes(cellMap, edgeList, ctr) {
  return edgeList.filter((e) => cellMap[e.from] && cellMap[e.to]).map((e) => {
    const a = cellMap[e.from], b = cellMap[e.to];
    const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
    const t = 0.2; // pull the control point toward the die centre -> radial field-line flow
    const cxp = mx + (ctr.x - mx) * t, cyp = my + (ctr.y - my) * t;
    const path = `M ${a.cx.toFixed(1)} ${a.cy.toFixed(1)} Q ${cxp.toFixed(1)} ${cyp.toFixed(1)} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)}`;
    return { from: e.from, to: e.to, kind: e.kind, path, bends: 0 };
  });
}
const routes = LAYOUT === "radial"
  ? curvedRoutes(cells, graphEdges, center)
  : routeOrthogonal(floor.blocks, cells, graphEdges, floor.channels, { blockMargin: 2, laneGap: 7, cornerRadius: 5 }).routes;

// vias = interior bend vertices of a route (metal-layer contacts at every corner).
function viasOf(pts) {
  const v = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    if (Math.sign(cx - px) !== Math.sign(nx - cx) || Math.sign(cy - py) !== Math.sign(ny - cy))
      v.push([Math.round(cx), Math.round(cy)]);
  }
  return v;
}

// ----------------------------------------------------------------------------
// 4) I/O bond-pad ring + corner fiducials (decorative die-package geometry).
// ----------------------------------------------------------------------------
const CW = floor.canvas.w, CH = floor.canvas.h;
const RING_INSET = 46;               // pad ring offset from die edge
const PAD = 12, PAD_GAP = 30;        // bond-pad size + spacing
function padRing() {
  const pads = [];
  const L = RING_INSET, R = CW - RING_INSET, T = RING_INSET, B = CH - RING_INSET;
  const along = (a, b) => Math.max(2, Math.floor((b - a) / PAD_GAP));
  let n = 0;
  const push = (x, y, side) => pads.push({ x: Math.round(x), y: Math.round(y), side, i: n++ });
  const nx = along(L, R), ny = along(T, B);
  for (let i = 0; i <= nx; i++) { const x = L + (i / nx) * (R - L); push(x, T, "T"); push(x, B, "B"); }
  for (let i = 1; i < ny; i++) { const y = T + (i / ny) * (B - T); push(L, y, "L"); push(R, y, "R"); }
  return pads;
}
const pads = padRing();

// ----------------------------------------------------------------------------
// 5) PAYLOAD
// ----------------------------------------------------------------------------
const counts = { live: 0, dormant: 0, phantom: 0 };
const nodeOut = nodes.map((n) => {
  const c = cells[n.id];
  const st = statusOf(n);
  counts[st]++;
  return {
    id: n.id, label: n.label, layer: n.layer, short: BLOCK_SHORT[n.layer] || n.layer,
    files: n.files || [], triggeredBy: n.triggeredBy || "", description: n.description || "",
    status: st, moat: MOAT_LAYERS.has(n.layer),
    x: c.x, y: c.y, w: c.w, h: c.h, cx: c.cx, cy: c.cy,
    deg: degree.get(n.id) || 0, sizeScale: +c.sizeScale.toFixed(3),
    io: artifactIO.get(n.id) || [],
  };
});
const blockOut = floor.blocks.map((b) => ({
  layer: b.layer, short: BLOCK_SHORT[b.layer] || b.layer, x: b.x, y: b.y, w: b.w, h: b.h,
  moat: b.moat, arc: !!b.arc, core: !!b.core, perimeter: !!b.perimeter, labelH: b.labelH,
  cx: b.cx, cy: b.cy, discR: b.discR, labelX: b.labelX, labelY: b.labelY,
  labelAngle: b.labelAngle, a0: b.a0, a1: b.a1, rIn: b.rIn, rOut: b.rOut, acx: b.acx, acy: b.acy,
  count: nodes.filter((n) => n.layer === b.layer).length,
}));

const payload = {
  meta: {
    generatedAt: graph.generatedAt || null,
    nodeCount: nodes.length, edgeCount: graphEdges.length, blockCount: blockOut.length,
    counts, canvas: { w: CW, h: CH },
    maxDeg: Math.max(...degree.values()), coreR: floor.coreR || 0,
  },
  center,
  blocks: blockOut,
  nodes: nodeOut,
  routes: routes.map((r) => ({ from: r.from, to: r.to, kind: r.kind, path: r.path, bends: r.bends, vias: viasOf(r._pts || []) })),
  pads,
  channels: floor.channels,
};
const json = JSON.stringify(payload);

// ----------------------------------------------------------------------------
// 6) HTML — elaborate cyberpunk silicon die + interactive shell. Data inlined.
// ----------------------------------------------------------------------------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#04060a">
<title>YURI OS — Circuit Die · MUSUBI ONE</title>
<meta name="description" content="The YURI organ map rendered as an interactive cyberpunk silicon die: ${payload.meta.nodeCount} cells, ${payload.meta.edgeCount} traces, ${payload.meta.blockCount} functional blocks — the moat made visible, structurally sized by connectivity.">
<style>
/* =====================================================================
   YURI — CIRCUIT DIE. Cyberpunk silicon: cyan substrate, gold moat core,
   neon bloom, metal-layer traces, scanline + vignette atmosphere.
   Self-contained, system fonts only.
   ===================================================================== */
:root{
  --die:#04060a; --die-2:#070b12; --die-3:#0a0f18;
  --ink:#F4ECD2; --ink-2:#9fb6c9; --ink-3:#5f7689; --ink-4:#3b4a59;
  --cyan:#5AD2FF; --cyan-2:#9fdcff; --cyan-deep:#2E6F8F; --cyan-dim:rgba(90,210,255,0.30);
  --teal:#4FB3A6; --teal-bright:#74e6d6;
  --gold:#C9A14A; --gold-bright:#E3C677; --gold-deep:#8A6A28;
  --pos:#54d6a0; --warn:#E3B24A; --risk:#E0776B; --neutral:#6E9FD0;
  --grid:rgba(90,210,255,0.07); --grid2:rgba(90,210,255,0.135);
  --hair:rgba(90,210,255,0.2); --hair-gold:rgba(201,161,74,0.32);
  --hot:#ff5ad2; --violet:#9b7bff;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --serif:"Hoefler Text","Iowan Old Style",Palatino,Georgia,serif;
  --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  --dur:420ms; --fast:170ms; --ease:cubic-bezier(0.16,1,0.30,1);
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;height:100%;overflow:hidden;background:var(--die);-webkit-text-size-adjust:100%;}
body{color:var(--ink-2);font-family:var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
::selection{background:var(--cyan);color:var(--die);}

/* stage / pan-zoom viewport */
#stage{position:fixed;inset:0;z-index:1;cursor:grab;touch-action:none;
  background:radial-gradient(130% 110% at 50% 42%,#0a1018 0%,var(--die) 58%,#010204 100%);}
#stage.grabbing{cursor:grabbing;}
#viewport{position:absolute;inset:0;}
#boardwrap{width:100%;height:100%;}
/* perf: shed heavy filters while moving, restore crisp metal at rest */
.nav .c-base,.nav .blk-strip,.nav .moat-back,.nav .blk.moat .blk-bg,.nav .cell,.nav .cell.sel,.nav .tracec.hl{filter:none!important;}
svg.board{display:block;width:100%;height:100%;}

/* soft overhead light + vignette atmosphere (above board, below HUD) */
#fx{position:fixed;inset:0;z-index:6;pointer-events:none;}
#fx::before{content:"";position:absolute;inset:0;
  background:radial-gradient(75% 55% at 50% -4%,rgba(168,210,255,0.07),transparent 66%);}
#fx::after{content:"";position:absolute;inset:0;
  background:radial-gradient(135% 120% at 50% 48%,transparent 66%,rgba(2,4,8,0.32) 90%,rgba(1,2,4,0.62) 100%);}
/* HUD cockpit frame + corner brackets */
#frame{position:fixed;inset:10px;z-index:19;pointer-events:none;border:1px solid rgba(90,210,255,0.07);border-radius:3px;}
#frame i{position:absolute;width:24px;height:24px;border:2px solid var(--cyan);opacity:0.55;}
#frame i.tl{top:-1px;left:-1px;border-right:none;border-bottom:none;}
#frame i.tr{top:-1px;right:-1px;border-left:none;border-bottom:none;}
#frame i.bl{bottom:-1px;left:-1px;border-right:none;border-top:none;}
#frame i.br{bottom:-1px;right:-1px;border-left:none;border-top:none;}

/* HUD header */
header{position:fixed;top:0;left:0;right:0;z-index:20;padding:16px 24px 30px;pointer-events:none;
  background:linear-gradient(180deg,rgba(2,4,8,0.94) 0%,rgba(2,4,8,0.55) 62%,transparent 100%);}
.eyebrow{font-family:var(--mono);font-size:0.64rem;letter-spacing:0.34em;text-transform:uppercase;
  color:var(--cyan);display:inline-flex;align-items:center;gap:9px;}
.eyebrow::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--cyan));}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--gold-bright);box-shadow:0 0 8px var(--gold-bright);animation:pulse 2.4s var(--ease) infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
h1{font-family:var(--serif);font-weight:600;letter-spacing:0.01em;line-height:1;margin:8px 0 0;
  font-size:clamp(1.6rem,3.4vw,2.7rem);color:var(--gold-bright);
  text-shadow:0 0 24px rgba(201,161,74,0.35);}
h1 .os{color:var(--cyan-2);text-shadow:0 0 22px rgba(90,210,255,0.4);}
.telem{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-family:var(--mono);font-size:0.72rem;color:var(--ink-3);}
.telem b{color:var(--cyan-2);font-weight:600;}
.telem .sep{color:var(--ink-4);}
.moatline{margin-top:8px;max-width:640px;font-size:0.8rem;line-height:1.5;color:var(--ink-3);}
.moatline .g{color:var(--gold-bright);}

/* control rail */
#rail{position:fixed;top:16px;right:24px;z-index:22;display:flex;gap:7px;align-items:center;pointer-events:auto;}
.btn,.inp{font-family:var(--mono);font-size:0.72rem;background:rgba(10,15,24,0.85);color:var(--ink-2);
  border:1px solid var(--hair);border-radius:5px;padding:8px 11px;cursor:pointer;backdrop-filter:blur(7px);
  transition:border-color var(--fast),color var(--fast),box-shadow var(--fast);}
.inp{cursor:text;width:170px;color:var(--ink);}
.inp::placeholder{color:var(--ink-4);}
.btn:hover,.inp:focus{border-color:var(--cyan);color:var(--ink);outline:none;box-shadow:0 0 14px -4px var(--cyan);}
.btn.on{border-color:var(--gold);color:var(--gold-bright);box-shadow:0 0 16px -4px var(--gold);background:rgba(201,161,74,0.1);}

/* block chips */
#chips{position:fixed;top:112px;left:24px;right:24px;z-index:18;display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto;
  -webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent);}
.chip{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.06em;padding:5px 9px;border-radius:4px;
  border:1px solid var(--hair);background:rgba(7,11,18,0.7);backdrop-filter:blur(6px);color:var(--ink-3);
  cursor:pointer;white-space:nowrap;transition:all var(--fast);}
.chip:hover{color:var(--ink);border-color:var(--cyan-dim);}
.chip.moat{color:var(--gold);border-color:var(--hair-gold);}
.chip.on{background:var(--cyan);color:var(--die);border-color:transparent;font-weight:700;}
.chip.moat.on{background:var(--gold-bright);}
.chip .c{opacity:0.6;margin-left:5px;}

/* legend */
#legend{position:fixed;left:24px;bottom:24px;z-index:20;background:rgba(7,11,18,0.86);backdrop-filter:blur(10px);
  border:1px solid var(--hair);border-radius:8px;padding:13px 15px;font-family:var(--mono);font-size:0.66rem;
  color:var(--ink-3);max-width:280px;box-shadow:0 18px 40px -18px #000;}
#legend .lh{font-size:0.58rem;letter-spacing:0.22em;text-transform:uppercase;color:var(--cyan);margin:0 0 9px;}
.lg{display:flex;align-items:center;gap:9px;margin:4px 0;}
.sw{width:18px;height:2px;border-radius:2px;flex:none;}
.dot{width:8px;height:8px;border-radius:50%;flex:none;}
.legrow{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-top:9px;padding-top:9px;border-top:1px solid var(--hair);}

/* minimap */
#minimap{position:fixed;right:24px;bottom:24px;z-index:20;width:210px;border:1px solid var(--hair);
  border-radius:8px;background:rgba(2,4,8,0.82);backdrop-filter:blur(8px);overflow:hidden;box-shadow:0 18px 40px -18px #000;cursor:pointer;}
#minimap svg{display:block;}
#mmView{fill:rgba(90,210,255,0.1);stroke:var(--cyan);stroke-width:2;}

/* detail panel */
#panel{position:fixed;top:0;right:0;height:100%;width:min(420px,92vw);z-index:30;display:flex;flex-direction:column;
  background:linear-gradient(180deg,var(--die-2),var(--die));border-left:1px solid var(--hair);
  box-shadow:-30px 0 60px -30px #000;transform:translateX(100%);transition:transform var(--dur) var(--ease);}
#panel.open{transform:translateX(0);}
#panel .ph{position:relative;padding:26px 26px 18px;border-bottom:1px solid var(--hair);
  background:linear-gradient(180deg,rgba(90,210,255,0.05),transparent 70%);}
#panel .ph::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--cyan),var(--gold));}
.p-layer{font-family:var(--mono);font-size:0.64rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--cyan);}
#panel h2{font-family:var(--serif);font-weight:600;font-size:1.4rem;line-height:1.18;margin:8px 0 0;color:var(--ink);}
.statusrow{display:flex;gap:6px;align-items:center;margin-top:13px;flex-wrap:wrap;}
.badge{font-family:var(--mono);font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase;padding:3px 9px;border-radius:4px;border:1px solid currentColor;}
.b-live{color:var(--pos);} .b-dormant{color:var(--warn);} .b-phantom{color:var(--risk);}
.b-moat{color:var(--gold-bright);background:rgba(201,161,74,0.1);}
.b-deg{color:var(--cyan-2);background:rgba(90,210,255,0.08);}
#panel .body{padding:20px 26px 40px;overflow-y:auto;}
.sec{margin-top:20px;} .sec:first-child{margin-top:0;}
.sec h3{font-family:var(--mono);font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-4);margin:0 0 8px;}
.desc{font-size:0.94rem;line-height:1.62;color:var(--ink);}
.trig{font-size:0.84rem;line-height:1.55;color:var(--ink-2);}
#panel code{font-family:var(--mono);font-size:0.72rem;color:var(--cyan-2);word-break:break-all;display:block;padding:4px 0;border-bottom:1px solid var(--hair);}
.io{font-family:var(--mono);font-size:0.7rem;line-height:1.5;padding:7px 0;border-bottom:1px solid var(--hair);}
.io .k{color:var(--gold);text-transform:uppercase;font-size:0.56rem;letter-spacing:0.08em;}
.io .d{color:var(--ink-3);margin-top:2px;}
.conn{font-size:0.8rem;line-height:1.5;padding:8px 0;border-bottom:1px solid var(--hair);cursor:pointer;display:flex;gap:8px;align-items:baseline;transition:color var(--fast);}
.conn:hover{color:var(--cyan-2);}
.conn .ar{font-family:var(--mono);font-size:0.6rem;color:var(--ink-4);white-space:nowrap;}
#closeP{position:absolute;top:18px;right:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;background:var(--die-3);border:1px solid var(--hair);color:var(--ink-3);font-size:15px;line-height:1;}
#closeP:hover{color:var(--ink);border-color:var(--cyan);}

/* ---- svg die elements ---- */
.seal{fill:none;stroke:var(--hair-gold);stroke-width:1.5;stroke-dasharray:1 5;}
.seal2{fill:none;stroke:rgba(90,210,255,0.16);stroke-width:1;}
.pad{fill:#0c1320;stroke:var(--gold);stroke-width:1;}
.pad.cyan{stroke:var(--cyan-deep);}
.fiducial{stroke:var(--cyan);stroke-width:1.4;fill:none;opacity:0.6;}
.prail{fill:none;stroke-width:3.5;opacity:0.08;}
.prail.v{stroke:var(--gold);} .prail.h{stroke:var(--cyan);}

.blk-bg{fill:rgba(90,210,255,0.022);stroke:var(--cyan-dim);stroke-width:1.2;}
.blk.moat .blk-bg{fill:rgba(201,161,74,0.05);stroke:var(--gold);stroke-width:2;filter:url(#softglow);}
.blk-strip{fill:url(#stripCool);filter:url(#metal);}
.blk.moat .blk-strip{fill:url(#stripGold);}
.blk-array{stroke:rgba(90,210,255,0.11);stroke-width:1;}
.blk.moat .blk-array{stroke:rgba(201,161,74,0.14);}
.blk-name{font-family:var(--mono);font-size:15px;font-weight:700;letter-spacing:0.18em;fill:var(--cyan-2);}
.blk.moat .blk-name{fill:var(--gold-bright);}
.blk-count{font-family:var(--mono);font-size:11px;letter-spacing:0.08em;fill:var(--ink-4);}
.blk.moat .blk-count{fill:var(--gold);}
.arc-band{fill:rgba(90,210,255,0.022);stroke:rgba(90,210,255,0.12);stroke-width:1;}
.arc-band.perim{fill:rgba(201,161,74,0.04);stroke:rgba(201,161,74,0.28);stroke-dasharray:2 6;}
.arc-name{font-family:var(--mono);font-size:13px;letter-spacing:0.16em;fill:var(--cyan-2);opacity:0.85;}
.arc-name.perim{fill:var(--gold-bright);}
.core-disc{fill:rgba(201,161,74,0.03);stroke:rgba(201,161,74,0.22);stroke-width:1.3;}
.core-disc.moat{stroke:rgba(201,161,74,0.3);}
.core-name{font-family:var(--mono);font-size:14px;font-weight:700;letter-spacing:0.18em;fill:var(--gold-bright);opacity:0.92;}
.fill{stroke:rgba(90,210,255,0.06);stroke-width:1;fill:none;}
.fill.g{stroke:rgba(201,161,74,0.075);}
.vfield{fill:rgba(90,210,255,0.13);}
.blk.moat .vfield{fill:rgba(201,161,74,0.16);}
.moat-back{opacity:0.9;}
.hubtick{fill:var(--hot);filter:drop-shadow(0 0 3px var(--hot));}

.trace{fill:none;stroke-width:1.5;opacity:0.5;transition:opacity var(--fast),stroke-width var(--fast);}
.trace.calls{stroke:var(--gold);} .trace.reads{stroke:var(--neutral);} .trace.writes{stroke:var(--teal);}
.trace.hl{opacity:1;stroke-width:2.1;filter:url(#softglow);}
.trace.dim{opacity:0.04;}
.flow{fill:none;stroke:var(--gold-bright);stroke-width:2.2;opacity:0;stroke-dasharray:3 16;stroke-linecap:round;filter:url(#softglow);}
.flow.on{opacity:0.95;animation:flow 1.1s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-38;}}
.via{fill:#0a0f18;stroke-width:1;opacity:0.32;transition:opacity var(--fast);}
.via.calls{stroke:var(--gold);} .via.reads{stroke:var(--neutral);} .via.writes{stroke:var(--teal);}
.via.hl{opacity:1;}

.cell{cursor:pointer;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.62));}
.cell .c-base{fill:url(#cellMetal);filter:url(#metal);}
.cell.moat .c-base{fill:url(#cellMetalGold);}
.cell .c-bg{fill:none;stroke:rgba(168,196,220,0.55);stroke-width:1.1;transition:stroke var(--fast);}
.cell.moat .c-bg{stroke:rgba(231,201,127,0.7);}
.cell .c-glint{fill:url(#glint);pointer-events:none;}
.cell .c-tone,.cell .c-streak{pointer-events:none;}
.cell .c-brush{fill:url(#brush);pointer-events:none;}
.cell .c-top{stroke:rgba(198,228,255,0.65);stroke-width:1;}
.cell.moat .c-top{stroke:rgba(255,232,170,0.8);}
.cell .c-leg{stroke:#8fb6cf;stroke-width:1.8;opacity:0.7;}
.cell.moat .c-leg{stroke:var(--gold-bright);opacity:0.85;}
.cell .c-name{font-family:var(--mono);font-size:9.5px;fill:#cfe2f0;pointer-events:none;}
.cell.moat .c-name{fill:#f6ecd2;}
.cell .c-pad{fill:var(--cyan);opacity:0.95;filter:drop-shadow(0 0 2.5px var(--cyan));}
.cell[data-status="dormant"] .c-bg{stroke:var(--warn);stroke-dasharray:5 3;}
.cell[data-status="phantom"] .c-bg{stroke:var(--risk);stroke-dasharray:2 4;}
.cell:hover .c-bg{stroke:var(--cyan-2);stroke-width:1.6;}
.cell.moat:hover .c-bg{stroke:var(--gold-bright);}
.cell.sel{filter:drop-shadow(0 0 11px rgba(90,210,255,0.55)) drop-shadow(0 3px 4px rgba(0,0,0,0.62));}
.cell.moat.sel{filter:drop-shadow(0 0 11px rgba(201,161,74,0.6)) drop-shadow(0 3px 4px rgba(0,0,0,0.62));}
.cell.sel .c-bg{stroke:var(--cyan-2);stroke-width:2;}
.cell.moat.sel .c-bg{stroke:var(--gold-bright);}
.cell.dim{opacity:0.12;}
.led-live{fill:var(--pos);filter:drop-shadow(0 0 3px var(--pos));} .led-dormant{fill:var(--warn);filter:drop-shadow(0 0 3px var(--warn));} .led-phantom{fill:var(--risk);filter:drop-shadow(0 0 3px var(--risk));}
.cell.moat .led-ring{stroke:var(--gold-bright);stroke-width:1;fill:none;opacity:0.9;}

/* entrance */
.enter .cell,.enter .trace{opacity:0;}
.cell{animation:cellIn var(--dur) var(--ease) backwards;}
@keyframes cellIn{from{opacity:0;transform:translateY(6px) scale(0.96);}}
@media (prefers-reduced-motion:reduce){.cell{animation:none;}.flow.on{animation:none;}.eyebrow .dot{animation:none;}}

@media (max-width:680px){
  header{padding:13px 15px 22px;}
  .moatline{display:none;}
  #chips{top:100px;left:14px;right:14px;}
  #legend{left:14px;bottom:14px;max-width:182px;font-size:0.6rem;}
  #minimap{display:none;}
  #rail .inp{width:96px;} #rail{right:14px;}
}
</style>
</head>
<body class="enter">
<div id="stage"><div id="viewport"><div id="boardwrap"></div></div></div>
<div id="fx"></div>
<div id="frame"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>

<header>
  <span class="eyebrow"><span class="dot"></span>YURI OS · silicon die · MUSUBI ONE</span>
  <h1><span class="os">YURI</span> Circuit Die</h1>
  <div class="telem">
    <span><b>${payload.meta.nodeCount}</b> cells</span><span class="sep">·</span>
    <span><b>${payload.meta.edgeCount}</b> traces</span><span class="sep">·</span>
    <span><b>${payload.meta.blockCount}</b> blocks</span><span class="sep">·</span>
    <span><b>${payload.meta.counts.live}</b> live · <b>${payload.meta.counts.dormant}</b> dormant · <b>${payload.meta.counts.phantom}</b> phantom</span>
  </div>
  <p class="moatline">Cells sized by connectivity — heavy organs are bigger die-blocks. The <span class="g">gold core</span> is the moat: the work-dynamics energy instrument, the brain-dump-decode cognition engine, and governed memory.</p>
</header>

<div id="rail">
  <input id="search" class="inp" type="text" placeholder="filter cells…" autocomplete="off" spellcheck="false">
  <button class="btn" id="moatBtn" title="Spotlight the moat core">◆ moat</button>
  <button class="btn" id="fit" title="Fit to screen">fit</button>
  <button class="btn" id="zin">+</button><button class="btn" id="zout">−</button>
</div>

<div id="chips"></div>

<aside id="panel">
  <button id="closeP" aria-label="close">×</button>
  <div class="ph"><div class="p-layer" id="pLayer"></div><h2 id="pTitle"></h2><div class="statusrow" id="pStatus"></div></div>
  <div class="body">
    <div class="sec"><h3>What it does</h3><div class="desc" id="pDesc"></div></div>
    <div class="sec"><h3>Triggered by</h3><div class="trig" id="pTrig"></div></div>
    <div class="sec" id="pFilesSec"><h3>Files</h3><div id="pFiles"></div></div>
    <div class="sec" id="pIoSec"><h3>Artifact I/O</h3><div id="pIo"></div></div>
    <div class="sec" id="pConnSec"><h3>Wired to</h3><div id="pConn"></div></div>
  </div>
</aside>

<div id="legend">
  <p class="lh">Metal layer · status · core</p>
  <div class="lg"><span class="sw" style="background:var(--gold)"></span>calls — import / invoke</div>
  <div class="lg"><span class="sw" style="background:var(--neutral)"></span>reads — state / config</div>
  <div class="lg"><span class="sw" style="background:var(--teal)"></span>writes — persist / trace</div>
  <div class="legrow">
    <div class="lg"><span class="dot" style="background:var(--pos)"></span>live</div>
    <div class="lg"><span class="dot" style="background:var(--warn)"></span>dormant</div>
    <div class="lg"><span class="dot" style="background:var(--risk)"></span>phantom</div>
    <div class="lg" style="color:var(--gold)"><span class="dot" style="border:1.5px solid var(--gold);background:transparent"></span>moat core</div>
  </div>
</div>

<div id="minimap"></div>

<script id="graph-data" type="application/json">${json.replace(/<\/script>/gi, "<\\/script>")}</script>
<script>
"use strict";
var DATA = JSON.parse(document.getElementById("graph-data").textContent);
var NS = "http://www.w3.org/2000/svg";
var byId = new Map(DATA.nodes.map(function(n){return [n.id,n];}));
var CW = DATA.meta.canvas.w, CH = DATA.meta.canvas.h;
function el(t,c){var e=document.createElementNS(NS,t);if(c)e.setAttribute("class",c);return e;}
function at(e,o){for(var k in o)e.setAttribute(k,o[k]);return e;}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

/* adjacency from routes (= graph edges) */
var adj = new Map(DATA.nodes.map(function(n){return [n.id,[]];}));
DATA.routes.forEach(function(e){
  if(adj.has(e.from)) adj.get(e.from).push({dir:"out",other:e.to,kind:e.kind});
  if(adj.has(e.to)) adj.get(e.to).push({dir:"in",other:e.from,kind:e.kind});
});

/* ---------- board ---------- */
var svg = el("svg","board");
at(svg,{viewBox:"0 0 "+CW+" "+CH,preserveAspectRatio:"xMidYMid meet"});
var defs = el("defs");
// fine + coarse substrate grid
function gridPat(id,size,col){var p=el("pattern");at(p,{id:id,width:size,height:size,patternUnits:"userSpaceOnUse"});
  var pa=el("path");at(pa,{d:"M"+size+" 0H0V"+size,fill:"none",stroke:col,"stroke-width":1});p.appendChild(pa);return p;}
defs.appendChild(gridPat("grid",48,"rgba(90,210,255,0.045)"));
defs.appendChild(gridPat("grid2",240,"rgba(90,210,255,0.08)"));
// neon soft-glow filter
var f=el("filter");at(f,{id:"softglow",x:"-60%",y:"-60%",width:"220%",height:"220%"});
var fb=el("feGaussianBlur");at(fb,{stdDeviation:"3.2",result:"b"});f.appendChild(fb);
var fm=el("feMerge");var m1=el("feMergeNode");at(m1,{in:"b"});var m2=el("feMergeNode");at(m2,{in:"SourceGraphic"});fm.appendChild(m1);fm.appendChild(m2);f.appendChild(fm);
defs.appendChild(f);
// brushed-metal cell gradients (top-lit silicon)
function linGrad(id,stops,horiz){var g=el("linearGradient");at(g,{id:id,x1:"0",y1:"0",x2:horiz?"1":"0",y2:horiz?"0":"1"});stops.forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});g.appendChild(st);});return g;}
// brushed gunmetal (cool) + brushed copper/gold (warm): light top bevel, dark body, reflected bottom edge
defs.appendChild(linGrad("cellMetal",[["0%","#8093a4"],["13%","#4f6170"],["42%","#37454f"],["64%","#2d3942"],["88%","#3e4c57"],["100%","#627481"]]));
defs.appendChild(linGrad("cellMetalGold",[["0%","#d2a659"],["13%","#8e6c36"],["42%","#5e4824"],["64%","#48371c"],["88%","#6b5128"],["100%","#9a763c"]]));
defs.appendChild(linGrad("glint",[["0%","rgba(214,232,255,0.3)"],["34%","rgba(214,232,255,0.05)"],["60%","rgba(255,255,255,0)"]]));
defs.appendChild(linGrad("stripCool",[["0%","rgba(110,160,200,0.18)"],["50%","rgba(40,70,95,0.08)"],["100%","rgba(110,160,200,0.18)"]],true));
defs.appendChild(linGrad("stripGold",[["0%","rgba(227,198,119,0.3)"],["50%","rgba(120,95,40,0.14)"],["100%","rgba(227,198,119,0.3)"]],true));
// physical metal: specular highlight from an overhead distant light
(function(){var mf=el("filter");at(mf,{id:"metal",x:"-15%",y:"-15%",width:"130%",height:"130%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"0.9",result:"mb"});mf.appendChild(b);
  var sl=el("feSpecularLighting");at(sl,{in:"mb",surfaceScale:"2.4",specularConstant:"0.5",specularExponent:"34","lighting-color":"#e7f1ff",result:"sl"});
  var dl=el("feDistantLight");at(dl,{azimuth:"228",elevation:"62"});sl.appendChild(dl);mf.appendChild(sl);
  var ct=el("feComponentTransfer");at(ct,{in:"sl",result:"slc"});var fa=el("feFuncA");at(fa,{type:"linear",slope:"0.7",intercept:"0"});ct.appendChild(fa);mf.appendChild(ct);
  var sc=el("feComposite");at(sc,{in:"slc",in2:"SourceAlpha",operator:"in",result:"sc"});mf.appendChild(sc);
  var me=el("feMerge");var n1=el("feMergeNode");at(n1,{in:"SourceGraphic"});var n2=el("feMergeNode");at(n2,{in:"sc"});me.appendChild(n1);me.appendChild(n2);mf.appendChild(me);
  defs.appendChild(mf);})();
// moat backlight (gold radial heat) + wide bloom
var rg=el("radialGradient");at(rg,{id:"moatGlow",cx:"50%",cy:"50%",r:"50%"});
[["0%","#C9A14A"],["50%","#8A6A28"],["100%","#8A6A28"]].forEach(function(s,i){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":[0.26,0.08,0][i]});rg.appendChild(st);});
defs.appendChild(rg);
var bg=el("filter");at(bg,{id:"bigglow",x:"-80%",y:"-80%",width:"260%",height:"260%"});var bgb=el("feGaussianBlur");at(bgb,{stdDeviation:"26"});bg.appendChild(bgb);defs.appendChild(bg);
// dark-silicon wafer substrate gradient
(function(){var sg=el("radialGradient");at(sg,{id:"silicon",cx:"50%",cy:"45%",r:"66%"});
  [["0%","#0b131e"],["46%","#070d17"],["100%","#02040a"]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});sg.appendChild(st);});
  defs.appendChild(sg);})();
// anisotropic wafer sheen (cool->warm light wash across the die)
defs.appendChild(linGrad("sheen",[["0%","rgba(150,192,238,0.055)"],["42%","rgba(150,192,238,0)"],["72%","rgba(140,105,52,0)"],["100%","rgba(180,140,70,0.05)"]],true));
// silicon-wafer iridescence (oil-slick diffraction sheen — the ASML/wafer cue)
defs.appendChild(linGrad("irid",[["0%","rgba(90,210,255,0.06)"],["26%","rgba(155,123,255,0.06)"],["50%","rgba(255,120,210,0.045)"],["72%","rgba(120,200,255,0.06)"],["100%","rgba(190,150,90,0.045)"]],true));
// anisotropic brushed-metal hotline (de-plastic streak)
defs.appendChild(linGrad("streak",[["0%","rgba(255,255,255,0)"],["36%","rgba(232,243,255,0.13)"],["44%","rgba(232,243,255,0.2)"],["52%","rgba(255,255,255,0)"]]));
// EUV plasma core — blue-violet light source at the heart of the die
(function(){var eg=el("radialGradient");at(eg,{id:"euv",cx:"50%",cy:"50%",r:"50%"});
  [["0%","#bcc6ff",0.55],["42%","#7d78ff",0.18],["100%","#5a4fd0",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});eg.appendChild(st);});
  defs.appendChild(eg);})();
// fab grain (fractal noise) — de-plastics + unifies all surfaces under one texture
(function(){var gf=el("filter");at(gf,{id:"grain",x:"0",y:"0",width:"100%",height:"100%"});
  var ft=el("feTurbulence");at(ft,{type:"fractalNoise",baseFrequency:"0.82",numOctaves:"2",stitchTiles:"stitch",result:"n"});gf.appendChild(ft);
  var cm=el("feColorMatrix");at(cm,{in:"n",type:"saturate",values:"0"});gf.appendChild(cm);
  defs.appendChild(gf);})();
// brushed-metal striations (anisotropic horizontal grain on the dies)
(function(){var bp=el("pattern");at(bp,{id:"brush",width:"5",height:"2.6",patternUnits:"userSpaceOnUse"});
  var l1=el("line");at(l1,{x1:"0",y1:"0.5",x2:"5",y2:"0.5",stroke:"rgba(255,255,255,0.05)","stroke-width":"0.5"});bp.appendChild(l1);
  var l2=el("line");at(l2,{x1:"0",y1:"1.8",x2:"5",y2:"1.8",stroke:"rgba(0,0,0,0.1)","stroke-width":"0.5"});bp.appendChild(l2);
  defs.appendChild(bp);})();
svg.appendChild(defs);

// die substrate fills
svg.appendChild(at(el("rect"),{x:0,y:0,width:CW,height:CH,fill:"url(#silicon)"}));
svg.appendChild(at(el("rect"),{x:0,y:0,width:CW,height:CH,fill:"url(#grid)",opacity:"0.65"}));
svg.appendChild(at(el("rect"),{x:0,y:0,width:CW,height:CH,fill:"url(#grid2)",opacity:"0.7"}));
svg.appendChild(at(el("rect"),{x:0,y:0,width:CW,height:CH,fill:"url(#sheen)","pointer-events":"none"}));
svg.appendChild(at(el("rect"),{x:0,y:0,width:CW,height:CH,fill:"url(#irid)","pointer-events":"none"}));

// power-rail mesh (faint, behind everything) — VDD gold verticals / VSS cyan horizontals
var rail = el("g","rails");
for(var gx=160; gx<CW-120; gx+=200){ rail.appendChild(at(el("line"),{x1:gx,y1:60,x2:gx,y2:CH-60,class:"prail v"})); }
for(var gy=200; gy<CH-120; gy+=200){ rail.appendChild(at(el("line"),{x1:60,y1:gy,x2:CW-60,y2:gy,class:"prail h"})); }
svg.appendChild(rail);

// moat backlight + EUV plasma core, centred on the die core
(function(){var c=DATA.center||{x:CW/2,y:CH/2}, cr=(DATA.meta&&DATA.meta.coreR)||320;
  svg.appendChild(at(el("ellipse","moat-back"),{cx:c.x,cy:c.y,rx:cr+150,ry:cr+150,fill:"url(#moatGlow)",filter:"url(#bigglow)"}));
  // EUV plasma core — blue-violet light source at the heart of the die
  svg.appendChild(at(el("ellipse","moat-back"),{cx:c.x,cy:c.y,rx:cr*0.6,ry:cr*0.6,fill:"url(#euv)",filter:"url(#bigglow)"}));
})();

// die-seal guard rings
svg.appendChild(at(el("rect"),{x:24,y:24,width:CW-48,height:CH-48,rx:10,class:"seal"}));
svg.appendChild(at(el("rect"),{x:34,y:34,width:CW-68,height:CH-68,rx:8,class:"seal2"}));

// I/O bond-pad ring
var ring = el("g","padring");
DATA.pads.forEach(function(p){
  var horiz = p.side==="T"||p.side==="B";
  var w = horiz?10:14, h = horiz?14:10;
  ring.appendChild(at(el("rect"),{x:p.x-w/2,y:p.y-h/2,width:w,height:h,rx:2,class:"pad"+((p.i%3===0)?"":" cyan")}));
});
svg.appendChild(ring);

// corner fiducials (registration crosses)
[[40,40],[CW-40,40],[40,CH-40],[CW-40,CH-40]].forEach(function(c){
  var g=el("g","fiducial");
  g.appendChild(at(el("circle"),{cx:c[0],cy:c[1],r:9}));
  g.appendChild(at(el("line"),{x1:c[0]-14,y1:c[1],x2:c[0]+14,y2:c[1]}));
  g.appendChild(at(el("line"),{x1:c[0],y1:c[1]-14,x2:c[0],y2:c[1]+14}));
  svg.appendChild(g);
});

/* ---------- functional blocks ---------- */
var blockLayer = el("g","blocks");
DATA.blocks.forEach(function(b){
  var g = el("g","blk"+(b.moat?" moat":"")+(b.arc?" arc":""));
  if(b.arc){
    // orbit layer = a ring-of-cells wedge: faint sector band + tangent label, NO rect
    var cxC=b.acx, cyC=b.acy;
    function pol(r,a){return [cxC+r*Math.cos(a), cyC+r*Math.sin(a)];}
    var p0=pol(b.rIn,b.a0),p1=pol(b.rOut,b.a0),p2=pol(b.rOut,b.a1),p3=pol(b.rIn,b.a1);
    var lrg=(b.a1-b.a0)>Math.PI?1:0;
    var d="M "+p0[0].toFixed(1)+" "+p0[1].toFixed(1)+" L "+p1[0].toFixed(1)+" "+p1[1].toFixed(1)+
          " A "+b.rOut.toFixed(1)+" "+b.rOut.toFixed(1)+" 0 "+lrg+" 1 "+p2[0].toFixed(1)+" "+p2[1].toFixed(1)+
          " L "+p3[0].toFixed(1)+" "+p3[1].toFixed(1)+" A "+b.rIn.toFixed(1)+" "+b.rIn.toFixed(1)+" 0 "+lrg+" 0 "+p0[0].toFixed(1)+" "+p0[1].toFixed(1)+" Z";
    g.appendChild(at(el("path","arc-band"+(b.perimeter?" perim":"")),{d:d}));
    var la=b.labelAngle, lx=cxC+(b.rIn-15)*Math.cos(la), ly=cyC+(b.rIn-15)*Math.sin(la);
    var rot=la*180/Math.PI+90; if(rot>90&&rot<270)rot-=180;
    var nm=at(el("text"),{x:lx,y:ly,class:"arc-name"+(b.perimeter?" perim":""),"text-anchor":"middle",transform:"rotate("+rot.toFixed(1)+" "+lx.toFixed(1)+" "+ly.toFixed(1)+")"});
    nm.textContent=b.short+"  "+b.count;g.appendChild(nm);
    blockLayer.appendChild(g);return;
  }
  if(b.core){
    // radial core = faint disc ring + centred label; cells render as metal pads
    g.appendChild(at(el("circle","core-disc"+(b.moat?" moat":"")),{cx:b.cx,cy:b.cy,r:b.discR}));
    var cn=at(el("text"),{x:b.labelX,y:b.labelY,class:"core-name","text-anchor":"middle"});
    cn.textContent=b.short+"  ◆ "+b.count;g.appendChild(cn);
    blockLayer.appendChild(g);return;
  }
  g.appendChild(at(el("rect"),{x:b.x,y:b.y,width:b.w,height:b.h,rx:7,class:"blk-bg"}));
  // sub-cell array texture (faint internal grid = SRAM/array look)
  var arr=el("g","blk-array");
  for(var ax=b.x+18; ax<b.x+b.w-12; ax+=26){ arr.appendChild(at(el("line"),{x1:ax,y1:b.y+b.labelH+6,x2:ax,y2:b.y+b.h-8})); }
  for(var ay=b.y+b.labelH+8; ay<b.y+b.h-8; ay+=26){ arr.appendChild(at(el("line"),{x1:b.x+8,y1:ay,x2:b.x+b.w-8,y2:ay})); }
  g.appendChild(arr);
  // via-field: contact dots at array intersections (SRAM / decoupling texture)
  var vf=el("g","vfield");
  for(var vx=b.x+18; vx<b.x+b.w-12; vx+=26){ for(var vy=b.y+b.labelH+10; vy<b.y+b.h-8; vy+=26){ if((Math.round(vx/26)+Math.round(vy/26))%2===0) vf.appendChild(at(el("rect"),{x:vx-1,y:vy-1,width:2.2,height:2.2})); } }
  g.appendChild(vf);
  // label strip
  g.appendChild(at(el("rect"),{x:b.x,y:b.y,width:b.w,height:b.labelH,rx:7,class:"blk-strip"}));
  g.appendChild(at(el("rect"),{x:b.x,y:b.y+b.labelH-7,width:b.w,height:7,fill:"#04060a",opacity:"0.0"}));
  var nm=at(el("text"),{x:b.x+15,y:b.y+b.labelH-13,class:"blk-name"});nm.textContent=b.short;g.appendChild(nm);
  var ct=at(el("text"),{x:b.x+b.w-13,y:b.y+b.labelH-13,"text-anchor":"end",class:"blk-count"});
  ct.textContent=(b.moat?"◆ CORE ":"")+b.count;g.appendChild(ct);
  blockLayer.appendChild(g);
});
svg.appendChild(blockLayer);

// dense channel fill-routing — parallel metal lanes riding the gutters (die density)
(function(){var ch=DATA.channels||{vGutters:[],hGutters:[]};var fl=el("g","fillroute");
  (ch.vGutters||[]).forEach(function(gx,gi){for(var k=-3;k<=3;k++){fl.appendChild(at(el("line","fill"+(gi%2===0?" g":"")),{x1:gx+k*7,y1:72,x2:gx+k*7,y2:CH-72}));}});
  (ch.hGutters||[]).forEach(function(gy){for(var k=-3;k<=3;k++){fl.appendChild(at(el("line","fill"),{x1:72,y1:gy+k*7,x2:CW-72,y2:gy+k*7}));}});
  svg.appendChild(fl);
})();

/* ---------- traces + vias ---------- */
var traceLayer = el("g","traces"); var traceEls=[]; var flowEls=[]; var viaEls=[];
DATA.routes.forEach(function(e){
  var p=at(el("path","trace "+e.kind),{d:e.path});
  p.dataset.from=e.from; p.dataset.to=e.to; traceLayer.appendChild(p); traceEls.push(p);
  // flow overlay (animated signal pulse on highlight)
  var fl=at(el("path","flow"),{d:e.path}); fl.dataset.from=e.from; fl.dataset.to=e.to; traceLayer.appendChild(fl); flowEls.push(fl);
  // vias at trace endpoints (metal-layer contacts)
  var a=byId.get(e.from), b=byId.get(e.to);
  [a,b].forEach(function(n){var v=at(el("rect","via "+e.kind),{x:n.cx-2.5,y:n.cy-2.5,width:5,height:5,rx:1});v.dataset.from=e.from;v.dataset.to=e.to;traceLayer.appendChild(v);viaEls.push(v);});
  (e.vias||[]).forEach(function(pt){var v=at(el("rect","via "+e.kind),{x:pt[0]-2,y:pt[1]-2,width:4,height:4,rx:1});v.dataset.from=e.from;v.dataset.to=e.to;traceLayer.appendChild(v);viaEls.push(v);});
});
svg.appendChild(traceLayer);

/* ---------- cells ---------- */
var cellLayer = el("g","cells"); var cellEls=new Map();
DATA.nodes.forEach(function(n,i){
  var g = el("g","cell"+(n.moat?" moat":"")); at(g,{"data-status":n.status,transform:"translate("+n.x+","+n.y+")"}); g.dataset.id=n.id;
  g.style.animationDelay=((i%12)*26+Math.floor(i/12)*40)+"ms";
  // chip legs (pins) on left + right
  var legs=el("g","c-leg-g");
  var legN=Math.max(2,Math.min(4,Math.round(n.h/22)));
  for(var li=0;li<legN;li++){var ly=n.h*(li+1)/(legN+1);
    legs.appendChild(at(el("line","c-leg"),{x1:-6,y1:ly,x2:0,y2:ly}));
    legs.appendChild(at(el("line","c-leg"),{x1:n.w,y1:ly,x2:n.w+6,y2:ly}));}
  g.appendChild(legs);
  g.appendChild(at(el("rect","c-base"),{x:0,y:0,width:n.w,height:n.h,rx:5}));
  g.appendChild(at(el("rect","c-brush"),{x:0,y:0,width:n.w,height:n.h,rx:5}));
  var _h=2166136261;for(var _i=0;_i<n.id.length;_i++){_h^=n.id.charCodeAt(_i);_h=Math.imul(_h,16777619);}
  var _tn=(((_h>>>0)%1000)/1000-0.5)*0.13;
  g.appendChild(at(el("rect","c-tone"),{x:0,y:0,width:n.w,height:n.h,rx:5,fill:_tn>=0?"#d6ecff":"#000",opacity:Math.abs(_tn).toFixed(3)}));
  g.appendChild(at(el("rect","c-streak"),{x:0,y:0,width:n.w,height:n.h,rx:5,fill:"url(#streak)",opacity:n.moat?"0.5":"0.85"}));
  g.appendChild(at(el("rect","c-glint"),{x:1.5,y:1.5,width:n.w-3,height:Math.round(n.h*0.46),rx:4}));
  g.appendChild(at(el("rect","c-bg"),{x:0,y:0,width:n.w,height:n.h,rx:5}));
  g.appendChild(at(el("line","c-top"),{x1:4,y1:2.5,x2:n.w-4,y2:2.5}));
  // status LED + moat ring (top-left)
  if(n.moat) g.appendChild(at(el("circle","led-ring"),{cx:11,cy:11,r:5}));
  g.appendChild(at(el("circle","led-"+n.status),{cx:11,cy:11,r:2.6}));
  // via pad top-right
  g.appendChild(at(el("rect","c-pad"),{x:n.w-9,y:6,width:5,height:5,rx:1}));
  // hub tick (hot accent on the heaviest organs)
  if(n.deg>=6) g.appendChild(at(el("rect","hubtick"),{x:n.w-9,y:n.h-11,width:5,height:5,rx:1}));
  // wrapped label
  var words=n.label.replace(/[()]/g,"").split(/\\s+/), lines=["",""], li2=0, cap=Math.max(9,Math.floor(n.w/6.2));
  for(var w=0;w<words.length;w++){var word=words[w];var cand=(lines[li2]?lines[li2]+" ":"")+word;
    if(cand.length>cap&&li2===0){li2=1;lines[1]=word;}
    else if(li2===1&&((lines[1]?lines[1]+" ":"")+word).length>cap){lines[1]=lines[1]+"…";break;}
    else lines[li2]=cand;}
  var t=at(el("text","c-name"),{x:n.w/2,"text-anchor":"middle"});
  if(lines[1]){at(t,{y:n.h/2-2});
    var s1=el("tspan");at(s1,{x:n.w/2});s1.textContent=lines[0];t.appendChild(s1);
    var s2=el("tspan");at(s2,{x:n.w/2,dy:11});s2.textContent=lines[1];t.appendChild(s2);
  } else {at(t,{y:n.h/2+4});t.textContent=lines[0];}
  g.appendChild(t);
  g.addEventListener("mouseenter",function(){if(!selected)highlight(n.id);});
  g.addEventListener("mouseleave",function(){if(!selected)clearHL();else highlight(selected);});
  g.addEventListener("click",function(ev){ev.stopPropagation();select(n.id);});
  cellLayer.appendChild(g);cellEls.set(n.id,g);
});
svg.appendChild(cellLayer);
document.getElementById("boardwrap").appendChild(svg);

/* ---------- highlight ---------- */
var selected=null;
function nbrs(id){var s=new Set([id]);(adj.get(id)||[]).forEach(function(a){s.add(a.other);});return s;}
function highlight(id){
  var keep=nbrs(id);
  cellEls.forEach(function(g,nid){g.classList.toggle("dim",!keep.has(nid));});
  traceEls.forEach(function(p){var on=p.dataset.from===id||p.dataset.to===id;p.classList.toggle("hl",on);p.classList.toggle("dim",!on);});
  flowEls.forEach(function(p){p.classList.toggle("on",p.dataset.from===id||p.dataset.to===id);});
  viaEls.forEach(function(v){var on=v.dataset.from===id||v.dataset.to===id;v.classList.toggle("hl",on);});
}
function clearHL(){cellEls.forEach(function(g){g.classList.remove("dim");});traceEls.forEach(function(p){p.classList.remove("hl","dim");});flowEls.forEach(function(p){p.classList.remove("on");});viaEls.forEach(function(v){v.classList.remove("hl");});}

/* ---------- detail panel ---------- */
var panel=document.getElementById("panel");
function select(id){
  var n=byId.get(id); if(!n)return; selected=id;
  cellEls.forEach(function(g,nid){g.classList.toggle("sel",nid===id);});
  highlight(id);
  document.getElementById("pLayer").textContent=n.layer+(n.moat?"  ◆ core":"");
  document.getElementById("pTitle").textContent=n.label;
  var st=document.getElementById("pStatus");st.innerHTML="";
  function badge(cls,txt){var b=document.createElement("span");b.className="badge "+cls;b.textContent=txt;st.appendChild(b);}
  badge("b-"+n.status,n.status);
  if(n.moat) badge("b-moat","moat");
  badge("b-deg",n.deg+" wired");
  document.getElementById("pDesc").textContent=n.description;
  document.getElementById("pTrig").textContent=n.triggeredBy||"—";
  var fs=document.getElementById("pFiles");fs.innerHTML="";
  document.getElementById("pFilesSec").style.display=n.files.length?"":"none";
  n.files.forEach(function(f){var c=document.createElement("code");c.textContent=f;fs.appendChild(c);});
  var io=document.getElementById("pIo");io.innerHTML="";
  document.getElementById("pIoSec").style.display=n.io.length?"":"none";
  n.io.forEach(function(x){var d=document.createElement("div");d.className="io";
    d.innerHTML='<span class="k">'+x.kind+'</span> <code style="display:inline;border:none;padding:0">'+esc(x.target)+'</code>'+(x.description?'<div class="d">'+esc(x.description)+'</div>':'');io.appendChild(d);});
  var cc=document.getElementById("pConn");cc.innerHTML="";
  var conns=adj.get(id)||[];
  document.getElementById("pConnSec").style.display=conns.length?"":"none";
  conns.forEach(function(a){var o=byId.get(a.other);if(!o)return;
    var d=document.createElement("div");d.className="conn";
    d.innerHTML='<span class="ar">'+a.kind+' '+(a.dir==="out"?"→":"←")+'</span><span>'+esc(o.label)+'</span>';
    d.addEventListener("click",function(){select(a.other);centerOn(a.other);});cc.appendChild(d);});
  panel.classList.add("open");
}
function closePanel(){panel.classList.remove("open");selected=null;cellEls.forEach(function(g){g.classList.remove("sel");});clearHL();}
document.getElementById("closeP").addEventListener("click",closePanel);

/* ---------- pan / zoom — viewBox-driven (vectors stay crisp at every zoom) ---------- */
var stage=document.getElementById("stage");
var elW=stage.clientWidth||innerWidth, elH=stage.clientHeight||innerHeight;
var vbx=0,vby=0,vbw=CW,vbh=CH;
function aspect(){return elH/Math.max(1,elW);}
function fixAspect(){vbh=vbw*aspect();}
function clampW(w){return Math.min(CW*1.7,Math.max(CW*0.05,w));}
function setVB(){svg.setAttribute("viewBox",vbx.toFixed(2)+" "+vby.toFixed(2)+" "+vbw.toFixed(2)+" "+vbh.toFixed(2));updateMM();}
function fit(){elW=stage.clientWidth;elH=stage.clientHeight;vbw=clampW(CW*1.12);fixAspect();
  if(vbh<CH*1.04){vbw=clampW((CH*1.04)/aspect());fixAspect();}
  vbx=CW/2-vbw/2;vby=CH/2-vbh/2-vbh*0.05;setVB();}
function s2w(sx,sy){return {x:vbx+(sx/elW)*vbw,y:vby+(sy/elH)*vbh};}
function zoomAt(sx,sy,f){var w=s2w(sx,sy);vbw=clampW(vbw/f);fixAspect();vbx=w.x-(sx/elW)*vbw;vby=w.y-(sy/elH)*vbh;setVB();}
function centerOn(id){var n=byId.get(id);if(!n)return;vbx=n.cx-vbw/2;vby=n.cy-vbh/2;setVB();}
var navT=null;function navOn(){stage.classList.add("nav");}
function navOff(){clearTimeout(navT);navT=setTimeout(function(){stage.classList.remove("nav");},180);}
stage.addEventListener("wheel",function(e){e.preventDefault();navOn();zoomAt(e.clientX,e.clientY,e.deltaY<0?1.13:0.885);navOff();},{passive:false});
var drag=null,puts=new Map(),pinch=null;
stage.addEventListener("pointerdown",function(e){puts.set(e.pointerId,e);
  if(puts.size===2){var a=[...puts.values()];pinch={d:Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY),w:vbw,mx:(a[0].clientX+a[1].clientX)/2,my:(a[0].clientY+a[1].clientY)/2};drag=null;navOn();return;}
  if(e.target.closest(".cell"))return;drag={x:e.clientX,y:e.clientY,vbx:vbx,vby:vby};stage.classList.add("grabbing");navOn();});
stage.addEventListener("pointermove",function(e){
  if(puts.has(e.pointerId))puts.set(e.pointerId,e);
  if(pinch&&puts.size===2){var a=[...puts.values()];var nd=Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY);
    var w=s2w(pinch.mx,pinch.my);vbw=clampW(pinch.w*(pinch.d/Math.max(1,nd)));fixAspect();vbx=w.x-(pinch.mx/elW)*vbw;vby=w.y-(pinch.my/elH)*vbh;setVB();return;}
  if(drag){vbx=drag.vbx-(e.clientX-drag.x)/elW*vbw;vby=drag.vby-(e.clientY-drag.y)/elH*vbh;setVB();}});
function endPt(e){puts.delete(e.pointerId);if(puts.size<2)pinch=null;if(puts.size===0){drag=null;stage.classList.remove("grabbing");navOff();}}
stage.addEventListener("pointerup",endPt);stage.addEventListener("pointercancel",endPt);
stage.addEventListener("click",function(e){if(!e.target.closest(".cell")&&!e.target.closest("#panel"))closePanel();});
addEventListener("resize",function(){elW=stage.clientWidth;elH=stage.clientHeight;fixAspect();setVB();});
document.getElementById("fit").addEventListener("click",fit);
document.getElementById("zin").addEventListener("click",function(){navOn();zoomAt(elW/2,elH/2,1.25);navOff();});
document.getElementById("zout").addEventListener("click",function(){navOn();zoomAt(elW/2,elH/2,0.8);navOff();});

/* ---------- minimap ---------- */
var MM_W=210,MM_H=Math.max(96,Math.round(210*CH/CW)),mmS=MM_W/CW;
var mm=document.getElementById("minimap");
var msvg=el("svg");at(msvg,{width:MM_W,height:MM_H,viewBox:"0 0 "+MM_W+" "+MM_H});
msvg.appendChild(at(el("rect"),{x:0,y:0,width:MM_W,height:MM_H,fill:"#04060a"}));
DATA.blocks.forEach(function(b){if(b.arc||b.w==null)return;msvg.appendChild(at(el("rect"),{x:b.x*mmS,y:b.y*mmS,width:b.w*mmS,height:b.h*mmS,fill:b.moat?"rgba(201,161,74,0.16)":"rgba(90,210,255,0.07)",stroke:b.moat?"#C9A14A":"rgba(90,210,255,0.3)","stroke-width":0.6}));});
DATA.nodes.forEach(function(n){msvg.appendChild(at(el("rect"),{x:n.x*mmS,y:n.y*mmS,width:Math.max(1,n.w*mmS),height:Math.max(1,n.h*mmS),fill:n.moat?"#E3C677":(n.status==="phantom"?"#E0776B":n.status==="dormant"?"#E3B24A":"#5AD2FF"),opacity:n.moat?0.95:0.6}));});
var mmView=at(el("rect"),{id:"mmView"});msvg.appendChild(mmView);mm.appendChild(msvg);
function updateMM(){if(typeof mmView==="undefined"||!mmView)return;at(mmView,{x:Math.max(0,vbx*mmS),y:Math.max(0,vby*mmS),width:Math.min(MM_W,vbw*mmS),height:Math.min(MM_H,vbh*mmS)});}
mm.addEventListener("click",function(e){var r=msvg.getBoundingClientRect();var wx=(e.clientX-r.left)/mmS,wy=(e.clientY-r.top)/mmS;vbx=wx-vbw/2;vby=wy-vbh/2;setVB();});

/* ---------- block chips ---------- */
var chipBox=document.getElementById("chips");var activeBlk=null;
DATA.blocks.forEach(function(b){var c=document.createElement("button");c.className="chip"+(b.moat?" moat":"");
  c.innerHTML=b.short+'<span class="c">'+b.count+'</span>';
  c.addEventListener("click",function(){
    if(activeBlk===b.layer){activeBlk=null;c.classList.remove("on");cellEls.forEach(function(g){g.classList.remove("dim");});traceEls.forEach(function(p){p.classList.remove("dim");});return;}
    activeBlk=b.layer;[].forEach.call(chipBox.children,function(x){x.classList.remove("on");});c.classList.add("on");
    cellEls.forEach(function(g,id){g.classList.toggle("dim",byId.get(id).layer!==b.layer);});
    traceEls.forEach(function(p){var on=byId.get(p.dataset.from).layer===b.layer||byId.get(p.dataset.to).layer===b.layer;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});
  });chipBox.appendChild(c);});

/* ---------- moat spotlight ---------- */
var moatBtn=document.getElementById("moatBtn"),moatOn=false;
moatBtn.addEventListener("click",function(){moatOn=!moatOn;moatBtn.classList.toggle("on",moatOn);
  if(moatOn){cellEls.forEach(function(g,id){g.classList.toggle("dim",!byId.get(id).moat);});
    traceEls.forEach(function(p){var on=byId.get(p.dataset.from).moat&&byId.get(p.dataset.to).moat;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});
  }else{cellEls.forEach(function(g){g.classList.remove("dim");});traceEls.forEach(function(p){p.classList.remove("dim","hl");});}});

/* ---------- search ---------- */
document.getElementById("search").addEventListener("input",function(e){
  var q=e.target.value.trim().toLowerCase();
  if(!q){cellEls.forEach(function(g){g.classList.remove("dim");});traceEls.forEach(function(p){p.classList.remove("dim");});return;}
  var hit=new Set();
  DATA.nodes.forEach(function(n){if((n.label+" "+n.description+" "+n.layer+" "+n.files.join(" ")+" "+n.triggeredBy).toLowerCase().indexOf(q)>=0)hit.add(n.id);});
  cellEls.forEach(function(g,id){g.classList.toggle("dim",!hit.has(id));});
  traceEls.forEach(function(p){p.classList.toggle("dim",!(hit.has(p.dataset.from)&&hit.has(p.dataset.to)));});
});

/* ---------- keyboard ---------- */
addEventListener("keydown",function(e){
  if(e.key==="Escape")closePanel();
  if(e.key==="/"&&document.activeElement.id!=="search"){e.preventDefault();document.getElementById("search").focus();}
  if(e.key==="f")fit();
});

/* boot */
fit();
requestAnimationFrame(function(){document.body.classList.remove("enter");});
</script>
</body>
</html>`;

writeFileSync(OUT, html, "utf8");
const sizes = nodeOut.map((n) => n.sizeScale);
console.log("WROTE " + OUT);
console.log(`cells=${payload.meta.nodeCount} traces=${payload.meta.edgeCount} blocks=${payload.meta.blockCount} ` +
  `canvas=${CW}x${CH} live=${counts.live} dormant=${counts.dormant} phantom=${counts.phantom} ` +
  `pads=${pads.length} sizeRange=[${Math.min(...sizes).toFixed(2)},${Math.max(...sizes).toFixed(2)}] maxDeg=${payload.meta.maxDeg}`);
