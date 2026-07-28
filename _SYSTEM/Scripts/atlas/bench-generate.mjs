#!/usr/bin/env node
// @capability: bench-generate
// @serves: L3 candidate question generation | verbatim third-party prose composition | deterministic seeded benchmark scaffolding
// @does: L3 of the n>=100 programmatic benchmark pipeline (Hermes assignment 2026-07-28): composes
//   CANDIDATE find questions from Phoenix's verbatim third-party semantic fragments (L1) + Atlas's
//   arithmetic allocation (L2) + the stratified pool (bench-pool). COMPOSITION, never authorship:
//   a question is a fixed interrogative FRAME (structural) with a slot filled by a VERBATIM
//   human-written fragment, unmodified. This tool may select and slot; it may never paraphrase,
//   summarize, or improve — the moment it rewrites a human sentence it has authored it, and it is
//   a measured lane. Deterministic: fixed seed, same inputs -> byte-identical output (asserted in
//   --test). No model calls anywhere in the generation path.
//   Pool candidates with NO usable source fragment are emitted as UNGENERATABLE with the reason —
//   the visible gap, never a silent drop (silent dropping is how the winnability filter got in).
//   Every candidate carries provenance {source_kind, source_path, source_line, frame_id} —
//   an unattributable question is unauditable and gets culled on sight.
// @use: node bench-generate.mjs [--sources=<path>] [--allocation=<path>] [--pool=<path>] [--out=<path>] [--test]
//   Defaults read bench-semantic-sources.json / bench-allocation.json / bench-pool.json from
//   _SYSTEM/state/atlas/ when present; --test runs on synthetic fixtures (no real inputs needed).
// @exports: FRAMES, generate, main

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE = path.join(REPO_ROOT, '_SYSTEM/state/atlas');
const DEFAULT_SOURCES = path.join(STATE, 'bench-semantic-sources.json');
const DEFAULT_ALLOC = path.join(STATE, 'bench-allocation.json');
const DEFAULT_POOL = path.join(STATE, 'bench-pool.json');
const DEFAULT_OUT = path.join(STATE, 'bench-candidates.jsonl');

