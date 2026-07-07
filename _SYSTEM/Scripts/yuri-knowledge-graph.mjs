#!/usr/bin/env node
// @capability: yuri-knowledge-graph
// @serves: unified knowledge graph | queryable code graph | YURI structural map | knowledge graph build | graph query | node neighbors | orphans scan | associative recall
// @does: deterministic static scan of YURI scripts, capabilities, skills, state files, registries, docs, and mure roles into ONE queryable knowledge graph with typed nodes + typed edges, with --query/--neighbors/--stats/--orphans/--recall CLI
// @use: reach for this to answer "what connects to X in YURI" — structural queries, dependency neighborhood, open-end/orphan detection, and associative recall via spreading-activation-memory.mjs
// @exports: buildGraph, loadGraph, queryGraph, getNeighbors, findOrphans, toActivationGraph, main
//
// yuri-knowledge-graph.mjs — The ONE unified queryable knowledge graph of YURI.
// CAPABILITY-FIRST: reuses spreading-activation-memory.mjs (createGraph/addNode/addEdge/recall),
// capabilities.json (capability-scan output), skill-index.json (skill-sync output), and
// fleet-roles.json (mure role registry). Does NOT rebuild them — it indexes them into one graph.
//
// Bounded: no network, node stdlib only, top-100-line import headers, frontmatter-only skill scan,
// targeted state-ref grep. Runtime target <60s.
//
// CLI:
//   node yuri-knowledge-graph.mjs --build            → scan + write _SYSTEM/state/yuri-knowledge-graph.json
//   node yuri-knowledge-graph.mjs --query <term>      → substring+token match over labels/meta
//   node yuri-knowledge-graph.mjs --neighbors <nodeId> [--depth N]
//   node yuri-knowledge-graph.mjs --stats             → graph statistics
//   node yuri-knowledge-graph.mjs --orphans           → nodes with zero edges (open ends)
//   node yuri-knowledge-graph.mjs --recall <seed,seed> → spreading-activation associative retrieval
//
// Node types: script, capability, skill, state-file, registry, doc, mure-role
// Edge types: imports, registers-capability, reads-state, writes-state, documents, invokes, role-uses

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGraph, addNode, addEdge, recall } from './spreading-activation-memory.mjs';

// ── Constants ───────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYS = path.resolve(HERE, '..');
const ROOT = path.resolve(SYS, '..');
const REPO = ROOT;

const OUT_PATH = path.join(SYS, 'state', 'yuri-knowledge-graph.json');
const CAPABILITIES_PATH = path.join(SYS, 'capabilities.json');
const SKILL_INDEX_PATH = path.join(ROOT, 'skills', 'skill-index.json');
const FLEET_ROLES_PATH = path.join(SYS, 'config', 'fleet-roles.json');
const BUILT_AT = new Date().toISOString().slice(0, 10); // was hardcoded '2026-07-04' — silently stale on every rebuild until now (Fable-5 pass 2026-07-07)
const IMPORT_LINE_LIMIT = 100; // top-100-line import headers

// Script directories to scan (mirrors capability-scan.mjs DIRS + extras)
const SCRIPT_DIRS = [
  path.join(SYS, 'Scripts'),
  path.join(SYS, 'Scripts', '_lib'),
  path.join(SYS, 'Scripts', 'math'),
  path.join(SYS, 'Scripts', 'schemas'),
  path.join(SYS, 'Scripts', 'security'),
  path.join(SYS, 'Scripts', 'self-improvement'),
  path.join(SYS, 'Scripts', 'policy'),
  path.join(SYS, 'Scripts', 'voice'),
  path.join(SYS, 'Scripts', 'swarm'),
  path.join(SYS, 'Scripts', 'kagami'),
  path.join(SYS, 'Scripts', 'yuri'),
  path.join(SYS, 'mure'),
];

