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
  _atlasResolveModule = {
    resolve: (question, opts) => ({ paths: mod.resolve(question, opts) }),
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

const RESOLVERS = {
  xref: resolveXref,
  atlas: resolveAtlas,
  fastlex: resolveFastlex,
};

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

function score(benchmark, resolverFn, top) {
  let hit1 = 0;
  let hit3 = 0;
  let totalHops = 0;
  const perQuestion = [];
  for (const item of benchmark) {
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
    const h1 = !error && isHit(item.expect, paths, 1);
    const h3 = !error && isHit(item.expect, paths, 3);
    if (h1) hit1++;
    if (h3) hit3++;
    totalHops += hops;
    perQuestion.push({ id: item.id, q: item.q, hit1: h1, hit3: h3, hops, error, resolved: paths.slice(0, top) });
  }
  const n = benchmark.length;
  const hitAt1 = n ? hit1 / n : 0;
  const hitAt3 = n ? hit3 / n : 0;
  const meanHops = n ? totalHops / n : 0;
  const atlasScore = 0.6 * hitAt1 + 0.4 * hitAt3;
  return { atlasScore, hitAt1, hitAt3, meanHops, n, perQuestion };
}

function formatLine(r) {
  return `atlas_score: ${r.atlasScore.toFixed(4)}   hit@1: ${r.hitAt1.toFixed(4)}  hit@3: ${r.hitAt3.toFixed(4)}  mean_hops: ${r.meanHops.toFixed(2)}  n: ${r.n}`;
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
  return pass;
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

  if (args.resolver === 'atlas' && existsSync(ATLAS_CHECKPOINTS)) {
    try {
      await preloadAtlasResolver();
    } catch (e) {
      console.error(`atlas-score: failed to load atlas resolver: ${e.message}`);
      process.exit(1);
    }
  }

  if (args.resolver === 'fastlex') {
    try {
      await preloadFastlex();
    } catch (e) {
      console.error(`atlas-score: failed to load fastlex resolver: ${e.message}`);
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
