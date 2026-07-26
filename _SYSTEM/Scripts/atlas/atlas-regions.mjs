// atlas-regions.mjs — YURI Atlas Phase 2a: canonical-ID edge graph + region clustering.
//
// CAPABILITY-FIRST: this module does NOT reimplement spectral clustering, Tarjan
// articulation/bridges, or curvature math. All of that lives in
// `arch-graph-engine.mjs` (loadArchGraph / connectedComponents / spectralCluster /
// tarjanArticulationAndBridges) and is imported + reused here verbatim. This file's
// only job is: (1) build an edge list over Phase-1 canonical IDs
// (`_SYSTEM/state/atlas/id-map.json`), (2) hand that graph to arch-graph-engine's
// existing analyzers, (3) pick a hub per resulting cluster, (4) cross-check against
// GitNexus communities where that data is actually reachable.
//
// @capability: atlas-regions
// @serves: cluster the whole repo into human-navigable regions | atlas town map | region hub selection
// @does: builds a canonical-ID edge graph (circuitry + knowledge-graph + directory-colocation fallback),
//   spectral-clusters it via arch-graph-engine, and picks a hub per cluster.
// @use: reach for this instead of hand-rolling a new graph-clustering pass over YURI's mechanisms.
// @exports: buildEdgeGraph, computeRegions, loadGitNexusCommunities, main

import { readFileSync } from "node:fs";
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
export const CIRCUITRY_PATH = "02_RESOURCES/RESEARCH/yuri-circuitry-graph.json";
export const KNOWLEDGE_GRAPH_PATH = "_SYSTEM/state/yuri-knowledge-graph.json";
export const GITNEXUS_META_PATH = ".gitnexus/meta.json";

// Custom edge-type weight ladder (priority order per the task spec):
//   1) circuitry calls/reads (mechanism-sharing, strongest signal)
//   2) knowledge-graph edges (imports strongest, then capability/state/doc edges)
//   3) directory co-location — weak fallback, orphan-only
export const REGION_TYPE_WEIGHT = {
  "circuitry-calls": 1.0,
  "circuitry-reads": 0.9,
  "kg-imports": 0.7,
  "kg-registers-capability": 0.6,
  "kg-reads-state": 0.55,
  "kg-writes-state": 0.5,
  "kg-role-uses": 0.45,
  "kg-documents": 0.4,
  "dir-colocation": 0.05,
};

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf8"));
}

// ---- alias index: source -> (alias-id -> canonical-id) ---------------------
function buildAliasIndex(idMap) {
  const bySource = new Map(); // source -> Map(aliasId -> canonicalId)
  for (const [canon, node] of Object.entries(idMap.nodes)) {
    for (const al of node.aliases) {
      if (!bySource.has(al.source)) bySource.set(al.source, new Map());
      // first-writer-wins (id-map itself guarantees exact/unique aliases per source
      // for the mapped set; a rare duplicate keeps the first canonical owner).
      const m = bySource.get(al.source);
      if (!m.has(al.id)) m.set(al.id, canon);
    }
  }
  return bySource;
}

// ---- edge source 1: circuitry graph (calls/reads only, writes excluded) ----
function circuitryEdges(aliasIndex) {
  const circIdx = aliasIndex.get("circuitry") || new Map();
  const cg = readJson(CIRCUITRY_PATH);
  const out = [];
  let dropped = 0;
  for (const e of cg.edges || []) {
    if (e.kind !== "calls" && e.kind !== "reads") continue; // per-repo convention: only mechanism-sharing kinds count
    const from = circIdx.get(e.from);
    const to = circIdx.get(e.to);
    if (!from || !to || from === to) { dropped++; continue; }
    out.push({ source: from, target: to, type: `circuitry-${e.kind}` });
  }
  return { edges: out, dropped, total: (cg.edges || []).length };
}

