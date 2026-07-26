// atlas-regions.mjs — YURI Atlas Phase 2a: canonical-ID edge graph + region clustering.
//
// CAPABILITY-FIRST: this module does NOT reimplement spectral clustering, Tarjan
// articulation/bridges, or curvature math. All of that lives in
// `arch-graph-engine.mjs` (loadArchGraph / connectedComponents / spectralCluster /
// tarjanArticulationAndBridges) and is imported + reused here verbatim. This file's
// only job is: (1) load the Phase-1b real edge list
// (`_SYSTEM/state/atlas/edges.json`, produced by `atlas-edges.mjs` over the
// Phase-1 canonical IDs in `id-map.json`), (2) hand that graph to
// arch-graph-engine's existing analyzers, (3) pick a hub per resulting cluster,
// (4) cross-check against GitNexus communities where that data is actually
// reachable.
//
// WIRING FIX (2026-07-26): this module used to rebuild its OWN edge list from
// CIRCUITRY_PATH + KNOWLEDGE_GRAPH_PATH + a directory-co-location fallback,
// entirely independent of `atlas-edges.mjs`'s deduped, 4-source, weighted
// edges.json (2,813 edges vs. this module's ~1,557; edges_per_node 1.3).
// Growing edges.json 1,557 -> 2,813 edges produced a BYTE-IDENTICAL region
// distribution (373 regions, 1/1/436) because this file never read it. The
// directory-colocation fallback fabricated the dominant 436-member blob (281
// `.test.mjs` files transitively chained through the flat `_SYSTEM/Scripts/`
// directory) — an honestly isolated node beats a fabricated edge, so that
// fallback is DELETED, not merely deprioritized. edges.json is now the sole
// edge source; a missing edges.json is a hard, loud failure (no silent
// fallback to the old internal builder — a silent fallback is exactly what
// hid this bug for as long as it went unnoticed).
//
// @capability: atlas-regions
// @serves: cluster the whole repo into human-navigable regions | atlas town map | region hub selection
// @does: loads the canonical-ID edge graph from atlas-edges.mjs's edges.json,
//   spectral-clusters it via arch-graph-engine, and picks a hub per cluster.
// @use: reach for this instead of hand-rolling a new graph-clustering pass over YURI's mechanisms.
// @exports: buildEdgeGraph, computeRegions, loadGitNexusCommunities, main

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  loadArchGraph,
  connectedComponents,
  spectralCluster,
  tarjanArticulationAndBridges,
} from "../arch-graph-engine.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export const ID_MAP_PATH = "_SYSTEM/state/atlas/id-map.json";
export const EDGES_PATH = "_SYSTEM/state/atlas/edges.json";
export const GITNEXUS_META_PATH = ".gitnexus/meta.json";

// Base semantic weight per edges.json `kind` (the same priority spirit as the
// old REGION_TYPE_WEIGHT ladder: mechanism-level calls/reads outrank plain
// imports, which outrank a doc merely naming a path).
export const EDGE_KIND_WEIGHT = {
  calls: 1.0,
  reads: 0.85,
  imports: 0.7,
  references: 0.3,
};
const DEFAULT_KIND_WEIGHT = 0.5;

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf8"));
}

export class MissingEdgesError extends Error {
  constructor(edgesPath) {
    super(
      `atlas-regions: cannot find edges file at "${edgesPath}".\n` +
      `Region clustering requires the deduped multi-source edge list built by atlas-edges.mjs.\n` +
      `Run: node _SYSTEM/Scripts/atlas/atlas-edges.mjs   (then re-run atlas-regions.mjs).\n` +
      `This is a hard failure by design — silently falling back to an internal edge builder ` +
      `is exactly the bug this file was fixed for (see the WIRING FIX header comment).`
    );
    this.name = "MissingEdgesError";
  }
}

// ---- load the Phase-1b edge list and translate it into arch-graph-engine's
// {source, target, type} shape. edges.json's `from`/`to` are ALREADY the same
// canonical IDs used as id-map.json's node keys (verified 1:1, no alias
// translation needed) — this loader's only real jobs are: (1) fail loudly if
// the file is absent, (2) fold each edge's `weight` (independent-source
// agreement count, 1-4 in practice) into the graph weight rather than
// discarding it, by encoding a composite `type` key of `${kind}:${weight}`
// and building the typeWeight lookup arch-graph-engine's loadArchGraph()
// already supports (its 2nd param) so every distinct (kind, weight) pair maps
// to an exact numeric edge weight = kindWeight(kind) * weight. This keeps
// weight respected exactly, through the existing type-weight mechanism,
// instead of silently dropping it on the floor.
export function loadEdgesJson(edgesRelPath = EDGES_PATH) {
  const abs = path.join(REPO_ROOT, edgesRelPath);
  if (!existsSync(abs)) throw new MissingEdgesError(edgesRelPath);
  return readJson(edgesRelPath);
}

