#!/usr/bin/env node
// atlas-edges.mjs — YURI Atlas Phase 1b: dense real edge list across canonical nodes
//
// @capability: atlas-edges
// @serves: dependency edges between YURI atlas nodes | import graph | call graph | fix edge sparsity
//   for atlas-regions clustering | dense real edge list
// @does: builds _SYSTEM/state/atlas/edges.json by combining (priority order) GitNexus
//   File-level IMPORTS edges (via `gitnexus cypher`; File->Function CALLS was evaluated
//   and rejected as a source — see extractGitNexusEdges doc comment for the 3 verified
//   false-positive modes), a static import/require scanner over tracked .mjs/.js/.ts/.tsx
//   files, and the existing circuitry (calls/reads only, never writes) + knowledge-graph
//   edge sources — every endpoint mapped through the canonical id-map.json, deduped,
//   weighted by source count.
// @use: run after atlas-identity.mjs (id-map.json must exist); do not hand-roll a second
//       import scanner or a parallel gitnexus probe — this is the one edge-density pass.
//       Feeds atlas-regions.mjs, which currently clusters on ~0.55 edges/node.
// @exports: normalizeRelPath, resolveImportSpecifier, scanImports, extractGitNexusEdges,
//   extractCircuitryEdges, extractKnowledgeGraphEdges, buildEdges, main
//
// Zero external npm dependencies: node:fs, node:path, node:crypto, node:os,
// node:url only, EXCEPT node:child_process for the gitnexus CLI probe below —
// the same deliberate, isolated exception atlas-identity.mjs already documents
// (gitnexus's on-disk graph is a proprietary binary store, not fs/path-parseable).
// Skip the probe entirely with --no-gitnexus.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// _SYSTEM/Scripts/atlas/atlas-edges.mjs -> repo root is 3 levels up.
const ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT_LABEL = path.basename(ROOT);

const ID_MAP_PATH = path.join(ROOT, '_SYSTEM/state/atlas/id-map.json');
const CIRCUITRY_PATH = path.join(ROOT, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json');
const KNOWLEDGE_GRAPH_PATH = path.join(ROOT, '_SYSTEM/state/yuri-knowledge-graph.json');
const DEFAULT_OUT = path.join(ROOT, '_SYSTEM/state/atlas/edges.json');

const SOURCE_PRIORITY = ['gitnexus', 'imports', 'circuitry', 'knowledge-graph'];

// ---------------------------------------------------------------------------
// Path normalization (mirrors atlas-identity.mjs exactly — same join key)
// ---------------------------------------------------------------------------

export function normalizeRelPath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  let s = p.replace(/\\/g, '/');
  s = s.replace(/^\.\//, '');
  while (s.startsWith('/')) s = s.slice(1);
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/\/+$/, '');
  return s.length > 0 ? s : null;
}

function canonicalFileKey(repoRoot, relPath) {
  return `${repoRoot}::file::${relPath}`;
}

// ---------------------------------------------------------------------------
// id-map loading + resolvers
// ---------------------------------------------------------------------------

function loadIdMap(idMapPath) {
  if (!existsSync(idMapPath)) {
    throw new Error(`id-map.json not found at ${idMapPath} — run atlas-identity.mjs first`);
  }
  const data = JSON.parse(readFileSync(idMapPath, 'utf8'));
  const pathToCanonical = new Map(); // normalized repo-relative path -> canonical key
  const aliasToCanonical = new Map(); // "source::id" -> canonical key
  for (const [key, node] of Object.entries(data.nodes || {})) {
    if (node.path) pathToCanonical.set(node.path, key);
    for (const alias of node.aliases || []) {
      aliasToCanonical.set(`${alias.source}::${alias.id}`, key);
    }
  }
  return { data, pathToCanonical, aliasToCanonical };
}

function resolveByPath(idMap, relPath) {
  const norm = normalizeRelPath(relPath);
  if (!norm) return null;
  return idMap.pathToCanonical.get(norm) || null;
}

function resolveByAlias(idMap, source, id) {
  if (!id) return null;
  return idMap.aliasToCanonical.get(`${source}::${id}`) || null;
}

