#!/usr/bin/env node
// build-chip-die.mjs  — YURI Circuit Die: PER-TIER MATERIAL MIX (a deliberate blend).
//
//   node 02_RESOURCES/RESEARCH/circuitry/build-chip-die.mjs   -> ./yuri-chip-die.html
//
// MERGES four material redesigns (M1/M2/M3/M4) into ONE generator, dispatching the
// per-cell material by its radial tier — each tier rendered in its best-fit material:
//   tier 0 (core disc · energy hub + kernel)  -> M4 iridescent dark-glass (hero jewel)
//   tier 1 (MOAT band · memory/cognition/energy) -> M2 frosted glass (precious inner ring)
//   tier 2 (SYSTEMS band)                        -> M1 brushed-metal QFN (workhorse parts)
//   tier 3 (RIM band · governance/hidden)        -> M3 ceramic IC package (boundary parts)
// ALL tiers share M1's DEPTH treatment (contact-shadow layer + AO + inner shadow + bevel)
// and the colour-as-TINT rule (layer hue integrated into the body gradient + rim, NEVER a
// flat translucent wash). Pins/leads/LED/label/part-number/pin-1 detail render on every cell.
// LAYOUT, wiring, pan/zoom shell, facing-rotation, label-flip are byte-identical to the
// canonical build-chip-die.mjs — only the per-cell material is forked.
//
// LOCKED LAYOUT (owner: "D + a mix of B"): reuse K1D-tiers.mjs concentric
// dependency-tier bands (glowing energy core disc dead-centre + concentric bands
// outward with real ring GAPS) AND B's per-layer accent COLOUR so every layer reads
// as a distinct coloured radial region. Placement is NOT redesigned.
//
// Reuses the self-contained interactive shell + material defs from build-chip-die.mjs
// (viewBox pan/zoom, minimap, detail panel, search, brushed-metal feSpecularLighting,
// EUV blue-violet plasma core, wafer iridescence, dark substrate). Data INLINED so it
// opens via file://.
//
// THE TWO FOCUSES (the whole job):
//   FOCUS 1 — REAL CIRCUIT WIRING.  Every edge is routed as a crisp ORTHOGONAL copper
//     trace: radial run out of the source cell -> 90° rounded corner onto an ARC lane
//     riding a ring-GAP channel -> radial run into the target cell. Right angles,
//     rounded fillets, lane-separated channels (parallel runs never overlap), VIA dots
//     at every bend + endpoint, a bright copper centreline over a darker copper bed,
//     colour-coded by net class. Reads as a real PCB.
//   FOCUS 2 — QFN CHIP-PACKAGE CELLS.  Each cell is a premium QFN/SMD package: beveled
//     metallic body (specular top edge, shadowed bottom), gull-wing PIN LEADS on the
//     sides where traces connect, a pin-1 corner marker, a status LED, an etched part
//     label, a degree-driven SIZE hierarchy (hubs noticeably bigger). Fabricated, not flat.
//
// Deterministic: no RNG, no wall-clock. Pseudo-noise seeded by a fixed integer.
// Pure Node ESM, zero npm deps.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTierFloorplan } from "./K1D-tiers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "yuri-circuitry-graph.json");
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
  "Governance & Safety": "GOVERNANCE",
  "Skills & Orchestration": "SKILLS",
  "Token-Efficiency & Session": "SESSION · TOKENS",
  "Hidden / Meta / Self-referential": "HIDDEN · META",
};

// per-layer accent (region identity) — B's distinct hue wheel, kept inside the
// silicon-die palette. {a:edge/ink hue, b:deep shadow, glow:bright bloom}
const LAYER_COLOR = {
  "Energy & Math":            { a: "#a78f54", b: "#42371d", glow: "#c3a967" },
  "Cognition & Persona":      { a: "#6f928a", b: "#2a3a36", glow: "#88a89f" },
  "Memory & Subconscious":    { a: "#8a82a6", b: "#332c47", glow: "#a298bd" },
  "Retrieval & Knowledge":    { a: "#6f96a6", b: "#27424e", glow: "#8cb0bf" },
  "Learning & Continuity":    { a: "#76889e", b: "#313c4e", glow: "#92a4b8" },
  "Governance & Safety":      { a: "#9e6a5e", b: "#43302a", glow: "#b8857a" },
  "Skills & Orchestration":   { a: "#a3825c", b: "#4a3826", glow: "#bd9d76" },
  "Token-Efficiency & Session": { a: "#7a8794", b: "#373f48", glow: "#94a0ac" },
  "Hidden / Meta / Self-referential": { a: "#828b94", b: "#414950", glow: "#9aa2aa" },
};

// ============================================================================
// MATERIAL COLOUR MATH (Node-side, deterministic). Two engines lifted verbatim:
//   • M1 — per-layer INTEGRATED-TINT brushed-metal gradients (tier 2 bodies). Colour
//     folded into a lit-metal ramp; mids/shadows carry hue, top bevel near-neutral.
//   • M4 — per-cell DARK-GLASS + iridescent thin-film material tokens (tier 0 bodies).
//     Layer hue baked deep into a near-black coated-glass gradient + a cyan->violet->amber
//     iridescent rim. No flat wash anywhere — colour IS the material.
// (M2 frosted glass + M3 ceramic build their tinted gradients per-cell in the browser
//  loop from n.accent/n.glow/n.accentB; no extra Node tokens needed for those tiers.)
// ============================================================================
// ---- M1 brushed-metal integrated-tint engine ----
const hx2rgb = (h) => { const m = h.replace("#", ""); return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]; };
const rgb2hx = (r) => "#" + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);           // linear rgb mix
const desat = (rgb, k) => { const g = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; return rgb.map((v) => v + (g - v) * k); };
const tone = (rgb, k) => rgb.map((v) => v + (255 - v) * k);              // toward white (highlight)
const shade = (rgb, k) => rgb.map((v) => v * (1 - k));                   // toward black (shadow)
const METAL_RAMP = [
  ["0%",  "#dbe6f1", 0.10],   // top specular bevel — near-neutral bright catch
  ["7%",  "#aebecd", 0.28],   // shoulder (tint starts)
  ["22%", "#7888a0", 0.58],   // upper mid (colour reads)
  ["46%", "#46596b", 0.80],   // body — deepest colour identity (anodised tint lives here)
  ["68%", "#324250", 0.78],
  ["88%", "#26323d", 0.62],
  ["100%","#3c4c5b", 0.62],   // reflected bottom bounce (lifted + tinted)
];
function metalStops(accentHex) {
  const acc = hx2rgb(accentHex);
  return METAL_RAMP.map(([off, baseHex, w]) => {
    const base = hx2rgb(baseHex);
    const offN = parseFloat(off) / 100;
    const tinted = shade(desat(acc, 0.12), 0.08 + offN * 0.24);
    return [off, rgb2hx(mix3(base, tinted, w))];
  });
}
function rimHex(accentHex) { return rgb2hx(tone(desat(hx2rgb(accentHex), 0.18), 0.40)); }
const LAYER_KEY = {};
Object.keys(LAYER_COLOR).forEach((L, i) => { LAYER_KEY[L] = "L" + i; });
function layerKeyOf(layer) { return LAYER_KEY[layer] || "L3"; }

