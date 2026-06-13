#!/usr/bin/env node
/**
 * filing-deps.mjs — reference-aware dependency scanner for the YURI filing system.
 *
 * The assessor says WHERE a file should go. It does not know WHAT points at the file, so on its own it
 * cannot move anything safely. This is that missing half: given a file path, find every reference to it
 * across the 16 reference layers (code imports, markdown refs, @-includes, INDEX.md, circuitry graph,
 * registries, organ guides, skills, hooks, memory, indexes, HTML, symlinks, JSON configs) and classify the
 * blast radius. READ-ONLY — it never mutates anything; the mutator consumes its output.
 *
 * Engine: ONE `git grep` of the exact repo-relative path (the authoritative, auto-updatable references) plus
 * a basename grep for code/asset files (flagged basenameOnly — relative imports the mutator must review by
 * hand, never auto-rewrite). The circuitry file→node spine is parsed structurally from the RESEARCH graph
 * (the only graph that carries nodes[].files[]). FTS5 + GitNexus are flagged for reindex, never grepped.
 *
 * Deterministic: fixed-string search, sorted output, no RNG.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, isProtectedPath, REPO_ROOT } from './yuri-id-bridge.mjs';
import { isPinned } from './filing-assessor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = REPO_ROOT || path.resolve(__dirname, '..', '..');

// The only graph that keys nodes by file path (verified: 117/118 nodes carry files[]). The _SYSTEM/yuri-graph*.json
// files key by id/label and carry NO files[], so the structural file→node spine lives here. Raw path mentions in
// the other graphs are still caught by the text grep below (bucketed as graphRefs).
const FILE_BEARING_GRAPH = '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json';

const CODE_RE = /\.(mjs|js|cjs|ts|tsx|jsx|py)$/;
const GRAPH_FILE_RE = /(^|\/)yuri-(circuitry-)?graph(-state)?\.json$/;
const ATINCLUDE_HOST_RE = /(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$/;

const LAYER_KEYS = [
  'imports', 'markdownRefs', 'atIncludes', 'indexRefs', 'graphRefs', 'registryRefs', 'organGuideRefs',
  'skillRefs', 'hookRefs', 'memoryRefs', 'htmlRefs', 'symlinkRefs', 'jsonConfigRefs', 'otherRefs',
];

/**
 * Classify a single grep hit (the FILE it was found in, and the matching LINE) into one reference layer.
 * First match wins; the order encodes priority (a hit in INDEX.md is an indexRef even though it's also .md).
 * Pure — unit-tested without I/O.
 */
