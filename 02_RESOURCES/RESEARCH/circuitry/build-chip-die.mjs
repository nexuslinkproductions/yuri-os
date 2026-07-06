#!/usr/bin/env node
// build-chip-die.mjs — YURI Circuit Die: SCHEMATIC / BLUEPRINT render of the ENTIRE unified system.
//
//   node 02_RESOURCES/RESEARCH/circuitry/build-chip-die.mjs   -> ./yuri-chip-die.html
//
// Renders the whole YURI system (all 244 nodes — code organs as `die` blocks + flow nodes as
// `peripheral` board components) on ONE deterministic chip die. Input = yuri-die-graph.json
// (projected from canonical by yuri-graph-unify.mjs `project`; run that first).
//
// DESIGN (Marcel 2026-06-09):
//   • LAYOUT is locked — K1D-tiers concentric dependency-tier floorplan (glowing core dead-centre,
//     concentric bands outward with real ring gaps). Placement is NOT redesigned. Nothing random.
//   • AESTHETIC = CLEAN SCHEMATIC / BLUEPRINT — flat layer-coloured blocks, thin orthogonal traces,
//     a dark grid substrate "floor", SF Pro / Helvetica type. No photoreal glass/metal, no heavy blur.
//   • PERF = the SVG is SERVER-BAKED into the HTML here (no client-side appendChild construction), so
//     opening the file (file://, not localhost) just PARSES static markup — instant, no build lag.
//   • The PCB ORTHOGONAL ROUTER (radial-orthogonal Manhattan traces) is preserved verbatim — the wiring.
//
// Deterministic: no RNG, no wall-clock. Pure Node ESM, zero npm deps. Data baked so it opens via file://.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTierFloorplan } from "./K1D-tiers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// The die renders the ENTIRE unified system (all 244 nodes). Input is the all-tiers die-graph projected by
// yuri-graph-unify.mjs. yuri-circuitry-graph.json stays the mechanism view for xref/propagation/id-bridge.
const SRC = join(HERE, "..", "yuri-die-graph.json");
const OUT = join(HERE, "yuri-chip-die.html");

const graph = JSON.parse(readFileSync(SRC, "utf8"));
const nodes = graph.nodes ?? [];
const edges = graph.edges ?? [];

const MOAT_LAYERS = new Set(["Energy & Math", "Cognition & Persona", "Memory & Subconscious"]);

const BLOCK_SHORT = {
  "Cognition & Persona": "COGNITION",
  "Energy & Math": "ENERGY · MATH",
  "Memory & Subconscious": "MEMORY",
  "Retrieval & Knowledge": "RETRIEVAL",
  "Learning & Continuity": "LEARNING",
  "Self-Improvement": "SELF · IMPROVE",
  "Governance & Safety": "GOVERNANCE",
  "Skills & Orchestration": "SKILLS",
  "Token-Efficiency & Session": "SESSION · TOKENS",
  "Hidden / Meta / Self-referential": "HIDDEN · META",
};

// per-layer accent (region identity). {a:edge/ink hue, b:deep shadow, glow:bright}
const LAYER_COLOR = {
  "Energy & Math":            { a: "#c3a967", b: "#42371d", glow: "#e0c987" },
  "Cognition & Persona":      { a: "#7fb0a4", b: "#2a3a36", glow: "#9fd0c2" },
  "Memory & Subconscious":    { a: "#9a90c0", b: "#332c47", glow: "#bcb0e0" },
  "Retrieval & Knowledge":    { a: "#79a8bd", b: "#27424e", glow: "#9ccadf" },
  "Learning & Continuity":    { a: "#8298b2", b: "#313c4e", glow: "#a4bdd8" },
  "Self-Improvement":         { a: "#8cc278", b: "#2f4328", glow: "#aee695" },
  "Governance & Safety":      { a: "#c0837a", b: "#43302a", glow: "#dba39a" },
  "Skills & Orchestration":   { a: "#c2a075", b: "#4a3826", glow: "#e0bd8e" },
  "Token-Efficiency & Session": { a: "#94a4b6", b: "#373f48", glow: "#b4c4d6" },
  "Hidden / Meta / Self-referential": { a: "#9aa2ac", b: "#414950", glow: "#bcc4ce" },
};

// status from prose (live / dormant / phantom)
function statusOf(n) {
  const d = (n.description || "") + " " + (n.label || "");
  if (!n.files || n.files.length === 0 || /\bPHANTOM\b/.test(d)) return "phantom";
  if (/\bUNWIRED\b|\bDORMANT\b|\bSUPERSEDED\b|NO live trigger|no live hook|currently surfaces nothing/i.test(d)) return "dormant";
  return "live";
}

// graph edges = both endpoints are real node ids (the live wired traces).
const nodeIds = new Set(nodes.map((n) => n.id));
const graphEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);

