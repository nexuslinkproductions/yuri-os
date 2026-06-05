#!/usr/bin/env node
// arch-graph-engine.test.mjs — regression canaries for the read-only
// architecture-graph organ. Seeded tiny graphs with KNOWN structure prove each
// analyzer; adversarial edge cases prove robustness.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  loadArchGraph,
  connectedComponents,
  symEig,
  spectralCluster,
  tarjanArticulationAndBridges,
  formanCurvature,
  analyzeArchGraph,
  TYPE_WEIGHT,
} from "./arch-graph-engine.mjs";

// --- helpers to build a graph JSON in yuri-graph-state shape ----------------
function mkGraph(nodeIds, edgeTriples, sectorMap = {}) {
  return {
    nodes: nodeIds.map((id) => ({ id, label: id, sector: sectorMap[id] ?? "s" })),
    edges: edgeTriples.map(([source, target, type = "flow", extra = {}]) => ({
      source, target, type, ...extra,
    })),
  };
}

// ============================================================================
// CARD 16 CANARY — known articulation point + known bridge
// ============================================================================
test("CANARY card16: bow-tie graph reports the center as the articulation point", () => {
  // two triangles sharing ONE vertex C: A-B-C-A  and  C-D-E-C.
  // C is the unique articulation point. No bridges (each side is a triangle).
  const g = loadArchGraph(mkGraph(
    ["A", "B", "C", "D", "E"],
    [["A", "B"], ["B", "C"], ["C", "A"], ["C", "D"], ["D", "E"], ["E", "C"]],
  ));
  const { articulationPoints, bridges } = tarjanArticulationAndBridges(g);
  assert.deepEqual(articulationPoints, ["C"], "C is the sole articulation point");
  assert.equal(bridges.length, 0, "two triangles -> no bridges");
});

test("CANARY card16: path graph reports a true bridge + the right cut vertices", () => {
  // A - B - C : B is articulation; A-B and B-C are both bridges.
  const g = loadArchGraph(mkGraph(["A", "B", "C"], [["A", "B"], ["B", "C"]]));
  const { articulationPoints, bridges } = tarjanArticulationAndBridges(g);
  assert.deepEqual(articulationPoints, ["B"]);
  assert.equal(bridges.length, 2);
  const keys = bridges.map((b) => b.a + "|" + b.b).sort();
  assert.deepEqual(keys, ["A|B", "B|C"]);
});

test("CANARY card16: bridge between two triangles", () => {
  // triangle A-B-C, triangle D-E-F, single bridge C-D. C and D are articulation.
  const g = loadArchGraph(mkGraph(
    ["A", "B", "C", "D", "E", "F"],
    [["A", "B"], ["B", "C"], ["C", "A"], ["C", "D"], ["D", "E"], ["E", "F"], ["F", "D"]],
  ));
  const { articulationPoints, bridges } = tarjanArticulationAndBridges(g);
  assert.deepEqual(articulationPoints.sort(), ["C", "D"]);
  assert.deepEqual(bridges.map((b) => b.a + "|" + b.b), ["C|D"]);
});

test("card16: cycle graph has NO articulation points and NO bridges", () => {
  // square A-B-C-D-A — 2-edge-connected.
  const g = loadArchGraph(mkGraph(
    ["A", "B", "C", "D"],
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]],
  ));
  const { articulationPoints, bridges } = tarjanArticulationAndBridges(g);
  assert.equal(articulationPoints.length, 0);
  assert.equal(bridges.length, 0);
});

test("card16: root with two subtrees IS an articulation point (root special case)", () => {
  // star center R with leaves X, Y -> R is articulation; R-X, R-Y are bridges.
  const g = loadArchGraph(mkGraph(["R", "X", "Y"], [["R", "X"], ["R", "Y"]]));
  const { articulationPoints, bridges } = tarjanArticulationAndBridges(g);
  assert.deepEqual(articulationPoints, ["R"]);
  assert.equal(bridges.length, 2);
});

