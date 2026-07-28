#!/usr/bin/env node
// @capability: atlas-identity-reconciler
// @serves: cross-graph node id | canonical node identity | join circuitry graph knowledge graph arch graph gitnexus capabilities | atlas phase 1
// @does: reconciles the five mutually-incompatible YURI graph id schemes (circuitry, knowledge-graph,
//        arch-graph/yuri-graph-state, GitNexus, capabilities) into one canonical path-keyed id map,
//        reporting every unmapped node rather than dropping it.
// @use: run before building any cross-graph navigation feature; do not hand-roll a new id join —
//       read _SYSTEM/state/atlas/id-map.json or re-run this script.
// @exports: normalizePath, canonicalFileKey, mergeCapabilityDescription, SOURCE_INTEGRITY, assertSubstrateIntegrity, buildAtlas, main
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
import { randomBytes, createHash } from 'node:crypto';
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

function sha256Text(s) {
  return createHash('sha256').update(s).digest('hex');
}

function loadJSON(p, label, report) {
  if (!existsSync(p)) {
    report.missing.push({ source: label, path: p });
    return { data: null, sha256: null };
  }
  try {
    const raw = readFileSync(p, 'utf8');
    return { data: JSON.parse(raw), sha256: sha256Text(raw) };
  } catch (err) {
    report.missing.push({ source: label, path: p, reason: `parse error: ${err.message}` });
    return { data: null, sha256: null };
  }
}

// ---------------------------------------------------------------------------
// SUBSTRATE INTEGRITY — fail LOUD, never fail soft.
//
// Proof case (2026-07-28): the gitnexus probe fail-softed for days after an npx
// cache corrupted. Nothing announced it; the corpus silently ran at 2,161
// canonical nodes instead of 4,255, and every score measured in that window was
// an artifact of half the repo being invisible. The single rule that would have
// caught it on day one: A SOURCE RETURNING ZERO ROWS IS AN ERROR, not an empty
// contribution.
//
// Floors are COLLAPSE detectors, not targets: each sits far below the source's
// legitimate current size (circuitry 136, knowledge-graph 1001, arch-graph 232,
// capabilities 286, gitnexus 4147 — measured 2026-07-28) so organic shrinkage
// never trips them, but a probe that comes back empty, truncated, or misjoined
// always does. Moving a floor is a deliberate, reviewed diff — there is NO
// runtime bypass flag, because a bypass is exactly how fail-soft comes back.
// ---------------------------------------------------------------------------

export const SOURCE_INTEGRITY = Object.freeze({
  circuitry: { minRecords: 50, input: '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json' },
  'knowledge-graph': { minRecords: 500, input: '_SYSTEM/state/yuri-knowledge-graph.json' },
  'arch-graph': { minRecords: 100, input: '_SYSTEM/yuri-graph-state.json' },
  capabilities: { minRecords: 100, input: '_SYSTEM/capabilities.json' },
  gitnexus: { minRecords: 1000, input: '.gitnexus/meta.json' },
});

/**
 * The gate. Throws on the FIRST integrity violation — a build that cannot see
 * its sources must die here, before it writes an id-map that downstream lanes
 * will trust. Returns a per-source health summary on success.
 */
