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
// GRANULARITY EXPERIMENT (2026-07-26): file-level clustering is degenerate (884
// regions, median 1, 863/884 with <=2 members, 39% of nodes isolated). The
// hypothesis under test is that FILE is the wrong clustering GRANULARITY, not
// that the edges are wrong — so `--granularity=dir1|dir2|dir3|dirleaf` clusters
// DIRECTORY nodes instead, with directory-pair edges AGGREGATED FROM THE SAME
// real dependency edges in edges.json (summed kindWeight*weight over every file
// edge crossing the directory pair). File-level stays the DEFAULT control.
//
// DO NOT CONFUSE THIS WITH THE DELETED FALLBACK. The deleted mechanism used
// directory co-location as an EDGE SOURCE — it INVENTED edges between files that
// merely sat in the same folder, fabricating a 436-member blob of 281 test files.
// This mechanism invents NO edges: every directory-pair edge traces to >=1 real
// dependency edge in edges.json. What it DOES do, honestly stated, is make
// same-directory files share a region by construction (they are one node), which
// is a granularity consequence, not an edge claim.
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

// ---- DIRECTORY GRANULARITY ---------------------------------------------------
// Map a repo-relative file path to its directory key at the requested depth.
//   dir1     -> "_SYSTEM"                       (9 distinct)
//   dir2     -> "_SYSTEM/Scripts"               (79 distinct)
//   dir3     -> "_SYSTEM/Scripts/atlas"         (119 distinct)
//   dirleaf  -> the file's full parent directory (376 distinct)
// A file sitting at the repo root has no directory; it gets the explicit
// "<root>" key rather than being silently dropped or folded into a neighbour.
export const GRANULARITIES = ["file", "dir1", "dir2", "dir3", "dirleaf"];

export function dirKeyForPath(p, granularity) {
  const dir = path.posix.dirname(String(p));
  if (dir === "." || dir === "" || dir === "/") return "<root>";
  if (granularity === "dirleaf") return dir;
  const depth = Number(granularity.slice(3));
  if (!Number.isFinite(depth) || depth < 1) throw new Error(`bad granularity "${granularity}"`);
  return dir.split("/").slice(0, depth).join("/");
}

