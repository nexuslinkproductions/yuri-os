#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadUnifiedGraph, nodeDegree, computeDependencyCentrality, computeImpactCentrality,
  resolveAnchors, aggregateProcessCentrality, navigateEnvelope,
} from './yuri-navigate.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

const g = loadUnifiedGraph();
const SET = (imp) => new Set(imp.impactRankedTargets.map((t) => t.nodeId));

// ---- TEST 1: DETERMINISM (byte-identical) ----
const d1 = JSON.stringify(computeDependencyCentrality(g, 'energy-fn'));
const d2 = JSON.stringify(computeDependencyCentrality(loadUnifiedGraph(), 'energy-fn'));
ok(d1 === d2, 'dependency centrality byte-identical across two builds');
const i1 = JSON.stringify(computeImpactCentrality(g, 'math-kernel'));
const i2 = JSON.stringify(computeImpactCentrality(loadUnifiedGraph(), 'math-kernel'));
ok(i1 === i2, 'impact centrality byte-identical across two builds');
const p1 = JSON.stringify(computeImpactCentrality(g, 'math-kernel', { metric: 'ppr' }));
const p2 = JSON.stringify(computeImpactCentrality(g, 'math-kernel', { metric: 'ppr' }));
ok(p1 === p2, 'T2 PPR byte-identical');
// no nondeterministic primitives in source
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'yuri-navigate.mjs'), 'utf8');
ok(!/Math\.random|Date\.now|new Date\(/.test(src), 'no Math.random / Date.now / new Date in source');

// ---- TEST 2: DIRECTION (locking test + mutation-test) ----
const mkDep = computeDependencyCentrality(g, 'math-kernel');
const mkImp = computeImpactCentrality(g, 'math-kernel');
const mkSet = SET(mkImp);
ok(mkDep.raw === 0, 'LOCK: math-kernel dependency.raw === 0 (verified pure sink)');
ok(mkSet.has('graph::energy-fn') && mkSet.has('graph::math-proof-gate') && mkImp.impactScore > 0,
  'LOCK: math-kernel impact ⊇ {energy-fn, math-proof-gate}, impactScore > 0');
// mutation-test: swap the adjacencies and assert the lock FAILS (proves it guards inversion)
const swapped = { ...g, dependsOn: g.dependedOnBy, dependedOnBy: g.dependsOn };
const mkDepSwapped = computeDependencyCentrality(swapped, 'math-kernel');
ok(mkDepSwapped.raw > 0, 'MUTATION: with adjacency swapped, math-kernel dependency is NO LONGER 0 (lock would catch inversion)');

// ---- TEST 3: EDGE-KIND HONESTY (writes-trap) ----
ok(g.edgeKindsUsed.includes('writes'), 'default edgeKinds INCLUDES writes (no 26% undercount)');
ok(g.edgeCoverage.writes > 0 && g.edgeCoverage.protectedExternalSkipped === 17,
  'writes counted; exactly 17 protected external edges skipped (verified)');
// a node with writes edges drops when writes excluded
const gNoWrites = loadUnifiedGraph({ includeWrites: false });
ok(!gNoWrites.edgeKindsUsed.includes('writes'), 'includeWrites:false removes writes from the edge set');
const someWriter = [...g.nodes.keys()].find((id) => nodeDegree(g, id).byKind.writes > 0);
ok(someWriter, 'found a node with writes edges');
if (someWriter) {
  const withW = computeDependencyCentrality(g, someWriter).raw;
  const withoutW = computeDependencyCentrality(gNoWrites, someWriter).raw;
  ok(withoutW <= withW, `dependency raw drops (or holds) when writes excluded (${withW} -> ${withoutW})`);
}
// negative: a fabricated lexical 'edge' is not in the graph and adds zero degree
ok(!g.dependsOn.has('similarity::fabricated'), 'fabricated similarity edge is absent from the structural graph');

// ---- TEST 4: BOUNDING ----
const bounded = computeImpactCentrality(g, 'math-kernel', { maxNodes: 3 });
ok(bounded.truncated === true && bounded.impactScore <= 3, 'maxNodes=3 truncates with truncated flag');
const unbounded = computeImpactCentrality(g, 'math-kernel');
ok(unbounded.truncated === false && unbounded.impactScore > 3, 'unbounded run on same node is not truncated and reaches more');

// ---- TEST 5: COMPLETENESS-HONESTY ----
ok(g.structuralLegAvailable === false, 'structuralLegAvailable=false (gitnexus fine-grained leg deferred, reported not hidden)');
ok(computeDependencyCentrality(g, 'energy-fn').provenance.structuralLegAvailable === false, 'every result carries the structuralLeg flag');
// all-unresolved anchors => 0 WITH unresolvedAnchors populated (distinct from grounded-isolated 0)
const ghost = aggregateProcessCentrality(g, ['this::is::not::a::real::anchor', 'nonexistent-file.xyz']);
ok(ghost.dependency_centrality === 0 && ghost.unresolvedAnchors.length === 2 && ghost.provenance.grounded === false,
  'all-unresolved anchors => centrality 0 WITH unresolvedAnchors (no-grounding, distinct from isolated)');
// grounded-isolated: math-kernel resolves but dependency is genuinely 0, unresolvedAnchors empty
const grounded0 = aggregateProcessCentrality(g, ['math-kernel']);
ok(grounded0.dependency_centrality === 0 && grounded0.unresolvedAnchors.length === 0 && grounded0.provenance.grounded === true,
  'grounded-isolated (math-kernel dep=0) is DISTINCT from no-grounding: grounded:true, no unresolved');
// phantom node surfaced, not silently vanished
ok(g.phantom.includes('graph::cross-domain-transfer-engine'), 'phantom node surfaced in graph.phantom');

// ---- TEST 6: PROTECTED VETO ----
const allTargets = [];
for (const id of g.nodes.keys()) for (const t of (g.dependsOn.get(id) || [])) allTargets.push(t);
const protectedLeak = allTargets.filter((t) => /(^|::)(backend\/data|\.claude\/(state|history|file-history|projects)|\.env|node_modules|\.amp)\//.test(t));
ok(protectedLeak.length === 0, 'NO edge endpoint resolves under any EXTENDED protected prefix');
ok(!allTargets.some((t) => t.includes('.claude/projects/')), 'specifically: the .claude/projects/*/memory writes are absent (inherited set would leak them)');

// ---- TEST 7: ID-NAMESPACE / SPINE ----
const fileResolve = resolveAnchors(g, ['_SYSTEM/Scripts/math/yuri-energy.mjs']);
ok(fileResolve.resolved[0].kind === 'file' && fileResolve.resolved[0].nodeId === 'graph::energy-fn',
  'file-path anchor resolves to its node via the spine (not id-equality)');
const slugResolve = resolveAnchors(g, ['energy-fn']);
ok(slugResolve.resolved[0].kind === 'node', 'bare slug anchor resolves as a node');

// ---- TEST 8: CONSUMER-FIT ----
const agg = aggregateProcessCentrality(g, ['energy-fn']);
ok(typeof agg.dependency_centrality === 'number', 'aggregateProcessCentrality yields a numeric dependency_centrality for OpenMass w_dep');
const imp = computeImpactCentrality(g, 'energy-fn');
const t0 = imp.impactRankedTargets[0];
ok(t0 && 'nodeId' in t0 && 'filePath' in t0 && 'score' in t0 && 'edgeKind' in t0 && 'provenance' in t0,
  'impactRankedTargets shape EXACTLY matches formula card outputShape (nodeId,filePath,score,edgeKind,provenance)');
// category-error fence: centrality over an OpenProcess id (not a graph node) is unresolved, not silently scored
const openProcId = aggregateProcessCentrality(g, ['OPEN::task::abc123']);
ok(openProcId.dependency_centrality === 0 && openProcId.unresolvedAnchors.length === 1,
  'an OpenProcess id is unresolved (category-error fence), not silently scored over the code graph');
// envelope advisory contract
const env = navigateEnvelope({ nodeId: 'energy-fn' }, { graph: g });
ok(env.op === 'navigate' && env.verification.advisory_only === true && env.completeness.structuralLegAvailable === false,
  'navigateEnvelope docks the advisory contract with completeness reporting');

console.log(`\nyuri-navigate.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