// ============================================================================
// CARD 4 CANARY — known cluster split (two cliques + a thin bridge)
// ============================================================================
test("CANARY card4: two cliques bridged -> spectral split recovers the two communities", () => {
  // clique {A,B,C} and clique {D,E,F}, joined by a single thin edge C-D.
  const ids = ["A", "B", "C", "D", "E", "F"];
  const edges = [
    ["A", "B"], ["B", "C"], ["C", "A"],
    ["D", "E"], ["E", "F"], ["F", "D"],
    ["C", "D"], // the bridge
  ];
  const g = loadArchGraph(mkGraph(ids, edges));
  const cc = connectedComponents(g);
  assert.equal(cc.giant.length, 6, "all connected");
  const sp = spectralCluster(g, cc.giant.map((i) => g.ids[i]), { k: 2, seed: 1 });
  // the two cliques must land in different clusters.
  const cl = sp.clusters;
  assert.equal(cl.A, cl.B); assert.equal(cl.B, cl.C);
  assert.equal(cl.D, cl.E); assert.equal(cl.E, cl.F);
  assert.notEqual(cl.A, cl.D, "the two cliques are split");
  // Fiedler > 0 for a connected graph
  assert.ok(sp.fiedler > 1e-9, `fiedler ${sp.fiedler} > 0`);
  // the Cheeger bottleneck must cross the C-D bridge.
  const crossing = sp.fiedlerSweep.crossingEdges.map((e) => [e.a, e.b].sort().join("|"));
  assert.ok(crossing.includes("C|D"), `cheeger cut crosses C|D, got ${crossing.join(",")}`);
});

test("CANARY eigensolver: symEig correct on [[2,1],[1,2]] -> {1,3}", () => {
  const t = symEig([[2, 1], [1, 2]]);
  assert.ok(Math.abs(t.values[0] - 1) < 1e-9, `λ0=${t.values[0]}`);
  assert.ok(Math.abs(t.values[1] - 3) < 1e-9, `λ1=${t.values[1]}`);
});

test("eigensolver: normalized Laplacian λ0 ≈ 0 (every Lsym has a trivial zero eigenvalue)", () => {
  // Lsym of a connected graph has smallest eigenvalue ~0.
  const ids = ["A", "B", "C", "D"];
  const g = loadArchGraph(mkGraph(ids, [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]]));
  const cc = connectedComponents(g);
  const sp = spectralCluster(g, cc.giant.map((i) => g.ids[i]), { k: 2 });
  assert.ok(Math.abs(sp.lambdas[0]) < 1e-6, `λ0=${sp.lambdas[0]} ≈ 0`);
});

// ============================================================================
// CARD 17 CANARY — Forman curvature ranks the bridge most-negative
// ============================================================================
test("CANARY card17: the thin bridge between two cliques is the most-negative-curvature edge", () => {
  const ids = ["A", "B", "C", "D", "E", "F"];
  const edges = [
    ["A", "B"], ["B", "C"], ["C", "A"],
    ["D", "E"], ["E", "F"], ["F", "D"],
    ["C", "D"],
  ];
  const g = loadArchGraph(mkGraph(ids, edges));
  const cur = formanCurvature(g);
  // most-negative (first) edge must be the bridge C-D, tri=0.
  const worst = cur[0];
  assert.equal([worst.a, worst.b].sort().join("|"), "C|D", `worst edge ${worst.a}-${worst.b}`);
  assert.equal(worst.tri, 0, "bridge has no triangle");
  // clique-internal edges all sit in triangles -> higher curvature than the bridge.
  const internal = cur.filter((c) => c.tri > 0);
  for (const e of internal) assert.ok(e.ricci > worst.ricci, `${e.a}-${e.b} ricci ${e.ricci} > bridge ${worst.ricci}`);
});

