#!/usr/bin/env node
// atlas-edges.mjs — YURI Atlas Phase 1b: dense real edge list across canonical nodes
//
// @capability: atlas-edges
// @serves: dependency edges between YURI atlas nodes | import graph | call graph | fix edge sparsity
//   for atlas-regions clustering | dense real edge list | doc-to-code references | capability membership
// @does: builds _SYSTEM/state/atlas/edges.json by combining (priority order) GitNexus
//   File-level IMPORTS edges (via `gitnexus cypher`; File->Function CALLS was evaluated
//   and rejected as a source — see extractGitNexusEdges doc comment for the 3 verified
//   false-positive modes), a static import/require scanner over tracked .mjs/.js/.ts/.tsx
//   files, the existing circuitry (calls/reads only, never writes) + knowledge-graph
//   edge sources, a doc-references scanner (non-code files -> the code/paths they name,
//   fenced-code-block-excluded, unique-basename-only, per-doc capped), and a
//   capability-membership scanner (files that share an `@capability:` id in
//   capabilities.json) — every endpoint mapped through the canonical id-map.json,
//   deduped, weighted by source count.
// @use: run after atlas-identity.mjs (id-map.json must exist); do not hand-roll a second
//       import scanner or a parallel gitnexus probe — this is the one edge-density pass.
//       Feeds atlas-regions.mjs, which currently clusters on ~0.55 edges/node.
// @exports: normalizeRelPath, resolveImportSpecifier, scanImports, extractGitNexusEdges,
//   extractCircuitryEdges, extractKnowledgeGraphEdges, extractDocRefsEdges,
//   extractCapabilityEdges, findFencedRanges, isInsideRanges, extractPathTokens,
//   resolveDocToken, buildBasenameIndex, groupCapabilitiesById, pairwiseCapabilityEdges,
//   buildEdges, main
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
const CAPABILITIES_PATH = path.join(ROOT, '_SYSTEM/capabilities.json');
const DEFAULT_OUT = path.join(ROOT, '_SYSTEM/state/atlas/edges.json');

const SOURCE_PRIORITY = ['gitnexus', 'imports', 'circuitry', 'knowledge-graph', 'doc-refs', 'capability'];

const DOC_REF_EXTENSIONS = new Set(['.md', '.mdc', '.json', '.yaml', '.jsonl']);
const DEFAULT_MAX_DOC_REFS = 40;
const CAPABILITY_MEMBERSHIP_CAP = 20;

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
// Source 5: doc-references — non-code files (.md/.mdc/.json/.yaml/.jsonl) that
// name a path or bare filename resolving to a canonical node.
// ---------------------------------------------------------------------------
//
// Precision-first, by design: a wrong edge here silently corrupts every region
// downstream (same lesson the directory-co-location fallback taught). Three
// deliberate refusals, not oversights:
//   1. Fenced code blocks (``` ... ```) are excluded — an example command's
//      path is illustrative, not a real doc->code dependency.
//   2. A bare filename (no slash, e.g. `xref-query.mjs`) only resolves when
//      its basename is UNIQUE across the id-map. Ambiguous basenames
//      (README.md, CLAUDE.md, orchestrator.mjs, ...) are skipped, never
//      guessed at.
//   3. Per-document edges are capped (default 40) so one path-dense file
//      (CLAUDE.md, a plan, an index) cannot become a hub that fuses unrelated
//      regions together — the same failure mode the old fallback produced.