// ---- edge source 2: knowledge-graph edges (all types, KG's own convention) --
function knowledgeGraphEdges(aliasIndex) {
  const kgIdx = aliasIndex.get("knowledge-graph") || new Map();
  const kg = readJson(KNOWLEDGE_GRAPH_PATH);
  const out = [];
  let dropped = 0;
  for (const e of kg.edges || []) {
    const from = kgIdx.get(e.from);
    const to = kgIdx.get(e.to);
    if (!from || !to || from === to) { dropped++; continue; }
    const type = `kg-${e.type}`;
    out.push({ source: from, target: to, type });
  }
  return { edges: out, dropped, total: (kg.edges || []).length };
}

// ---- edge source 3: directory co-location, weak fallback, orphans only -----
// Only wires nodes that have ZERO edges from sources 1+2 — a real mechanism edge
// always outranks a same-directory guess. Caps fan-out per orphan (5 nearest
// same-dir siblings by path) so a flat 688-file directory doesn't become a clique.
function directoryFallbackEdges(idMap, existingDegree) {
  const byDir = new Map();
  for (const [canon, node] of Object.entries(idMap.nodes)) {
    const dir = path.posix.dirname(node.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(canon);
  }
  for (const list of byDir.values()) list.sort();

  const out = [];
  for (const [canon, node] of Object.entries(idMap.nodes)) {
    if ((existingDegree.get(canon) || 0) > 0) continue; // only true orphans
    const dir = path.posix.dirname(node.path);
    const siblings = (byDir.get(dir) || []).filter((s) => s !== canon);
    const nearest = siblings.slice(0, 5);
    for (const s of nearest) out.push({ source: canon, target: s, type: "dir-colocation" });
  }
  return out;
}

// ---- assemble the arch-graph-engine-compatible graphJson --------------------
export function buildEdgeGraph(idMap = readJson(ID_MAP_PATH)) {
  const aliasIndex = buildAliasIndex(idMap);
  const circ = circuitryEdges(aliasIndex);
  const kg = knowledgeGraphEdges(aliasIndex);

  const degree = new Map();
  for (const e of [...circ.edges, ...kg.edges]) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const dirFallback = directoryFallbackEdges(idMap, degree);

  const nodes = Object.entries(idMap.nodes).map(([canon, node]) => ({
    id: canon,
    label: (node.labels && node.labels[0]) || node.path,
    sector: path.posix.dirname(node.path).split("/").slice(0, 2).join("/") || "root",
  }));

  const edges = [...circ.edges, ...kg.edges, ...dirFallback];

  return {
    graphJson: { nodes, edges },
    stats: {
      circuitryTotal: circ.total,
      circuitryUsed: circ.edges.length,
      circuitryDropped: circ.dropped,
      kgTotal: kg.total,
      kgUsed: kg.edges.length,
      kgDropped: kg.dropped,
      dirFallbackEdges: dirFallback.length,
      orphansBeforeFallback: [...degree.keys()].length === 0
        ? nodes.length
        : nodes.length - [...degree.entries()].filter(([, d]) => d > 0).length,
      totalDroppedEdges: circ.dropped + kg.dropped,
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
  const { graphJson, stats } = buildEdgeGraph(idMap);
  const g = loadArchGraph(graphJson);
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
  node _SYSTEM/Scripts/atlas/atlas-regions.mjs [--k=N] [--json] [--verbose] [--test] [--help]

Options:
  --k=N       number of clusters (default 14, matches arch-graph-metrics.json k_clusters)
  --json      print the full region result as JSON
  --verbose   print per-region size + hub summary
  --test      run the built-in self-test and exit 0/1
  --help      this message
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
  check("some circuitry edges survived translation", stats.circuitryUsed > 0);
  check("some kg edges survived translation", stats.kgUsed > 0);
  check("dropped-edge counts are non-negative", stats.circuitryDropped >= 0 && stats.kgDropped >= 0);

  const result = computeRegions({ k: 14 });
  check("k=14 produces regions", result.regions.length > 0);
  check("every region has a hub or is empty", result.regions.every((r) => r.members.length === 0 || typeof r.hub === "string"));
  const totalMembers = result.regions.reduce((a, r) => a + r.size, 0);
  check("region membership partitions all graph nodes exactly once", totalMembers === result.graphSummary.nodes);

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
  const verbose = args.includes("--verbose");
  const asJson = args.includes("--json");

  const result = computeRegions({ k });
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