const SEED = 1785240000; // fixed: same inputs -> byte-identical output, every lane, every run

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Interrogative frames — STRUCTURE ONLY. The verb register comes from the repo's own operational
 * question vocabulary (the existing benchmark's frames, generalized). Content never comes from
 * the frame; the frame_id is recorded per question for the G-FRAME-DIVERSITY gate.
 */
export const FRAMES = [
  { id: 'F1', text: 'where is {c} handled?' },
  { id: 'F2', text: 'what enforces {c}?' },
  { id: 'F3', text: 'what computes {c}?' },
  { id: 'F4', text: 'what guards {c}?' },
  { id: 'F5', text: 'what mediates {c}?' },
  { id: 'F6', text: 'what decides {c}?' },
  { id: 'F7', text: 'what aggregates {c}?' },
  { id: 'F8', text: 'what do I run to {c}?' },
  { id: 'F9', text: 'where does {c} live?' },
  { id: 'F10', text: 'which file owns {c}?' },
];

/**
 * generate({sources, allocation, pool}) — the composition pipeline.
 * sources:    [{ path, area, fragments: [{kind, source_path, source_line, text}] }]  (Phoenix L1)
 * allocation: [{ area, count, difficulty? }]                                          (Atlas L2; optional —
 *             absent -> every pool candidate is targeted once)
 * pool:       bench-pool.json shape (path, kind, fts_reachable, basename_unique, area)
 *
 * Returns { candidates: [...], ungeneratable: [...] }. Deterministic byte-identical for the same
 * inputs: seeded shuffle of fragments, round-robin frames (frame index from the seeded stream).
 */
export function generate({ sources, allocation, pool, seed = SEED }) {
  const rng = mulberry32(seed);
  const byPath = new Map();
  for (const s of sources) byPath.set(s.path, s);

  // Deterministic target list: allocation order if given, else pool order.
  const targets = [];
  if (allocation && allocation.length) {
    for (const a of allocation) {
      const members = pool.filter((p) => p.area === a.area);
      for (let i = 0; i < Math.min(a.count, members.length); i++) targets.push(members[i]);
    }
  } else {
    targets.push(...pool);
  }

  const candidates = [];
  const ungeneratable = [];
  for (const t of targets) {
    const src = byPath.get(t.path);
    const usable = src && Array.isArray(src.fragments) ? src.fragments.filter((f) => typeof f.text === 'string' && f.text.trim().length > 0) : [];
    if (usable.length === 0) {
      ungeneratable.push({ path: t.path, area: t.area, reason: src ? 'no usable fragments (all empty)' : 'no semantic source for path' });
      continue;
    }
    // Seeded fragment pick + frame pick.
    const frag = usable[Math.floor(rng() * usable.length)];
    const frame = FRAMES[Math.floor(rng() * FRAMES.length)];
    const content = frag.text.trim(); // VERBATIM. Selection and slotting only — never rewritten.
    candidates.push({
      id: null, // assigned after deterministic sort
      q: frame.text.replace('{c}', content),
      expect: [t.path],
      provenance: { source_kind: frag.kind, source_path: frag.source_path, source_line: frag.source_line, frame_id: frame.id },
      labels: { fts_reachable: t.fts_reachable, basename_unique: t.basename_unique, area: t.area },
    });
  }
  // Deterministic id assignment: sort by expect path, then q.
  candidates.sort((a, b) => a.expect[0].localeCompare(b.expect[0]) || a.q.localeCompare(b.q));
  candidates.forEach((c, i) => { c.id = `g${String(i + 1).padStart(3, '0')}`; });
  return { candidates, ungeneratable };
}

function runSelfTest() {
  let pass = true;
  const check = (name, cond) => {
    console.log(`[bench-generate --test] ${name}: ${cond ? 'PASS' : 'FAIL'}`);
    if (!cond) pass = false;
  };
  const pool = [
    { path: 'pkg/alpha.mjs', kind: 'mjs', fts_reachable: true, basename_unique: true, area: 'area-a' },
    { path: 'pkg/beta.mjs', kind: 'mjs', fts_reachable: false, basename_unique: true, area: 'area-a' },
    { path: 'pkg/gamma.mjs', kind: 'mjs', fts_reachable: true, basename_unique: true, area: 'area-b' },
  ];
  const sources = [
    { path: 'pkg/alpha.mjs', area: 'area-a', fragments: [{ kind: 'commit-message', source_path: 'git log', source_line: 42, text: 'retry queue backoff under contention' }] },
    { path: 'pkg/beta.mjs', area: 'area-a', fragments: [] },
  ];
  const r1 = generate({ sources, allocation: [], pool });
  const r2 = generate({ sources, allocation: [], pool });
  check('deterministic: byte-identical across runs', JSON.stringify(r1) === JSON.stringify(r2));
  check('ungeneratable bucket is VISIBLE with reason (never a silent drop)', r1.ungeneratable.length === 2 && r1.ungeneratable.every((u) => typeof u.reason === 'string'));
  check('candidates carry mandatory provenance', r1.candidates.every((c) => c.provenance && c.provenance.source_kind && c.provenance.frame_id && typeof c.provenance.source_line === 'number'));
  const alpha = r1.candidates.find((c) => c.expect[0] === 'pkg/alpha.mjs');
  check('question content is the VERBATIM fragment inside a fixed frame', alpha && alpha.q.includes('retry queue backoff under contention') && FRAMES.some((f) => alpha.q === f.text.replace('{c}', 'retry queue backoff under contention')));
  check('labels ride through from the pool', alpha && alpha.labels.fts_reachable === true);
  console.log(`[bench-generate --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--test')) {
    process.exitCode = runSelfTest() ? 0 : 1;
    return;
  }
  const arg = (name, dflt) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : dflt;
  };
  const sourcesPath = arg('sources', DEFAULT_SOURCES);
  const allocPath = arg('allocation', DEFAULT_ALLOC);
  const poolPath = arg('pool', DEFAULT_POOL);
  const outPath = arg('out', DEFAULT_OUT);

  if (!existsSync(sourcesPath)) {
    console.error(`bench-generate: semantic sources not found at ${sourcesPath} — Phoenix's L1 output. Nothing to compose.`);
    process.exitCode = 2;
    return;
  }
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  const allocation = existsSync(allocPath) ? JSON.parse(readFileSync(allocPath, 'utf8')) : [];
  const poolDoc = JSON.parse(readFileSync(poolPath, 'utf8'));
  const pool = Array.isArray(poolDoc) ? poolDoc : poolDoc.pool;

  const { candidates, ungeneratable } = generate({ sources, allocation, pool });
  writeFileSync(outPath, candidates.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8');
  console.log(`bench-generate: ${candidates.length} candidates -> ${outPath}`);
  console.log(`  ungeneratable (visible gap, not dropped): ${ungeneratable.length}`);
  for (const u of ungeneratable.slice(0, 10)) console.log(`    ${u.path} — ${u.reason}`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