// Matches either a multi-segment repo-relative path ("_SYSTEM/Scripts/foo.mjs")
// or a bare "name.ext" token. The negative lookaround on word/dot/slash/dash
// means a match can never start or end mid-path — in particular it cannot
// start immediately after the "//" of a "https://" URL (the preceding "/"
// fails the lookbehind), so protocol-qualified URLs are structurally excluded
// without a separate heuristic. A bare "domain.com/a/b.mjs"-shaped mention
// (no protocol) CAN match, but it then simply fails id-map resolution like any
// other unresolvable token — it is never silently accepted.
// Lookbehind forbids word/dot/slash/dash (blocks starting mid-path or right
// after a URL's "//"). Lookahead deliberately does NOT forbid ".": a
// sentence-ending period after a bare filename ("see xref-query.mjs.") must
// not swallow the match. This does mean a versioned name like "file.v2.mjs"
// under-matches to "file.v2" — that token then simply fails id-map
// resolution like any other miss (dropped, never a false positive). The
// extension group requires a LEADING LETTER ([A-Za-z][A-Za-z0-9]{0,9}, not
// a bare [A-Za-z0-9]{1,10}) — without this, decimals and timestamps inside
// .jsonl/.json ledgers ("0.5", "199.820824053", "00.000Z") match the
// bare-filename alternative as fake "extensions" (digits are alnum too) and
// flood the raw/dropped counts with noise. Every real extension in this repo
// (mjs, ts, js, cjs, tsx, md, mdc, json, jsonl, yaml, py, sh, ...) starts
// with a letter, so this costs nothing and kills the noise at the source.
const PATH_TOKEN_RE = /(?<![\w./-])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9]{0,9}|[A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9]{0,9})(?![\w/-])/g;
const FENCE_RE = /```[\s\S]*?```/g;

export function findFencedRanges(content) {
  const ranges = [];
  if (typeof content !== 'string') return ranges;
  const re = new RegExp(FENCE_RE.source, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++; // guard against zero-width infinite loop
  }
  return ranges;
}

export function isInsideRanges(idx, ranges) {
  for (const [start, end] of ranges) {
    if (idx >= start && idx < end) return true;
  }
  return false;
}

// Pure extraction: returns every raw candidate token + its offset, no
// filtering, no resolution. Fence-exclusion and id-map resolution are
// separate steps so each is independently testable.
export function extractPathTokens(content) {
  const out = [];
  if (typeof content !== 'string') return out;
  const re = new RegExp(PATH_TOKEN_RE.source, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ token: m[1], index: m.index });
  }
  return out;
}

export function buildBasenameIndex(idMap) {
  const full = new Map(); // basename -> [canonicalKey, ...]
  for (const [key, node] of Object.entries(idMap.data.nodes)) {
    if (!node.path) continue;
    const bn = path.posix.basename(node.path);
    if (!full.has(bn)) full.set(bn, []);
    full.get(bn).push(key);
  }
  return full;
}

// Pure resolver: a path-shaped token resolves via the id-map's normalized
// path index; a bare filename resolves ONLY when its basename is unique
// (basenameIndex.get(token).length === 1) — never guessed when ambiguous.
// Returns { key: string|null, ambiguous: boolean } so callers can tell
// "doesn't exist" (key=null, ambiguous=false) apart from "exists but is
// ambiguous, correctly refused" (key=null, ambiguous=true).
export function resolveDocToken(token, idMap, basenameIndex) {
  if (token.includes('/')) {
    const key = resolveByPath(idMap, token);
    return { key: key || null, ambiguous: false };
  }
  const candidates = basenameIndex.get(token);
  if (!candidates || candidates.length === 0) return { key: null, ambiguous: false };
  if (candidates.length > 1) return { key: null, ambiguous: true };
  return { key: candidates[0], ambiguous: false };
}

function scanDocForRefs(docKey, docPath, content, idMap, basenameIndex, maxDocRefs) {
  const fencedRanges = findFencedRanges(content);
  const tokens = extractPathTokens(content);
  const out = { targetsInOrder: [], excludedByFence: 0, dropped: 0, ambiguous: 0, raw: tokens.length };
  const seen = new Set();
  for (const { token, index } of tokens) {
    if (isInsideRanges(index, fencedRanges)) { out.excludedByFence++; continue; }
    const { key, ambiguous } = resolveDocToken(token, idMap, basenameIndex);
    if (ambiguous) { out.ambiguous++; continue; }
    if (!key) { out.dropped++; continue; }
    if (key === docKey) continue; // self-reference
    if (seen.has(key)) continue;
    seen.add(key);
    out.targetsInOrder.push(key);
  }
  let cappedExcess = 0;
  let targets = out.targetsInOrder;
  if (targets.length > maxDocRefs) {
    cappedExcess = targets.length - maxDocRefs;
    targets = targets.slice(0, maxDocRefs);
  }
  return { targets, excludedByFence: out.excludedByFence, dropped: out.dropped, ambiguous: out.ambiguous, raw: out.raw, cappedExcess, docPath };
}

