#!/usr/bin/env node
// @capability: atlas-identity-reconciler
// @serves: cross-graph node id | canonical node identity | join circuitry graph knowledge graph arch graph gitnexus capabilities | atlas phase 1
// @does: reconciles the five mutually-incompatible YURI graph id schemes (circuitry, knowledge-graph,
//        arch-graph/yuri-graph-state, GitNexus, capabilities) into one canonical path-keyed id map,
//        reporting every unmapped node rather than dropping it.
// @use: run before building any cross-graph navigation feature; do not hand-roll a new id join —
//       read _SYSTEM/state/atlas/id-map.json or re-run this script.
// @exports: normalizePath, canonicalFileKey, buildAtlas, main
//
// Phase 1 of the YURI Atlas plan. Read-only w.r.t. every input source; the only
// files this script writes are its own output (_SYSTEM/state/atlas/id-map.json)
// or stdout (--json). Zero external npm dependencies: node:fs, node:path,
// node:crypto only, EXCEPT the GitNexus best-effort probe below, which is a
// deliberate, isolated, explicitly-documented use of node:child_process — the
// only way to reach GitNexus's binary "ladybugdb" store (.gitnexus/*.lbug is
// not JSON, not fs/path/crypto-parseable). Skip it entirely with --no-gitnexus.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
// The ONE deliberate exception to the fs/path/crypto-only rule (see the
// extractGitNexus() doc comment below for why): node:child_process is a
// node builtin, not an npm dependency, and is touched only when the
// best-effort GitNexus probe actually runs (skippable via --no-gitnexus).
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// _SYSTEM/Scripts/atlas/atlas-identity.mjs -> repo root is 3 levels up.
const ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT_LABEL = path.basename(ROOT);

const SOURCES = {
  circuitry: path.join(ROOT, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json'),
  knowledgeGraph: path.join(ROOT, '_SYSTEM/state/yuri-knowledge-graph.json'),
  archGraphMetrics: path.join(ROOT, '_SYSTEM/state/arch-graph-metrics.json'),
  graphState: path.join(ROOT, '_SYSTEM/yuri-graph-state.json'),
  gitnexusMeta: path.join(ROOT, '.gitnexus/meta.json'),
  capabilities: path.join(ROOT, '_SYSTEM/capabilities.json'),
};

const DEFAULT_OUT = path.join(ROOT, '_SYSTEM/state/atlas/id-map.json');

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a path string to a repo-relative, POSIX-separated, no-leading-dot,
 * no-leading-slash, no-duplicate-slash form. This is the join key for every
 * file-backed node across all five sources.
 */
export function normalizePath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  let s = p.replace(/\\/g, '/');
  s = s.replace(/^\.\//, '');
  while (s.startsWith('/')) s = s.slice(1);
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/\/+$/, '');
  return s.length > 0 ? s : null;
}

/** Canonical key: <repo_root>::<kind>::<stable-key> */
export function canonicalFileKey(repoRoot, relPath) {
  return `${repoRoot}::file::${relPath}`;
}

// ---------------------------------------------------------------------------
// Safe loaders
// ---------------------------------------------------------------------------