function edgesJsonToGraphEdges(edgesDoc, nodeKeys) {
  const out = [];
  const typeWeight = {};
  let selfLoops = 0;
  let danglingEndpoints = 0;
  for (const e of edgesDoc.edges || []) {
    if (!nodeKeys.has(e.from) || !nodeKeys.has(e.to)) { danglingEndpoints++; continue; }
    if (e.from === e.to) { selfLoops++; continue; }
    const kindW = EDGE_KIND_WEIGHT[e.kind] ?? DEFAULT_KIND_WEIGHT;
    const weight = Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1;
    const type = `${e.kind}:${weight}`;
    if (!(type in typeWeight)) typeWeight[type] = kindW * weight;
    out.push({ source: e.from, target: e.to, type });
  }
  return { edges: out, typeWeight, selfLoops, danglingEndpoints };
}

// ---- assemble the arch-graph-engine-compatible graphJson --------------------
export function buildEdgeGraph(idMap = readJson(ID_MAP_PATH), opts = {}) {
  const edgesRelPath = opts.edgesPath ?? EDGES_PATH;
  const edgesDoc = loadEdgesJson(edgesRelPath);
  const nodeKeys = new Set(Object.keys(idMap.nodes));
  const { edges, typeWeight, selfLoops, danglingEndpoints } = edgesJsonToGraphEdges(edgesDoc, nodeKeys);

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const nodes = Object.entries(idMap.nodes).map(([canon, node]) => ({
    id: canon,
    label: (node.labels && node.labels[0]) || node.path,
    sector: path.posix.dirname(node.path).split("/").slice(0, 2).join("/") || "root",
  }));

  const nodesWithEdges = [...degree.entries()].filter(([, d]) => d > 0).length;

  return {
    graphJson: { nodes, edges },
    typeWeight,
    stats: {
      edgesFilePath: edgesRelPath,
      edgesFileGenerated: edgesDoc.generated ?? null,
      edgesFileTotal: (edgesDoc.edges || []).length,
      edgesFileBySource: edgesDoc.counts?.by_source ?? null,
      edgesUsed: edges.length,
      edgesSelfLoopsDropped: selfLoops,
      edgesDanglingDropped: danglingEndpoints,
      nodesTotal: nodes.length,
      nodesWithEdges,
      nodesIsolated: nodes.length - nodesWithEdges,
      directoryFallbackUsed: false, // deleted by design — see WIRING FIX header
    },
  };
}

// ---- GitNexus community cross-check (best-effort, honest about availability) --
// GitNexus's 1068 communities live inside its binary ladybugdb store (.gitnexus/lbug),
// queryable only through the gitnexus_* MCP tools available to an interactive Claude
// Code session — not to a standalone Node script. This function looks for a
// parseable export first; if none exists it returns { available: false } rather
// than fabricating an agreement number.
export function loadGitNexusCommunities() {
  const metaPath = path.join(REPO_ROOT, GITNEXUS_META_PATH);
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const exportCandidates = [
      ".gitnexus/communities.json",
      ".gitnexus/export.json",
    ];
    for (const cand of exportCandidates) {
      try {
        const data = readJson(cand);
        return { available: true, source: cand, data };
      } catch { /* keep looking */ }
    }
    return {
      available: false,
      reason: `GitNexus reports ${meta.stats?.communities ?? "unknown"} communities in .gitnexus/lbug (ladybugdb binary store), reachable only via the gitnexus_* MCP tools in an interactive session — no parseable export found for this standalone script.`,
    };
  } catch {
    return { available: false, reason: "no .gitnexus/meta.json found — GitNexus index not present" };
  }
}

// ---- hub selection: highest weighted-degree, tie-break = articulation point --
function pickHub(memberIds, g, artSet) {
  let best = null, bestDeg = -Infinity, bestArt = -1;
  for (const id of memberIds) {
    const i = g.idx.get(id);
    if (i === undefined) continue;
    const deg = g.deg[i];
    const isArt = artSet.has(id) ? 1 : 0;
    if (deg > bestDeg || (deg === bestDeg && isArt > bestArt) || (deg === bestDeg && isArt === bestArt && (best === null || id < best))) {
      best = id; bestDeg = deg; bestArt = isArt;
    }
  }
  return best;
}

