#!/usr/bin/env node
/**
 * yuri-id-bridge.mjs — deterministic cross-surface canonical-id + file-path-spine + protected veto.
 *
 * THE PROBLEM it solves (verified): the circuitry graph keys nodes by kebab SLUGS ('energy-fn'),
 * while code/doc/mem surfaces key by `rel:symbol` / path / slug ids. The two namespaces share ZERO
 * overlap — a naive id-equality join yields silently-zero matches. The ONLY hinge is `node.files[]`
 * path-normalization, and it is MANY-TO-MANY (6 files owned by 2 nodes, 10 nodes own >1 file, 1 phantom
 * node owns none). This module builds the canonical-id layer + the file-path spine + the protected veto,
 * and is consumed by yuri-navigate.mjs. Read-only; never mutates the graph.
 *
 * CANONICAL ID = `<surface>::<localId>` (double-colon; surface never contains '::'). Defeats the verified
 * collision where a doc id '_SYSTEM/x.mjs', a code module id '_SYSTEM/x.mjs:' and a mem id can be
 * byte-identical or differ only by a trailing ':'.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GRAPH_PATH = path.join(REPO_ROOT, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json');

// Only true source files can originate a structural call edge (mirrors propagation-scan.mjs:132).
const STRUCTURAL_FILE_EXT = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx']);
export function isStructuralSourceFile(p) {
  return STRUCTURAL_FILE_EXT.has(path.extname(String(p || '')).toLowerCase());
}

// EXTENDED protected-prefix set. CRITICAL: do NOT copy propagation-scan.mjs:139's incomplete
// ['backend/data/','.claude/state/','.claude/history/','.env'] — VERIFIED it misses 3 of the 17 protected
// external edge.to endpoints (the .claude/projects/*/memory/ writes from claude-memory-write +
// memory-relocator), plus .claude/file-history/, node_modules/, and .amp/. Inheriting it leaks them.
export const EXTENDED_PROTECTED_PREFIXES = [
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
];

// Repo-relative forward-slash form — the node.files comparison key (propagation-scan.mjs:177 idiom).
export function normalizePath(p) {
  if (!p) return p;
  let rel = p;
  if (path.isAbsolute(p) && p.startsWith(REPO_ROOT)) rel = path.relative(REPO_ROOT, p);
  rel = rel.split(path.sep).join('/').replace(/^\.\//, '');
  // Collapse '.' and '..' segments lexically so a protected/denied/scope check can't be bypassed by traversal
  // (e.g. '_SYSTEM/Scripts/math/../../../.env' → '.env'). Leading '..' that escapes the repo root is PRESERVED
  // so isProtectedPath / scope checks can fail closed on out-of-tree references.
  const stack = [];
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
    } else {
      stack.push(seg);
    }
  }
  return stack.join('/');
}

// A path is protected if it equals or sits under any EXTENDED prefix. Globs ('.claude/projects/*/memory/
// <slug>.md') match by their literal prefix-before-glob ('.claude/projects/').
export function isProtectedPath(p) {
  if (!p) return false;
  const rel = normalizePath(String(p));
  // Fail closed: a path that escapes the repo root via traversal ('../…') is out-of-tree and inherently suspect.
  if (rel === '..' || rel.startsWith('../')) return true;
  return EXTENDED_PROTECTED_PREFIXES.some((pre) => rel === pre || rel.startsWith(pre));
}

// ------------------------------------------------------------------------------------------------
// canonical id construction + parsing
// ------------------------------------------------------------------------------------------------
export const SURFACES = new Set(['graph', 'code', 'doc', 'mem', 'skill', 'gitnexus']);
const CANON_SEP = '::';

export function canonicalize(surface, localId) {
  const s = String(surface || '');
  if (!SURFACES.has(s)) throw new Error(`unknown surface: ${surface}`);
  if (s.includes(CANON_SEP)) throw new Error(`surface must not contain '${CANON_SEP}'`);
  return `${s}${CANON_SEP}${String(localId ?? '')}`;
}

// Split on the FIRST '::' only — localId may itself contain ':' (code rel:symbol) but never '::'.
export function parseCanonical(canonicalId) {
  const str = String(canonicalId ?? '');
  const i = str.indexOf(CANON_SEP);
  if (i < 0) return { surface: null, localId: str };
  return { surface: str.slice(0, i), localId: str.slice(i + CANON_SEP.length) };
}

