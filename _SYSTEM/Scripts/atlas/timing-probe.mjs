#!/usr/bin/env node
// @capability: atlas-timing-probe
// @serves: per-query latency measurement | resolver arm latency profile | latency budget evidence
// @does: measures WARM per-query latency for every retrieval-bakeoff arm through the SAME module
//   code paths the frozen scorer's arms call (retrieval-candidates.mjs + atlas-resolve.mjs) —
//   never a reimplementation. Emits per-question ms, mean, p95, max per arm as JSON. Read-only.
// @use: node timing-probe.mjs [--json] — latency is a first-class objective in the bakeoff and a
//   rejecting constraint in atlas-loop; accuracy without latency is half a result.
// @exports: measureArmLatency, main

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BENCHMARK = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
const ENRICHED_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.enriched.db');

export async function measureArmLatency({ questions = null, findOnly = true } = {}) {
  let bench = (questions || readFileSync(BENCHMARK, 'utf8').trim().split('\n').map((l) => JSON.parse(l)))
    .map((b) => (typeof b === 'string' ? { q: b, type: 'find' } : { q: b.q ?? b.question, type: b.type || 'find' }));
  // Post-retraction doctrine: locate/enter are EXPLORATORY-CONTAMINATED and
  // never feed acceptance numbers. find-only is the default; callers wanting
  // the contaminated types for diagnostics pass findOnly:false explicitly.
  if (findOnly) bench = bench.filter((b) => b.type === 'find');
  bench = bench.filter((b) => typeof b.q === 'string' && b.q.length > 0);
  if (bench.length === 0) throw new Error('timing-probe: zero measurable questions after filtering (check findOnly/type shape of supplied questions)');
  const cand = await import('./retrieval-candidates.mjs');
  const atlasMod = await import('./atlas-resolve.mjs');

  const baseStmt = await cand.openFastlexStmt();
  const enrichedStmt = await cand.openFastlexStmt(ENRICHED_DB);
  const synLayer = cand.buildSynonymLayer();
  const atlas = atlasMod.loadAtlas();

  const arms = {
    // The Atlas resolver the loop actually regenerates — the latency budget's primary subject.
    'atlas': (q) => ({ paths: atlasMod.resolve(q, { top: 5 }, atlas) }),
    'fastlex': (q) => cand.fastlexQuery(baseStmt, q, 5),
    'fastlex-split': (q) => cand.fastlexQuery(baseStmt, q, 5, cand.splitIdentifierTerms),
    'fastlex-syns': (q) => cand.fastlexQuery(baseStmt, q, 5, (x) => cand.expandQueryTerms(x, synLayer)),
    'enriched': (q) => cand.fastlexQuery(enrichedStmt, q, 5),
    'enriched-split': (q) => cand.fastlexQuery(enrichedStmt, q, 5, cand.splitIdentifierTerms),
    'rerank': (q) => {
      const recall = cand.fastlexQuery(baseStmt, q, 50).paths;
      return { paths: atlasMod.resolveAmong(q, recall, { top: 5 }, atlas) };
    },
  };

  const out = {};
  for (const [name, fn] of Object.entries(arms)) {
    const times = [];
    for (const { q } of bench) {
      const t0 = performance.now();
      fn(q);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95Idx = Math.max(0, Math.min(times.length - 1, Math.floor(times.length * 0.95) - 1));
    out[name] = {
      per_query_ms: times.map((t) => Number(t.toFixed(2))),
      mean_ms: Number((times.reduce((a, c) => a + c, 0) / times.length).toFixed(2)),
      p95_ms: Number(times[p95Idx].toFixed(2)),
      max_ms: Number(times[times.length - 1].toFixed(2)),
      n: times.length,
    };
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const findOnly = !argv.includes('--all-types');
  return measureArmLatency({ findOnly }).then((r) => {
    if (argv.includes('--json')) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`(find-only=${findOnly}; pass --all-types to include exploratory locate/enter as diagnostics)`);
      for (const [name, v] of Object.entries(r)) {
        console.log(`${name.padEnd(16)} mean=${String(v.mean_ms).padEnd(7)}ms p95=${String(v.p95_ms).padEnd(7)}ms max=${v.max_ms}ms n=${v.n}`);
      }
    }
    return 0;
  }).catch((err) => {
    console.error(`timing-probe: ${err.message}`);
    return 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