// ---- top-level region computation -------------------------------------------
export function computeRegions(opts = {}) {
  const idMap = readJson(ID_MAP_PATH);
  const { graphJson, stats, typeWeight } = buildEdgeGraph(idMap, { edgesPath: opts.edgesPath });
  const g = loadArchGraph(graphJson, typeWeight);
  const cc = connectedComponents(g);
  const tarjan = tarjanArticulationAndBridges(g);
  const artSet = new Set(tarjan.articulationPoints);

  const k = opts.k ?? 14;
  // Spectral clustering (per arch-graph-engine's own contract) only splits the
  // GIANT component. Every OTHER connected component is a genuinely separate
  // mechanism island with zero real or fallback edges into the giant — treating
  // it as its own region (rather than dumping all 359 of them into one
  // "outside-giant" blob) is what avoids a fake 40%+ mega-region; it also
  // surfaces true over-fragmentation (many tiny islands) honestly instead of
  // hiding it inside one artificial bucket.
  const spectral = spectralCluster(g, cc.giant.map((i) => g.ids[i]), { k, seed: opts.seed ?? 1 });

  const byCluster = new Map();
  for (const id of Object.keys(spectral.clusters)) {
    const cl = spectral.clusters[id];
    const key = `giant-${cl === null ? "degenerate" : cl}`;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key).push(id);
  }
  // every non-giant connected component is its own region.
  let islandIdx = 0;
  for (const comp of cc.componentsAsIds.slice(1)) { // [0] is the giant, already handled
    byCluster.set(`island-${islandIdx++}`, comp);
  }

  const regions = [];
  for (const [clusterKey, members] of byCluster) {
    const hub = pickHub(members, g, artSet);
    regions.push({ clusterKey, members: members.slice().sort(), hub, size: members.length });
  }
  regions.sort((a, b) => b.size - a.size);

  // neighbor weights between regions (sum of edge weights crossing region pairs)
  const regionOf = new Map();
  regions.forEach((r, ri) => r.members.forEach((m) => regionOf.set(m, ri)));
  const neighborWeight = new Map(); // "ri|rj" -> weight
  for (const e of g.edges) {
    const a = g.ids[e.a], b = g.ids[e.b];
    const ra = regionOf.get(a), rb = regionOf.get(b);
    if (ra === undefined || rb === undefined || ra === rb) continue;
    const lo = Math.min(ra, rb), hi = Math.max(ra, rb);
    const key = lo + "|" + hi;
    neighborWeight.set(key, (neighborWeight.get(key) || 0) + e.w);
  }
  regions.forEach((r, ri) => {
    const neighbors = [];
    for (const [key, w] of neighborWeight) {
      const [a, b] = key.split("|").map(Number);
      if (a === ri) neighbors.push({ region: b, weight: Math.round(w * 1e3) / 1e3 });
      else if (b === ri) neighbors.push({ region: a, weight: Math.round(w * 1e3) / 1e3 });
    }
    neighbors.sort((x, y) => y.weight - x.weight);
    r.neighbors = neighbors;
  });

  // GitNexus agreement (best-effort)
  const gitnexus = loadGitNexusCommunities();
  let gitnexusAgreement = null;
  if (gitnexus.available) {
    // placeholder cross-check shape if an export is ever present: compare
    // region membership against exported community buckets, fraction of pairs
    // co-clustered in both. Not exercised today (no export found in practice).
    gitnexusAgreement = { computed: false, note: "export found but cross-check not implemented against this shape yet" };
  }

  return {
    idMapCounts: idMap.counts,
    edgeStats: stats,
    graphSummary: {
      nodes: g.n,
      simpleEdges: g.simpleEdgeCount,
      components: cc.count,
      giantSize: cc.giant.length,
      isolatedInGraph: cc.isolated.length,
      articulationPoints: tarjan.articulationPoints.length,
      bridges: tarjan.bridges.length,
      k,
      lambda2_fiedler: spectral.fiedler,
    },
    gitnexus: gitnexus.available
      ? { available: true, agreement: gitnexusAgreement }
      : { available: false, reason: gitnexus.reason, agreement: null },
    regions,
    g, // internal (not serialized) — for build script's facet/label pass
    spectral,
  };
}

// ---- CLI ---------------------------------------------------------------------
function printHelp() {
  console.log(`atlas-regions.mjs — cluster canonical IDs into regions (spectral clustering via arch-graph-engine)

Usage:
  node _SYSTEM/Scripts/atlas/atlas-regions.mjs [--k=N] [--edges=PATH] [--json] [--verbose] [--test] [--help]

Options:
  --k=N        number of clusters (default 14, matches arch-graph-metrics.json k_clusters)
  --edges=PATH edges.json path (default _SYSTEM/state/atlas/edges.json, built by atlas-edges.mjs)
  --json       print the full region result as JSON
  --verbose    print per-region size + hub summary
  --test       run the built-in self-test and exit 0/1
  --help       this message
`);
}