// Registry JSON files to index as registry nodes
const REGISTRY_FILES = [
  path.join(SYS, 'config', 'folder-registry.json'),
  path.join(SYS, 'config', 'artifact-registry.json'),
  path.join(SYS, 'config', 'context-registry.json'),
  path.join(SYS, 'config', 'fleet-roles.json'),
  path.join(SYS, 'config', 'llm-affinity-matrix.json'),
  path.join(SYS, 'config', 'usage-budget.json'),
  path.join(SYS, 'capabilities.json'),
  path.join(ROOT, 'skills', 'skill-index.json'),
  path.join(SYS, 'Scripts', 'router-policy.json'),
  path.join(SYS, 'Scripts', 'nexus-guard-contracts.json'),
  path.join(SYS, 'Scripts', 'lane-capability-manifest.json'),
  path.join(SYS, 'Scripts', 'intent-schema.json'),
  path.join(SYS, 'Scripts', 'deepseek-action-schema.json'),
];

// Key docs to index as doc nodes
const DOC_FILES = [
  path.join(SYS, 'yuri-origin.md'),
  path.join(ROOT, 'SOUL.md'),
  path.join(SYS, 'INDEX.md'),
  path.join(SYS, 'context', 'README.md'),
  path.join(SYS, 'yuri-graph.json'),
  path.join(SYS, 'yuri-graph-state.json'),
  path.join(SYS, 'FABLE-5-PROTOCOL.md'),
].filter(f => fs.existsSync(f));

