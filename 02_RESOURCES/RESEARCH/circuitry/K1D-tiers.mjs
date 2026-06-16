// K1D — CONCENTRIC DEPENDENCY-TIER FLOORPLAN (Direction D, done right)
// =====================================================================
// The blob redeemed. NOT a dense packed disc of identical tiles. Instead:
//
//   - A single glowing CORE DISC at centre: the live energy gate kernel
//     (energy-fn + its tight live-tick ring) — dominant, special, small set.
//   - Concentric DESIGNED BANDS, each separated by a real ring GAP:
//       Band 0  CORE        live energy gate kernel
//       Band 1  MOAT        rest of Energy/Math + Memory + Cognition (the defensible core)
//       Band 2  SYSTEMS     commodity/self-improvement layers ranked by coupling-to-moat
//       Band 3  RIM         Governance & Safety (the safety perimeter) + Hidden/Meta
//   - Within each band, every LAYER owns a contiguous angular WEDGE sized to
//     its cell count. A layer therefore reads as ONE coherent radial region
//     with its own accent — never scattered, never interleaved with a neighbour.
//   - Cells inside a wedge are placed on sub-arcs with REAL breathing room
//     (gap-aware arc packing), so a band reads as distinct modules, not a
//     wall-to-wall tile ring.
//
// Placement is 100% reasoned: radius = dependency tier, angle = layer identity,
// sub-position = degree rank (hubs sit toward the inner edge of their wedge,
// closer to the core they feed). Deterministic; no RNG, no wall-clock.
//
// Output contract (consumed by build-chip-die-D.mjs):
//   {
//     center:{x,y}, canvas:{w,h}, coreR,
//     bands:[{tier, rIn, rOut, rMid, accent}],
//     blocks:[{layer, band, tier, a0, a1, aMid, rIn, rOut, rMid,
//              labelR, labelAngle, accent, moat, perimeter, core, n}],
//     cells:{ id:{ x,y,w,h, cx,cy, layer, band, tier, ang, r } },
//     tierRings:[r,...]
//   }
// =====================================================================

const MOAT = new Set(["Energy & Math", "Cognition & Persona", "Memory & Subconscious"]);

// The live energy-gate kernel — the dominant glowing CORE disc (a small,
// meaningful set: the heart + the organs that fire on every live tick).
const CORE_IDS = new Set([
  "energy-fn", "math-kernel",
  "energy-tick-core", "energy-config", "energy-trace", "energy-breaker",
]);

// per-band, per-layer accent (region identity). distinct hues, all sitting
// inside the silicon-die palette so it stays one chip, not a rainbow.
const ACCENT = {
  // CORE
  "Energy & Math":            { h: "#E3C677", glow: "#C9A14A", ink: "#f6ecd2" }, // gold (moat heart)
  // MOAT band
  "Memory & Subconscious":    { h: "#C9B0FF", glow: "#9b7bff", ink: "#e7defc" }, // violet
  "Cognition & Persona":      { h: "#74E6D6", glow: "#4FB3A6", ink: "#d6fff7" }, // teal
  // SYSTEMS band
  "Retrieval & Knowledge":    { h: "#5AD2FF", glow: "#2E6F8F", ink: "#d4f1ff" }, // cyan
  "Learning & Continuity":    { h: "#7FB8FF", glow: "#3f6fd0", ink: "#dbe9ff" }, // azure
  "Self-Improvement":         { h: "#8CE66F", glow: "#4c9f3d", ink: "#e3ffd9" }, // regenerative green
  "Skills & Orchestration":   { h: "#FF9F6E", glow: "#c25a2a", ink: "#ffe1d0" }, // amber
  "Token-Efficiency & Session": { h: "#8FA9C9", glow: "#56708f", ink: "#dbe6f2" }, // steel
  // RIM band
  "Governance & Safety":      { h: "#E0776B", glow: "#b03a30", ink: "#ffd9d2" }, // red (the guard rim)
  "Hidden / Meta / Self-referential": { h: "#A9B6C2", glow: "#5f7689", ink: "#e2e9f0" }, // grey-meta
  // INTERFACE band (world-facing — YURI 10->14)
  "Perception & Interface":   { h: "#FF8FB0", glow: "#c43e74", ink: "#ffd9e8" }, // rose — sensing the world
  "Actuation & Embodiment":   { h: "#FF7A4D", glow: "#c24a22", ink: "#ffe0d2" }, // coral — acting on the world
  "Relational & Peer":        { h: "#9D7BFF", glow: "#5f3fd0", ink: "#e4dcff" }, // indigo — other minds / peers
  // TELOS cap (transcendent apex)
  "Telos & Meaning":          { h: "#F2E9C0", glow: "#bfa94f", ink: "#fbf6e2" }, // luminous — the why
};

