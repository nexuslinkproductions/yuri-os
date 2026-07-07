#!/usr/bin/env node
// @capability: code-navigation-search
// @serves: search | navigate | find code | where is | cross reference | fts5 | corpus search | what is this | explore unfamiliar
// @does: FTS5/BM25 + circuitry-graph + GitNexus fused search over the YURI corpus, confidence-gated suppression; auto-surfaces capability hits at the top of every query.
// @use: Reach for this before broad exploration or grep.
// @exports: run
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
 *   2. GRAPH     the 118-node circuitry graph (02_RESOURCES/RESEARCH/yuri-circuitry-graph.json,
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
 *   node _SYSTEM/Scripts/xref-query.mjs "<query>" --node energy-fn --top 1000 --scan 5000 --json
 *   node _SYSTEM/Scripts/xref-query.mjs "<query>" --all --json
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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildMatch } from './yuri-search.mjs';
import {
  scoreHit,
  gateHit,
  serializeRevalidate,
  EVIDENCE_KIND,
  XREF_PROVENANCE_KNOBS,
  structuralEligible,
  TOKENIZE_MIN_LENGTH,
} from './xref-provenance.mjs';
import { gitnexusStaleness, computeFileStaleSet } from './xref-drift-scan.mjs';
import { recallCanonical } from './canonical-recall.mjs';
import { resolveDirs as canonicalDirs } from './memory-canonical-store.mjs';
import { rankSkills } from './skill-recall.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// F1: the LIVE repo root — the gitnexus --repo param is pinned here, never the stale worktree.
const LIVE_REPO_ROOT = REPO_ROOT;

const INDEX_DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'search-index.db');
// AFL organ store — alpha factors surface alongside code/corpus hits (PASS 1b). Fail-soft when absent.
const ALPHA_DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'alpha-factors.db');
const GRAPH_PATH = path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
// Canonical-truth memory leg (PASS 1c) — operator-approved + cross-lane claims surface alongside code/corpus
// hits, advisory + LEXICAL-capped. Fail-soft when the store is absent/empty.
const CANONICAL_BASE = canonicalDirs().base;
// Mnemopi personal-memory leg (PASS 1d) — OMP working_memory FTS surfaces alongside code/corpus hits.
// Fail-soft when the bank is absent/locked. Dynamic bank glob — never hardcode the hash suffix.
function discoverMnemopiDbPath() {
  const home = os.homedir();
  const banksDir = path.join(home, '.omp', 'agent', 'memories', 'mnemopi', 'banks');
  const fallback = path.join(home, '.omp', 'agent', 'memories', 'mnemopi', 'mnemopi.db');
  try {
    const candidates = fs.readdirSync(banksDir)
      .filter((f) => /^YURI-OS-MUSUBI-/.test(f))
      .sort();
    if (candidates.length) {
      return path.join(banksDir, candidates[candidates.length - 1], 'mnemopi.db');
    }
  } catch {
    /* fall through to shared bank */
  }
  try {
    return fs.existsSync(fallback) ? fallback : null;
  } catch {
    return null;
  }
}
const MNEMOPI_DB = discoverMnemopiDbPath();
// wave-2 R.12: spectrum doc auto-discovered by filename pattern — update the
// spectrum doc's date suffix and this leg points at the new version automatically
// (the old hardcoded dated filename silently went available:false on rename).
// Lexicographic sort works because the suffix is count-then-ISO-date.
function discoverSpectrumPath() {
  const dir = path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH');
  try {
    const candidates = fs.readdirSync(dir)
      .filter((f) => /^yuri-mechanism-spectrum-.*\.md$/.test(f))
      .sort();
    return candidates.length ? path.join(dir, candidates[candidates.length - 1]) : null;
  } catch {
    return null;
  }
}
const SPECTRUM_PATH = discoverSpectrumPath();
const GITNEXUS_CLI = path.join(REPO_ROOT, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js');

// Xref exists to cross-surface scan, not trickle out tiny search snippets. Default to a 200-result
// request floor and let --top N / --scan N ask for thousands. There is no hard-coded 50-result
// ceiling anymore; the natural limits are available evidence, surface engine limits, and local
// memory. --all removes the FTS5/spectrum SQL slice so the LLM can ask for a broad recall aperture.
const DEFAULT_TOP = 200;
const MIN_SCAN_TOP = 200;

// Per-surface candidate floors. Candidate pools scale with the requested top so `--top 500` really
// widens the scan instead of slicing a tiny pre-filter.
const FTS5_CANDIDATE_FLOOR = 1000;
const GITNEXUS_CANDIDATE_FLOOR = 200;
const SPECTRUM_CANDIDATE_FLOOR = 267;

// --- tokenization (shared, deterministic) ----------------------------------------------------
function tokenize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= TOKENIZE_MIN_LENGTH);
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
function passFts5(rawQuery, match, candidates = FTS5_CANDIDATE_FLOOR) {
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
    const unlimited = candidates === null || candidates === Infinity;
    const rows = unlimited
      ? db
        .prepare(
          `SELECT path, snippet(docs, 2, '[', ']', '...', 14) AS snip, bm25(docs) AS rank
           FROM docs WHERE docs MATCH ? ORDER BY rank`,
        )
        .all(match)
      : db
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
    // wave-2 R.5: true corpus match total alongside the capped pull — null on
    // count failure (never 0, which would lie "no matches").
    let totalMatches = null;
    try { totalMatches = db.prepare('SELECT COUNT(*) c FROM docs WHERE docs MATCH ?').get(match).c; } catch { /* null */ }
    return { hits: out, available: true, totalMatches };
  } catch (err) {
    // wave-2 R.8: distinguish a DB/runtime failure (SQLITE_BUSY, I/O) from an
    // FTS5 MATCH syntax error. A busy/locked DB is a FALSE NEGATIVE the caller
    // must see (available:false) — the old blanket catch returned
    // {hits:[], available:true}: a silent false-positive availability.
    const msg = String(err && err.message || err);
    const busyOrRuntime = (err && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_IOERR'))
      || /database is locked|disk i\/o error/i.test(msg);
    if (busyOrRuntime) {
      return { hits: out, available: false, reason: 'db-error', error: err.code || msg.slice(0, 80) };
    }
    // genuine MATCH syntax error — a query problem, not a DB problem: soft-fail.
    return { hits: out, available: true, reason: 'syntax-error' };
  } finally {
    db.close();
  }
}

