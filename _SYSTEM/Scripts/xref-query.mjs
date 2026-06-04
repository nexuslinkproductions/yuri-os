#!/usr/bin/env node
/**
 * xref-query.mjs — the UNIFIED cross-reference retrieval surface (XREF-01).
 *
 * One question, asked across all four siloed retrieval surfaces at once, returned as a single
 * MERGED, deduped, provenance-tagged result set. This is the executable face of the meta-law
 * "hold breadth + depth, cross-reference everything" — today four tools and a human stitching
 * them; here, one read front-door.
 *
 *   1. FTS5      corpus search (BM25) over _SYSTEM/OS_KERNEL/search-index.db.
 *                Imports buildMatch from yuri-search.mjs (the injection-hardened matcher — NOT
 *                reimplemented). evidenceKind = lexical-only (LOW, < 0.55, requireMismatch).
 *   2. GRAPH     the 83-node circuitry graph (02_RESOURCES/RESEARCH/yuri-circuitry-graph.json,
 *                READ-ONLY). Token-overlap on (description + triggeredBy + label). If --node is
 *                given, 1-hop neighbors are surfaced tagged by edge.kind. calls|reads -> MED
 *                graph-neighbor; `writes` edges are EXCLUDED (verified data-flow != shared
 *                mechanism). evidenceKind for token-only node hits = lexical-only.
 *   3. GITNEXUS  the structural call-graph (gitnexus CLI `query`, pinned to the LIVE repo root).
 *                evidenceKind = gitnexus-structural (HIGH 0.8..1.0), DOWNRANKED if the index is
 *                stale vs HEAD. FAIL-CLOSED: if the structural leg is unavailable (CLI missing,
 *                throws, empty), structuralLegAvailable=false and every would-be-structural hit
 *                is capped at the lexical ceiling + tagged structuralUnavailable — NEVER silently
 *                presented as structurally corroborated (XREF-05).
 *   4. SPECTRUM  the 267-mechanism doc (yuri-mechanism-spectrum-267-*.md). Layer-header +
 *                mechanism-name token grep. Prose surface, no structural backing -> lexical-only.
 *
 * EVERY merged hit is graded by xref-provenance.scoreHit (the SHARED confidence model — XREF-04)
 * and theater-gated by gateHit: a sub-0.55 hit with no named mismatch is suppressed to the
 * low-confidence sub-log, never the main surface. A writes-edge sibling is never surfaced.
 * Before return, each surfaced hit passes the serialize-revalidate canary (XREF-05) so a
 * malformed provenance object cannot ship.
 *
 * It does NOT auto-fire, does NOT mutate, does NOT write any file, does NOT touch protected
 * paths. Pure read front-door.
 *
 * Usage:
 *   node _SYSTEM/Scripts/xref-query.mjs "energy gate protected path veto"
 *   node _SYSTEM/Scripts/xref-query.mjs "<query>" --node energy-fn --top 15 --json
 *
 * ----------------------------------------------------------------------------------------------
 * VERIFIED FOOTGUNS (XREF-05 hardening — each closed below; do not "simplify" them away):
 *   F1  TWO indexed yuri-os repos exist (live root + a STALE worktree at
 *       .claude/worktrees/vault-restructure). The gitnexus --repo param is PINNED to the live
 *       absolute root (LIVE_REPO_ROOT). An unpinned query can silently hit the wrong graph.
 *   F2  gitnexus embeddings = 0 on both repos -> keyword(BM25)-only ranking. This module NEVER
 *       uses the word "semantic" in output; the structural leg is a typed call-graph proxy, not
 *       vector search.
 *   F3  Silent structural->lexical degradation is severity-laundering (cf FB:DELTA-GATE-
 *       SEVERITY-LAUNDERING): a LOW lexical hit presented as a HIGH structural one. Fail-CLOSED:
 *       when the structural leg is down, would-be-structural hits are downgraded + tagged
 *       structuralUnavailable, never promoted.
 * ----------------------------------------------------------------------------------------------
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildMatch } from './yuri-search.mjs';
import {
  scoreHit,
  gateHit,
  serializeRevalidate,
  EVIDENCE_KIND,
  XREF_PROVENANCE_KNOBS,
} from './xref-provenance.mjs';
import { gitnexusStaleness } from './xref-drift-scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// F1: the LIVE repo root — the gitnexus --repo param is pinned here, never the stale worktree.
const LIVE_REPO_ROOT = REPO_ROOT;

const INDEX_DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'search-index.db');
const GRAPH_PATH = path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
const SPECTRUM_PATH = path.join(
  REPO_ROOT,
  '02_RESOURCES',
  'RESEARCH',
  'yuri-mechanism-spectrum-267-2026-06-03.md',
);
const GITNEXUS_CLI = path.join(REPO_ROOT, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js');

// Bounded output (mirror yuri-search.mjs): default top 10, hard cap 50.
const DEFAULT_TOP = 10;
const HARD_CAP = 50;

// Per-surface candidate caps — keep each pass bounded so the merge stays cheap and the output
// honest (no surface can flood the merge before grading).
const FTS5_CANDIDATES = 30;
const GRAPH_NODE_TOKEN_CANDIDATES = 20;
const GITNEXUS_LIMIT = 8;
const SPECTRUM_CANDIDATES = 20;

// --- tokenization (shared, deterministic) ----------------------------------------------------
function tokenize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3);
}

// Normalize a path for dedup: repo-relative, forward slashes, no leading ./ — a file hit in two
// surfaces collapses to one row keyed by this.
function normalizePath(p) {
  if (!p) return p;
  let rel = p;
  if (path.isAbsolute(p) && p.startsWith(REPO_ROOT)) {
    rel = path.relative(REPO_ROOT, p);
  }
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

// 0..1 lexical quality from a 0..N token-overlap count (saturating).
function overlapSignal(matched, total) {
  if (!total) return 0;
  return Math.min(1, matched / total);
}

// Resolve a gitnexusStaleness() result into the boolean the structural scorer consumes.
// FAIL-CLOSED on INDETERMINATE freshness (F3 / freshness-laundering): the only state that earns
// "fresh" (no staleness penalty) is a PROVEN-fresh index — available===true AND stale===false.
// Everything else — absent .gitnexus marker, git failure, empty HEAD (available===false), or an
// explicit stale flag — is treated as STALE so the staleness penalty applies. Granting full-HIGH
// structural confidence on an ABSENT freshness signal is severity-laundering (a LOW-trust claim
// dressed as HIGH); a structural claim on an index of unknown freshness is NOT high-confidence.
export function resolveGitnexusStale(staleInfo) {
  const provenFresh = !!staleInfo && staleInfo.available === true && staleInfo.stale === false;
  return !provenFresh;
}

// ============================================================================================
// PASS 1 — FTS5 / BM25 corpus search (lexical-only)
// ============================================================================================
function passFts5(rawQuery, match, candidates = FTS5_CANDIDATES) {
  const out = [];
  if (!fs.existsSync(INDEX_DB_PATH)) {
    return { hits: out, available: false, reason: 'search index not built' };
  }
  if (!match) return { hits: out, available: true, reason: 'empty match' };

  let db;
  try {
    db = new Database(INDEX_DB_PATH, { readonly: true });
  } catch (err) {
    return { hits: out, available: false, reason: `index open failed: ${err.message}` };
  }
  try {
    const rows = db
      .prepare(
        `SELECT path, snippet(docs, 2, '[', ']', '...', 14) AS snip, bm25(docs) AS rank
         FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(match, candidates);
    // bm25 is more-negative = better. Map the ordered rank to a 0..1 lexical signal by position
    // (1st hit -> ~1, last -> ~0). This is a recall-friendly lexical quality, NOT a confidence;
    // confidence is assigned by scoreHit (capped < floor for lexical-only).
    const n = rows.length || 1;
    rows.forEach((r, i) => {
      const lexicalScore = (n - i) / n;
      out.push({
        rawPath: r.path,
        snippet: String(r.snip || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        lexicalScore,
        surface: EVIDENCE_KIND.LEXICAL,
        sourceLabel: 'fts5',
      });
    });
  } catch {
    // FTS5 MATCH syntax error on the (already-hardened) expression — fail-soft, zero hits.
  } finally {
    db.close();
  }
  return { hits: out, available: true };
}

// ============================================================================================
// PASS 2 — circuitry graph (token-overlap node hits + optional 1-hop neighbors)
// ============================================================================================
function loadGraph() {
  try {
    const g = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
    return {
      nodes: Array.isArray(g.nodes) ? g.nodes : [],
      edges: Array.isArray(g.edges) ? g.edges : [],
    };
  } catch {
    return null;
  }
}

function passGraph(tokens, nodeId, graph) {
  const out = [];
  let writesExcluded = 0; // honest count of writes-edge (and unknown-edge) neighbors NEVER surfaced
  if (!graph) return { hits: out, writesExcluded, available: false, reason: 'graph parse failed' };
  if (!tokens.length && !nodeId) return { hits: out, writesExcluded, available: true };

  const tokenSet = new Set(tokens);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // --- token-overlap node hits (lexical-only — text overlap, no structural proof) ---
  const scored = [];
  for (const node of graph.nodes) {
    const hay = `${node.description || ''} ${node.triggeredBy || ''} ${node.label || ''} ${node.id || ''}`;
    const hayTokens = new Set(tokenize(hay));
    let matched = 0;
    for (const t of tokenSet) if (hayTokens.has(t)) matched += 1;
    if (matched > 0) {
      scored.push({ node, lexicalScore: overlapSignal(matched, tokenSet.size || 1) });
    }
  }
  scored.sort((a, b) => b.lexicalScore - a.lexicalScore);
  for (const { node, lexicalScore } of scored.slice(0, GRAPH_NODE_TOKEN_CANDIDATES)) {
    const files = Array.isArray(node.files) ? node.files : [];
    const repr = files.length ? files[0] : `circuitry-node:${node.id}`;
    out.push({
      rawPath: repr,
      snippet: `circuitry node "${node.id}" — ${String(node.label || '').slice(0, 120)}`,
      lexicalScore,
      surface: EVIDENCE_KIND.LEXICAL,
      sourceLabel: 'graph-token',
      nodeId: node.id,
    });
  }

  // --- 1-hop neighbors of --node, tagged by edge.kind (calls|reads -> MED; writes EXCLUDED) ---
  if (nodeId && nodeById.has(nodeId)) {
    for (const e of graph.edges) {
      let neighborId = null;
      if (e.from === nodeId) neighborId = e.to;
      else if (e.to === nodeId) neighborId = e.from;
      if (!neighborId) continue;
      // scoreHit returns null for a writes edge -> never surfaced as a sibling.
      const graded = scoreHit({
        surface: EVIDENCE_KIND.NEIGHBOR,
        edgeKind: e.kind,
        lexicalScore: 0.5,
      });
      if (!graded) { writesExcluded += 1; continue; } // writes (or unknown) edge — never a sibling
      const nb = nodeById.get(neighborId);
      const files = nb && Array.isArray(nb.files) ? nb.files : [];
      const repr = files.length ? files[0] : `circuitry-node:${neighborId}`;
      out.push({
        rawPath: repr,
        snippet: `1-hop neighbor of ${nodeId} via "${e.kind}" — ${String((nb && nb.label) || neighborId).slice(0, 100)}`,
        surface: EVIDENCE_KIND.NEIGHBOR,
        edgeKind: e.kind,
        lexicalScore: 0.5,
        sourceLabel: `graph-neighbor:${e.kind}`,
        nodeId: neighborId,
      });
    }
  }

  return { hits: out, writesExcluded, available: true };
}

// ============================================================================================
// PASS 3 — GitNexus structural call-graph (gitnexus-structural; fail-CLOSED)
// ============================================================================================
function passGitnexus(rawQuery, { gitnexusStale }) {
  const out = [];
  // F4 (latency footgun): the gitnexus CLI ERRORS on an empty/whitespace query and the
  // execFileSync then burns the full timeout. If the query has no usable token, the structural
  // leg has nothing to ask — report unavailable immediately, never spawn the CLI.
  if (!String(rawQuery || '').trim() || tokenize(rawQuery).length === 0) {
    return { hits: out, available: false, reason: 'no query token for structural leg' };
  }
  // F1: pin --repo to the LIVE absolute root. F3: any failure/empty -> structuralLegAvailable
  // = false (caller downgrades). NEVER throw — wrap everything.
  if (!fs.existsSync(GITNEXUS_CLI)) {
    return { hits: out, available: false, reason: 'gitnexus CLI not present' };
  }
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        GITNEXUS_CLI,
        'query',
        rawQuery,
        '--repo',
        LIVE_REPO_ROOT, // F1 pinned
        '--limit',
        String(GITNEXUS_LIMIT),
      ],
      // tight timeout: a slow/hung structural leg degrades fail-CLOSED, never hangs the query.
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
  } catch (err) {
    return { hits: out, available: false, reason: `gitnexus query failed: ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { hits: out, available: false, reason: 'gitnexus output not JSON' };
  }

  // Collect file-level structural hits from process_symbols + standalone definitions.
  const sym = Array.isArray(parsed.process_symbols) ? parsed.process_symbols : [];
  const defs = Array.isArray(parsed.definitions) ? parsed.definitions : [];
  const seen = new Set();
  for (const s of [...sym, ...defs]) {
    const fp = s && s.filePath ? s.filePath : null;
    if (!fp) continue;
    const key = `${fp}#${s.startLine || 0}#${s.name || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rawPath: fp,
      snippet: `structural: ${s.name || '?'} @ ${fp}:${s.startLine ?? '?'} (${s.module || 'mod?'})`,
      surface: EVIDENCE_KIND.STRUCTURAL,
      structuralMatch: true,
      lexicalScore: 0.85, // place within the structural band; staleness penalty applied in scoreHit
      gitnexusStale,
      sourceLabel: 'gitnexus',
    });
  }
  // available even if zero hits: the leg RAN and returned valid JSON. An empty structural result
  // is honest (no structural twins found) — not the same as "the leg is down" (which sets
  // available:false and triggers the fail-closed downgrade of OTHER surfaces' would-be hits).
  return { hits: out, available: true };
}

// ============================================================================================
// PASS 4 — mechanism-spectrum doc (lexical-only prose grep)
// ============================================================================================
function passSpectrum(tokens, candidates = SPECTRUM_CANDIDATES) {
  const out = [];
  if (!fs.existsSync(SPECTRUM_PATH)) {
    return { hits: out, available: false, reason: 'spectrum doc not present' };
  }
  if (!tokens.length) return { hits: out, available: true };

  let lines;
  try {
    lines = fs.readFileSync(SPECTRUM_PATH, 'utf8').split('\n');
  } catch (err) {
    return { hits: out, available: false, reason: `spectrum read failed: ${err.message}` };
  }
  const tokenSet = new Set(tokens);
  const relPath = normalizePath(SPECTRUM_PATH);
  let currentLayer = 'spectrum';
  const scored = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const layerHdr = line.match(/^###\s+(.+?)\s*(?:\(\d+\))?\s*$/);
    if (layerHdr) currentLayer = layerHdr[1].trim();
    const lineTokens = new Set(tokenize(line));
    let matched = 0;
    for (const t of tokenSet) if (lineTokens.has(t)) matched += 1;
    if (matched > 0) {
      scored.push({
        rawPath: `${relPath}#L${i + 1}`,
        snippet: `[${currentLayer}] ${line.replace(/\s+/g, ' ').trim().slice(0, 180)}`,
        lexicalScore: overlapSignal(matched, tokenSet.size || 1),
        surface: EVIDENCE_KIND.LEXICAL,
        sourceLabel: 'spectrum',
        layer: currentLayer,
      });
    }
  }
  scored.sort((a, b) => b.lexicalScore - a.lexicalScore);
  out.push(...scored.slice(0, candidates));
  return { hits: out, available: true };
}

// ============================================================================================
// GRADE + GATE a single candidate into a schema-valid hit (or a suppression record).
// ============================================================================================
function gradeCandidate(c, { structuralLegAvailable }) {
  // F3 fail-closed: if the structural leg is DOWN, a would-be-structural candidate must NOT be
  // presented as structurally corroborated. Re-route it through the lexical path + tag.
  let surface = c.surface;
  let structuralUnavailable = false;
  if (surface === EVIDENCE_KIND.STRUCTURAL && !structuralLegAvailable) {
    surface = EVIDENCE_KIND.LEXICAL;
    structuralUnavailable = true;
  }

  const graded = scoreHit({
    surface,
    structuralMatch: c.structuralMatch,
    edgeKind: c.edgeKind,
    lexicalScore: c.lexicalScore,
    gitnexusStale: c.gitnexusStale,
  });
  // null === writes-edge (or contract-violating structural) — never a sibling, drop it.
  if (!graded) return null;

  const provenance = {
    evidenceKind: graded.evidenceKind,
    confidence: graded.confidence,
  };
  if (graded.stale) provenance.stale = true;
  if (structuralUnavailable) provenance.structuralUnavailable = true;

  // For a lexical-only hit below the floor, the mechanism-fit-theater gate REQUIRES a named
  // mismatch or the hit is suppressed to the sub-log. The merged query is a retrieval surface,
  // not a claim author — it cannot invent a shared-mechanism justification it has not verified.
  // So a below-floor lexical hit with no mismatch goes to the sub-log honestly (per XREF-04).
  const hit = {
    path: normalizePath(c.rawPath),
    surface: c.sourceLabel || graded.evidenceKind,
    snippet: c.snippet || '',
    score: Number.isFinite(c.lexicalScore) ? c.lexicalScore : graded.confidence,
    provenance,
  };

  const gate = gateHit(hit);
  return { hit, gate, evidenceKind: graded.evidenceKind, confidence: graded.confidence };
}

// ============================================================================================
// MERGE — dedup by normalized path, keep MAX confidence; gate; canary.
// ============================================================================================
function mergeAndGate(candidates, ctx, top) {
  const byPath = new Map(); // normalizedPath -> best graded record
  const sublog = [];
  let dropped = 0;
  let dedupedCount = 0;

  for (const c of candidates) {
    const graded = gradeCandidate(c, ctx);
    if (!graded) {
      dropped += 1; // writes-edge / contract-violating structural
      continue;
    }
    const { hit, gate, confidence } = graded;

    if (!gate.surfaced) {
      sublog.push({ path: hit.path, surface: hit.surface, confidence, reason: gate.reason });
      continue;
    }

    const key = hit.path;
    const prev = byPath.get(key);
    if (!prev) {
      byPath.set(key, { hit, confidence, surfaces: new Set([hit.surface]) });
    } else {
      dedupedCount += 1;
      prev.surfaces.add(hit.surface);
      // keep MAX confidence (a structural corroboration of a lexical hit wins).
      if (confidence > prev.confidence) {
        prev.hit = hit;
        prev.confidence = confidence;
      }
    }
  }

  // Annotate multi-surface hits in the snippet (the closed schema has no `surfaces` field, so we
  // record corroboration in the human-readable snippet — never invent a schema field).
  const merged = [];
  for (const rec of byPath.values()) {
    if (rec.surfaces.size > 1) {
      const tag = ` [corroborated by: ${[...rec.surfaces].sort().join(', ')}]`;
      rec.hit = { ...rec.hit, snippet: (rec.hit.snippet + tag).slice(0, 240) };
    }
    merged.push({ hit: rec.hit, confidence: rec.confidence });
  }

  merged.sort((a, b) => b.confidence - a.confidence || a.hit.path.localeCompare(b.hit.path));

  // XREF-05 final canary: serialize-then-revalidate each surfaced hit against the closed schema.
  // A malformed provenance object (rogue field, out-of-range confidence) throws here, fail-closed.
  const surfaced = merged.slice(0, top).map((m) => serializeRevalidate(m.hit));

  return { surfaced, sublog, dropped, dedupedCount };
}

// ============================================================================================
// PUBLIC API
// ============================================================================================
export function xrefQuery(rawQuery, opts = {}) {
  const top = Math.max(1, Math.min(HARD_CAP, opts.top || DEFAULT_TOP));
  const nodeId = opts.node || null;

  const match = buildMatch(rawQuery);
  if (!match && !nodeId) {
    // Mirror yuri-search.mjs:58 empty-query contract.
    return { ok: false, error: 'empty query', query: rawQuery };
  }

  const tokens = tokenize(rawQuery);
  const graph = loadGraph();

  // Determine gitnexus staleness ONCE (shared with the structural scorer).
  // FAIL-CLOSED: indeterminate freshness (absent marker / git failure) is treated as STALE by
  // resolveGitnexusStale — never granted full-HIGH on an absent freshness signal (no laundering).
  const staleInfo = gitnexusStaleness({ repoRoot: LIVE_REPO_ROOT });
  const gitnexusStale = resolveGitnexusStale(staleInfo);

  // Run the four bounded passes.
  const fts5 = passFts5(rawQuery, match);
  const graphRes = passGraph(tokens, nodeId, graph);
  const gitnexus = passGitnexus(rawQuery, { gitnexusStale });
  const spectrum = passSpectrum(tokens);

  // F3: the structural leg is "available" only if the gitnexus pass actually RAN and returned
  // valid JSON. If it is down, would-be-structural hits get downgraded (none here, since a
  // down leg yields zero structural candidates, but the flag is the honest contract surface and
  // future structural surfaces flow through the same downgrade).
  const structuralLegAvailable = gitnexus.available === true;

  const candidates = [
    ...fts5.hits,
    ...graphRes.hits,
    ...gitnexus.hits,
    ...spectrum.hits,
  ];

  const { surfaced, sublog, dropped, dedupedCount } = mergeAndGate(
    candidates,
    { structuralLegAvailable },
    top,
  );

  return {
    ok: true,
    query: rawQuery,
    node: nodeId,
    structuralLegAvailable,
    gitnexus: {
      available: gitnexus.available,
      reason: gitnexus.reason || null,
      stale: gitnexusStale,
      indexedCommit: staleInfo.indexedCommit ? String(staleInfo.indexedCommit).slice(0, 8) : null,
      head: staleInfo.head ? String(staleInfo.head).slice(0, 8) : null,
      behind: staleInfo.behind ?? null,
      repoPinned: LIVE_REPO_ROOT,
    },
    knobs: XREF_PROVENANCE_KNOBS,
    counts: {
      fts5: fts5.hits.length,
      graph: graphRes.hits.length,
      gitnexus: gitnexus.hits.length,
      spectrum: spectrum.hits.length,
      candidates: candidates.length,
      merged: surfaced.length,
      deduped: dedupedCount,
      suppressed: sublog.length,
      // writes-edge neighbors are excluded at graph-pass time (never become candidates); `dropped`
      // catches any contract-violating structural candidate dropped at merge time. Both = never-sibling.
      droppedWritesEdge: (graphRes.writesExcluded || 0) + dropped,
    },
    merged: surfaced,
    sublog,
  };
}

// ---- CLI -------------------------------------------------------------------------------------
function run() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let top = DEFAULT_TOP;
  let node = null;
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--top' && argv[i + 1]) {
      top = Math.max(1, Math.min(HARD_CAP, parseInt(argv[++i], 10) || DEFAULT_TOP));
    } else if (argv[i] === '--node' && argv[i + 1]) {
      node = argv[++i];
    } else if (argv[i] === '--json') {
      /* flag */
    } else {
      parts.push(argv[i]);
    }
  }
  const rawQuery = parts.join(' ');
  const result = xrefQuery(rawQuery, { top, node });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (!result.ok) {
    console.log(`⬡ usage: ai xref "<query>" [--node <id>] [--top N] [--json]`);
    process.exitCode = 1;
    return;
  }

  const gx = result.gitnexus;
  const struct = result.structuralLegAvailable
    ? gx.stale
      ? `structural leg STALE (gitnexus ${gx.behind ?? '?'} commits behind; structural hits downranked)`
      : `structural leg fresh`
    : `structural leg DOWN (${gx.reason}) — structural hits downgraded, NOT presented as corroborated`;

  console.log(`⬡ xref "${result.query}"${result.node ? ` --node ${result.node}` : ''}`);
  console.log(`  ${struct}`);
  console.log(
    `  surfaces: fts5=${result.counts.fts5} graph=${result.counts.graph} gitnexus=${result.counts.gitnexus} spectrum=${result.counts.spectrum}` +
      `  ->  merged=${result.counts.merged} deduped=${result.counts.deduped} suppressed=${result.counts.suppressed} writes-dropped=${result.counts.droppedWritesEdge}\n`,
  );
  for (const h of result.merged) {
    const p = h.provenance;
    const flags =
      (p.stale ? ' STALE' : '') + (p.structuralUnavailable ? ' STRUCT-UNAVAIL' : '');
    console.log(`  [${p.evidenceKind} conf=${p.confidence.toFixed(3)}${flags}]  ${h.path}`);
    console.log(`    ${h.snippet}\n`);
  }
  if (result.sublog.length) {
    console.log(`  -- low-confidence sub-log (${result.sublog.length} suppressed, no named mismatch) --`);
    for (const s of result.sublog.slice(0, 10)) {
      console.log(`    ~ ${s.path}  (${s.surface}, conf=${s.confidence.toFixed(3)}, ${s.reason})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) run();