// State file patterns for targeted grep (reads-state, writes-state edges)
const STATE_REF_REGEX = /['"`](_SYSTEM\/state\/[^'"`)\s]+|_SYSTEM\/state\/[a-z][\w/-]+)/g;

// ── Graph builder ───────────────────────────────────────────────────────────

/**
 * Deterministic static scan → { nodes, edges, stats, builtAt }.
 * No network, node stdlib only, bounded scans.
 */
export function buildGraph() {
  const nodes = new Map(); // id → { id, type, path, label, meta }
  const edges = [];        // { from, to, type, evidence }
  const scriptIds = new Map(); // relPath → nodeId (for import resolution)

  const addNodeEntry = (id, type, filePath, label, meta = {}) => {
    const rel = relPath(filePath);
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, path: rel, label, meta: { ...meta } });
    } else {
      // Merge meta (later sources can enrich)
      const existing = nodes.get(id);
      existing.meta = { ...existing.meta, ...meta };
    }
    return id;
  };

  const addEdgeEntry = (from, to, type, evidence = '') => {
    if (!from || !to || from === to) return;
    // Deduplicate edges by (from,to,type)
    const key = `${from}\0${to}\0${type}`;
    if (_edgeSeen.has(key)) return;
    _edgeSeen.add(key);
    edges.push({ from, to, type, evidence });
  };
  const _edgeSeen = new Set();

  // ── 1. Scripts (import graph + capability registration + state refs) ──────

  const scriptFiles = [];
  for (const dir of SCRIPT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const entries = scanMjs(dir);
    for (const f of entries) scriptFiles.push(f);
  }

  // Deduplicate by resolved path
  const seenFiles = new Set();
  const uniqueScripts = [];
  for (const f of scriptFiles) {
    const rp = relPath(f);
    if (!seenFiles.has(rp)) { seenFiles.add(rp); uniqueScripts.push(f); }
  }

  for (const file of uniqueScripts) {
    const rp = relPath(file);
    const base = path.basename(rp);
    const id = `script:${rp}`;
    addNodeEntry(id, 'script', file, base, { relPath: rp });
    scriptIds.set(rp, id);
    // Also register by basename for import resolution
    scriptIds.set(base, id);
  }

  // Parse imports + capability tags + state refs for each script
  for (const file of uniqueScripts) {
    const rp = relPath(file);
    const sourceId = scriptIds.get(rp);
    if (!sourceId) continue;

    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    const headerLines = lines.slice(0, IMPORT_LINE_LIMIT);

    // a) Static imports → edges type 'imports'
    for (const line of headerLines) {
      const m = line.match(/^import\s+.*?from\s+['"`]([^'"`]+)['"`]/);
      if (!m) continue;
      const importPath = m[1];
      // Skip bare specifiers (node:*, npm packages, absolute URLs)
      if (!importPath.startsWith('.')) continue;
      // Resolve relative to the importing file's directory
      const resolved = path.resolve(path.dirname(file), importPath);
      // Normalize: try with .mjs extension if missing
      let resolvedRels = [];
      const tryPaths = [resolved];
      if (!resolved.endsWith('.mjs')) {
        tryPaths.push(resolved + '.mjs');
        tryPaths.push(path.join(resolved, 'index.mjs'));
      }
      for (const tp of tryPaths) {
        const rel = relPath(tp);
        resolvedRels.push(rel);
      }
      // Find the target script node
      for (const rel of resolvedRels) {
        const targetId = scriptIds.get(rel);
        if (targetId) {
          addEdgeEntry(sourceId, targetId, 'imports', `import from '${importPath}'`);
          break;
        }
      }
    }

    // b) @capability annotation → registers-capability edge
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(?:\/\/|#)\s*@capability:\s*(\S+)/);
      if (!m) continue;
      const capId = m[1].trim();
      addEdgeEntry(sourceId, `capability:${capId}`, 'registers-capability', `@capability:${capId} at line ${i + 1}`);
    }

    // c) State file references → reads-state / writes-state edges
    const stateRefs = new Set();
    let allContent = content;
    for (const m of allContent.matchAll(STATE_REF_REGEX)) {
      stateRefs.add(m[1]);
    }
    for (const stateRef of stateRefs) {
      // Normalize: strip trailing quotes, take the _SYSTEM/state/... prefix
      const cleanRef = stateRef.replace(/['"`]$/, '').replace(/\/$/, '');
      // Determine read vs write heuristically from surrounding context
      const isWrite = isStateWriteContext(allContent, cleanRef);
      const stateNodeId = `state-file:${cleanRef}`;
      addEdgeEntry(
        sourceId,
        stateNodeId,
        isWrite ? 'writes-state' : 'reads-state',
        `${isWrite ? 'writes' : 'reads'} ${cleanRef}`
      );
    }
  }

  // ── 2. Capabilities ──────────────────────────────────────────────────────

  if (fs.existsSync(CAPABILITIES_PATH)) {
    try {
      const capData = JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf8'));
      const caps = capData.capabilities || [];
      for (const cap of caps) {
        const capNodeId = `capability:${cap.id}`;
        addNodeEntry(
          capNodeId, 'capability', CAPABILITIES_PATH, cap.id,
          {
            serves: cap.serves || [],
            does: cap.does || '',
            exports: cap.exports || [],
            mechanism: cap.mechanism || '',
          }
        );
        // registers-capability edge from mechanism script
        if (cap.mechanism) {
          const mechRel = cap.mechanism;
          const mechScriptId = scriptIds.get(mechRel);
          if (mechScriptId) {
            addEdgeEntry(mechScriptId, capNodeId, 'registers-capability', `mechanism=${mechRel}`);
          } else {
            // Try resolving mechanism path directly
            const mechAbs = path.resolve(ROOT, mechRel);
            if (fs.existsSync(mechAbs)) {
              const mechId = `script:${mechRel}`;
              addNodeEntry(mechId, 'script', mechAbs, path.basename(mechRel), { relPath: mechRel });
              scriptIds.set(mechRel, mechId);
              addEdgeEntry(mechId, capNodeId, 'registers-capability', `mechanism=${mechRel}`);
            }
          }
        }
      }
    } catch (e) { /* capabilities parse failure is non-fatal */ }
  }

  // ── 3. Skills ────────────────────────────────────────────────────────────

  if (fs.existsSync(SKILL_INDEX_PATH)) {
    try {
      const skillData = JSON.parse(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
      const skills = skillData.skills || [];
      for (const skill of skills) {
        const skillNodeId = `skill:${skill.id}`;
        addNodeEntry(
          skillNodeId, 'skill', SKILL_INDEX_PATH, skill.id,
          { sourceFamily: skill.sourceFamily || '', skillPath: skill.path || '' }
        );
        // documents edge: skill → its SKILL.md if it exists
        const skillMd = path.join(ROOT, skill.path || `skills/${skill.id}/SKILL.md`);
        if (fs.existsSync(skillMd)) {
          // Try to find if any script documents this skill (via @capability reference)
          for (const [sid, snode] of nodes) {
            if (snode.type === 'script' && snode.meta?.relPath) {
              // Check if the script mentions the skill id in its capability serves
              // (handled via capability overlap check below)
            }
          }
        }
      }
    } catch (e) { /* skill-index parse failure is non-fatal */ }
  }

  // ── 4. State files (as nodes, already referenced by edges above) ──────────

  // The state-file nodes are implicitly created by the edge targets; materialize them.
  const stateNodeIds = new Set();
  for (const e of edges) {
    if (e.to.startsWith('state-file:')) stateNodeIds.add(e.to);
  }
  for (const sid of stateNodeIds) {
    const stateRel = sid.replace('state-file:', '');
    if (!nodes.has(sid)) {
      addNodeEntry(sid, 'state-file', path.join(REPO, stateRel), path.basename(stateRel), {});
    }
  }

  // ── 5. Registries ────────────────────────────────────────────────────────

  for (const regFile of REGISTRY_FILES) {
    if (!fs.existsSync(regFile)) continue;
    const regRel = relPath(regFile);
    const regId = `registry:${regRel}`;
    addNodeEntry(regId, 'registry', regFile, path.basename(regFile), { relPath: regRel });
    // documents edge: scripts that read this registry
    for (const [sid, snode] of nodes) {
      if (snode.type !== 'script' || !snode.meta?.relPath) continue;
      // Check if the script references this registry path
      let scontent;
      try { scontent = fs.readFileSync(path.join(REPO, snode.meta.relPath), 'utf8'); } catch { continue; }
      if (scontent.includes(regRel)) {
        addEdgeEntry(sid, regId, 'documents', `references ${regRel}`);
      }
    }
  }

  // ── 6. Docs ──────────────────────────────────────────────────────────────

  for (const docFile of DOC_FILES) {
    const docRel = relPath(docFile);
    const docId = `doc:${docRel}`;
    addNodeEntry(docId, 'doc', docFile, path.basename(docFile), { relPath: docRel });
    // documents edges: which scripts are mentioned in this doc
    let dcontent;
    try { dcontent = fs.readFileSync(docFile, 'utf8'); } catch { continue; }
    for (const [sid, snode] of nodes) {
      if (snode.type !== 'script' || !snode.meta?.relPath) continue;
      if (dcontent.includes(snode.meta.relPath) || dcontent.includes(snode.label)) {
        addEdgeEntry(docId, sid, 'documents', `mentions ${snode.label}`);
      }
    }
  }

  // ── 7. MURE roles ────────────────────────────────────────────────────────

  if (fs.existsSync(FLEET_ROLES_PATH)) {
    try {
      const roleData = JSON.parse(fs.readFileSync(FLEET_ROLES_PATH, 'utf8'));
      const roles = roleData.roles || [];
      for (const role of roles) {
        const roleId = `mure-role:${role.id}`;
        addNodeEntry(
          roleId, 'mure-role', FLEET_ROLES_PATH, role.name || role.id,
          {
            group: role.group || '',
            archetype: role.archetype || '',
            lane: role.lane || '',
            capabilities: role.capabilities || [],
          }
        );
        // role-uses edge: role → capabilities it matches
        for (const roleCap of (role.capabilities || [])) {
          // Find matching capability nodes by capability id or serves overlap
          for (const [cid, cnode] of nodes) {
            if (cnode.type !== 'capability') continue;
            if (cid === `capability:${roleCap}` ||
                (cnode.meta?.serves || []).some(s => s.includes(roleCap))) {
              addEdgeEntry(roleId, cid, 'role-uses', `capability match: ${roleCap}`);
            }
          }
        }
        // role-uses edge: role → scripts it invokes (lane substrate scripts)
        if (role.lane) {
          for (const [sid, snode] of nodes) {
            if (snode.type !== 'script') continue;
            if (snode.label && snode.label.includes(role.lane)) {
              // Only connect if there's a real lane script
              if (snode.label === `${role.lane}.mjs` || snode.label === `${role.lane}-lane.mjs`) {
                addEdgeEntry(roleId, sid, 'invokes', `lane: ${role.lane}`);
              }
            }
          }
        }
      }
    } catch (e) { /* fleet-roles parse failure is non-fatal */ }
  }

  // ── 8. Cross-type edges: capability → skill (role-uses when serves overlap) ─

  for (const [cid, cnode] of nodes) {
    if (cnode.type !== 'capability') continue;
    const serves = cnode.meta?.serves || [];
    for (const [sid, snode] of nodes) {
      if (snode.type !== 'skill') continue;
      // Match if the skill id appears in the capability's serves list
      if (serves.some(s => s.toLowerCase().includes(snode.label.toLowerCase().split('-')[0]))) {
        // Loose match — only if the skill id is a strong substring
        const skillLabel = snode.label.toLowerCase();
        const strongMatch = serves.some(s => s.toLowerCase().includes(skillLabel) || skillLabel.includes(s.toLowerCase().replace(/\s+/g, '-')));
        if (strongMatch) {
          addEdgeEntry(cid, sid, 'documents', `serves overlap: ${snode.label}`);
        }
      }
    }
  }

  // ── 9. Build adjacency for orphan detection ───────────────────────────────

  const nodeEdgeCount = new Map();
  for (const n of nodes.keys()) nodeEdgeCount.set(n, 0);
  for (const e of edges) {
    nodeEdgeCount.set(e.from, (nodeEdgeCount.get(e.from) || 0) + 1);
    nodeEdgeCount.set(e.to, (nodeEdgeCount.get(e.to) || 0) + 1);
  }

  // ── 10. Stats ─────────────────────────────────────────────────────────────

  const nodeByType = {};
  for (const n of nodes.values()) {
    nodeByType[n.type] = (nodeByType[n.type] || 0) + 1;
  }
  const edgeByType = {};
  for (const e of edges) {
    edgeByType[e.type] = (edgeByType[e.type] || 0) + 1;
  }

  const stats = {
    totalNodes: nodes.size,
    totalEdges: edges.length,
    nodeByType,
    edgeByType,
    orphanCount: [...nodeEdgeCount.values()].filter(c => c === 0).length,
  };

  return {
    nodes: [...nodes.values()],
    edges,
    stats,
    builtAt: BUILT_AT,
  };
}