// ============================================================================================
// PASS 1b — Alpha Factor Library (AFL organ) FTS5 / BM25 search over alpha-factors.db
// ============================================================================================
// Surfaces registered alpha factors alongside code/corpus hits. Lexical-only (FTS5/BM25): a factor
// name/desc match is a lexical signal, same confidence treatment as passFts5 — never structural proof.
// Fail-soft: if the AFL DB is absent (organ not built) the leg is available:false and surfaces nothing
// (an absent organ is not an error for a general xref query). Mirrors passFts5's busy-vs-syntax split.
function passAlphaFactors(rawQuery, candidates = FTS5_CANDIDATE_FLOOR) {
  const out = [];
  if (!fs.existsSync(ALPHA_DB_PATH)) {
    return { hits: out, available: false, reason: 'alpha-factors.db not built' };
  }
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return { hits: out, available: true, reason: 'no tokens' };
  // OR-join QUOTED tokens for recall over the small factor table. Quoting neutralizes FTS5 operator
  // chars (a slug like "momentum-12m" or a stray quote) so user input can't break or inject MATCH.
  const match = tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');

  let db;
  try {
    db = new Database(ALPHA_DB_PATH, { readonly: true });
  } catch (err) {
    return { hits: out, available: false, reason: `alpha db open failed: ${err.message}` };
  }
  try {
    const unlimited = candidates === null || candidates === Infinity;
    const sql = `SELECT f.id AS id, f.name AS name, f.category AS cat, f.status AS status,
                        snippet(alpha_factors_fts, 2, '[', ']', '...', 12) AS snip,
                        bm25(alpha_factors_fts, 2.0, 1.5, 1.0) AS rank
                 FROM alpha_factors_fts
                 JOIN alpha_factors f ON f.rowid = alpha_factors_fts.rowid
                 WHERE alpha_factors_fts MATCH ? ORDER BY rank${unlimited ? '' : ' LIMIT ?'}`;
    const rows = unlimited ? db.prepare(sql).all(match) : db.prepare(sql).all(match, candidates);
    // bm25 ascending = best first; map ordered position to a 0..1 lexical signal (same as passFts5).
    const n = rows.length || 1;
    rows.forEach((r, i) => {
      const lexicalScore = (n - i) / n;
      out.push({
        rawPath: `alpha-factor:${r.id}`,
        snippet: `alpha factor "${r.name}" [${r.cat}/${r.status}] — ${String(r.snip || '').replace(/\s+/g, ' ').trim()}`.slice(0, 200),
        lexicalScore,
        surface: EVIDENCE_KIND.LEXICAL,
        sourceLabel: 'alpha-factor',
      });
    });
    let totalMatches = null;
    try {
      totalMatches = db.prepare('SELECT COUNT(*) c FROM alpha_factors_fts WHERE alpha_factors_fts MATCH ?').get(match).c;
    } catch { /* null — never 0-as-lie */ }
    return { hits: out, available: true, totalMatches };
  } catch (err) {
    const msg = String((err && err.message) || err);
    const busyOrRuntime = (err && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_IOERR'))
      || /database is locked|disk i\/o error/i.test(msg);
    if (busyOrRuntime) {
      return { hits: out, available: false, reason: 'db-error', error: err.code || msg.slice(0, 80) };
    }
    return { hits: out, available: true, reason: 'syntax-error' };
  } finally {
    db.close();
  }
}

// ============================================================================================
// PASS 1c — canonical-truth memory (operator-approved + cross-lane claims). Advisory, LEXICAL-capped:
// canonical truth is a CLAIM, never structural proof, so scoreHit caps it below verified code evidence.
// Fail-soft: an absent/empty store yields available:false and surfaces nothing. Reads the LIVE fold.
// ============================================================================================
function passCanonical(rawQuery, candidates = FTS5_CANDIDATE_FLOOR) {
  const out = [];
  if (!fs.existsSync(CANONICAL_BASE)) return { hits: out, available: false, reason: 'canonical store not initialized' };
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return { hits: out, available: true, reason: 'no tokens' };
  try {
    const limit = candidates === null || candidates === Infinity ? 50 : Math.max(5, Math.min(candidates, 25));
    for (const h of recallCanonical({ freeText: rawQuery, limit })) {
      const objStr = typeof h.object === 'object' && h.object ? (h.object.content ?? JSON.stringify(h.object)) : String(h.object ?? '');
      out.push({
        rawPath: `canonical:${h.subject}::${h.predicate}`,
        snippet: `canonical ${h.contested ? '⚠CONTESTED ' : ''}[${h.provenance?.lane || '?'}${h.tier ? '/' + h.tier : ''}] ${h.subject} · ${h.predicate} → ${objStr}`.replace(/\s+/g, ' ').trim().slice(0, 200),
        lexicalScore: typeof h._score === 'number' ? h._score : 0.5,
        surface: EVIDENCE_KIND.LEXICAL,        // claim, never structural -> capped below verified code evidence
        sourceLabel: 'canonical-memory',
      });
    }
    return { hits: out, available: true, totalMatches: out.length };
  } catch (err) {
    return { hits: out, available: false, reason: `canonical leg error: ${String(err?.message || err).slice(0, 80)}` };
  }
}


// ============================================================================================
// PASS 1d — Mnemopi personal memory (OMP working_memory FTS5). Advisory, LEXICAL-capped:
// personal memory is a CLAIM, never structural proof. Fail-soft when the bank is absent/locked.
// ============================================================================================
function passMnemopi(rawQuery, candidates = FTS5_CANDIDATE_FLOOR) {
  const out = [];
  if (!MNEMOPI_DB || !fs.existsSync(MNEMOPI_DB)) {
    return { hits: out, available: false, reason: 'mnemopi.db not found' };
  }
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return { hits: out, available: true, reason: 'no tokens' };
  // OR-join QUOTED tokens for recall over working_memory. Quoting neutralizes FTS5 operator chars.
  const match = tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');

  let db;
  try {
    db = new Database(MNEMOPI_DB, { readonly: true });
  } catch (err) {
    return { hits: out, available: false, reason: `mnemopi db open failed: ${err.message}` };
  }
  try {
    const unlimited = candidates === null || candidates === Infinity;
    const sql = `SELECT w.id AS id, snippet(fts_working, 1, '[', ']', '...', 12) AS snip,
                        bm25(fts_working) AS rank
                 FROM fts_working
                 JOIN working_memory w ON w.id = fts_working.id
                 WHERE fts_working MATCH ? ORDER BY rank${unlimited ? '' : ' LIMIT ?'}`;
    const rows = unlimited ? db.prepare(sql).all(match) : db.prepare(sql).all(match, candidates);
    // bm25 ascending = best first; map ordered position to a 0..1 lexical signal (same as passAlphaFactors).
    const n = rows.length || 1;
    rows.forEach((r, i) => {
      const lexicalScore = (n - i) / n;
      const snip = String(r.snip || '').replace(/\s+/g, ' ').trim();
      out.push({
        rawPath: `mnemopi:${r.id}`,
        snippet: `mnemopi memory — ${snip}`.slice(0, 200),
        lexicalScore,
        surface: EVIDENCE_KIND.LEXICAL,
        sourceLabel: 'mnemopi',
      });
    });
    let totalMatches = null;
    try {
      totalMatches = db.prepare('SELECT COUNT(*) c FROM fts_working WHERE fts_working MATCH ?').get(match).c;
    } catch { /* null — never 0-as-lie */ }
    return { hits: out, available: true, totalMatches };
  } catch (err) {
    const msg = String((err && err.message) || err);
    const busyOrRuntime = (err && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_IOERR'))
      || /database is locked|disk i\/o error/i.test(msg);
    if (busyOrRuntime) {
      return { hits: out, available: false, reason: 'db-error', error: err.code || msg.slice(0, 80) };
    }
    return { hits: out, available: true, reason: 'syntax-error' };
  } finally {
    db.close();
  }
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

function passGraph(tokens, nodeId, graph, candidates = Number.MAX_SAFE_INTEGER) {
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
  for (const { node, lexicalScore } of scored.slice(0, candidates)) {
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
function passGitnexus(rawQuery, { gitnexusStale, limit = GITNEXUS_CANDIDATE_FLOOR }) {
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
        String(limit || GITNEXUS_CANDIDATE_FLOOR),
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
    // wave-2 R.3 firewall: prose/data/archived paths must never surface at
    // structural confidence (shared utility — propagation-scan has the same wall).
    if (!structuralEligible(fp)) continue;
    const key = `${fp}#${s.startLine || 0}#${s.name || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rawPath: fp,
      snippet: `structural: ${s.name || '?'} @ ${fp}:${s.startLine ?? '?'} (${s.module || 'mod?'})`,
      surface: EVIDENCE_KIND.STRUCTURAL,
      structuralMatch: true,
      // wave-2 R.2: gitnexus ranks by process/PageRank, NOT per-query relevance —
      // the old flat 0.85 minted conf=0.97 for ANY query (nonsense included).
      // Base = bottom of the structural band; cross-corroboration by the lexical
      // leg lifts it at grade time (see gradeCandidate).
      lexicalScore: 0.0,
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
function passSpectrum(tokens, candidates = SPECTRUM_CANDIDATE_FLOOR) {
  const out = [];
  if (!SPECTRUM_PATH || !fs.existsSync(SPECTRUM_PATH)) {
    return { hits: out, available: false, reason: 'no spectrum doc found' };
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
  out.push(...(candidates === null || candidates === Infinity ? scored : scored.slice(0, candidates)));
  return { hits: out, available: true };
}

// ============================================================================================
// GRADE + GATE a single candidate into a schema-valid hit (or a suppression record).
// ============================================================================================
function gradeCandidate(c, { structuralLegAvailable, fts5Paths, fileStaleSet }) {
  // F3 fail-closed: if the structural leg is DOWN, a would-be-structural candidate must NOT be
  // presented as structurally corroborated. Re-route it through the lexical path + tag.
  let surface = c.surface;
  let structuralUnavailable = false;
  if (surface === EVIDENCE_KIND.STRUCTURAL && !structuralLegAvailable) {
    surface = EVIDENCE_KIND.LEXICAL;
    structuralUnavailable = true;
  }

  // wave-2 R.2: a structural hit corroborated by the lexical leg (same path in
  // the FTS5 result set) earned in-band query relevance; an uncorroborated one
  // sits at the band floor and carries queryInvariant:true — conf must never
  // read as "this hit matches the query" when it does not.
  let lexicalScore = c.lexicalScore;
  let queryInvariant = false;
  if (surface === EVIDENCE_KIND.STRUCTURAL && c.sourceLabel === 'gitnexus') {
    const corroborated = fts5Paths instanceof Set && fts5Paths.has(normalizePath(c.rawPath));
    lexicalScore = corroborated ? 0.85 : 0.0;
    queryInvariant = !corroborated;
  }

  const graded = scoreHit({
    surface,
    structuralMatch: c.structuralMatch,
    edgeKind: c.edgeKind,
    lexicalScore,
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
  if (queryInvariant) provenance.queryInvariant = true;

  // wave-2 R.1 (owner decision D-R1, Option A): a HIGH-BM25 lexical hit carries
  // its measured relevance as the named mismatch — this is the existing
  // mismatch-escape mechanism doing what it was always intended to do for
  // strong lexical evidence. The surface still never INVENTS a shared-mechanism
  // claim: the string names exactly what was measured (BM25 rank position).
  // Below-threshold lexical hits keep going to the sub-log honestly (XREF-04).
  if (graded.evidenceKind === EVIDENCE_KIND.LEXICAL && !structuralUnavailable
    && Number.isFinite(c.lexicalScore) && c.lexicalScore >= 0.8) {
    provenance.mismatch = `high-BM25-lexical (score=${c.lexicalScore.toFixed(2)})`;
  }

  // For a lexical-only hit below the floor, the mechanism-fit-theater gate REQUIRES a named
  // mismatch or the hit is suppressed to the sub-log. The merged query is a retrieval surface,
  // not a claim author — it cannot invent a shared-mechanism justification it has not verified.
  // So a below-floor lexical hit with no mismatch goes to the sub-log honestly (per XREF-04).
  // PER-FILE STALENESS BANNER (staleness-extension 2026-06-13): compute perFileStale via
  // normalizePath(c.rawPath) against the committed-drift stale set. A stale FILE means the index is
  // behind that file's committed content — the hit is still a real hit, so we do NOT silently
  // downrank or suppress it (that would HIDE a relevant result). Instead we BANNER it in the
  // human-readable snippet telling the consumer to read the file directly. Confidence + ranking are
  // untouched — staleness is a freshness signal, not a relevance verdict. The closed schema has no
  // banner field, so we use the same snippet-annotation idiom as the [corroborated by:] tag.
  const normPath = normalizePath(c.rawPath);
  const perFileStale = fileStaleSet instanceof Set && fileStaleSet.has(normPath);
  let snippet = c.snippet || '';
  if (perFileStale) {
    snippet = `${snippet} [STALE FILE — index behind committed content; read ${normPath} directly]`.slice(0, 260);
  }

  const hit = {
    path: normPath,
    surface: c.sourceLabel || graded.evidenceKind,
    snippet,
    score: Number.isFinite(c.lexicalScore) ? c.lexicalScore : graded.confidence,
    provenance,
  };

  const gate = gateHit(hit);
  return { hit, gate, evidenceKind: graded.evidenceKind, confidence: graded.confidence, perFileStale };
}

// ============================================================================================
// MERGE — dedup by normalized path, keep MAX confidence; gate; canary.
// ============================================================================================
function mergeAndGate(candidates, ctx, top) {
  const byPath = new Map(); // normalizedPath -> best graded record
  const sublog = [];
  let dropped = 0;
  let dedupedCount = 0;
  const staleBanneredPaths = new Set(); // distinct paths that earned a staleness banner (CLI surface)

  for (const c of candidates) {
    const graded = gradeCandidate(c, ctx);
    if (!graded) {
      dropped += 1; // writes-edge / contract-violating structural
      continue;
    }
    const { hit, gate, confidence, perFileStale } = graded;
    if (perFileStale) staleBanneredPaths.add(hit.path);

    if (!gate.surfaced) {
      sublog.push({
        path: hit.path,
        surface: hit.surface,
        snippet: hit.snippet,
        score: hit.score,
        provenance: hit.provenance,
        confidence,
        reason: gate.reason,
      });
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

  return { surfaced, sublog, dropped, dedupedCount, totalSurfacedPaths: byPath.size, stalebannered: [...staleBanneredPaths].sort() };
}

// ============================================================================================
// PUBLIC API
// ============================================================================================
export function xrefQuery(rawQuery, opts = {}) {
  const top = opts.all === true && opts.top == null ? Number.MAX_SAFE_INTEGER : normalizeTop(opts.top);
  const nodeId = opts.node || null;

  const match = buildMatch(rawQuery);
  if (!match && !nodeId) {
    // Mirror yuri-search.mjs:58 empty-query contract.
    return { ok: false, error: 'empty query', query: rawQuery };
  }

  const tokens = tokenize(rawQuery);
  const graph = loadGraph();
  const plan = candidatePlan(top, graph, { all: opts.all === true, scan: opts.scan });

  // Determine gitnexus staleness ONCE (shared with the structural scorer).
  // FAIL-CLOSED: indeterminate freshness (absent marker / git failure) is treated as STALE by
  // resolveGitnexusStale — never granted full-HIGH on an absent freshness signal (no laundering).
  const staleInfo = gitnexusStaleness({ repoRoot: LIVE_REPO_ROOT });
  const gitnexusStale = resolveGitnexusStale(staleInfo);

  // PER-FILE staleness set (staleness-extension): committed-drift only by default — the working-tree
  // union is OPT-IN (opts.includeWorkingTree, default OFF) because the live tree's ~220 dirty files
  // would banner almost everything. Fail-soft: if the leg is unavailable the set is empty and no hit
  // is bannered (an absent signal is not a stale signal — we never INVENT staleness). This is a
  // freshness BANNER, not a downrank: a stale file still surfaces at its true confidence.
  const fileStaleInfo = computeFileStaleSet({
    repoRoot: LIVE_REPO_ROOT,
    includeWorkingTree: opts.includeWorkingTree === true,
  });
  const fileStaleSet = new Set(fileStaleInfo.available ? fileStaleInfo.staleFiles : []);

  // Run the bounded passes.
  const fts5 = passFts5(rawQuery, match, plan.fts5);
  const alpha = passAlphaFactors(rawQuery, plan.fts5);
  const canonical = passCanonical(rawQuery, plan.fts5);
  const mnemopi = passMnemopi(rawQuery, plan.fts5);
  const graphRes = passGraph(tokens, nodeId, graph, plan.graph);
  const gitnexus = passGitnexus(rawQuery, { gitnexusStale, limit: plan.gitnexus });
  const spectrum = passSpectrum(tokens, plan.spectrum);

  // F3: the structural leg is "available" only if the gitnexus pass actually RAN and returned
  // valid JSON. If it is down, would-be-structural hits get downgraded (none here, since a
  // down leg yields zero structural candidates, but the flag is the honest contract surface and
  // future structural surfaces flow through the same downgrade).
  const structuralLegAvailable = gitnexus.available === true;

  const candidates = [
    ...fts5.hits,
    ...alpha.hits,
    ...canonical.hits,
    ...mnemopi.hits,
    ...graphRes.hits,
    ...gitnexus.hits,
    ...spectrum.hits,
  ];

  // wave-2 R.2: the lexical leg's path set feeds structural cross-corroboration.
  const fts5Paths = new Set(fts5.hits.map((h) => normalizePath(h.rawPath)));

  const { surfaced, sublog, dropped, dedupedCount, totalSurfacedPaths, stalebannered } = mergeAndGate(
    candidates,
    { structuralLegAvailable, fts5Paths, fileStaleSet },
    top,
  );
  const recall = buildRecallSet({ surfaced, sublog, top });

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
    // PER-FILE staleness surface (staleness-extension): which surfaced files are behind their
    // committed content (the index hasn't re-absorbed them). available=false means the leg couldn't
    // compute a set (no marker / git failure) — NOT "everything fresh". `bannered` lists ONLY the
    // surfaced/sublog paths that actually got a read-it-directly banner this query.
    fileStaleness: {
      available: fileStaleInfo.available,
      reason: fileStaleInfo.reason || null,
      includeWorkingTree: fileStaleInfo.includeWorkingTree === true,
      indexedCommit: fileStaleInfo.indexedCommit ? String(fileStaleInfo.indexedCommit).slice(0, 8) : null,
      driftCount: fileStaleInfo.available ? fileStaleInfo.staleFiles.length : null,
      bannered: stalebannered,
    },
    knobs: XREF_PROVENANCE_KNOBS,
    requestedTop: top,
    all: opts.all === true,
    candidatePlan: plan,
    counts: {
      fts5: fts5.hits.length,
      // wave-2 R.5: true corpus totals (null = count unavailable, never 0-as-lie)
      fts5TotalMatches: fts5.totalMatches ?? null,
      // AFL organ leg (PASS 1b) — alpha factors surfaced alongside code/corpus hits.
      alphaFactors: alpha.hits.length,
      alphaFactorsTotalMatches: alpha.totalMatches ?? null,
      alphaFactorsAvailable: alpha.available === true,
      canonical: canonical.hits.length,
      canonicalAvailable: canonical.available === true,
      mnemopi: mnemopi.hits.length,
      mnemopiAvailable: mnemopi.available === true,
      graph: graphRes.hits.length,
      gitnexus: gitnexus.hits.length,
      spectrum: spectrum.hits.length,
      candidates: candidates.length,
      merged: surfaced.length,
      // wave-2 R.6: pre-slice path total — merged is post-slice and silently
      // truncates when byPath.size > top.
      totalSurfacedPaths: totalSurfacedPaths,
      truncatedMerged: totalSurfacedPaths > surfaced.length,
      deduped: dedupedCount,
      suppressed: sublog.length,
      // writes-edge neighbors are excluded at graph-pass time (never become candidates); `dropped`
      // catches any contract-violating structural candidate dropped at merge time. Both = never-sibling.
      droppedWritesEdge: (graphRes.writesExcluded || 0) + dropped,
    },
    merged: surfaced,
    // AFL dedicated surface (red-team fix: alpha factors are structurally drowned in the global
    // top-N merge — only ~20% of a query's matches can ever surface there). This is a SEPARATE,
    // honestly-labeled lexical lane (NOT gamed into the provenance-gated merge): the top alpha
    // factors for the query, always visible regardless of how the code/corpus merge fills up.
    alphaTop: alpha.hits.slice(0, 5).map((h) => ({
      id: String(h.rawPath || '').replace(/^alpha-factor:/, ''),
      snippet: h.snippet,
      lexicalScore: h.lexicalScore,
    })),
    // Canonical-memory dedicated lane (same rationale as alphaTop — advisory claims get drowned in the
    // provenance-gated code merge). Always-visible top canonical truths for the query.
    canonicalTop: canonical.hits.slice(0, 6).map((h) => ({
      claim: String(h.rawPath || '').replace(/^canonical:/, ''),
      snippet: h.snippet,
      lexicalScore: h.lexicalScore,
    })),
    // Mnemopi-memory dedicated lane (same rationale as canonicalTop — personal memory gets drowned in the
    // provenance-gated code merge). Always-visible top mnemopi hits for the query.
    mnemopiTop: mnemopi.hits.slice(0, 6).map((h) => ({
      id: String(h.rawPath || '').replace(/^mnemopi:/, ''),
      snippet: h.snippet,
      lexicalScore: h.lexicalScore,
    })),
    sublog,
    recall,
  };
}

function buildRecallSet({ surfaced, sublog, top }) {
  const high = surfaced.map((hit) => ({
    tier: 'surfaced',
    path: hit.path,
    surface: hit.surface,
    snippet: hit.snippet,
    score: hit.score,
    provenance: hit.provenance,
    confidence: hit.provenance?.confidence ?? null,
    reason: 'passed-provenance-gate',
  }));
  const low = sublog.map((hit) => ({
    tier: 'suppressed',
    path: hit.path,
    surface: hit.surface,
    snippet: hit.snippet,
    score: hit.score,
    provenance: hit.provenance,
    confidence: hit.confidence,
    reason: hit.reason,
  }));
  // wave-2 R.7: a caller consuming `recall` must ALWAYS see some suppressed
  // entries when suppression occurred — the old [...high, ...low].slice(0, top)
  // cut every sublog entry whenever the surfaced set filled the budget.
  const sublogSample = low.slice(0, Math.min(50, Math.max(1, top)));
  return [...high.slice(0, top), ...sublogSample];
}

function normalizeTop(raw) {
  const parsed = Number.parseInt(String(raw || DEFAULT_TOP), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TOP;
  return parsed;
}

function scaleTop(top, multiplier, floor) {
  const scaled = top > Number.MAX_SAFE_INTEGER / multiplier
    ? Number.MAX_SAFE_INTEGER
    : top * multiplier;
  return Math.max(floor, scaled);
}

function candidatePlan(top, graph, opts = {}) {
  const requestedScan = Number.parseInt(String(opts.scan || 0), 10);
  const all = opts.all === true;
  const scanTop = all
    ? Math.max(MIN_SCAN_TOP, Number.isFinite(requestedScan) && requestedScan > 0 ? requestedScan : 5000)
    : Math.max(MIN_SCAN_TOP, top, Number.isFinite(requestedScan) ? requestedScan : 0);
  return {
    fts5: all ? null : scaleTop(scanTop, 5, FTS5_CANDIDATE_FLOOR),
    graph: Array.isArray(graph?.nodes) ? graph.nodes.length : scanTop,
    gitnexus: Math.max(GITNEXUS_CANDIDATE_FLOOR, scanTop),
    spectrum: all ? null : Math.max(SPECTRUM_CANDIDATE_FLOOR, scanTop),
  };
}

// ---- CLI -------------------------------------------------------------------------------------
function run() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let top = null;
  let node = null;
  let scan = null;
  let all = false;
  // --working-tree opts the per-file staleness banner into the uncommitted-change union (default
  // OFF — committed-drift only; the live dirty tree would otherwise banner almost every hit).
  let includeWorkingTree = false;
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--top' && argv[i + 1]) {
      top = normalizeTop(argv[++i]);
    } else if (argv[i] === '--scan' && argv[i + 1]) {
      scan = normalizeTop(argv[++i]);
    } else if (argv[i] === '--node' && argv[i + 1]) {
      node = argv[++i];
    } else if (argv[i] === '--all') {
      all = true;
    } else if (argv[i] === '--working-tree') {
      includeWorkingTree = true;
    } else if (argv[i] === '--json') {
      /* flag */
    } else {
      parts.push(argv[i]);
    }
  }
  const rawQuery = parts.join(' ');
  const result = xrefQuery(rawQuery, { top, node, scan, all, includeWorkingTree });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (!result.ok) {
    console.log(`⬡ usage: ai xref "<query>" [--node <id>] [--top N] [--scan N] [--all] [--working-tree] [--json]`);
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
  const fsx = result.fileStaleness;
  if (fsx && fsx.available && fsx.bannered.length) {
    console.log(`  per-file staleness: ${fsx.bannered.length} surfaced file(s) behind committed content (read them directly)${fsx.includeWorkingTree ? ' [working-tree union ON]' : ''}`);
  } else if (fsx && !fsx.available) {
    console.log(`  per-file staleness: unavailable (${fsx.reason}) — no banner (absent signal != fresh)`);
  }
  console.log(
    `  surfaces: fts5=${result.counts.fts5} alpha=${result.counts.alphaFactors} graph=${result.counts.graph} gitnexus=${result.counts.gitnexus} spectrum=${result.counts.spectrum}` +
      `  ->  requested=${result.requestedTop}${result.all ? ' all-scan=true' : ''} merged=${result.counts.merged} deduped=${result.counts.deduped} suppressed=${result.counts.suppressed} writes-dropped=${result.counts.droppedWritesEdge}\n`,
  );
  const caps = capabilityHits(result.query);
  if (caps.length) {
    console.log('  ⚡ YURI ALREADY HAS — capability-first (reach for these before building new code):');
    for (const { c } of caps) console.log(`     ▸ ${c.id} → ${c.mechanism} [${(c.exports || []).join(', ')}]`);
    console.log('');
  }
  // Skill-recall lane — surface the LIVE skill (skills/ + .claude/skills/) that fits this task,
  // BM25 over its frontmatter. Distinct from file hits (a skill is a packaged how-to, not a code
  // location) and from archive copies (those rank top in the raw merge). Fail-open: any error skips.
  const skillsForTask = skillRecallHits(result.query);
  if (skillsForTask.length) {
    console.log('  🎯 SKILL FOR THIS TASK — reach for an existing skill before doing it by hand:');
    for (const s of skillsForTask) console.log(`     ▸ /${s.name}${s.description ? ` — ${s.description}` : ''}`);
    console.log('');
  }
  // AFL dedicated lane — top alpha factors for the query, always shown when present (they would
  // otherwise be drowned in the global merge). Lexical recall, not structural confidence.
  if (Array.isArray(result.alphaTop) && result.alphaTop.length) {
    console.log(`  📈 ALPHA FACTORS (${result.counts.alphaFactors} match${result.counts.alphaFactors === 1 ? '' : 'es'}; top ${result.alphaTop.length}):`);
    for (const a of result.alphaTop) console.log(`     ▸ ${a.id} — ${a.snippet}`);
    console.log('');
  }
  // Canonical-memory dedicated lane — top canonical truths for the query (advisory; the caller verifies
  // before citing). Always shown when present so operator-approved truth isn't drowned in the code merge.
  if (Array.isArray(result.canonicalTop) && result.canonicalTop.length) {
    console.log(`  ⬢ CANONICAL MEMORY (${result.counts.canonical} match${result.counts.canonical === 1 ? '' : 'es'}; top ${result.canonicalTop.length}; advisory):`);
    for (const c of result.canonicalTop) console.log(`     ▸ ${c.snippet}`);
    console.log('');
  }
  if (Array.isArray(result.mnemopiTop) && result.mnemopiTop.length) {
    console.log(`  🧠 MNEMOPI MEMORY (${result.counts.mnemopi} match${result.counts.mnemopi === 1 ? '' : 'es'}; top ${result.mnemopiTop.length}; advisory):`);
    for (const m of result.mnemopiTop) console.log(`     ▸ ${m.snippet}`);
    console.log('');
  }
  for (const h of result.merged) {
    const p = h.provenance;
    const flags =
      (p.stale ? ' STALE' : '') + (p.structuralUnavailable ? ' STRUCT-UNAVAIL' : '');
    console.log(`  [${p.evidenceKind} conf=${p.confidence.toFixed(3)}${flags}]  ${h.path}`);
    console.log(`    ${h.snippet}\n`);
  }
  if (result.sublog.length) {
    console.log(`  -- low-confidence sub-log (${result.sublog.length} suppressed, no named mismatch) --`);
    // wave-2 R.17: the sublog is a DIAGNOSTIC budget, not a result budget — at
    // --top 5 the suppressed-hit view stays useful (≥50 rows) instead of 5.
    for (const s of result.sublog.slice(0, Math.max(result.requestedTop, 50))) {
      console.log(`    ~ ${s.path}  (${s.surface}, conf=${s.confidence.toFixed(3)}, ${s.reason})`);
    }
  }
}

// Skill-recall surfacing: rank the LIVE skill corpus by BM25 over frontmatter and surface the
// top fit for the task. Confidence-gated (score >= 4) so only a genuine match shows, not noise.
// Fail-open: any error (module/read failure) returns [] and xref behaves exactly as before.
function skillRecallHits(query) {
  try {
    return rankSkills(query, { top: 2 }).filter((s) => s.score >= 4);
  } catch {
    return [];
  }
}

// Capability-first surfacing: before the file hits, surface any EXISTING YURI mechanism whose
// declared `serves` terms match the query — so YURI's own capabilities are not forgotten or
// rebuilt. Fail-open: any error (missing/invalid registry) returns [] and xref behaves as before.
function capabilityHits(query) {
  try {
    const regPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'capabilities.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const nq = norm(query);
    const qTokens = new Set(nq.split(' ').filter((t) => t.length > 2));
    return (reg.capabilities || []).map((c) => {
      let s = 0;
      for (const phrase of c.serves || []) {
        const p = norm(phrase);
        if (!p) continue;
        if (nq.includes(p) || p.includes(nq)) s += 3;
        const pt = p.split(' ').filter((t) => t.length > 2);
        let ov = 0;
        for (const t of pt) if (qTokens.has(t)) ov++;
        if (pt.length) s += ov / pt.length;
      }
      return { c, s };
    }).filter((x) => x.s >= 1.0).sort((a, b) => b.s - a.s).slice(0, 2);
  } catch {
    return [];
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
