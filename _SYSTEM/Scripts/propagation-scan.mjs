#!/usr/bin/env node
/**
 * propagation-scan.mjs — the READ-ONLY cross-reference / propagation engine V1 (XREF-02).
 *
 * WHAT IT IS
 *   `node _SYSTEM/Scripts/propagation-scan.mjs <node-id>` — given a circuitry node, surface the
 *   ranked top-K SIBLING nodes that share a MECHANISM (not a vocabulary), printed to stdout and
 *   appended as JSONL proposals under _SYSTEM/state/. It resolves, in executable form, the phantom
 *   cross-domain-transfer-engine claim — "any change to X ripples to its mechanism-siblings" — that
 *   CLAUDE.md asserts is live but had no runtime witness.
 *
 * HOW A SIBLING IS FOUND (semantic, NOT lexical grep)
 *   A mechanism-sibling shares a STRUCTURAL witness — a primitive the queried node's family is built
 *   on — discovered through the GitNexus typed call-graph, never a word-overlap heuristic. The
 *   discovery is two structural legs over the LIVE-pinned gitnexus index:
 *     (1) WITNESS EXTRACTION — `context <node-file>` gives the symbols the node structurally CALLS
 *         / READS (its outgoing mechanism primitives). For an import-only contract node (e.g.
 *         llm-compat-contract) outgoing calls are sparse, so we also harvest witnesses from the node's
 *         mechanism cluster via `query <node label/id tokens>` and keep only symbols that ≥2 OTHER
 *         node-files structurally touch (the MIN_WITNESSES shared-mechanism rule — a witness shared
 *         by only one file is not a *shared* mechanism).
 *     (2) SIBLING HARVEST — for each witness symbol, `context <witness>` + `query <witness>` give the
 *         files that structurally CALL / READ it. Each such file is mapped back to a circuitry node
 *         via node.files; that node is the mechanism-sibling. `writes`-edge relations are EXCLUDED
 *         (verified data-flow != shared mechanism). The queried node and the witness-definition file
 *         are never their own siblings.
 *
 * SHARED CONFIDENCE MODEL (do NOT reinvent)
 *   Every surfaced sibling is graded by xref-provenance.scoreHit + theater-gated by gateHit — the
 *   SAME model xref-query uses, so the query surface and the propagation surface grade IDENTICALLY.
 *   A structural sibling on the LIVE-fresh index = HIGH (0.8..1.0); on a stale index the staleness
 *   penalty applies; a would-be sibling that survives only on lexical co-occurrence with no named
 *   mismatch is auto-suppressed to a sub-log (never the main surface). Each surfaced record passes
 *   the serialize-revalidate canary before it is written.
 *
 * MECHANISM-PATTERN TAG (single source of truth)
 *   The verb that labels the shared mechanism comes from the MATH-01 closed registry
 *   (mechanism-pattern-registry.mjs MECHANISM_PATTERN_VERBS) — never self-minted here. If the
 *   discovered witness maps to no registry verb, the sibling is tagged `unclassified-mechanism`
 *   and still surfaced (the structural evidence stands on its own), but it can NEVER claim a verb
 *   the registry has not admitted.
 *
 * NON-NEGOTIABLE GUARDS (roadmap §4 L88-90 + appendix ENG-01) — each implemented + commented below:
 *   (a) depth=1 structural LEAF — a surfaced proposal NEVER auto-triggers another scan. Re-entry is
 *       manual owner action. This file has no self-invocation, no fan-out, no recursion.
 *   (b) per-pattern 24h COOLDOWN — last-run per mechanism-pattern recorded in the backlog state; a
 *       pattern scanned < 24h ago is skipped (use --force to override, owner action).
 *   (c) confidence FLOOR >= 0.55 (from xref-provenance knobs), edge kinds in {calls, reads} ONLY,
 *       hop-radius <= 2.
 *   (d) `writes` edges EXCLUDED from sibling discovery (census calls:77 reads:31 writes:45) —
 *       scoreHit returns null for a writes neighbor; we count it as droppedWritesEdge, never surface.
 *   (e) emit `matched=N surfaced=K` so an over-broad signature is VISIBLE, never silently truncated.
 *   (f) tiered + paged output with a visible `(N-K) more`, never a hard count cap.
 *   (g) node-id-not-found -> FAIL CLOSED: exit 1, ZERO JSONL lines written (no partial write).
 *   (h) JSONL backlog (status=proposed; owner-only transitions) under _SYSTEM/state/ — NOT
 *       backend/data/, NOT .claude/state/. Atomic append (write to temp, fsync, rename-merge) so a
 *       crash mid-write cannot corrupt the backlog.
 *   (i) NO writes to any graph / registry / doc. Surfacing only. The ONLY file ever written is the
 *       _SYSTEM/state/ backlog JSONL + its sibling cooldown state.
 *
 * GRACEFUL DEGRADE (GitNexus unavailable)
 *   If the structural leg is down (CLI missing, throws, empty, or a kagami/sandbox shell block), the
 *   scan reports `structuralLegAvailable=false`, and any sibling that could only be found lexically
 *   is downgraded + tagged `structuralUnavailable` + suppressed below the floor — NEVER silently
 *   promoted to structural confidence (severity-laundering, cf FB:DELTA-GATE-SEVERITY-LAUNDERING).
 *   With no structural leg the scan surfaces nothing above-floor and says so explicitly.
 *
 * Usage:
 *   node _SYSTEM/Scripts/propagation-scan.mjs llm-compat-contract
 *   node _SYSTEM/Scripts/propagation-scan.mjs llm-compat-contract --top 15 --json
 *   node _SYSTEM/Scripts/propagation-scan.mjs llm-compat-contract --force   (override 24h cooldown)
 *   node _SYSTEM/Scripts/propagation-scan.mjs llm-compat-contract --dry-run (no JSONL write)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  scoreHit,
  gateHit,
  serializeRevalidate,
  EVIDENCE_KIND,
  XREF_PROVENANCE_KNOBS,
} from './xref-provenance.mjs';
import { classifyMechanism, loadVerbRecords, buildVerbSymbolIndex, UNCLASSIFIED_MECHANISM } from './math/mechanism-pattern-registry.mjs';
import { gitnexusStaleness } from './xref-drift-scan.mjs';
import { resolveGitnexusStale } from './xref-query.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// F1 (from xref-query): TWO indexed yuri-os repos exist (live root + a stale vault-restructure
// worktree). The gitnexus --repo param is PINNED to the live absolute root; an unpinned query can
// silently hit the wrong graph and consult a stale structural graph. Never relax this.
const LIVE_REPO_ROOT = REPO_ROOT;

const GRAPH_PATH = path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
// xref-query pins the node_modules CLI; that copy is the one the live index was built against.
const GITNEXUS_CLI = path.join(REPO_ROOT, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js');

// (h) backlog + cooldown state live under _SYSTEM/state/ — NOT backend/data/, NOT .claude/state/.
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'propagation-scan');
const BACKLOG_PATH = path.join(STATE_DIR, 'propagation-backlog.jsonl');
const COOLDOWN_PATH = path.join(STATE_DIR, 'pattern-cooldown.json');

const DEFAULT_TOP = 10;
const HARD_TIER = 8; // first visible tier; the rest fold into "(N-K) more" (paged, never hard-capped)
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // (b) 24h per-pattern cooldown
const GITNEXUS_TIMEOUT_MS = 30_000;
const GITNEXUS_LIMIT = 12;
const MIN_SHARED_WITNESS_FILES = 2; // a witness shared by <2 OTHER files is not a *shared* mechanism

// (d) The closed sibling edge-kind set. `writes` is deliberately ABSENT — a verified data-flow write
// is NOT evidence of a shared mechanism. Mirrors xref-provenance's private SIBLING_EDGE_KINDS (kept
// in sync; that one is not exported). This is the authority for the writes-exclusion in the harvest.
const SIBLING_EDGE_KINDS = new Set(['calls', 'reads']);

// LEXICAL-VS-STRUCTURAL FIREWALL (XREF-02 laundering fix):
//   `query <witness>` is a BM25/vector LEXICAL recall over the whole corpus — it returns ANY file
//   that CONTAINS the token (incl. .md report prose, the circuitry-graph.json itself, and protected
//   .claude/state data). It is NOT a call-graph edge traversal. A query hit therefore NOMINATES a
//   candidate; it does NOT prove a structural edge. A nominee earns the STRUCTURAL band ONLY if a
//   real calls/reads edge is CONFIRMED via `context` (the candidate's OUTGOING — the witness's
//   incoming edge is lossy on this index). These two guards make that firewall non-bypassable:
//
//   (1) STRUCTURAL_FILE_EXT — only true source files can originate a call edge. A markdown/data/text
//       file has NO outgoing call edges by construction, so it can NEVER be a structural sibling
//       regardless of node.files membership (cortex-state.json, persona.md, SOUL.md, the graph JSON
//       are all node-mapped — membership is corpus-incidental, not a guarantee).
const STRUCTURAL_FILE_EXT = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx']);
function isStructuralSourceFile(p) {
  return STRUCTURAL_FILE_EXT.has(path.extname(String(p || '')).toLowerCase());
}
//   (2) PROTECTED_PREFIXES — a protected/volatile surface (backend/data, .claude/state|history, .env)
//       is never a structural call origin and must never be named a 0.97 sibling. Hard-excluded from
//       the structural surface even on the (impossible) chance it had a source extension.
const PROTECTED_PREFIXES = ['backend/data/', '.claude/state/', '.claude/history/', '.env'];
function isProtectedPath(p) {
  const rel = String(p || '');
  return PROTECTED_PREFIXES.some((pre) => rel === pre || rel.startsWith(pre));
}
// A file may carry a STRUCTURAL call edge only if it is a real source file AND not a protected path.
function structuralEligible(p) {
  return isStructuralSourceFile(p) && !isProtectedPath(p);
}

// GENERIC-WITNESS SUPPRESSION (anti-flood, the scout's lexical-flood risk applied to witnesses):
// a symbol like `main`/`run`/`init`/`test` is shared by HALF the repo, so "two files both call run()"
// is mechanism-fit THEATER, not a shared mechanism. A witness on this list is NEVER admitted — the
// sibling bond must rest on a DISTINCTIVE shared primitive (traceDispatchEvent), not a generic verb.
// Conservative + closed: only the unambiguously-generic names. A real domain symbol is never here.
const GENERIC_WITNESS_NAMES = new Set([
  'main', 'run', 'init', 'setup', 'start', 'stop', 'test', 'index', 'default',
  'handler', 'handle', 'execute', 'exec', 'process', 'parse', 'parseargs', 'printhelp',
  'usage', 'help', 'log', 'error', 'warn', 'info', 'debug', 'tostring', 'tojson',
  'get', 'set', 'has', 'add', 'remove', 'clear', 'reset', 'load', 'save', 'read', 'write',
  'workedexample', 'example', 'fixture', 'mock', 'stub', 'noop',
]);
function isGenericWitness(name) {
  return GENERIC_WITNESS_NAMES.has(String(name || '').toLowerCase());
}

// ------------------------------------------------------------------------------------------------
// tokenization (deterministic, shared idiom with xref-query)
// ------------------------------------------------------------------------------------------------
function tokenize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3);
}

// Normalize a path to repo-relative forward-slash form (dedup + graph node.files comparison key).
function normalizePath(p) {
  if (!p) return p;
  let rel = p;
  if (path.isAbsolute(p) && p.startsWith(REPO_ROOT)) rel = path.relative(REPO_ROOT, p);
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

// ------------------------------------------------------------------------------------------------
// graph load + node->files / file->node maps (READ-ONLY; never mutated)
// ------------------------------------------------------------------------------------------------
function loadGraph() {
  const g = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes : [],
    edges: Array.isArray(g.edges) ? g.edges : [],
  };
}

// file (repo-relative) -> array of node-ids whose node.files contain it.
function buildFileToNodes(graph) {
  const map = new Map();
  for (const node of graph.nodes) {
    for (const f of Array.isArray(node.files) ? node.files : []) {
      const key = normalizePath(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(node.id);
    }
  }
  return map;
}

// ------------------------------------------------------------------------------------------------
// GitNexus structural leg — fail-CLOSED. Returns { available, ...payload }. NEVER throws.
//   We spawn the CLI as a node child via execFileSync. (Verified: a kagami/sandbox shell can block
//   an interactive `node node_modules/...` token, but an execFileSync(process.execPath, ...) spawn
//   from inside node is permitted; if THIS environment blocks even that, the catch yields
//   available:false and the whole scan degrades gracefully — never a silent structural claim.)
// ------------------------------------------------------------------------------------------------
function gitnexusCall(sub, target, { limit = GITNEXUS_LIMIT } = {}) {
  if (!fs.existsSync(GITNEXUS_CLI)) {
    return { available: false, reason: 'gitnexus CLI not present', json: null };
  }
  if (!String(target || '').trim()) {
    // The CLI errors on an empty target and burns the timeout — short-circuit (F4 latency footgun).
    return { available: false, reason: 'empty structural target', json: null };
  }
  const args = [GITNEXUS_CLI, sub, target, '--repo', LIVE_REPO_ROOT]; // F1: pin --repo to live root
  if (sub === 'query') args.push('--limit', String(limit));
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: GITNEXUS_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    return { available: false, reason: `gitnexus ${sub} failed: ${String(err.message).slice(0, 160)}`, json: null };
  }
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { available: false, reason: `gitnexus ${sub} output not JSON`, json: null };
  }
  // A valid-JSON error envelope ({error:...} or {status:'error'|'not_found'}) is NOT a usable
  // structural result — treat it as unavailable so an error payload can never masquerade as an
  // empty-but-successful structural answer (severity-laundering at the parse boundary).
  if (json && (json.error || json.status === 'error' || json.status === 'not_found')) {
    return { available: false, reason: `gitnexus ${sub}: ${json.error || json.status}`, json: null };
  }
  return { available: true, reason: null, json };
}

// Pull every file path out of a gitnexus query/context payload (process_symbols + definitions, or
// incoming/outgoing calls/reads). Bounded; deterministic order.
function filesFromQuery(json) {
  const out = [];
  const syms = Array.isArray(json?.process_symbols) ? json.process_symbols : [];
  const defs = Array.isArray(json?.definitions) ? json.definitions : [];
  for (const s of [...syms, ...defs]) if (s && s.filePath) out.push({ filePath: s.filePath, name: s.name, edgeKind: 'reference' });
  return out;
}

// From a `context <symbol>` payload, the INCOMING callers/readers/writers. We pass the edgeKind
// THROUGH (including `writes`) and let scoreHit be the single exclusion point (guard d): scoreHit
// returns null for any kind outside {calls,reads}, which the harvester counts as droppedWritesEdge.
// Centralizing the exclusion in scoreHit (not pre-filtering here) keeps ONE source of truth for the
// writes!=mechanism rule and makes the exclusion observable/testable rather than silent.
function callersFromContext(json) {
  const out = [];
  const inc = json?.incoming || {};
  for (const kind of ['calls', 'reads', 'writes']) {
    for (const c of Array.isArray(inc[kind]) ? inc[kind] : []) {
      if (c && c.filePath) out.push({ filePath: c.filePath, name: c.name, edgeKind: kind });
    }
  }
  return out;
}

// From `context <file-or-symbol>` the OUTGOING calls/reads — the mechanism primitives the node uses.
function outgoingWitnesses(json) {
  const out = [];
  const og = json?.outgoing || {};
  for (const kind of ['calls', 'reads']) {
    for (const c of Array.isArray(og[kind]) ? og[kind] : []) {
      if (c && c.name) out.push({ name: c.name, filePath: c.filePath, edgeKind: kind });
    }
  }
  return out;
}

// CANDIDATE-OUTGOING CONFIRMATION (the structural gate for a query-NOMINATED candidate).
//   A `query <witness>` hit only NOMINATES a candidate file. To earn the STRUCTURAL band the
//   candidate must STRUCTURALLY emit the witness on a calls/reads edge — proven from the CANDIDATE's
//   OUTGOING (`context <candidate-basename>`), NOT the witness's incoming (this index drops some
//   incoming CALLS edges — the shintai case — so the witness-incoming leg is not reliable). A
//   markdown/data file has no outgoing call edges, so it can never confirm — the prose twin is
//   rejected STRUCTURALLY, not corpus-incidentally. Returns the REAL edge-kind (never fabricated)
//   on confirmation, or null when the candidate does not structurally emit the witness.
function confirmCandidateOutgoing(candidateFile, witnessName, gxCall) {
  if (!structuralEligible(candidateFile)) return null; // prose/data/protected — cannot originate a call
  const base = String(candidateFile).split('/').pop();
  for (const target of [base, candidateFile]) {
    const ctx = gxCall('context', target);
    if (!ctx.available) continue;
    for (const w of outgoingWitnesses(ctx.json)) {
      if (w.name === witnessName && SIBLING_EDGE_KINDS.has(w.edgeKind)) {
        return { edgeKind: w.edgeKind, confirmed: true };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// WITNESS EXTRACTION — the symbols the queried node's family is built on.
//   Strategy: (1) outgoing structural calls/reads of the node's own file(s); (2) if sparse (import-
//   only contract node), harvest candidate witnesses from the node's mechanism cluster via
//   `query <node id/label tokens>` and keep only symbols that ≥2 OTHER node-mapped files call/read
//   (the shared-mechanism rule). Returns a de-duped, bounded list of witness symbol names + the
//   structural availability flag.
// ------------------------------------------------------------------------------------------------
function extractWitnesses(node, fileToNodes, gxCall = gitnexusCall) {
  const witnesses = new Map(); // name -> { name, viaOutgoing:boolean }
  let structuralLegAvailable = false;

  const nodeFiles = new Set((Array.isArray(node.files) ? node.files : []).map(normalizePath));

  // Leg 1: outgoing calls/reads of the node's own file (direct mechanism primitives it uses).
  for (const f of nodeFiles) {
    const ctx = gxCall('context', f);
    if (ctx.available) {
      structuralLegAvailable = true;
      for (const w of outgoingWitnesses(ctx.json)) {
        if (w.name && !isGenericWitness(w.name) && !witnesses.has(w.name)) {
          witnesses.set(w.name, { name: w.name, viaOutgoing: true });
        }
      }
    }
  }

  // Leg 2: 2-hop cluster-file witness walk for import-only / sparse-outgoing nodes (the offload-
  // contract case). The node's own outgoing calls are sparse, so we discover the BINDING witness
  // through its mechanism cluster (hop-radius<=2, guard c):
  //   hop-1: query the node's mechanism vocabulary -> CLUSTER FILES that map to OTHER circuitry
  //          nodes (the candidate siblings — llm-lane, lane-kernel, ...).
  //   hop-2: harvest each cluster file's OUTGOING structural symbols (context <basename>) and keep
  //          a symbol as a WITNESS iff >=2 distinct cluster files structurally emit it — that is the
  //          shared mechanism the family is built on (e.g. traceDispatchEvent). A symbol only one
  //          file touches is NOT a *shared* mechanism and is dropped.
  // This binds the family through a verified structural primitive, never a word-overlap heuristic.
  // The node-id STEM is the strongest structural anchor: a hyphenated id (llm-compat-contract) shares
  // a stem token (offload) with its family files (offload-runner) far more reliably than the prose
  // label, so the cluster query leads with id-stem tokens, then adds distinctive label tokens.
  const STOP = new Set(['the', 'and', 'for', 'node', 'engine', 'with', 'its', 'own']);
  const idStem = tokenize(String(node.id || '').replace(/-/g, ' ')).filter((t) => !STOP.has(t));
  const labelTokens = tokenize(node.label || '').filter((t) => !STOP.has(t) && !idStem.includes(t));
  const clusterTokens = [...idStem, ...labelTokens];
  // Query variants, narrowest-recall to broadest. A SINGLE distinctive id-stem token (e.g. "offload")
  // is the best family anchor: multi-term BM25 ranks the node's OWN file to the top and the siblings
  // fall off the limit, whereas the bare stem co-locates the whole family (verified: "offload" ->
  // llm-compat-contract + offload-runner, but "offload contract" -> llm-compat-contract only). So we try
  // each id-stem token alone (longest = most distinctive first), then the joined fallbacks. We do NOT
  // stop at the first non-empty result — we UNION cluster files across variants (bounded), because no
  // single query reliably reaches every family member on this index.
  const distinctiveStem = [...new Set(idStem)].filter((t) => t.length >= 4).sort((a, b) => b.length - a.length);
  const queryVariants = [
    ...distinctiveStem.slice(0, 3), // each distinctive stem token, alone
    idStem.slice(0, 3).join(' '),
    [...new Set(clusterTokens)].slice(0, 6).join(' '),
  ].filter((q, i, a) => q && a.indexOf(q) === i);

  const clusterFileSet = new Set();
  for (const clusterQuery of queryVariants) {
    const qres = gxCall('query', clusterQuery);
    if (!qres.available) continue;
    structuralLegAvailable = true;
    for (const s of filesFromQuery(qres.json)) {
      const p = normalizePath(s.filePath);
      if (p && fileToNodes.has(p) && !nodeFiles.has(p)) clusterFileSet.add(p);
    }
    if (clusterFileSet.size >= 8) break; // enough family files — stop spending queries
  }
  // hop-1: cluster files that map to OTHER circuitry nodes (bounded, deterministic order).
  const clusterFiles = [...clusterFileSet].sort().slice(0, 10);

  // hop-2: each cluster file's outgoing structural symbols; tally how many cluster files emit each.
  const symbolFileCount = new Map(); // symbolName -> Set(clusterFile)
  for (const cf of clusterFiles) {
    const base = cf.split('/').pop();
    const ctx = gxCall('context', base);
    if (!ctx.available) continue;
    for (const w of outgoingWitnesses(ctx.json)) {
      if (!w.name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(w.name)) continue;
      if (isGenericWitness(w.name)) continue; // anti-flood: a generic verb is not a shared mechanism
      if (!SIBLING_EDGE_KINDS.has(w.edgeKind)) continue; // calls/reads only (guard d)
      if (!symbolFileCount.has(w.name)) symbolFileCount.set(w.name, new Set());
      symbolFileCount.get(w.name).add(cf);
    }
  }
  // a witness must be emitted by >=2 distinct cluster files (the shared-mechanism rule).
  for (const [name, files] of symbolFileCount) {
    if (witnesses.has(name)) continue;
    if (files.size >= MIN_SHARED_WITNESS_FILES) witnesses.set(name, { name, viaOutgoing: false });
  }

  // Recall fallback: if hop-2 found a witness emitted by only ONE indexed cluster file (the index
  // drops some CALLS edges — e.g. shintai's traceDispatchEvent), re-confirm sharing by asking the
  // witness directly: a single-file witness is admitted ONLY if `query <witness>` structurally
  // surfaces >=2 distinct OTHER node-mapped files. This recovers the spec sibling pair without
  // admitting a non-shared symbol (a lexical twin touched by only one file never clears the bar).
  for (const [name, files] of symbolFileCount) {
    if (witnesses.has(name) || files.size >= MIN_SHARED_WITNESS_FILES) continue;
    const wq = gxCall('query', name);
    if (!wq.available) continue;
    const distinctNodeFiles = new Set(
      filesFromQuery(wq.json)
        .map((s) => normalizePath(s.filePath))
        .filter((p) => p && fileToNodes.has(p) && !nodeFiles.has(p)),
    );
    if (distinctNodeFiles.size >= MIN_SHARED_WITNESS_FILES) witnesses.set(name, { name, viaOutgoing: false });
  }

  // bound the witness set (deterministic order: outgoing first, then alpha).
  const list = [...witnesses.values()].sort(
    (a, b) => Number(b.viaOutgoing) - Number(a.viaOutgoing) || a.name.localeCompare(b.name),
  );
  return { witnesses: list.slice(0, 12), structuralLegAvailable };
}

// ------------------------------------------------------------------------------------------------
// SIBLING HARVEST — for each witness, the node-files that share it. The legs are AND-gated by trust,
// NEVER OR-unioned into one structural surface (the XREF-02 laundering fix):
//   LEG A — STRUCTURAL (`context <witness>` incoming). Real call-graph edges with REAL edge-kinds.
//           writes-excluded, graded STRUCTURAL/HIGH. This is the only leg that carries true edges.
//   LEG B — NOMINATION (`query <witness>` BM25/vector lexical recall). A hit only NOMINATES a
//           candidate — it does NOT prove an edge (the recall returns prose .md, the graph JSON, and
//           protected data files too). A nominee is admitted to the STRUCTURAL surface ONLY when its
//           OWN OUTGOING context structurally emits the witness on a calls/reads edge (confirm via
//           the candidate, not the witness incoming, because the index drops some incoming edges).
//           An UNCONFIRMED nominee is NEVER laundered to HIGH: prose/data/protected files are hard-
//           rejected outright; a source-file nominee that context cannot confirm is routed to the
//           honest LEXICAL surface (sub-floor, named mismatch) — recovering a spec sibling like
//           shintai at its CORRECT lower confidence instead of a fabricated 0.97.
//   The queried node + any file mapping to no circuitry node are excluded from being siblings.
// ------------------------------------------------------------------------------------------------
function harvestSiblings(node, witnesses, fileToNodes, gxCall = gitnexusCall) {
  const nodeFiles = new Set((Array.isArray(node.files) ? node.files : []).map(normalizePath));
  // candidateNodeId -> { nodeId, file, witnesses:Set, best:gradedHit, mismatch?:string }
  const byNode = new Map();
  let structuralLegAvailable = false;
  let writesExcluded = 0;
  let lexicalRejected = 0; // prose/data/protected query nominees hard-rejected from any sibling surface
  let gitnexusStale = false; // resolved once, below

  // Resolve staleness ONCE (shared with scoreHit). Fail-closed: indeterminate freshness -> stale.
  const staleInfo = gitnexusStaleness({ repoRoot: LIVE_REPO_ROOT });
  gitnexusStale = resolveGitnexusStale(staleInfo);

  // upsert a structurally-CONFIRMED sibling (LEG A, or a context-confirmed LEG-B nominee).
  function upsertStructural(filePath, witnessName, graded) {
    const nodeIds = fileToNodes.get(filePath);
    if (!nodeIds) return; // file maps to no circuitry node — drop doc/graph-json noise
    for (const nodeId of nodeIds) {
      if (nodeId === node.id) continue;
      if (!byNode.has(nodeId)) byNode.set(nodeId, { nodeId, file: filePath, witnesses: new Set(), best: graded });
      const rec = byNode.get(nodeId);
      rec.witnesses.add(witnessName);
      // a confirmed structural hit always supersedes a prior lexical-only record for the same node.
      if (rec.mismatch || graded.confidence > rec.best.confidence) {
        rec.best = graded;
        delete rec.mismatch;
        rec.file = filePath;
      }
    }
  }

  // upsert an UNCONFIRMED lexical nominee (LEG B, source-file, no confirmed call edge) — honest
  // LOW confidence with a named mismatch. Never overrides an existing structural record.
  function upsertLexical(filePath, witnessName, graded, mismatch) {
    const nodeIds = fileToNodes.get(filePath);
    if (!nodeIds) return;
    for (const nodeId of nodeIds) {
      if (nodeId === node.id) continue;
      if (byNode.has(nodeId)) {
        // already has a (possibly structural) record — only record the shared witness; never demote.
        byNode.get(nodeId).witnesses.add(witnessName);
        continue;
      }
      byNode.set(nodeId, { nodeId, file: filePath, witnesses: new Set([witnessName]), best: graded, mismatch });
    }
  }

  for (const w of witnesses) {
    // LEG A — STRUCTURAL: precise incoming callers/readers with REAL edge-kinds (writes excluded).
    const ctx = gxCall('context', w.name);
    if (ctx.available) {
      structuralLegAvailable = true;
      for (const c of callersFromContext(ctx.json)) {
        const filePath = normalizePath(c.filePath);
        if (!filePath || nodeFiles.has(filePath)) continue; // never a sibling of itself
        // (d) WRITES EXCLUSION — enforced HERE: scoreHit's STRUCTURAL surface does NOT gate on
        // edgeKind, so a writes caller routed as structural would launder into HIGH. Drop + count.
        if (!SIBLING_EDGE_KINDS.has(c.edgeKind)) { writesExcluded += 1; continue; }
        // A structural call edge cannot originate from a prose/data/protected file. Even on a real
        // incoming edge, reject any non-source / protected origin from the STRUCTURAL surface.
        if (!structuralEligible(filePath)) { lexicalRejected += 1; continue; }
        const graded = scoreHit({
          surface: EVIDENCE_KIND.STRUCTURAL,
          structuralMatch: true,
          edgeKind: c.edgeKind, // REAL edge-kind, never fabricated
          lexicalScore: 0.85,
          gitnexusStale,
        });
        if (!graded) { writesExcluded += 1; continue; }
        upsertStructural(filePath, w.name, graded);
      }
    }

    // LEG B — NOMINATION: query lexical recall. Each hit only NOMINATES; it must be CONFIRMED.
    const qres = gxCall('query', w.name);
    if (qres.available) {
      structuralLegAvailable = true;
      const seen = new Set();
      for (const s of filesFromQuery(qres.json)) {
        const filePath = normalizePath(s.filePath);
        if (!filePath || nodeFiles.has(filePath) || seen.has(filePath)) continue;
        seen.add(filePath);
        if (!fileToNodes.has(filePath)) continue; // maps to no node — doc/graph noise, drop silently
        // HARD-REJECT prose/data/protected from the structural firewall (membership is incidental).
        if (!structuralEligible(filePath)) { lexicalRejected += 1; continue; }
        // CONFIRM via the candidate's OWN outgoing — real call edge or it is NOT structural.
        const confirm = confirmCandidateOutgoing(filePath, w.name, gxCall);
        if (confirm) {
          const graded = scoreHit({
            surface: EVIDENCE_KIND.STRUCTURAL,
            structuralMatch: true,
            edgeKind: confirm.edgeKind, // REAL edge-kind from the candidate's outgoing
            lexicalScore: 0.85,
            gitnexusStale,
          });
          if (graded) upsertStructural(filePath, w.name, graded);
        } else {
          // Unconfirmed source-file nominee: the index neither carries the incoming edge nor confirms
          // the candidate's outgoing. It is NOT structurally corroborated — surface it HONESTLY at the
          // LEXICAL band (sub-0.55) with a named mismatch, never the 0.97 structural band.
          const graded = scoreHit({ surface: EVIDENCE_KIND.LEXICAL, lexicalScore: 0.85 });
          if (graded) {
            upsertLexical(
              filePath,
              w.name,
              graded,
              `lexical recall on "${w.name}"; no confirmed call/reads edge (index dropped the edge)`,
            );
          }
        }
      }
    }
  }

  return { byNode, structuralLegAvailable, writesExcluded, lexicalRejected, gitnexusStale, staleInfo };
}

// ------------------------------------------------------------------------------------------------
// MECHANISM-SIGNATURE CLASSIFIER (cross-reference engine axis 2 — "the biggest lever").
// The previous tagger matched a sibling to a verb by substring-matching the verb's OWN NAME TOKENS
// against witness symbol names — "mechanism-fit theater" (e.g. `sharedFn` -> `shared`-prerequisite-
// unlock). It is replaced by the witness-anchored `classifyMechanism` (single source of truth in the
// registry module), which scores by STRUCTURE not words: file-anchor on an unambiguous witness site
// (HIGH), ambiguous multi-verb site / import-hop (MED), lexical look-alike (LOW + antiWitness flag),
// or unclassified. The full verb RECORDS (with real path:line witnesses) load fail-closed: a bad
// registry yields [] -> every sibling is `unclassified-mechanism` and structural evidence stands.
// ------------------------------------------------------------------------------------------------
const REGISTRY_VERB_RECORDS = loadVerbRecords().verbs;
// Per-verb discriminating def-symbol index (stoplist + cross-verb-collision filtered), built once.
// Feeds the symbol-anchor HIGH tier — the sibling sharing a verb's actual mechanism identifier.
const VERB_SYMBOL_INDEX = buildVerbSymbolIndex(REGISTRY_VERB_RECORDS);
// Red-team #5: records present but ZERO indexed verbs => every DEF witness was unreadable/moved at
// load => the symbol-anchor tier is silently disabled. Signal it rather than degrade invisibly.
if (REGISTRY_VERB_RECORDS.length > 0 && VERB_SYMBOL_INDEX.size === 0) {
  process.stderr.write('[propagation-scan] WARN: verb symbol index empty despite verb records — symbol-anchor tier disabled (check witness file readability)\n');
}

// Cheap import-hop resolver (no call graph): the repo-relative files a sibling imports, so the
// classifier can grant a MED "import-hop" bond when a sibling depends on a verb's witness file.
// Memoised per file; fail-open to [] on any read/parse trouble (the backbone must not crash here).
const SIBLING_IMPORTS_CACHE = new Map();
// Quote chars include the backtick so a template-literal specifier is seen (red-team #1); a spec that
// carries a `${...}` interpolation is unresolvable statically and is skipped below.
const IMPORT_SPECIFIER_RE = /(?:import|export)[^'"`]*?from\s*['"`]([^'"`]+)['"`]|(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
// Pure (exported for test): extract the LOCAL/relative import specifiers from a source string.
// Red-team F2/#1: strip comments BEFORE matching (a commented-out import is not a real dependency),
// see template-literal specifiers, and skip a statically-unresolvable `${...}` interpolation.
// @capability: propagation-scan
// @serves: what does changing this node affect | propagation blast radius | downstream impact dry-run | cross-reference engine | import dependents of a mechanism
// @does: READ-ONLY cross-reference / propagation engine (XREF-02) — parses the import graph + propagates a node's change effects to its dependents; --dry-run feeds predicted effects to the prediction-ledger
// @use: before changing a circuitry node run propagation-scan <node> --dry-run to see what propagates; the structural complement to xref-query / code-navigation-search
// @exports: parseImportSpecifiers, propagationScan
export function parseImportSpecifiers(src) {
  if (typeof src !== 'string' || !src) return [];
  const scrubbed = src
    .replace(/\/\*[\s\S]*?\*\//g, '') //                       block comments
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); //             line comments (spares `://` in URLs)
  const out = [];
  let m;
  IMPORT_SPECIFIER_RE.lastIndex = 0;
  while ((m = IMPORT_SPECIFIER_RE.exec(scrubbed)) !== null) {
    const spec = m[1] || m[2];
    if (!spec || spec.includes('${')) continue; //             unresolvable interpolated specifier
    if (!(spec.startsWith('.') || spec.startsWith('/'))) continue; // relative/local only
    out.push(spec);
  }
  return out;
}

function resolveSiblingImports(relFile) {
  if (typeof relFile !== 'string' || !relFile) return [];
  if (SIBLING_IMPORTS_CACHE.has(relFile)) return SIBLING_IMPORTS_CACHE.get(relFile);
  let out = [];
  try {
    const abs = path.join(REPO_ROOT, relFile);
    const src = fs.readFileSync(abs, 'utf8');
    const dir = path.dirname(abs);
    const seen = new Set();
    for (const spec of parseImportSpecifiers(src)) {
      const resolvedAbs = path.resolve(dir, spec);
      const rel = path.relative(REPO_ROOT, resolvedAbs).split(path.sep).join('/');
      if (rel && !rel.startsWith('..')) seen.add(rel);
    }
    out = [...seen];
  } catch {
    out = [];
  }
  SIBLING_IMPORTS_CACHE.set(relFile, out);
  return out;
}

function classifyForSibling(siblingFile, witnessNames) {
  return classifyMechanism({
    siblingFile,
    witnessNames,
    siblingImports: resolveSiblingImports(siblingFile),
    verbs: REGISTRY_VERB_RECORDS,
    symbolIndex: VERB_SYMBOL_INDEX,
  });
}

// ------------------------------------------------------------------------------------------------
// COOLDOWN (guard b) — per mechanism-pattern, 24h. State file is JSON { pattern -> lastRunISO }.
// ------------------------------------------------------------------------------------------------
function readCooldown(cooldownPath = COOLDOWN_PATH) {
  try {
    return JSON.parse(fs.readFileSync(cooldownPath, 'utf8'));
  } catch {
    return {};
  }
}
function cooldownActive(cooldown, pattern, now) {
  const last = cooldown[pattern];
  if (!last) return false;
  const t = Date.parse(last);
  return Number.isFinite(t) && now - t < COOLDOWN_MS;
}

// ------------------------------------------------------------------------------------------------
// ATOMIC append (guard h) — write proposed records to a temp file, then concatenate existing +
// temp into a fresh file and rename over the backlog. A crash mid-write leaves the original
// backlog intact (the rename is the atomic commit point); no partial line is ever exposed.
// ------------------------------------------------------------------------------------------------
function atomicAppendJsonl(targetPath, lines) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  const payload = existing + lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  const tmp = `${targetPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, payload);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, targetPath); // atomic commit
}

function writeCooldown(cooldown, cooldownPath = COOLDOWN_PATH) {
  fs.mkdirSync(path.dirname(cooldownPath), { recursive: true });
  const tmp = `${cooldownPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(cooldown, null, 2));
  fs.renameSync(tmp, cooldownPath);
}

// ================================================================================================
// PUBLIC API
// ================================================================================================
export function propagationScan(rawNodeId, opts = {}) {
  const top = Math.max(1, Math.min(50, opts.top || DEFAULT_TOP));
  const force = opts.force === true;
  const dryRun = opts.dryRun === true;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();

  // Dependency injection seam (tests only — production passes nothing and uses the real graph/CLI).
  //   deps.graph     — { nodes, edges } to use instead of reading GRAPH_PATH.
  //   deps.gitnexus  — (sub, target, opts) => { available, reason, json } stub for the structural leg.
  //   deps.stateDir  — override _SYSTEM/state/ so a test never touches the real backlog.
  const deps = opts.deps || {};
  const gxCall = typeof deps.gitnexus === 'function' ? deps.gitnexus : gitnexusCall;
  const backlogPath = deps.stateDir ? path.join(deps.stateDir, 'propagation-backlog.jsonl') : BACKLOG_PATH;
  const cooldownPath = deps.stateDir ? path.join(deps.stateDir, 'pattern-cooldown.json') : COOLDOWN_PATH;

  const nodeId = String(rawNodeId || '').trim();
  if (!nodeId) {
    return { ok: false, error: 'no node-id given', written: 0 };
  }

  // load graph (read-only)
  let graph;
  try {
    graph = deps.graph || loadGraph();
  } catch (err) {
    return { ok: false, error: `graph load failed: ${err.message}`, written: 0 };
  }
  const node = graph.nodes.find((n) => n.id === nodeId);

  // (g) node-not-found -> FAIL CLOSED. Return before ANY write. Exit 1 at CLI. No partial write.
  if (!node) {
    return {
      ok: false,
      error: `node-id not found in circuitry graph: ${nodeId}`,
      written: 0,
      knownNodeCount: graph.nodes.length,
    };
  }

  const fileToNodes = buildFileToNodes(graph);

  // WITNESS EXTRACTION (structural)
  const { witnesses, structuralLegAvailable: legA } = extractWitnesses(node, fileToNodes, gxCall);

  // SIBLING HARVEST (structural)
  const harvest = harvestSiblings(node, witnesses, fileToNodes, gxCall);
  const structuralLegAvailable = legA || harvest.structuralLegAvailable;

  // BUILD sibling records, grade + gate via the SHARED model.
  const matchedRecords = [];
  const sublog = [];
  let suppressed = 0;
  for (const rec of harvest.byNode.values()) {
    const siblingNode = graph.nodes.find((n) => n.id === rec.nodeId);
    const witnessNames = [...rec.witnesses].sort();
    // Axis-2 mechanism-signature: structural (witness-anchored), not lexical name-token theater.
    const mech = classifyForSibling(rec.file, witnessNames);
    const pattern = mech.verb; // verb string preserved as the cooldown / backlog key (back-compat)

    // Graceful degrade (severity-laundering guard): if the structural leg is DOWN, this would-be
    // structural sibling cannot be presented as structurally corroborated -> route through lexical,
    // tag structuralUnavailable, and it will fall below the floor + suppress (never promoted).
    let surface = EVIDENCE_KIND.STRUCTURAL;
    let structuralUnavailable = false;
    if (!structuralLegAvailable) {
      surface = EVIDENCE_KIND.LEXICAL;
      structuralUnavailable = true;
    }
    // A per-record lexical nominee (query recall, no confirmed call edge — harvestSiblings tagged
    // rec.mismatch) is ALSO structurally-unavailable for THIS node even when the leg is up overall.
    if (rec.mismatch) structuralUnavailable = true;
    // Red-team #3: a sibling we cannot structurally confirm (leg down, or a lexical-only nominee)
    // must not advertise a HIGH mechanism verdict (incl. symbol-anchor) — that would read "HIGH
    // symbol-anchor" next to an unconfirmed/lexical sibling. Demote the REPORTED mechanism confidence
    // to MED in that case; verb + provenance are kept, only the confidence is capped.
    const mechView = structuralUnavailable && mech.confidence === 'HIGH'
      ? { ...mech, confidence: 'MED', structuralUnconfirmed: true }
      : mech;
    const graded = structuralLegAvailable
      ? rec.best
      : scoreHit({ surface, lexicalScore: 0.85 });
    if (!graded) { suppressed += 1; continue; }

    const provenance = { evidenceKind: graded.evidenceKind, confidence: graded.confidence };
    if (graded.stale) provenance.stale = true;
    if (structuralUnavailable) provenance.structuralUnavailable = true;
    // Carry the honest mismatch so gateHit surfaces an unconfirmed nominee at its low confidence
    // WITH the named reason, instead of silently dropping it (and never as 0.97 structural).
    if (rec.mismatch) provenance.mismatch = String(rec.mismatch).slice(0, 200);

    const structuralRecord = graded.evidenceKind === EVIDENCE_KIND.STRUCTURAL && !rec.mismatch;
    const hit = {
      path: rec.file,
      surface: 'propagation-sibling',
      snippet:
        `mechanism-sibling node "${rec.nodeId}" of "${node.id}" — shares ` +
        `${structuralRecord ? 'structural' : 'lexical (unconfirmed)'} witness(es): ` +
        `${witnessNames.join(', ')} [${pattern}/${mechView.provenance}/${mechView.confidence}` +
        `${mechView.antiWitness ? '/ANTI-WITNESS' : ''}]`.slice(0, 240),
      score: graded.confidence,
      provenance,
    };
    const gate = gateHit(hit);
    matchedRecords.push({
      nodeId: rec.nodeId,
      node: siblingNode,
      file: rec.file,
      witnesses: witnessNames,
      pattern,
      mechanism: mechView, // axis-2 (confidence capped to MED if structurally unconfirmed — red-team #3)
      confidence: graded.confidence,
      hit,
      surfaced: gate.surfaced,
      gateReason: gate.reason || null,
    });
    if (!gate.surfaced) {
      suppressed += 1;
      sublog.push({ nodeId: rec.nodeId, confidence: graded.confidence, reason: gate.reason });
    }
  }

  // (c) confidence floor + sort. matched = ALL discovered above-gate; surfaced = those that pass.
  const surfacedRecords = matchedRecords
    .filter((r) => r.surfaced && r.confidence >= XREF_PROVENANCE_KNOBS.confidenceFloor)
    .sort((a, b) => b.confidence - a.confidence || a.nodeId.localeCompare(b.nodeId));

  // HONEST-LEXICAL band — query-nominated siblings that gateHit ADMITTED (they carry a named
  // mismatch) but sit BELOW the 0.55 structural floor. These are NOT laundered to structural and NOT
  // written to the backlog; they are reported honestly so a spec sibling the index can only reach
  // lexically (the shintai case) is surfaced at its CORRECT lower confidence with the mismatch, never
  // dropped and never promoted to 0.97.
  const honestLexicalRecords = matchedRecords
    .filter((r) => r.surfaced && r.confidence < XREF_PROVENANCE_KNOBS.confidenceFloor)
    .sort((a, b) => b.confidence - a.confidence || a.nodeId.localeCompare(b.nodeId));

  const matchedCount = matchedRecords.length; // (e) N — every candidate that reached grading
  const surfacedCount = surfacedRecords.length; // (e) K — survivors above floor + gate

  // mechanism-pattern of THIS scan, for the 24h cooldown key. FORK 3 + red-team A/#7: key on the
  // first surfaced sibling whose verb is TRUSTED — neither a flagged lexical look-alike (antiWitness)
  // nor the catch-all 'unclassified-mechanism'. Checking only surfacedRecords[0] was wrong: if the top
  // record is antiWitness but a LOWER one carries a real verb, that verb's window must still be taken;
  // and 'unclassified-mechanism' as a literal key is SHARED across every unmatched node (one node's
  // scan would silently block another for 24h). Fall back to the node key only when no trusted verb.
  const trustedRecord = surfacedRecords.find(
    (r) => !r.mechanism?.antiWitness && r.pattern !== UNCLASSIFIED_MECHANISM,
  );
  const scanPattern = trustedRecord ? trustedRecord.pattern : `node:${nodeId}`;

  // (b) cooldown check — pattern scanned < 24h ago is skipped unless --force.
  const cooldown = readCooldown(cooldownPath);
  const onCooldown = !force && cooldownActive(cooldown, scanPattern, now);

  // top-K, paged (f).
  const tierLimit = Math.min(top, HARD_TIER);
  const visible = surfacedRecords.slice(0, tierLimit);
  const moreCount = Math.max(0, surfacedCount - visible.length);

  // (h) backlog write — proposals only, status=proposed, atomic. Skipped on cooldown / dry-run /
  // zero-surfaced. Each record passes the serialize-revalidate canary before it is written.
  let written = 0;
  let writeSkippedReason = null;
  if (dryRun) {
    writeSkippedReason = 'dry-run';
  } else if (onCooldown) {
    writeSkippedReason = `pattern "${scanPattern}" on 24h cooldown (last ${cooldown[scanPattern]})`;
  } else if (surfacedCount === 0) {
    writeSkippedReason = 'no surfaced siblings above floor';
  } else {
    const scanId = `prop-${now}-${crypto.randomBytes(3).toString('hex')}`;
    const records = surfacedRecords.map((r) => {
      // canary: serialize-revalidate the inner hit (closed schema) before composing the backlog row.
      const safeHit = serializeRevalidate(r.hit);
      return {
        schema: 'yuri.propagation-proposal.v0',
        scanId,
        status: 'proposed', // (h) owner-only transitions proposed -> accepted/rejected/stale
        createdAt: new Date(now).toISOString(),
        sourceNode: nodeId,
        siblingNode: r.nodeId,
        siblingFile: r.file,
        // FORK 3: an antiWitness record carries NO verified mechanism — its verb is a vocabulary
        // look-alike, so the durable transfer row reports `unclassified-mechanism` (never a confident
        // verb someone might transfer a cascade from). The original guess is preserved, clearly
        // labelled, so the routing is transparent and a human can promote it if it IS real.
        mechanismPattern: r.mechanism?.antiWitness ? 'unclassified-mechanism' : r.pattern,
        ...(r.mechanism?.antiWitness ? { mechanismLexicalGuess: r.pattern } : {}),
        // axis-2 mechanism-signature provenance (additive): how the verb was bound, and whether it
        // is a flagged vocabulary look-alike (antiWitness) rather than a true mechanism sibling.
        mechanismProvenance: r.mechanism?.provenance ?? 'none',
        mechanismConfidence: r.mechanism?.confidence ?? 'NONE',
        mechanismAntiWitness: r.mechanism?.antiWitness ?? false,
        ...(r.mechanism?.whyMightNotTransfer ? { mechanismCaveat: r.mechanism.whyMightNotTransfer } : {}),
        sharedWitnesses: r.witnesses,
        confidence: r.confidence,
        evidenceKind: safeHit.provenance.evidenceKind,
        structuralLegAvailable,
        matched: matchedCount,
        surfaced: surfacedCount,
      };
    });
    atomicAppendJsonl(backlogPath, records);
    written = records.length;
    // record cooldown only after a successful write.
    cooldown[scanPattern] = new Date(now).toISOString();
    writeCooldown(cooldown, cooldownPath);
  }

  return {
    ok: true,
    node: nodeId,
    nodeLabel: node.label || null,
    structuralLegAvailable,
    gitnexus: {
      available: structuralLegAvailable,
      stale: harvest.gitnexusStale,
      indexedCommit: harvest.staleInfo?.indexedCommit ? String(harvest.staleInfo.indexedCommit).slice(0, 8) : null,
      head: harvest.staleInfo?.head ? String(harvest.staleInfo.head).slice(0, 8) : null,
      repoPinned: LIVE_REPO_ROOT,
    },
    witnesses: witnesses.map((w) => w.name),
    matched: matchedCount,
    surfaced: surfacedCount,
    moreCount,
    writesExcluded: harvest.writesExcluded,
    lexicalRejected: harvest.lexicalRejected, // prose/data/protected query nominees hard-rejected
    suppressed,
    onCooldown,
    written,
    writeSkippedReason,
    backlogPath: normalizePath(backlogPath),
    knobs: XREF_PROVENANCE_KNOBS,
    siblings: visible.map((r) => ({
      nodeId: r.nodeId,
      file: r.file,
      confidence: r.confidence,
      evidenceKind: r.hit.provenance.evidenceKind,
      stale: !!r.hit.provenance.stale,
      structuralUnavailable: !!r.hit.provenance.structuralUnavailable,
      pattern: r.pattern,
      sharedWitnesses: r.witnesses,
    })),
    // honest sub-floor lexical band: spec siblings the index can only reach lexically, surfaced at
    // their CORRECT lower confidence with the named mismatch — NEVER laundered to structural/0.97.
    honestLexical: honestLexicalRecords.map((r) => ({
      nodeId: r.nodeId,
      file: r.file,
      confidence: r.confidence,
      evidenceKind: r.hit.provenance.evidenceKind,
      structuralUnavailable: !!r.hit.provenance.structuralUnavailable,
      mismatch: r.hit.provenance.mismatch || null,
      pattern: r.pattern,
      sharedWitnesses: r.witnesses,
    })),
    sublog,
  };
}

// ---- CLI ---------------------------------------------------------------------------------------
function run() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  let top = DEFAULT_TOP;
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--top' && argv[i + 1]) {
      top = Math.max(1, Math.min(50, parseInt(argv[++i], 10) || DEFAULT_TOP));
    } else if (argv[i] === '--json' || argv[i] === '--force' || argv[i] === '--dry-run') {
      /* flag */
    } else {
      parts.push(argv[i]);
    }
  }
  const nodeId = parts.join(' ').trim();
  const result = propagationScan(nodeId, { top, force, dryRun });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    // (g) fail-closed exit on node-not-found / error.
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (!result.ok) {
    console.log(`⬡ propagation-scan: ${result.error}`);
    if (result.knownNodeCount != null) {
      console.log(`  (graph has ${result.knownNodeCount} known nodes — re-check the node-id)`);
    }
    process.exitCode = 1; // (g)
    return;
  }

  const gx = result.gitnexus;
  const struct = result.structuralLegAvailable
    ? gx.stale
      ? `structural leg STALE (gitnexus behind HEAD; structural hits downranked)`
      : `structural leg FRESH (gitnexus indexed=${gx.indexedCommit} == head=${gx.head})`
    : `structural leg DOWN — siblings downgraded + suppressed, NOT presented as structural`;

  console.log(`⬡ propagation-scan "${result.node}"${result.nodeLabel ? `  (${result.nodeLabel})` : ''}`);
  console.log(`  ${struct}`);
  console.log(`  witnesses: ${result.witnesses.length ? result.witnesses.join(', ') : '(none extracted)'}`);
  // (e) matched=N surfaced=K — always visible.
  console.log(
    `  matched=${result.matched} surfaced=${result.surfaced}` +
      `  writes-excluded=${result.writesExcluded} lexical-rejected=${result.lexicalRejected} suppressed=${result.suppressed}\n`,
  );

  for (const s of result.siblings) {
    const flags = (s.stale ? ' STALE' : '') + (s.structuralUnavailable ? ' STRUCT-UNAVAIL' : '');
    console.log(`  [${s.evidenceKind} conf=${s.confidence.toFixed(3)}${flags}]  node=${s.nodeId}`);
    console.log(`    file: ${s.file}`);
    console.log(`    pattern: ${s.pattern}  witnesses: ${s.sharedWitnesses.join(', ')}\n`);
  }
  // (f) paged "(N-K) more", never a hard cap.
  if (result.moreCount > 0) console.log(`  ... (${result.moreCount} more surfaced sibling${result.moreCount === 1 ? '' : 's'} not shown; raise --top)\n`);

  // honest sub-floor lexical band — spec siblings reachable only lexically, at their CORRECT lower
  // confidence with the named mismatch (never laundered to 0.97 structural).
  if (result.honestLexical && result.honestLexical.length) {
    console.log(`  -- honest lexical band (${result.honestLexical.length} below-floor, NOT structural, NOT written) --`);
    for (const s of result.honestLexical.slice(0, 10)) {
      console.log(`  [${s.evidenceKind} conf=${s.confidence.toFixed(3)} STRUCT-UNAVAIL]  node=${s.nodeId}`);
      console.log(`    file: ${s.file}`);
      console.log(`    mismatch: ${s.mismatch}\n`);
    }
  }

  if (result.written > 0) {
    console.log(`  wrote ${result.written} proposal${result.written === 1 ? '' : 's'} (status=proposed) -> ${result.backlogPath}`);
  } else {
    console.log(`  no backlog write: ${result.writeSkippedReason}`);
  }

  if (result.sublog.length) {
    console.log(`\n  -- low-confidence sub-log (${result.sublog.length} suppressed) --`);
    // wave-2 R.16: diagnostic budget raised 10 → 50 (JSON output stays full).
    for (const s of result.sublog.slice(0, Math.min(50, result.sublog.length))) {
      console.log(`    ~ node=${s.nodeId}  conf=${s.confidence.toFixed(3)}  (${s.reason})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) run();
