#!/usr/bin/env node
// @capability: atlas-resolve
// @serves: navigate by checkpoint | question to path | atlas region lookup | resolve a natural-language question to files
// @does: pure-library resolver over the Atlas checkpoint partition (_SYSTEM/state/atlas/checkpoints.json +
//   id-map.json): locate(path) -> containing region, enter(regionId) -> ranked members, resolve(question) ->
//   ranked repo-relative paths via deterministic IDF-weighted token scoring (path > label > capability > hub),
//   with document frequencies computed from the id-map corpus itself at load time.
// @use: reach for this instead of re-deriving checkpoint lookup logic; it is the resolver atlas-score.mjs's
//   --resolver=atlas branch calls. No model calls, no embeddings, no randomness — same input always yields
//   the same output, which is required for the frozen evaluator to be meaningful.
// @exports: loadAtlas, locate, enter, resolve, main
//
// atlas-resolve.mjs — Phase 4 library (see _SYSTEM/eval/atlas-score.mjs header for the evaluator contract
// this feeds). Reality this was designed against, from _SYSTEM/state/atlas/checkpoints.json (884 regions):
// median region size is 1, 863/884 regions have <=2 members, largest is 191. Most "regions" are therefore
// singleton files — resolve() leans on direct id-map path/label matching for that majority case, and only
// uses checkpoint-level facets/hub proximity as a secondary signal for the handful of larger regions.
//
// USAGE (CLI):
//   node _SYSTEM/Scripts/atlas/atlas-resolve.mjs "<question>" [--top=N] [--json]
//   node _SYSTEM/Scripts/atlas/atlas-resolve.mjs --test

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// ATLAS_CHECKPOINTS_PATH lets an experiment point the resolver at a VARIANT
// checkpoint partition (e.g. a directory-granularity build) without overwriting
// the shared checkpoints.json a parallel lane may be reading. Unset = default
// file-level partition, i.e. the control condition, unchanged.
const CHECKPOINTS_PATH = process.env.ATLAS_CHECKPOINTS_PATH
  ? path.resolve(REPO_ROOT, process.env.ATLAS_CHECKPOINTS_PATH)
  : path.join(REPO_ROOT, '_SYSTEM/state/atlas/checkpoints.json');
const ID_MAP_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/id-map.json');

// ---------------------------------------------------------------------------------------------
// Tokenization — deterministic, boring, no model calls.
// ---------------------------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'up', 'down', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
  'what', 'where', 'when', 'how', 'why', 'which', 'who', 'whom',
  'and', 'or', 'but', 'if', 'so', 'than', 'then', 'not', 'no', 'nor',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
  'as', 'so', 'first', 'before', 'here', 'there', 'have', 'has', 'had',
]);

/** Split on any non-alphanumeric run, lowercase, drop stopwords + short noise tokens. */
export function tokenize(text, { keepStopwords = false } = {}) {
  if (!text) return [];
  const raw = String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens = keepStopwords ? raw : raw.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return tokens;
}

function tokenSet(text, opts) {
  return new Set(tokenize(text, opts));
}