// ============================================================================
// CROSS-VALIDATION CANARY — Cheeger ≈ Forman ≈ Tarjan agree on the bridge
// ============================================================================
test("CANARY cross-validation: on two-equal-cliques the bottleneck IS the bridge (all three coincide here)", () => {
  // SPECIAL CASE: when the cut edge has equal-degree endpoints in symmetric
  // cliques, bridge == bottleneck == most-negative Forman all coincide. This is
  // the regime the roadmap assumed; the LIVE-graph test below proves the general
  // case where Tarjan bridges (leaf cuts) DIVERGE from Forman/Cheeger bottlenecks.
  const ids = ["A", "B", "C", "D", "E", "F"];
  const edges = [
    ["A", "B"], ["B", "C"], ["C", "A"],
    ["D", "E"], ["E", "F"], ["F", "D"],
    ["C", "D"],
  ];
  const report = analyzeArchGraph(mkGraph(ids, edges), { k: 2, seed: 1 });
  // Tarjan: C-D is a bridge
  assert.ok(report.bridges.some((b) => b.a + "|" + b.b === "C|D"));
  // Forman: C-D is the most-negative edge
  assert.equal([report.topNegativeCurvature[0].a, report.topNegativeCurvature[0].b].sort().join("|"), "C|D");
  // PRIMARY agreement (Forman ≈ Cheeger): C-D crosses the bottleneck AND is most-negative
  assert.ok(report.crossValidation.cheegerCrossingThatAreNegForman.includes("C|D"));
  // here the orthogonal channels happen to coincide too
  assert.ok(report.crossValidation.formanNegEdgesThatAreBridges.includes("C|D"));
  assert.ok(report.crossValidation.cheegerCrossingThatAreBridges.includes("C|D"));
});

test("LIVE cross-validation: Forman ≈ Cheeger holds; Tarjan bridges are the DISTINCT channel (roadmap triple-equality corrected)", () => {
  const j = JSON.parse(readFileSync("_SYSTEM/yuri-graph-state.json", "utf8"));
  const report = analyzeArchGraph(j);
  const x = report.crossValidation;
  // PRIMARY: multiple Cheeger bottleneck edges land among most-negative Forman.
  assert.ok(x.cheegerFormanOverlapCount >= 4,
    `Forman≈Cheeger agreement: ${x.cheegerFormanOverlapCount} overlap (expected >=4)`);
  // ORTHOGONAL: on this topology the leaf-cut bridges do NOT coincide with the
  // traffic bottlenecks — proving the roadmap triple-equality was wrong here.
  assert.equal(x.formanNegEdgesThatAreBridgesCount, 0,
    "live: bridges (leaf cuts) are NOT among most-negative Forman (bottlenecks)");
});

// ============================================================================
// ROBUSTNESS — empty / single / disconnected / meta-edge / multi-edge / NaN
// ============================================================================
test("robustness: empty graph yields zero everything, no throw", () => {
  const g = loadArchGraph({ nodes: [], edges: [] });
  assert.equal(g.n, 0);
  const cc = connectedComponents(g);
  assert.equal(cc.count, 0);
  const t = tarjanArticulationAndBridges(g);
  assert.deepEqual(t.articulationPoints, []);
  assert.deepEqual(t.bridges, []);
  assert.deepEqual(formanCurvature(g), []);
});

test("robustness: single node, no edges -> isolated, no metrics blow up", () => {
  const report = analyzeArchGraph(mkGraph(["solo"], []));
  assert.equal(report.summary.nodes, 1);
  assert.equal(report.summary.isolatedNodes, 1);
  assert.equal(report.summary.bridges, 0);
  assert.equal(report.summary.articulationPoints, 0);
});

test("robustness: disconnected components counted; giant is largest", () => {
  // {A,B,C} triangle + {D,E} edge + {F} isolated
  const g = loadArchGraph(mkGraph(
    ["A", "B", "C", "D", "E", "F"],
    [["A", "B"], ["B", "C"], ["C", "A"], ["D", "E"]],
  ));
  const cc = connectedComponents(g);
  assert.equal(cc.count, 3);
  assert.equal(cc.giant.length, 3);
  assert.deepEqual(cc.isolated, ["F"]);
});

test("robustness: hidden + meta edges are EXCLUDED from structural analysis", () => {
  // real edge A-B; a hidden edge B-C; a collapsed-membership meta edge C-A.
  const g = loadArchGraph({
    nodes: [{ id: "A", sector: "s" }, { id: "B", sector: "s" }, { id: "C", sector: "s" }],
    edges: [
      { source: "A", target: "B", type: "flow" },
      { source: "B", target: "C", type: "flow", hidden: true },
      { source: "C", target: "A", type: "collapsed-membership" },
    ],
  });
  // only A-B survives -> C is isolated.
  assert.equal(g.simpleEdgeCount, 1);
  const cc = connectedComponents(g);
  assert.ok(cc.isolated.includes("C"), "C isolated after meta/hidden exclusion");
});

