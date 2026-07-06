// YURI Roadmap Organ 1 — Spreading-Activation Memory
// Deterministic neural-network-style activation over the memory graph:
// personalized PageRank power iteration + Hebbian co-recall + temporal decay.
// Pure linear algebra. No embeddings, no training, no stochasticity.
//
// Dock points:
//   memory_governor  → use_count per node feeds the prior multiplier
//   .claude/memory   → frontmatter name: → node id; [[wiki-links]] → structural edges
//   FTS5 hybrid      → later; spreading activation + BM25/keyword recall
//
// Promotion gate: must beat FTS5-only recall on a judged query set
// (run by the main lane, not this module).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

// ── Core (IO-free) ──────────────────────────────────────────────────────────

// ∅ → {nodes: Map, edges: Map}
// @capability: spreading-activation-memory
// @serves: spreading activation over memory graph | personalized PageRank recall | Hebbian co-recall | temporal decay of memory edges | associative recall from seeds
// @does: deterministic neural-style activation over the memory graph — personalized PageRank power iteration + Hebbian co-recall + temporal decay (pure linear algebra, no embeddings/training/stochasticity)
// @use: associative "what's related to these seeds" recall over a memory/knowledge graph, with use-strengthening (Hebbian) and forgetting (decay); the graph-recall complement to fuzzy-cross-surface-match
// @exports: createGraph, addNode, addEdge, hebbianCoRecall, decayWeights, recall
export function createGraph() {
  return { nodes: new Map(), edges: new Map() };
}

// node(id) := merge(attrs) onto existing or insert with defaults; idempotent per id.
export function addNode(graph, id, attrs = {}) {
  const prev = graph.nodes.get(id);
  if (prev) {
    if (attrs.useCount !== undefined) prev.useCount = attrs.useCount;
    if (attrs.lastUsedMs !== undefined) prev.lastUsedMs = attrs.lastUsedMs;
    if (attrs.meta !== undefined) prev.meta = { ...prev.meta, ...attrs.meta };
  } else {
    graph.nodes.set(id, {
      useCount: attrs.useCount ?? 1,
      lastUsedMs: attrs.lastUsedMs ?? 0,
      meta: attrs.meta ?? {},
    });
  }
}

// Canonical undirected edge key: lexicographic sort, pipe separator.
function ek(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// edge(a,b).w += w; self-loop(a,a) = ∅.
export function addEdge(graph, a, b, w = 1) {
  if (a === b) return;
  const key = ek(a, b);
  const prev = graph.edges.get(key);
  if (prev) { prev.w += w; }
  else { graph.edges.set(key, { w, lastReinforcedMs: 0 }); }
}

// ∀ i<j in ids: edge(ids[i],ids[j]).w += increment; lastReinforcedMs = nowMs.
export function hebbianCoRecall(graph, ids, increment = 1, nowMs = 0) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = ek(ids[i], ids[j]);
      const prev = graph.edges.get(key);
      if (prev) {
        prev.w += increment;
        prev.lastReinforcedMs = nowMs;
      } else {
        graph.edges.set(key, { w: increment, lastReinforcedMs: nowMs });
      }
    }
  }
}

// edge.w *= 2^(-(nowMs − lastReinforcedMs) / halfLifeMs) for each edge.
export function decayWeights(graph, nowMs, halfLifeMs) {
  if (halfLifeMs <= 0) return;
  const k = -Math.LN2 / halfLifeMs;
  for (const e of graph.edges.values()) {
    const elapsed = nowMs - e.lastReinforcedMs;
    if (elapsed > 0) e.w *= Math.exp(k * elapsed);
  }
}

