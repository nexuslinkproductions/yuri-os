#!/usr/bin/env node
/**
 * circuitry-auto-register.mjs — generalize the corpus-match {id,text} engine onto YURI's OWN code +
 * test corpus, so the self-regenerating circuitry die derives its nodes + SIMILARITY edges from the
 * filesystem instead of being hand-maintained (Marcel's circuitry-auto-registration vision; Codex D3).
 *
 * DIVISION OF LABOR (do not blur):
 *   - GitNexus owns STRUCTURAL edges (imports / calls / reads / writes / process-member) — AST truth.
 *   - THIS module owns SIMILARITY edges (near-duplicate ≥ 0.85, mechanism-family ≥ 0.30) via the
 *     COMPLETE prefix-filter (Bayardo/Xiao) — the "what looks like what" graph AST cannot see (two
 *     modules can share mechanism DNA with zero import/call relationship).
 *   - tests-cover is HYBRID: import-parse + name-match, then the matcher CONFIRMS or flags a MISMATCH
 *     (the test's text fingerprint points at a different module than its name/import claims).
 *
 * READ-ONLY: this scans source + emits records/edges/orphan-report. It does NOT mutate the live
 * circuitry graph — merging the delta into yuri-circuitry-graph.json (add-only, diff, never auto-
 * delete) + the GitNexus structural-edge merge are the OWNER-GATED next step.
 *
 * Deterministic, embedding-free: regex parse (no AST dep) + corpus-match prefix-filter. No clock/RNG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, matchPrefixFilter } from './corpus-match.mjs';
import { makeFeatureFn } from './math/yuri-token-expand.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── repo containment + protected-path guard (A3 stress-test: roots like '../../../tmp' escaped the
// repo; symlinks could too). assertContained uses realpath; readSafe rejects protected surfaces. ──
const PROTECTED_PREFIXES = ['backend/data/', '.claude/state/', '.claude/history/', '.claude/file-history/', '.claude/projects/', '.env', 'node_modules/', '.amp/'];
function isProtectedRel(rel) {
  const n = rel.split(path.sep).join('/');
  return PROTECTED_PREFIXES.some((p) => n === p.replace(/\/$/, '') || n.startsWith(p));
}
function assertContained(abs, label = 'path') {
  const realRoot = fs.realpathSync(REPO_ROOT);
  let real;
  try { real = fs.realpathSync(abs); } catch { return abs; } // non-existent → caller's readSafe handles
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`${label} escapes repo: ${abs}`);
  return real;
}

// ── parsing (regex, deterministic) ─────────────────────────────────────────────────────────────
const EXPORT_DECL_RE = /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\}/;
const IMPORT_FROM_RE = /import\b[^'"]*from\s+['"]([^'"]+)['"]/g;
const HEADER_DOC_RE = /\/\*\*([\s\S]*?)\*\//;
const TEST_BLOCK_RE = /\b(?:test|describe|it)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const OK_DESC_RE = /\bok\([^,]*,\s*['"`]([^'"`]+)['"`]/g;

/** Recursively list *.mjs under a root, skipping node_modules/.git. Returns repo-relative paths. */
export function listMjs(absRoot, { includeTests = true } = {}) {
  const out = [];
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.endsWith('.mjs')) {
        const isTest = /\.test\.mjs$/.test(e.name);
        if (isTest && !includeTests) continue;
        out.push(path.relative(REPO_ROOT, abs));
      }
    }
  };
  walk(absRoot);
  return out.sort();
}

function readSafe(rel) {
  if (isProtectedRel(rel)) return '';                 // never read protected surfaces
  const abs = path.join(REPO_ROOT, rel);
  try { assertContained(abs, 'read'); return fs.readFileSync(abs, 'utf8'); } catch { return ''; }
}
function headerDoc(src) { const m = src.match(HEADER_DOC_RE); return m ? m[1].replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : ''; }
function localImports(src) {
  const out = []; let m;
  IMPORT_FROM_RE.lastIndex = 0;
  while ((m = IMPORT_FROM_RE.exec(src))) if (m[1].startsWith('.')) out.push(path.basename(m[1]));
  return out;
}
function exportNames(src) {
  const names = new Set();
  for (const line of src.split('\n')) {
    const d = line.match(EXPORT_DECL_RE); if (d) names.add(d[1]);
    const l = line.match(EXPORT_LIST_RE); if (l) for (const part of l[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n) names.add(n); }
  }
  return [...names];
}