// ── File helpers ────────────────────────────────────────────────────────────

function relPath(absPath) {
  return path.relative(REPO, absPath).split(path.sep).join('/');
}

function scanMjs(dir, _depth = 0) {
  const result = [];
  if (_depth > 2) return result; // bounded depth
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirs (bounded)
      result.push(...scanMjs(full, _depth + 1));
    } else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) {
      result.push(full);
    }
  }
  return result;
}

/**
 * Heuristic: does the context around a state ref suggest a write?
 * Looks for writeFileSync/appendFileSync/mkdirSync near the reference.
 */
function isStateWriteContext(content, ref) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(ref)) {
      // Check this line + ±2 lines for write semantics
      const window = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
      if (/writeFileSync|appendFileSync|mkdirSync|\.write\(|OUTPUT|OUT_PATH|WRITE/i.test(window)) {
        return true;
      }
      // Check if it's in an assignment context (const X = '_SYSTEM/state/...')
      if (/=\s*['"`]_SYSTEM\/state\//.test(lines[i])) {
        // Check if the variable is used for writing later (simplified: check 50 lines)
        const varMatch = lines[i].match(/(?:const|let|var)\s+(\w+)\s*=/);
        if (varMatch) {
          const varName = varMatch[1];
          for (let j = i; j < Math.min(i + 50, lines.length); j++) {
            if (/writeFileSync|appendFileSync/.test(lines[j]) && lines[j].includes(varName)) return true;
          }
        }
      }
    }
  }
  return false;
}