export function bucketLayer(file, line = '') {
  const f = normalizePath(file);
  if (ATINCLUDE_HOST_RE.test(f) && /^\s*@/.test(line)) return 'atIncludes';      // @-include chain (CRITICAL: boot)
  if (f === '_SYSTEM/INDEX.md') return 'indexRefs';                              // navigation map
  if (GRAPH_FILE_RE.test(f)) return 'graphRefs';                                // circuitry self-model
  if (f.startsWith('.claude/hooks/') || /(^|\/)settings(\.local)?\.json$/.test(f)) return 'hookRefs'; // runtime gates
  if (/(^|\/)SKILL\.md$/.test(f) || f.startsWith('skills/') || f.startsWith('.claude/skills/') || f.startsWith('.agents/')) return 'skillRefs';
  if (f === '_SYSTEM/organ-guides.json' || /organ-guides\.json$/.test(f)) return 'organGuideRefs';
  if (/(folder|artifact)-registry\.json$/.test(f) || f.startsWith('_SYSTEM/config/')) return 'registryRefs';
  if (f.startsWith('_SYSTEM/memory/') || /(^|\/)MEMORY\.md$/.test(f) || /\/memory\//.test(f)) return 'memoryRefs';
  if (CODE_RE.test(f) && /\b(import|require|from|loadStr|readFileSync)\b/.test(line)) return 'imports';
  if (f.endsWith('.html') || f.endsWith('.htm')) return 'htmlRefs';
  if (f.endsWith('.json')) return 'jsonConfigRefs';
  if (f.endsWith('.md')) return 'markdownRefs';
  return 'otherRefs';
}

/** Empty per-layer count/sample structure. */
function emptyLayers() {
  const counts = {}, samples = {};
  for (const k of LAYER_KEYS) { counts[k] = 0; samples[k] = []; }
  return { counts, samples };
}

/**
 * Roll up grep hits into per-layer counts + bounded samples. `selfRel` is excluded (a file naming itself is
 * not a dependency). Pure — unit-tested with synthetic hits.
 */
export function bucketHits(hits, selfRel, sampleCap = 4) {
  const { counts, samples } = emptyLayers();
  for (const h of hits) {
    const f = normalizePath(h.file);
    if (f === selfRel) continue;                 // a file referencing its own path is not a dependency
    const layer = bucketLayer(f, h.text || '');
    counts[layer] += 1;
    if (samples[layer].length < sampleCap) samples[layer].push({ file: f, line: h.line, text: (h.text || '').trim().slice(0, 160) });
  }
  return { counts, samples };
}

/**
 * Risk = worst blast radius of the layers that reference this file. Pinned anchors and boot/gate/self-model
 * references are CRITICAL (must not move, or move only with surgical care). Pure.
 */
export function classifyRisk(counts, rel, { pinned = false } = {}) {
  if (pinned || isPinned(rel)) return 'CRITICAL';
  if (counts.atIncludes > 0) return 'CRITICAL';                 // moving it breaks session boot
  if (counts.hookRefs > 0) return 'CRITICAL';                   // moving it breaks a runtime safety gate
  if (counts.graphRefs > 0) return 'CRITICAL';                  // moving it desyncs the self-model
  if (counts.imports > 0) return 'HIGH';                        // code execution depends on the path
  if (counts.indexRefs > 0) return 'HIGH';                      // navigation map points at it
  if (counts.markdownRefs > 5) return 'HIGH';                   // widely cross-linked in prose
  if (counts.registryRefs + counts.skillRefs + counts.organGuideRefs + counts.memoryRefs > 0) return 'MEDIUM';
  if (counts.markdownRefs + counts.htmlRefs + counts.jsonConfigRefs + counts.symlinkRefs > 0) return 'MEDIUM';
  return 'LOW';
}

/** Parse `git grep -n` output lines ("path:line:text") into structured hits. Pure. */
export function parseGrepOutput(stdout) {
  const hits = [];
  for (const raw of String(stdout || '').split('\n')) {
    if (!raw) continue;
    const m = raw.match(/^(.*?):(\d+):(.*)$/);
    if (!m) continue;
    hits.push({ file: m[1], line: Number(m[2]), text: m[3] });
  }
  return hits;
}

/** Run `git grep` for a fixed string across tracked + untracked-non-ignored files. status 1 = zero matches. */
function gitGrep(term, cap = 4000) {
  try {
    const out = execFileSync('git', ['grep', '-n', '-I', '-F', '--untracked', '--no-color', '-e', term], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    const hits = parseGrepOutput(out);
    return { hits: hits.slice(0, cap), truncated: hits.length > cap };
  } catch (e) {
    if (e && e.status === 1) return { hits: [], truncated: false };   // git grep: no matches
    return { hits: [], truncated: false, error: e && e.message ? e.message : String(e) };
  }
}

/** Tracked symlinks whose target path mentions the file's basename (bounded best-effort, layer 15). */
function symlinkRefs(rel) {
  try {
    const out = execFileSync('git', ['ls-files', '-s'], { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const base = path.basename(rel);
    const found = [];
    for (const line of out.split('\n')) {
      if (!line.startsWith('120000')) continue;                 // mode 120000 = symlink
      const p = line.split('\t')[1];
      if (!p) continue;
      let target = '';
      try { target = fs.readlinkSync(path.join(REPO, p)); } catch { /* unreadable */ }
      if (target && (target === rel || target.includes(base))) found.push({ file: normalizePath(p), target });
    }
    return found;
  } catch { return []; }
}

/** Structural circuitry refs: nodes in the file-bearing graph whose files[] contains rel. */
function graphNodeRefs(rel) {
  try {
    const g = JSON.parse(fs.readFileSync(path.join(REPO, FILE_BEARING_GRAPH), 'utf8'));
    const out = [];
    for (const n of (g.nodes || [])) {
      const files = Array.isArray(n.files) ? n.files.map(normalizePath) : [];
      if (files.includes(rel)) out.push({ node: n.id, label: n.label || null });
    }
    return out;
  } catch { return []; }
}

/**
 * scanDeps(filePath) — the complete dependency map for one file across all 16 reference layers.
 * READ-ONLY. Returns counts, bounded samples, structural graph nodes, basename-only (manual-review) refs,
 * reindex flags, total ref count, risk level, and blockMove (pinned anchors must never be relocated).
 */
export function scanDeps(filePath) {
  const rel = normalizePath(String(filePath || ''));
  if (!rel) return { path: '', error: 'empty path', totalRefs: 0, riskLevel: 'LOW' };

  const pinned = isPinned(rel);
  const protectedSrc = isProtectedPath(rel);

  // Layer sweep: exact full-path grep = the authoritative, auto-updatable references.
  const exact = gitGrep(rel);
  const { counts, samples } = bucketHits(exact.hits, rel);

  // Structural circuitry spine (merged into the graphRefs layer count).
  const graphNodes = graphNodeRefs(rel);
  counts.graphRefs += graphNodes.length;

  // Symlinks pointing at the file (layer 15).
  const symlinks = symlinkRefs(rel);
  counts.symlinkRefs += symlinks.length;
  if (symlinks.length) samples.symlinkRefs.push(...symlinks.slice(0, 4).map((s) => ({ file: s.file, target: s.target })));

  // Basename-only references (relative imports / asset src) — flagged for MANUAL review, never auto-rewritten,
  // because a bare basename match is not a safe exact-string replacement.
  let basenameOnly = [];
  const base = path.basename(rel);
  if (CODE_RE.test(rel) || /\.(css|html|json|svg|png)$/.test(rel)) {
    const bn = gitGrep(base, 1000);
    const exactFiles = new Set(exact.hits.map((h) => normalizePath(h.file)));
    basenameOnly = bn.hits
      .filter((h) => normalizePath(h.file) !== rel && !exactFiles.has(normalizePath(h.file)))
      .slice(0, 12)
      .map((h) => ({ file: normalizePath(h.file), line: h.line, text: (h.text || '').trim().slice(0, 120) }));
  }

  const totalRefs = LAYER_KEYS.reduce((s, k) => s + counts[k], 0);
  const riskLevel = classifyRisk(counts, rel, { pinned });

  return {
    path: rel,
    pinned,
    protected: protectedSrc,
    blockMove: pinned,                              // mutator HARD-refuses these (the 3 @-includes etc.)
    counts,
    samples,
    graphNodes,
    symlinks,
    basenameOnly,
    basenameOnlyCount: basenameOnly.length,
    needsReindex: { fts5: true, gitnexus: true },
    totalRefs,
    riskLevel,
    truncated: exact.truncated,
    grepError: exact.error || null,
    advisory_only: true,
    note: 'READ-ONLY dependency scan. Exact-path refs are auto-updatable; basenameOnly refs need manual review.',
  };
}

/**
 * exactPathRefs(rel) — the FULL set of files containing an exact-string reference to rel (deduped), i.e. the
 * auto-updatable references the mutator must rewrite. Unlike scanDeps (capped summary), this returns every
 * referencing file. The moved file itself is excluded. Protected ref-hosts are flagged (the mutator skips them).
 */
export function exactPathRefs(rel) {
  const r = normalizePath(String(rel || ''));
  if (!r) return { files: [], protectedHosts: [] };
  const { hits, truncated, error } = gitGrep(r, 8000);
  const seen = new Map();          // file -> first sample line
  const protectedHosts = [];
  for (const h of hits) {
    const f = normalizePath(h.file);
    if (f === r) continue;
    if (isProtectedPath(f)) { if (!protectedHosts.includes(f)) protectedHosts.push(f); continue; }
    if (!seen.has(f)) seen.set(f, { file: f, line: h.line, layer: bucketLayer(f, h.text || '') });
  }
  return { files: [...seen.values()].sort((a, b) => a.file.localeCompare(b.file)), protectedHosts: protectedHosts.sort(), truncated, error: error || null };
}

/** Scan a batch of files; sorted by path for deterministic output. */
export function scanBatchDeps(filePaths) {
  return (Array.isArray(filePaths) ? filePaths : [])
    .map((p) => scanDeps(p))
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const json = process.argv.includes('--json');
  if (!args.length) { process.stdout.write('usage: filing-deps.mjs <path...> [--json]\n'); process.exitCode = 1; }
  else {
    const rows = scanBatchDeps(args);
    if (json) process.stdout.write(JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2) + '\n');
    else {
      for (const d of rows) {
        process.stdout.write(`\n${d.path}  [${d.riskLevel}]${d.pinned ? ' PINNED/blockMove' : ''}${d.protected ? ' PROTECTED' : ''}\n`);
        process.stdout.write(`  total refs: ${d.totalRefs}${d.truncated ? ' (truncated)' : ''} · graph nodes: ${d.graphNodes.length} · basenameOnly(manual): ${d.basenameOnlyCount} · reindex: fts5+gitnexus\n`);
        for (const k of LAYER_KEYS) if (d.counts[k]) process.stdout.write(`    ${k.padEnd(16)} ${d.counts[k]}\n`);
      }
    }
  }
}
