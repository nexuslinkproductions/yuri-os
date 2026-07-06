import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTierFloorplan } from "./K1D-tiers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(HERE, "..", "yuri-die-graph.json");   // the die renders the full unified system (244 nodes)
const graph = JSON.parse(readFileSync(GRAPH, "utf8"));

const nodes = graph.nodes ?? [];
const edges = graph.edges ?? [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const nodeIds = new Set(nodeById.keys());
const graphEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);
const floor = buildTierFloorplan(nodes, graphEdges, { cellBase: 120 });

let failures = 0;
function ok(cond, label, detail = "") {
  if (cond) console.log(`PASS ${label}${detail ? " | " + detail : ""}`);
  else {
    console.log(`FAIL ${label}${detail ? " | " + detail : ""}`);
    failures++;
  }
}

function finiteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function overlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { ox, oy };
}

console.log("YURI circuitry adversarial check -- K1D live die");
console.log(`nodes=${nodes.length} graphEdges=${graphEdges.length} blocks=${floor.blocks.length} canvas=${floor.canvas.w}x${floor.canvas.h}`);

const cellIds = new Set(Object.keys(floor.cells));
const missingCells = [...nodeIds].filter((id) => !cellIds.has(id));
const extraCells = [...cellIds].filter((id) => !nodeIds.has(id));
ok(missingCells.length === 0, "every graph node has a floorplan cell", missingCells.slice(0, 8).join(", "));
ok(extraCells.length === 0, "floorplan has no non-graph cells", extraCells.slice(0, 8).join(", "));
ok(cellIds.size === nodes.length, "cell count equals graph node count", `cells=${cellIds.size} nodes=${nodes.length}`);

const invalidCells = [];
const layerMismatches = [];
const invalidBands = [];
for (const [id, cell] of Object.entries(floor.cells)) {
  const node = nodeById.get(id);
  const fields = ["x", "y", "w", "h", "cx", "cy", "band", "tier", "ang", "r"];
  if (!fields.every((field) => finiteNumber(cell[field]))) invalidCells.push(id);
  if (cell.w <= 0 || cell.h <= 0) invalidCells.push(id);
  if (node && cell.layer !== node.layer) layerMismatches.push(`${id}:${cell.layer}->${node.layer}`);
  if (!Number.isInteger(cell.band) || !Number.isInteger(cell.tier) || cell.band !== cell.tier) invalidBands.push(id);
}
ok(invalidCells.length === 0, "all cells have finite positive geometry", invalidCells.slice(0, 8).join(", "));
ok(layerMismatches.length === 0, "cell layers match graph node layers", layerMismatches.slice(0, 8).join(", "));
ok(invalidBands.length === 0, "cell band/tier fields are executable", invalidBands.slice(0, 8).join(", "));

const graphLayers = new Set(nodes.map((n) => n.layer));
const blockLayers = new Set(floor.blocks.map((b) => b.layer.replace(/ · CORE$/, "")));
const missingLayerBlocks = [...graphLayers].filter((layer) => !blockLayers.has(layer));
ok(missingLayerBlocks.length === 0, "every graph layer has a visible die block", missingLayerBlocks.join(", "));
ok(floor.blocks.some((b) => b.core && b.layer === "Energy & Math · CORE"), "energy core block is explicit");

const badBlocks = floor.blocks.filter((b) =>
  !Number.isInteger(b.band) ||
  !Number.isInteger(b.tier) ||
  !finiteNumber(b.rIn) ||
  !finiteNumber(b.rOut) ||
  b.rOut <= b.rIn ||
  !b.accent
);
ok(badBlocks.length === 0, "all blocks carry valid K1D band geometry", badBlocks.map((b) => b.layer).join(", "));

const orderedBands = floor.bands.slice().sort((a, b) => a.tier - b.tier);
const bandOrderValid = orderedBands.every((b, i) =>
  b.tier === i &&
  finiteNumber(b.rIn) &&
  finiteNumber(b.rOut) &&
  b.rOut >= b.rIn &&
  (i === 0 || b.rIn > orderedBands[i - 1].rOut)
);
ok(bandOrderValid, "bands are ordered with real radial gaps");

const energyFn = floor.cells["energy-fn"];
ok(
  !!energyFn && Math.hypot(energyFn.cx - floor.center.x, energyFn.cy - floor.center.y) < 1e-6,
  "energy-fn is the centered core hub"
);

const unresolvedEdges = graphEdges.filter((e) => !floor.cells[e.from] || !floor.cells[e.to]);
ok(unresolvedEdges.length === 0, "every graph edge resolves to two rendered cells", unresolvedEdges.slice(0, 8).map((e) => `${e.from}->${e.to}`).join(", "));

const cellEntries = Object.entries(floor.cells);
const overlaps = [];
for (let i = 0; i < cellEntries.length; i++) {
  for (let j = i + 1; j < cellEntries.length; j++) {
    const [aId, a] = cellEntries[i];
    const [bId, b] = cellEntries[j];
    const { ox, oy } = overlap(a, b);
    if (ox > 1 && oy > 1) overlaps.push(`${aId}<->${bId} (${ox.toFixed(1)}x${oy.toFixed(1)})`);
  }
}
ok(overlaps.length === 0, "no package bounding-box overlaps", overlaps.slice(0, 8).join("; "));

const liveSystemLayer = floor.blocks.find((b) => b.layer === "Self-Improvement");
// Assert PLACEMENT (rides the SYSTEMS band, tier 2), not a frozen node count — the die renders the whole
// unified system, so a layer's cell count grows with the graph; pinning n would be stale on every regen.
ok(!!liveSystemLayer && liveSystemLayer.band === 2 && liveSystemLayer.n >= 1, "Self-Improvement layer rides the SYSTEMS band", liveSystemLayer ? `band=${liveSystemLayer.band} n=${liveSystemLayer.n}` : "");

console.log(`\n${failures === 0 ? "PASS K1D-CIRCUITRY-ADVERSARY-CLEAN" : `FAIL ${failures}-CHECKS-FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