// v = PPR(seeds, damping, iterations) with dangling→seeds redistribution;
// activation = v × (1 + useCountBoost · log(1 + useCount)); sorted desc, zero excluded.
export function recall(graph, seedIds, opts = {}) {
  const { damping = 0.85, iterations = 30, useCountBoost = 0.1 } = opts;
  const nids = [...graph.nodes.keys()];
  const n = nids.length;
  if (n === 0) return [];
  const idx = new Map(nids.map((id, i) => [id, i]));
  const seeds = seedIds.filter(s => graph.nodes.has(s));
  if (seeds.length === 0) return [];

  // Teleport vector (uniform over valid seeds)
  const tp = new Float64Array(n);
  const invS = 1 / seeds.length;
  for (const s of seeds) tp[idx.get(s)] = invS;

  // Sparse column-normalised transition + dangling set
  const adj = Array.from({ length: n }, () => []);
  for (const [key, edge] of graph.edges) {
    const sep = key.indexOf('|');
    const ai = idx.get(key.slice(0, sep));
    const bi = idx.get(key.slice(sep + 1));
    if (ai === undefined || bi === undefined) continue;
    adj[ai].push([bi, edge.w]);
    adj[bi].push([ai, edge.w]);
  }
  const col = Array.from({ length: n }, () => []);
  const dng = [];
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (const [, w] of adj[j]) s += w;
    if (s > 0) { for (const [i, w] of adj[j]) col[j].push([i, w / s]); }
    else dng.push(j);
  }

  // Power iteration
  let v = new Float64Array(n);
  let v2 = new Float64Array(n);
  v.set(tp);
  for (let t = 0; t < iterations; t++) {
    v2.fill(0);
    for (let j = 0; j < n; j++) {
      if (v[j] === 0) continue;
      for (const [i, cw] of col[j]) v2[i] += v[j] * cw;
    }
    if (dng.length) {
      let dm = 0;
      for (const d of dng) dm += v[d];
      if (dm > 0) { const dp = dm * invS; for (const s of seeds) v2[idx.get(s)] += dp; }
    }
    for (let i = 0; i < n; i++) v2[i] = damping * v2[i] + (1 - damping) * tp[i];
    [v, v2] = [v2, v];
  }

  // Apply node prior, collect, sort
  const results = [];
  for (let i = 0; i < n; i++) {
    if (v[i] <= 0) continue;
    const prior = 1 + useCountBoost * Math.log(1 + graph.nodes.get(nids[i]).useCount);
    results.push({ id: nids[i], activation: v[i] * prior });
  }
  results.sort((a, b) => b.activation - a.activation || a.id.localeCompare(b.id));
  return results;
}

// Lossless round-trip: fromJSON(toJSON(g)) ≡ g (structural identity).
export function toJSON(graph) {
  return {
    nodes: [...graph.nodes.entries()].map(([id, n]) => [id, { ...n, meta: { ...n.meta } }]),
    edges: [...graph.edges.entries()].map(([k, e]) => [k, { ...e }]),
  };
}

// Restore graph from a toJSON-produced object.
export function fromJSON(json) {
  const g = createGraph();
  for (const [id, a] of json.nodes) g.nodes.set(id, { ...a, meta: { ...a.meta } });
  for (const [k, e] of json.edges) g.edges.set(k, { ...e });
  return g;
}

// ── Adapter (the only IO) ──────────────────────────────────────────────────

// Line-based frontmatter parser (between --- markers; no YAML lib).
function parseFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { body: raw };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') { end = i; break; }
  }
  if (end < 0) return { body: raw };
  const fm = {};
  for (let i = 1; i < end; i++) {
    const col = lines[i].indexOf(':');
    if (col < 1) continue;
    fm[lines[i].slice(0, col).trim().toLowerCase()] = lines[i].slice(col + 1).trim();
  }
  fm.body = lines.slice(end + 1).join('\n');
  return fm;
}

// Deterministic from filesystem snapshot: nodes from frontmatter name/filename,
// edges from [[wiki-links]] (weight 1/occurrence) and shared metadata.type
// (weight 0.2, ≤50 nodes per type group; larger groups skipped to avoid cliques).
export function ingestMemoryDir(dir) {
  const graph = createGraph();
  const files = readdirSync(dir).filter(f => extname(f) === '.md');
  const parsed = [];
  const typeMap = new Map(); // type → [nodeId]
  const fileToId = new Map(); // filename / filename.md → nodeId

  // Pass 1: parse frontmatter, create nodes, index types and filenames
  for (const file of files) {
    const fp = join(dir, file);
    const raw = readFileSync(fp, 'utf8');
    const fm = parseFrontmatter(raw);
    const id = (fm.name && fm.name.trim()) || basename(file, '.md');
    const st = statSync(fp);
    addNode(graph, id, {
      useCount: fm.usecount ? (parseInt(fm.usecount, 10) || 1) : 1,
      lastUsedMs: st.mtimeMs,
      meta: { type: fm.type ?? null, file },
    });
    parsed.push({ id, body: fm.body ?? '' });
    fileToId.set(file, id);
    fileToId.set(basename(file, '.md'), id);
    if (fm.type) {
      const arr = typeMap.get(fm.type);
      if (arr) arr.push(id); else typeMap.set(fm.type, [id]);
    }
  }

  const ids = new Set(graph.nodes.keys());

  // Pass 2: edges from [[wiki-links]] (weight 1 per occurrence)
  for (const { id, body } of parsed) {
    for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
      let target = m[1].split('|')[0].split('#')[0].trim();
      if (!ids.has(target)) target = fileToId.get(target) ?? null;
      if (target && ids.has(target) && target !== id) addEdge(graph, id, target, 1);
    }
  }

  // Pass 3: edges from shared metadata.type (weight 0.2; skip groups > 50)
  for (const [, members] of typeMap) {
    if (members.length > 50) continue;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        addEdge(graph, members[i], members[j], 0.2);
  }

  return graph;
}