export function assertSubstrateIntegrity({ perSource, gitnexusNote, missing, noGitnexus }) {
  if (missing.length > 0) {
    const m = missing[0];
    throw new Error(
      `SUBSTRATE INTEGRITY: input unreadable for source "${m.source}": ${m.path}`
      + `${m.reason ? ` (${m.reason})` : ''}. A missing generated input is an ERROR — regenerate it, do not build past it.`,
    );
  }
  if (gitnexusNote && !noGitnexus) {
    throw new Error(
      `SUBSTRATE INTEGRITY: gitnexus probe failed: ${gitnexusNote}. `
      + 'The probe answering nothing is an ERROR — fix the probe (or pass --no-gitnexus explicitly, which is recorded in the fingerprint).',
    );
  }
  for (const [sourceName, records] of Object.entries(perSource)) {
    const floor = SOURCE_INTEGRITY[sourceName];
    if (sourceName === 'gitnexus' && noGitnexus) continue; // explicit exclusion, recorded downstream
    if (!floor) continue;
    if (records.length === 0) {
      throw new Error(
        `SUBSTRATE INTEGRITY: source "${sourceName}" returned ZERO rows. `
        + 'Zero rows is an ERROR (silent-empty is the 2026-07-28 failure class), never an empty contribution.',
      );
    }
    if (records.length < floor.minRecords) {
      throw new Error(
        `SUBSTRATE INTEGRITY: source "${sourceName}" returned ${records.length} rows, below floor ${floor.minRecords}. `
        + 'A collapse-class shortfall is an ERROR — investigate the source, do not absorb it.',
      );
    }
    if (records.every((r) => !r.path)) {
      throw new Error(
        `SUBSTRATE INTEGRITY: source "${sourceName}" returned ${records.length} rows but NONE resolved to a path. `
        + 'A fully unmapped source means the join key broke — that is an ERROR, not an unmapped list.',
      );
    }
  }
  return true;
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
    // serves is an ARRAY of intent phrases; does is a SINGLE prose string.
    // Both ride along on the record so buildAtlas can thread them onto the
    // canonical node — the resolver's capability tier is blind without them.
    const serves = Array.isArray(c.serves)
      ? c.serves.filter((s) => typeof s === 'string' && s.length > 0)
      : (typeof c.serves === 'string' && c.serves.length > 0 ? [c.serves] : []);
    const does = typeof c.does === 'string' && c.does.length > 0 ? c.does : null;
    const norm = normalizePath(c.mechanism);
    if (!norm) {
      records.push({ sourceId: c.id, path: null, label: c.id, serves, does, reason: 'no mechanism field on capability entry' });
      continue;
    }
    records.push({ sourceId: c.id, path: norm, label: c.id, evidence: 'mechanism field is this path', serves, does });
  }
  return records;
}

/**
 * Merge one capability record's serves/does onto a canonical node, deduped.
 * Multiple capability entries can share one mechanism path (e.g.
 * _SYSTEM/Scripts/eval-processing.mjs has 4) — without per-node dedup every
 * shared term would be carried 4x and the resolver's df map would be dishonest.
 */
