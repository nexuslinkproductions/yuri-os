#!/usr/bin/env node
// @capability: structural-centrality
// @serves: centrality | importance | impact | dependency centrality | what matters most | structural rank | cross surface id bridge
// @does: Deterministic cross-surface structural centrality + id-bridge (canonical-id) - fills graph.impact_centrality.
// @use: Reach for this before building any importance/impact/centrality ranking over the graph.
// @exports: loadUnifiedGraph, nodeDegree, computeDependencyCentrality, computeImpactCentrality, resolveAnchors, aggregateProcessCentrality, navigateEnvelope, buildChangeTrace, CHANGE_TRACE_DEFAULT_MAX_TARGETS, CHANGE_TRACE_STATUS
/**
 * yuri-navigate.mjs — deterministic cross-surface structural navigation + centrality.
 *
 * THE engine behind the graph.impact_centrality formula card (yuri-originator.mjs:88, executableHook
 * currently the empty placeholder 'xref structural leg / GitNexus') and the OpenProcess Sum Pool's
 * dependency_centrality_i term (OpenMass w_dep). Thin layer on yuri-id-bridge.mjs; reuses the circuitry
 * graph + the protected-veto + the deterministic-sort idiom. Read-only; never mutates the graph.
 *
 * DIRECTION (pinned to function names, NOT the words forward/reverse — those invert between observers):
 *   edge 'A --calls/routes/implements--> B' means A DEPENDS ON B (A imports/invokes B; verified
 *   energy-fn --calls--> math-kernel = "imports the certified primitives ... to assemble U").
 *   - DEPENDENCY centrality of n = "what does n rest on" = closure over OUTGOING edges (dependsOn).
 *     math-kernel is a pure sink ⇒ dependencyCentrality('graph::math-kernel').raw === 0.
 *   - IMPACT centrality of n = "what breaks if n changes / blast radius" = closure over INCOMING edges
 *     (dependedOnBy). math-kernel's incoming-calls closure ⊇ {energy-fn, math-proof-gate} ⇒ impact > 0.
 *   These are two genuinely distinct traversals over two distinct adjacency tables. The locking test in
 *   yuri-navigate.test.mjs fails on any inversion.
 *
 * DETERMINISM: T1 (default) is a closed-form integer visited-set count — no float, no RNG, no
 *   locale-dependent sort (canonicalId.localeCompare, ASCII ids). T2 (opt-in metric:'ppr') is
 *   power-iteration with a FIXED iteration cap + FIXED tolerance + sorted-id row order + fixed
 *   dangling-mass redistribution. T2 never activates without the explicit opt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  REPO_ROOT, loadGraphRaw, loadRecords, canonicalize, parseCanonical, normalizePath, isProtectedPath,
} from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALL_EDGE_KINDS = ['calls', 'reads', 'writes', 'routes', 'implements'];
// DEFAULT includes 'writes'. The propagation-scan SIBLING set ['calls','reads'] EXCLUDES writes — correct
// for *similarity* siblings (a data-flow write is not a shared-mechanism signal), but inheriting it for
// CENTRALITY is a verified 26% undercount (45 of 171 edges). Centrality counts every typed dependency.
const DEFAULT_EDGE_KINDS = ALL_EDGE_KINDS.slice();
const EXT_PREFIX = 'ext::'; // namespace for external (reads/writes) artifact leaves — never a graph node

// ------------------------------------------------------------------------------------------------
// graph load + dual adjacency (built ONCE, reverse-index cached on the handle)
// ------------------------------------------------------------------------------------------------
export function loadUnifiedGraph(opts = {}) {
  const includeWrites = opts.includeWrites !== false;
  const edgeKinds = new Set(
    Array.isArray(opts.edgeKinds) && opts.edgeKinds.length
      ? opts.edgeKinds
      : DEFAULT_EDGE_KINDS.filter((k) => includeWrites || k !== 'writes'),
  );
  const { records, byCanonicalId } = loadRecords({ surfaces: ['graph'] });
  const nodeIds = new Set(records.map((r) => r.canonicalId));
  const raw = loadGraphRaw();

  const dependsOn = new Map();       // canonicalId -> Set(out-neighbour canonicalIds + ext leaves)
  const dependedOnBy = new Map();    // canonicalId -> Set(in-neighbour canonicalIds)  [nodes only]
  const edgeKindOf = new Map();      // "from\u0000to" -> kind (first wins; deterministic graph order)
  const counts = { calls: 0, reads: 0, writes: 0, routes: 0, implements: 0 };
  let externalLeaves = 0;
  let protectedExternalSkipped = 0;

  const ensure = (m, k) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } return s; };

  for (const e of raw.edges) {
    const kind = e.kind;
    if (!edgeKinds.has(kind)) continue;
    const fromCanon = canonicalize('graph', e.from);
    if (!nodeIds.has(fromCanon)) continue; // every from is verified a node, but guard anyway
    const toCanon = canonicalize('graph', e.to);
    if (nodeIds.has(toCanon)) {
      // internal node->node structural edge (calls/routes/implements)
      ensure(dependsOn, fromCanon).add(toCanon);
      ensure(dependedOnBy, toCanon).add(fromCanon);
      if (kind in counts) counts[kind] += 1;
      edgeKindOf.set(`${fromCanon}\u0000${toCanon}`, edgeKindOf.get(`${fromCanon}\u0000${toCanon}`) || kind);
    } else {
      // external node->artifact I/O edge (reads/writes). Terminal leaf; veto protected; never expanded.
      const relTo = normalizePath(String(e.to));
      if (isProtectedPath(relTo)) { protectedExternalSkipped += 1; continue; }
      const leaf = `${EXT_PREFIX}${relTo}`;
      ensure(dependsOn, fromCanon).add(leaf);
      externalLeaves += 1;
      if (kind in counts) counts[kind] += 1;
      edgeKindOf.set(`${fromCanon}\u0000${leaf}`, edgeKindOf.get(`${fromCanon}\u0000${leaf}`) || kind);
    }
  }

  // freeze adjacency value-sets to sorted arrays (determinism)
  const freeze = (m) => { const o = new Map(); for (const [k, s] of m) o.set(k, [...s].sort((a, b) => a.localeCompare(b))); return o; };

  // GitNexus fine-grained symbol-level leg is DEFERRED in v1 (the offline reader sits under
  // node_modules/, a protected/blocked path; no MCP call run). We run circuitry-graph-only structural
  // and report it honestly — never pass a 108-node curated subset off as fine-grained file-level truth.
  const staleness = computeGitnexusStaleness();

  return {
    nodes: byCanonicalId,
    nodeIds,
    dependsOn: freeze(dependsOn),
    dependedOnBy: freeze(dependedOnBy),
    edgeKindOf,
    edgeKindsUsed: [...edgeKinds].sort(),
    edgeCoverage: { ...counts, externalLeaves, protectedExternalSkipped, total: Object.values(counts).reduce((a, b) => a + b, 0) },
    structuralLegAvailable: staleness.available,
    staleness,
    nodeCount: nodeIds.size,
    phantom: records.filter((r) => r.phantom).map((r) => r.canonicalId),
    records,
  };
}

function computeGitnexusStaleness() {
  // Honest default: the fine-grained gitnexus leg is not lit in-lane (reader under node_modules/).
  // We report unavailable rather than silently degrading to circuitry-only and calling it full truth.
  return { available: false, behind: null, lastCommit: null, reason: 'gitnexus fine-grained leg deferred (circuitry-graph-only structural)' };
}

// ------------------------------------------------------------------------------------------------
// degree
// ------------------------------------------------------------------------------------------------
export function nodeDegree(graph, nodeId) {
  const id = normalizeNodeArg(nodeId);
  const out = graph.dependsOn.get(id) || [];
  const inc = graph.dependedOnBy.get(id) || [];
  const byKind = { calls: 0, reads: 0, writes: 0, routes: 0, implements: 0 };
  for (const t of out) {
    const k = graph.edgeKindOf.get(`${id}\u0000${t}`);
    if (k && k in byKind) byKind[k] += 1;
  }
  return {
    nodeId: id,
    outDegree: out.length,
    inDegree: inc.length,
    byKind,
    dependencies: out.slice(),    // sorted outgoing (incl. ext leaves)
    dependents: inc.slice(),      // sorted incoming (nodes only)
  };
}

// ------------------------------------------------------------------------------------------------
// T1 closed-form bounded BFS reachability (integer, byte-identical)
// ------------------------------------------------------------------------------------------------
function bfsReach(adjacency, seedId, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : Infinity;
  const maxNodes = Number.isFinite(opts.maxNodes) ? opts.maxNodes : Infinity;
  const visited = new Map();        // id -> { depth, edgeKind }
  let frontier = [seedId];
  let depth = 0;
  let truncated = false;
  while (frontier.length && depth < maxDepth) {
    depth += 1;
    const next = [];
    for (const cur of frontier) {
      const neighbours = adjacency.get(cur) || [];
      for (const nb of neighbours) {           // already sorted
        if (nb === seedId || visited.has(nb)) continue;
        if (visited.size >= maxNodes) { truncated = true; break; }
        const edgeKind = depth === 1 ? (opts.edgeKindOf?.get(`${cur}\u0000${nb}`) || 'structural') : 'transitive';
        visited.set(nb, { depth, edgeKind });
        next.push(nb);
      }
      if (truncated) break;
    }
    if (truncated) break;
    frontier = next.sort((a, b) => a.localeCompare(b));
  }
  return { visited, truncated };
}

export function computeDependencyCentrality(graph, nodeId, opts = {}) {
  const id = normalizeNodeArg(nodeId);
  const { visited, truncated } = bfsReach(graph.dependsOn, id, { ...opts, edgeKindOf: graph.edgeKindOf });
  const raw = visited.size;
  const N = graph.nodeCount;
  return {
    nodeId: id,
    raw,
    normalized: N > 1 ? raw / (N - 1) : 0,
    dependentCount: raw,
    truncated,
    provenance: { surface: 'structural', edgeKindsUsed: graph.edgeKindsUsed, structuralLegAvailable: graph.structuralLegAvailable },
  };
}

export function computeImpactCentrality(graph, nodeId, opts = {}) {
  const id = normalizeNodeArg(nodeId);
  const metric = opts.metric === 'ppr' ? 'ppr' : 'reach';
  if (metric === 'ppr') return pprImpact(graph, id, opts);
  const { visited, truncated } = bfsReach(graph.dependedOnBy, id, { ...opts, edgeKindOf: graph.edgeKindOf });
  const targets = [...visited.entries()].map(([tid, info]) => ({
    nodeId: tid,
    filePath: fileOf(graph, tid),
    score: 1 / info.depth,
    edgeKind: info.edgeKind,
    provenance: { surface: 'structural' },
  }));
  targets.sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  return {
    nodeId: id,
    impactScore: visited.size,
    impactRankedTargets: targets,
    structuralLegAvailable: graph.structuralLegAvailable,
    truncated,
  };
}

// ------------------------------------------------------------------------------------------------
// T2 opt-in deterministic personalized-PageRank (distributional weight; advisory across machines)
// ------------------------------------------------------------------------------------------------
function pprImpact(graph, seedId, opts = {}) {
  const d = Number.isFinite(opts.damping) ? opts.damping : 0.85;
  const maxIter = Number.isInteger(opts.maxIter) ? opts.maxIter : 100;
  const tol = Number.isFinite(opts.tol) ? opts.tol : 1e-9;
  // mass flows along INCOMING edges (dependedOnBy) = influence toward dependents = impact.
  const ids = [...graph.nodeIds].sort((a, b) => a.localeCompare(b));
  const idx = new Map(ids.map((x, i) => [x, i]));
  const n = ids.length;
  const e = new Float64Array(n);
  if (idx.has(seedId)) e[idx.get(seedId)] = 1; else for (let i = 0; i < n; i++) e[i] = 1 / n;
  let r = Float64Array.from(e);
  for (let iter = 0; iter < maxIter; iter++) {
    const nr = new Float64Array(n);
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      const outs = graph.dependedOnBy.get(ids[i]) || []; // who depends on i → spread i's mass to them
      const nodeOuts = outs.filter((t) => idx.has(t));
      if (nodeOuts.length === 0) { danglingMass += r[i]; continue; }
      const share = r[i] / nodeOuts.length;
      for (const t of nodeOuts) nr[idx.get(t)] += share;
    }
    const danglingShare = danglingMass / n; // fixed uniform redistribution over sorted ids
    let res = 0;
    for (let i = 0; i < n; i++) {
      const v = (1 - d) * e[i] + d * (nr[i] + danglingShare);
      res += Math.abs(v - r[i]);
      nr[i] = v;
    }
    r = nr;
    if (res < tol) break;
  }
  const targets = ids
    .map((tid, i) => ({ nodeId: tid, filePath: fileOf(graph, tid), score: r[i], edgeKind: 'ppr', provenance: { surface: 'structural' } }))
    .filter((t) => t.nodeId !== seedId && t.score > 0)
    .sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  return {
    nodeId: seedId,
    impactScore: idx.has(seedId) ? r[idx.get(seedId)] : 0,
    impactRankedTargets: targets,
    structuralLegAvailable: graph.structuralLegAvailable,
    truncated: false,
    metric: 'ppr',
  };
}

// ------------------------------------------------------------------------------------------------
// anchor resolution + the OpenProcess Sum Pool's single call
// ------------------------------------------------------------------------------------------------
export function resolveAnchors(graph, anchors) {
  const list = Array.isArray(anchors) ? anchors : [];
  const { fileToNodes } = loadRecords({ surfaces: ['graph'] });
  const resolved = list.map((anchor) => {
    const a = String(anchor ?? '').trim();
    // 1) direct canonical/node id
    const asNode = a.includes('::') ? a : canonicalize('graph', a);
    if (graph.nodeIds.has(asNode)) return { anchor: a, nodeId: asNode, filePath: fileOf(graph, asNode), kind: 'node' };
    // 2) file-path spine (normalized); only confident when the path resolves to exactly the spine key
    const rel = normalizePath(a);
    const viaFile = fileToNodes.get(rel);
    if (viaFile && viaFile.length) return { anchor: a, nodeId: viaFile[0], filePath: rel, kind: 'file', candidates: viaFile };
    return { anchor: a, nodeId: null, filePath: null, kind: 'unresolved' };
  });
  return { resolved, unresolvedCount: resolved.filter((r) => r.kind === 'unresolved').length };
}

// ------------------------------------------------------------------------------------------------
// change-trace: needs-verification envelope over anchor resolution + dual centrality
// (structural-impact-only; reuses resolveAnchors / aggregateProcessCentrality /
// computeImpactCentrality; never claims behavior or test results)
// ------------------------------------------------------------------------------------------------
export const CHANGE_TRACE_DEFAULT_MAX_TARGETS = 20;
export const CHANGE_TRACE_STATUS = 'needs-verification';

function changeTraceInvalid(message) {
  const error = new TypeError(message);
  error.code = 'CHANGE_TRACE_INVALID_INPUT';
  return error;
}

export function buildChangeTrace(graph, input, opts = {}) {
  const behavior = typeof input?.behavior === 'string' ? input.behavior.trim() : '';
  if (!behavior) throw changeTraceInvalid('buildChangeTrace requires a nonempty behavior string');
  const rawAnchors = Array.isArray(input?.anchors) ? input.anchors.map((a) => String(a ?? '').trim()).filter(Boolean) : [];
  if (!rawAnchors.length) throw changeTraceInvalid('buildChangeTrace requires at least one nonempty anchor');
  if (opts.maxTargets !== undefined && (!Number.isInteger(opts.maxTargets) || opts.maxTargets <= 0)) {
    throw changeTraceInvalid(`maxTargets must be a positive integer when supplied, got ${JSON.stringify(opts.maxTargets)}`);
  }
  const maxTargets = opts.maxTargets === undefined ? CHANGE_TRACE_DEFAULT_MAX_TARGETS : opts.maxTargets;
  const checks = Array.isArray(opts.checks) ? opts.checks.map((c) => String(c ?? '').trim()).filter(Boolean) : [];

  const { resolved, unresolvedCount } = resolveAnchors(graph, rawAnchors);
  const nodes = [...new Set(resolved.filter((r) => r.nodeId).map((r) => r.nodeId))].sort((a, b) => a.localeCompare(b));
  const unresolvedAnchors = resolved.filter((r) => r.kind === 'unresolved').map((r) => r.anchor);

  const aggregate = aggregateProcessCentrality(graph, rawAnchors, opts);

  const best = new Map(); // targetNodeId -> { score, edgeKind, filePath, provenance, via }
  let anyTruncated = false;
  for (const id of nodes) {
    const impact = computeImpactCentrality(graph, id, opts);
    anyTruncated = anyTruncated || Boolean(impact.truncated);
    for (const t of impact.impactRankedTargets) {
      const prior = best.get(t.nodeId);
      if (!prior || t.score > prior.score) {
        best.set(t.nodeId, { nodeId: t.nodeId, filePath: t.filePath, score: t.score, edgeKind: t.edgeKind, provenance: t.provenance, via: id });
      }
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  const affectedTargets = ranked.slice(0, maxTargets);
  const truncated = anyTruncated || ranked.length > maxTargets;

  const blockers = [];
  if (unresolvedAnchors.length) blockers.push({ code: 'UNRESOLVED_ANCHORS', anchors: unresolvedAnchors });
  if (!checks.length) blockers.push({ code: 'MISSING_CHECKS', required: 'at least one proof obligation (e.g. committed-state, negative-check) must be supplied before a behavior claim may be verified' });
  if (!graph.structuralLegAvailable) blockers.push({ code: 'FINE_GRAINED_LEG_UNAVAILABLE', reason: graph.staleness?.reason ?? 'gitnexus fine-grained leg unavailable' });

  return {
    op: 'change-trace',
    status: CHANGE_TRACE_STATUS,
    behavior,
    anchors: { requested: rawAnchors, resolvedNodes: nodes, unresolved: unresolvedAnchors, unresolvedCount },
    aggregate: {
      dependency_centrality: aggregate.dependency_centrality,
      impact_centrality: aggregate.impact_centrality,
      aggregate: opts.aggregate ?? 'max',
      grounded: aggregate.provenance.grounded,
    },
    affectedTargets,
    targetCount: affectedTargets.length,
    truncated,
    checks,
    blockers,
    verification: {
      unverified: true,
      proof: 'structural-impact-only: no behavior or test result executed; requires committed-state confirmation and a negative check before any behavior claim',
      advisory_only: true,
      local_truth_claim: false,
    },
    provenance: { surface: 'structural', edgeKindsUsed: graph.edgeKindsUsed, staleness: graph.staleness },
  };
}

export function aggregateProcessCentrality(graph, anchors, opts = {}) {
  const aggregate = opts.aggregate === 'sum' ? 'sum' : 'max';
  const { resolved, unresolvedCount } = resolveAnchors(graph, anchors);
  const nodes = [...new Set(resolved.filter((r) => r.nodeId).map((r) => r.nodeId))].sort((a, b) => a.localeCompare(b));
  const unresolvedAnchors = resolved.filter((r) => r.kind === 'unresolved').map((r) => r.anchor);
  if (!nodes.length) {
    return { dependency_centrality: 0, impact_centrality: 0, resolvedNodes: [], unresolvedAnchors, provenance: { surface: 'structural', grounded: false } };
  }
  const dep = nodes.map((id) => computeDependencyCentrality(graph, id, opts).raw);
  const imp = nodes.map((id) => computeImpactCentrality(graph, id, opts).impactScore);
  const fold = (xs) => (aggregate === 'sum' ? xs.reduce((a, b) => a + b, 0) : Math.max(...xs));
  return {
    dependency_centrality: fold(dep),
    impact_centrality: fold(imp),
    resolvedNodes: nodes,
    unresolvedAnchors,
    provenance: { surface: 'structural', grounded: true, aggregate, unresolvedCount },
  };
}

// ------------------------------------------------------------------------------------------------
// envelope (docks the Originator advisory contract)
// ------------------------------------------------------------------------------------------------
export function navigateEnvelope(input, opts = {}) {
  const graph = opts.graph || loadUnifiedGraph(opts);
  const metric = opts.metric || 'both';
  const anchors = Array.isArray(input?.anchors) ? input.anchors : null;
  let result;
  if (anchors) {
    result = aggregateProcessCentrality(graph, anchors, opts);
  } else {
    const id = normalizeNodeArg(input?.nodeId ?? input);
    result = {
      nodeId: id,
      dependency: metric !== 'impact' ? computeDependencyCentrality(graph, id, opts) : undefined,
      impact: metric !== 'dependency' ? computeImpactCentrality(graph, id, opts) : undefined,
    };
  }
  return {
    op: 'navigate',
    status: 'ok',
    result,
    completeness: {
      nodesVisited: result?.impact?.impactScore ?? result?.dependency_centrality ?? null,
      nodesTotal: graph.nodeCount,
      truncated: Boolean(result?.impact?.truncated || result?.dependency?.truncated),
      structuralLegAvailable: graph.structuralLegAvailable,
      edgeCoverage: graph.edgeCoverage,
      phantomDropped: graph.phantom,
    },
    verification: { advisory_only: true, local_truth_claim: false },
    provenance: { surface: 'structural', edgeKindsUsed: graph.edgeKindsUsed, staleness: graph.staleness },
  };
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------
function normalizeNodeArg(nodeId) {
  const s = String(nodeId ?? '').trim();
  return s.includes('::') ? s : canonicalize('graph', s);
}
function fileOf(graph, canonicalId) {
  if (canonicalId.startsWith(EXT_PREFIX)) return canonicalId.slice(EXT_PREFIX.length);
  const rec = graph.nodes.get(canonicalId);
  return rec && rec.files.length ? rec.files[0] : null;
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------
function runCli(argv) {
  const args = argv.slice(2);
  const flag = (name) => args.includes(name);
  const val = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
  const anchorsArg = val('--anchors', null);
  const metric = val('--metric', 'both');
  const ppr = flag('--ppr');
  const json = flag('--json');
  const dryRun = flag('--dry-run');
  const includeWrites = !flag('--no-writes');
  const behavior = val('--behavior', null);
  const maxTargetsRaw = val('--max-targets', null);
  const checks = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--check' && args[i + 1]) checks.push(args[i + 1]);
  const singleValueFlags = new Set(['--anchors', '--metric', '--behavior', '--max-targets', '--check']);
  const positional = args.find((a) => !a.startsWith('--') && !singleValueFlags.has(args[args.indexOf(a) - 1]));
  const usage = () => {
    process.stderr.write('usage: yuri-navigate <nodeId | --anchors a,b,c> [--metric dependency|impact|both] [--ppr] [--no-writes] [--json] [--dry-run]\n');
    process.stderr.write('       yuri-navigate --behavior "<text>" --anchors a,b,c [--check <obligation> ...] [--max-targets N]\n');
    process.exitCode = 1;
  };

  const graph = loadUnifiedGraph({ includeWrites });
  if (dryRun) {
    const out = { op: 'navigate', dryRun: true, nodeCount: graph.nodeCount, edgeCoverage: graph.edgeCoverage, structuralLegAvailable: graph.structuralLegAvailable, staleness: graph.staleness };
    process.stdout.write(JSON.stringify(out, null, json ? 2 : 0) + '\n');
    return;
  }

  const traceMode = behavior !== null || maxTargetsRaw !== null || checks.length > 0;
  if (traceMode) {
    if (behavior === null) { process.stderr.write('error: --behavior is required for change-trace mode\n'); usage(); return; }
    if (anchorsArg === null) { process.stderr.write('error: --anchors is required with --behavior\n'); usage(); return; }
    let maxTargets;
    if (maxTargetsRaw !== null) {
      maxTargets = Number(maxTargetsRaw);
      if (!Number.isInteger(maxTargets) || maxTargets <= 0) {
        process.stderr.write(`error: --max-targets must be a positive integer, got ${JSON.stringify(maxTargetsRaw)}\n`);
        usage(); return;
      }
    }
    try {
      const env = buildChangeTrace(graph, { behavior, anchors: anchorsArg.split(',').map((s) => s.trim()).filter(Boolean) }, { maxTargets, checks });
      process.stdout.write(JSON.stringify(env, null, json ? 2 : 0) + '\n');
    } catch (error) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  let env;
  if (anchorsArg) {
    env = navigateEnvelope({ anchors: anchorsArg.split(',').map((s) => s.trim()).filter(Boolean) }, { graph, metric });
  } else if (positional) {
    env = navigateEnvelope({ nodeId: positional }, { graph, metric });
    if (ppr && env.result.impact) env.result.impact = computeImpactCentrality(graph, positional, { metric: 'ppr' });
  } else {
    usage();
    return;
  }
  process.stdout.write(JSON.stringify(env, null, json ? 2 : 0) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(process.argv);
