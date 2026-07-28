#!/usr/bin/env node
// @capability: atlas-score
// @serves: measure navigation quality | frozen evaluator | benchmark a resolver against known-good destinations
// @does: reads _SYSTEM/eval/atlas-benchmark.jsonl, runs a pluggable resolver per question, computes hit@1/hit@3/mean_hops/atlas_score
// @use: reach for this instead of writing a new ad-hoc navigation benchmark harness
// @exports: main
//
// atlas-score.mjs — FROZEN EVALUATOR (do not edit as part of the loop it grades)
//
// Modelled on karpathy/autoresearch's prepare.py: the metric-computer is off-limits to the
// optimizing agent. An agent that can edit its own scorer will optimize the scorer, not the
// system. Keep this file simple, deterministic, and boring on purpose:
//   - no cleverness
//   - no model calls
//   - no adaptive thresholds
//   - no reading of the loop's proposal, diff, git state, or reasoning (see ISOLATION below)
//
// ---------------------------------------------------------------------------------------------
// SCORING DEFINITION (the only place this is defined — do not restate elsewhere and drift)
// ---------------------------------------------------------------------------------------------
//   hit@k       = fraction of benchmark questions where ANY path in `expect` appears among the
//                 resolver's top-k returned paths (order within top-k does not matter).
//   mean_hops   = mean number of resolver calls needed per question. A resolver that answers in
//                 one shot contributes 1. A resolver interface that supports multi-hop lookups
//                 (not implemented by the built-in resolvers below) would report >1.
//   atlas_score = 0.6 * hit@1 + 0.4 * hit@3
//                 Deliberately simple and stable — a scalar for tracking trend over time, not a
//                 precision instrument. Do not add extra terms without updating this comment AND
//                 the owner's expectation of what "the number" means.
//
// ---------------------------------------------------------------------------------------------
// ISOLATION RULE (load-bearing — do not violate)
// ---------------------------------------------------------------------------------------------
//   This scorer reads ONLY:
//     1. the benchmark file (_SYSTEM/eval/atlas-benchmark.jsonl, or --benchmark=<path>)
//     2. the resolver's own output (stdout of a subprocess, or a JSON checkpoint file)
//   It must NEVER read the optimizing loop's proposal, diff, commit message, or reasoning trace.
//   A verifier that knows what it is grading grades intent instead of result. If you find
//   yourself wanting to pass "context" into the resolver about what changed, stop — that is the
//   exact failure mode this rule exists to prevent.
//
// ---------------------------------------------------------------------------------------------
// USAGE
// ---------------------------------------------------------------------------------------------
//   node _SYSTEM/eval/atlas-score.mjs [--resolver=xref|atlas] [--benchmark=<path>] [--json] [--top=N]
//   node _SYSTEM/eval/atlas-score.mjs --self-check
//   node _SYSTEM/eval/atlas-score.mjs --help

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BENCHMARK = path.join(__dirname, 'atlas-benchmark.jsonl');
const ATLAS_CHECKPOINTS = path.join(REPO_ROOT, '_SYSTEM/state/atlas/checkpoints.json');