export function mergeCapabilityDescription(node, rec) {
  if (rec.serves && rec.serves.length > 0) {
    if (!node.serves) node.serves = [];
    for (const s of rec.serves) {
      if (!node.serves.includes(s)) node.serves.push(s);
    }
  }
  if (rec.does) {
    if (!node.does) node.does = [];
    if (!node.does.includes(rec.does)) node.does.push(rec.does);
  }
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
  const inputs = {
    circuitry: loadJSON(SOURCES.circuitry, 'circuitry', report),
    knowledgeGraph: loadJSON(SOURCES.knowledgeGraph, 'knowledge-graph', report),
    archGraphMetrics: loadJSON(SOURCES.archGraphMetrics, 'arch-graph-metrics', report),
    graphState: loadJSON(SOURCES.graphState, 'yuri-graph-state', report),
    gitnexusMeta: loadJSON(SOURCES.gitnexusMeta, 'gitnexus-meta', report),
    capabilities: loadJSON(SOURCES.capabilities, 'capabilities', report),
  };

  const perSource = {
    circuitry: extractCircuitry(inputs.circuitry.data),
    'knowledge-graph': extractKnowledgeGraph(inputs.knowledgeGraph.data),
    'arch-graph': extractArchGraph(inputs.graphState.data),
    capabilities: extractCapabilities(inputs.capabilities.data),
  };

  const gitnexus = extractGitNexus(inputs.gitnexusMeta.data, {
    noGitnexus: !!opts.noGitnexus,
    gitnexusTimeoutMs: opts.gitnexusTimeoutMs || 45000,
  });
  perSource.gitnexus = gitnexus.records;

  // FAIL LOUD before any assembly: a degraded source never becomes an id-map.
  assertSubstrateIntegrity({
    perSource,
    gitnexusNote: gitnexus.note,
    missing: report.missing,
    noGitnexus: !!opts.noGitnexus,
  });

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
      if (sourceName === 'capabilities') mergeCapabilityDescription(node, rec);
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

  // Content-stable corpus fingerprint: covers the node KEY SET + per-source
  // totals + input hashes — deliberately NOT the volatile `generated`
  // timestamp, so two regenerations over an unchanged corpus fingerprint
  // identically and a real corpus change is DETECTED by comparison.
  const corpusFingerprint = sha256Text(JSON.stringify({
    keys: Object.keys(nodes).sort(),
    perSource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.total])),
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.sha256])),
    gitnexus: opts.noGitnexus ? 'excluded-by-flag' : 'probed',
  }));

  const atlas = {
    generated: new Date().toISOString(),
    canonical_scheme: '<repo_root>::<kind>::<stable-key>',
    counts: {
      canonical: canonicalCount,
      mapped: mappedCount,
      unmapped: unmappedCount,
      by_source: bySource,
    },
    substrate: {
      gitnexus: opts.noGitnexus ? 'excluded-by-flag' : 'probed',
      inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { path: SOURCES[k] ? path.relative(ROOT, SOURCES[k]) : null, sha256: v.sha256 }])),
      per_source: bySource,
      corpus_fingerprint: corpusFingerprint,
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

  // serves/does ride along on extraction, normalized (serves always an array,
  // does a string-or-null), and merge deduped per canonical node — a mechanism
  // path shared by N capability entries must not carry its terms N times.
  const synthCapsDesc = { capabilities: [{
    id: 'cap-desc', mechanism: 'x.mjs', serves: ['alpha intent', 'shared'], does: 'does thing',
  }] };
  const recDesc = extractCapabilities(synthCapsDesc);
  assert(recDesc[0].serves.length === 2 && recDesc[0].does === 'does thing', 'serves/does extracted with record');
  const synthNode = { labels: [], aliases: [] };
  mergeCapabilityDescription(synthNode, recDesc[0]);
  mergeCapabilityDescription(synthNode, { serves: ['shared', 'beta intent'], does: 'does thing' });
  assert(synthNode.serves.length === 3 && synthNode.does.length === 1, 'duplicate capability records dedupe per node');

  // markdown table parser
  const md = '| id | path | name |\n| --- | --- | --- |\n| File:a.ts | a.ts | a.ts |\n| File:b.ts | b.ts | b.ts |';
  const rows = parseMarkdownTable(md);
  assert(rows.length === 2 && rows[0].path === 'a.ts' && rows[1].path === 'b.ts', 'markdown table parses gitnexus cypher rows');

  // SUBSTRATE INTEGRITY GATE — the fail-loud contract (2026-07-28 silent
  // fail-soft proof case). Every degradation class must THROW, never absorb.
  const healthySources = Object.fromEntries(Object.keys(SOURCE_INTEGRITY).map((k) => [
    k,
    Array.from({ length: SOURCE_INTEGRITY[k].minRecords }, (_, i) => ({ path: `pkg/${k}-${i}.mjs` })),
  ]));
  assert(
    assertSubstrateIntegrity({ perSource: healthySources, gitnexusNote: null, missing: [], noGitnexus: false }) === true,
    'healthy substrate passes the gate',
  );
  const expectThrow = (fn, label) => {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, `gate throws on ${label}`);
  };
  expectThrow(
    () => assertSubstrateIntegrity({ perSource: healthySources, gitnexusNote: null, missing: [{ source: 'capabilities', path: '/x' }], noGitnexus: false }),
    'missing input file',
  );
  expectThrow(
    () => assertSubstrateIntegrity({ perSource: healthySources, gitnexusNote: 'probe failed (npx cache)', missing: [], noGitnexus: false }),
    'gitnexus probe failure note',
  );
  expectThrow(
    () => assertSubstrateIntegrity({ perSource: { ...healthySources, gitnexus: [] }, gitnexusNote: null, missing: [], noGitnexus: false }),
    'zero-row source',
  );
  expectThrow(
    () => assertSubstrateIntegrity({ perSource: { ...healthySources, capabilities: [{ path: 'a.mjs' }] }, gitnexusNote: null, missing: [], noGitnexus: false }),
    'below-floor source',
  );
  expectThrow(
    () => assertSubstrateIntegrity({
      perSource: { ...healthySources, circuitry: Array.from({ length: 60 }, () => ({ path: null })) },
      gitnexusNote: null, missing: [], noGitnexus: false,
    }),
    'fully unmapped source',
  );
  // Explicit --no-gitnexus exclusion bypasses ONLY the gitnexus checks.
  assert(
    assertSubstrateIntegrity({ perSource: { ...healthySources, gitnexus: [] }, gitnexusNote: 'skipped via --no-gitnexus', missing: [], noGitnexus: true }) === true,
    'explicit --no-gitnexus exclusion passes with zero gitnexus rows',
  );

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