// ---------------------------------------------------------------------------
// Source 1: GitNexus (highest priority) — File IMPORTS + File->Function CALLS
// ---------------------------------------------------------------------------

function parseMarkdownTable(markdown) {
  if (typeof markdown !== 'string') return [];
  const lines = markdown.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((s) => s.trim()).filter(Boolean);
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const raw = lines[i].split('|');
    const trimmed = raw.slice(1, raw.length - 1).map((s) => s.trim());
    const row = {};
    header.forEach((h, idx) => { row[h] = trimmed[idx] !== undefined ? trimmed[idx] : null; });
    rows.push(row);
  }
  return rows;
}

// Piped stdout from `npx gitnexus cypher` truncates hard at 65536 bytes (a
// gitnexus/Node stdout-drain interaction, not a maxBuffer limit) — same trap
// atlas-identity.mjs already worked around. Redirect to a tempfile instead.
function runGitnexusCypher(query, timeoutMs) {
  const tmpFile = path.join(os.tmpdir(), `atlas-edges-gitnexus-${randomBytes(6).toString('hex')}.json`);
  try {
    execFileSync('/bin/sh', ['-c', `npx gitnexus cypher "$1" > "$2"`, 'sh', query, tmpFile], {
      cwd: ROOT,
      timeout: timeoutMs,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const out = readFileSync(tmpFile, 'utf8');
    const parsed = JSON.parse(out);
    if (parsed.error) throw new Error(`gitnexus cypher error: ${parsed.error}`);
    return parseMarkdownTable(parsed.markdown);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* best-effort cleanup only */ }
  }
}

// gitnexus's function/call resolution is reliable within the JS/TS family it
// actually parses semantically. A second false-positive mode found by hand
// spot-check (distinct from the name-collision one below): cross-language
// "CALLS"/"IMPORTS" matches where the source file isn't even in a language
// gitnexus resolves calls for — e.g. `.swift` files "calling" unrelated
// `.mjs` functions named `d`/`encode` (globally-unique names, so the
// ambiguity filter doesn't catch this; it's a parser-scope issue, not a name
// collision). Markdown "IMPORTS" edges are also not real dependencies — they
// are gitnexus treating markdown links as imports (e.g. STRUCTURE.md ->
// CODEX_PROTOCOL.md). Restrict GitNexus-sourced edges to endpoints gitnexus
// actually parses as code with real call/import semantics.
const GITNEXUS_TRUSTED_EXT = new Set(['.mjs', '.js', '.cjs', '.jsx', '.ts', '.tsx', '.py']);
function isGitnexusTrustedCodeFile(relPath) {
  const ext = path.extname(relPath);
  return GITNEXUS_TRUSTED_EXT.has(ext);
}

function extractGitNexusEdges(idMap, opts) {
  const result = { edges: [], dropped: 0, note: null, raw: 0, crossLanguageDropped: 0 };
  if (opts.noGitnexus) {
    result.note = 'skipped via --no-gitnexus';
    return result;
  }
  try {
    // File-level import edges — direct, no join needed.
    const importRows = runGitnexusCypher(
      "MATCH (a:File)-[r]->(b:File) WHERE r.type='IMPORTS' RETURN a.filePath as from, b.filePath as to",
      opts.timeoutMs
    );
    // File-calls-Function edges were EVALUATED and REJECTED as a source, not
    // silently skipped — hand spot-check (not assumed) found THREE independent
    // false-positive modes gitnexus's name-based CALLS resolution cannot avoid
    // through this query surface:
    //   1. Name collision: `main`/`write`/`run`/`ok` etc. are defined in
    //      dozens-hundreds of files; a call to a LOCAL function of that name
    //      resolves to an arbitrary same-named Function elsewhere (verified:
    //      math/extract-logbook-truth.mjs's local `write()` matched to a
    //      `write` Function in yuri-session-launchd.mjs — no import exists).
    //   2. Cross-language noise: `.swift` files "calling" unrelated `.mjs`
    //      functions (`d`, `encode` — globally-UNIQUE names, so filter #1
    //      wouldn't even catch this; distinct root cause, gitnexus's
    //      call-graph pass isn't scoped to files it actually resolves calls
    //      for).
    //   3. Receiver-blind method matching: `assert.deepEqual(...)` (Node's
    //      builtin `assert` module) resolved to the LOCAL top-level function
    //      `deepEqual` in mure-fleet-validate.mjs, fanning ~130 unrelated test
    //      files into fake edges pointing at one file — the resolver matches
    //      the method NAME, not the receiver object, so import-scoping can't
    //      fix it either.
    // A name-uniqueness filter kills #1 but not #2/#3 (both hit globally-
    // unique names); the only defensible fix left is dropping CALLS from this
    // source entirely. GitNexus's File-level IMPORTS relation (below) was
    // independently spot-checked and is real — CALLS is not, at this
    // granularity. An honest isolated node beats a fabricated edge.
    result.raw = importRows.length;

    const pushEdge = (fromPath, toPath, kind) => {
      if (!isGitnexusTrustedCodeFile(fromPath) || !isGitnexusTrustedCodeFile(toPath)) {
        result.crossLanguageDropped++;
        return;
      }
      const from = resolveByPath(idMap, fromPath);
      const to = resolveByPath(idMap, toPath);
      if (!from || !to || from === to) { result.dropped++; return; }
      result.edges.push({ from, to, kind, source: 'gitnexus', weight: 1 });
    };
    for (const row of importRows) pushEdge(row.from, row.to, 'imports');

    if (result.raw === 0) result.note = 'gitnexus cypher returned zero rows — check index freshness (gitnexus status)';
  } catch (err) {
    result.note = `gitnexus probe failed (${err.message}); GitNexus edges unavailable this run.`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source 2: static import/require scanner over tracked source files
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.cjs', '.jsx'];
// Try these when the specifier itself doesn't resolve to a file.
const RESOLVE_EXT_CANDIDATES = ['', '.mjs', '.js', '.ts', '.tsx', '.cjs', '.jsx', '.json'];
const RESOLVE_INDEX_CANDIDATES = [
  '/index.mjs', '/index.js', '/index.ts', '/index.tsx', '/index.cjs',
];

const IMPORT_RE = /\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const EXPORT_FROM_RE = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function listTrackedSourceFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((p) => {
    if (p.includes('node_modules/')) return false;
    const ext = path.extname(p);
    return SCAN_EXTENSIONS.includes(ext);
  });
}

function extractSpecifiers(content) {
  const specs = [];
  for (const re of [IMPORT_RE, EXPORT_FROM_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) specs.push(m[1]);
  }
  return specs;
}

function resolveImportSpecifier(fromRelPath, specifier, fileSet) {
  // Internal edges only: skip bare npm specifiers and node: builtins.
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const fromDir = path.posix.dirname(fromRelPath.replace(/\\/g, '/'));
  let joined = specifier.startsWith('/')
    ? specifier.slice(1)
    : path.posix.normalize(path.posix.join(fromDir, specifier));
  joined = normalizeRelPath(joined);
  if (!joined) return null;

  for (const ext of RESOLVE_EXT_CANDIDATES) {
    const candidate = joined + ext;
    if (fileSet.has(candidate)) return candidate;
  }
  for (const idx of RESOLVE_INDEX_CANDIDATES) {
    const candidate = joined + idx;
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function scanImports(files) {
  const fileSet = new Set(files);
  const edges = []; // { from, to } as repo-relative paths, pre-canonical-resolution
  let unresolved = 0;
  for (const relPath of files) {
    let content;
    try {
      content = readFileSync(path.join(ROOT, relPath), 'utf8');
    } catch {
      continue;
    }
    const specifiers = extractSpecifiers(content);
    for (const spec of specifiers) {
      const resolved = resolveImportSpecifier(relPath, spec, fileSet);
      if (!resolved) {
        if (spec.startsWith('.') || spec.startsWith('/')) unresolved++;
        continue;
      }
      if (resolved === relPath) continue; // self-import, not a real edge
      edges.push({ from: relPath, to: resolved });
    }
  }
  return { edges, unresolved };
}

function extractImportEdges(idMap) {
  const result = { edges: [], dropped: 0, unresolved: 0, raw: 0 };
  const files = listTrackedSourceFiles();
  const { edges: rawEdges, unresolved } = scanImports(files);
  result.raw = rawEdges.length;
  result.unresolved = unresolved;
  for (const e of rawEdges) {
    const from = resolveByPath(idMap, e.from);
    const to = resolveByPath(idMap, e.to);
    if (!from || !to || from === to) { result.dropped++; continue; }
    result.edges.push({ from, to, kind: 'imports', source: 'imports', weight: 1 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source 3: existing circuitry graph (calls/reads only — writes excluded)
// ---------------------------------------------------------------------------

const CIRCUITRY_KIND_MAP = { calls: 'calls', reads: 'reads' }; // writes/routes/implements excluded

function extractCircuitryEdges(idMap) {
  const result = { edges: [], dropped: 0, raw: 0, excludedWrites: 0 };
  if (!existsSync(CIRCUITRY_PATH)) { result.note = 'circuitry graph not found'; return result; }
  const data = JSON.parse(readFileSync(CIRCUITRY_PATH, 'utf8'));
  const edges = Array.isArray(data.edges) ? data.edges : [];
  result.raw = edges.length;
  for (const e of edges) {
    if (e.kind === 'writes') { result.excludedWrites++; continue; }
    const kind = CIRCUITRY_KIND_MAP[e.kind];
    if (!kind) { result.dropped++; continue; }
    const from = resolveByAlias(idMap, 'circuitry', e.from);
    const to = resolveByAlias(idMap, 'circuitry', e.to);
    if (!from || !to || from === to) { result.dropped++; continue; }
    result.edges.push({ from, to, kind, source: 'circuitry', weight: 1 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source 4: existing knowledge-graph (script-to-script useful edge types only)
// ---------------------------------------------------------------------------

// The knowledge-graph's edge.type vocabulary is registry-shaped ("registers-
// capability", "reads-state", ...), not calls/reads/writes. Map the ones that
// denote a genuine code-to-code dependency; everything else (capability
// registration, doc references) is not a structural edge between two files.
const KNOWLEDGE_GRAPH_KIND_MAP = {
  imports: 'imports',
  calls: 'calls',
  'reads-state': 'reads',
  references: 'references',
};

function extractKnowledgeGraphEdges(idMap) {
  const result = { edges: [], dropped: 0, raw: 0, skippedType: 0 };
  if (!existsSync(KNOWLEDGE_GRAPH_PATH)) { result.note = 'knowledge graph not found'; return result; }
  const data = JSON.parse(readFileSync(KNOWLEDGE_GRAPH_PATH, 'utf8'));
  const edges = Array.isArray(data.edges) ? data.edges : [];
  result.raw = edges.length;
  for (const e of edges) {
    const kind = KNOWLEDGE_GRAPH_KIND_MAP[e.type];
    if (!kind) { result.skippedType++; continue; }
    const from = resolveByAlias(idMap, 'knowledge-graph', e.from);
    const to = resolveByAlias(idMap, 'knowledge-graph', e.to);
    if (!from || !to || from === to) { result.dropped++; continue; }
    result.edges.push({ from, to, kind, source: 'knowledge-graph', weight: 1 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assembly: dedupe {from,to} across sources, priority-ranked, weight = #sources
// ---------------------------------------------------------------------------

export function buildEdges(opts = {}) {
  const idMap = loadIdMap(opts.idMapPath || ID_MAP_PATH);

  const perSource = {
    gitnexus: extractGitNexusEdges(idMap, {
      noGitnexus: !!opts.noGitnexus,
      timeoutMs: opts.gitnexusTimeoutMs || 60000,
    }),
    imports: extractImportEdges(idMap),
    circuitry: extractCircuitryEdges(idMap),
    'knowledge-graph': extractKnowledgeGraphEdges(idMap),
  };

  // Dedupe by {from,to}. First-seen-in-priority-order source wins as the
  // recorded `source`/`kind`; weight = number of distinct contributing sources.
  const merged = new Map(); // "from|to" -> { from, to, kind, source, weight, contributors:Set }
  for (const sourceName of SOURCE_PRIORITY) {
    for (const edge of perSource[sourceName].edges) {
      const key = `${edge.from}|${edge.to}`;
      let rec = merged.get(key);
      if (!rec) {
        rec = { from: edge.from, to: edge.to, kind: edge.kind, source: edge.source, weight: 0, contributors: new Set() };
        merged.set(key, rec);
      }
      rec.contributors.add(sourceName);
      rec.weight = rec.contributors.size;
    }
  }

  const edges = [...merged.values()].map((r) => ({
    from: r.from, to: r.to, kind: r.kind, source: r.source, weight: r.weight,
  }));

  const nodesWithEdges = new Set();
  for (const e of edges) { nodesWithEdges.add(e.from); nodesWithEdges.add(e.to); }
  const totalNodes = Object.keys(idMap.data.nodes).length;
  const nodesIsolated = totalNodes - nodesWithEdges.size;
  const edgesPerNode = totalNodes > 0 ? edges.length / totalNodes : 0;

  const bySource = {};
  for (const sourceName of SOURCE_PRIORITY) {
    // "contributed" = edges where this source is among the contributors (pre-collapse count),
    // i.e. how many final deduped edges this source helped produce.
    let contributed = 0;
    for (const r of merged.values()) if (r.contributors.has(sourceName)) contributed++;
    bySource[sourceName] = {
      raw: perSource[sourceName].raw ?? perSource[sourceName].edges.length,
      resolved: perSource[sourceName].edges.length,
      dropped: perSource[sourceName].dropped || 0,
      contributed_to_final: contributed,
    };
  }

  const atlas = {
    generated: new Date().toISOString(),
    counts: {
      total: edges.length,
      by_source: Object.fromEntries(SOURCE_PRIORITY.map((s) => [s, bySource[s].contributed_to_final])),
      nodes_with_edges: nodesWithEdges.size,
      nodes_isolated: nodesIsolated,
      edges_per_node: Math.round(edgesPerNode * 100) / 100,
    },
    edges,
    diagnostics: {
      total_canonical_nodes: totalNodes,
      by_source_detail: bySource,
      gitnexus_note: perSource.gitnexus.note || null,
      gitnexus_cross_language_dropped: perSource.gitnexus.crossLanguageDropped || 0,
      imports_unresolved: perSource.imports.unresolved,
      circuitry_excluded_writes: perSource.circuitry.excludedWrites,
      knowledge_graph_skipped_types: perSource['knowledge-graph'].skippedType,
    },
  };
  return atlas;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`SELF-TEST FAILED: ${msg}`);
}

export function runSelfTest() {
  assert(normalizeRelPath('./a/b.mjs') === 'a/b.mjs', 'strip leading ./');
  assert(normalizeRelPath('/a/b.mjs') === 'a/b.mjs', 'strip leading /');
  assert(normalizeRelPath('a\\b\\c.mjs') === 'a/b/c.mjs', 'backslash -> forward slash');
  assert(normalizeRelPath('') === null, 'empty string -> null');

  const fileSet = new Set(['a/b.mjs', 'a/c/index.mjs', 'a/d.mjs', 'a/e.json']);
  assert(resolveImportSpecifier('a/x.mjs', './b.mjs', fileSet) === 'a/b.mjs', 'relative sibling resolves');
  assert(resolveImportSpecifier('a/x.mjs', './b', fileSet) === 'a/b.mjs', 'extensionless resolves via candidate ext');
  assert(resolveImportSpecifier('a/x.mjs', './c', fileSet) === 'a/c/index.mjs', 'dir specifier resolves via index candidate');
  assert(resolveImportSpecifier('a/x.mjs', 'some-npm-pkg', fileSet) === null, 'bare npm specifier not resolved (internal edges only)');
  assert(resolveImportSpecifier('a/x.mjs', 'node:fs', fileSet) === null, 'node: builtin not resolved');
  assert(resolveImportSpecifier('a/x.mjs', './missing', fileSet) === null, 'unresolvable specifier returns null, not a guess');

  const specs = extractSpecifiers(`
    import { foo } from './foo.mjs';
    import bar from "../bar.js";
    export * from './baz.mjs';
    const x = require('./qux.cjs');
    const y = await import('./dyn.mjs');
    import fs from 'node:fs';
  `);
  assert(specs.includes('./foo.mjs'), 'import-from specifier extracted');
  assert(specs.includes('../bar.js'), 'default import specifier extracted');
  assert(specs.includes('./baz.mjs'), 'export-from specifier extracted');
  assert(specs.includes('./qux.cjs'), 'require specifier extracted');
  assert(specs.includes('./dyn.mjs'), 'dynamic import specifier extracted');
  assert(specs.includes('node:fs'), 'node: specifier still extracted (filtered later by resolver)');

  const md = '| from | to |\n| --- | --- |\n| a.ts | b.ts |\n| c.ts | d.ts |';
  const rows = parseMarkdownTable(md);
  assert(rows.length === 2 && rows[0].from === 'a.ts' && rows[0].to === 'b.ts', 'markdown table parses gitnexus cypher rows');

  return true;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`atlas-edges.mjs — YURI Atlas Phase 1b: dense real edge list

Usage:
  node _SYSTEM/Scripts/atlas/atlas-edges.mjs [options]

Options:
  --json               Emit the edge graph to stdout instead of writing the output file
  --out=<path>         Write to a custom path (default: _SYSTEM/state/atlas/edges.json)
  --verbose            Print per-source yield stats to stderr
  --no-gitnexus        Skip the GitNexus probe entirely (imports scan + circuitry + KG only)
  --test               Run the self-test suite and exit (0 pass / 1 fail)
  -h, --help           Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return 0;
  }
  if (args.includes('--test')) {
    try {
      runSelfTest();
      console.log('SELF-TEST: PASS (16 checks)');
      return 0;
    } catch (err) {
      console.error(String(err.message || err));
      return 1;
    }
  }

  const noGitnexus = args.includes('--no-gitnexus');
  const verbose = args.includes('--verbose');
  const jsonOut = args.includes('--json');
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg ? path.resolve(ROOT, outArg.slice('--out='.length)) : DEFAULT_OUT;

  const atlas = buildEdges({ noGitnexus });

  if (verbose) {
    console.error('--- atlas-edges: per-source yield ---');
    for (const [src, stats] of Object.entries(atlas.diagnostics.by_source_detail)) {
      console.error(`  ${src.padEnd(16)} raw=${String(stats.raw).padEnd(6)} resolved=${String(stats.resolved).padEnd(6)} dropped=${String(stats.dropped).padEnd(6)} contributed_to_final=${stats.contributed_to_final}`);
    }
    console.error(`  total canonical nodes: ${atlas.diagnostics.total_canonical_nodes}`);
    console.error(`  total edges (deduped): ${atlas.counts.total}`);
    console.error(`  nodes_with_edges: ${atlas.counts.nodes_with_edges}`);
    console.error(`  nodes_isolated:   ${atlas.counts.nodes_isolated}`);
    console.error(`  edges_per_node:   ${atlas.counts.edges_per_node}`);
    if (atlas.diagnostics.gitnexus_note) console.error(`  gitnexus note: ${atlas.diagnostics.gitnexus_note}`);
    console.error(`  gitnexus_cross_language_dropped: ${atlas.diagnostics.gitnexus_cross_language_dropped}`);
    console.error(`  imports_unresolved: ${atlas.diagnostics.imports_unresolved}`);
    console.error(`  circuitry_excluded_writes: ${atlas.diagnostics.circuitry_excluded_writes}`);
    console.error(`  knowledge_graph_skipped_types: ${atlas.diagnostics.knowledge_graph_skipped_types}`);
    console.error('--------------------------------------');
  }

  if (jsonOut) {
    console.log(JSON.stringify(atlas, null, 2));
    return 0;
  }

  writeFileSync(outPath, JSON.stringify(atlas, null, 2), 'utf8');
  console.log(`atlas-edges: wrote ${outPath}`);
  console.log(`  total=${atlas.counts.total} edges_per_node=${atlas.counts.edges_per_node} nodes_isolated=${atlas.counts.nodes_isolated}`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().then((code) => process.exit(code || 0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