// ---- M4 dark-glass + iridescent thin-film engine ----
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return rgb2hx([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
function rimHue(hue, l, sat) { return hslToHex(hue, sat, l); }
function glassMaterial(accent, moat) {
  const [h] = rgbToHsl(hx2rgb(accent));
  return {
    g0: hslToHex(h, 0.34, 0.34), g1: hslToHex(h, 0.42, 0.205),
    g2: hslToHex(h, 0.50, 0.115), g3: hslToHex(h, 0.46, 0.055),
    irA: rimHue(h - 40, 0.66, 0.88), irB: rimHue(h, 0.70, 0.86), irC: rimHue(h + 56, 0.64, 0.82),
    rim: rimHue(h, moat ? 0.72 : 0.64, moat ? 0.78 : 0.66),
    ao: hslToHex(h, 0.40, 0.03),
  };
}

// --- status from prose (live / dormant / phantom) ---
function statusOf(n) {
  const d = (n.description || "") + " " + (n.label || "");
  if (!n.files || n.files.length === 0 || /\bPHANTOM\b/.test(d)) return "phantom";
  if (/\bUNWIRED\b|\bDORMANT\b|\bSUPERSEDED\b|NO live trigger|no live hook|currently surfaces nothing/i.test(d))
    return "dormant";
  return "live";
}

// graph edges = both endpoints are real node ids (the 77 wired traces).
const nodeIds = new Set(nodes.map((n) => n.id));
const graphEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);

// ------------------------------------------------------------------ FLOORPLAN
// LOCKED — K1D concentric dependency tiers. Cells carry {x,y,w,h,cx,cy,layer,band,tier,ang,r}.
// cellBase bumped so QFN packages read as fabricated components (more pixels for the
// bevels / leads / etch detail) without moving any radius-based placement.
const floor = buildTierFloorplan(nodes, graphEdges, { cellBase: 120 });
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
// PCB ORTHOGONAL ROUTER (radial-orthogonal — the correct Manhattan for a circular
// die). A trace leaves its source cell radially, turns a clean 90° (rounded) onto an
// ARC lane riding a ring-GAP channel, runs along that arc to the target angle, then
// turns radially into the target. Lane separation: each edge is assigned a distinct
// arc-radius lane inside the gap, so parallel runs never share a copper path.
// ----------------------------------------------------------------------------
const polar = (c) => {
  const dx = c.cx - CTR.x, dy = c.cy - CTR.y;
  return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
};
const P = (r, a) => [CTR.x + r * Math.cos(a), CTR.y + r * Math.sin(a)];
const f1 = (n) => n.toFixed(1);

// ring-GAP channels — the breathing space between bands is where copper routes.
// (band rOut -> next band rIn). Build a channel descriptor per gap.
const bandsSorted = floor.bands.slice().sort((a, b) => a.rIn - b.rIn);
// gap mid-radii between consecutive bands (core->moat, moat->systems, systems->rim)
const GAPS = [];
for (let i = 0; i < bandsSorted.length - 1; i++) {
  const inner = bandsSorted[i], outer = bandsSorted[i + 1];
  GAPS.push({ rIn: inner.rOut, rOut: outer.rIn, rMid: (inner.rOut + outer.rIn) / 2, idx: i });
}
// an outer ring channel just past the rim for rim-internal long runs
const RIM_CH = { rIn: OUTR, rOut: OUTR + 70, rMid: OUTR + 40, idx: GAPS.length };
const ALL_CH = [...GAPS, RIM_CH];

// deterministic per-edge lane hash (FNV) -> spreads parallel runs into separate lanes.
function laneHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
const adelta = (a0, a1) => { let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// Net class (colour) by routing relationship — all 77 wired edges are kind=calls, so
// we differentiate by the DEPENDENCY relationship for a real multi-net PCB read:
//   core   = touches the energy core disc (tier 0)         -> gold power net
//   moat   = stays inside the moat band (tier 1<->1)        -> violet signal net
//   feed   = commodity/rim feeding INWARD toward the moat   -> cyan signal net
//   rim    = governance/hidden-internal & outward           -> red/amber guard net
function netClass(A, B) {
  if (A.tier === 0 || B.tier === 0) return "core";
  if (A.tier === 1 && B.tier === 1) return "moat";
  const inward = Math.min(A.tier, B.tier);
  const outward = Math.max(A.tier, B.tier);
  if (inward === 1) return "feed";           // pulls into the moat
  if (outward >= 3) return "rim";
  return "sig";
}

// Build orthogonal-radial path. Returns {d, vias:[[x,y]...], corners}.
// strategy:
//   - leave source along its radius to a "fan-out" radius just outside the cell
//   - step to a channel ring (the gap between the two endpoints' tiers, or the
//     inner endpoint's adjacent gap) — radial segment
//   - run the ARC along that channel at a lane-separated radius to the target angle
//   - radial segment into the target cell
// Right-angle corners are softened with a small arc fillet (quadratic) — crisp PCB look.
const CELL_FAN = 16;        // radial standoff outside a cell before the first turn
const LANE_PITCH = 7;       // px between parallel arc lanes within a channel
const LANES = 7;            // number of distinct arc lanes per channel
const FILLET = 9;           // corner rounding radius

function rounded(pts) {
  // pts: array of [x,y]. Build an SVG path with rounded corners (fillet) between
  // consecutive segments. Mirrors KiCad-style 90° arc corners.
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

// arc segment between two angles at radius r, sampled as polyline (orthogonal router
// treats the arc as the "horizontal" Manhattan run on a circular board).
function arcPts(r, a0, a1) {
  const da = adelta(a0, a1);
  const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.05));
  const out = [];
  for (let s = 0; s <= steps; s++) out.push(P(r, a0 + da * (s / steps)));
  return out;
}

// choose the channel a cross-tier edge should ride: the gap between the inner
// endpoint's tier and the next tier outward (so the arc sits in clean dead space).
function channelForTiers(tA, tB) {
  const lo = Math.min(tA, tB);
  // gap index lo corresponds to the gap just OUTSIDE band `lo`.
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

  // ---- same exact angle-ish & same tier: short radial-only jog (rare) ----
  const sameTier = A.tier === B.tier;

  if (A.tier === 0 && B.tier === 0) {
    // core-internal: tiny L-route inside the disc (both near centre) — crisp short link.
    const mid = [(A.cx + B.cx) / 2, (A.cy + B.cy) / 2];
    // route via a point offset perpendicular so two core nets don't overlap
    const ox = (B.cy - A.cy), oy = -(B.cx - A.cx); const ol = Math.hypot(ox, oy) || 1;
    const k = laneOff * 0.7;
    const bend = [mid[0] + (ox / ol) * k, mid[1] + (oy / ol) * k];
    vias.push([Math.round(bend[0]), Math.round(bend[1])]);
    return { from: e.from, to: e.to, kind: e.kind, cls, lane,
      d: rounded([[A.cx, A.cy], bend, [B.cx, B.cy]]), vias };
  }

  if (sameTier) {
    // same band: run an ARC lane riding just inside that band's mid (lane-separated),
    // with radial stubs out of each cell. Pure orthogonal: radial -> arc -> radial.
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

  // ---- cross-tier: radial out -> arc on a ring-GAP channel -> radial in ----
  const inner = pa.r <= pb.r ? { p: pa, c: A } : { p: pb, c: B };
  const outer = pa.r <= pb.r ? { p: pb, c: B } : { p: pa, c: A };
  const ch = channelForTiers(A.tier, B.tier);
  const rChan = ch.rMid + laneOff;

  // source = the actual A (preserve direction), but we route by inner/outer geometry.
  const startIsInner = (inner.c === A);
  const s = startIsInner ? inner : outer;
  const t = startIsInner ? outer : inner;

  // path: A.center -> radial standoff -> radial to channel -> arc to target angle ->
  //       radial to target standoff -> B.center.
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

// ----------------------------------------------------------------------------
// I/O bond-pad ring — circular pad ring just outside the rim (echoes the radial die).
// ----------------------------------------------------------------------------
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
// PAYLOAD
// ----------------------------------------------------------------------------
const counts = { live: 0, dormant: 0, phantom: 0 };
const nodeOut = nodes.map((n) => {
  const c = cells[n.id];
  const st = statusOf(n);
  counts[st]++;
  const col = LAYER_COLOR[n.layer] || LAYER_COLOR["Retrieval & Knowledge"];
  const moat = MOAT_LAYERS.has(n.layer);
  return {
    id: n.id, label: n.label, layer: n.layer, short: BLOCK_SHORT[n.layer] || n.layer,
    files: n.files || [], triggeredBy: n.triggeredBy || "", description: n.description || "",
    status: st, moat, core: c.band === 0,
    x: c.x, y: c.y, w: c.w, h: c.h, cx: c.cx, cy: c.cy,
    band: c.band, tier: c.tier, ang: +(c.ang || 0).toFixed(4), r: Math.round(c.r || 0),
    deg: degree.get(n.id) || 0, sizeScale: +(c.w / 104).toFixed(3),
    accent: col.a, glow: col.glow, accentB: col.b,
    // per-tier material tokens — M1 metal (layerKey/accentRim), M4 glass (mat).
    layerKey: layerKeyOf(n.layer), accentRim: rimHex(col.a), mat: glassMaterial(col.a, moat),
    io: artifactIO.get(n.id) || [],
  };
});
// per-layer integrated-tint metal gradient stops (M1) — built once, referenced by id.
const layerGrads = Object.keys(LAYER_COLOR).map((L) => ({
  key: layerKeyOf(L), stops: metalStops(LAYER_COLOR[L].a),
}));
const blockOut = floor.blocks.map((b) => {
  const col = LAYER_COLOR[b.layer.replace(" · CORE", "")] || (b.core ? LAYER_COLOR["Energy & Math"] : LAYER_COLOR["Retrieval & Knowledge"]);
  return {
    layer: b.layer, short: BLOCK_SHORT[b.layer] || (b.core ? "ENERGY · CORE" : b.layer),
    moat: b.moat, core: !!b.core, perimeter: !!b.perimeter,
    band: b.band, tier: b.tier,
    a0: b.a0, a1: b.a1, aMid: b.aMid, rIn: b.rIn, rOut: b.rOut, rMid: b.rMid,
    labelR: b.labelR, labelAngle: b.labelAngle,
    accent: col.a, accentB: col.b, glow: col.glow, count: b.n,
  };
});
const bandOut = bandsSorted.map((b) => ({ tier: b.tier, rIn: b.rIn, rOut: b.rOut, rMid: b.rMid, accent: b.accent, core: !!b.core, name: b.name || "" }));
const chanOut = ALL_CH.map((c) => ({ rIn: c.rIn, rOut: c.rOut, rMid: c.rMid, idx: c.idx }));

const payload = {
  meta: {
    generatedAt: graph.generatedAt || null,
    nodeCount: nodes.length, edgeCount: graphEdges.length, blockCount: blockOut.length,
    counts, canvas: { w: CW, h: CH },
    maxDeg, coreR: CORER, outerR: OUTR,
    // content radius the default view frames. The hero is the glowing core + moat; the
    // RIM can sit near/just past the frame edge. Framing the rim tightly (not rim+labels+
    // pads) makes every QFN package render large enough to read as a fabricated component.
    contentR: OUTR + 40,
  },
  center,
  bands: bandOut,
  channels: chanOut,
  blocks: blockOut,
  nodes: nodeOut,
  layerGrads,
  routes: routes.map((r) => ({ from: r.from, to: r.to, kind: r.kind, cls: r.cls, path: r.d, vias: r.vias })),
  pads,
};
const json = JSON.stringify(payload);

// ----------------------------------------------------------------------------
// HTML
// ----------------------------------------------------------------------------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#04060a">
<title>YURI OS — Circuit Die · PCB Traces · MUSUBI ONE</title>
<meta name="description" content="The YURI organ map as a cyberpunk silicon die: ${payload.meta.nodeCount} QFN cells wired by ${payload.meta.edgeCount} orthogonal copper traces across ${payload.meta.blockCount} functional regions — the moat made visible.">
<style>
:root{
  --die:#050608; --die-2:#080a0d; --die-3:#0c0f13;
  --ink:#d2d8dc; --ink-2:#9aa6b0; --ink-3:#5f6b76; --ink-4:#3a444d;
  --cyan:#6f97a8; --cyan-2:#9ab8c5; --cyan-deep:#2c4a56; --cyan-dim:rgba(111,151,168,0.28);
  --teal:#4d8076; --teal-bright:#6fa093;
  --gold:#8f7a44; --gold-bright:#b39a5e; --gold-deep:#52431f;
  --copper:#9a7c4e; --copper-2:#c0a070; --copper-bed:#3e2c16;
  --pos:#4f9678; --warn:#bf9440; --risk:#ab584c; --neutral:#6a7a88; --violet:#8a82a6;
  --grid:rgba(120,150,170,0.05); --grid2:rgba(120,150,170,0.09);
  --hair:rgba(140,165,185,0.16); --hair-gold:rgba(150,128,80,0.24);
  --hot:#9a6a8a;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --serif:"Hoefler Text","Iowan Old Style",Palatino,Georgia,serif;
  --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  --dur:420ms; --fast:170ms; --ease:cubic-bezier(0.16,1,0.30,1);
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;height:100%;overflow:hidden;background:var(--die);-webkit-text-size-adjust:100%;}
body{color:var(--ink-2);font-family:var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
::selection{background:var(--cyan);color:var(--die);}

/* AURORA environment — fixed deep-space mesh: near-black base + a few soft desaturated
   blooms (cool steel / deep violet / faint bronze). One field behind everything (die +
   surround identical), hardware-accelerated, no noise, no seam, zero pan cost. */
#stage{position:fixed;inset:0;z-index:1;cursor:grab;touch-action:none;
  background:
    radial-gradient(58% 52% at 22% 16%, rgba(44,74,100,0.40), transparent 62%),
    radial-gradient(54% 50% at 82% 80%, rgba(66,52,98,0.36), transparent 64%),
    radial-gradient(46% 44% at 64% 40%, rgba(92,74,46,0.20), transparent 60%),
    radial-gradient(130% 110% at 50% 46%, #080b11 0%, #05070c 56%, #010204 100%);}
#stage.grabbing{cursor:grabbing;}
#viewport{position:absolute;inset:0;}
#boardwrap{width:100%;height:100%;}
/* during pan/zoom: shed EVERY board filter so nothing re-rasters (kills lag + black-box tiles); snaps back crisp at rest */
.nav .board *{filter:none!important;}
.nav .cell{filter:none!important;}
svg.board{display:block;width:100%;height:100%;}

#fx{position:fixed;inset:0;z-index:6;pointer-events:none;}
#fx::before{content:"";position:absolute;inset:0;
  background:radial-gradient(82% 60% at 50% 0%,rgba(150,180,210,0.035),transparent 58%);}
#fx::after{content:"";position:absolute;inset:0;
  background:radial-gradient(135% 120% at 50% 48%,transparent 64%,rgba(2,4,8,0.34) 90%,rgba(1,2,4,0.64) 100%);}
#frame{position:fixed;inset:10px;z-index:19;pointer-events:none;border:1px solid rgba(90,210,255,0.07);border-radius:3px;}
#frame i{position:absolute;width:24px;height:24px;border:2px solid var(--cyan);opacity:0.55;}
#frame i.tl{top:-1px;left:-1px;border-right:none;border-bottom:none;}
#frame i.tr{top:-1px;right:-1px;border-left:none;border-bottom:none;}
#frame i.bl{bottom:-1px;left:-1px;border-right:none;border-top:none;}
#frame i.br{bottom:-1px;right:-1px;border-left:none;border-top:none;}

header{position:fixed;top:0;left:0;right:0;z-index:20;padding:16px 24px 30px;pointer-events:none;
  background:linear-gradient(180deg,rgba(2,4,8,0.94) 0%,rgba(2,4,8,0.55) 62%,transparent 100%);}
.eyebrow{font-family:var(--mono);font-size:0.64rem;letter-spacing:0.34em;text-transform:uppercase;
  color:var(--cyan);display:inline-flex;align-items:center;gap:9px;}
.eyebrow::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--cyan));}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--gold-bright);box-shadow:0 0 8px var(--gold-bright);animation:pulse 2.4s var(--ease) infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
h1{font-family:var(--serif);font-weight:600;letter-spacing:0.01em;line-height:1;margin:8px 0 0;
  font-size:clamp(1.6rem,3.4vw,2.7rem);color:var(--gold-bright);text-shadow:0 0 24px rgba(201,161,74,0.35);}
h1 .os{color:var(--cyan-2);text-shadow:0 0 22px rgba(90,210,255,0.4);}
.telem{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-family:var(--mono);font-size:0.72rem;color:var(--ink-3);}
.telem b{color:var(--cyan-2);font-weight:600;}
.telem .sep{color:var(--ink-4);}
.moatline{margin-top:8px;max-width:660px;font-size:0.8rem;line-height:1.5;color:var(--ink-3);}
.moatline .g{color:var(--gold-bright);}

#rail{position:fixed;top:16px;right:24px;z-index:22;display:flex;gap:7px;align-items:center;pointer-events:auto;}
.btn,.inp{font-family:var(--mono);font-size:0.72rem;background:rgba(22,29,40,0.5);color:var(--ink-2);
  border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 11px;cursor:pointer;backdrop-filter:blur(16px) saturate(1.3);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 6px 18px -8px rgba(0,0,0,0.6);
  transition:border-color var(--fast),color var(--fast),box-shadow var(--fast);}
.inp{cursor:text;width:170px;color:var(--ink);}
.inp::placeholder{color:var(--ink-4);}
.btn:hover,.inp:focus{border-color:var(--cyan);color:var(--ink);outline:none;box-shadow:0 0 14px -4px var(--cyan);}
.btn.on{border-color:var(--gold);color:var(--gold-bright);box-shadow:0 0 16px -4px var(--gold);background:rgba(201,161,74,0.1);}

#chips{position:fixed;top:112px;left:24px;right:24px;z-index:18;display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto;
  -webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent);}
.chip{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.06em;padding:5px 9px;border-radius:4px;
  border:1px solid rgba(255,255,255,0.09);background:rgba(20,27,38,0.45);backdrop-filter:blur(14px) saturate(1.3);color:var(--ink-3);
  cursor:pointer;white-space:nowrap;transition:all var(--fast);display:inline-flex;align-items:center;gap:6px;}
.chip .swd{width:8px;height:8px;border-radius:2px;flex:none;}
.chip:hover{color:var(--ink);border-color:var(--cyan-dim);}
.chip.on{color:var(--die);border-color:transparent;font-weight:700;}
.chip .c{opacity:0.6;margin-left:3px;}

#legend{position:fixed;left:24px;bottom:24px;z-index:20;background:rgba(20,27,38,0.46);backdrop-filter:blur(18px) saturate(1.35);
  border:1px solid var(--hair);border-radius:8px;padding:13px 15px;font-family:var(--mono);font-size:0.66rem;
  color:var(--ink-3);max-width:300px;box-shadow:0 18px 40px -18px #000;}
#legend .lh{font-size:0.58rem;letter-spacing:0.22em;text-transform:uppercase;color:var(--cyan);margin:0 0 9px;}
.lg{display:flex;align-items:center;gap:9px;margin:4px 0;}
.sw{width:18px;height:3px;border-radius:2px;flex:none;}
.dot{width:8px;height:8px;border-radius:50%;flex:none;}
.legrow{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-top:9px;padding-top:9px;border-top:1px solid var(--hair);}

#minimap{position:fixed;right:24px;bottom:24px;z-index:20;width:210px;border:1px solid var(--hair);
  border-radius:8px;background:rgba(14,20,30,0.5);backdrop-filter:blur(16px) saturate(1.3);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1),0 18px 40px -18px #000;cursor:pointer;}
#minimap svg{display:block;}
#mmView{fill:rgba(90,210,255,0.1);stroke:var(--cyan);stroke-width:2;}

