// K1r — FULLY RADIAL FLOORPLAN (v3)
// Everything is rings of cells. The moat is the CORE: each moat layer is its own
// RADIAL CORE — cells packed in concentric rings around a disc centre (energy at
// the dead centre, cognition + memory flanking) — not a rectangular registry.
// Every other layer is a tight WEDGE of cells on concentric arcs around the core,
// angularly ordered by COUPLING; Governance rides the outer perimeter ring.
//
// Output contract:
//   { blocks:[{layer,moat,core,arc,perimeter,cx,cy,discR?,a0?,a1?,rIn?,rOut?,labelX,labelY,labelAngle?,labelH}],
//     cells:{id:{x,y,w,h,cx,cy,layer}}, canvas:{w,h},
//     channels:{vGutters:[],hGutters:[]}, center:{x,y}, coreR, rings:[...] }
//   core blocks carry a disc (cx,cy,discR); arc blocks carry a wedge (a0,a1,rIn,rOut).
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

export function buildRadialFloorplan(nodes, graphEdges = [], opts = {}) {
  const O = {
    coreCell: 104, coreGapC: 18, coreGap: 64, labelH: 30,
    ringCell: 78, ringCellGap: 16, ringGap0: 70, sectorGap: 0.05,
    margin: 150, ...opts,
  };

  const byLayer = new Map(LAYER_ORDER.map((l) => [l, []]));
  for (const n of nodes) { if (!byLayer.has(n.layer)) byLayer.set(n.layer, []); byLayer.get(n.layer).push(n.id); }
  const layerOf = new Map(nodes.map((n) => [n.id, n.layer]));
  const deg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of graphEdges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
  for (const [, ids] of byLayer) ids.sort((a, b) => (deg.get(b) - deg.get(a)) || (a < b ? -1 : 1)); // hubs inner

  const couple = new Map();
  const ckey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  for (const e of graphEdges) { const a = layerOf.get(e.from), b = layerOf.get(e.to); if (a && b && a !== b) couple.set(ckey(a, b), (couple.get(ckey(a, b)) || 0) + 1); }
  const coupTo = (L, set) => { let s = 0; for (const M of set) if (M !== L) s += couple.get(ckey(L, M)) || 0; return s; };

  const blocks = [], blockByLayer = new Map(), cells = {};

  // ---- concentric-ring (sunflower-ish) packing of n cells into a disc.
  const cPitch = O.coreCell + O.coreGapC;
  function discRadiusFor(n) {
    let idx = (n > 0 ? 1 : 0), ring = 1, r = 0;
    while (idx < n) { const rad = ring * cPitch; const cap = Math.max(1, Math.floor((2 * Math.PI * rad) / cPitch)); idx += Math.min(cap, n - idx); r = rad; ring++; }
    return r + O.coreCell / 2;
  }
  function packDisc(ids, cx, cy) {
    let idx = 0, ring = 0;
    while (idx < ids.length) {
      if (ring === 0) { const id = ids[idx++]; cells[id] = { x: cx - O.coreCell / 2, y: cy - O.coreCell / 2, w: O.coreCell, h: O.coreCell, cx, cy, layer: layerOf.get(id) }; }
      else {
        const rad = ring * cPitch, cap = Math.max(1, Math.floor((2 * Math.PI * rad) / cPitch)), take = Math.min(cap, ids.length - idx);
        for (let i = 0; i < take; i++) {
          const a = (i / take) * 2 * Math.PI + ring * 0.6;
          const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a), id = ids[idx++];
          cells[id] = { x: x - O.coreCell / 2, y: y - O.coreCell / 2, w: O.coreCell, h: O.coreCell, cx: x, cy: y, layer: layerOf.get(id) };
        }
      }
      ring++;
    }
  }

  // ---- CORE: 3 radial cores in a row (energy centre, biggest others flanking).
  const energy = "Energy & Math";
  const moatSorted = [energy, ...LAYER_ORDER.filter((L) => MOAT.has(L) && L !== energy).sort((a, b) => byLayer.get(b).length - byLayer.get(a).length)];
  const discR = new Map(); for (const L of moatSorted) discR.set(L, discRadiusFor((byLayer.get(L) || []).length));
  const ctr = new Map(); ctr.set(energy, { x: 0, y: 0 });
  if (moatSorted[1]) ctr.set(moatSorted[1], { x: -(discR.get(energy) + discR.get(moatSorted[1]) + O.coreGap), y: 0 });
  if (moatSorted[2]) ctr.set(moatSorted[2], { x: (discR.get(energy) + discR.get(moatSorted[2]) + O.coreGap), y: 0 });
  for (const L of moatSorted) {
    const c = ctr.get(L); packDisc(byLayer.get(L) || [], c.x, c.y);
    const b = { layer: L, moat: true, core: true, arc: false, cx: c.x, cy: c.y, discR: discR.get(L), labelH: O.labelH };
    blocks.push(b); blockByLayer.set(L, b);
  }
  let coreR = 0; for (const L of moatSorted) { const c = ctr.get(L); coreR = Math.max(coreR, Math.hypot(Math.abs(c.x) + discR.get(L), Math.abs(c.y) + discR.get(L))); }

  // ---- ORBIT: each non-moat layer = a wedge of cells on concentric arcs.
  const orbit = LAYER_ORDER.filter((L) => !MOAT.has(L));
  const rem = new Set(orbit), order = [];
  if (rem.size) {
    let cur = [...rem].sort((a, b) => coupTo(b, MOAT) - coupTo(a, MOAT))[0]; order.push(cur); rem.delete(cur);
    while (rem.size) { const nx = [...rem].sort((a, b) => (couple.get(ckey(cur, b)) || 0) - (couple.get(ckey(cur, a)) || 0) || (byLayer.get(b).length - byLayer.get(a).length))[0]; order.push(nx); rem.delete(nx); cur = nx; }
  }
  const cellPitchA = O.ringCell + O.ringCellGap;
  const totalOrbit = orbit.reduce((s, L) => s + (byLayer.get(L) || []).length, 0) || 1;
  const usable = 2 * Math.PI - order.length * O.sectorGap;
  const baseR = coreR + O.ringGap0 + O.ringCell / 2;
  let ang = -Math.PI / 2, maxR = coreR;
  for (const L of order) {
    const ids = byLayer.get(L) || [], isPerim = L === PERIMETER;
    const span = Math.max(O.sectorGap * 2, usable * (ids.length / totalOrbit));
    const a0 = ang + O.sectorGap / 2, a1 = ang + span - O.sectorGap / 2, aMid = (a0 + a1) / 2;
    let r = baseR + (isPerim ? cellPitchA * 0.9 : 0), rIn = r - O.ringCell / 2, placed = 0;
    while (placed < ids.length) {
      const cap = Math.max(1, Math.floor(((a1 - a0) * r) / cellPitchA)), take = Math.min(cap, ids.length - placed);
      const padA = (((a1 - a0) * r) - take * cellPitchA) / 2 / r;
      for (let i = 0; i < take; i++) {
        const id = ids[placed + i], ca = a0 + padA + (i + 0.5) * (cellPitchA / r);
        const cx = r * Math.cos(ca), cy = r * Math.sin(ca);
        cells[id] = { x: cx - O.ringCell / 2, y: cy - O.ringCell / 2, w: O.ringCell, h: O.ringCell, cx, cy, layer: L };
      }
      placed += take; r += cellPitchA;
    }
    const rOut = r - cellPitchA + O.ringCell / 2; maxR = Math.max(maxR, rOut);
    blocks.push({ layer: L, moat: false, core: false, arc: true, perimeter: isPerim, cx: aMid, cy: 0, a0, a1, rIn, rOut, labelAngle: aMid, labelH: O.labelH });
    ang += span;
  }

  // ---- shift to positive coords + canvas.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in cells) { const c = cells[id]; minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); }
  const dx = O.margin - minX, dy = O.margin - minY;
  for (const id in cells) { const c = cells[id]; c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy); c.cx += dx; c.cy += dy; }
  for (const b of blocks) {
    b.acx = dx; b.acy = dy;
    if (b.core) { b.cx += dx; b.cy += dy; b.labelX = b.cx; b.labelY = b.cy - b.discR - 14; }
    else if (b.arc) { b.labelX = dx + (b.rIn - 15) * Math.cos(b.labelAngle); b.labelY = dy + (b.rIn - 15) * Math.sin(b.labelAngle); }
  }
  const canvasW = Math.round(maxX - minX + 2 * O.margin), canvasH = Math.round(maxY - minY + 2 * O.margin);
  return { blocks, cells, canvas: { w: canvasW, h: canvasH }, channels: { vGutters: [], hGutters: [] }, center: { x: dx, y: dy }, coreR, rings: [coreR, baseR, maxR] };
}

export default buildRadialFloorplan;