// Code localId = `<rel>:<symbol>` (split on FIRST ':' — symbols cannot contain ':'). Empty symbol ⇒
// module OR test, disambiguated by the /\.test\.mjs$/ suffix on rel.
export function parseCodeId(localId) {
  const str = String(localId ?? '');
  const i = str.indexOf(':');
  const rel = i < 0 ? str : str.slice(0, i);
  const symbol = i < 0 ? '' : str.slice(i + 1);
  let kind;
  if (symbol) kind = 'symbol';
  else if (/\.test\.(mjs|js|cjs|ts|tsx|jsx)$/.test(rel)) kind = 'test';
  else kind = 'module';
  return { rel: normalizePath(rel), symbol, kind };
}

// Memory canonicalization: localId = filename STEM (basename minus .md), NOT the frontmatter `name:`
// (VERIFIED 30/164 differ). Plus a known-prefix-expansion table applied IDENTICALLY to ids and
// ref-targets before exact match, so a [[fb-foo]] wikilink resolves to memory file 'feedback-foo.md'.
const MEM_PREFIX_EXPANSION = [['fb-', 'feedback-']];
export function memStem(fileOrSlug) {
  let stem = String(fileOrSlug ?? '').split('/').pop().replace(/\.md$/i, '').toLowerCase();
  for (const [from, to] of MEM_PREFIX_EXPANSION) {
    if (stem.startsWith(from)) { stem = to + stem.slice(from.length); break; }
  }
  return stem;
}

// ------------------------------------------------------------------------------------------------
// graph load (RAW node.files — structured, NOT the lossy {id,text} adapter blob)
// ------------------------------------------------------------------------------------------------
export function loadGraphRaw() {
  const g = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes : [],
    edges: Array.isArray(g.edges) ? g.edges : [],
    generatedAt: g.generatedAt || null,
  };
}

function graphRecords() {
  const { nodes } = loadGraphRaw();
  const records = [];
  for (const node of nodes) {
    const rawFiles = Array.isArray(node.files) ? node.files : [];
    // Veto protected files at the id layer; keep only the surviving, normalized paths.
    const files = rawFiles.map(normalizePath).filter((f) => f && !isProtectedPath(f));
    const droppedProtected = rawFiles.length - files.length;
    records.push({
      canonicalId: canonicalize('graph', node.id),
      surface: 'graph',
      localId: node.id,
      label: node.label || null,
      layer: node.layer || null,
      files,
      protected: droppedProtected > 0,            // node owned at least one protected file (now stripped)
      sourceEligible: files.some(isStructuralSourceFile),
      phantom: rawFiles.length === 0,             // 'cross-domain-transfer-engine' — flagged, not dropped
    });
  }
  return records;
}

// ------------------------------------------------------------------------------------------------
// public loader — graph surface by default; code/doc/mem/skill behind opts.surfaces (lazy, adapter-fed)
// ------------------------------------------------------------------------------------------------
export function loadRecords(opts = {}) {
  const surfaces = Array.isArray(opts.surfaces) && opts.surfaces.length ? opts.surfaces : ['graph'];
  let records = [];
  if (surfaces.includes('graph')) records = records.concat(graphRecords());
  // code/doc/mem/skill surfaces are opt-in: they pull from the {id,text} adapters and are heavier
  // (1536 code, 39090 docs). navigate's centrality needs only the graph surface + its file spine.
  // They are wired here so the API is closed, not stubbed.
  const adapterSurfaces = surfaces.filter((s) => s !== 'graph' && s !== 'gitnexus');
  if (adapterSurfaces.length) records = records.concat(adapterRecords(adapterSurfaces));

  // determinism: canonicalId-sorted records.
  records.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const byCanonicalId = new Map(records.map((r) => [r.canonicalId, r]));
  const fileToNodes = buildFileToNodes(records);
  return { records, byCanonicalId, fileToNodes };
}

// file (repo-relative, normalized) -> sorted canonicalIds[]. MANY-TO-MANY by construction; dedup on
// the (path, canonicalId) pair. The phantom node (files=[]) has no spine entry.
function buildFileToNodes(records) {
  const map = new Map();
  for (const r of records) {
    for (const f of r.files) {
      let list = map.get(f);
      if (!list) { list = new Set(); map.set(f, list); }
      list.add(r.canonicalId);
    }
  }
  // freeze to sorted arrays
  const out = new Map();
  for (const [f, set] of map) out.set(f, [...set].sort((a, b) => a.localeCompare(b)));
  return out;
}

