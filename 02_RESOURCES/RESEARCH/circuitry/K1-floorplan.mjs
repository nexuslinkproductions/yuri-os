// K1 — CHIP-DIE FLOORPLAN PACKER (deterministic, zero deps)
// Packs the 9 layer-blocks into a tight cyberpunk silicon-die floorplan.
// MOAT layers (Energy&Math, Cognition, Memory) pulled to the die centre;
// commodity layers pushed to the rim. Energy&Math is the central region.
//
// Pure deterministic Node ESM. No npm. No RNG, no wall-clock.
// Output: plain JSON-serializable numbers + SVG path strings.

const LAYER_ORDER = [
  "Cognition & Persona",
  "Energy & Math",
  "Memory & Subconscious",
  "Retrieval & Knowledge",
  "Learning & Continuity",
  "Governance & Safety",
  "Skills & Orchestration",
  "Token-Efficiency & Session",
  "Hidden / Meta / Self-referential",
];

const MOAT_LAYERS = new Set([
  "Energy & Math",
  "Cognition & Persona",
  "Memory & Subconscious",
]);

// ---- deterministic helpers -------------------------------------------------

// seeded mulberry32 (fixed seed) — present per the kernel contract even though
// the floorplan is fully deterministic without consuming it.
const SEED = 0x59555249; // "YURI"
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snap(v, grid) {
  return Math.round(v / grid) * grid;
}

// Choose a (cols,rows) grid for N cells that is as square as possible but
// biased slightly wider than tall (chip blocks read better landscape).
function gridFor(n) {
  if (n <= 0) return { cols: 1, rows: 1 };
  let cols = Math.ceil(Math.sqrt(n));
  // bias wider: prefer the smaller number of rows
  let rows = Math.ceil(n / cols);
  // try to widen by one column if it removes a row (tighter, landscape)
  while (cols < n) {
    const r2 = Math.ceil(n / (cols + 1));
    if (r2 < rows) {
      cols += 1;
      rows = r2;
    } else break;
  }
  return { cols, rows };
}

// ---- main ------------------------------------------------------------------