// ------------------------------------------------------------------ FLOORPLAN (LOCKED — K1D concentric tiers)
// cellBase drives cell size AND all spacing (CELLMAX/RSEP/ARCSEP derive from it), so it scales the WHOLE die
// uniformly — kept small so the canvas stays ~3.3k² (a 6.5k² SVG is too big: the browser stutters/artifacts on
// cursor move). Shrinking is overlap-safe (cells and gaps scale together).
const floor = buildTierFloorplan(nodes, graphEdges, { cellBase: 46 });
const center = floor.center;
const CTR = center;
const CW = floor.canvas.w, CH = floor.canvas.h;
const CORER = floor.coreR;
const OUTR = floor.outerR;

// artifact I/O (panel only)
const artifactIO = new Map();
for (const e of edges) {
  if (!nodeIds.has(e.to)) {
    if (!artifactIO.has(e.from)) artifactIO.set(e.from, []);
    artifactIO.get(e.from).push({ kind: e.kind, target: e.to, description: e.description });
  }
}

// degree (size hierarchy + hub detection)
const degree = new Map(nodes.map((n) => [n.id, 0]));
for (const e of graphEdges) {
  degree.set(e.from, (degree.get(e.from) || 0) + 1);
  degree.set(e.to, (degree.get(e.to) || 0) + 1);
}
const maxDeg = Math.max(1, ...degree.values());
const cells = floor.cells;

// ----------------------------------------------------------------------------
// PCB ORTHOGONAL ROUTER (radial-orthogonal Manhattan for a circular die) — preserved verbatim.
// ----------------------------------------------------------------------------
const polar = (c) => {
  const dx = c.cx - CTR.x, dy = c.cy - CTR.y;
  return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
};
const P = (r, a) => [CTR.x + r * Math.cos(a), CTR.y + r * Math.sin(a)];
const f1 = (n) => n.toFixed(1);

const bandsSorted = floor.bands.slice().sort((a, b) => a.rIn - b.rIn);
const GAPS = [];
for (let i = 0; i < bandsSorted.length - 1; i++) {
  const inner = bandsSorted[i], outer = bandsSorted[i + 1];
  GAPS.push({ rIn: inner.rOut, rOut: outer.rIn, rMid: (inner.rOut + outer.rIn) / 2, idx: i });
}
const RIM_CH = { rIn: OUTR, rOut: OUTR + 70, rMid: OUTR + 40, idx: GAPS.length };
const ALL_CH = [...GAPS, RIM_CH];

function laneHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
const adelta = (a0, a1) => { let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// net class (colour) by routing relationship
function netClass(A, B) {
  if (A.tier === 0 || B.tier === 0) return "core";
  if (A.tier === 1 && B.tier === 1) return "moat";
  const inward = Math.min(A.tier, B.tier);
  const outward = Math.max(A.tier, B.tier);
  if (inward === 1) return "feed";
  if (outward >= 3) return "rim";
  return "sig";
}

const CELL_FAN = 16;
const LANE_PITCH = 7;
const LANES = 7;
const FILLET = 9;

function rounded(pts) {
  if (pts.length < 2) return "";
  let d = `M ${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const v1x = p1[0] - p0[0], v1y = p1[1] - p0[1];
    const v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const fr = Math.min(FILLET, l1 / 2, l2 / 2);
    const ax = p1[0] - (v1x / l1) * fr, ay = p1[1] - (v1y / l1) * fr;
    const bx = p1[0] + (v2x / l2) * fr, by = p1[1] + (v2y / l2) * fr;
    d += ` L ${f1(ax)} ${f1(ay)} Q ${f1(p1[0])} ${f1(p1[1])} ${f1(bx)} ${f1(by)}`;
  }
  d += ` L ${f1(pts[pts.length - 1][0])} ${f1(pts[pts.length - 1][1])}`;
  return d;
}
function arcPts(r, a0, a1) {
  const da = adelta(a0, a1);
  const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.05));
  const out = [];
  for (let s = 0; s <= steps; s++) out.push(P(r, a0 + da * (s / steps)));
  return out;
}
function channelForTiers(tA, tB) {
  const lo = Math.min(tA, tB);
  const ch = ALL_CH[Math.min(lo, ALL_CH.length - 1)];
  return ch;
}
function routeEdge(e) {
  const A = cells[e.from], B = cells[e.to];
  if (!A || !B) return null;
  const pa = polar(A), pb = polar(B);
  const cls = netClass(A, B);
  const lane = laneHash(e.from + "→" + e.to) % LANES;
  const laneOff = (lane - (LANES - 1) / 2) * LANE_PITCH;
  const vias = [];
  const sameTier = A.tier === B.tier;

  if (A.tier === 0 && B.tier === 0) {
    const mid = [(A.cx + B.cx) / 2, (A.cy + B.cy) / 2];
    const ox = (B.cy - A.cy), oy = -(B.cx - A.cx); const ol = Math.hypot(ox, oy) || 1;
    const k = laneOff * 0.7;
    const bend = [mid[0] + (ox / ol) * k, mid[1] + (oy / ol) * k];
    vias.push([Math.round(bend[0]), Math.round(bend[1])]);
    return { from: e.from, to: e.to, kind: e.kind, cls, lane, d: rounded([[A.cx, A.cy], bend, [B.cx, B.cy]]), vias };
  }
  if (sameTier) {
    const rLane = (pa.r + pb.r) / 2 + laneOff;
    const aStub = P(pa.r + (rLane > pa.r ? CELL_FAN : -CELL_FAN), pa.a);
    const aTurn = P(rLane, pa.a);
    const bTurn = P(rLane, pb.a);
    const bStub = P(pb.r + (rLane > pb.r ? CELL_FAN : -CELL_FAN), pb.a);
    const pts = [[A.cx, A.cy], aStub, aTurn, ...arcPts(rLane, pa.a, pb.a), bTurn, bStub, [B.cx, B.cy]];
    vias.push([Math.round(aTurn[0]), Math.round(aTurn[1])]);
    vias.push([Math.round(bTurn[0]), Math.round(bTurn[1])]);
    return { from: e.from, to: e.to, kind: e.kind, cls, lane, d: rounded(pts), vias };
  }
  const inner = pa.r <= pb.r ? { p: pa, c: A } : { p: pb, c: B };
  const outer = pa.r <= pb.r ? { p: pb, c: B } : { p: pa, c: A };
  const ch = channelForTiers(A.tier, B.tier);
  const rChan = ch.rMid + laneOff;
  const startIsInner = (inner.c === A);
  const s = startIsInner ? inner : outer;
  const t = startIsInner ? outer : inner;
  const sStandoff = P(s.p.r + (s === inner ? CELL_FAN : -CELL_FAN), s.p.a);
  const sToChan = P(rChan, s.p.a);
  const tFromChan = P(rChan, t.p.a);
  const tStandoff = P(t.p.r + (t === inner ? CELL_FAN : -CELL_FAN), t.p.a);
  const pts = [[A.cx, A.cy], sStandoff, sToChan, ...arcPts(rChan, s.p.a, t.p.a), tFromChan, tStandoff, [B.cx, B.cy]];
  vias.push([Math.round(sToChan[0]), Math.round(sToChan[1])]);
  vias.push([Math.round(tFromChan[0]), Math.round(tFromChan[1])]);
  return { from: e.from, to: e.to, kind: e.kind, cls, lane, d: rounded(pts), vias };
}
const routes = graphEdges.map(routeEdge).filter(Boolean);

// I/O bond-pad ring just outside the rim
function padRing() {
  const pads = [];
  const rPad = OUTR + 96;
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * 2 * Math.PI;
    const x = CTR.x + rPad * Math.cos(a), y = CTR.y + rPad * Math.sin(a);
    pads.push({ x: Math.round(x), y: Math.round(y), a, i });
  }
  return pads;
}
const pads = padRing();

// ----------------------------------------------------------------------------
// PAYLOAD (lean — schematic needs geometry + layer accent + kind; no glass/metal tokens)
// ----------------------------------------------------------------------------
const counts = { live: 0, dormant: 0, phantom: 0 };
const nodeOut = nodes.map((n) => {
  const c = cells[n.id];
  const st = statusOf(n);
  counts[st]++;
  const col = LAYER_COLOR[n.layer] || LAYER_COLOR["Retrieval & Knowledge"];
  return {
    id: n.id, label: n.label, layer: n.layer, short: BLOCK_SHORT[n.layer] || n.layer,
    kind: n.kind || "die", files: n.files || [], triggeredBy: n.triggeredBy || "", description: n.description || "",
    status: st, moat: MOAT_LAYERS.has(n.layer), core: c.band === 0,
    x: c.x, y: c.y, w: c.w, h: c.h, cx: c.cx, cy: c.cy,
    band: c.band, tier: c.tier, ang: +(c.ang || 0).toFixed(4), r: Math.round(c.r || 0),
    deg: degree.get(n.id) || 0, accent: col.a, glow: col.glow, accentB: col.b,
    io: artifactIO.get(n.id) || [],
  };
});
const blockOut = floor.blocks.map((b) => {
  const col = LAYER_COLOR[b.layer.replace(" · CORE", "")] || (b.core ? LAYER_COLOR["Energy & Math"] : LAYER_COLOR["Retrieval & Knowledge"]);
  return {
    layer: b.layer, short: BLOCK_SHORT[b.layer] || (b.core ? "ENERGY · CORE" : b.layer),
    moat: b.moat, core: !!b.core, perimeter: !!b.perimeter, band: b.band, tier: b.tier,
    a0: b.a0, a1: b.a1, aMid: b.aMid, rIn: b.rIn, rOut: b.rOut, rMid: b.rMid,
    labelR: b.labelR, labelAngle: b.labelAngle, accent: col.a, glow: col.glow, count: b.n,
  };
});
const bandOut = bandsSorted.map((b) => ({ tier: b.tier, rIn: b.rIn, rOut: b.rOut, rMid: b.rMid, accent: b.accent, core: !!b.core, name: b.name || "" }));

const payload = {
  meta: { generatedAt: graph.generatedAt || null, nodeCount: nodes.length, edgeCount: graphEdges.length, blockCount: blockOut.length,
    counts, canvas: { w: CW, h: CH }, maxDeg, coreR: CORER, outerR: OUTR, contentR: OUTR + 40,
    center: { x: CTR.x, y: CTR.y } },
  bands: bandOut, blocks: blockOut, nodes: nodeOut, routes: routes.map((r) => ({ from: r.from, to: r.to, kind: r.kind, cls: r.cls, path: r.d })), pads,
};

// ============================================================================
// SERVER-BAKED SCHEMATIC RENDERER — the SVG is built HERE as a string and shipped in the HTML.
// ============================================================================
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PR = (r, a) => [CTR.x + r * Math.cos(a), CTR.y + r * Math.sin(a)];

// wrap a label into up to 2 lines for a cell of width w
function wrapLabel(label, w) {
  const words = String(label).replace(/[()]/g, "").split(/\s+/);
  const cap = Math.max(6, Math.floor(w / 6.2));
  const lines = ["", ""]; let li = 0;
  for (const word of words) {
    const cand = (lines[li] ? lines[li] + " " : "") + word;
    if (cand.length > cap && li === 0) { li = 1; lines[1] = word; }
    else if (li === 1 && ((lines[1] ? lines[1] + " " : "") + word).length > cap) { lines[1] = lines[1] + "…"; break; }
    else lines[li] = cand;
  }
  return lines.filter(Boolean);
}

function bakeSVG(p) {
  const C = p.meta.center, parts = [];
  // explicit width/height so the SVG has intrinsic size inside the absolutely-positioned #world (a viewBox
  // alone collapses to 0 there → blank board). #world's transform scales/positions this fixed-size board.
  parts.push(`<svg class="board" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" xmlns="http://www.w3.org/2000/svg">`);
  // defs: blueprint grid pattern (the substrate floor) + a soft core glow stop
  parts.push(`<defs>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="rgba(120,150,180,0.055)" stroke-width="1"/></pattern>
    <pattern id="grid5" width="320" height="320" patternUnits="userSpaceOnUse">
      <path d="M320 0H0V320" fill="none" stroke="rgba(120,150,180,0.10)" stroke-width="1"/></pattern>
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e0c987" stop-opacity="0.16"/><stop offset="70%" stop-color="#e0c987" stop-opacity="0.03"/><stop offset="100%" stop-color="#e0c987" stop-opacity="0"/></radialGradient>
  </defs>`);
  // SUBSTRATE FLOOR — dark board + blueprint grid
  parts.push(`<rect x="0" y="0" width="${CW}" height="${CH}" fill="#0a0e14"/>`);
  parts.push(`<rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#grid)"/>`);
  parts.push(`<rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#grid5)"/>`);
  // BAND RINGS — thin concentric guides (faint), one per band boundary
  let band = '<g class="bands" fill="none">';
  for (const b of p.bands) {
    if (b.core) continue;
    band += `<circle cx="${C.x}" cy="${C.y}" r="${b.rIn.toFixed(1)}" stroke="rgba(140,165,185,0.10)" stroke-width="1"/>`;
    band += `<circle cx="${C.x}" cy="${C.y}" r="${b.rOut.toFixed(1)}" stroke="rgba(140,165,185,0.10)" stroke-width="1"/>`;
  }
  band += "</g>";
  parts.push(band);
  // CORE glow + disc
  parts.push(`<circle cx="${C.x}" cy="${C.y}" r="${(CORER + 160).toFixed(1)}" fill="url(#coreGlow)"/>`);
  parts.push(`<circle class="core" cx="${C.x}" cy="${C.y}" r="${CORER.toFixed(1)}" fill="rgba(195,169,103,0.05)" stroke="rgba(224,201,135,0.45)" stroke-width="1.5"/>`);
  // TRACES — thin orthogonal copper, colour by net class
  let tg = '<g class="traces" fill="none" stroke-linecap="round" stroke-linejoin="round">';
  for (const r of p.routes) {
    tg += `<path class="trace net-${r.cls}" data-from="${esc(r.from)}" data-to="${esc(r.to)}" d="${r.path}"/>`;
  }
  tg += "</g>";
  parts.push(tg);
  // REGIONS — a faint per-layer wedge TINT + outline so each layer reads as its OWN coloured sector (the
  // visual separation between regions). Drawn under the cells; the labels go on top, after the cells.
  function wedge(rIn, rOut, a0, a1) {
    const [x0i, y0i] = PR(rIn, a0), [x1i, y1i] = PR(rOut, a0), [x1o, y1o] = PR(rOut, a1), [x0o, y0o] = PR(rIn, a1);
    const lg = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0i.toFixed(1)} ${y0i.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${rOut.toFixed(1)} ${rOut.toFixed(1)} 0 ${lg} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${rIn.toFixed(1)} ${rIn.toFixed(1)} 0 ${lg} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
  }
  let rg = '<g class="regions">';
  for (const b of p.blocks) { if (b.core) continue;
    rg += `<path d="${wedge(b.rIn - 4, b.rOut + 4, b.a0, b.a1)}" fill="${b.accent}" fill-opacity="0.05" stroke="${b.accent}" stroke-opacity="0.20" stroke-width="1"/>`; }
  rg += "</g>";
  parts.push(rg);
  // CELLS — flat schematic blocks. die = solid fill+stroke; peripheral = dashed outline (board component).
  let cg = '<g class="cells">';
  for (const n of p.nodes) {
    const R = Math.max(3, Math.round(n.w * 0.06));
    const cls = `cell ${n.kind} st-${n.status}${n.moat ? " moat" : ""}${n.core ? " core" : ""}`;
    // FACING ROTATION — rotate each cell around its own centre by its polar angle so the whole die fans
    // toward the core (the radial-die intent). Cells on the LEFT half would read upside-down → counter-rotate
    // the text 180° so every label stays upright.
    const faceDeg = (n.ang || 0) * 180 / Math.PI;
    const udn = ((faceDeg % 360) + 360) % 360;
    const flip = udn > 90 && udn < 270;
    const tflip = flip ? ` transform="rotate(180 ${n.w / 2} ${n.h / 2})"` : "";
    cg += `<g class="${cls}" data-id="${esc(n.id)}" transform="translate(${n.x} ${n.y}) rotate(${faceDeg.toFixed(1)} ${n.w / 2} ${n.h / 2})" style="--acc:${n.accent};--glow:${n.glow}">`;
    cg += `<rect class="cbody" x="0" y="0" width="${n.w}" height="${n.h}" rx="${R}"/>`;
    cg += `<circle class="cdot" cx="11" cy="11" r="3.2"/>`;
    const lines = wrapLabel(n.label, n.w);
    if (lines.length > 1) {
      cg += `<text class="cname" x="${n.w / 2}" y="${n.h / 2 - 4}" text-anchor="middle"${tflip}><tspan x="${n.w / 2}">${esc(lines[0])}</tspan><tspan x="${n.w / 2}" dy="9">${esc(lines[1])}</tspan></text>`;
    } else {
      cg += `<text class="cname" x="${n.w / 2}" y="${n.h / 2 + 4}" text-anchor="middle"${tflip}>${esc(lines[0] || n.id)}</text>`;
    }
    cg += `</g>`;
  }
  cg += "</g>";
  parts.push(cg);
  // REGION LABELS on top (legible) — bright, the layer colour, dark halo, at the wedge's outer arc.
  let bl = '<g class="blocklabels">';
  for (const b of p.blocks) { if (b.core) continue;
    const [lx, ly] = PR(b.labelR, b.labelAngle);
    let dg = (b.labelAngle * 180) / Math.PI; const up = ((dg % 360) + 360) % 360; const fl = up > 90 && up < 270; const rot = fl ? dg + 180 : dg;
    bl += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${b.glow}" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})" text-anchor="middle" class="blab">${esc(b.short)}</text>`; }
  bl += "</g>";
  parts.push(bl);
  parts.push(`</svg>`);
  return parts.join("\n");
}
const svg = bakeSVG(payload);

// lean client data — panel info + adjacency for highlight (NOT for construction; the SVG is baked).
const adj = {}; for (const n of payload.nodes) adj[n.id] = [];
for (const r of payload.routes) { if (adj[r.from]) adj[r.from].push(r.to); if (adj[r.to]) adj[r.to].push(r.from); }
const info = {}; for (const n of payload.nodes) info[n.id] = { label: n.label, layer: n.layer, short: n.short, kind: n.kind, status: n.status, deg: n.deg, files: n.files, triggeredBy: n.triggeredBy, description: n.description, io: n.io };
const clientData = JSON.stringify({ adj, info, meta: payload.meta, routes: payload.routes.map((r) => ({ from: r.from, to: r.to })) });

const m = payload.meta;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#0a0e14">
<title>YURI OS — System Die · ${m.nodeCount} nodes</title>
<meta name="description" content="The entire YURI system as one schematic chip die: ${m.nodeCount} nodes (code organs + flow peripherals) wired by ${m.edgeCount} orthogonal traces across ${m.blockCount} layered regions.">
<style>
:root{
  --bg:#0a0e14; --bg-2:#0c1119; --ink:#dfe6ec; --ink-2:#9fb0bd; --ink-3:#647585; --ink-4:#3c4a57;
  --line:rgba(150,175,200,0.14); --accent:#7fb0a4; --gold:#e0c987;
  --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
  --mono:"SF Mono",ui-monospace,"Menlo",monospace;
  --fast:140ms; --ease:cubic-bezier(0.22,1,0.36,1);
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);}
body{color:var(--ink-2);font-family:var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;letter-spacing:0.005em;}
::selection{background:var(--accent);color:var(--bg);}
#stage{position:fixed;inset:0;cursor:grab;touch-action:none;background:radial-gradient(120% 100% at 50% 42%,#0c121b 0%,#080b11 60%,#05070c 100%);}
#stage.grabbing{cursor:grabbing;}
#world{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}
svg.board{display:block;font-family:var(--sans);}
svg.board text{font-family:var(--sans);}
/* SCHEMATIC CELLS — flat, thin, legible */
/* cells read as real tinted PANELS on the grid (not accent-on-void) — brighter, legible */
.cell .cbody{fill:color-mix(in srgb, var(--acc) 20%, #131a24);stroke:var(--acc);stroke-width:1.4;transition:fill var(--fast),stroke var(--fast);}
.cell.peripheral .cbody{fill:color-mix(in srgb, var(--acc) 10%, #0f141c);stroke-dasharray:5 4;stroke-width:1.2;}
.cell.core .cbody{fill:color-mix(in srgb, var(--gold) 24%, #16130b);stroke:var(--gold);stroke-width:1.6;}
.cell .cname{fill:#eef3f7;font-size:10px;font-weight:600;pointer-events:none;letter-spacing:0.01em;}
.cell.peripheral .cname{fill:var(--ink);font-weight:500;}
.cell .cdot{fill:var(--ink-3);}
.cell.st-live .cdot{fill:#6ed8a2;} .cell.st-dormant .cdot{fill:#e6b85a;} .cell.st-phantom .cdot{fill:#d67c7c;}
.cell{cursor:pointer;}
.cell:hover .cbody{fill:color-mix(in srgb, var(--acc) 36%, #131a24);stroke-width:2.2;}
.cell.dim{opacity:0.18;}
.cell.sel .cbody{stroke-width:2.8;fill:color-mix(in srgb, var(--acc) 42%, #131a24);}
/* TRACES — thin copper, visible at rest, bright on focus */
.trace{stroke-width:1.1;opacity:0.34;}
.net-core{stroke:#e0c987;} .net-moat{stroke:#b1a6e0;} .net-feed{stroke:#79bcd6;} .net-rim{stroke:#d0938a;} .net-sig{stroke:#8aa0b4;}
.trace.hl{opacity:0.95;stroke-width:1.8;} .trace.dim{opacity:0.04;}
.blab{font-family:var(--sans);font-size:16px;font-weight:700;letter-spacing:0.14em;opacity:0.95;text-transform:uppercase;pointer-events:none;paint-order:stroke;stroke:rgba(7,10,16,0.92);stroke-width:3.5px;stroke-linejoin:round;}
/* CHROME */
header{position:fixed;top:0;left:0;right:0;z-index:20;padding:14px 22px 26px;pointer-events:none;
  background:linear-gradient(180deg,rgba(8,11,17,0.92),rgba(8,11,17,0.4) 65%,transparent);}
.eyebrow{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.30em;text-transform:uppercase;color:var(--accent);}
h1{font-weight:600;letter-spacing:-0.01em;margin:6px 0 0;font-size:clamp(1.3rem,2.6vw,1.9rem);color:var(--ink);}
h1 .os{color:var(--gold);}
.telem{display:flex;flex-wrap:wrap;gap:13px;margin-top:7px;font-family:var(--mono);font-size:0.7rem;color:var(--ink-3);}
.telem b{color:var(--accent);font-weight:600;}
#rail{position:fixed;top:14px;right:22px;z-index:22;display:flex;gap:7px;align-items:center;pointer-events:auto;}
.btn,.inp{font-family:var(--sans);font-size:0.74rem;background:rgba(20,27,38,0.7);color:var(--ink-2);
  border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;transition:all var(--fast);}
.inp{width:180px;color:var(--ink);}.inp::placeholder{color:var(--ink-4);}
.btn:hover,.inp:focus{border-color:var(--accent);color:var(--ink);outline:none;}
.btn.on{border-color:var(--gold);color:var(--gold);}
/* HIGHLIGHT — focus node + lit neighbours + animated directional flow on every touching trace */
.cell.lit .cbody{stroke-width:2.4;} .cell.lit .cname{fill:#fff;}
.cell.focus .cbody{stroke-width:3.2;}
.trace.flow{opacity:0.96;stroke-width:2.2;stroke-dasharray:7 9;animation:flow 0.7s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-16;}}
.core{animation:corepulse 3.8s ease-in-out infinite;}
@keyframes corepulse{0%,100%{opacity:1;}50%{opacity:0.66;}}
/* NODE-ANCHORED info card — appears beside the clicked node, not a slab side-panel */
#card{position:fixed;z-index:30;width:312px;max-height:72vh;overflow-y:auto;background:rgba(13,18,27,0.97);
  border:1px solid var(--line);border-radius:12px;padding:14px 16px;pointer-events:none;
  opacity:0;transform:translateY(8px) scale(0.97);transition:opacity 170ms var(--ease),transform 170ms var(--ease);
  box-shadow:0 24px 60px -18px #000,0 0 0 1px rgba(127,176,164,0.06);}
#card.show{opacity:1;transform:none;}
#card .ch{display:flex;align-items:center;gap:9px;margin-bottom:3px;}
#card .kpip{width:9px;height:9px;border-radius:2px;background:var(--accent);flex:none;}
#card .kpip.peripheral{background:none;border:1.5px dashed var(--accent);}
#card h3{font-size:1.0rem;color:var(--ink);margin:0;font-weight:600;letter-spacing:-0.01em;line-height:1.2;}
#card .csub{font-family:var(--mono);font-size:0.62rem;color:var(--accent);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:11px;}
#card .cdesc{font-size:0.82rem;line-height:1.5;color:var(--ink-2);margin:0 0 11px;}
#card .cmeta{margin:8px 0;font-size:0.78rem;color:var(--ink-2);}
#card .ck{font-family:var(--mono);font-size:0.56rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-4);display:block;margin-bottom:3px;}
#card .cfiles{display:flex;flex-wrap:wrap;gap:4px;}
#card code{font-family:var(--mono);font-size:0.7rem;color:var(--ink);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:5px;}
#card .muted{color:var(--ink-4);}
#card .cflow{display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-family:var(--mono);font-size:0.72rem;}
#card .cflow .fo{color:#79bcd6;} #card .cflow .fi{color:#d0938a;}
.st-live{color:#6ed8a2;}.st-dormant{color:#e6b85a;}.st-phantom{color:#d67c7c;}
#legend{position:fixed;left:22px;bottom:20px;z-index:20;background:rgba(10,14,20,0.8);border:1px solid var(--line);border-radius:10px;
  padding:12px 14px;font-family:var(--mono);font-size:0.64rem;color:var(--ink-3);max-width:260px;}
#legend .lh{font-size:0.56rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent);margin:0 0 8px;}
.lg{display:flex;align-items:center;gap:8px;margin:3px 0;}.lg i{width:14px;height:0;border-top:2px solid;}
</style>
</head>
<body>
<div id="stage"><div id="world">${svg}</div></div>
<header>
  <div class="eyebrow">YURI · MUSUBI ONE</div>
  <h1>System <span class="os">Die</span></h1>
  <div class="telem"><span><b>${m.nodeCount}</b> nodes</span><span><b>${m.counts.live}</b> live</span><span><b>${m.edgeCount}</b> traces</span><span><b>${m.blockCount}</b> regions</span><span>${m.canvas.w}×${m.canvas.h}</span></div>
</header>
<div id="rail">
  <input id="search" class="inp" placeholder="search organs…" autocomplete="off">
  <button class="btn" id="reset">reset view</button>
</div>
<div id="card"></div>
<div id="legend"><div class="lh">net classes</div>
  <div class="lg"><i style="border-color:#e0c987"></i>core / power</div>
  <div class="lg"><i style="border-color:#b1a6e0"></i>moat signal</div>
  <div class="lg"><i style="border-color:#79bcd6"></i>feed inward</div>
  <div class="lg"><i style="border-color:#d0938a"></i>rim / guard</div>
  <div class="lg" style="margin-top:7px;color:var(--ink-4)">dashed = flow peripheral</div>
</div>
<script>
const DATA = ${clientData};
const stage = document.getElementById("stage"), world = document.getElementById("world");
const board = world.querySelector("svg");
const CW = ${CW}, CH = ${CH};
// ---- pan / zoom (transform the #world group; SVG is static) ----
let scale = 1, tx = 0, ty = 0;
function fit(){ const vw = innerWidth, vh = innerHeight; const pad = 80; scale = Math.min((vw-pad)/CW,(vh-pad)/CH); tx = (vw-CW*scale)/2; ty = (vh-CH*scale)/2; apply(); }
function apply(){ world.style.transform = "translate("+tx+"px,"+ty+"px) scale("+scale+")"; }
stage.addEventListener("wheel", (e)=>{ e.preventDefault(); const f = Math.exp(-e.deltaY*0.0014); const r = stage.getBoundingClientRect();
  const mx = e.clientX-r.left, my = e.clientY-r.top; const ns = Math.max(0.05, Math.min(8, scale*f));
  tx = mx-(mx-tx)*(ns/scale); ty = my-(my-ty)*(ns/scale); scale = ns; apply(); }, {passive:false});
// NO setPointerCapture — capturing the pointer retargets the subsequent click to the stage, so node clicks
// never fire (that was the "card won't open" bug). Track drag at window level + a moved-flag so a pan doesn't
// misfire as a node click.
let drag=null, suppressClick=false;
stage.addEventListener("pointerdown",(e)=>{ if(e.button!==0)return; drag={x:e.clientX,y:e.clientY,tx,ty,moved:false}; stage.classList.add("grabbing"); });
window.addEventListener("pointermove",(e)=>{ if(!drag)return; const dx=e.clientX-drag.x, dy=e.clientY-drag.y; if(!drag.moved&&Math.abs(dx)+Math.abs(dy)>4) drag.moved=true; tx=drag.tx+dx; ty=drag.ty+dy; apply(); });
window.addEventListener("pointerup",()=>{ if(!drag)return; if(drag.moved) suppressClick=true; stage.classList.remove("grabbing"); drag=null; });
document.getElementById("reset").onclick=fit;
// ---- highlight (ego-network + directional flow) + node-anchored info card ----
const cells = new Map(); board.querySelectorAll(".cell").forEach(g=>cells.set(g.dataset.id,g));
const traces = [...board.querySelectorAll(".trace")];
const outSet = {}, inSet = {};
for(const r of DATA.routes||[]){ (outSet[r.from]=outSet[r.from]||new Set()).add(r.to); (inSet[r.to]=inSet[r.to]||new Set()).add(r.from); }
let selected=null;
function nbrs(id){ const s=new Set([id]); (DATA.adj[id]||[]).forEach(o=>s.add(o)); return s; }
// hovering/selecting a node: it FOCUSES, its neighbours LIGHT, everything else DIMS hard, and every trace
// touching it FLOWS (animated dash in its from->to direction) so it's obvious where the flow goes + who's hit.
function highlight(id){ const keep=nbrs(id);
  cells.forEach((g,nid)=>{ const on=keep.has(nid); g.classList.toggle("dim",!on); g.classList.toggle("lit",on&&nid!==id); g.classList.toggle("focus",nid===id); });
  traces.forEach(p=>{ const out=p.dataset.from===id, inc=p.dataset.to===id;
    p.classList.toggle("flow",out||inc); p.classList.toggle("flow-out",out); p.classList.toggle("dim",!(out||inc)); }); }
function clearHL(){ cells.forEach(g=>g.classList.remove("dim","lit","focus")); traces.forEach(p=>p.classList.remove("flow","flow-out","dim")); }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
const card=document.getElementById("card");
function place(el){ const r=el.getBoundingClientRect(); const cw=312, chh=card.offsetHeight||230;
  let x=r.right+16, y=r.top+r.height/2-40; if(x+cw>innerWidth-10) x=r.left-cw-16; if(x<10) x=(innerWidth-cw)/2;
  if(y+chh>innerHeight-10) y=innerHeight-chh-10; if(y<76) y=76; card.style.left=x+"px"; card.style.top=y+"px"; }
function select(id){ const n=DATA.info[id]; if(!n)return; selected=id;
  cells.forEach((g,nid)=>g.classList.toggle("sel",nid===id)); highlight(id);
  const out=(outSet[id]||new Set()).size, inc=(inSet[id]||new Set()).size;
  const files=(n.files||[]).slice(0,5).map(f=>"<code>"+esc(f)+"</code>").join("")||"<span class='muted'>none</span>";
  card.innerHTML="<div class='ch'><span class='kpip "+n.kind+"'></span><h3>"+esc(n.label)+"</h3></div>"+
    "<div class='csub'>"+esc(n.short)+" · "+n.kind+" · <b class='st-"+n.status+"'>"+n.status+"</b></div>"+
    "<p class='cdesc'>"+esc(n.description||"—")+"</p>"+
    (n.triggeredBy?"<div class='cmeta'><span class='ck'>triggered by</span>"+esc(n.triggeredBy)+"</div>":"")+
    "<div class='cmeta'><span class='ck'>files</span><span class='cfiles'>"+files+"</span></div>"+
    "<div class='cflow'><span class='fo'>→ "+out+" out</span><span class='fi'>"+inc+" in ←</span></div>";
  place(cells.get(id)); card.classList.add("show"); }
function deselect(){ selected=null; cells.forEach(g=>g.classList.remove("sel")); clearHL(); card.classList.remove("show"); }
cells.forEach((g,id)=>{
  g.addEventListener("mouseenter",()=>{ if(!selected) highlight(id); });
  g.addEventListener("mouseleave",()=>{ if(!selected) clearHL(); });
  g.addEventListener("click",(e)=>{ e.stopPropagation(); if(suppressClick){suppressClick=false;return;} selected===id?deselect():select(id); });
});
stage.addEventListener("click",()=>{ if(suppressClick){suppressClick=false;return;} if(selected) deselect(); });
// ---- search ----
const search=document.getElementById("search");
search.addEventListener("input",()=>{ const q=search.value.trim().toLowerCase();
  if(!q){ cells.forEach(g=>g.classList.remove("dim")); return; }
  cells.forEach((g,id)=>{ const n=DATA.info[id]; const hay=(n.label+" "+n.layer+" "+(n.files||[]).join(" ")+" "+n.description).toLowerCase(); g.classList.toggle("dim",hay.indexOf(q)<0); }); });
addEventListener("keydown",(e)=>{ if(e.key==="Escape") deselect(); if(e.key==="/"&&document.activeElement!==search){ e.preventDefault(); search.focus(); } });
fit();
</script>
</body>
</html>`;
writeFileSync(OUT, html, "utf8");
console.log(`die(schematic): ${payload.nodes.length} cells (${JSON.stringify(payload.meta.counts)}), ${payload.routes.length} traces, ${payload.blocks.length} blocks, canvas ${CW}x${CH}, html ${(html.length / 1024).toFixed(0)}KB`);