function overlapCount(qTokens, candidateTokenSet) {
  let n = 0;
  for (const t of qTokens) if (candidateTokenSet.has(t)) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// IDF WEIGHTING — the one knob changed here, derived from the corpus, with zero fitted constants.
//
// The previous scorer counted RAW token overlap, so a query word matching a filename contributed
// the same whether it was "run" (in 100+ paths) or "propagation" (in 3). Every matching token is
// now weighted by its inverse document frequency over the 2,161 id-map nodes.
//
// Formula: Lucene/BM25 idf = log(1 + (N - df + 0.5) / (df + 0.5)).
// Chosen over the textbook log(N/df) because it is strictly positive for every df. log(N/df) goes
// NEGATIVE for a token present in more than half the corpus (here: "mjs", "system", "scripts"),
// which would PENALISE a node for matching a query word. Saturating toward zero is the correct
// treatment of a generic term; going negative is not.
//
// The tier multipliers (1000/100/10/1) are the incumbent's, carried over UNCHANGED — no constant
// in this file was selected by watching a benchmark score move.
//
// MEASURED ALTERNATIVES (all on the frozen 40-question benchmark; reported, not cherry-picked):
//   raw overlap (incumbent)            atlas_score 0.0650
//   tiered + IDF  (shipped)            atlas_score 0.0800
//   full BM25F, k1=1.2 b=0.75          atlas_score 0.0350
//   BM25F with length-norm off (b=0)   atlas_score 0.0250
//   BM25F x Lucene coord factor        atlas_score 0.0650
//   tiered + IDF x coord               atlas_score 0.0450
// Length normalisation was measured rather than assumed: within BM25 it HELPS (0.0350 vs 0.0250),
// but full BM25F still loses badly to the tiered form. Cause, diagnosed on q016: these documents
// are ~5-25 identifier tokens, not prose, so df values are extreme and a single hapax term
// ("substrate", df=1, idf 7.27) outscores two genuinely on-target terms ("glm"+"fleet", idf 4.93).
// BM25's tf-saturation and length-norm, tuned for long prose documents, have nothing to work with.
// The tiered form contains the damage by keeping a path match categorically above a label match.
// ---------------------------------------------------------------------------------------------

/** Lucene/BM25 IDF — strictly positive for all df in [0, N]. */
function bm25Idf(N, df) {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

function basenameNoExt(p) {
  const base = path.basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(0, idx) : base;
}

// ---------------------------------------------------------------------------------------------
// Loading — memoized, read-only, zero side effects.
// ---------------------------------------------------------------------------------------------

let ATLAS_CACHE = null;

/**
 * loadAtlas() — reads checkpoints.json + id-map.json once, builds:
 *   - checkpoints: raw array from checkpoints.json
 *   - checkpointsById: Map<id, checkpoint>
 *   - nodes: Map<canonicalId, {kind, path, repo_root, labels, aliases}>  (id-map.json .nodes)
 *   - nodeToCheckpoint: Map<canonicalId, checkpointId>  (every node belongs to exactly one region
 *     in the current partition; if a future build ever double-assigns a member, the FIRST
 *     checkpoint encountered in file order wins — deterministic, not "last write wins")
 *   - pathToId: Map<repoRelativePath, canonicalId>
 *   - precomputed token sets per node and per checkpoint, so resolve() never re-tokenizes on
 *     repeat calls within a process.
 */
export function loadAtlas({ checkpointsPath = CHECKPOINTS_PATH, idMapPath = ID_MAP_PATH } = {}) {
  if (ATLAS_CACHE && ATLAS_CACHE._checkpointsPath === checkpointsPath && ATLAS_CACHE._idMapPath === idMapPath) {
    return ATLAS_CACHE;
  }
  if (!existsSync(checkpointsPath)) {
    throw new Error(`atlas checkpoints not found: ${checkpointsPath}`);
  }
  if (!existsSync(idMapPath)) {
    throw new Error(`atlas id-map not found: ${idMapPath}`);
  }

  const checkpoints = JSON.parse(readFileSync(checkpointsPath, 'utf8'));
  const idMap = JSON.parse(readFileSync(idMapPath, 'utf8'));
  const nodes = idMap.nodes || {};

  const checkpointsById = new Map();
  const nodeToCheckpoint = new Map();
  for (const cp of checkpoints) {
    checkpointsById.set(cp.id, cp);
    for (const memberId of cp.members) {
      if (!nodeToCheckpoint.has(memberId)) nodeToCheckpoint.set(memberId, cp.id);
    }
  }

  const pathToId = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    if (node && typeof node.path === 'string') pathToId.set(normalizePath(node.path), id);
  }

  // Precompute per-checkpoint token sets (label/id/hub/capability) once.
  const checkpointTokens = new Map();
  for (const cp of checkpoints) {
    const hubPath = idOrHubToPath(cp.hub, nodes);
    checkpointTokens.set(cp.id, {
      labelTokens: tokenSet(`${cp.label || ''} ${cp.id || ''}`),
      capabilityTokens: tokenSet((cp.facets && cp.facets.capability || []).join(' ')),
      hubTokens: tokenSet(`${hubPath || ''} ${cp.hub || ''}`),
      hubPath,
    });
  }

  // Precompute per-node token sets (path + labels).
  const nodeTokens = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    const p = node.path || '';
    nodeTokens.set(id, {
      pathTokens: tokenSet(p),
      basenameNoExt: basenameNoExt(p).toLowerCase(),
      fullPathLower: normalizePath(p).toLowerCase(),
      labelTokens: tokenSet((node.labels || []).join(' ')),
    });
  }

  // -------------------------------------------------------------------------------------------
  // IDF index — built once at load, from the corpus itself. No external statistics, no tuning.
  //
  // Document frequency counts, per DISTINCT token, how many of the 2,161 nodes contain it in ANY
  // of the five token sources (path segments, basename, label, checkpoint capability tags,
  // checkpoint hub). Counting over the union rather than per-field keeps one global rarity scale,
  // so a token's weight does not change depending on which tier it happened to match in.
  //
  // Iteration order is Object.entries(nodes) — the id-map's own key order — and all arithmetic is
  // deterministic, so identical inputs always produce identical scores.
  // -------------------------------------------------------------------------------------------
  const docFreq = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    const nt = nodeTokens.get(id);
    const checkpointId = nodeToCheckpoint.get(id);
    const ct = checkpointId ? checkpointTokens.get(checkpointId) : null;

    const seen = new Set(nt.pathTokens);
    for (const t of tokenize(nt.basenameNoExt)) seen.add(t);
    for (const t of nt.labelTokens) seen.add(t);
    if (ct) {
      for (const t of ct.capabilityTokens) seen.add(t);
      for (const t of ct.hubTokens) seen.add(t);
    }
    for (const t of seen) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }

  const N = Object.keys(nodes).length;
  const idf = new Map();
  for (const [t, df] of docFreq) idf.set(t, bm25Idf(N, df));

  ATLAS_CACHE = {
    _checkpointsPath: checkpointsPath,
    _idMapPath: idMapPath,
    checkpoints,
    checkpointsById,
    nodes,
    nodeToCheckpoint,
    pathToId,
    checkpointTokens,
    nodeTokens,
    idf,
    docFreq,
  };
  return ATLAS_CACHE;
}