export function buildFloorplan(nodes, opts = {}) {
  const O = {
    grid: 10, // coarse snap grid (silicon aesthetic)
    cell: 70, // uniform cell width/height (pre-snap)
    cellGap: 8, // gap between cells inside a block
    pad: 14, // block inner padding around the cell grid
    labelH: 26, // reserved label strip height at top of each block
    gutter: 56, // routing-channel width between blocks (gutter)
    margin: 60, // die margin around the whole floorplan
    ...opts,
  };
  const rng = mulberry32(SEED); // seeded, deterministic; reserved for future jitter
  void rng;

  // 1) group node ids per layer, in LAYER_ORDER, ids sorted for determinism.
  const byLayer = new Map();
  for (const L of LAYER_ORDER) byLayer.set(L, []);
  for (const n of nodes) {
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer).push(n.id);
  }
  for (const [, ids] of byLayer) ids.sort();

  // 2) compute the intrinsic w/h of each block from its cell grid.
  const cellPitch = O.cell + O.cellGap; // distance between cell origins
  const blockDims = new Map();
  for (const L of LAYER_ORDER) {
    const ids = byLayer.get(L) || [];
    const n = ids.length;
    const { cols, rows } = gridFor(n);
    const gridW = cols * O.cell + (cols - 1) * O.cellGap;
    const gridH = rows * O.cell + (rows - 1) * O.cellGap;
    let w = snap(gridW + 2 * O.pad, O.grid);
    let h = snap(gridH + 2 * O.pad + O.labelH, O.grid);
    blockDims.set(L, { w, h, cols, rows, n, gridW, gridH });
  }

  // 3) Slot layout: a 3x3 macro-grid of block slots forming concentric rings.
  //    centre slot = the biggest MOAT block (Energy & Math); the inner ring
  //    holds the other MOAT layers nearest centre; the rim holds commodity.
  //
  //    Slot coordinates (col,row) in a 3x3 lattice, ranked by ring distance
  //    from the centre (1,1). We assign MOAT layers to the closest slots and
  //    commodity layers to the farthest — guaranteeing invariant 4.
  const SLOTS = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const ring = Math.max(Math.abs(c - 1), Math.abs(r - 1)); // 0 centre, 1 rim
      // tie-break radius for a stable spiral-ish ordering
      const rad = (c - 1) * (c - 1) + (r - 1) * (r - 1);
      SLOTS.push({ c, r, ring, rad });
    }
  // order slots: closest to centre first (ring, then radius, then stable c,r)
  SLOTS.sort(
    (a, b) =>
      a.ring - b.ring || a.rad - b.rad || a.r - b.r || a.c - b.c
  );

  // order layers: MOAT first (biggest MOAT first so Energy&Math takes centre),
  // then commodity by descending size (big commodity near rim-inner corners).
  const moat = LAYER_ORDER.filter((L) => MOAT_LAYERS.has(L)).sort(
    (a, b) => blockDims.get(b).n - blockDims.get(a).n
  );
  const commodity = LAYER_ORDER.filter((L) => !MOAT_LAYERS.has(L)).sort(
    (a, b) => blockDims.get(b).n - blockDims.get(a).n
  );
  const layerOrderForSlots = [...moat, ...commodity];

  // map each layer -> a slot (c,r)
  const slotOf = new Map();
  layerOrderForSlots.forEach((L, i) => slotOf.set(L, SLOTS[i]));

  // 4) Resolve the 3x3 lattice into pixel positions.
  //    Column X-extent = max block width in that column; row Y-extent = max
  //    block height in that row. Gutters separate every column and row, so no
  //    two blocks can ever overlap (invariant 2).
  const colW = [0, 0, 0];
  const rowH = [0, 0, 0];
  for (const L of LAYER_ORDER) {
    const s = slotOf.get(L);
    const d = blockDims.get(L);
    if (d.w > colW[s.c]) colW[s.c] = d.w;
    if (d.h > rowH[s.r]) rowH[s.r] = d.h;
  }

  // column X origins (left edge of each macro-column) with gutters between.
  const colX = [];
  {
    let x = O.margin;
    for (let c = 0; c < 3; c++) {
      colX[c] = x;
      x += colW[c] + O.gutter;
    }
  }
  const rowY = [];
  {
    let y = O.margin;
    for (let r = 0; r < 3; r++) {
      rowY[r] = y;
      y += rowH[r] + O.gutter;
    }
  }

  // canvas size: last origin + last extent + margin (gutter already excluded
  // because we add it *between* slots only).
  const canvasW = snap(colX[2] + colW[2] + O.margin, O.grid);
  const canvasH = snap(rowY[2] + rowH[2] + O.margin, O.grid);

  // 5) place each block centred within its macro-cell extent so the bright
  //    MOAT region sits visually centred; snap to grid.
  const blocks = [];
  const blockByLayer = new Map();
  for (const L of LAYER_ORDER) {
    const s = slotOf.get(L);
    const d = blockDims.get(L);
    const cellExtentW = colW[s.c];
    const cellExtentH = rowH[s.r];
    const bx = snap(colX[s.c] + (cellExtentW - d.w) / 2, O.grid);
    const by = snap(rowY[s.r] + (cellExtentH - d.h) / 2, O.grid);
    const block = {
      layer: L,
      x: bx,
      y: by,
      w: d.w,
      h: d.h,
      moat: MOAT_LAYERS.has(L),
      cols: d.cols,
      rows: d.rows,
      labelH: O.labelH,
    };
    blocks.push(block);
    blockByLayer.set(L, block);
  }

  // 6) place the cells inside each block (uniform grid, label strip reserved).
  const cells = {};
  for (const L of LAYER_ORDER) {
    const ids = byLayer.get(L) || [];
    const b = blockByLayer.get(L);
    const d = blockDims.get(L);
    // top-left origin of the cell grid inside the block
    const gx0 = b.x + O.pad + (b.w - 2 * O.pad - d.gridW) / 2; // centre grid horizontally
    const gy0 = b.y + O.labelH + O.pad;
    ids.forEach((id, idx) => {
      const ci = idx % d.cols;
      const ri = Math.floor(idx / d.cols);
      const cx0 = gx0 + ci * cellPitch;
      const cy0 = gy0 + ri * cellPitch;
      cells[id] = {
        x: cx0,
        y: cy0,
        w: O.cell,
        h: O.cell,
        cx: cx0 + O.cell / 2,
        cy: cy0 + O.cell / 2,
        layer: L,
      };
    });
  }

  // 7) routing channels: the vertical/horizontal gutter centre-lines between
  //    macro-columns and macro-rows. K2 routes orthogonal traces through these.
  const vGutters = [];
  for (let c = 0; c < 2; c++) {
    const left = colX[c] + colW[c];
    const right = colX[c + 1];
    vGutters.push(snap((left + right) / 2, O.grid));
  }
  const hGutters = [];
  for (let r = 0; r < 2; r++) {
    const top = rowY[r] + rowH[r];
    const bottom = rowY[r + 1];
    hGutters.push(snap((top + bottom) / 2, O.grid));
  }

  return {
    blocks,
    cells,
    canvas: { w: canvasW, h: canvasH },
    channels: { vGutters, hGutters },
  };
}

export default buildFloorplan;
