// K1r — RADIAL CONCENTRIC FLOORPLAN (v4: one dense packed core, reasoned tiers)
// Every cell is packed into ONE continuous set of concentric rings around a single
// centre. Order = dependency tier: Energy core fills the centre, the rest of the
// moat next, commodity by coupling, Governance on the outer perimeter. Each ring is
// fully packed -> no void, no overlapping discs. A layer's cells stay contiguous, so
// each layer reads as a coherent spiral region; radius encodes tier (reasoned layout).
//
// Output contract:
//   { blocks:[{layer,moat,perimeter,core,region:true,cx,cy,labelX,labelY,ringMid,n}],
//     cells:{id:{x,y,w,h,cx,cy,layer}}, canvas:{w,h}, channels:{vGutters:[],hGutters:[]},
//     center:{x,y}, coreR, rings:[tier radii], tierRings:[r,...] }
//
// Pure deterministic Node ESM, zero deps.

const LAYER_ORDER = [
  "Cognition & Persona", "Energy & Math", "Memory & Subconscious",
  "Retrieval & Knowledge", "Learning & Continuity", "Governance & Safety",
  "Skills & Orchestration", "Token-Efficiency & Session",
  "Hidden / Meta / Self-referential",
];
const MOAT = new Set(["Energy & Math", "Cognition & Persona", "Memory & Subconscious"]);
const PERIMETER = "Governance & Safety";
const CORE = "Energy & Math";

export function buildRadialFloorplan(nodes, graphEdges = [], opts = {}) {
  const O = { cell: 76, gap: 18, ringGap: 6, margin: 110, ...opts };
  const pitch = O.cell + O.gap;          // along-arc + radial spacing
  const ringStep = O.cell + O.ringGap;   // radial distance between rings

  const byLayer = new Map(LAYER_ORDER.map((l) => [l, []]));
  for (const n of nodes) { if (!byLayer.has(n.layer)) byLayer.set(n.layer, []); byLayer.get(n.layer).push(n.id); }
  const layerOf = new Map(nodes.map((n) => [n.id, n.layer]));
  const deg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of graphEdges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
  for (const [, ids] of byLayer) ids.sort((a, b) => (deg.get(b) - deg.get(a)) || (a < b ? -1 : 1)); // hubs first

  // coupling -> tier order for commodity layers.
  const couple = new Map(); const ckey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  for (const e of graphEdges) { const a = layerOf.get(e.from), b = layerOf.get(e.to); if (a && b && a !== b) couple.set(ckey(a, b), (couple.get(ckey(a, b)) || 0) + 1); }
  const coupTo = (L, set) => { let s = 0; for (const M of set) if (M !== L) s += couple.get(ckey(L, M)) || 0; return s; };

  // tier order: energy (core) -> rest of moat (by size) -> commodity (by coupling to moat) -> governance (perimeter, last)
  const restMoat = LAYER_ORDER.filter((L) => MOAT.has(L) && L !== CORE).sort((a, b) => byLayer.get(b).length - byLayer.get(a).length);
  const commodity = LAYER_ORDER.filter((L) => !MOAT.has(L) && L !== PERIMETER).sort((a, b) => coupTo(b, MOAT) - coupTo(a, MOAT));
  const tierOrder = [CORE, ...restMoat, ...commodity, ...(byLayer.get(PERIMETER) && byLayer.get(PERIMETER).length ? [PERIMETER] : [])];

  // flat cell list in tier order (within a layer: hubs first).
  const flat = [];
  for (const L of tierOrder) for (const id of (byLayer.get(L) || [])) flat.push(id);

  // ---- concentric-ring packing around (0,0): ring k radius = k*ringStep, capacity = floor(2*pi*r/pitch).
  const cells = {};
  const ringOfLayer = new Map();   // layer -> {minR,maxR, ringIdxs:Set}
  let idx = 0, ring = 0, coreR = 0;
  while (idx < flat.length) {
    if (ring === 0) {
      const id = flat[idx++]; cells[id] = { x: -O.cell / 2, y: -O.cell / 2, w: O.cell, h: O.cell, cx: 0, cy: 0, layer: layerOf.get(id) };
    } else {
      const r = ring * ringStep;
      const cap = Math.max(1, Math.floor((2 * Math.PI * r) / pitch));
      const take = Math.min(cap, flat.length - idx);
      // small per-ring rotation so rings interleave tidily (not a hard spoke grid, not chaos)
      const rot = (ring % 2) * (Math.PI / cap);
      for (let i = 0; i < take; i++) {
        const a = -Math.PI / 2 + rot + (i / cap) * 2 * Math.PI;
        const cx = r * Math.cos(a), cy = r * Math.sin(a), id = flat[idx++];
        cells[id] = { x: cx - O.cell / 2, y: cy - O.cell / 2, w: O.cell, h: O.cell, cx, cy, layer: layerOf.get(id) };
      }
    }
    // track where the core (energy) ends
    if (idx <= (byLayer.get(CORE) || []).length) coreR = ring * ringStep + O.cell / 2;
    ring++;
  }
  const outerR = (ring - 1) * ringStep + O.cell / 2;

  // ---- per-layer region: centroid (label anchor) + mean radius.
  const blocks = [];
  for (const L of tierOrder) {
    const ids = byLayer.get(L) || []; if (!ids.length) continue;
    let sx = 0, sy = 0, sr = 0;
    for (const id of ids) { const c = cells[id]; sx += c.cx; sy += c.cy; sr += Math.hypot(c.cx, c.cy); }
    const cx = sx / ids.length, cy = sy / ids.length, mr = sr / ids.length;
    const ang = Math.atan2(cy, cx) || -Math.PI / 2;
    blocks.push({
      layer: L, moat: MOAT.has(L), perimeter: L === PERIMETER, core: L === CORE, region: true,
      cx, cy, ringMid: mr, n: ids.length,
      labelX: (mr + O.cell * 0.9) * Math.cos(ang), labelY: (mr + O.cell * 0.9) * Math.sin(ang), labelAngle: ang,
    });
  }

  // ---- shift to positive coords + canvas.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in cells) { const c = cells[id]; minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); }
  const dx = O.margin - minX, dy = O.margin - minY;
  for (const id in cells) { const c = cells[id]; c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy); c.cx += dx; c.cy += dy; }
  for (const b of blocks) { b.cx += dx; b.cy += dy; b.labelX += dx; b.labelY += dy; }
  const canvasW = Math.round(maxX - minX + 2 * O.margin), canvasH = Math.round(maxY - minY + 2 * O.margin);
  const center = { x: dx, y: dy };

  // tier ring-guide radii (one per layer band boundary) for faint concentric guides.
  const tierRings = blocks.map((b) => b.ringMid).filter((r) => r > 0);

  return { blocks, cells, canvas: { w: canvasW, h: canvasH }, channels: { vGutters: [], hGutters: [] }, center, coreR, rings: [coreR, outerR], tierRings };
}

export default buildRadialFloorplan;