/** Parse one module file → its module record + one symbol record per export. */
export function parseModule(rel) {
  const src = readSafe(rel);
  const exps = exportNames(src);
  const imps = localImports(src);
  const doc = headerDoc(src);
  const pathToks = rel.replace(/[\/.]/g, ' ');
  const moduleRecord = { id: `${rel}:`, kind: 'module', rel, text: `${pathToks} ${exps.join(' ')} ${imps.join(' ')} ${doc}`.trim() };
  const symbolRecords = exps.map((name) => {
    // grab the declaration line + a trailing line-comment if present, for the symbol's text
    const re = new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${name}\\b[^\\n]*`);
    const decl = (src.match(re) || [name])[0].replace(/\s+/g, ' ').trim().slice(0, 240);
    return { id: `${rel}:${name}`, kind: 'symbol', rel, name, text: `${name} ${decl}` };
  });
  return { moduleRecord, symbolRecords };
}

/** Parse one test file → a test record (text = path + imported modules + test/assert descriptions). */
export function parseTest(rel) {
  const src = readSafe(rel);
  const imps = localImports(src);
  const blocks = []; let m;
  TEST_BLOCK_RE.lastIndex = 0; while ((m = TEST_BLOCK_RE.exec(src))) blocks.push(m[1]);
  OK_DESC_RE.lastIndex = 0; while ((m = OK_DESC_RE.exec(src))) blocks.push(m[1]);
  const pathToks = rel.replace(/[\/.]/g, ' ');
  return { id: `${rel}:`, kind: 'test', rel, imports: imps, text: `${pathToks} ${imps.join(' ')} ${blocks.join(' ').slice(0, 1200)}`.trim() };
}

/** Extract {modules, symbols, tests} {id,text} records from one or more repo-relative roots. */
export function extractCircuitryRecords({ roots = ['_SYSTEM/Scripts'] } = {}) {
  const modules = [], symbols = [], tests = [];
  const seen = new Set();
  for (const root of roots) {
    const absRoot = path.join(REPO_ROOT, root);
    assertContained(absRoot, 'root'); // reject roots that escape the repo (e.g. ../../../tmp)
    for (const rel of listMjs(absRoot)) {
      if (seen.has(rel)) continue; seen.add(rel);
      if (/\.test\.mjs$/.test(rel)) { tests.push(parseTest(rel)); }
      else { const { moduleRecord, symbolRecords } = parseModule(rel); modules.push(moduleRecord); symbols.push(...symbolRecords); }
    }
  }
  return { modules, symbols, tests };
}

// ── similarity edges (corpus-match terrain — COMPLETE prefix-filter, NOT LSH) ────────────────────
/**
 * Derive near-duplicate (≥ nearDup) + mechanism-family (≥ family) edges over module+symbol records.
 * Uses the COMPLETE prefix-filter so no similar pair is missed. Pairs are unordered + deduped.
 */
export function deriveSimilarityEdges(records, { nearDup = 0.85, family = 0.30 } = {}) {
  const items = records.map((r) => ({ id: r.id, text: r.text }));
  const { featureFn } = makeFeatureFn(items, { minCooc: 2, ppmiFloor: 1.0, topN: 4 });
  const index = buildIndex(items, { threshold: family, featureFn, lsh: false, prefixFilter: true });
  const byId = new Map(records.map((r) => [r.id, r]));
  const edges = [];
  const seenPair = new Set();
  for (const r of records) {
    const res = matchPrefixFilter(index, r.text, { threshold: family });
    for (const mh of res.matches) {
      if (mh.id === r.id) continue;
      const key = r.id < mh.id ? `${r.id}|${mh.id}` : `${mh.id}|${r.id}`;
      if (seenPair.has(key)) continue; seenPair.add(key);
      const other = byId.get(mh.id);
      edges.push({ a: r.id, b: mh.id, score: mh.score, kind: mh.score >= nearDup ? 'near-duplicate' : 'mechanism-family', sameFile: other && other.rel === r.rel });
    }
  }
  edges.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : 1));
  return edges;
}

// ── tests-cover (hybrid: import/name + matcher confirm or MISMATCH) ──────────────────────────────
/**
 * Resolve a tests-cover edge per test: import-parse (strong) → name-match (medium), then confirm with
 * the matcher. If the top module hit differs from the claimed module → emit a MISMATCH (misnamed test).
 */
export function resolveTestsCover(tests, modules, { confirmThreshold = 0.2 } = {}) {
  const moduleItems = modules.map((m) => ({ id: m.id, text: m.text }));
  const { featureFn } = makeFeatureFn(moduleItems, { minCooc: 2, ppmiFloor: 1.0, topN: 4 });
  const mIndex = buildIndex(moduleItems, { threshold: confirmThreshold, featureFn, lsh: false, prefixFilter: true });
  const moduleByBase = new Map();
  for (const m of modules) moduleByBase.set(path.basename(m.rel), m);
  const edges = [], mismatches = [];
  for (const t of tests) {
    const base = path.basename(t.rel).replace(/\.test\.mjs$/, '.mjs');
    // 1. import parse: local non-test imports that resolve to a known module basename
    const importedMods = t.imports.filter((i) => !/\.test\.mjs$/.test(i) && moduleByBase.has(i)).map((i) => moduleByBase.get(i));
    // 2. name match fallback
    const nameMatch = moduleByBase.get(base) || null;
    let claimed = null, signal = null;
    if (importedMods.length === 1) { claimed = importedMods[0]; signal = 'import'; }
    else if (nameMatch) { claimed = nameMatch; signal = 'name'; }
    else if (importedMods.length > 1) {
      // multiple imports: prefer the name-match among them, else it's a multi-module integration test
      claimed = importedMods.find((m) => path.basename(m.rel) === base) || null; signal = claimed ? 'import+name' : 'multi-import';
    }
    // 3. matcher confirm — an EXPLICIT import is AUTHORITATIVE; the matcher only confirms, and a
    //    fingerprint disagreement is advisory, NOT a mismatch (Codex C1 false-positive fix).
    const top = matchPrefixFilter(mIndex, t.text, { threshold: confirmThreshold }).matches[0] || null;
    const importAuthoritative = signal === 'import' || signal === 'import+name';
    if (claimed) {
      const confirmed = top && top.id === claimed.id;
      edges.push({ test: t.id, module: claimed.id, signal, confidence: (confirmed || importAuthoritative) ? 'HIGH' : 'MEDIUM', matcherTop: top ? top.id : null });
      if (top && !confirmed && !importAuthoritative) mismatches.push({ test: t.id, claims: claimed.id, fingerprintTop: top.id, topScore: top.score });
    } else if (signal === 'multi-import') {
      // integration test importing several modules — covered (no single owner); record all imported
      edges.push({ test: t.id, module: importedMods[0].id, signal: 'multi-import', confidence: 'HIGH', covers: importedMods.map((m) => m.id), matcherTop: top ? top.id : null });
    } else if (top) {
      edges.push({ test: t.id, module: top.id, signal: 'similarity-only', confidence: 'LOW', matcherTop: top.id });
    } else {
      edges.push({ test: t.id, module: null, signal: 'unresolved', confidence: 'NONE', matcherTop: null });
    }
  }
  return { edges, mismatches };
}

// ── orphan report (completeness flag: a node nothing else looks like) ────────────────────────────
/** Records (modules+symbols) with ZERO similarity edges — the "vocabulary island" review prompt. */
export function orphanReport(records, edges) {
  const connected = new Set();
  for (const e of edges) { connected.add(e.a); connected.add(e.b); }
  return records.filter((r) => !connected.has(r.id)).map((r) => ({ id: r.id, kind: r.kind }));
}

// ── CLI (read-only report) ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const roots = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const { modules, symbols, tests } = extractCircuitryRecords(roots.length ? { roots } : {});
  const simRecords = [...modules, ...symbols];
  const edges = deriveSimilarityEdges(simRecords);
  const { edges: coverEdges, mismatches } = resolveTestsCover(tests, modules);
  const orphans = orphanReport(simRecords, edges);
  const nearDup = edges.filter((e) => e.kind === 'near-duplicate');
  const family = edges.filter((e) => e.kind === 'mechanism-family');
  console.log(`\n⬡ circuitry-auto-register (READ-ONLY)  roots=${roots.length ? roots.join(',') : '_SYSTEM/Scripts'}`);
  console.log(`  records: ${modules.length} modules · ${symbols.length} symbols · ${tests.length} tests`);
  console.log(`  similarity edges: ${nearDup.length} near-duplicate (≥0.85) · ${family.length} mechanism-family (≥0.30)`);
  console.log(`  tests-cover: ${coverEdges.filter((e) => e.confidence === 'HIGH').length} HIGH · ${coverEdges.filter((e) => e.confidence === 'MEDIUM').length} MEDIUM · ${coverEdges.filter((e) => e.confidence === 'LOW').length} LOW · ${coverEdges.filter((e) => e.confidence === 'NONE').length} unresolved`);
  console.log(`  MISMATCHes (test fingerprint ≠ claimed module): ${mismatches.length}`);
  console.log(`  orphan nodes (zero similarity edges): ${orphans.length}`);
  console.log(`\n  top near-duplicates:`);
  for (const e of nearDup.slice(0, 8)) console.log(`    ${e.score.toFixed(3)}  ${e.a}  ≈  ${e.b}${e.sameFile ? '  (same file)' : ''}`);
  if (mismatches.length) { console.log(`\n  test→module MISMATCHes:`); for (const m of mismatches.slice(0, 8)) console.log(`    ${m.test}  claims ${m.claims}  but fingerprints ${m.fingerprintTop} (${m.topScore.toFixed(3)})`); }
}