// Aggregate the file-level edge list up to directory pairs.
// EVERY directory edge traces to >=1 real edges.json edge — nothing is invented.
// Weight = SUM over crossing file edges of kindWeight(kind) * weight, so a
// directory pair wired by 40 imports outranks one wired by a single doc mention.
// (loadArchGraph collapses multi-edges with max-wins, so each dir pair is emitted
// ONCE with its already-summed weight carried through a unique synthetic `type`
// key — the same typeWeight mechanism the file-level path uses.)
export function buildDirGraph(idMap, granularity, opts = {}) {
  const edgesDoc = loadEdgesJson(opts.edgesPath ?? EDGES_PATH);
  const nodeKeys = new Set(Object.keys(idMap.nodes));

  const dirOfNode = new Map();   // canonical file id -> dir key
  const filesInDir = new Map();  // dir key -> [canonical file ids]
  for (const [canon, node] of Object.entries(idMap.nodes)) {
    const key = dirKeyForPath(node.path, granularity);
    dirOfNode.set(canon, key);
    if (!filesInDir.has(key)) filesInDir.set(key, []);
    filesInDir.get(key).push(canon);
  }

  const pairSum = new Map(); // "a b" (a<b) -> summed weight
  const pairEvidence = new Map(); // same key -> count of underlying file edges
  let intraDirEdges = 0, danglingEndpoints = 0, selfLoops = 0;
  for (const e of edgesDoc.edges || []) {
    if (!nodeKeys.has(e.from) || !nodeKeys.has(e.to)) { danglingEndpoints++; continue; }
    if (e.from === e.to) { selfLoops++; continue; }
    const da = dirOfNode.get(e.from), db = dirOfNode.get(e.to);
    if (da === db) { intraDirEdges++; continue; } // collapses into the node itself
    const kindW = EDGE_KIND_WEIGHT[e.kind] ?? DEFAULT_KIND_WEIGHT;
    const w = Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1;
    const key = da < db ? `${da} ${db}` : `${db} ${da}`;
    pairSum.set(key, (pairSum.get(key) || 0) + kindW * w);
    pairEvidence.set(key, (pairEvidence.get(key) || 0) + 1);
  }

  const edges = [];
  const typeWeight = {};
  let ti = 0;
  for (const [key, w] of pairSum) {
    const [a, b] = key.split(" ");
    const type = `diragg:${ti++}`;
    typeWeight[type] = w;
    edges.push({ source: a, target: b, type });
  }

  const nodes = [...filesInDir.keys()].sort().map((key) => ({
    id: key,
    label: key,
    sector: key.split("/").slice(0, 2).join("/") || "root",
  }));

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const dirsWithEdges = [...degree.values()].filter((d) => d > 0).length;

  return {
    graphJson: { nodes, edges },
    typeWeight,
    dirOfNode,
    filesInDir,
    pairEvidence,
    stats: {
      granularity,
      edgesFilePath: opts.edgesPath ?? EDGES_PATH,
      edgesFileTotal: (edgesDoc.edges || []).length,
      edgesUsed: edges.length,                 // distinct DIRECTORY pairs
      edgesIntraDirCollapsed: intraDirEdges,   // real edges absorbed inside a dir node
      edgesSelfLoopsDropped: selfLoops,
      edgesDanglingDropped: danglingEndpoints,
      dirNodesTotal: nodes.length,
      dirNodesWithEdges: dirsWithEdges,
      dirNodesIsolated: nodes.length - dirsWithEdges,
      nodesTotal: Object.keys(idMap.nodes).length,
      directoryFallbackUsed: false, // still false: NO edge is invented from co-location
      directoryEdgeSourceUsed: false, // explicit: co-location is not an edge source here
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
  const granularity = opts.granularity ?? "file";
  if (!GRANULARITIES.includes(granularity)) {
    throw new Error(`atlas-regions: unknown granularity "${granularity}" (known: ${GRANULARITIES.join(", ")})`);
  }
  if (granularity !== "file") return computeRegionsByDirectory(opts, granularity);

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

// ---- directory-granularity region computation ---------------------------------
// Same pipeline shape as the file-level path, one substitution: the graph handed
// to arch-graph-engine has DIRECTORIES as nodes. Regions are then expanded back
// into file members so every downstream consumer (atlas-build, atlas-resolve,
// the evaluator) keeps seeing file-level members and needs no reinterpretation.
function computeRegionsByDirectory(opts, granularity) {
  const idMap = readJson(ID_MAP_PATH);
  const dirG = buildDirGraph(idMap, granularity, { edgesPath: opts.edgesPath });
  const g = loadArchGraph(dirG.graphJson, dirG.typeWeight);
  const cc = connectedComponents(g);
  const tarjan = tarjanArticulationAndBridges(g);

  const k = opts.k ?? 14;
  const spectral = spectralCluster(g, cc.giant.map((i) => g.ids[i]), { k, seed: opts.seed ?? 1 });

  // group DIRECTORY ids into clusters, exactly as the file path groups file ids
  const byCluster = new Map();
  for (const dirId of Object.keys(spectral.clusters)) {
    const cl = spectral.clusters[dirId];
    const key = `giant-${cl === null ? "degenerate" : cl}`;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key).push(dirId);
  }
  let islandIdx = 0;
  for (const comp of cc.componentsAsIds.slice(1)) byCluster.set(`island-${islandIdx++}`, comp);

  // FILE-level graph, used ONLY for hub selection + inter-region neighbour weight,
  // so hubs stay real files ranked by real file-level degree (a directory has no
  // meaningful "hub file" otherwise).
  const fileGraph = buildEdgeGraph(idMap, { edgesPath: opts.edgesPath });
  const fg = loadArchGraph(fileGraph.graphJson, fileGraph.typeWeight);
  const fileArt = new Set(tarjanArticulationAndBridges(fg).articulationPoints);

  const regions = [];
  for (const [clusterKey, dirMembers] of byCluster) {
    const members = [];
    for (const d of dirMembers) members.push(...(dirG.filesInDir.get(d) || []));
    if (members.length === 0) continue;
    members.sort();
    regions.push({
      clusterKey,
      members,
      dirMembers: dirMembers.slice().sort(),
      hub: pickHub(members, fg, fileArt),
      size: members.length,
    });
  }
  regions.sort((a, b) => b.size - a.size);

  const regionOf = new Map();
  regions.forEach((r, ri) => r.members.forEach((m) => regionOf.set(m, ri)));
  const neighborWeight = new Map();
  for (const e of fg.edges) {
    const ra = regionOf.get(fg.ids[e.a]), rb = regionOf.get(fg.ids[e.b]);
    if (ra === undefined || rb === undefined || ra === rb) continue;
    const key = Math.min(ra, rb) + "|" + Math.max(ra, rb);
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

  const gitnexus = loadGitNexusCommunities();
  return {
    granularity,
    idMapCounts: idMap.counts,
    edgeStats: dirG.stats,
    graphSummary: {
      granularity,
      nodes: fg.n,                 // FILE nodes covered (regions partition these)
      dirNodes: g.n,               // clustered directory nodes
      simpleEdges: g.simpleEdgeCount,
      components: cc.count,
      giantSize: cc.giant.length,
      isolatedInGraph: cc.isolated.length, // isolated DIRECTORIES, not files
      articulationPoints: tarjan.articulationPoints.length,
      bridges: tarjan.bridges.length,
      k,
      lambda2_fiedler: spectral.fiedler,
    },
    gitnexus: gitnexus.available
      ? { available: true, agreement: null }
      : { available: false, reason: gitnexus.reason, agreement: null },
    regions,
    g: fg,
    spectral,
  };
}

// ---- CLI ---------------------------------------------------------------------
function printHelp() {
  console.log(`atlas-regions.mjs — cluster canonical IDs into regions (spectral clustering via arch-graph-engine)

Usage:
  node _SYSTEM/Scripts/atlas/atlas-regions.mjs [--k=N] [--granularity=G] [--edges=PATH] [--json] [--verbose] [--test] [--help]

Options:
  --k=N        number of clusters (default 14, matches arch-graph-metrics.json k_clusters)
  --granularity=G  what gets clustered: file (default, control) | dir1 | dir2 | dir3 | dirleaf.
               dir* clusters DIRECTORY nodes whose edges are aggregated from the SAME real
               edges.json dependency edges (no co-location edge is ever invented); regions are
               expanded back to file members before output.
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

  // ---- directory granularity (the 2026-07-26 experiment) ----------------------
  check("dirKeyForPath depth-1", dirKeyForPath("_SYSTEM/Scripts/atlas/x.mjs", "dir1") === "_SYSTEM");
  check("dirKeyForPath depth-2", dirKeyForPath("_SYSTEM/Scripts/atlas/x.mjs", "dir2") === "_SYSTEM/Scripts");
  check("dirKeyForPath depth-3", dirKeyForPath("_SYSTEM/Scripts/atlas/x.mjs", "dir3") === "_SYSTEM/Scripts/atlas");
  check("dirKeyForPath leaf", dirKeyForPath("_SYSTEM/Scripts/atlas/x.mjs", "dirleaf") === "_SYSTEM/Scripts/atlas");
  check("dirKeyForPath root file gets explicit <root> key", dirKeyForPath("CLAUDE.md", "dir2") === "<root>");
  check("depth deeper than the path does not fabricate segments", dirKeyForPath("_SYSTEM/x.mjs", "dir3") === "_SYSTEM");

  check("unknown granularity is rejected loudly", (() => {
    try { computeRegions({ granularity: "dir9000" }); return false; } catch { return true; }
  })());

  const dirGraph = buildDirGraph(idMap, "dir2");
  // THE ANTI-REGRESSION THAT MATTERS: no directory edge may exist without a real
  // edges.json edge behind it. If co-location ever leaks back in as an edge
  // source, some dir pair will have zero underlying file edges.
  check("every directory edge is backed by >=1 real edges.json edge (no fabricated co-location edge)",
    [...dirGraph.pairEvidence.values()].every((c) => c >= 1) &&
    dirGraph.pairEvidence.size === dirGraph.graphJson.edges.length);
  check("directory edge count never exceeds the real file edge count",
    dirGraph.stats.edgesUsed <= dirGraph.stats.edgesFileTotal);
  check("no co-location edge source is used at directory granularity",
    dirGraph.stats.directoryEdgeSourceUsed === false && dirGraph.stats.directoryFallbackUsed === false);
  check("every file lands in exactly one directory node",
    [...dirGraph.filesInDir.values()].reduce((a, l) => a + l.length, 0) === Object.keys(idMap.nodes).length);

  for (const gran of ["dir1", "dir2", "dir3", "dirleaf"]) {
    const r = computeRegions({ k: 14, granularity: gran });
    const total = r.regions.reduce((a, x) => a + x.size, 0);
    check(`${gran}: regions still partition ALL ${Object.keys(idMap.nodes).length} file nodes exactly once`,
      total === Object.keys(idMap.nodes).length &&
      new Set(r.regions.flatMap((x) => x.members)).size === total);
    check(`${gran}: every region has a real file hub`, r.regions.every((x) => typeof x.hub === "string"));
  }

  // file-level must remain the untouched CONTROL
  const controlSizes = computeRegions({ k: 14 }).regions.map((r) => r.size).join(",");
  check("default granularity is still file-level (control condition preserved)",
    controlSizes === result.regions.map((r) => r.size).join(","));

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
  const granArg = args.find((a) => a.startsWith("--granularity="));
  const granularity = granArg ? granArg.slice(14) : "file";
  const verbose = args.includes("--verbose");
  const asJson = args.includes("--json");

  let result;
  try {
    result = computeRegions({ k, edgesPath, granularity });
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