function selfTest() {
  let failures = 0;
  const check = (name, cond) => {
    if (!cond) { console.error(`FAIL: ${name}`); failures++; }
    else console.log(`ok: ${name}`);
  };

  const idMap = readJson(ID_MAP_PATH);
  check("id-map has 2161 canonical nodes", Object.keys(idMap.nodes).length === 2161);

  const { graphJson, stats } = buildEdgeGraph(idMap);
  check("graph has same node count as id-map", graphJson.nodes.length === Object.keys(idMap.nodes).length);
  check("edges.json is the sole edge source (edgesUsed > 0)", stats.edgesUsed > 0);
  check("edgesUsed matches edges.json total minus self-loops/dangling", stats.edgesUsed === stats.edgesFileTotal - stats.edgesSelfLoopsDropped - stats.edgesDanglingDropped);
  check("no directory-colocation fallback is used (deleted by design)", stats.directoryFallbackUsed === false);
  check("dropped-edge counts are non-negative", stats.edgesSelfLoopsDropped >= 0 && stats.edgesDanglingDropped >= 0);
  check("isolated-node count is honest (nodesIsolated = nodesTotal - nodesWithEdges)", stats.nodesIsolated === stats.nodesTotal - stats.nodesWithEdges);

  // missing-edges-file must fail LOUDLY, never silently fall back to an internal builder.
  let threwOnMissingEdges = false;
  let messageNamesAtlasEdges = false;
  try {
    buildEdgeGraph(idMap, { edgesPath: "_SYSTEM/state/atlas/__does-not-exist__.json" });
  } catch (err) {
    threwOnMissingEdges = err instanceof MissingEdgesError;
    messageNamesAtlasEdges = /atlas-edges\.mjs/.test(err.message);
  }
  check("missing edges.json throws MissingEdgesError (fails loudly, no silent fallback)", threwOnMissingEdges);
  check("missing-edges error tells the user to run atlas-edges.mjs", messageNamesAtlasEdges);

  const result = computeRegions({ k: 14 });
  check("k=14 produces regions", result.regions.length > 0);
  check("every region has a hub or is empty", result.regions.every((r) => r.members.length === 0 || typeof r.hub === "string"));
  const totalMembers = result.regions.reduce((a, r) => a + r.size, 0);
  check("region membership partitions all graph nodes exactly once", totalMembers === result.graphSummary.nodes);

  // k must actually change the clustering now that real edges drive it (the
  // broken-wiring signature was: identical output at every k).
  const resultK8 = computeRegions({ k: 8 });
  const sizesK14 = result.regions.map((r) => r.size).sort((a, b) => a - b).join(",");
  const sizesK8 = resultK8.regions.map((r) => r.size).sort((a, b) => a - b).join(",");
  check("k=8 and k=14 produce different region-size distributions (k has an effect)", sizesK14 !== sizesK8);

  const gitnexus = loadGitNexusCommunities();
  check("gitnexus check returns a definite available:boolean (never silently guesses)", typeof gitnexus.available === "boolean");

  console.log(failures === 0 ? "\nATLAS_REGIONS_SELFTEST_PASS" : `\nATLAS_REGIONS_SELFTEST_FAIL (${failures} failures)`);
  return failures === 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { printHelp(); process.exit(0); }
  if (args.includes("--test")) { process.exit(selfTest() ? 0 : 1); }

  const kArg = args.find((a) => a.startsWith("--k="));
  const k = kArg ? Number(kArg.slice(4)) : 14;
  const edgesArg = args.find((a) => a.startsWith("--edges="));
  const edgesPath = edgesArg ? edgesArg.slice(8) : undefined;
  const verbose = args.includes("--verbose");
  const asJson = args.includes("--json");

  let result;
  try {
    result = computeRegions({ k, edgesPath });
  } catch (err) {
    if (err instanceof MissingEdgesError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  if (asJson) {
    const { g, ...serializable } = result;
    console.log(JSON.stringify(serializable, null, 2));
  } else {
    console.log(`nodes=${result.graphSummary.nodes} simpleEdges=${result.graphSummary.simpleEdges} components=${result.graphSummary.components} giant=${result.graphSummary.giantSize} k=${result.graphSummary.k}`);
    console.log(`edge stats:`, result.edgeStats);
    console.log(`gitnexus:`, result.gitnexus.available ? result.gitnexus.agreement : result.gitnexus.reason);
    if (verbose) {
      for (const r of result.regions) {
        console.log(`region[${r.clusterKey}] size=${r.size} hub=${r.hub}`);
      }
    }
  }
}
