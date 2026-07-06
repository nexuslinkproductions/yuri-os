// K1 self-test — loads the REAL circuitry graph, runs buildFloorplan,
// asserts the 5 invariants. Prints PASS/FAIL lines. Run with: node K1-floorplan.test.mjs
import { readFileSync } from "node:fs";
import { buildFloorplan } from "./K1-floorplan.mjs";

const GRAPH_PATH =
  "/Users/marcelspatz/YURI-OS-MUSUBI/02_RESOURCES/RESEARCH/yuri-circuitry-graph.json";

const g = JSON.parse(readFileSync(GRAPH_PATH, "utf8"));
const nodes = g.nodes;

const MOAT_LAYERS = new Set([
  "Energy & Math",
  "Cognition & Persona",
  "Memory & Subconscious",
]);

const fp = buildFloorplan(nodes);

let pass = 0;
let fail = 0;
const log = (ok, msg, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS ${msg}`);
  } else {
    fail++;
    console.log(`FAIL ${msg}${detail ? "  :: " + detail : ""}`);
  }
};

// rect overlap test (strict — touching at a gutter edge is NOT overlap)
function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// --- INVARIANT 1: every one of the 83 node ids appears exactly once in cells.
{
  const ids = nodes.map((n) => n.id);
  const cellIds = Object.keys(fp.cells);
  const uniqueGraphIds = new Set(ids);
  const missing = ids.filter((id) => !(id in fp.cells));
  const extra = cellIds.filter((id) => !uniqueGraphIds.has(id));
  // exactly-once: cellIds length === graph ids length, set equality, no dup keys possible in object
  const ok =
    cellIds.length === ids.length &&
    missing.length === 0 &&
    extra.length === 0 &&
    uniqueGraphIds.size === ids.length;
  log(
    ok,
    `INV1 all ${ids.length} node ids appear exactly once in cells (got ${cellIds.length})`,
    missing.length ? `missing=${missing.slice(0, 5)}` : extra.length ? `extra=${extra.slice(0, 5)}` : ""
  );
}

// --- INVARIANT 2: no two BLOCK rects overlap (gutter between all pairs).
{
  let bad = null;
  const bl = fp.blocks;
  for (let i = 0; i < bl.length && !bad; i++)
    for (let j = i + 1; j < bl.length; j++) {
      if (overlap(bl[i], bl[j])) {
        bad = `${bl[i].layer} <> ${bl[j].layer}`;
        break;
      }
    }
  log(bad === null, `INV2 no two block rects overlap (${bl.length} blocks)`, bad || "");
}

// --- INVARIANT 3: every cell sits fully inside its block's rect (minus labelH).
{
  const blockByLayer = new Map(fp.blocks.map((b) => [b.layer, b]));
  let bad = null;
  for (const [id, c] of Object.entries(fp.cells)) {
    const b = blockByLayer.get(c.layer);
    if (!b) {
      bad = `${id} has no block for layer ${c.layer}`;
      break;
    }
    const innerTop = b.y + b.labelH;
    const inside =
      c.x >= b.x &&
      c.y >= innerTop &&
      c.x + c.w <= b.x + b.w &&
      c.y + c.h <= b.y + b.h;
    if (!inside) {
      bad = `cell ${id} outside block ${c.layer} (cell ${c.x},${c.y},${c.w},${c.h} vs block ${b.x},${b.y},${b.w},${b.h} label ${b.labelH})`;
      break;
    }
  }
  log(bad === null, `INV3 every cell fully inside its block (below label strip)`, bad || "");
}

// --- INVARIANT 4: moat centroids closer to canvas centre than mean commodity centroid.
{
  const cx = fp.canvas.w / 2;
  const cy = fp.canvas.h / 2;
  const dist = (b) => {
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    return Math.hypot(bx - cx, by - cy);
  };
  const moat = fp.blocks.filter((b) => MOAT_LAYERS.has(b.layer));
  const commodity = fp.blocks.filter((b) => !MOAT_LAYERS.has(b.layer));
  const meanMoat = moat.reduce((s, b) => s + dist(b), 0) / moat.length;
  const meanCommodity =
    commodity.reduce((s, b) => s + dist(b), 0) / commodity.length;
  log(
    meanMoat < meanCommodity,
    `INV4 moat centroids closer to centre than commodity (moat=${meanMoat.toFixed(1)} < commodity=${meanCommodity.toFixed(1)})`
  );
}

// --- INVARIANT 5: canvas.w/h bound all blocks (and all cells).
{
  let bad = null;
  for (const b of fp.blocks) {
    if (b.x < 0 || b.y < 0 || b.x + b.w > fp.canvas.w || b.y + b.h > fp.canvas.h) {
      bad = `block ${b.layer} exceeds canvas (${b.x},${b.y},${b.w},${b.h} vs ${fp.canvas.w}x${fp.canvas.h})`;
      break;
    }
  }
  if (!bad) {
    for (const [id, c] of Object.entries(fp.cells)) {
      if (c.x < 0 || c.y < 0 || c.x + c.w > fp.canvas.w || c.y + c.h > fp.canvas.h) {
        bad = `cell ${id} exceeds canvas`;
        break;
      }
    }
  }
  log(bad === null, `INV5 canvas bounds all blocks and cells (${fp.canvas.w}x${fp.canvas.h})`, bad || "");
}

// --- extra sanity: channels exposed
{
  const ok =
    Array.isArray(fp.channels.vGutters) &&
    Array.isArray(fp.channels.hGutters) &&
    fp.channels.vGutters.length === 2 &&
    fp.channels.hGutters.length === 2;
  log(ok, `INV6 routing channels exposed (v=${fp.channels.vGutters.length}, h=${fp.channels.hGutters.length})`);
}

// --- determinism: same input -> byte-identical output
{
  const a = JSON.stringify(buildFloorplan(nodes));
  const b = JSON.stringify(buildFloorplan(nodes));
  log(a === b, `INV7 deterministic (two runs byte-identical)`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} K1 floorplan: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