function parseArgs(argv) {
  const args = { resolver: 'xref', benchmark: DEFAULT_BENCHMARK, json: false, top: 5, selfCheck: false, help: false };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') args.help = true;
    else if (raw === '--json') args.json = true;
    else if (raw === '--self-check') args.selfCheck = true;
    else if (raw.startsWith('--resolver=')) args.resolver = raw.slice('--resolver='.length);
    else if (raw.startsWith('--benchmark=')) args.benchmark = raw.slice('--benchmark='.length);
    else if (raw.startsWith('--top=')) args.top = parseInt(raw.slice('--top='.length), 10) || 5;
    else {
      // FAIL LOUD on unrecognized argv FORMS (2026-07-28 defect): the previous silent
      // ignore meant `--resolver menu` (space-separated) discarded the flag and ran
      // the DEFAULT arm — xref at ~32.5s/query, ~27 minutes of silence that looks
      // exactly like a hang. A typo must cost a second, not half an hour.
      // Scope: unknown FORMS only. Resolver-NAME validation stays with RESOLVERS /
      // ARM_STATUS (single source of truth for what an arm is and its status).
      console.error(`atlas-score: unrecognized argument "${raw}". Accepted forms: --resolver=<arm> --benchmark=<path> --top=N --json --self-check --help`);
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`atlas-score.mjs — frozen evaluator for YURI navigation quality

USAGE:
  node _SYSTEM/eval/atlas-score.mjs [--resolver=xref|atlas] [--benchmark=<path>] [--json] [--top=N]
  node _SYSTEM/eval/atlas-score.mjs --self-check
  node _SYSTEM/eval/atlas-score.mjs --help

FLAGS:
  --resolver=xref|atlas   which resolver answers the benchmark questions (default: xref)
  --benchmark=<path>      override the benchmark jsonl (default: _SYSTEM/eval/atlas-benchmark.jsonl)
  --top=N                 how many results per question to request from the resolver (default: 5)
  --json                  emit machine-readable JSON instead of the one-line summary
  --self-check            run the scorer against deliberately WRONG answers, assert score ~= 0
  --help                  this message

SCORING:
  hit@k       = fraction of questions where any expect[] path is in the resolver's top-k
  atlas_score = 0.6 * hit@1 + 0.4 * hit@3
  mean_hops   = mean resolver calls per question (1 for the built-in single-shot resolvers)

ISOLATION: reads ONLY the benchmark file and the resolver's own output. Never the loop's
proposal, diff, git state, or reasoning. See header comment for the full rule.
`);
}

function loadBenchmark(benchmarkPath) {
  if (!existsSync(benchmarkPath)) {
    throw new Error(`benchmark not found: ${benchmarkPath}`);
  }
  const lines = readFileSync(benchmarkPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      throw new Error(`benchmark line ${i + 1} is not valid JSON: ${e.message}`);
    }
    if (!obj.id || !obj.q || !Array.isArray(obj.expect)) {
      throw new Error(`benchmark line ${i + 1} missing required fields (id, q, expect[])`);
    }
    return obj;
  });
}

// ---------------------------------------------------------------------------------------------
// RESOLVERS — pluggable. Each resolver takes (question, top) and returns
//   { paths: string[], hops: number }
// paths is an ORDERED list of repo-relative path guesses (best first). hops is how many
// resolver calls it took (1 for every resolver below; a future multi-hop resolver may report >1).
// ---------------------------------------------------------------------------------------------

function resolveXref(question, top) {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, '_SYSTEM/Scripts/xref-query.mjs'), question, '--json', '--top', String(top)],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.status !== 0 && !result.stdout) {
    throw new Error(`xref-query.mjs failed (exit ${result.status}): ${result.stderr?.slice(0, 500) || 'no stderr'}`);
  }
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch (e) {
    throw new Error(`xref-query.mjs did not emit valid JSON: ${e.message}`);
  }
  const merged = Array.isArray(data.merged) ? data.merged : [];
  const seen = new Set();
  const paths = [];
  for (const entry of merged) {
    const p = entry && entry.path;
    if (typeof p === 'string' && p.length && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
      if (paths.length >= top) break;
    }
  }
  return { paths, hops: 1 };
}

let _atlasResolveModule = null;

function resolveAtlas(question, top) {
  if (!existsSync(ATLAS_CHECKPOINTS)) {
    const err = new Error('atlas artifacts not built yet');
    err.exitCode = 2;
    throw err;
  }
  if (!_atlasResolveModule) {
    // Loaded lazily via dynamic import kept synchronous-looking through a cached promise result;
    // resolver functions in this file are called synchronously, so we resolve the module once
    // up front in main() before scoring starts (see main()).
    throw new Error('atlas resolver module not preloaded — call preloadAtlasResolver() first');
  }
  const { paths } = _atlasResolveModule.resolve(question, { top });
  return { paths, hops: 1 };
}