function extractDocRefsEdges(idMap, opts = {}) {
  const result = {
    edges: [], dropped: 0, raw: 0, excludedByFence: 0, ambiguousBasenameSkipped: 0,
    docsAtCap: [], docsScanned: 0, note: null,
  };
  if (opts.noDocRefs) {
    result.note = 'skipped via --no-doc-refs';
    return result;
  }
  const maxDocRefs = opts.maxDocRefs || DEFAULT_MAX_DOC_REFS;
  const basenameIndex = buildBasenameIndex(idMap);

  for (const [key, node] of Object.entries(idMap.data.nodes)) {
    if (!node.path) continue;
    const ext = path.extname(node.path);
    if (!DOC_REF_EXTENSIONS.has(ext)) continue;
    const abs = path.join(ROOT, node.path);
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    result.docsScanned++;
    const scan = scanDocForRefs(key, node.path, content, idMap, basenameIndex, maxDocRefs);
    result.raw += scan.raw;
    result.excludedByFence += scan.excludedByFence;
    result.dropped += scan.dropped;
    result.ambiguousBasenameSkipped += scan.ambiguous;
    if (scan.cappedExcess > 0) {
      result.docsAtCap.push({ doc: node.path, kept: maxDocRefs, excess: scan.cappedExcess });
    }
    for (const target of scan.targets) {
      result.edges.push({ from: key, to: target, kind: 'references', source: 'doc-refs', weight: 1 });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source 6: capability-membership — files that share an `@capability:` id in
// _SYSTEM/capabilities.json (only IDs with >=2 distinct resolvable mechanism
// files produce an edge; most capability ids have exactly one mechanism and
// contribute nothing here — that is the honest, expected yield).
// ---------------------------------------------------------------------------

export function groupCapabilitiesById(caps) {
  const byId = new Map(); // id -> Set(mechanism path)
  for (const c of caps) {
    if (!c || !c.id || !c.mechanism) continue;
    if (!byId.has(c.id)) byId.set(c.id, new Set());
    byId.get(c.id).add(c.mechanism);
  }
  return byId;
}

// Pure: emits the (i<j) pairwise clique over already-resolved canonical keys,
// capped so one large capability group cannot fan out into a hub.
export function pairwiseCapabilityEdges(keys, cap = CAPABILITY_MEMBERSHIP_CAP) {
  const edges = [];
  outer:
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (edges.length >= cap) break outer;
      edges.push({ from: keys[i], to: keys[j], kind: 'references', source: 'capability', weight: 1 });
    }
  }
  return edges;
}

function extractCapabilityEdges(idMap) {
  const result = { edges: [], dropped: 0, raw: 0, groupsWithMultipleMembers: 0, note: null };
  if (!existsSync(CAPABILITIES_PATH)) { result.note = 'capabilities.json not found'; return result; }
  const data = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  const caps = Array.isArray(data.capabilities) ? data.capabilities : [];
  result.raw = caps.length;
  const byId = groupCapabilitiesById(caps);
  for (const mechanismSet of byId.values()) {
    const mechanisms = [...mechanismSet];
    const resolvedKeys = [];
    for (const m of mechanisms) {
      const key = resolveByPath(idMap, m);
      if (!key) { result.dropped++; continue; }
      resolvedKeys.push(key);
    }
    const uniqueKeys = [...new Set(resolvedKeys)];
    if (uniqueKeys.length < 2) continue;
    result.groupsWithMultipleMembers++;
    result.edges.push(...pairwiseCapabilityEdges(uniqueKeys, CAPABILITY_MEMBERSHIP_CAP));
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
    'doc-refs': extractDocRefsEdges(idMap, {
      noDocRefs: !!opts.noDocRefs,
      maxDocRefs: opts.maxDocRefs || DEFAULT_MAX_DOC_REFS,
    }),
    capability: extractCapabilityEdges(idMap),
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
      doc_refs_docs_scanned: perSource['doc-refs'].docsScanned || 0,
      doc_refs_excluded_by_fence: perSource['doc-refs'].excludedByFence || 0,
      doc_refs_ambiguous_basename_skipped: perSource['doc-refs'].ambiguousBasenameSkipped || 0,
      doc_refs_dropped_unresolved: perSource['doc-refs'].dropped || 0,
      doc_refs_docs_at_cap: perSource['doc-refs'].docsAtCap || [],
      doc_refs_note: perSource['doc-refs'].note || null,
      capability_membership_groups_multi_member: perSource.capability.groupsWithMultipleMembers || 0,
      capability_membership_dropped: perSource.capability.dropped || 0,
      capability_membership_note: perSource.capability.note || null,
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

  // --- doc-refs: path-token extraction ---
  const docText = 'See `_SYSTEM/Scripts/foo.mjs` and [bar](path/to/bar.mjs) also xref-query.mjs.';
  const tokens = extractPathTokens(docText);
  const tokenStrs = tokens.map((t) => t.token);
  assert(tokenStrs.includes('_SYSTEM/Scripts/foo.mjs'), 'backticked repo-relative path extracted');
  assert(tokenStrs.includes('path/to/bar.mjs'), 'markdown-link path extracted');
  assert(tokenStrs.includes('xref-query.mjs'), 'bare filename with extension extracted');

  // --- doc-refs: fenced code blocks are excluded ---
  const fencedText = 'Real ref: _SYSTEM/Scripts/real.mjs\n```\nExample: _SYSTEM/Scripts/example.mjs\n```\nAfter: _SYSTEM/Scripts/after.mjs';
  const ranges = findFencedRanges(fencedText);
  assert(ranges.length === 1, 'one fenced block detected');
  const fencedTokens = extractPathTokens(fencedText);
  const realTok = fencedTokens.find((t) => t.token === '_SYSTEM/Scripts/real.mjs');
  const exampleTok = fencedTokens.find((t) => t.token === '_SYSTEM/Scripts/example.mjs');
  const afterTok = fencedTokens.find((t) => t.token === '_SYSTEM/Scripts/after.mjs');
  assert(realTok && !isInsideRanges(realTok.index, ranges), 'mention before fence is NOT excluded');
  assert(exampleTok && isInsideRanges(exampleTok.index, ranges), 'mention INSIDE fence IS excluded');
  assert(afterTok && !isInsideRanges(afterTok.index, ranges), 'mention after fence is NOT excluded');

  // --- doc-refs: resolution — path resolves, non-unique basename is refused not guessed ---
  const fakeIdMap = {
    data: { nodes: {
      docKey: { path: 'docs/readme.md' },
      keyA: { path: '_SYSTEM/Scripts/foo.mjs' },
      dupOne: { path: 'a/dup.mjs' },
      dupTwo: { path: 'b/dup.mjs' },
      uniqOne: { path: 'c/uniq.mjs' },
    } },
    pathToCanonical: new Map([
      ['docs/readme.md', 'docKey'],
      ['_SYSTEM/Scripts/foo.mjs', 'keyA'],
      ['a/dup.mjs', 'dupOne'],
      ['b/dup.mjs', 'dupTwo'],
      ['c/uniq.mjs', 'uniqOne'],
    ]),
    aliasToCanonical: new Map(),
  };
  const basenameIndex = buildBasenameIndex(fakeIdMap);
  assert(basenameIndex.get('dup.mjs').length === 2, 'basename index groups both dup.mjs candidates');
  assert(basenameIndex.get('uniq.mjs').length === 1, 'basename index has single uniq.mjs candidate');

  const pathResolved = resolveDocToken('_SYSTEM/Scripts/foo.mjs', fakeIdMap, basenameIndex);
  assert(pathResolved.key === 'keyA' && !pathResolved.ambiguous, 'repo-relative path token resolves to canonical key');

  const ambiguousResolved = resolveDocToken('dup.mjs', fakeIdMap, basenameIndex);
  assert(ambiguousResolved.key === null && ambiguousResolved.ambiguous === true, 'non-unique basename is SKIPPED, not guessed');

  const uniqueResolved = resolveDocToken('uniq.mjs', fakeIdMap, basenameIndex);
  assert(uniqueResolved.key === 'uniqOne' && !uniqueResolved.ambiguous, 'unique basename resolves');

  const missingResolved = resolveDocToken('nope.mjs', fakeIdMap, basenameIndex);
  assert(missingResolved.key === null && missingResolved.ambiguous === false, 'unknown basename is unresolved, not ambiguous');

  // --- capability-membership: grouping + pairwise cap ---
  const caps = [
    { id: 'shared-cap', mechanism: 'a/one.mjs' },
    { id: 'shared-cap', mechanism: 'b/two.mjs' },
    { id: 'shared-cap', mechanism: 'a/one.mjs' }, // duplicate mechanism, must not double-count
    { id: 'solo-cap', mechanism: 'c/solo.mjs' },
    { id: 'no-mechanism-cap' },
  ];
  const grouped = groupCapabilitiesById(caps);
  assert(grouped.get('shared-cap').size === 2, 'duplicate mechanism entries for same id collapse to a set');
  assert(grouped.get('solo-cap').size === 1, 'single-mechanism capability keeps one member');
  assert(!grouped.has('no-mechanism-cap'), 'capability entries without a mechanism are skipped');

  const pairEdges = pairwiseCapabilityEdges(['k1', 'k2', 'k3'], 20);
  assert(pairEdges.length === 3, 'pairwise clique over 3 keys yields 3 edges (n*(n-1)/2)');
  const cappedPairEdges = pairwiseCapabilityEdges(['k1', 'k2', 'k3', 'k4'], 2);
  assert(cappedPairEdges.length === 2, 'pairwise clique respects the per-capability cap');

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
  --no-doc-refs        Skip the doc-references scanner (non-code files -> code they name)
  --max-doc-refs=N     Cap doc-references edges emitted per document (default 40)
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
      console.log('SELF-TEST: PASS (33 checks)');
      return 0;
    } catch (err) {
      console.error(String(err.message || err));
      return 1;
    }
  }

  const noGitnexus = args.includes('--no-gitnexus');
  const noDocRefs = args.includes('--no-doc-refs');
  const verbose = args.includes('--verbose');
  const jsonOut = args.includes('--json');
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg ? path.resolve(ROOT, outArg.slice('--out='.length)) : DEFAULT_OUT;
  const maxDocRefsArg = args.find((a) => a.startsWith('--max-doc-refs='));
  const maxDocRefs = maxDocRefsArg ? parseInt(maxDocRefsArg.slice('--max-doc-refs='.length), 10) : DEFAULT_MAX_DOC_REFS;

  const atlas = buildEdges({ noGitnexus, noDocRefs, maxDocRefs });

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
    console.error(`  doc_refs_docs_scanned: ${atlas.diagnostics.doc_refs_docs_scanned}`);
    console.error(`  doc_refs_excluded_by_fence: ${atlas.diagnostics.doc_refs_excluded_by_fence}`);
    console.error(`  doc_refs_ambiguous_basename_skipped: ${atlas.diagnostics.doc_refs_ambiguous_basename_skipped}`);
    console.error(`  doc_refs_dropped_unresolved: ${atlas.diagnostics.doc_refs_dropped_unresolved}`);
    if (atlas.diagnostics.doc_refs_docs_at_cap.length) {
      console.error(`  doc_refs_docs_at_cap (${atlas.diagnostics.doc_refs_docs_at_cap.length}):`);
      for (const d of atlas.diagnostics.doc_refs_docs_at_cap) {
        console.error(`    ${d.doc}  kept=${d.kept} excess=${d.excess}`);
      }
    }
    if (atlas.diagnostics.doc_refs_note) console.error(`  doc_refs note: ${atlas.diagnostics.doc_refs_note}`);
    console.error(`  capability_membership_groups_multi_member: ${atlas.diagnostics.capability_membership_groups_multi_member}`);
    console.error(`  capability_membership_dropped: ${atlas.diagnostics.capability_membership_dropped}`);
    if (atlas.diagnostics.capability_membership_note) console.error(`  capability_membership note: ${atlas.diagnostics.capability_membership_note}`);
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