// ── Query functions ─────────────────────────────────────────────────────────

export function loadGraph(graphPath = OUT_PATH) {
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
}

/**
 * Substring + token match over labels and meta fields.
 * Returns ranked list of matching nodes.
 */
export function queryGraph(graph, term) {
  const lower = term.toLowerCase();
  const tokens = lower.split(/[\s,]+/).filter(Boolean);
  const results = [];

  for (const node of graph.nodes) {
    let score = 0;
    const haystacks = [
      node.label?.toLowerCase() || '',
      node.id.toLowerCase(),
      JSON.stringify(node.meta || {}).toLowerCase(),
    ];
    const haystack = haystacks.join(' \0 ');

    // Exact substring match → high score
    if (node.label?.toLowerCase().includes(lower)) score += 10;
    if (node.id.toLowerCase().includes(lower)) score += 8;

    // Token matches
    for (const tok of tokens) {
      if (haystack.includes(tok)) score += 1;
    }

    if (score > 0) {
      // Count edges for this node
      const edgeCount = graph.edges.filter(e => e.from === node.id || e.to === node.id).length;
      results.push({ node, score, edgeCount });
    }
  }

  results.sort((a, b) => b.score - a.score || b.edgeCount - a.edgeCount || a.node.id.localeCompare(b.node.id));
  return results;
}