async function preloadAtlasResolver() {
  if (_atlasResolveModule) return;
  const mod = await import(path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/atlas-resolve.mjs'));
  const atlas = mod.loadAtlas();
  _atlasResolveModule = {
    resolve: (question, opts) => ({ paths: mod.resolve(question, opts) }),
    resolveAmong: (question, candidates, opts) => mod.resolveAmong(question, candidates, opts, atlas),
  };
}

// FASTLEX — bounded BM25 over the FTS5 corpus, single in-process connection, no fusion.
//
// Added 2026-07-28 as a THIRD ARM, not as a scoring change. Nothing about how questions are asked
// or how hits are counted is touched; this only gives `--resolver=` another candidate to compare.
// The justification stands without reference to which questions currently fail, which is the test
// for a legitimate evaluator edit in yuri-origin.md -> Loop Discipline: measuring an additional
// candidate against a fixed metric is standard method, not tuning.
//
// WHY IT EXISTS: the entire Atlas project was premised on "xref costs ~17.5s per query, so a fast
// graph layer is required." That figure was cited all day and never decomposed. Profiled:
//   bare node process        111 ms
//   module import             48 ms
//   FTS5 db open              12 ms
//   FTS5 with LIMIT 50       247 ms
//   FTS5 UNLIMITED         5,249 ms   (ORDER BY rank over 23,008 matched rows, no LIMIT)
//   full xrefQuery        32,500 ms   and it does NOT amortize — q1/q2/q3 all ~32.5s in one process
// So xref is not slow because search is slow. Bounded BM25 was always available at sub-100ms.
//
// Deliberately minimal: tokenize, drop stopwords, OR the terms, LIMIT, dedupe by path. No graph,
// no fusion, no reranking. It is the floor a navigation layer has to beat to justify existing.
const FASTLEX_STOP = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'where', 'how', 'do', 'i', 'to',
  'in', 'of', 'for', 'and', 'or', 'that', 'this', 'it', 'my', 'we', 'our', 'before', 'after', 'which',
  'does', 'so', 'not', 'no', 'any', 'can', 'use', 'used', 'uses', 'run', 'get', 'got', 'me', 'you',
  'need', 'want', 'when', 'why', 'with', 'from', 'into', 'out', 'up', 'on', 'at', 'by']);
const FASTLEX_LIMIT = 50;
const INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
let _fastlexStmt = null;

async function preloadFastlex() {
  if (_fastlexStmt) return;
  if (!existsSync(INDEX_DB)) {
    const err = new Error(`search index not built at ${INDEX_DB} — run: node _SYSTEM/Scripts/yuri-search-index.mjs --full`);
    err.exitCode = 2;
    throw err;
  }
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(INDEX_DB, { readonly: true });
  _fastlexStmt = db.prepare('SELECT path, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?');
}

function resolveFastlex(question, top) {
  if (!_fastlexStmt) throw new Error('fastlex not preloaded — call preloadFastlex() first');
  const toks = String(question).toLowerCase().match(/[a-z0-9_.-]{3,}/g) || [];
  const terms = [...new Set(toks.filter((t) => !FASTLEX_STOP.has(t)))].map((t) => `"${t}"`);
  if (!terms.length) return { paths: [], hops: 1 };
  let rows = [];
  try {
    rows = _fastlexStmt.all(terms.join(' OR '), FASTLEX_LIMIT);
  } catch {
    // a malformed FTS5 MATCH expression yields no hits rather than aborting the whole run
    return { paths: [], hops: 1 };
  }
  const seen = new Set();
  const paths = [];
  for (const r of rows) {
    if (r && typeof r.path === 'string' && !seen.has(r.path)) {
      seen.add(r.path);
      paths.push(r.path);
      if (paths.length >= top) break;
    }
  }
  return { paths, hops: 1 };
}