function loadJSON(p, label, report) {
  if (!existsSync(p)) {
    report.missing.push({ source: label, path: p });
    return null;
  }
  try {
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    report.missing.push({ source: label, path: p, reason: `parse error: ${err.message}` });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-source extraction. Each returns { records, sourceNote? }
// A "record" is { sourceId, path, label, evidence } (path may be null -> unmapped)
// ---------------------------------------------------------------------------

function extractCircuitry(data) {
  const records = [];
  if (!data || !Array.isArray(data.nodes)) return records;
  for (const n of data.nodes) {
    const files = Array.isArray(n.files) ? n.files : [];
    if (files.length === 0) {
      records.push({ sourceId: n.id, path: null, label: n.label, reason: 'no files[] entry on circuitry node' });
      continue;
    }
    for (const f of files) {
      const norm = normalizePath(f);
      records.push({
        sourceId: n.id,
        path: norm,
        label: n.label,
        evidence: 'files[] contains this path',
      });
    }
  }
  return records;
}

function extractKnowledgeGraph(data) {
  const records = [];
  if (!data || !Array.isArray(data.nodes)) return records;
  for (const n of data.nodes) {
    const norm = normalizePath(n.path || (n.meta && n.meta.relPath));
    if (!norm) {
      records.push({ sourceId: n.id, path: null, label: n.label, reason: 'no path/meta.relPath on knowledge-graph node' });
      continue;
    }
    records.push({ sourceId: n.id, path: norm, label: n.label, evidence: 'path match' });
  }
  return records;
}

function extractArchGraph(graphStateData) {
  // arch-graph-metrics.json carries only aggregate stats + SCREAMING_CASE id
  // lists (isolated[], articulationPoints[], bridges[]); it does not enumerate
  // full node records. Its declared source, yuri-graph-state.json, IS the full
  // 117-node universe (summary.nodes === 117 === graphStateData.nodes.length),
  // so per the task instructions we join on that file. Alias source label
  // stays "arch-graph" since that's the graph these ids denote.
  const records = [];
  if (!graphStateData || !Array.isArray(graphStateData.nodes)) return records;
  for (const n of graphStateData.nodes) {
    const files = (n.metadata && Array.isArray(n.metadata.files)) ? n.metadata.files : [];
    if (files.length === 0) {
      records.push({ sourceId: n.id, path: null, label: n.label, reason: 'no metadata.files[] on arch-graph/yuri-graph-state node' });
      continue;
    }
    for (const f of files) {
      const norm = normalizePath(f);
      records.push({
        sourceId: n.id,
        path: norm,
        label: n.label,
        evidence: 'metadata.files[] contains this path (via yuri-graph-state.json)',
      });
    }
  }
  return records;
}

function extractCapabilities(data) {
  const records = [];
  const list = Array.isArray(data && data.capabilities) ? data.capabilities : [];
  for (const c of list) {
    const norm = normalizePath(c.mechanism);
    if (!norm) {
      records.push({ sourceId: c.id, path: null, label: c.id, reason: 'no mechanism field on capability entry' });
      continue;
    }
    records.push({ sourceId: c.id, path: norm, label: c.id, evidence: 'mechanism field is this path' });
  }
  return records;
}

// ---------------------------------------------------------------------------
// GitNexus: best-effort, file-granularity only, explicit child_process exception.
// ---------------------------------------------------------------------------

function extractGitNexus(metaData, opts) {
  const result = { records: [], note: null };
  if (opts.noGitnexus) {
    result.note = 'skipped via --no-gitnexus';
    return result;
  }
  if (!metaData) {
    result.note = 'gitnexus meta.json missing or unreadable — nothing to probe';
    return result;
  }
  // .gitnexus stores its graph in a proprietary binary "ladybugdb" (.lbug) file
  // (magic bytes "LBUG"), which is not JSON and not parseable with fs/path/crypto
  // alone. Full symbol-level extraction (48,623 nodes per meta.json) is
  // impractical without the gitnexus library itself. We map at FILE granularity
  // ONLY, via a best-effort shell-out to the already-installed `gitnexus` CLI's
  // `cypher` command (the one documented query interface). This is the single
  // deliberate exception to the fs/path/crypto-only rule in this file, and it
  // fails soft: any error here degrades to a reported source note, never a crash.
  //
  // The CLI's stdout is captured via a shell redirect to a temp file rather
  // than a piped execFileSync buffer: measured empirically, piped stdout
  // truncates hard at 65536 bytes (a gitnexus/Node stdout-drain interaction,
  // not a maxBuffer limit) — file redirection sidesteps it entirely.
  const tmpFile = path.join(os.tmpdir(), `atlas-gitnexus-${randomBytes(6).toString('hex')}.json`);
  try {
    const query = 'MATCH (n:File) RETURN n.id as id, n.filePath as path, n.name as name';
    execFileSync('/bin/sh', ['-c', `npx gitnexus cypher "$1" > "$2"`, 'sh', query, tmpFile], {
      cwd: ROOT,
      timeout: opts.gitnexusTimeoutMs,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const out = readFileSync(tmpFile, 'utf8');
    const parsed = JSON.parse(out);
    if (parsed.error) {
      result.note = `gitnexus cypher returned an error: ${parsed.error}`;
      return result;
    }
    // markdown table format: "| id | path | name |\n| --- | --- | --- |\n| ... |"
    const rows = parseMarkdownTable(parsed.markdown);
    for (const row of rows) {
      const norm = normalizePath(row.path);
      if (!norm) {
        result.records.push({ sourceId: row.id, path: null, label: row.name, reason: 'gitnexus File node had no filePath' });
        continue;
      }
      result.records.push({ sourceId: row.id, path: norm, label: row.name, evidence: 'gitnexus File.filePath (file-granularity only; symbol-level nodes not extracted)' });
    }
    if (rows.length === 0) {
      result.note = 'gitnexus cypher returned zero File rows — check gitnexus index freshness';
    }
  } catch (err) {
    result.note = `gitnexus probe failed (${err.message}); file-granularity mapping unavailable this run. meta.json reports ${metaData.stats ? metaData.stats.files : '?'} files / ${metaData.stats ? metaData.stats.nodes : '?'} total nodes as informational counts only.`;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* best-effort cleanup only */ }
  }
  return result;
}

function parseMarkdownTable(markdown) {
  if (typeof markdown !== 'string') return [];
  const lines = markdown.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((s) => s.trim()).filter(Boolean);
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    // Split on pipes; drop the leading/trailing empty strings from the split.
    const raw = lines[i].split('|');
    const trimmed = raw.slice(1, raw.length - 1).map((s) => s.trim());
    const row = {};
    header.forEach((h, idx) => { row[h] = trimmed[idx] !== undefined ? trimmed[idx] : null; });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Atlas assembly
// ---------------------------------------------------------------------------

export function buildAtlas(opts = {}) {
  const report = { missing: [] };
  const circuitryData = loadJSON(SOURCES.circuitry, 'circuitry', report);
  const knowledgeGraphData = loadJSON(SOURCES.knowledgeGraph, 'knowledge-graph', report);
  const archGraphMetricsData = loadJSON(SOURCES.archGraphMetrics, 'arch-graph-metrics', report);
  const graphStateData = loadJSON(SOURCES.graphState, 'yuri-graph-state', report);
  const gitnexusMetaData = loadJSON(SOURCES.gitnexusMeta, 'gitnexus-meta', report);
  const capabilitiesData = loadJSON(SOURCES.capabilities, 'capabilities', report);

  const perSource = {
    circuitry: extractCircuitry(circuitryData),
    'knowledge-graph': extractKnowledgeGraph(knowledgeGraphData),
    'arch-graph': extractArchGraph(graphStateData),
    capabilities: extractCapabilities(capabilitiesData),
  };

  const gitnexus = extractGitNexus(gitnexusMetaData, {
    noGitnexus: !!opts.noGitnexus,
    gitnexusTimeoutMs: opts.gitnexusTimeoutMs || 45000,
  });
  perSource.gitnexus = gitnexus.records;

  const nodes = {};
  const unmapped = [];
  const bySource = {};

  for (const [sourceName, records] of Object.entries(perSource)) {
    bySource[sourceName] = { total: records.length, mapped: 0, unmapped: 0 };
    for (const rec of records) {
      if (!rec.path) {
        bySource[sourceName].unmapped++;
        unmapped.push({ source: sourceName, id: rec.sourceId, reason: rec.reason || 'no path resolved' });
        continue;
      }
      bySource[sourceName].mapped++;
      const key = canonicalFileKey(REPO_ROOT_LABEL, rec.path);
      if (!nodes[key]) {
        nodes[key] = {
          kind: 'file',
          path: rec.path,
          repo_root: REPO_ROOT_LABEL,
          labels: [],
          aliases: [],
        };
      }
      const node = nodes[key];
      if (rec.label && !node.labels.includes(rec.label)) node.labels.push(rec.label);
      node.aliases.push({
        source: sourceName,
        id: rec.sourceId,
        confidence: 'exact',
        evidence: rec.evidence || 'path match',
      });
    }
  }

  const canonicalCount = Object.keys(nodes).length;
  const mappedCount = Object.values(bySource).reduce((a, s) => a + s.mapped, 0);
  const unmappedCount = unmapped.length;

  const atlas = {
    generated: new Date().toISOString(),
    canonical_scheme: '<repo_root>::<kind>::<stable-key>',
    counts: {
      canonical: canonicalCount,
      mapped: mappedCount,
      unmapped: unmappedCount,
      by_source: bySource,
    },
    nodes,
    unmapped,
    sourceNotes: {
      gitnexus: gitnexus.note,
      missingSources: report.missing,
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
  // normalizePath
  assert(normalizePath('./a/b.mjs') === 'a/b.mjs', 'strip leading ./');
  assert(normalizePath('/a/b.mjs') === 'a/b.mjs', 'strip leading /');
  assert(normalizePath('a\\b\\c.mjs') === 'a/b/c.mjs', 'backslash -> forward slash');
  assert(normalizePath('a//b///c.mjs') === 'a/b/c.mjs', 'collapse duplicate slashes');
  assert(normalizePath('a/b.mjs/') === 'a/b.mjs', 'strip trailing slash');
  assert(normalizePath('') === null, 'empty string -> null');
  assert(normalizePath(null) === null, 'null -> null');
  assert(normalizePath('a/b.mjs') === 'a/b.mjs', 'already-clean path is idempotent');

  // canonicalFileKey
  assert(
    canonicalFileKey('YURI-OS-MUSUBI', '_SYSTEM/Scripts/x.mjs') === 'YURI-OS-MUSUBI::file::_SYSTEM/Scripts/x.mjs',
    'canonical key shape'
  );

  // Synthetic join: two sources pointing at the same normalized path must
  // merge into ONE canonical node with two aliases, never two nodes.
  const synthCircuitry = { nodes: [{ id: 'fake-node', label: 'Fake', files: ['./_SYSTEM/Scripts/fake.mjs'] }] };
  const synthKG = { nodes: [{ id: 'script:_SYSTEM/Scripts/fake.mjs', path: '_SYSTEM/Scripts/fake.mjs', label: 'fake.mjs' }] };
  const recA = extractCircuitry(synthCircuitry);
  const recB = extractKnowledgeGraph(synthKG);
  assert(recA.length === 1 && recA[0].path === '_SYSTEM/Scripts/fake.mjs', 'synthetic circuitry extraction');
  assert(recB.length === 1 && recB[0].path === '_SYSTEM/Scripts/fake.mjs', 'synthetic knowledge-graph extraction');
  assert(canonicalFileKey('X', recA[0].path) === canonicalFileKey('X', recB[0].path), 'synthetic paths join to same canonical key');

  // A node with no files must be reported unmapped, never silently dropped.
  const synthNoFiles = { nodes: [{ id: 'orphan-node', label: 'Orphan', files: [] }] };
  const recOrphan = extractCircuitry(synthNoFiles);
  assert(recOrphan.length === 1 && recOrphan[0].path === null && !!recOrphan[0].reason, 'orphan node surfaces reason, path null');

  // arch-graph extraction from a synthetic graph-state shape
  const synthGraphState = { nodes: [{ id: 'FAKE_NODE', label: 'Fake Node', metadata: { files: ['a.mjs', 'b.mjs'] } }] };
  const recArch = extractArchGraph(synthGraphState);
  assert(recArch.length === 2, 'arch-graph node with 2 files fans out to 2 records');

  // capabilities extraction
  const synthCaps = { capabilities: [{ id: 'fake-cap', mechanism: '_SYSTEM/Scripts/fake-cap.mjs' }] };
  const recCap = extractCapabilities(synthCaps);
  assert(recCap.length === 1 && recCap[0].path === '_SYSTEM/Scripts/fake-cap.mjs', 'capability mechanism join');

  // markdown table parser
  const md = '| id | path | name |\n| --- | --- | --- |\n| File:a.ts | a.ts | a.ts |\n| File:b.ts | b.ts | b.ts |';
  const rows = parseMarkdownTable(md);
  assert(rows.length === 2 && rows[0].path === 'a.ts' && rows[1].path === 'b.ts', 'markdown table parses gitnexus cypher rows');

  return true;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`atlas-identity.mjs — YURI Atlas Phase 1: cross-graph node id reconciler

Usage:
  node _SYSTEM/Scripts/atlas/atlas-identity.mjs [options]

Options:
  --json               Emit the atlas to stdout instead of writing the output file
  --out=<path>         Write to a custom path (default: _SYSTEM/state/atlas/id-map.json)
  --verbose            Print per-source mapping stats to stderr
  --no-gitnexus        Skip the GitNexus probe entirely (pure fs/path/crypto run)
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
      console.log('SELF-TEST: PASS (7 checks)');
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

  const atlas = buildAtlas({ noGitnexus });

  if (verbose) {
    console.error('--- atlas-identity: per-source stats ---');
    for (const [src, stats] of Object.entries(atlas.counts.by_source)) {
      console.error(`  ${src.padEnd(16)} total=${String(stats.total).padEnd(6)} mapped=${String(stats.mapped).padEnd(6)} unmapped=${stats.unmapped}`);
    }
    console.error(`  canonical nodes: ${atlas.counts.canonical}`);
    console.error(`  total unmapped:  ${atlas.counts.unmapped}`);
    if (atlas.sourceNotes.gitnexus) console.error(`  gitnexus note:   ${atlas.sourceNotes.gitnexus}`);
    if (atlas.sourceNotes.missingSources.length) {
      console.error('  missing sources:');
      for (const m of atlas.sourceNotes.missingSources) console.error(`    - ${m.source}: ${m.path}${m.reason ? ' (' + m.reason + ')' : ''}`);
    }
    console.error('-----------------------------------------');
  }

  if (jsonOut) {
    console.log(JSON.stringify(atlas, null, 2));
    return 0;
  }

  writeFileSync(outPath, JSON.stringify(atlas, null, 2), 'utf8');
  console.log(`atlas-identity: wrote ${outPath}`);
  console.log(`  canonical=${atlas.counts.canonical} mapped=${atlas.counts.mapped} unmapped=${atlas.counts.unmapped}`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().then((code) => process.exit(code || 0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