// Lazy adapter bridge for non-graph surfaces. Each adapter emits {id,text}; we map to NodeRecords
// keyed by the appropriate localId and run the same protected veto on any path-shaped id.
function adapterRecords(surfaces) {
  let adapters;
  try {
    adapters = requireAdapters();
  } catch {
    return []; // adapters unavailable — graph surface still works; non-graph surfaces silently empty
  }
  const out = [];
  for (const surface of surfaces) {
    const fn = adapters[surface];
    if (typeof fn !== 'function') continue;
    let recs = [];
    try { recs = fn(); } catch { recs = []; }
    for (const rec of Array.isArray(recs) ? recs : []) {
      const localId = String(rec.id ?? '');
      if (!localId) continue;
      let files = [];
      if (surface === 'code') {
        const { rel } = parseCodeId(localId);
        if (rel) files = [rel];
      } else {
        files = [normalizePath(localId)]; // doc/mem/skill id IS a path
      }
      files = files.filter((f) => f && !isProtectedPath(f));
      out.push({
        canonicalId: canonicalize(surface, surface === 'mem' ? memStem(localId) : localId),
        surface,
        localId,
        label: null,
        layer: null,
        files,
        protected: false,
        sourceEligible: files.some(isStructuralSourceFile),
        phantom: files.length === 0,
      });
    }
  }
  return out;
}

// Resolve the adapter surface fns from yuri-match-adapters.mjs without a hard top-level import
// (keeps yuri-id-bridge usable even if the adapter module is absent).
let _adaptersCache = null;
function requireAdapters() {
  if (_adaptersCache) return _adaptersCache;
  // Synchronous resolution via a cached dynamic import is not possible; consumers that need non-graph
  // surfaces should call loadRecordsAsync. The sync path returns the graph surface only.
  throw new Error('non-graph surfaces require loadRecordsAsync');
}

// Async loader for cross-surface records (graph + code/doc/mem/skill via the adapters).
export async function loadRecordsAsync(opts = {}) {
  const surfaces = Array.isArray(opts.surfaces) && opts.surfaces.length ? opts.surfaces : ['graph'];
  let records = surfaces.includes('graph') ? graphRecords() : [];
  const adapterSurfaces = surfaces.filter((s) => s !== 'graph' && s !== 'gitnexus');
  if (adapterSurfaces.length) {
    try {
      const mod = await import('./yuri-match-adapters.mjs');
      const adapters = resolveAdapterFns(mod);
      for (const surface of adapterSurfaces) {
        const fn = adapters[surface];
        if (typeof fn !== 'function') continue;
        let recs = [];
        try { recs = await fn(); } catch { recs = []; }
        for (const rec of Array.isArray(recs) ? recs : []) {
          const localId = String(rec.id ?? '');
          if (!localId) continue;
          let files = [];
          if (surface === 'code') { const { rel } = parseCodeId(localId); if (rel) files = [rel]; }
          else files = [normalizePath(localId)];
          files = files.filter((f) => f && !isProtectedPath(f));
          records.push({
            canonicalId: canonicalize(surface, surface === 'mem' ? memStem(localId) : localId),
            surface, localId, label: null, layer: null, files,
            protected: false, sourceEligible: files.some(isStructuralSourceFile), phantom: files.length === 0,
          });
        }
      }
    } catch { /* adapters unavailable; graph records stand */ }
  }
  records.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  return { records, byCanonicalId: new Map(records.map((r) => [r.canonicalId, r])), fileToNodes: buildFileToNodes(records) };
}

function resolveAdapterFns(mod) {
  // tolerate several export shapes: {adapters:{code,...}} | {codeAdapter,...} | {code,...}
  if (mod.adapters && typeof mod.adapters === 'object') return mod.adapters;
  const pick = (s) => mod[`${s}Adapter`] || mod[s];
  return { code: pick('code'), doc: pick('doc'), mem: pick('mem') || pick('memory'), skill: pick('skill') || pick('skills') };
}

export { buildFileToNodes };