/**
 * Get neighbors of a node up to depth N (BFS over edge adjacency).
 */
export function getNeighbors(graph, nodeId, depth = 1) {
  if (!graph.nodes.find(n => n.id === nodeId)) return { found: false, neighbors: [] };

  // Build adjacency from edges (undirected for neighborhood)
  const adj = new Map();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push({ id: e.to, type: e.type, dir: 'out' });
    adj.get(e.to).push({ id: e.from, type: e.type, dir: 'in' });
  }

  const visited = new Set([nodeId]);
  const frontier = [nodeId];
  const neighbors = [];

  for (let d = 0; d < depth; d++) {
    const nextFrontier = [];
    for (const curr of frontier) {
      const edges = adj.get(curr) || [];
      for (const e of edges) {
        if (!visited.has(e.id)) {
          visited.add(e.id);
          const node = graph.nodes.find(n => n.id === e.id);
          if (node) {
            neighbors.push({ node, depth: d + 1, edgeType: e.type, direction: e.dir });
          }
          nextFrontier.push(e.id);
        }
      }
    }
    frontier.length = 0;
    frontier.push(...nextFrontier);
  }

  return { found: true, neighbors };
}

/**
 * Find orphan nodes (zero edges) — open ends in the graph.
 */
export function findOrphans(graph) {
  const edgeNodes = new Set();
  for (const e of graph.edges) {
    edgeNodes.add(e.from);
    edgeNodes.add(e.to);
  }
  return graph.nodes.filter(n => !edgeNodes.has(n.id));
}

/**
 * Convert the knowledge graph into a spreading-activation-memory graph
 * for associative recall. Edges become undirected weighted edges.
 */
