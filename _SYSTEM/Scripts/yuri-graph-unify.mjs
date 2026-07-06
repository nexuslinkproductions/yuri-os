#!/usr/bin/env node
/**
 * yuri-graph-unify.mjs — ONE canonical graph; the two graph files become GENERATED PROJECTIONS.
 *
 * THE PROBLEM (Marcel 2026-06-08): YURI carried two separately-maintained graph artifacts of the same system
 * at different altitudes — `_SYSTEM/yuri-graph-state.json` (the conceptual operating-FLOW map: USER→NEXUS_CORE→ROUTING,
 * with layout/sectors/telemetry/metrics) and `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` (the code-MECHANISM
 * die: energy-fn/math-kernel/formula-foundry, with files[]). They share only ~4 node ids, so they are NOT clones —
 * but two editable sources invite drift (edit one, the other goes stale; the die was still "108" while the source
 * was 112). Solve: ONE canonical graph is the single source of truth; the two view files are PROJECTED from it.
 * Edit the canonical, run this, both views regenerate. Drift becomes structurally impossible.
 *
 * Canonical: `_SYSTEM/yuri-graph.json`. Each node carries `tiers` (which views it appears in) + a per-view field
 * bag (`flow`/`mechanism`) so projection is LOSSLESS. Deterministic; no clock (generatedAt passed via --stamp).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CANONICAL = path.join(REPO, '_SYSTEM/yuri-graph.json');
const FLOW_VIEW = path.join(REPO, '_SYSTEM/yuri-graph-state.json');                       // arch / operating-flow
const MECH_VIEW = path.join(REPO, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json');     // code-mechanism graph (nav: xref/propagation/id-bridge)
const DIE_VIEW = path.join(REPO, '02_RESOURCES/RESEARCH/yuri-die-graph.json');            // chip-die: the ENTIRE system (all 244 nodes), code organs + flow peripherals

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// capture EVERY field except the listed ones — lossless by construction (no hardcoded field list to drift).
const omit = (obj, drop) => { const o = {}; for (const k of Object.keys(obj)) if (!drop.includes(k)) o[k] = obj[k]; return o; };

// ------------------------------------------------------------------------------------------------
// SEED — build the canonical from the two existing graphs (first-time / re-merge). Lossless union.
// ------------------------------------------------------------------------------------------------
export function seedCanonical({ flow = read(FLOW_VIEW), mech = read(MECH_VIEW) } = {}) {
  const byId = new Map();
  const ensure = (id) => { let n = byId.get(id); if (!n) { n = { id, tiers: [], flow: null, mechanism: null }; byId.set(id, n); } return n; };

  for (const node of flow.nodes || []) {
    const n = ensure(node.id);
    if (!n.tiers.includes('flow')) n.tiers.push('flow');
    n.flow = omit(node, ['id']);
    if (!n.label && node.label) n.label = node.label;
  }
  for (const node of mech.nodes || []) {
    const n = ensure(node.id);
    if (!n.tiers.includes('mechanism')) n.tiers.push('mechanism');
    n.mechanism = omit(node, ['id']);
    if (!n.label && node.label) n.label = node.label;
  }

  const nodes = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  // edges tagged with the view they belong to; preserve all original edge fields.
  const edges = [
    ...(flow.edges || []).map((e) => ({ ...e, view: 'flow' })),
    ...(mech.edges || []).map((e) => ({ ...e, view: 'mechanism' })),
  ];

  return {
    schema: 'yuri.unified-graph.v0',
    generatedAt: mech.generatedAt || flow.generated_at || null,
    note: 'CANONICAL single source of truth. Edit HERE, then run yuri-graph-unify.mjs project to regenerate the views. Do NOT hand-edit yuri-graph-state.json / yuri-circuitry-graph.json — they are generated.',
    flowMeta: omit(flow, ['nodes', 'edges', '_generated']),
    mechMeta: omit(mech, ['nodes', 'edges', '_generated']),
    // preserve each view's ORIGINAL node order + top-level key order so projection produces a minimal diff.
    flowOrder: (flow.nodes || []).map((n) => n.id),
    mechOrder: (mech.nodes || []).map((n) => n.id),
    flowTopKeys: Object.keys(flow),
    mechTopKeys: Object.keys(mech),
    nodes,
    edges,
  };
}

// order a projected node list by the original view order (new ids — absent from the order — go last, sorted).
function inOrder(nodes, order) {
  const idx = new Map((order || []).map((id, i) => [id, i]));
  return nodes.slice().sort((a, b) => (idx.has(a.id) ? idx.get(a.id) : 1e9 + a.id.localeCompare(b.id)) - (idx.has(b.id) ? idx.get(b.id) : 1e9));
}

// rebuild a view object in its ORIGINAL top-level key order (nodes/edges substituted), with _generated first.
function inKeyOrder(keyOrder, meta, nodes, edges) {
  const out = { _generated: GEN_MARK };
  for (const k of keyOrder || []) {
    if (k === 'nodes') out.nodes = nodes;
    else if (k === 'edges') out.edges = edges;
    else if (k !== '_generated' && meta[k] !== undefined) out[k] = meta[k];
  }
  if (!('nodes' in out)) out.nodes = nodes;
  if (!('edges' in out)) out.edges = edges;
  return out;
}

// ------------------------------------------------------------------------------------------------
// PROJECT — regenerate the two view files from the canonical (the generation Marcel wants).
// ------------------------------------------------------------------------------------------------
const GEN_MARK = 'GENERATED from _SYSTEM/yuri-graph.json (canonical) by yuri-graph-unify.mjs — DO NOT hand-edit; edit the canonical + run `yuri-graph-unify.mjs project`.';
export function projectFlow(canon) {
  const nodes = inOrder(canon.nodes.filter((n) => n.tiers.includes('flow')).map((n) => ({ id: n.id, ...(n.flow || {}) })), canon.flowOrder);
  const edges = canon.edges.filter((e) => e.view === 'flow').map(({ view, ...e }) => e);
  return inKeyOrder(canon.flowTopKeys, canon.flowMeta || {}, nodes, edges);
}
export function projectMechanism(canon) {
  const nodes = inOrder(canon.nodes.filter((n) => n.tiers.includes('mechanism')).map((n) => ({ id: n.id, ...(n.mechanism || {}) })), canon.mechOrder);
  const edges = canon.edges.filter((e) => e.view === 'mechanism').map(({ view, ...e }) => e);
  return inKeyOrder(canon.mechTopKeys, canon.mechMeta || {}, nodes, edges);
}

// DIE view — the chip die renders the ENTIRE unified system (Marcel 2026-06-09: "the entire system represented
// on it, not just dies but other rendered components placed on purpose, nothing random"). Two node families:
// MECHANISM → kind:'die' (code organs as silicon blocks); FLOW → kind:'peripheral' (system-level functions as
// board components). Flow nodes have no `layer`; SECTOR_TO_LAYER folds the 15 flow sectors into the die's 10
// existing layers so the floorplan machinery is unchanged. Deterministic: sorted by id, edges unioned + deduped.
// 2026-06-16: the 4 world-facing/transcendent layers completing YURI 10->14. The old map dumped
// operator_io + advisors into 'Cognition & Persona' (the pollution the owner flagged) and services
// into Skills. Now: operator_io->Perception, advisors->Relational, services->Actuation. Telos is a
// dedicated mechanism organ (telos-core), not a sector. pulse_cortex stays Cognition (the true cortex).
export const SECTOR_TO_LAYER = {
  operator_io: 'Perception & Interface', pulse_cortex: 'Cognition & Persona', advisors: 'Relational & Peer',
  memory: 'Memory & Subconscious', classification: 'Retrieval & Knowledge', code_intelligence: 'Retrieval & Knowledge',
  self_improvement: 'Self-Improvement', routing_lanes: 'Skills & Orchestration', command_registry: 'Skills & Orchestration',
  services: 'Actuation & Embodiment', control_plane: 'Governance & Safety',
  prompt_hooks: 'Token-Efficiency & Session', initialization: 'Token-Efficiency & Session', unassigned: 'Hidden / Meta / Self-referential',
};
const DIE_FALLBACK_LAYER = 'Hidden / Meta / Self-referential';
export function toDieNode(n) {
  if ((n.tiers || []).includes('mechanism')) {
    const m = n.mechanism || {};
    return { id: n.id, kind: 'die', label: m.label || n.label || n.id, layer: m.layer || DIE_FALLBACK_LAYER,
      files: m.files || [], triggeredBy: m.triggeredBy || '', description: m.description || '', sector: (n.flow && n.flow.sector) || null };
  }
  const f = n.flow || {}; const md = f.metadata || {};
  return { id: n.id, kind: 'peripheral', label: f.label || n.label || n.id, layer: SECTOR_TO_LAYER[f.sector] || DIE_FALLBACK_LAYER,
    files: Array.isArray(md.files) ? md.files : [], triggeredBy: [f.role, f.detail].filter(Boolean).join(' — '), description: md.purpose || f.detail || '', sector: f.sector || null };
}
export function projectDie(canon) {
  const nodes = canon.nodes.map(toDieNode).sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set(); const edges = [];
  for (const e of canon.edges) { const k = `${e.from} ${e.to} ${e.kind || ''}`; if (seen.has(k)) continue; seen.add(k); const { view, ...rest } = e; edges.push(rest); }
  edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const kinds = {}; for (const n of nodes) kinds[n.kind] = (kinds[n.kind] || 0) + 1;
  const layers = {}; for (const n of nodes) layers[n.layer] = (layers[n.layer] || 0) + 1;
  return { _generated: GEN_MARK + ' — DIE VIEW: the entire unified system (all tiers).', schema: 'yuri.die-graph.v1',
    nodeCount: nodes.length, edgeCount: edges.length, graphEdgeCount: edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to).length,
    kinds, layers, nodes, edges };
}

// losslessness: a projection must reproduce the original view's node set + per-node fields.
export function verifyLossless(canon) {
  const issues = [];
  const origFlow = read(FLOW_VIEW); const projFlow = projectFlow(canon);
  const origMech = read(MECH_VIEW); const projMech = projectMechanism(canon);
  const cmpNodes = (orig, proj, name) => {
    if ((orig.nodes || []).length !== proj.nodes.length) issues.push(`${name}: node count ${orig.nodes.length} -> ${proj.nodes.length}`);
    const oById = new Map((orig.nodes || []).map((n) => [n.id, n]));
    for (const pn of proj.nodes) {
      const on = oById.get(pn.id);
      if (!on) { issues.push(`${name}: projected node ${pn.id} not in original`); continue; }
      for (const k of Object.keys(on)) {
        if (JSON.stringify(on[k]) !== JSON.stringify(pn[k])) issues.push(`${name}:${pn.id}.${k} differs`);
      }
    }
  };
  cmpNodes(origFlow, projFlow, 'flow');
  cmpNodes(origMech, projMech, 'mechanism');
  // DIE drift check (added 2026-06-16): the die-view was NEVER verified, so it silently
  // diverged from canonical (+2 out-of-band nodes COLD_WIKI/SVC_RAG). Without this, `verify`
  // reports lossless=true while the die lies. This closes the blind spot that caused the drift.
  const origDie = fs.existsSync(DIE_VIEW) ? read(DIE_VIEW) : { nodes: [], edges: [] };
  const projDie = projectDie(canon);
  cmpNodes(origDie, projDie, 'die');
  if ((origFlow.edges || []).length !== projFlow.edges.length) issues.push(`flow edges ${origFlow.edges.length} -> ${projFlow.edges.length}`);
  if ((origMech.edges || []).length !== projMech.edges.length) issues.push(`mech edges ${origMech.edges.length} -> ${projMech.edges.length}`);
  if ((origDie.edges || []).length !== projDie.edges.length) issues.push(`die edges ${origDie.edges?.length || 0} -> ${projDie.edges.length}`);
  return { lossless: issues.length === 0, issues: issues.slice(0, 30) };
}

export function loadCanonical() { return read(CANONICAL); }

function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

// ------------------------------------------------------------------------------------------------
// CLI: seed | verify | project | stat
// ------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const op = process.argv[2] || 'stat';
  const stamp = (() => { const i = process.argv.indexOf('--stamp'); return i >= 0 ? process.argv[i + 1] : null; })();
  if (op === 'seed') {
    const canon = seedCanonical();
    if (stamp) canon.generatedAt = stamp;
    const v = verifyLossless(canon);
    writeJson(CANONICAL, canon);
    process.stdout.write(`seeded canonical: ${canon.nodes.length} nodes (${canon.nodes.filter((n) => n.tiers.length > 1).length} multi-tier), ${canon.edges.length} edges. lossless=${v.lossless}\n`);
    if (!v.lossless) { process.stdout.write('  ISSUES:\n  ' + v.issues.join('\n  ') + '\n'); process.exitCode = 1; }
  } else if (op === 'verify') {
    const v = verifyLossless(loadCanonical());
    process.stdout.write(`lossless=${v.lossless}${v.lossless ? '' : '\n  ' + v.issues.join('\n  ')}\n`);
    process.exitCode = v.lossless ? 0 : 1;
  } else if (op === 'project') {
    const canon = loadCanonical();
    if (stamp) canon.generatedAt = stamp;
    writeJson(FLOW_VIEW, projectFlow(canon));
    writeJson(MECH_VIEW, projectMechanism(canon));
    const die = projectDie(canon);
    writeJson(DIE_VIEW, die);
    process.stdout.write(`projected canonical → flow (${projectFlow(canon).nodes.length}) + mechanism (${projectMechanism(canon).nodes.length}) + die (${die.nodeCount} = ${JSON.stringify(die.kinds)}) views.\n`);
  } else {
    const c = fs.existsSync(CANONICAL) ? loadCanonical() : null;
    process.stdout.write(c ? `canonical: ${c.nodes.length} nodes, ${c.edges.length} edges (${c.nodes.filter((n) => n.tiers.length > 1).length} shared flow∩mechanism)\n` : 'no canonical yet — run: yuri-graph-unify.mjs seed\n');
  }
}