function normalizePath(p) {
  return String(p).replace(/^\.\//, '').replace(/\/+$/, '');
}

/** hub is usually a canonical id ("REPO::file::path"); resolve it to a bare repo-relative path. */
function idOrHubToPath(hub, nodes) {
  if (!hub) return null;
  if (nodes[hub] && nodes[hub].path) return nodes[hub].path;
  const parts = String(hub).split('::');
  return parts.length >= 3 ? parts.slice(2).join('::') : hub;
}

function canonicalIdToPath(id, nodes) {
  if (nodes[id] && typeof nodes[id].path === 'string') return nodes[id].path;
  const parts = String(id).split('::');
  return parts.length >= 3 ? parts.slice(2).join('::') : id;
}

// ---------------------------------------------------------------------------------------------
// locate(pathOrSymbol) — which checkpoint contains this node.
// ---------------------------------------------------------------------------------------------

export function locate(pathOrSymbol, atlas = loadAtlas()) {
  const { pathToId, nodeToCheckpoint, checkpointsById, nodes } = atlas;
  const norm = normalizePath(pathOrSymbol);

  let id = pathToId.get(norm);
  if (!id) {
    // Try suffix match (caller passed a partial path) — deterministic: first match in
    // Map insertion order (id-map.json's own order), not "any" match.
    for (const [p, candidateId] of pathToId) {
      if (p.endsWith('/' + norm) || norm.endsWith('/' + p)) {
        id = candidateId;
        break;
      }
    }
  }
  if (!id) {
    // Fall back to basename/symbol token match against node labels.
    const qTokens = tokenSet(pathOrSymbol);
    let best = null;
    let bestScore = 0;
    for (const [nodeId, node] of Object.entries(nodes)) {
      const nt = atlas.nodeTokens.get(nodeId);
      const score = overlapCount(qTokens, nt.labelTokens) + overlapCount(qTokens, nt.pathTokens);
      if (score > bestScore) {
        bestScore = score;
        best = nodeId;
      }
    }
    if (bestScore > 0) id = best;
  }
  if (!id) return null;

  const checkpointId = nodeToCheckpoint.get(id);
  const checkpoint = checkpointId ? checkpointsById.get(checkpointId) : null;
  return {
    nodeId: id,
    path: canonicalIdToPath(id, nodes),
    checkpointId,
    checkpoint,
  };
}

// ---------------------------------------------------------------------------------------------
// enter(checkpointId, filters) — members, facet-filtered, ranked.
// ---------------------------------------------------------------------------------------------

export function enter(checkpointId, filters = {}, atlas = loadAtlas()) {
  const { checkpointsById, nodes } = atlas;
  const cp = checkpointsById.get(checkpointId);
  if (!cp) return [];

  let members = cp.members.map((id) => ({ id, path: canonicalIdToPath(id, nodes) }));

  if (filters.kind) {
    const wantExt = String(filters.kind).replace(/^\./, '').toLowerCase();
    members = members.filter((m) => {
      const ext = path.extname(m.path).replace(/^\./, '').toLowerCase();
      const noExt = ext === '' ? 'no-ext' : ext;
      return noExt === wantExt;
    });
  }
  if (filters.pathIncludes) {
    const needle = String(filters.pathIncludes).toLowerCase();
    members = members.filter((m) => m.path.toLowerCase().includes(needle));
  }

  const hubPath = atlas.checkpointTokens.get(checkpointId)?.hubPath;
  // Rank: hub first, then alphabetical by path — deterministic, no scoring ambiguity.
  members.sort((a, b) => {
    const aHub = a.path === hubPath ? 0 : 1;
    const bHub = b.path === hubPath ? 0 : 1;
    if (aHub !== bHub) return aHub - bHub;
    return a.path.localeCompare(b.path);
  });

  return members;
}

// ---------------------------------------------------------------------------------------------
// resolve(question, {top}) — natural-language question -> ranked repo-relative paths.
//
// The incumbent tier STRUCTURE is unchanged (path > label > capability > hub); what changed is that
// each matching token now contributes its corpus IDF instead of a flat 1:
//
//   score = exactBonus + idfPath*1000 + idfLabel*100 + idfCapability*10 + idfHub*1
//   where idfField = SUM of idf(t) over distinct query terms t present in that field.
//
// Why this and not full BM25F: measured, see the IDF WEIGHTING block above. Short answer — these
// "documents" are identifier lists, not prose, so BM25's tf-saturation and length normalisation
// have nothing to bite on while its rarity term goes to extremes.
//
// Under raw counting the generic word "run" (in 100+ paths) scored exactly as much as a rare
// distinctive one, which is how q003 ("what do I run before broad exploration...") returned
// helmsman-run.mjs / omp-task-adapter.mjs / mure-poll-run.mjs — three pure generic-token collisions.
//
// exactBonus is kept UNCHANGED and deliberately outside the IDF sum: a question that names a file
// verbatim ("what does xref-query.mjs do") is an exact-identifier lookup, a categorically stronger
// and different signal than bag-of-words similarity. Its magnitude only guarantees it dominates.
//
// Ties broken by path ascending (stable, never insertion-order-dependent).
// ---------------------------------------------------------------------------------------------

export function resolve(question, { top = 5 } = {}, atlas = loadAtlas()) {
  const qTokens = tokenSet(question);
  const qLower = String(question || '').toLowerCase();
  const { nodes, nodeTokens, nodeToCheckpoint, checkpointTokens, idf } = atlas;

  const scored = [];
  for (const [id, node] of Object.entries(nodes)) {
    const nt = nodeTokens.get(id);
    const checkpointId = nodeToCheckpoint.get(id);
    const ct = checkpointId ? checkpointTokens.get(checkpointId) : null;

    let idfPath = 0;
    let idfLabel = 0;
    let idfCap = 0;
    let idfHub = 0;
    for (const t of qTokens) {
      const w = idf.get(t);
      if (w === undefined) continue; // token absent from the whole corpus — contributes nothing
      if (nt.pathTokens.has(t)) idfPath += w;
      if (nt.labelTokens.has(t)) idfLabel += w;
      if (ct) {
        if (ct.capabilityTokens.has(t)) idfCap += w;
        if (ct.hubTokens.has(t)) idfHub += w;
      }
    }
    const bm = idfPath * 1000 + idfLabel * 100 + idfCap * 10 + idfHub * 1;

    let exactBonus = 0;
    if (nt.fullPathLower && qLower.includes(nt.fullPathLower)) exactBonus += 20000;
    else if (nt.basenameNoExt && nt.basenameNoExt.length >= 3 && qLower.includes(nt.basenameNoExt)) exactBonus += 10000;

    const score = exactBonus + bm;
    if (score > 0) {
      scored.push({ id, path: node.path, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  return scored.slice(0, top).map((s) => s.path);
}

// ---------------------------------------------------------------------------------------------
// SELF-TEST — determinism + basic smoke (same input -> same output, twice).
// ---------------------------------------------------------------------------------------------

function runSelfTest() {
  let pass = true;
  const atlas = loadAtlas();

  const q = 'where is model routing decided?';
  const r1 = resolve(q, { top: 5 }, atlas);
  const r2 = resolve(q, { top: 5 }, atlas);
  const deterministic = JSON.stringify(r1) === JSON.stringify(r2);
  console.log(`[atlas-resolve --test] determinism (same input twice): ${deterministic ? 'PASS' : 'FAIL'}`);
  console.log(`  q="${q}" -> ${JSON.stringify(r1)}`);
  if (!deterministic) pass = false;

  // Smoke: resolving a question that names a real file verbatim should surface that file top-1.
  const q2 = 'what does xref-query.mjs do';
  const r3 = resolve(q2, { top: 3 }, atlas);
  const hitXref = r3.some((p) => p.endsWith('xref-query.mjs'));
  console.log(`[atlas-resolve --test] direct-filename smoke ("xref-query.mjs" mentioned): ${hitXref ? 'PASS' : 'FAIL'}`);
  console.log(`  q="${q2}" -> ${JSON.stringify(r3)}`);
  if (!hitXref) pass = false;

  // locate() + enter() round trip.
  const loc = locate('_SYSTEM/Scripts/xref-query.mjs', atlas);
  const roundTrip = !!(loc && loc.checkpointId && enter(loc.checkpointId, {}, atlas).some((m) => m.path === loc.path));
  console.log(`[atlas-resolve --test] locate()+enter() round trip: ${roundTrip ? 'PASS' : 'FAIL'}`);
  if (!roundTrip) pass = false;

  console.log(`[atlas-resolve --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { question: null, top: 5, json: false, test: false };
  const rest = [];
  for (const raw of argv) {
    if (raw === '--test') args.test = true;
    else if (raw === '--json') args.json = true;
    else if (raw.startsWith('--top=')) args.top = parseInt(raw.slice('--top='.length), 10) || 5;
    else rest.push(raw);
  }
  args.question = rest.join(' ');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.test) {
    const pass = runSelfTest();
    process.exit(pass ? 0 : 1);
  }

  if (!args.question) {
    console.error('usage: atlas-resolve.mjs "<question>" [--top=N] [--json]');
    process.exit(1);
  }

  let atlas;
  try {
    atlas = loadAtlas();
  } catch (e) {
    console.error(`atlas-resolve: ${e.message}`);
    process.exit(2);
  }

  const paths = resolve(args.question, { top: args.top }, atlas);

  if (args.json) {
    console.log(JSON.stringify({ question: args.question, top: args.top, paths }, null, 2));
  } else {
    for (const p of paths) console.log(p);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