test("robustness: multi-edges collapse to ONE simple edge (max weight)", () => {
  // two parallel A-B edges: flow (1.0) and logs (0.2). Max weight 1.0, one edge.
  const g = loadArchGraph(mkGraph(["A", "B"], [["A", "B", "logs"], ["A", "B", "flow"]]));
  assert.equal(g.simpleEdgeCount, 1);
  assert.equal(g.edges[0].w, TYPE_WEIGHT.flow, "max weight wins on multi-edge");
});

test("robustness: self-loops are dropped", () => {
  const g = loadArchGraph(mkGraph(["A", "B"], [["A", "A"], ["A", "B"]]));
  assert.equal(g.simpleEdgeCount, 1);
});

test("robustness: dangling edge endpoints (not a node) are ignored", () => {
  const g = loadArchGraph(mkGraph(["A", "B"], [["A", "GHOST"], ["A", "B"]]));
  assert.equal(g.simpleEdgeCount, 1);
});

test("robustness: all metrics are finite (no NaN/Inf) on a connected graph", () => {
  const report = analyzeArchGraph(mkGraph(
    ["A", "B", "C", "D"],
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"], ["A", "C"]],
  ), { k: 2 });
  for (const id of Object.keys(report.metrics)) {
    const m = report.metrics[id];
    assert.ok(Number.isFinite(m.weightedDegree), `${id} weightedDegree finite`);
    assert.ok(Number.isInteger(m.simpleDegree), `${id} simpleDegree int`);
  }
  for (const c of report.topNegativeCurvature) assert.ok(Number.isFinite(c.ricci), "ricci finite");
  assert.ok(Number.isFinite(report.summary.lambda2_fiedler), "fiedler finite");
});

test("determinism: two analyses of the same graph are byte-identical", () => {
  const j = mkGraph(["A", "B", "C", "D", "E", "F"],
    [["A", "B"], ["B", "C"], ["C", "A"], ["D", "E"], ["E", "F"], ["F", "D"], ["C", "D"]]);
  const r1 = analyzeArchGraph(j, { k: 2, seed: 1 });
  const r2 = analyzeArchGraph(j, { k: 2, seed: 1 });
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

// ============================================================================
// LIVE GRAPH — runs over the real yuri-graph-state.json (read-only)
// ============================================================================
test("LIVE: real graph loads to the verified shape (127n, giant=116, 11 isolated)", () => {
  const j = JSON.parse(readFileSync("_SYSTEM/yuri-graph-state.json", "utf8"));
  const report = analyzeArchGraph(j);
  // Shape updated when the xref/propagation organs were wired in: +3 nodes
  // (LANE_NEMOTRON, PROPAGATION_SCAN, XREF_QUERY) all join the giant component
  // (giant 113->116), no new isolated node (still 11), +5 real edges (250->255).
  assert.equal(report.summary.nodes, 127, "127 nodes");
  assert.equal(report.summary.giant, 116, "giant=116 (113 + 3 wired-in organs)");
  assert.equal(report.summary.isolatedNodes, 11, "11 isolated (matches catalog λ0 finding)");
  assert.ok(report.summary.realEdges === 255, `realEdges=${report.summary.realEdges}`);
  assert.ok(report.summary.bridges > 0, "real graph has bridges");
  assert.ok(report.summary.lambda2_fiedler >= 0, "λ2 non-negative");
  // every node has a metrics entry; none mutated into graph.
  assert.equal(Object.keys(report.metrics).length, 127);
});

test("LIVE: analysis does NOT mutate the input graph object", () => {
  const raw = readFileSync("_SYSTEM/yuri-graph-state.json", "utf8");
  const j = JSON.parse(raw);
  const before = JSON.stringify(j);
  analyzeArchGraph(j);
  assert.equal(JSON.stringify(j), before, "input graph object unchanged after analysis");
  // and no node gained a size/weight field
  assert.ok(j.nodes.every((n) => n.size === undefined && n.weight === undefined),
    "no size/weight field injected (deferred per scope)");
});