#panel{position:fixed;top:0;right:0;height:100%;width:min(420px,92vw);z-index:30;display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(18,24,34,0.74),rgba(8,11,16,0.76));backdrop-filter:blur(22px) saturate(1.3);border-left:1px solid rgba(255,255,255,0.1);
  box-shadow:inset 1px 0 0 rgba(255,255,255,0.06),-30px 0 60px -30px #000;transform:translateX(100%);transition:transform var(--dur) var(--ease);}
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

/* ---- svg die scaffolding ---- */
.seal{fill:none;stroke:var(--hair-gold);stroke-width:1.5;stroke-dasharray:1 5;}
.seal2{fill:none;stroke:rgba(90,210,255,0.16);stroke-width:1;}
.pad{fill:#0c1320;stroke:var(--gold);stroke-width:1;}
.pad.cyan{stroke:var(--cyan-deep);}
.fiducial{stroke:var(--cyan);stroke-width:1.4;fill:none;opacity:0.6;}
.prail{fill:none;stroke-width:1;opacity:0.06;}
.prail.v{stroke:var(--gold);} .prail.h{stroke:var(--cyan);}
/* channel beds — faint copper-route lanes riding each ring GAP */
.chanbed{fill:none;stroke:rgba(232,166,99,0.05);stroke-width:1;}

.band-tint{stroke:none;}
.band-edge{fill:none;stroke-width:1.4;stroke-opacity:0.42;}
.wedge-tint{stroke:none;}

.arc-name{font-family:var(--mono);font-size:16px;font-weight:700;letter-spacing:0.22em;opacity:1;text-transform:uppercase;paint-order:stroke;stroke:rgba(2,4,8,0.9);stroke-width:3px;}
.arc-name.moat{font-size:17px;}
.arc-name.perim{letter-spacing:0.26em;}

.core-halo{fill:url(#coreHalo);filter:url(#bigglow);}
.core-face{fill:url(#coreFace);}
.core-rim{fill:none;stroke:var(--gold-bright);stroke-width:2.2;opacity:0.85;filter:url(#softglow);}
.core-rim2{fill:none;stroke:var(--gold);stroke-width:1;opacity:0.5;stroke-dasharray:2 6;}
.core-tick{stroke:var(--gold-bright);stroke-width:1.2;opacity:0.55;}
.region-name.core{fill:var(--gold-bright);font-family:var(--mono);font-weight:700;font-size:13px;letter-spacing:0.22em;text-transform:uppercase;}

/* =================  PCB COPPER WIRING  ================= */
/* every trace is drawn TWICE: a wide darker copper BED under a bright thin CENTRELINE,
   giving real etched-copper depth. net class sets the hue. */
.trace{fill:none;stroke-linecap:round;stroke-linejoin:round;transition:opacity var(--fast),stroke-width var(--fast);}
.trace.bed{stroke-width:7;opacity:0.5;}
.trace.copper{stroke-width:2.6;opacity:0.9;}
/* net-class colours (read as distinct copper nets on the board) */
.trace.bed.core{stroke:#463719;} .trace.copper.core{stroke:#bca473;stroke-width:3.4;}
.trace.bed.moat{stroke:#36304a;} .trace.copper.moat{stroke:#998fb0;}
.trace.bed.feed{stroke:#223e49;} .trace.copper.feed{stroke:#7c9dad;}
.trace.bed.sig{stroke:#283d49;}  .trace.copper.sig{stroke:#869aa8;}
.trace.bed.rim{stroke:#4a2a24;}  .trace.copper.rim{stroke:#b0827a;}
.trace.bed.dim,.trace.copper.dim{opacity:0.04;}
.trace.copper.hl{stroke-width:3.4;opacity:1;filter:url(#softglow);}
.trace.bed.hl{stroke-width:7.5;opacity:0.7;}
.flow{fill:none;stroke:#FFE6BE;stroke-width:2.4;opacity:0;stroke-dasharray:3 15;stroke-linecap:round;filter:url(#softglow);}
.flow.on{opacity:0.95;animation:flow 1.1s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-36;}}
/* vias — copper-ringed plated holes at every bend + endpoint */
.via{fill:#0a0f18;stroke-width:1.8;opacity:0.72;transition:opacity var(--fast);}
.via.core{stroke:#E8A663;} .via.moat{stroke:#9b7bff;} .via.feed{stroke:#5AD2FF;} .via.sig{stroke:#6E9FD0;} .via.rim{stroke:#E0776B;}
.via.hl{opacity:1;stroke-width:1.8;}

/* =================  PER-TIER MATERIAL-MIX CHIP CELLS  =================
   Each cell carries a tier class (.t0 glass-hero / .t1 frosted / .t2 metal / .t3 ceramic).
   Shared depth: the .csl contact-shadow LAYER renders behind all cells (M1); per-cell AO +
   inner-shadow + bevels add the rest. Colour is INTEGRATED (gradient + rim), never a wash. */
.cell{cursor:pointer;}
/* ---- shared LEADS (overridden per-tier below) ---- */
.cell .c-lead{fill:url(#leadMetal_m1);stroke:rgba(12,18,24,0.85);stroke-width:0.5;}
.cell.moat .c-lead{fill:url(#leadGold_m1);}
/* ---- shared depth + scaffolding classes ---- */
.cell .c-ao{fill:none;pointer-events:none;}
.cell .c-inner{fill:none;pointer-events:none;}
.cell .c-spec,.cell .c-brush,.cell .c-streak,.cell .c-refr,.cell .c-frost,.cell .c-irid,.cell .c-irid2,.cell .c-cres,.cell .c-rim,.cell .c-tint,.cell .c-grain{pointer-events:none;}
.cell .c-bevel-t{stroke:rgba(224,238,255,0.92);stroke-width:1.5;fill:none;}
.cell.moat .c-bevel-t{stroke:rgba(255,238,188,0.95);}
.cell .c-bevel-b{stroke:rgba(0,0,0,0.6);stroke-width:1.7;fill:none;}
/* ---- shared structural edge ---- */
.cell .c-edge{fill:none;stroke-width:1;stroke-opacity:0.55;transition:stroke var(--fast),stroke-width var(--fast),stroke-opacity var(--fast);}
.cell:hover .c-edge,.cell.sel .c-edge{stroke-opacity:1;}
.cell[data-status="dormant"] .c-edge,.cell[data-status="dormant"] .c-silk{stroke-dasharray:5 3;}
.cell[data-status="phantom"] .c-edge,.cell[data-status="phantom"] .c-silk{stroke-dasharray:2 4;}
.cell:hover .c-edge,.cell:hover .c-silk{stroke-width:1.8;}
.cell.sel .c-edge,.cell.sel .c-silk{stroke-width:2.4;}
/* ---- shared label / detail ---- */
.cell .c-name{font-family:var(--mono);font-size:11px;font-weight:600;fill:#eef5fc;pointer-events:none;letter-spacing:0.02em;paint-order:stroke;stroke:rgba(4,8,14,0.55);stroke-width:2.4px;}
.cell.moat .c-name{fill:#fbf3dd;stroke:rgba(20,12,2,0.5);}
.cell .c-part{font-family:var(--mono);font-size:7px;fill:rgba(186,210,232,0.62);letter-spacing:0.14em;pointer-events:none;}
.cell.moat .c-part{fill:rgba(231,201,127,0.62);}
.cell .c-pin1{fill:none;stroke:#ffd6a0;stroke-width:1.4;opacity:0.88;}
.cell .c-pad{fill:#0a0f17;stroke-width:1;opacity:0.92;}
.cell .c-silk{fill:none;stroke-width:1.4;stroke-opacity:0.8;transition:stroke-opacity var(--fast),stroke-width var(--fast);}
.cell .c-mark{stroke:rgba(0,0,0,0.35);stroke-width:0.5;}
.cell .c-cavity{fill:url(#cavityFloor_m3);}
.cell .c-cavity-rim{fill:none;stroke:rgba(0,0,0,0.55);stroke-width:1.2;}
.cell .c-cavity-lip{fill:none;stroke:rgba(255,250,240,0.22);stroke-width:0.8;}
.cell .c-die{fill:url(#dieMetal_m3);}
.cell .c-die-grid{stroke:rgba(150,180,210,0.18);stroke-width:0.4;fill:none;}
.cell .c-chamfer-t{stroke:rgba(255,252,244,0.30);stroke-width:1.1;fill:none;}
.cell .c-chamfer-b{stroke:rgba(0,0,0,0.40);stroke-width:1.3;fill:none;}
.cell .c-contact,.cell .c-contact2{pointer-events:none;}
.cell .c-back{pointer-events:none;}
.cell.dim{opacity:0.1;}
.cell.sel .c-body{filter:drop-shadow(0 0 10px rgba(90,210,255,0.55));}
.cell.moat.sel .c-body{filter:drop-shadow(0 0 10px rgba(231,201,127,0.6));}

/* ===== TIER 0 — M4 IRIDESCENT DARK-GLASS (hero jewel under the plasma core) ===== */
.cell.t0 .c-lead{fill:url(#leadMetal_m4);stroke:rgba(8,14,22,0.85);}
.cell.t0.moat .c-lead{fill:url(#leadGold_m4);}
.cell.t0 .c-body{filter:url(#glassLit_m4);}
.cell.t0 .c-cres{fill:none;stroke:rgba(244,250,255,0.9);stroke-width:1.4;stroke-linecap:round;filter:url(#thinFilm_m4);}
.cell.t0.moat .c-cres{stroke:rgba(255,247,224,0.92);}
.cell.t0 .c-edge{stroke-opacity:0.62;}
.cell.t0.sel .c-body{filter:url(#glassLit_m4) drop-shadow(0 0 10px rgba(90,210,255,0.5));}
.cell.t0.moat.sel .c-body{filter:url(#glassLit_m4) drop-shadow(0 0 10px rgba(231,201,127,0.55));}

/* ===== TIER 1 — M2 FROSTED GLASS (precious inner moat ring) ===== */
.cell.t1 .c-lead{fill:url(#leadGlass_m2);stroke:rgba(8,12,18,0.6);stroke-width:0.4;opacity:0.82;}
.cell.t1.moat .c-lead{fill:url(#leadGlassGold_m2);}
.cell.t1 .c-contact{fill:rgba(0,0,0,0.55);filter:url(#contactSoft_m2);}
.cell.t1 .c-ao{fill:rgba(0,0,0,0.5);filter:url(#aoTight_m2);}
.cell.t1 .c-body{filter:url(#frost_m2);}
.cell.t1 .c-pin1{stroke:#ffe2b8;stroke-width:1.2;opacity:0.7;}
.cell.t1 .c-pad{fill:rgba(8,14,22,0.55);opacity:0.85;}
.cell.t1 .led-live{filter:drop-shadow(0 0 3px var(--pos));}
.cell.t1 .led-dormant{filter:drop-shadow(0 0 3px var(--warn));}
.cell.t1 .led-phantom{filter:drop-shadow(0 0 3px var(--risk));}
.cell.t1.sel .c-body{filter:url(#frost_m2) drop-shadow(0 0 11px rgba(90,210,255,0.5));}
.cell.t1.moat.sel .c-body{filter:url(#frost_m2) drop-shadow(0 0 11px rgba(231,201,127,0.55));}

/* ===== TIER 2 — M1 PHOTOREAL BRUSHED METAL (workhorse SYSTEMS packages) ===== */
.cell.t2 .c-lead{fill:url(#leadMetal_m1);stroke:rgba(12,18,24,0.85);}
.cell.t2.moat .c-lead{fill:url(#leadGold_m1);}
.cell.t2 .c-body{filter:url(#metalLit_m1);}
.cell.t2 .c-brush{mix-blend-mode:overlay;opacity:0.5;}
.cell.t2.moat .c-brush{opacity:0.42;}
.cell.t2 .c-rim{fill:none;stroke-width:1.1;stroke-opacity:0.9;}
.cell.t2.sel .c-body{filter:url(#metalLit_m1) drop-shadow(0 0 10px rgba(90,210,255,0.55));}
.cell.t2.moat.sel .c-body{filter:url(#metalLit_m1) drop-shadow(0 0 10px rgba(231,201,127,0.6));}

/* ===== TIER 3 — M3 MATTE CERAMIC IC (boundary / governance parts) ===== */
.cell.t3 .c-lead{fill:url(#leadMetal_m3);stroke:none;}
.cell.t3.moat .c-lead{fill:url(#leadGold_m3);}
.cell.t3 .c-contact,.cell.t3 .c-contact2{fill:url(#contactGrad_m3);}
.cell.t3 .c-body{fill:url(#ceramicBody_m3);}
.cell.t3.moat .c-body{fill:url(#ceramicBodyGold_m3);}
.cell.t3 .c-name{stroke:rgba(20,18,14,0.5);stroke-width:0.6px;fill:#f2ede1;}
.cell.t3.moat .c-name{fill:#f9f1da;}
.cell.t3 .c-part{fill:rgba(70,66,58,0.85);}
.cell.t3.moat .c-part{fill:rgba(120,96,52,0.8);}
.cell.t3 .c-pin1{stroke:rgba(40,36,30,0.6);stroke-width:1.2;opacity:0.8;}
.cell.t3 .led-ring{stroke:rgba(0,0,0,0.4);}
.cell.t3.sel .c-body{filter:drop-shadow(0 0 9px rgba(90,210,255,0.5));}
.cell.t3.moat.sel .c-body{filter:drop-shadow(0 0 9px rgba(231,201,127,0.55));}

/* contact-shadow layer (M1, behind all cells) */
.csl .cs{fill:rgba(0,0,0,0.5);}
.led-live{fill:var(--pos);} .led-dormant{fill:var(--warn);} .led-phantom{fill:var(--risk);}
.led-ring{stroke:rgba(255,255,255,0.32);stroke-width:0.8;fill:none;}

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
    <span><b>${payload.meta.edgeCount}</b> copper traces</span><span class="sep">·</span>
    <span><b>${payload.meta.blockCount}</b> regions</span><span class="sep">·</span>
    <span><b>${payload.meta.counts.live}</b> live · <b>${payload.meta.counts.dormant}</b> dormant · <b>${payload.meta.counts.phantom}</b> phantom</span>
  </div>
  <p class="moatline">QFN packages wired by orthogonal copper routed through the ring-gap channels. The <span class="g">gold core</span> is the moat: the work-dynamics energy instrument, the brain-dump-decode cognition engine, and governed memory — fed inward by every commodity net.</p>
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
  <p class="lh">Copper net · status · core</p>
  <div class="lg"><span class="sw" style="background:#FFCB8E"></span>core net — power into the heart</div>
  <div class="lg"><span class="sw" style="background:#C9B0FF"></span>moat net — intra-moat signal</div>
  <div class="lg"><span class="sw" style="background:#7fe0ff"></span>feed net — commodity → moat</div>
  <div class="lg"><span class="sw" style="background:#ff9a8c"></span>rim net — governance / meta</div>
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
var CC = DATA.center || {x:CW/2,y:CH/2};
var OUTR = (DATA.meta&&DATA.meta.outerR)||1200;
var CORER = (DATA.meta&&DATA.meta.coreR)||252;
function el(t,c){var e=document.createElementNS(NS,t);if(c)e.setAttribute("class",c);return e;}
function at(e,o){for(var k in o)e.setAttribute(k,o[k]);return e;}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function PR(r,a){return [CC.x+r*Math.cos(a), CC.y+r*Math.sin(a)];}

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
function gridPat(id,size,col){var p=el("pattern");at(p,{id:id,width:size,height:size,patternUnits:"userSpaceOnUse"});
  var pa=el("path");at(pa,{d:"M"+size+" 0H0V"+size,fill:"none",stroke:col,"stroke-width":1});p.appendChild(pa);return p;}
defs.appendChild(gridPat("grid",48,"rgba(90,210,255,0.045)"));
defs.appendChild(gridPat("grid2",240,"rgba(90,210,255,0.08)"));
// neon soft-glow filter
var f=el("filter");at(f,{id:"softglow",x:"-60%",y:"-60%",width:"220%",height:"220%"});
var fb=el("feGaussianBlur");at(fb,{stdDeviation:"3.2",result:"b"});f.appendChild(fb);
var fm=el("feMerge");var m1=el("feMergeNode");at(m1,{in:"b"});var m2=el("feMergeNode");at(m2,{in:"SourceGraphic"});fm.appendChild(m1);fm.appendChild(m2);f.appendChild(fm);
defs.appendChild(f);
// lighter wire-glow so copper always reads
(function(){var wf=el("filter");at(wf,{id:"wireglow",x:"-40%",y:"-40%",width:"180%",height:"180%"});
  var wb=el("feGaussianBlur");at(wb,{stdDeviation:"1.2",result:"wb"});wf.appendChild(wb);
  var wm=el("feMerge");var w1=el("feMergeNode");at(w1,{in:"wb"});var w2=el("feMergeNode");at(w2,{in:"SourceGraphic"});wm.appendChild(w1);wm.appendChild(w2);wf.appendChild(wm);
  defs.appendChild(wf);})();
function linGrad(id,stops,horiz,coords){var g=el("linearGradient");
  at(g,coords||{x1:"0",y1:"0",x2:horiz?"1":"0",y2:horiz?"0":"1"});at(g,{id:id});
  stops.forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});if(s[2]!=null)at(st,{"stop-opacity":String(s[2])});g.appendChild(st);});return g;}
// ============================================================================
// PER-TIER MATERIAL DEFS — every lifted id is NAMESPACED with its take suffix so the
// four materials' gradients/filters never collide.
// ============================================================================

/* ===== M1 (tier 2) — brushed-metal QFN: per-layer integrated-tint bodies + lit-metal ===== */
// per-layer integrated-tint metal body gradients (built in Node, no flat wash)
(DATA.layerGrads||[]).forEach(function(lg){
  var stops=lg.stops.map(function(s){return [s[0],s[1]];});
  defs.appendChild(linGrad("body"+lg.key,stops));
});
defs.appendChild(linGrad("pkgBodyGold_m1",[["0%","#ffe9b0"],["8%","#e6b85e"],["24%","#c89234"],["46%","#9c6e22"],["68%","#6f4d16"],["88%","#4f3710"],["100%","#74521b"]]));
defs.appendChild(linGrad("leadMetal_m1",[["0%","#cfdce8"],["48%","#8b9aa8"],["100%","#5a6773"]],true));
defs.appendChild(linGrad("leadGold_m1",[["0%","#f2d79a"],["48%","#c39a52"],["100%","#86642f"]],true));
// metalLit — tinted gradient body carries form + hue; this only adds a tight specular catch (screened).
(function(){var mf=el("filter");at(mf,{id:"metalLit_m1",x:"-30%",y:"-30%",width:"160%",height:"160%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"1.6",result:"nrm"});mf.appendChild(b);
  var sl=el("feSpecularLighting");at(sl,{in:"nrm",surfaceScale:"3.4",specularConstant:"0.62",specularExponent:"34","lighting-color":"#f3f7fc",result:"spec"});
  var sld=el("feDistantLight");at(sld,{azimuth:"235",elevation:"58"});sl.appendChild(sld);mf.appendChild(sl);
  var ct=el("feComponentTransfer");at(ct,{in:"spec",result:"spt"});var fa=el("feFuncA");at(fa,{type:"gamma",amplitude:"0.85",exponent:"1.3",offset:"0"});ct.appendChild(fa);mf.appendChild(ct);
  var sc=el("feComposite");at(sc,{in:"spt",in2:"SourceAlpha",operator:"in",result:"specc"});mf.appendChild(sc);
  var fin=el("feBlend");at(fin,{in:"SourceGraphic",in2:"specc",mode:"screen"});mf.appendChild(fin);
  defs.appendChild(mf);})();
// contact-shadow blur (applied to the shared shadow LAYER once — cheap + robust at high DPR)
(function(){var cf=el("filter");at(cf,{id:"csBlur_m1",x:"-20%",y:"-20%",width:"140%",height:"140%"});
  var cb=el("feGaussianBlur");at(cb,{stdDeviation:"4"});cf.appendChild(cb);defs.appendChild(cf);})();
// brushed-metal anisotropic striation — deterministic fine hairlines, tiled
(function(){var p=el("pattern");at(p,{id:"brushGrain_m1",width:"14",height:"3",patternUnits:"userSpaceOnUse"});
  p.appendChild(at(el("rect"),{x:0,y:0,width:14,height:0.6,fill:"#ffffff","fill-opacity":0.34}));
  p.appendChild(at(el("rect"),{x:0,y:1.5,width:14,height:0.6,fill:"#000000","fill-opacity":0.34}));
  defs.appendChild(p);})();
// specular ARC catch (the glass/metal catch-light) — neutral + gold variants
(function(){var sg=el("radialGradient");at(sg,{id:"specArc_m1",cx:"33%",cy:"18%",r:"66%"});
  [["0%","#ffffff",0.58],["24%","#eef5ff",0.28],["50%","#d6e6f6",0.08],["76%","#cfe0f2",0.01],["100%","#cfe0f2",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});sg.appendChild(st);});
  defs.appendChild(sg);})();
(function(){var sg=el("radialGradient");at(sg,{id:"specArcGold_m1",cx:"33%",cy:"18%",r:"66%"});
  [["0%","#fff8e8",0.60],["24%","#ffedcc",0.30],["50%","#f4d9a2",0.09],["76%","#eccf95",0.01],["100%","#eccf95",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});sg.appendChild(st);});
  defs.appendChild(sg);})();

/* ===== M2 (tier 1) — frosted glass: frost filter + contact/AO/inner + leads + arcs ===== */
(function(){var ff=el("filter");at(ff,{id:"frost_m2",x:"-25%",y:"-25%",width:"150%",height:"150%","color-interpolation-filters":"sRGB"});
  var tn=el("feTurbulence");at(tn,{type:"fractalNoise",baseFrequency:"0.85 0.85",numOctaves:"2",seed:"7",stitchTiles:"stitch",result:"grain"});ff.appendChild(tn);
  var gct=el("feColorMatrix");at(gct,{in:"grain",type:"matrix",values:"0 0 0 0 0.55  0 0 0 0 0.62  0 0 0 0 0.72  0 0 0 0.09 0",result:"grainC"});ff.appendChild(gct);
  var gc=el("feComposite");at(gc,{in:"grainC",in2:"SourceAlpha",operator:"in",result:"grainIn"});ff.appendChild(gc);
  var fa=el("feGaussianBlur");at(fa,{in:"SourceAlpha",stdDeviation:"1.1",result:"surf"});ff.appendChild(fa);
  var sl=el("feSpecularLighting");at(sl,{in:"surf",surfaceScale:"2.0",specularConstant:"0.42",specularExponent:"42","lighting-color":"#e6f1ff",result:"spec"});
  var dl=el("feDistantLight");at(dl,{azimuth:"215",elevation:"62"});sl.appendChild(dl);ff.appendChild(sl);
  var ct=el("feComponentTransfer");at(ct,{in:"spec",result:"specc"});var fA=el("feFuncA");at(fA,{type:"linear",slope:"0.6",intercept:"0"});ct.appendChild(fA);ff.appendChild(ct);
  var sc=el("feComposite");at(sc,{in:"specc",in2:"SourceAlpha",operator:"in",result:"specIn"});ff.appendChild(sc);
  var me=el("feMerge");[["SourceGraphic"],["grainIn"],["specIn"]].forEach(function(x){var nn=el("feMergeNode");at(nn,{in:x[0]});me.appendChild(nn);});ff.appendChild(me);
  defs.appendChild(ff);})();
(function(){var cf=el("filter");at(cf,{id:"contactSoft_m2",x:"-60%",y:"-40%",width:"220%",height:"200%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"6",result:"b"});cf.appendChild(b);
  var ct=el("feComponentTransfer");at(ct,{in:"b",result:"bb"});var fa=el("feFuncA");at(fa,{type:"linear",slope:"0.9",intercept:"0"});ct.appendChild(fa);cf.appendChild(ct);
  defs.appendChild(cf);})();
(function(){var af=el("filter");at(af,{id:"aoTight_m2",x:"-40%",y:"-30%",width:"180%",height:"170%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"2.4"});af.appendChild(b);defs.appendChild(af);})();
(function(){var isf=el("filter");at(isf,{id:"innerShadow_m2",x:"-30%",y:"-30%",width:"160%",height:"160%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"3",result:"b"});isf.appendChild(b);
  var off=el("feOffset");at(off,{in:"b",dx:"0",dy:"1.5",result:"o"});isf.appendChild(off);
  var comp=el("feComposite");at(comp,{in:"SourceGraphic",in2:"o",operator:"out",result:"inv"});isf.appendChild(comp);
  var cm=el("feColorMatrix");at(cm,{in:"inv",type:"matrix",values:"0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0"});isf.appendChild(cm);
  defs.appendChild(isf);})();
defs.appendChild(linGrad("leadGlass_m2",[["0%","#aebfcf"],["48%","#6c7d8c"],["100%","#3e4a56"]],true));
defs.appendChild(linGrad("leadGlassGold_m2",[["0%","#d8be88"],["48%","#9c7e44"],["100%","#5e4824"]],true));
defs.appendChild(linGrad("specArc_m2",[["0%","rgba(255,255,255,0.85)"],["40%","rgba(232,243,255,0.32)"],["100%","rgba(255,255,255,0)"]]));
defs.appendChild(linGrad("specArcGold_m2",[["0%","rgba(255,248,228,0.85)"],["40%","rgba(255,236,196,0.32)"],["100%","rgba(255,255,255,0)"]]));
defs.appendChild(linGrad("refrStreak_m2",[["0%","rgba(255,255,255,0)"],["44%","rgba(220,238,255,0)"],["50%","rgba(232,243,255,0.5)"],["56%","rgba(220,238,255,0)"],["100%","rgba(255,255,255,0)"]],true));
defs.appendChild(linGrad("glassBack_m2",[["0%","rgba(18,26,36,0.42)"],["55%","rgba(10,16,24,0.62)"],["100%","rgba(5,9,15,0.74)"]]));
defs.appendChild(linGrad("glassBackGold_m2",[["0%","rgba(40,32,16,0.44)"],["55%","rgba(24,18,9,0.64)"],["100%","rgba(12,9,4,0.76)"]]));

/* ===== M3 (tier 3) — matte ceramic IC: filter-free gradients + gold pins + cavity ===== */
defs.appendChild(linGrad("ceramicBody_m3",[["0%","#c2c8c6"],["12%","#9aa1a0"],["34%","#6f7674"],["56%","#4d5453"],["76%","#363b3b"],["90%","#252a2a"],["100%","#1a1e1e"]]));
defs.appendChild(linGrad("ceramicBodyGold_m3",[["0%","#d4c69e"],["12%","#b1a173"],["34%","#857449"],["56%","#5f5234"],["76%","#433a25"],["90%","#2f2819"],["100%","#221d12"]]));
defs.appendChild(linGrad("leadMetal_m3",[["0%","#e7c98a"],["40%","#c79e54"],["72%","#9a7536"],["100%","#6f5224"]],true));
defs.appendChild(linGrad("leadGold_m3",[["0%","#f6dd9c"],["42%","#d4a85a"],["74%","#9c7331"],["100%","#6b4d20"]],true));
(function(){var dg=el("linearGradient");at(dg,{id:"dieMetal_m3",x1:"0",y1:"0",x2:"1",y2:"1"});
  [["0%","#3b4a5c"],["38%","#2a3644"],["62%","#1f2935"],["100%","#141b25"]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});dg.appendChild(st);});defs.appendChild(dg);})();
(function(){var cf=el("radialGradient");at(cf,{id:"cavityFloor_m3",cx:"42%",cy:"36%",r:"75%"});
  [["0%","#5b6068"],["44%","#3c424a"],["100%","#23282f"]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});cf.appendChild(st);});defs.appendChild(cf);})();
(function(){var ao=el("radialGradient");at(ao,{id:"aoEdge_m3",cx:"50%",cy:"46%",r:"62%"});
  [["0%","#000",0],["66%","#000",0],["88%","#000",0.18],["100%","#000",0.40]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});ao.appendChild(st);});defs.appendChild(ao);})();
(function(){var lt=el("linearGradient");at(lt,{id:"ceramTop_m3",x1:"0",y1:"0",x2:"0",y2:"1"});
  [["0%","#ffffff",0.16],["22%","#ffffff",0.03],["45%","#ffffff",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});lt.appendChild(st);});defs.appendChild(lt);})();
(function(){var bs=el("linearGradient");at(bs,{id:"ceramBot_m3",x1:"0",y1:"0",x2:"0",y2:"1"});
  [["0%","#000",0],["52%","#000",0],["80%","#000",0.16],["100%","#000",0.42]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});bs.appendChild(st);});defs.appendChild(bs);})();
(function(){var cg2=el("radialGradient");at(cg2,{id:"contactGrad_m3",cx:"50%",cy:"50%",r:"50%"});
  [["0%","#000",0.6],["50%","#000",0.42],["78%","#000",0.16],["100%","#000",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});cg2.appendChild(st);});defs.appendChild(cg2);})();
defs.appendChild(linGrad("dieGlint_m3",[["0%","rgba(210,228,255,0.55)"],["30%","rgba(210,228,255,0.12)"],["55%","rgba(255,255,255,0)"]]));

/* ===== M4 (tier 0) — dark glass + iridescent thin-film: glassLit/inner/AO/thinFilm ===== */
defs.appendChild(linGrad("leadMetal_m4",[["0%","#f4f9ff"],["20%","#cdd9e6"],["52%","#8b9aa8"],["80%","#5f6c79"],["100%","#3c4651"]],true));
defs.appendChild(linGrad("leadGold_m4",[["0%","#fff0c8"],["22%","#e6c477"],["52%","#bd9347"],["80%","#7f5e2c"],["100%","#4f3a1a"]],true));
(function(){var mf=el("filter");at(mf,{id:"glassLit_m4",x:"-25%",y:"-25%",width:"150%",height:"150%"});
  var b=el("feGaussianBlur");at(b,{in:"SourceAlpha",stdDeviation:"1.1",result:"gb"});mf.appendChild(b);
  var sl=el("feSpecularLighting");at(sl,{in:"gb",surfaceScale:"1.6",specularConstant:"0.92",specularExponent:"58","lighting-color":"#eef6ff",result:"sl"});
  var dl=el("feDistantLight");at(dl,{azimuth:"248",elevation:"66"});sl.appendChild(dl);mf.appendChild(sl);
  var ct=el("feComponentTransfer");at(ct,{in:"sl",result:"slc"});var fa=el("feFuncA");at(fa,{type:"gamma",amplitude:"1",exponent:"1.7",offset:"0"});ct.appendChild(fa);mf.appendChild(ct);
  var sc=el("feComposite");at(sc,{in:"slc",in2:"SourceAlpha",operator:"in",result:"sc"});mf.appendChild(sc);
  var me=el("feMerge");var n1=el("feMergeNode");at(n1,{in:"SourceGraphic"});var n2=el("feMergeNode");at(n2,{in:"sc"});me.appendChild(n1);me.appendChild(n2);mf.appendChild(me);
  defs.appendChild(mf);})();
(function(){var f=el("filter");at(f,{id:"glassInner_m4",x:"-30%",y:"-30%",width:"160%",height:"160%"});
  var off=el("feOffset");at(off,{in:"SourceAlpha",dx:"0",dy:"2.4",result:"o"});f.appendChild(off);
  var b=el("feGaussianBlur");at(b,{in:"o",stdDeviation:"3.4",result:"ob"});f.appendChild(b);
  var inv=el("feComposite");at(inv,{in:"SourceAlpha",in2:"ob",operator:"out",result:"inner"});f.appendChild(inv);
  var cf=el("feColorMatrix");at(cf,{in:"inner",type:"matrix",values:"0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.62 0",result:"sh"});f.appendChild(cf);
  var me=el("feMerge");var a=el("feMergeNode");at(a,{in:"SourceGraphic"});var c=el("feMergeNode");at(c,{in:"sh"});me.appendChild(a);me.appendChild(c);f.appendChild(me);
  defs.appendChild(f);})();
(function(){var f=el("filter");at(f,{id:"cellAO_m4",x:"-45%",y:"-45%",width:"190%",height:"200%"});
  var b1=el("feGaussianBlur");at(b1,{in:"SourceAlpha",stdDeviation:"5.5",result:"ao"});f.appendChild(b1);
  var o1=el("feOffset");at(o1,{in:"ao",dx:"0",dy:"9",result:"aoO"});f.appendChild(o1);
  var t1=el("feComponentTransfer");at(t1,{in:"aoO",result:"aoT"});var fa1=el("feFuncA");at(fa1,{type:"linear",slope:"0.78",intercept:"0"});t1.appendChild(fa1);f.appendChild(t1);
  var b2=el("feGaussianBlur");at(b2,{in:"SourceAlpha",stdDeviation:"1.8",result:"ct"});f.appendChild(b2);
  var o2=el("feOffset");at(o2,{in:"ct",dx:"0",dy:"3",result:"ctO"});f.appendChild(o2);
  var t2=el("feComponentTransfer");at(t2,{in:"ctO",result:"ctT"});var fa2=el("feFuncA");at(fa2,{type:"linear",slope:"0.95",intercept:"0"});t2.appendChild(fa2);f.appendChild(t2);
  var me=el("feMerge");[["aoT"],["ctT"],["SourceGraphic"]].forEach(function(s){var n=el("feMergeNode");at(n,{in:s[0]});me.appendChild(n);});f.appendChild(me);defs.appendChild(f);})();
(function(){var f=el("filter");at(f,{id:"thinFilm_m4",x:"-30%",y:"-30%",width:"160%",height:"160%"});
  var b=el("feGaussianBlur");at(b,{stdDeviation:"1.0"});f.appendChild(b);defs.appendChild(f);})();
// ============================================================================
// moat backlight + EUV plasma core
var rg=el("radialGradient");at(rg,{id:"moatGlow",cx:"50%",cy:"50%",r:"50%"});
[["0%","#C9A14A"],["50%","#8A6A28"],["100%","#8A6A28"]].forEach(function(s,i){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":[0.26,0.08,0][i]});rg.appendChild(st);});
defs.appendChild(rg);
var bg=el("filter");at(bg,{id:"bigglow",x:"-80%",y:"-80%",width:"260%",height:"260%"});var bgb=el("feGaussianBlur");at(bgb,{stdDeviation:"16"});bg.appendChild(bgb);defs.appendChild(bg);
// near-uniform dark base — flat so there is NO bright "die zone" vs dark surround (one field)
(function(){var sg=el("radialGradient");at(sg,{id:"silicon",cx:"50%",cy:"46%",r:"75%"});
  [["0%","#0a0d12"],["50%","#080a0f"],["80%","#06080c"],["100%","#040609"]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});sg.appendChild(st);});
  defs.appendChild(sg);})();
defs.appendChild(linGrad("sheen",[["0%","rgba(150,192,238,0.055)"],["42%","rgba(150,192,238,0)"],["72%","rgba(140,105,52,0)"],["100%","rgba(180,140,70,0.05)"]],true));
defs.appendChild(linGrad("irid",[["0%","rgba(90,210,255,0.06)"],["26%","rgba(155,123,255,0.06)"],["50%","rgba(255,120,210,0.045)"],["72%","rgba(120,200,255,0.06)"],["100%","rgba(190,150,90,0.045)"]],true));
defs.appendChild(linGrad("streak",[["0%","rgba(255,255,255,0)"],["36%","rgba(232,243,255,0.12)"],["44%","rgba(232,243,255,0.2)"],["52%","rgba(255,255,255,0)"]]));
(function(){var eg=el("radialGradient");at(eg,{id:"euv",cx:"50%",cy:"50%",r:"50%"});
  [["0%","#bcc6ff",0.62],["42%","#7d78ff",0.22],["100%","#5a4fd0",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});eg.appendChild(st);});
  defs.appendChild(eg);})();
(function(){var hg=el("radialGradient");at(hg,{id:"coreHalo",cx:"50%",cy:"50%",r:"50%"});
  [["0%","#c3a967",0.4],["55%","#8f7a44",0.15],["100%","#52431f",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});hg.appendChild(st);});
  defs.appendChild(hg);})();
(function(){var fg=el("radialGradient");at(fg,{id:"coreFace",cx:"50%",cy:"42%",r:"62%"});
  [["0%","#12161c",0.22],["55%","#0b0e13",0.4],["86%","#080b0f",0.26],["100%","#070a0e",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});fg.appendChild(st);});
  defs.appendChild(fg);})();
svg.appendChild(defs);

// substrate — MINIMAL. The rich background is the fixed AURORA on #stage (CSS). The SVG
// board is left transparent so that one aurora field reads behind the die AND the surround
// (never separate); only a soft radial "pocket" deepens the centre so the core/cells pop.
// No noise, no PCB clutter. Extended bounds so a pan never reveals an edge.
var EXT=CW, X0=-EXT, Y0=-EXT, WW=CW+2*EXT, HH=CH+2*EXT;
(function(){
  var pg=el("radialGradient");at(pg,{id:"diePocket",gradientUnits:"userSpaceOnUse",cx:String(CC.x),cy:String(Math.round(CC.y)),r:String(Math.round(CW*0.6))});
  [["0%","#03050a",0.6],["58%","#03050a",0.34],["100%","#03050a",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});pg.appendChild(st);});
  defs.appendChild(pg);
  svg.appendChild(at(el("rect"),{x:X0,y:Y0,width:WW,height:HH,fill:"url(#diePocket)","pointer-events":"none"}));
})();

var BANDS = DATA.bands || [];
function annulusPath(rIn,rOut){
  return "M "+(CC.x-rOut)+" "+CC.y+" a "+rOut+" "+rOut+" 0 1 0 "+(2*rOut)+" 0 a "+rOut+" "+rOut+" 0 1 0 "+(-2*rOut)+" 0 Z "+
         "M "+(CC.x-rIn)+" "+CC.y+" a "+rIn+" "+rIn+" 0 1 1 "+(2*rIn)+" 0 a "+rIn+" "+rIn+" 0 1 1 "+(-2*rIn)+" 0 Z";
}
function wedgeArc(rIn,rOut,a0,a1){
  var p0i=PR(rIn,a0),p1i=PR(rOut,a0),p1o=PR(rOut,a1),p0o=PR(rIn,a1);
  var large=Math.abs(a1-a0)>Math.PI?1:0;
  return "M "+p0i[0].toFixed(1)+" "+p0i[1].toFixed(1)+
         " L "+p1i[0].toFixed(1)+" "+p1i[1].toFixed(1)+
         " A "+rOut+" "+rOut+" 0 "+large+" 1 "+p1o[0].toFixed(1)+" "+p1o[1].toFixed(1)+
         " L "+p0o[0].toFixed(1)+" "+p0o[1].toFixed(1)+
         " A "+rIn+" "+rIn+" 0 "+large+" 0 "+p0i[0].toFixed(1)+" "+p0i[1].toFixed(1)+" Z";
}

// faint concentric power rails + radial scaffolding spokes
var rail = el("g","rails");
for(var rr=CORER+30; rr<OUTR+60; rr+=58){ rail.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:rr,class:"prail "+((Math.round(rr)%116<58)?"v":"h")})); }
for(var sa=0; sa<360; sa+=30){var ra=sa*Math.PI/180;var pA=PR(CORER+20,ra),pB=PR(OUTR+50,ra);rail.appendChild(at(el("line"),{x1:pA[0],y1:pA[1],x2:pB[0],y2:pB[1],class:"prail v"}));}
svg.appendChild(rail);

// channel beds — faint copper lanes riding each ring-gap channel (where traces route)
(function(){var cg=el("g","chanbeds");(DATA.channels||[]).forEach(function(ch){
  for(var k=-3;k<=3;k++) cg.appendChild(at(el("circle","chanbed"),{cx:CC.x,cy:CC.y,r:(ch.rMid+k*7).toFixed(1)}));
});svg.appendChild(cg);})();

// band annulus tints (distinct designed bands, real gaps)
var bandLayer = el("g","bandtints");
BANDS.forEach(function(b){
  if(b.core) return;
  // faint integrated tint (not a flat highlighter wash) + ENGRAVED band boundaries
  bandLayer.appendChild(at(el("path","band-tint"),{d:annulusPath(b.rIn,b.rOut),"fill-rule":"evenodd",fill:b.accent,opacity:"0.018"}));
  [b.rIn,b.rOut].forEach(function(rr){
    bandLayer.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:rr,fill:"none",stroke:"rgba(0,0,0,0.5)","stroke-width":"2.4"}));       // groove (shadow)
    bandLayer.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:rr+1.4,fill:"none",stroke:"rgba(160,196,232,0.14)","stroke-width":"1"})); // light highlight (raised lip)
    bandLayer.appendChild(at(el("circle","band-edge"),{cx:CC.x,cy:CC.y,r:rr,stroke:b.accent}));                                       // faint accent trace
  });
});
svg.appendChild(bandLayer);

// moat backlight + EUV plasma core
(function(){var cr=CORER;
  svg.appendChild(at(el("ellipse","moat-back"),{cx:CC.x,cy:CC.y,rx:cr+200,ry:cr+200,fill:"url(#moatGlow)",filter:"url(#bigglow)"}));
  svg.appendChild(at(el("ellipse","moat-back"),{cx:CC.x,cy:CC.y,rx:cr*1.05,ry:cr*1.05,fill:"url(#euv)",filter:"url(#bigglow)"}));
  svg.appendChild(at(el("ellipse","moat-back"),{cx:CC.x,cy:CC.y,rx:cr*0.42,ry:cr*0.42,fill:"url(#euv)"}));
})();

// CORE DISC
(function(){
  var disc=el("g","coredisc");
  disc.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:CORER+8,class:"core-halo"}));
  disc.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:CORER,class:"core-face"}));
  disc.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:CORER,class:"core-rim"}));
  disc.appendChild(at(el("circle"),{cx:CC.x,cy:CC.y,r:CORER-9,class:"core-rim2"}));
  for(var ta=0;ta<360;ta+=15){var raa=ta*Math.PI/180;var t0=PR(CORER-5,raa),t1=PR(CORER+5,raa);disc.appendChild(at(el("line","core-tick"),{x1:t0[0],y1:t0[1],x2:t1[0],y2:t1[1]}));}
  svg.appendChild(disc);
})();

// die-seal guard rings + corner fiducials + bond-pad ring
svg.appendChild(at(el("circle","seal"),{cx:CC.x,cy:CC.y,r:OUTR+118}));
svg.appendChild(at(el("circle","seal2"),{cx:CC.x,cy:CC.y,r:OUTR+130}));
var ring = el("g","padring");
DATA.pads.forEach(function(p){
  var rot=(p.a*180/Math.PI+90).toFixed(1);
  ring.appendChild(at(el("rect"),{x:p.x-2,y:p.y-5,width:4,height:10,rx:1,transform:"rotate("+rot+" "+p.x+" "+p.y+")",class:"pad"+((p.i%3===0)?"":" cyan")}));
});
svg.appendChild(ring);
[[60,60],[CW-60,60],[60,CH-60],[CW-60,CH-60]].forEach(function(c){
  var g=el("g","fiducial");
  g.appendChild(at(el("circle"),{cx:c[0],cy:c[1],r:9}));
  g.appendChild(at(el("line"),{x1:c[0]-14,y1:c[1],x2:c[0]+14,y2:c[1]}));
  g.appendChild(at(el("line"),{x1:c[0],y1:c[1]-14,x2:c[0],y2:c[1]+14}));
  svg.appendChild(g);
});

/* ---------- layer wedges + curved arc labels ---------- */
var blockLayer = el("g","blocks");
DATA.blocks.forEach(function(b,bi){
  if(b.core){
    var ct=at(el("text"),{x:CC.x,y:CC.y-CORER+22,class:"region-name core","text-anchor":"middle"});
    ct.textContent="◆ ENERGY GATE CORE · "+b.count;blockLayer.appendChild(ct);
    return;
  }
  var g = el("g","blk region"+(b.moat?" moat":"")+(b.perimeter?" perim":""));
  g.appendChild(at(el("path","wedge-tint"),{d:wedgeArc(b.rIn+5,b.rOut-5,b.a0,b.a1),fill:b.accent,opacity:b.moat?"0.12":"0.075"}));
  g.appendChild(at(el("path"),{d:wedgeArc(b.rIn+5,b.rOut-5,b.a0,b.a1),fill:"none",stroke:b.accent,"stroke-opacity":b.moat?"0.5":"0.34","stroke-width":"1.3"}));
  // curved arc label riding just outside the band
  var lr=b.labelR;
  var aMid=b.aMid; var flip = (aMid>Math.PI/2||aMid<-Math.PI/2);
  var aa0=flip?b.a1:b.a0, aa1=flip?b.a0:b.a1;
  var pp0=PR(lr,aa0),pp1=PR(lr,aa1);
  var large=Math.abs(b.a1-b.a0)>Math.PI?1:0; var sweep=flip?0:1;
  var pid="arc"+bi;
  defs.appendChild(at(el("path"),{id:pid,d:"M "+pp0[0].toFixed(1)+" "+pp0[1].toFixed(1)+" A "+lr+" "+lr+" 0 "+large+" "+sweep+" "+pp1[0].toFixed(1)+" "+pp1[1].toFixed(1),fill:"none"}));
  var tx=at(el("text","arc-name"+(b.perimeter?" perim":"")+(b.moat?" moat":"")),{});
  tx.setAttribute("fill",b.accent);
  var tp=document.createElementNS(NS,"textPath");tp.setAttribute("href","#"+pid);tp.setAttribute("startOffset","50%");tp.setAttribute("text-anchor","middle");
  tp.textContent=b.short+"  ·  "+b.count;tx.appendChild(tp);g.appendChild(tx);
  blockLayer.appendChild(g);
});
svg.appendChild(blockLayer);

/* ---------- PCB copper traces (bed + bright centreline) + vias ---------- */
var traceLayer = el("g","traces"); var bedEls=[]; var copperEls=[]; var flowEls=[]; var viaEls=[];
// beds first (under), then bright centrelines (over) so copper reads layered.
DATA.routes.forEach(function(e){
  var bed=at(el("path","trace bed "+e.cls),{d:e.path}); bed.dataset.from=e.from; bed.dataset.to=e.to; traceLayer.appendChild(bed); bedEls.push(bed);
});
DATA.routes.forEach(function(e){
  var cu=at(el("path","trace copper "+e.cls),{d:e.path}); cu.dataset.from=e.from; cu.dataset.to=e.to; traceLayer.appendChild(cu); copperEls.push(cu);
  var fl=at(el("path","flow"),{d:e.path}); fl.dataset.from=e.from; fl.dataset.to=e.to; traceLayer.appendChild(fl); flowEls.push(fl);
});
// vias at bends + endpoints (plated copper rings)
DATA.routes.forEach(function(e){
  var a=byId.get(e.from), b=byId.get(e.to);
  [[a.cx,a.cy],[b.cx,b.cy]].forEach(function(pt){
    var v=at(el("circle","via "+e.cls),{cx:pt[0],cy:pt[1],r:4});v.dataset.from=e.from;v.dataset.to=e.to;traceLayer.appendChild(v);viaEls.push(v);});
  (e.vias||[]).forEach(function(pt){
    var v=at(el("circle","via "+e.cls),{cx:pt[0],cy:pt[1],r:3.4});v.dataset.from=e.from;v.dataset.to=e.to;traceLayer.appendChild(v);viaEls.push(v);});
});
svg.appendChild(traceLayer);

/* ---------- M1 SHARED contact-shadow layer (depth onto the board, behind all cells) ----
   one soft blurred shadow per package in WORLD space (un-rotated -> stays grounded).
   bigger / higher-degree cells sit "closer" -> larger, darker, more offset shadow. This
   is the shared depth foundation every tier rides on. */
var shadowLayer = el("g","csl"); shadowLayer.setAttribute("filter","url(#csBlur_m1)");
DATA.nodes.forEach(function(n){
  var W=n.w,H=n.h,R=6;
  var lift=Math.min(1,(n.sizeScale||1)/1.55);            // 0..1 by size hierarchy
  var off=2.5+lift*7;                                     // bigger -> casts farther
  var grow=2+lift*3;                                      // skirt spread
  shadowLayer.appendChild(at(el("rect","cs"),{x:n.cx-W/2-grow,y:n.cy-H/2-grow+off,width:W+2*grow,height:H+2*grow,rx:R+grow,
    "fill-opacity":(0.34+lift*0.26).toFixed(2)}));
});
svg.appendChild(shadowLayer);

/* ---------- PER-TIER MATERIAL-MIX chip-package cells ----------
   The body/face/edge is dispatched by n.tier; leads + AO/inner depth + pin-1 + LED + pad +
   part-number + name + facing-rotation + label-flip are shared on every cell. */
var cellLayer = el("g","cells"); var cellEls=new Map();
DATA.nodes.forEach(function(n,i){
  // face the core: rotate the package around its own centre by its polar angle
  var _faceDeg=((n.ang||0)*180/Math.PI);
  var _udn=((_faceDeg%360)+360)%360, _flip=(_udn>90&&_udn<270); // left half -> text upside down
  var tier=n.tier||0;
  var g = el("g","cell t"+tier+(n.moat?" moat":"")); at(g,{"data-status":n.status,transform:"translate("+n.x+","+n.y+") rotate("+_faceDeg.toFixed(1)+" "+(n.w/2)+" "+(n.h/2)+")"}); g.dataset.id=n.id;
  g.style.animationDelay=((i%12)*24+Math.floor(i/12)*38)+"ms";
  var M=n.mat||{};
  // R varies by material (ceramic + moulded glass use rounder corners)
  var R = tier===3 ? Math.max(4,Math.round(n.w*0.055)) : (tier===0 ? Math.max(6,Math.round(n.w*0.085)) : 5);
  var W=n.w, H=n.h;
  // deterministic per-cell pseudo-noise (tone jitter / catch-light offsets) — fixed FNV, no RNG.
  var _h=2166136261;for(var _i=0;_i<n.id.length;_i++){_h^=n.id.charCodeAt(_i);_h=Math.imul(_h,16777619);}
  var _u=(_h>>>0), _tn=((_u%1000)/1000-0.5);
  var safe=n.id.replace(/[^a-zA-Z0-9_-]/g,"_");
  // pin count + lead geometry scale with size (QFN density). ceramic uses slightly chunkier pins.
  var pins=Math.max(4,Math.min(8,Math.round(W/15)));
  var leadLen=tier===3?Math.max(7,Math.round(W*0.085)):Math.max(7,Math.round(W*0.08));
  var leadW=tier===3?Math.max(2.6,W/(pins*2.7)):Math.max(2.4,W/(pins*3.0));

  // ---- per-tier CONTACT/AO drawn BEFORE leads (grounds the package on the board) ----
  if(tier===1){ // M2 frosted: soft contact pool + tight AO ring
    g.appendChild(at(el("rect","c-contact"),{x:R*0.6,y:R+3,width:W,height:H,rx:R}));
    g.appendChild(at(el("rect","c-ao"),{x:1,y:2,width:W,height:H,rx:R,fill:"rgba(0,0,0,0.5)"}));
  } else if(tier===3){ // M3 ceramic: radial-gradient contact ellipses (filter-free, SW-raster safe)
    g.appendChild(at(el("ellipse","c-contact2"),{cx:W/2+9,cy:H/2+15,rx:W*0.82,ry:H*0.70}));
    g.appendChild(at(el("ellipse","c-contact"),{cx:W/2+5,cy:H/2+9,rx:W*0.62,ry:H*0.54}));
  } else if(tier===0){ // M4 dark-glass: layered AO + contact under the package
    g.appendChild(at(el("rect","c-ao"),{x:0,y:0,width:W,height:H,rx:R,fill:"#000",opacity:"0.9",filter:"url(#cellAO_m4)"}));
  }

  // ---- gull-wing leads on all four sides (shared geometry; fill comes from tier CSS) ----
  var leads=el("g","c-leadg");
  for(var s=0;s<pins;s++){
    var fx=(s+1)/(pins+1);
    var ly=Math.round(H*fx-leadW/2);
    leads.appendChild(at(el("rect","c-lead"),{x:-leadLen,y:ly,width:leadLen+2,height:leadW,rx:1}));
    leads.appendChild(at(el("rect","c-lead"),{x:W-2,y:ly,width:leadLen+2,height:leadW,rx:1}));
    var lx=Math.round(W*fx-leadW/2);
    leads.appendChild(at(el("rect","c-lead"),{x:lx,y:-leadLen,width:leadW,height:leadLen+2,rx:1}));
    leads.appendChild(at(el("rect","c-lead"),{x:lx,y:H-2,width:leadW,height:leadLen+2,rx:1}));
  }
  g.appendChild(leads);

  // ====================================================================
  // PER-TIER BODY / FACE / EDGE
  // ====================================================================
  if(tier===0){
    // ===== TIER 0 — M4 IRIDESCENT DARK-GLASS (hero jewel under the plasma core) =====
    var gid="m4g"+i, fid="m4f"+i, skid="m4s"+i, hsid="m4h"+i, clip0="m4c"+i;
    var bg0=el("radialGradient");at(bg0,{id:gid,cx:"38%",cy:"24%",r:"96%"});
    [["0%",M.g0||"#26323f"],["32%",M.g1||"#161f29"],["66%",M.g2||"#0c141c"],["100%",M.g3||"#05090e"]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1]});bg0.appendChild(st);});defs.appendChild(bg0);
    var fg2=el("linearGradient");at(fg2,{id:fid,x1:"0",y1:"0",x2:"1",y2:"1"});
    [["0%",M.irA||"#5ad2ff",0.0],["16%",M.irA||"#5ad2ff",0.9],["50%",M.irB||"#9b7bff",0.95],["84%",M.irC||"#ffb86e",0.9],["100%",M.irC||"#ffb86e",0.0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});fg2.appendChild(st);});defs.appendChild(fg2);
    // body — deep tinted glass radial, lit (specular catch)
    var body0=at(el("rect","c-body"),{x:0,y:0,width:W,height:H,rx:R});body0.style.fill="url(#"+gid+")";body0.setAttribute("fill","url(#"+gid+")");g.appendChild(body0);
    // inner-shadow pass (recessed glass depth)
    g.appendChild(at(el("rect","c-inner"),{x:0,y:0,width:W,height:H,rx:R,fill:"none",stroke:M.ao||"#04070d","stroke-width":"0.01",filter:"url(#glassInner_m4)"}));
    // thin-film iridescent EDGE sheen — the layer colour lives HERE (two concentric strokes)
    g.appendChild(at(el("rect","c-irid"),{x:1.6,y:1.6,width:W-3.2,height:H-3.2,rx:Math.max(4,R-1),fill:"none",stroke:"url(#"+fid+")","stroke-width":Math.max(3.0,W*0.05).toFixed(2),"stroke-opacity":"0.7",filter:"url(#thinFilm_m4)"}));
    g.appendChild(at(el("rect","c-irid2"),{x:3.2,y:3.2,width:W-6.4,height:H-6.4,rx:Math.max(3,R-2),fill:"none",stroke:"url(#"+fid+")","stroke-width":Math.max(1.3,W*0.02).toFixed(2)}));
    // glass reflections, clipped to the body
    var spc=el("clipPath");at(spc,{id:clip0});spc.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R}));defs.appendChild(spc);
    var skg=el("linearGradient");at(skg,{id:skid,x1:"0",y1:"0",x2:"0",y2:"1"});
    [["0%","#eaf4ff",n.moat?0.34:0.30],["26%","#cfe4ff",n.moat?0.16:0.13],["55%","#cfe4ff",0.0],["100%","#cfe4ff",0.0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});skg.appendChild(st);});defs.appendChild(skg);
    var hsg=el("radialGradient");at(hsg,{id:hsid,cx:"50%",cy:"50%",r:"50%"});
    [["0%","#ffffff",1],["22%","#ffffff",0.85],["52%","#eaf4ff",0.20],["100%","#eaf4ff",0.0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});hsg.appendChild(st);});defs.appendChild(hsg);
    var catchG=el("g");at(catchG,{"clip-path":"url(#"+clip0+")","pointer-events":"none"});
    catchG.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,fill:"url(#"+skid+")"}));
    catchG.appendChild(at(el("rect","c-streak"),{x:0,y:0,width:W,height:H,fill:"url(#streak)",opacity:n.moat?"0.30":"0.22"}));
    catchG.appendChild(at(el("ellipse"),{cx:W*0.34,cy:H*0.185,rx:W*0.17,ry:H*0.10,fill:"url(#"+hsid+")"}));
    catchG.appendChild(at(el("path","c-cres"),{d:"M "+(R+2)+" "+(H*0.085)+" Q "+(W*0.5)+" "+(-H*0.02)+" "+(W-R-2)+" "+(H*0.085)}));
    g.appendChild(catchG);
    // crisp light rim (top) + dark settle (bottom)
    g.appendChild(at(el("path","c-bevel-t"),{d:"M "+(R+1)+" 1.4 L "+(W-R-1)+" 1.4"}));
    g.appendChild(at(el("path","c-bevel-b"),{d:"M "+(R+1)+" "+(H-1.4)+" L "+(W-R-1)+" "+(H-1.4)}));
    // accent edge frame — deep integrated rim hue
    var edge0=at(el("rect","c-edge"),{x:0.6,y:0.6,width:W-1.2,height:H-1.2,rx:R});edge0.style.stroke=M.rim||n.accent;edge0.setAttribute("stroke",M.rim||n.accent);g.appendChild(edge0);
  } else if(tier===1){
    // ===== TIER 1 — M2 FROSTED GLASS (precious inner moat ring) =====
    var hex=n.accent.replace("#","");
    var ar0=parseInt(hex.slice(0,2),16),ag0=parseInt(hex.slice(2,4),16),ab0=parseInt(hex.slice(4,6),16);
    var lum=0.299*ar0+0.587*ag0+0.114*ab0, DES=0.55;
    var ar=ar0+(lum-ar0)*DES, ag=ag0+(lum-ag0)*DES, ab=ab0+(lum-ab0)*DES;
    function mixG(baseR,baseG,baseB,w){var r=Math.round(baseR+(ar-baseR)*w),gg=Math.round(baseG+(ag-baseG)*w),bb=Math.round(baseB+(ab-baseB)*w);return "rgb("+r+","+gg+","+bb+")";}
    var mTop=n.moat?0.40:0.34, mMid=n.moat?0.30:0.24, mBot=n.moat?0.16:0.12, jit=Math.round(_tn*7);
    var bodyId="gbody_"+safe;
    defs.appendChild(linGrad(bodyId,[
      ["0%",  mixG(40+jit,49+jit,60+jit, mTop)],
      ["20%", mixG(26,32,41, mMid)],["46%", mixG(17,22,29, mMid)],
      ["72%", mixG(11,15,20, mBot)],["100%",mixG(6,9,13, mBot)],
    ]));
    // dark translucent backing -> frosted body -> inner shadow
    g.appendChild(at(el("rect","c-back"),{x:0,y:0,width:W,height:H,rx:R,fill:n.moat?"url(#glassBackGold_m2)":"url(#glassBack_m2)"}));
    g.appendChild(at(el("rect","c-body"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#"+bodyId+")"}));
    g.appendChild(at(el("rect","c-inner"),{x:0.5,y:0.5,width:W-1,height:H-1,rx:R,fill:"#000",filter:"url(#innerShadow_m2)",opacity:"0.9"}));
    // coloured refraction rim (the strongest identity cue — colour DNA, not a wash)
    g.appendChild(at(el("rect","c-refr"),{x:2,y:2,width:W-4,height:H-4,rx:R-1,fill:"none",stroke:n.glow||n.accent,"stroke-width":2.6,opacity:n.moat?"0.6":"0.5"}));
    g.appendChild(at(el("rect","c-refr"),{x:2,y:2,width:W-4,height:H-4,rx:R-1,fill:"none",stroke:n.accent,"stroke-width":1,opacity:n.moat?"0.9":"0.8",filter:"url(#aoTight_m2)"}));
    // specular catch-light arc + refraction streak, clipped to body (upper third only)
    var clip1="glassclip_"+safe;
    var cp1=el("clipPath");at(cp1,{id:clip1});cp1.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R}));defs.appendChild(cp1);
    var specG=el("g");at(specG,{"clip-path":"url(#"+clip1+")","pointer-events":"none"});
    var sjx=(((_u)%7)-3)*0.025, srot=-22+((((_h>>>3)>>>0)%9)-4)*2;
    specG.appendChild(at(el("ellipse","c-spec"),{cx:W*(0.42+sjx),cy:-H*0.16,rx:W*0.66,ry:H*0.36,fill:n.moat?"url(#specArcGold_m2)":"url(#specArc_m2)",opacity:n.moat?"0.6":"0.7"}));
    specG.appendChild(at(el("ellipse","c-spec"),{cx:W*(0.46+sjx),cy:H*0.04,rx:W*0.40,ry:H*0.045,fill:"#ffffff",opacity:"0.5"}));
    specG.appendChild(at(el("rect","c-refr"),{x:-W*0.3,y:0,width:W*1.6,height:H,fill:"url(#refrStreak_m2)",opacity:"0.4",transform:"rotate("+srot+" "+(W/2)+" "+(H/2)+")"}));
    g.appendChild(specG);
    // crisp 1px light rim (top-left lit) + accent edge frame
    g.appendChild(at(el("path","c-rim"),{d:"M "+(R)+" 1 L "+(W-R)+" 1 M 1 "+(R)+" L 1 "+(H-R),stroke:"rgba(232,243,255,0.9)","stroke-width":1.3,"stroke-linecap":"round",fill:"none"}));
    var edge1=at(el("rect","c-edge"),{x:0.5,y:0.5,width:W-1,height:H-1,rx:R});edge1.style.stroke=n.accent;edge1.setAttribute("stroke",n.accent);g.appendChild(edge1);
  } else if(tier===3){
    // ===== TIER 3 — M3 MATTE CERAMIC IC (boundary / governance parts) =====
    g.appendChild(at(el("rect","c-body"),{x:0,y:0,width:W,height:H,rx:R}));
    g.appendChild(at(el("rect"),{x:1,y:1,width:W-2,height:Math.round(H*0.5),rx:R,fill:"url(#ceramTop_m3)","pointer-events":"none"}));
    var hlId="hl"+i;var hlg=el("radialGradient");at(hlg,{id:hlId,cx:"36%",cy:"24%",r:"58%"});
    [["0%","#ffffff",0.11],["44%","#ffffff",0.025],["100%","#fff",0]].forEach(function(s){var st=el("stop");at(st,{offset:s[0],"stop-color":s[1],"stop-opacity":String(s[2])});hlg.appendChild(st);});defs.appendChild(hlg);
    g.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#"+hlId+")","pointer-events":"none"}));
    g.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#ceramBot_m3)","pointer-events":"none"}));
    g.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R,fill:(_tn*0.10)>=0?"#fff":"#000",opacity:Math.abs(_tn*0.10).toFixed(3),"pointer-events":"none"}));
    // baked layer tint — coloured ceramic pigment (vertical gradient, NOT a wash)
    var tintId="tint"+i;var tg2=el("linearGradient");at(tg2,{id:tintId,x1:"0",y1:"0",x2:"0",y2:"1"});
    [[ "0%",n.glow,n.moat?0.42:0.34 ],[ "30%",n.accent,n.moat?0.30:0.24 ],[ "70%",n.accent,n.moat?0.34:0.28 ],[ "100%",n.accentB,n.moat?0.60:0.50 ]].forEach(function(st3){var st=el("stop");at(st,{offset:st3[0],"stop-color":st3[1],"stop-opacity":String(st3[2])});tg2.appendChild(st);});defs.appendChild(tg2);
    g.appendChild(at(el("rect","c-tint"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#"+tintId+")"}));
    g.appendChild(at(el("rect","c-ao"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#aoEdge_m3)"}));
    g.appendChild(at(el("path","c-chamfer-t"),{d:"M "+(R+1)+" 1.5 L "+(W-R-1)+" 1.5"}));
    g.appendChild(at(el("path","c-chamfer-b"),{d:"M "+(R+1)+" "+(H-1.5)+" L "+(W-R-1)+" "+(H-1.5)}));
    // recessed die-window cavity with a faint metallic die
    var cavW=Math.round(W*0.40), cavH=Math.round(H*0.30), cavX=Math.round(W*0.30), cavY=Math.round(H*0.50), cr2=Math.max(2,Math.round(cavW*0.06));
    g.appendChild(at(el("rect","c-cavity-rim"),{x:cavX-1,y:cavY-1,width:cavW+2,height:cavH+2,rx:cr2}));
    g.appendChild(at(el("rect","c-cavity"),{x:cavX,y:cavY,width:cavW,height:cavH,rx:cr2}));
    var dieX=cavX+Math.round(cavW*0.16), dieY=cavY+Math.round(cavH*0.18), dieW=Math.round(cavW*0.68), dieH=Math.round(cavH*0.64);
    g.appendChild(at(el("rect","c-die"),{x:dieX,y:dieY,width:dieW,height:dieH,rx:1.5}));
    if(dieW>14){var dgp="";for(var gx=dieX+3;gx<dieX+dieW-2;gx+=3)dgp+="M "+gx+" "+(dieY+1)+" L "+gx+" "+(dieY+dieH-1)+" ";g.appendChild(at(el("path","c-die-grid"),{d:dgp}));}
    g.appendChild(at(el("rect"),{x:dieX,y:dieY,width:dieW,height:Math.max(2,Math.round(dieH*0.42)),rx:1.5,fill:"url(#dieGlint_m3)","pointer-events":"none"}));
    g.appendChild(at(el("rect","c-cavity-lip"),{x:cavX,y:cavY,width:cavW,height:cavH,rx:cr2}));
    // printed silkscreen rim + accent mark + index stripes
    var silk=at(el("rect","c-silk"),{x:1,y:1,width:W-2,height:H-2,rx:R});silk.style.stroke=n.glow;silk.setAttribute("stroke",n.glow);g.appendChild(silk);
    var mk=at(el("rect","c-mark"),{x:W-14,y:6,width:8,height:8,rx:1.4});mk.style.fill=n.glow;mk.setAttribute("fill",n.glow);g.appendChild(mk);
    g.appendChild(at(el("rect"),{x:W-12,y:8,width:4,height:4,rx:0.6,fill:n.accentB,opacity:"0.85"}));
    g.appendChild(at(el("rect"),{x:W-14,y:16,width:8,height:1.4,rx:0.5,fill:n.accent,opacity:"0.85"}));
    g.appendChild(at(el("rect"),{x:W-14,y:19,width:5,height:1.4,rx:0.5,fill:n.accent,opacity:"0.55"}));
  } else {
    // ===== TIER 2 — M1 PHOTOREAL BRUSHED METAL (workhorse SYSTEMS packages) =====
    // body — per-layer integrated-tint metal ramp under the lit-metal filter (moat = gold ramp)
    var bodyFill=n.moat?"url(#pkgBodyGold_m1)":("url(#body"+n.layerKey+")");
    g.appendChild(at(el("rect","c-body"),{x:0,y:0,width:W,height:H,rx:R,fill:bodyFill}));
    // deterministic micro tone variation (soft-light, subtle)
    var _tn2=_tn*0.10;
    g.appendChild(at(el("rect"),{x:0,y:0,width:W,height:H,rx:R,fill:_tn2>=0?"#cfe2f5":"#000",opacity:Math.abs(_tn2).toFixed(3),"pointer-events":"none","mix-blend-mode":"soft-light"}));
    // brushed striation (overlay) + AO skirt rings (filter-free) + inner shadow rings
    g.appendChild(at(el("rect","c-brush"),{x:0,y:0,width:W,height:H,rx:R,fill:"url(#brushGrain_m1)"}));
    var ao2=el("g","c-ao");
    ao2.appendChild(at(el("rect"),{x:-4,y:-3,width:W+8,height:H+10,rx:R+4,fill:"none",stroke:"rgba(0,0,0,0.30)","stroke-width":6}));
    ao2.appendChild(at(el("rect"),{x:-1,y:0,width:W+2,height:H+4,rx:R+1,fill:"none",stroke:"rgba(0,0,0,0.45)","stroke-width":2.5}));
    g.appendChild(ao2);
    var inn2=el("g","c-inner");
    inn2.appendChild(at(el("rect"),{x:1.5,y:1.5,width:W-3,height:H-3,rx:R-1,fill:"none",stroke:"rgba(0,0,0,0.32)","stroke-width":2.5}));
    inn2.appendChild(at(el("rect"),{x:2.5,y:2.5,width:W-5,height:H-5,rx:R-2,fill:"none",stroke:"rgba(0,0,0,0.18)","stroke-width":1.5}));
    g.appendChild(inn2);
    // glass/metal catch arc
    g.appendChild(at(el("rect","c-spec"),{x:1.5,y:1.5,width:W-3,height:Math.round(H*0.6),rx:R,fill:n.moat?"url(#specArcGold_m1)":"url(#specArc_m1)"}));
    // bevels
    g.appendChild(at(el("path","c-bevel-t"),{d:"M "+(R+1)+" 2 L "+(W-R-1)+" 2"}));
    g.appendChild(at(el("path","c-bevel-b"),{d:"M "+(R+1)+" "+(H-2)+" L "+(W-R-1)+" "+(H-2)}));
    // crisp coloured LIGHT RIM on the top edge (integrated identity, not a wash)
    var rim2=at(el("path","c-rim"),{d:"M 1.5 "+(R+1)+" A "+(R-0.5)+" "+(R-0.5)+" 0 0 1 "+(R+1)+" 1.5 L "+(W-R-1)+" 1.5 A "+(R-0.5)+" "+(R-0.5)+" 0 0 1 "+(W-1.5)+" "+(R+1)});
    rim2.setAttribute("stroke",n.accentRim);g.appendChild(rim2);
    // structural edge frame (neutral-dark)
    g.appendChild(at(el("rect","c-edge"),{x:0.5,y:0.5,width:W-1,height:H-1,rx:R}));
  }

  // ====================================================================
  // SHARED DETAIL — pin-1, status LED, via pad, part number, name (every cell)
  // ====================================================================
  // pin-1 corner marker (notch arc, top-left) — ceramic uses a slightly tighter dimple
  g.appendChild(at(el("path","c-pin1"),{d:tier===3?"M 5 12 A 7 7 0 0 1 12 5":"M 5 13 A 8 8 0 0 1 13 5"}));
  // status LED just inside pin-1
  var ledR=tier===3?3.2:3.4, ledI=tier===3?2.0:2.2;
  g.appendChild(at(el("circle","led-ring"),{cx:10,cy:10,r:ledR}));
  g.appendChild(at(el("circle","led-"+n.status),{cx:10,cy:10,r:ledI}));
  // via pad (plated) top-right — ceramic owns its silkscreen mark instead, so skip the pad there
  if(tier!==3){var pad=at(el("rect","c-pad"),{x:W-10,y:6,width:5,height:5,rx:1});pad.style.stroke=n.accent;pad.setAttribute("stroke",n.accent);g.appendChild(pad);}
  // etched part-number label bottom-left (fab vibe)
  var part=at(el("text","c-part"),_flip?{x:5,y:H-5,transform:"rotate(180 "+(W/2)+" "+(H/2)+")"}:{x:5,y:H-5});part.textContent="U"+(("0"+(i+1)).slice(-2))+" · D"+n.deg;g.appendChild(part);
  // wrapped name label
  var words=n.label.replace(/[()]/g,"").split(/\\s+/), lines=["",""], li2=0, cap=Math.max(8,Math.floor(W/6.6));
  for(var w=0;w<words.length;w++){var word=words[w];var cand=(lines[li2]?lines[li2]+" ":"")+word;
    if(cand.length>cap&&li2===0){li2=1;lines[1]=word;}
    else if(li2===1&&((lines[1]?lines[1]+" ":"")+word).length>cap){lines[1]=lines[1]+"…";break;}
    else lines[li2]=cand;}
  // ceramic prints the name in the UPPER field (the recessed die-window owns lower-centre);
  // all other tiers centre it.
  var t=at(el("text","c-name"),_flip?{x:W/2,"text-anchor":"middle",transform:"rotate(180 "+(W/2)+" "+(H/2)+")"}:{x:W/2,"text-anchor":"middle"});
  if(tier===3){
    var nameY=Math.round(H*0.36);
    if(lines[1]){at(t,{y:nameY-6});
      var ct1=el("tspan");at(ct1,{x:W/2});ct1.textContent=lines[0];t.appendChild(ct1);
      var ct2=el("tspan");at(ct2,{x:W/2,dy:11});ct2.textContent=lines[1];t.appendChild(ct2);
    } else {at(t,{y:nameY});t.textContent=lines[0];}
  } else {
    if(lines[1]){at(t,{y:H/2-1});
      var t1=el("tspan");at(t1,{x:W/2});t1.textContent=lines[0];t.appendChild(t1);
      var t2=el("tspan");at(t2,{x:W/2,dy:11});t2.textContent=lines[1];t.appendChild(t2);
    } else {at(t,{y:H/2+4});t.textContent=lines[0];}
  }
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
function setTrace(p,on,off){p.classList.toggle("hl",on);p.classList.toggle("dim",off);}
function highlight(id){
  var keep=nbrs(id);
  cellEls.forEach(function(g,nid){g.classList.toggle("dim",!keep.has(nid));});
  bedEls.forEach(function(p){var on=p.dataset.from===id||p.dataset.to===id;setTrace(p,on,!on);});
  copperEls.forEach(function(p){var on=p.dataset.from===id||p.dataset.to===id;setTrace(p,on,!on);});
  flowEls.forEach(function(p){p.classList.toggle("on",p.dataset.from===id||p.dataset.to===id);});
  viaEls.forEach(function(v){var on=v.dataset.from===id||v.dataset.to===id;v.classList.toggle("hl",on);v.classList.toggle("dim",!on);});
}
function clearHL(){cellEls.forEach(function(g){g.classList.remove("dim");});
  bedEls.forEach(function(p){p.classList.remove("hl","dim");});
  copperEls.forEach(function(p){p.classList.remove("hl","dim");});
  flowEls.forEach(function(p){p.classList.remove("on");});
  viaEls.forEach(function(v){v.classList.remove("hl","dim");});}

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
  n.files.forEach(function(ff){var c=document.createElement("code");c.textContent=ff;fs.appendChild(c);});
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

/* ---------- pan / zoom ---------- */
var stage=document.getElementById("stage");
var elW=stage.clientWidth||innerWidth, elH=stage.clientHeight||innerHeight;
var vbx=0,vby=0,vbw=CW,vbh=CH;
function aspect(){return elH/Math.max(1,elW);}
function fixAspect(){vbh=vbw*aspect();}
function clampW(w){return Math.min(CW*1.7,Math.max(CW*0.05,w));}
function setVB(){svg.setAttribute("viewBox",vbx.toFixed(2)+" "+vby.toFixed(2)+" "+vbw.toFixed(2)+" "+vbh.toFixed(2));updateMM();}
var CONTENTR=(DATA.meta&&DATA.meta.contentR)||(OUTR+150);
function fit(){elW=stage.clientWidth;elH=stage.clientHeight;
  // Frame the content circle around the die centre. The circle diameter must fit the
  // SHORTER screen axis (height, in a landscape window): set the viewBox HEIGHT to the
  // diameter, then derive width from the pixel aspect so 1 world unit = 1 world unit on
  // both axes. (Setting vbw to the diameter would zoom OUT by the aspect ratio — the bug
  // that shrank the cells. Drive the limiting axis directly.)
  var diam=CONTENTR*2*1.04;
  if(elW>=elH){ vbh=diam; vbw=vbh*(elW/elH); }   // landscape: height-limited
  else { vbw=diam; vbh=vbw*(elH/elW); }           // portrait: width-limited
  vbw=clampW(vbw); vbh=vbw*aspect();
  vbx=CC.x-vbw/2;vby=CC.y-vbh/2;setVB();}
function s2w(sx,sy){return {x:vbx+(sx/elW)*vbw,y:vby+(sy/elH)*vbh};}
function zoomAt(sx,sy,fac){var w=s2w(sx,sy);vbw=clampW(vbw/fac);fixAspect();vbx=w.x-(sx/elW)*vbw;vby=w.y-(sy/elH)*vbh;setVB();}
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
DATA.nodes.forEach(function(n){msvg.appendChild(at(el("rect"),{x:n.x*mmS,y:n.y*mmS,width:Math.max(1,n.w*mmS),height:Math.max(1,n.h*mmS),fill:n.moat?"#E3C677":(n.status==="phantom"?"#E0776B":n.status==="dormant"?"#E3B24A":n.accent),opacity:n.moat?0.95:0.62}));});
var mmView=at(el("rect"),{id:"mmView"});msvg.appendChild(mmView);mm.appendChild(msvg);
function updateMM(){if(typeof mmView==="undefined"||!mmView)return;at(mmView,{x:Math.max(0,vbx*mmS),y:Math.max(0,vby*mmS),width:Math.min(MM_W,vbw*mmS),height:Math.min(MM_H,vbh*mmS)});}
mm.addEventListener("click",function(e){var r=msvg.getBoundingClientRect();var wx=(e.clientX-r.left)/mmS,wy=(e.clientY-r.top)/mmS;vbx=wx-vbw/2;vby=wy-vbh/2;setVB();});

/* ---------- block chips ---------- */
var chipBox=document.getElementById("chips");var activeBlk=null;
DATA.blocks.forEach(function(b){if(b.core)return;var c=document.createElement("button");c.className="chip"+(b.moat?" moat":"");
  c.innerHTML='<span class="swd" style="background:'+b.accent+'"></span>'+b.short+'<span class="c">'+b.count+'</span>';
  c.addEventListener("click",function(){
    if(activeBlk===b.layer){activeBlk=null;c.classList.remove("on");c.style.background="";clearHL();return;}
    activeBlk=b.layer;[].forEach.call(chipBox.children,function(x){x.classList.remove("on");x.style.background="";});c.classList.add("on");c.style.background=b.accent;
    cellEls.forEach(function(g,id){g.classList.toggle("dim",byId.get(id).layer!==b.layer);});
    function tg(p){var on=byId.get(p.dataset.from).layer===b.layer||byId.get(p.dataset.to).layer===b.layer;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);}
    bedEls.forEach(tg);copperEls.forEach(tg);
    viaEls.forEach(function(v){var on=byId.get(v.dataset.from).layer===b.layer||byId.get(v.dataset.to).layer===b.layer;v.classList.toggle("dim",!on);});
  });chipBox.appendChild(c);});

/* ---------- moat spotlight ---------- */
var moatBtn=document.getElementById("moatBtn"),moatOn=false;
moatBtn.addEventListener("click",function(){moatOn=!moatOn;moatBtn.classList.toggle("on",moatOn);
  if(moatOn){cellEls.forEach(function(g,id){g.classList.toggle("dim",!byId.get(id).moat);});
    function tg(p){var on=byId.get(p.dataset.from).moat&&byId.get(p.dataset.to).moat;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);}
    bedEls.forEach(tg);copperEls.forEach(tg);
  }else{clearHL();}});

/* ---------- search ---------- */
document.getElementById("search").addEventListener("input",function(e){
  var q=e.target.value.trim().toLowerCase();
  if(!q){clearHL();return;}
  var hit=new Set();
  DATA.nodes.forEach(function(n){if((n.label+" "+n.description+" "+n.layer+" "+n.files.join(" ")+" "+n.triggeredBy).toLowerCase().indexOf(q)>=0)hit.add(n.id);});
  cellEls.forEach(function(g,id){g.classList.toggle("dim",!hit.has(id));});
  function tg(p){p.classList.toggle("dim",!(hit.has(p.dataset.from)&&hit.has(p.dataset.to)));}
  bedEls.forEach(tg);copperEls.forEach(tg);
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
const netCounts = {};
for (const r of routes) netCounts[r.cls] = (netCounts[r.cls] || 0) + 1;
console.log("WROTE " + OUT);
console.log(`cells=${payload.meta.nodeCount} traces=${payload.meta.edgeCount} blocks=${payload.meta.blockCount} ` +
  `canvas=${CW}x${CH} live=${counts.live} dormant=${counts.dormant} phantom=${counts.phantom} ` +
  `pads=${pads.length} sizeRange=[${Math.min(...sizes).toFixed(2)},${Math.max(...sizes).toFixed(2)}] maxDeg=${payload.meta.maxDeg} ` +
  `nets=${JSON.stringify(netCounts)}`);