export function toActivationGraph(graph) {
  const ag = createGraph();

  // Add all nodes
  for (const node of graph.nodes) {
    addNode(ag, node.id, {
      useCount: 1,
      lastUsedMs: 0,
      meta: { type: node.type, label: node.label, path: node.path },
    });
  }

  // Add all edges as undirected (weight by edge type)
  const typeWeights = {
    imports: 2,
    'registers-capability': 3,
    'reads-state': 1,
    'writes-state': 1.5,
    documents: 0.5,
    invokes: 2,
    'role-uses': 1.5,
  };

  for (const e of graph.edges) {
    const w = typeWeights[e.type] || 1;
    addEdge(ag, e.from, e.to, w);
  }

  return ag;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`yuri-knowledge-graph.mjs — The ONE unified queryable knowledge graph of YURI

Usage:
  --build                    Scan YURI + write ${relPath(OUT_PATH)}
  --query <term>             Substring+token match over labels/meta
  --neighbors <nodeId>       BFS neighborhood [--depth N, default 1]
  --stats                    Graph statistics
  --orphans                  Nodes with zero edges (open ends)
  --recall <seed,seed>       Spreading-activation associative retrieval
  --help                     This message

Node types: script, capability, skill, state-file, registry, doc, mure-role
Edge types: imports, registers-capability, reads-state, writes-state, documents, invokes, role-uses`);
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // --build
  if (args.includes('--build')) {
    const t0 = Date.now();
    const graph = buildGraph();
    fs.writeFileSync(OUT_PATH, JSON.stringify(graph, null, 2));
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`✓ Built knowledge graph → ${relPath(OUT_PATH)}`);
    console.log(`  Nodes: ${graph.stats.totalNodes} | Edges: ${graph.stats.totalEdges} | Orphans: ${graph.stats.orphanCount}`);
    console.log(`  Built in ${elapsed}s (builtAt: ${graph.builtAt})`);
    return;
  }

  // All other commands need the graph loaded
  let graph;
  try {
    graph = loadGraph();
  } catch {
    console.error('✗ No knowledge graph found. Run --build first.');
    process.exit(1);
  }

  // --stats
  if (args.includes('--stats')) {
    console.log('╔══ YURI Knowledge Graph — Stats ══╗');
    console.log(`  Total nodes: ${graph.stats.totalNodes}`);
    console.log(`  Total edges: ${graph.stats.totalEdges}`);
    console.log(`  Orphans:     ${graph.stats.orphanCount}`);
    console.log(`  Built at:    ${graph.builtAt}`);
    console.log('  ── Nodes by type ──');
    for (const [type, count] of Object.entries(graph.stats.nodeByType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(16)} ${count}`);
    }
    console.log('  ── Edges by type ──');
    for (const [type, count] of Object.entries(graph.stats.edgeByType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(22)} ${count}`);
    }
    return;
  }

  // --query <term>
  const qi = args.indexOf('--query');
  if (qi >= 0 && args[qi + 1]) {
    const term = args[qi + 1];
    const results = queryGraph(graph, term);
    console.log(`🔍 Query "${term}" → ${results.length} matches`);
    for (const r of results.slice(0, 30)) {
      console.log(`  [${r.score}] ${r.node.type}:${r.node.label} (${r.edgeCount} edges) → ${r.node.id}`);
    }
    if (results.length > 30) console.log(`  ... and ${results.length - 30} more`);
    return;
  }

  // --neighbors <nodeId> [--depth N]
  const ni = args.indexOf('--neighbors');
  if (ni >= 0 && args[ni + 1]) {
    const nodeId = args[ni + 1];
    const di = args.indexOf('--depth');
    const depth = di >= 0 ? parseInt(args[di + 1], 10) || 1 : 1;
    const result = getNeighbors(graph, nodeId, depth);
    if (!result.found) {
      console.error(`✗ Node not found: ${nodeId}`);
      console.log('  Hint: use --query to find node IDs.');
      process.exit(1);
    }
    console.log(`🔗 Neighbors of ${nodeId} (depth ${depth}) → ${result.neighbors.length} nodes`);
    for (const nb of result.neighbors.sort((a, b) => a.depth - b.depth || a.node.id.localeCompare(b.node.id))) {
      console.log(`  [d${nb.depth}] ${nb.direction === 'out' ? '→' : '←'}${nb.edgeType} ${nb.node.type}:${nb.node.label}`);
    }
    return;
  }

  // --orphans
  if (args.includes('--orphans')) {
    const orphans = findOrphans(graph);
    console.log(`👻 Orphan nodes (zero edges) → ${orphans.length}`);
    // Group by type
    const byType = {};
    for (const o of orphans) {
      byType[o.type] = (byType[o.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type.padEnd(16)} ${count}`);
    }
    console.log('  ── Sample orphans ──');
    for (const o of orphans.slice(0, 30)) {
      console.log(`    ${o.type}:${o.label} → ${o.id}`);
    }
    if (orphans.length > 30) console.log(`    ... and ${orphans.length - 30} more`);
    return;
  }

  // --recall <seed,seed>
  const ri = args.indexOf('--recall');
  if (ri >= 0 && args[ri + 1]) {
    const seedInput = args[ri + 1];
    const seeds = seedInput.split(',').map(s => s.trim()).filter(Boolean);
    const ag = toActivationGraph(graph);
    // Validate seeds exist
    const validSeeds = seeds.filter(s => ag.nodes.has(s));
    if (validSeeds.length === 0) {
      console.error(`✗ No valid seed node IDs. Provided: ${seeds.join(', ')}`);
      console.log('  Hint: use --query to find node IDs (e.g. "capability:memory-kernel" or "script:_SYSTEM/Scripts/xref-query.mjs")');
      process.exit(1);
    }
    const results = recall(ag, validSeeds, { damping: 0.85, iterations: 30, useCountBoost: 0.1 });
    console.log(`🧠 Spreading-activation recall from [${validSeeds.join(', ')}] → ${results.length} activated`);
    for (const r of results.slice(0, 30)) {
      const node = graph.nodes.find(n => n.id === r.id);
      const label = node ? `${node.type}:${node.label}` : r.id;
      console.log(`  [${r.activation.toFixed(6)}] ${label} → ${r.id}`);
    }
    if (results.length > 30) console.log(`  ... and ${results.length - 30} more`);
    return;
  }

  // Unknown command
  console.error('Unknown command. Use --help.');
  process.exit(1);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