// ---------------------------------------------------------------------------------------------
// BAKEOFF ARMS (2026-07-28 retrieval-structure bakeoff) — candidates C2/C4/C5/C6.
// Same sanction as the fastlex arm above: adding resolver ARMS changes no scoring math, no
// question, no hit rule. Every candidate's resolver LOGIC lives in
// _SYSTEM/Scripts/atlas/retrieval-candidates.mjs (+ resolveAmong in atlas-resolve.mjs for C4) so
// the arms here stay thin adapters and the timing probe measures the identical code path.
//   C2 fastlex-split  — identifier-aware query tokenization (camel/snake/kebab/dot splitting)
//   C4 rerank         — two-stage: BM25 recall@50, then Atlas's tier scorer reranks the 50
//   C5 enriched       — fastlex against an index variant with serves/does text merged INTO the
//                       FTS5 documents (index-side intent vocabulary instead of a second graph)
//   C6 fastlex-syns   — serves-phrase co-occurrence query expansion
// ---------------------------------------------------------------------------------------------
let _candidatesMod = null;
let _synLayer = null;
let _enrichedStmt = null;
const ENRICHED_INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.enriched.db');

async function preloadCandidates() {
  if (!_candidatesMod) {
    _candidatesMod = await import(path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/retrieval-candidates.mjs'));
  }
  return _candidatesMod;
}

function resolveFastlexSplit(question, top) {
  if (!_fastlexStmt) throw new Error('fastlex not preloaded — call preloadFastlex() first');
  return _candidatesMod.fastlexQuery(_fastlexStmt, question, top, _candidatesMod.splitIdentifierTerms);
}

async function preloadSynLayer() {
  if (_synLayer) return;
  await preloadCandidates();
  _synLayer = _candidatesMod.buildSynonymLayer();
}

function resolveFastlexSyns(question, top) {
  if (!_fastlexStmt) throw new Error('fastlex not preloaded — call preloadFastlex() first');
  if (!_synLayer) throw new Error('synonym layer not preloaded — call preloadSynLayer() first');
  return _candidatesMod.fastlexQuery(_fastlexStmt, question, top, (q) => _candidatesMod.expandQueryTerms(q, _synLayer));
}

async function preloadEnriched() {
  if (_enrichedStmt) return;
  await preloadCandidates();
  _enrichedStmt = await _candidatesMod.openFastlexStmt(ENRICHED_INDEX_DB);
}

function resolveEnriched(question, top) {
  if (!_enrichedStmt) throw new Error(`enriched index not preloaded (build: _SYSTEM/Scripts/atlas/build-enriched-index.mjs)`);
  return _candidatesMod.fastlexQuery(_enrichedStmt, question, top);
}

function resolveEnrichedSplit(question, top) {
  if (!_enrichedStmt) throw new Error(`enriched index not preloaded (build: _SYSTEM/Scripts/atlas/build-enriched-index.mjs)`);
  return _candidatesMod.fastlexQuery(_enrichedStmt, question, top, _candidatesMod.splitIdentifierTerms);
}

function resolveRerank(question, top) {
  if (!_fastlexStmt) throw new Error('fastlex not preloaded — call preloadFastlex() first');
  if (!_atlasResolveModule || !_atlasResolveModule.resolveAmong) {
    throw new Error('atlas resolver module not preloaded — call preloadAtlasResolver() first');
  }
  const recall = resolveFastlex(question, 50).paths;
  return { paths: _atlasResolveModule.resolveAmong(question, recall, { top }), hops: 1 };
}

// MENU — closed-vocabulary hierarchical area menu (atlas-menu.mjs). HYBRID DIAGNOSTIC arm:
// free-text query -> L1/L2 area selection -> scoped enter -> resolveAmong within the area.
// Measured for G6a degradation-slope comparison; the phrasing-invariance claim itself lives in
// the menu_list/menu_enter API and the selection-accuracy measurement, not in this arm.
let _menuMod = null;
async function preloadMenu() {
  if (_menuMod) return;
  _menuMod = await import(path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/atlas-menu.mjs'));
  _menuMod.loadMenu();
}

function resolveMenu(question, top) {
  if (!_menuMod) throw new Error('menu not preloaded — call preloadMenu() first');
  const r = _menuMod.menuResolve(question, { top });
  return { paths: r.paths, hops: 1 };
}

const RESOLVERS = {
  xref: resolveXref,
  atlas: resolveAtlas,
  fastlex: resolveFastlex,
  'fastlex-split': resolveFastlexSplit,
  'fastlex-syns': resolveFastlexSyns,
  enriched: resolveEnriched,
  'enriched-split': resolveEnrichedSplit,
  rerank: resolveRerank,
  menu: resolveMenu,
};

// ARM STATUS — a withdrawn arm is indistinguishable from a live one at the CLI, and
// `enriched-split` at 0.3950 still reads as the leader to anyone who runs the arms
// without the withdrawal context. Status therefore lives HERE, at the point of
// temptation, not only in doctrine and commit messages that nobody reads at the
// moment they type --resolver. ADVISORY ONLY: emits to stderr, never touches a score.
//
// live               usable candidate
// live-inert         runs correctly, changes no outcome on the current series
// dead               measured and lost; kept for the record, not a candidate
// withdrawn-contaminated  apparent gain traced to leakage. DO NOT RESURRECT.
// hybrid-diagnostic  measured for comparison; its claim is not this arm's atlas_score
const ARM_STATUS = {
  xref: ['live', 'fused 7-leg retrieval; 0.2550 on find-40 at ~32.5s/query'],
  atlas: ['live', 'spectral checkpoints; 0.0250'],
  fastlex: ['live', 'BASELINE 0.3450 @64ms — every delta is measured relative to this'],
  'fastlex-split': ['live-inert', 'identical per-question vector to fastlex on find-40 (40/40, diff=0). Measure for the record; spend no analysis until a series exists where split moves >=1 question'],
  'fastlex-syns': ['dead', '0.2150 vs 0.3450 baseline — synonym expansion loses outright'],
  enriched: ['withdrawn-contaminated', 'same leakage channel as enriched-split'],
  'enriched-split': ['withdrawn-contaminated', 'apparent 0.3950 was SELF-DESCRIPTION BOOST, not retrieval: G1 stratum null gave NONCAP n=19 delta 0.000, and G2 answer-node holdout collapsed it to exactly the 0.3450 baseline. The gain was injecting each answer\'s own @serves/@does card into that answer\'s own FTS body. DO NOT RESURRECT'],
  rerank: ['dead', '0.3100 vs 0.3450 at 2x latency, p~0.68 — a coin-flip reshuffle'],
  menu: ['hybrid-diagnostic', 'closed-vocabulary area selection; verdict PARKED pending an n>=100 area-spread set. 35/40 current find answers sit in one top-level area, so this series cannot discriminate any directory-aligned menu'],
};

// Fail loud if an arm is added without a status, or a status outlives its arm. Without
// this the map silently reverts to the unmarked state the moment someone adds arm #10 —
// which is how every inert marker in this repo got that way.
{
  const armKeys = Object.keys(RESOLVERS).sort();
  const statusKeys = Object.keys(ARM_STATUS).sort();
  if (armKeys.join('|') !== statusKeys.join('|')) {
    throw new Error(
      `atlas-score: ARM_STATUS is out of sync with RESOLVERS.\n`
      + `  arms without status: ${armKeys.filter((k) => !ARM_STATUS[k]).join(', ') || '(none)'}\n`
      + `  status without arm:  ${statusKeys.filter((k) => !RESOLVERS[k]).join(', ') || '(none)'}\n`
      + `  Every arm carries a status. Adding one is part of adding an arm.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// SCORING CORE
// ---------------------------------------------------------------------------------------------

function normalize(p) {
  return String(p).replace(/^\.\//, '').replace(/\/+$/, '');
}

function isHit(expectList, resultPaths, k) {
  const top = resultPaths.slice(0, k).map(normalize);
  const expectNorm = expectList.map(normalize);
  return top.some((p) => expectNorm.some((e) => p === e || p.endsWith('/' + e) || e.endsWith('/' + p)));
}

// QUESTION TYPES — expandable, deterministic, and fair across candidates.
//
// Added 2026-07-28. The original benchmark had exactly one shape: "what file does X?" with a single
// expected path. That shape can only ever reward a filename index, which is why the checkpoint layer
// scored identically under every region partition tested including a degenerate 77% blob — nothing
// ever asked it to do its distinctive job. Construct-validity repair, per yuri-origin.md ->
// Loop Discipline, which is why it terminates the score series and forces a re-baseline.
//
// SCORE-PRESERVING BY CONSTRUCTION. Every type returns a per-question score in [0,1] and the
// composite is their MEAN. For a `find` question that per-question score is 0.6*h1 + 0.4*h3, so
// when every question is `find` the mean is exactly 0.6*hit@1 + 0.4*hit@3 — algebraically identical
// to the previous formula. Adding types therefore cannot silently move the existing number; the
// 40-question corpus must still report 0.3450 for fastlex after this refactor, and that is asserted
// by re-running, not assumed.
//
// FAIRNESS RULE, and it is the one that keeps this honest: a question type must be answerable IN
// PRINCIPLE by every candidate. Adding a type only the graph layer can serve would rig the benchmark
// toward Atlas — the exact mirror image of deleting the questions Atlas fails. `locate` and `enter`
// both pass: a pure lexical resolver can attempt them by returning paths. `route` does NOT pass —
// it needs real traversal — so the schema supports it and NO route questions are added. If route
// questions are ever written, they must be reported as a SEPARATE number, never folded into a
// composite compared against non-graph candidates.
//
//   find    (default)  expect: [paths]       -> 0.6*hit@1 + 0.4*hit@3        "what file does X?"
//   locate             expect: [area prefix] -> 1.0 top-1, 0.5 within top-3  "what area am I in?"
//   enter              expect: [path set]    -> F1 of returned top-k vs set  "list the X in area Y"
//   route              expect: [node path]   -> DEFINED, NOT POPULATED (see fairness rule)

function scoreFind(item, paths) {
  const h1 = isHit(item.expect, paths, 1);
  const h3 = isHit(item.expect, paths, 3);
  return { value: 0.6 * (h1 ? 1 : 0) + 0.4 * (h3 ? 1 : 0), hit1: h1, hit3: h3 };
}

// An area is a path PREFIX (e.g. "_SYSTEM/Scripts/policy"). Any resolver that returns paths can be
// judged on it — no checkpoint structure required — which is what keeps the type candidate-neutral.
function scoreLocate(item, paths) {
  const areas = item.expect.map(normalize);
  const inArea = (p) => areas.some((a) => normalize(p) === a || normalize(p).startsWith(a + '/'));
  const top1 = paths.length > 0 && inArea(paths[0]);
  const top3 = paths.slice(0, 3).some(inArea);
  return { value: top1 ? 1 : (top3 ? 0.5 : 0), hit1: top1, hit3: top3 };
}

// Set retrieval scored by F1, because the right answer is a SET with no meaningful ranking — hit@k
// cannot express it. This is the actual fast-travel use case: "filter this region like a web shop."
function scoreEnter(item, paths, top) {
  const want = new Set(item.expect.map(normalize));
  const got = paths.slice(0, Math.max(top, want.size)).map(normalize);
  const gotSet = new Set(got);
  let tp = 0;
  for (const w of want) if (gotSet.has(w)) tp++;
  const precision = got.length ? tp / got.length : 0;
  const recall = want.size ? tp / want.size : 0;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  return { value: f1, hit1: tp > 0 && normalize(got[0] || '') && want.has(normalize(got[0])), hit3: tp > 0, precision, recall };
}

const TYPE_SCORERS = {
  find: scoreFind,
  locate: scoreLocate,
  enter: scoreEnter,
};

function score(benchmark, resolverFn, top) {
  let hit1 = 0;
  let hit3 = 0;
  let totalHops = 0;
  let valueSum = 0;
  const byType = {};
  const perQuestion = [];
  for (const item of benchmark) {
    const type = item.type || 'find';
    const scorer = TYPE_SCORERS[type];
    if (!scorer) throw new Error(`benchmark question ${item.id} has unknown type "${type}" (known: ${Object.keys(TYPE_SCORERS).join(', ')})`);
    let paths = [];
    let hops = 1;
    let error = null;
    try {
      const r = resolverFn(item.q, top);
      paths = r.paths || [];
      hops = r.hops || 1;
    } catch (e) {
      error = e.message;
    }
    const s = error ? { value: 0, hit1: false, hit3: false } : scorer(item, paths, top);
    const h1 = !!s.hit1;
    const h3 = !!s.hit3;
    if (h1) hit1++;
    if (h3) hit3++;
    valueSum += s.value;
    totalHops += hops;
    (byType[type] ||= { n: 0, sum: 0 });
    byType[type].n++;
    byType[type].sum += s.value;
    perQuestion.push({ id: item.id, q: item.q, type, value: s.value, hit1: h1, hit3: h3, hops, error, resolved: paths.slice(0, top) });
  }
  const n = benchmark.length;
  const hitAt1 = n ? hit1 / n : 0;
  const hitAt3 = n ? hit3 / n : 0;
  const meanHops = n ? totalHops / n : 0;
  const atlasScore = n ? valueSum / n : 0;
  const perType = {};
  for (const [t, v] of Object.entries(byType)) perType[t] = { n: v.n, score: v.n ? v.sum / v.n : 0 };
  return { atlasScore, hitAt1, hitAt3, meanHops, n, perType, perQuestion };
}

function formatLine(r) {
  const base = `atlas_score: ${r.atlasScore.toFixed(4)}   hit@1: ${r.hitAt1.toFixed(4)}  hit@3: ${r.hitAt3.toFixed(4)}  mean_hops: ${r.meanHops.toFixed(2)}  n: ${r.n}`;
  const types = Object.entries(r.perType || {});
  // Only append the per-type breakdown when the corpus is actually mixed — a single-type run
  // should print exactly what it printed before, so old output stays diffable.
  if (types.length <= 1) return base;
  const parts = types.map(([t, v]) => `${t} ${v.score.toFixed(4)} (n=${v.n})`).join('  ');
  return `${base}\n  by type: ${parts}`;
}

// ---------------------------------------------------------------------------------------------
// SELF-CHECK — a scorer that cannot fail is not a scorer. Feed it deliberately wrong answers
// (a resolver that always returns a bogus, non-existent path) and assert the score collapses
// toward zero. This is exercised on every --self-check run, not merely declared in a comment.
// ---------------------------------------------------------------------------------------------

function runSelfCheck(benchmark) {
  const wrongResolver = () => ({ paths: ['_SYSTEM/Scripts/definitely-not-the-answer.mjs', 'nowhere/nothing.md'], hops: 1 });
  const r = score(benchmark, wrongResolver, 5);
  const pass = r.atlasScore < 0.05 && r.hitAt1 === 0 && r.hitAt3 === 0;
  console.log(`[self-check] wrong-answer resolver -> ${formatLine(r)}`);
  console.log(`[self-check] expected: atlas_score < 0.05, hit@1 == 0, hit@3 == 0`);
  console.log(`[self-check] result: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) {
    process.exitCode = 1;
  }

  // parseArgs rejection probe (2026-07-28 defect): an unknown argv FORM must fail loud, never
  // silently fall back to the default xref arm. Space-separated `--resolver menu` is the exact
  // typo that once cost 27 silent minutes on the wrong resolver. Probed in a child process
  // because the rejection is (correctly) process-level.
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--resolver', 'menu'], { encoding: 'utf8', timeout: 15000 });
  const rejected = probe.status === 1 && /unrecognized argument/.test(String(probe.stderr || ''));
  console.log(`[self-check] parseArgs rejects unknown argv form (no silent xref fallback): ${rejected ? 'PASS' : 'FAIL'}`);
  if (!rejected) {
    process.exitCode = 1;
  }
  return pass && rejected;
}

// ---------------------------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let benchmark;
  try {
    benchmark = loadBenchmark(args.benchmark);
  } catch (e) {
    console.error(`atlas-score: ${e.message}`);
    process.exit(1);
  }

  if (args.selfCheck) {
    const pass = runSelfCheck(benchmark);
    process.exit(pass ? 0 : 1);
  }

  const resolverFn = RESOLVERS[args.resolver];
  if (!resolverFn) {
    console.error(`atlas-score: unknown resolver "${args.resolver}" (known: ${Object.keys(RESOLVERS).join(', ')})`);
    process.exit(1);
  }

  // Announce a non-live arm AT INVOCATION. A status nobody reads at the moment they
  // type --resolver is decoration; this fires when the arm actually runs. stderr only,
  // so it never contaminates the scalar on stdout.
  const [armState, armWhy] = ARM_STATUS[args.resolver];
  if (armState === 'withdrawn-contaminated' || armState === 'dead') {
    console.error(`atlas-score: WARNING — arm "${args.resolver}" is ${armState.toUpperCase()}.`);
    console.error(`  ${armWhy}`);
    console.error(`  Its score is reported for the record. It is NOT a promotion candidate.`);
  } else if (armState !== 'live') {
    console.error(`atlas-score: note — arm "${args.resolver}" is ${armState}: ${armWhy}`);
  }

  const PRELOADERS = {
    atlas: async () => { if (existsSync(ATLAS_CHECKPOINTS)) await preloadAtlasResolver(); },
    fastlex: preloadFastlex,
    'fastlex-split': async () => { await preloadFastlex(); await preloadCandidates(); },
    'fastlex-syns': async () => { await preloadFastlex(); await preloadSynLayer(); },
    enriched: preloadEnriched,
    'enriched-split': async () => { await preloadEnriched(); await preloadCandidates(); },
    rerank: async () => { await preloadFastlex(); await preloadCandidates(); await preloadAtlasResolver(); },
    menu: preloadMenu,
  };
  if (PRELOADERS[args.resolver]) {
    try {
      await PRELOADERS[args.resolver]();
    } catch (e) {
      console.error(`atlas-score: failed to load ${args.resolver} resolver: ${e.message}`);
      process.exit(e.exitCode || 1);
    }
  }

  let result;
  try {
    result = score(benchmark, resolverFn, args.top);
  } catch (e) {
    if (e && e.exitCode) {
      console.error(`atlas-score: ${e.message}`);
      process.exit(e.exitCode);
    }
    console.error(`atlas-score: resolver failed: ${e.message}`);
    process.exit(1);
  }

  // If every single question errored out at the resolver (e.g. atlas stub before checkpoints
  // exist), surface that as the resolver's own exit path rather than a fake 0.0000 score line.
  const allErrored = result.perQuestion.every((q) => q.error);
  if (allErrored && result.perQuestion.length) {
    const firstErr = result.perQuestion.find((q) => q.error);
    console.error(`atlas-score: ${firstErr.error}`);
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify({
      atlas_score: result.atlasScore,
      hit_at_1: result.hitAt1,
      hit_at_3: result.hitAt3,
      mean_hops: result.meanHops,
      n: result.n,
      resolver: args.resolver,
      per_question: result.perQuestion,
    }, null, 2));
  } else {
    console.log(formatLine(result));
  }
}

main().catch((e) => {
  console.error(`atlas-score: unhandled error: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