export function buildTierFloorplan(nodes, graphEdges = [], opts = {}) {
  const O = {
    cellBase: 104,         // base cell footprint (px); scaled per-degree in the builder
    margin: 70,
    coreR: 252,            // (legacy) nominal core radius; actual is now spacing-derived
    gap: 120,              // ring gap between bands (the breathing space)
    bandH: 262,            // (legacy) bands now size to fit their sub-rings at PITCH
    wedgeGapDeg: 8,        // angular gap between adjacent layer wedges in a band (6->8 2026-06-16: the 14-layer repack)
    clearance: 82,         // min empty space added to a cell's max footprint -> PITCH
    ...opts,
  };
  // gap/clearance were tuned for cellBase 104 as ABSOLUTE px; at a smaller cellBase they become huge relative
  // to the cells (the bands fling apart, leaving a big empty ring + outer nodes too far). Scale them with
  // cellBase so the whole die stays proportionally compact unless the caller overrides explicitly.
  const _sc = O.cellBase / 104;
  if (opts.gap === undefined) O.gap = Math.round(64 * _sc);
  if (opts.clearance === undefined) O.clearance = Math.round(82 * _sc);

  const layerOf = new Map(nodes.map((n) => [n.id, n.layer]));
  const deg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of graphEdges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }

  // coupling between layers -> orders the SYSTEMS band by pull toward the moat.
  const couple = new Map(); const ckey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  for (const e of graphEdges) { const a = layerOf.get(e.from), b = layerOf.get(e.to); if (a && b && a !== b) couple.set(ckey(a, b), (couple.get(ckey(a, b)) || 0) + 1); }
  const coupToMoat = (L) => { let s = 0; for (const M of MOAT) if (M !== L) s += couple.get(ckey(L, M)) || 0; return s; };

  // bucket nodes: core kernel vs. everything by layer.
  const coreNodes = nodes.filter((n) => CORE_IDS.has(n.id));
  const byLayer = new Map();
  for (const n of nodes) {
    if (CORE_IDS.has(n.id)) continue;
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer).push(n.id);
  }
  // hubs toward inner edge of their wedge.
  for (const [, ids] of byLayer) ids.sort((a, b) => (deg.get(b) - deg.get(a)) || (a < b ? -1 : 1));

  // ---- BAND DEFINITIONS -------------------------------------------------
  // Each band lists the layers it carries, in draw order. Layer order inside
  // a band sets the angular sweep direction (deterministic, reasoned).
  const MOAT_LAYERS_REST = ["Memory & Subconscious", "Cognition & Persona", "Energy & Math"]
    .filter((L) => (byLayer.get(L) || []).length); // Energy remnant rides the moat band too
  const SYSTEMS_LAYERS = ["Retrieval & Knowledge", "Learning & Continuity", "Self-Improvement", "Skills & Orchestration", "Token-Efficiency & Session"]
    .filter((L) => (byLayer.get(L) || []).length)
    .sort((a, b) => coupToMoat(b) - coupToMoat(a)); // strongest pull sits first (clockwise from top)
  const RIM_LAYERS = ["Governance & Safety", "Hidden / Meta / Self-referential"]
    .filter((L) => (byLayer.get(L) || []).length);
  // 2026-06-16: the 4 world-facing/transcendent layers completing YURI 10->14. INTERFACE = the
  // system's outer edge to the world (perceive/act/relate); TELOS = the meaning apex, outermost cap.
  // Empty layers self-filter, so Telos renders only once it has an organ (telos-core seeds it).
  const INTERFACE_LAYERS = ["Perception & Interface", "Actuation & Embodiment", "Relational & Peer"]
    .filter((L) => (byLayer.get(L) || []).length);
  const TELOS_LAYERS = ["Telos & Meaning"]
    .filter((L) => (byLayer.get(L) || []).length);

  const bandDefs = [
    { tier: 1, name: "MOAT",      layers: MOAT_LAYERS_REST, accent: "#C9A14A" },
    { tier: 2, name: "SYSTEMS",   layers: SYSTEMS_LAYERS,   accent: "#5AD2FF" },
    { tier: 3, name: "RIM",       layers: RIM_LAYERS,       accent: "#E0776B" },
    { tier: 4, name: "INTERFACE", layers: INTERFACE_LAYERS, accent: "#9D7BFF" },
    { tier: 5, name: "TELOS",     layers: TELOS_LAYERS,     accent: "#F2E9C0" },
  ];

  const cells = {};
  const blocks = [];
  const bands = [];

  // size scale per node from degree percentile (strong hierarchy).
  const degVals = [...deg.values()].sort((a, b) => a - b);
  const pct = (v) => { let lo = 0; while (lo < degVals.length && degVals[lo] < v) lo++; return degVals.length <= 1 ? 1 : lo / (degVals.length - 1); };
  const sizeOf = (id, isCore) => {
    const r = pct(deg.get(id) || 0);
    let s = 0.60 + 0.78 * r;        // 0.60 .. 1.38 (strong hierarchy)
    if (isCore) s = Math.min(0.86, Math.max(0.64, s * 0.66)); // core cells compact to fit the disc
    return s;
  };

  // spacing so cells never touch — even with the facing-rotation (square corners)
  // + package leads. RSEP separates sub-rings radially; ARCSEP is the min along-arc
  // spacing. Moderate so the die stays dense, not blown out.
  const CELLMAX = O.cellBase * 1.38;
  const RSEP = Math.round(CELLMAX * 1.34);        // radial sub-ring separation (1.20->1.34 2026-06-16: dense Memory wedge sub-rings collided after the 14-layer repack)
  const ARCSEP = Math.round(O.cellBase * 2.06);   // min arc spacing (bbox-safe + rotation-aware; 1.86->2.06 2026-06-16 for the denser 14-layer repack)

  // ---- CORE DISC --------------------------------------------------------
  // energy-fn at dead centre (the singular hub); the rest of the kernel on a
  // ring sized so the cells never touch. This IS the glowing heart.
  let coreOuter;
  {
    const cx0 = 0, cy0 = 0;
    coreNodes.sort((a, b) => (deg.get(b.id) - deg.get(a.id)) || (a.id < b.id ? -1 : 1));
    const hub = coreNodes[0];
    const ring = coreNodes.slice(1);
    {
      const w = Math.round(O.cellBase * 1.06), h = w;
      cells[hub.id] = { x: cx0 - w / 2, y: cy0 - h / 2, w, h, cx: cx0, cy: cy0, layer: hub.layer, band: 0, tier: 0, ang: 0, r: 0 };
    }
    const rr = Math.max(O.cellBase * 1.3, (ring.length * ARCSEP) / (2 * Math.PI));
    ring.forEach((n, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, ring.length)) * 2 * Math.PI;
      const cx = rr * Math.cos(a), cy = rr * Math.sin(a);
      const s = sizeOf(n.id, true); const w = Math.round(O.cellBase * Math.max(0.80, s)), h = w;
      cells[n.id] = { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, layer: n.layer, band: 0, tier: 0, ang: a, r: rr };
    });
    coreOuter = rr + CELLMAX * 0.6;
    bands.push({ tier: 0, rIn: 0, rOut: coreOuter, rMid: coreOuter * 0.5, accent: "#E3C677", core: true });
  }

  // ---- BANDS — each layer a wedge; cells spread to FILL the wedge arc evenly, on
  //      the fewest sub-rings (cap 3) that keep arc spacing >= ARCSEP; sub-rings sit
  //      RSEP apart radially so nothing overlaps.
  let rIn = coreOuter + O.gap;
  for (const bd of bandDefs) {
    const layers = bd.layers.filter((L) => (byLayer.get(L) || []).length);
    if (!layers.length) continue;
    const gapRadMin = (O.wedgeGapDeg * Math.PI) / 180;
    const rFirst = rIn + CELLMAX * 0.6 + CELLMAX * 0.5;
    const pitchAt = (rr) => ARCSEP / rr;                       // angular pitch keeping ARCSEP arc spacing

    // Each layer = a COMPACT square-ish GRID sized to ITS OWN cells (cols×rows). Then GROW rows (shrink cols)
    // on the widest layer until every layer's sized wedge fits inside 2π (prevents inner-band angular overflow).
    const budget = 2 * Math.PI - layers.length * gapRadMin;
    const plan = layers.map((L) => {
      const ids = byLayer.get(L) || []; const n = ids.length;
      const cols = Math.max(1, Math.min(10, Math.round(Math.sqrt(n) * 1.15)));
      return { L, ids, n, subRings: Math.max(1, Math.ceil(n / cols)) };
    });
    const sweepOf = (p) => Math.ceil(p.n / p.subRings) * pitchAt(rFirst);
    let guard = 0;
    while (plan.reduce((a, p) => a + sweepOf(p), 0) > budget && guard++ < 300) {
      const big = plan.reduce((m, p) => (sweepOf(p) > sweepOf(m) ? p : m), plan[0]);
      big.subRings += 1;
    }
    const maxSub = Math.max(1, ...plan.map((p) => p.subRings));
    const bandH = (maxSub - 1) * RSEP + CELLMAX + RSEP * 0.5;
    const rOut = rIn + bandH;
    bands.push({ tier: bd.tier, rIn, rOut, rMid: (rIn + rOut) / 2, accent: bd.accent, name: bd.name });

    // spread the sized grids EVENLY around the full ring — leftover arc shared as equal gaps (fills the disc).
    const totalSweep = plan.reduce((a, p) => a + sweepOf(p), 0);
    const gapRad = Math.max(gapRadMin, (2 * Math.PI - totalSweep) / layers.length);
    let aCursor = -Math.PI / 2 + gapRad / 2;
    for (const p of plan) {
      const { L, ids } = p;
      const perRing = Math.ceil(ids.length / p.subRings);
      const sweep = perRing * pitchAt(rFirst);
      const a0 = aCursor, a1 = aCursor + sweep, aMid = (a0 + a1) / 2;
      const acc = ACCENT[L] || { h: bd.accent, glow: bd.accent, ink: "#fff" };
      const aEdge = sweep * 0.05, aSpan = Math.max(0.00001, sweep - 2 * aEdge);
      ids.forEach((id, i) => {
        const rk = Math.floor(i / perRing);
        const idxInRing = i % perRing;
        const ringCount = Math.min(perRing, ids.length - rk * perRing);
        const rr = rFirst + rk * RSEP;
        const frac = ringCount === 1 ? 0.5 : idxInRing / (ringCount - 1);
        const a = a0 + aEdge + aSpan * frac;                  // fill the (cell-sized) wedge as a grid row
        const cx = rr * Math.cos(a), cy = rr * Math.sin(a);
        const s = sizeOf(id, false); const w = Math.round(O.cellBase * s), h = w;
        cells[id] = { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, layer: L, band: bd.tier, tier: bd.tier, ang: a, r: rr };
      });
      const labelR = rOut + 30;
      blocks.push({ layer: L, band: bd.tier, tier: bd.tier, a0, a1, aMid, rIn, rOut, rMid: (rIn + rOut) / 2,
        labelR, labelAngle: aMid, accent: acc, moat: MOAT.has(L), perimeter: L === "Governance & Safety", core: false, n: ids.length });
      aCursor = a1 + gapRad;
    }
    rIn = rOut + O.gap;
  }
  const outerR = rIn - O.gap;

  // core layer block (for the chip/legend list) — anchored at top.
  {
    const acc = ACCENT["Energy & Math"];
    blocks.unshift({
      layer: "Energy & Math · CORE", band: 0, tier: 0, a0: -Math.PI, a1: Math.PI, aMid: -Math.PI / 2,
      rIn: 0, rOut: coreOuter, rMid: coreOuter * 0.5, labelR: coreOuter + 24, labelAngle: -Math.PI / 2,
      accent: acc, moat: true, perimeter: false, core: true, n: coreNodes.length,
    });
  }

  // ---- shift to positive coords + canvas --------------------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in cells) { const c = cells[id]; minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); }
  // include label radius in bounds so labels don't clip (tight hug)
  const labelBound = outerR + 64;
  minX = Math.min(minX, -labelBound); minY = Math.min(minY, -labelBound);
  maxX = Math.max(maxX, labelBound); maxY = Math.max(maxY, labelBound);
  const dx = O.margin - minX, dy = O.margin - minY;
  for (const id in cells) { const c = cells[id]; c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy); c.cx += dx; c.cy += dy; }
  for (const b of blocks) { /* keep angles; store absolute centre */ }
  const center = { x: dx, y: dy };
  const canvasW = Math.round(maxX - minX + 2 * O.margin);
  const canvasH = Math.round(maxY - minY + 2 * O.margin);

  const tierRings = bands.flatMap((b) => (b.core ? [b.rOut] : [b.rIn, b.rOut]));

  return {
    center, canvas: { w: canvasW, h: canvasH }, coreR: O.coreR,
    bands: bands.map((b) => ({ ...b })),
    blocks, cells,
    channels: { vGutters: [], hGutters: [] },
    tierRings, outerR,
  };
}

export default buildTierFloorplan;
