#!/usr/bin/env node
// @capability: bench-pool
// @serves: stratified benchmark candidate pool | n>=100 area-spread find set authoring input | provenance-safe answer candidates
// @does: generates the STRATIFIED CANDIDATE POOL for the owner-authored n>=100 find set
//   (owner-authorized 2026-07-28). Per balanced-menu area (135 areas, MAX_MEMBERS=400 split), up
//   to 2 answer candidates, EVENLY SPREAD across the area's path-sorted members (an alphabetical
//   head-slice systematically over-samples digits and early letters — deterministic is not the
//   same as representative). PROVENANCE GUARD: the pool contains paths, areas, kinds, and two
//   LABELS only — no serves/does text, no tag content, no descriptions.
//
//   LABELS, NOT FILTERS (Hermes construct-validity ruling 2026-07-28): fts_reachable and
//   basename_unique were briefly HARD FILTERS, which made a question whose answer BM25 cannot
//   reach structurally unaskable — a guaranteed 100% coverage ceiling for every lexical arm and
//   a benchmark pruned to winnable items, exactly what retrieval-validation-gates.md forbids
//   ('keep questions the system cannot currently win when they mark a real blind spot'). A file
//   missing from the index is a REAL navigation failure and must remain askable; a colliding
//   basename is where navigation is HARD, and the remedy is a more precise expect, not deleting
//   the question. Both are now emitted as annotations so the author can include blind spots
//   DELIBERATELY. Remaining hard filters, and why each passes the legitimate-vs-fraud test
//   without reference to what the system can currently do: existingAnswers (avoids duplicating
//   find-40) and PROTECTED_PREFIXES (protected paths are never valid answers).
//
//   STRATIFICATION JUSTIFICATION (corpus statistics alone): the balanced-menu areas are a
//   directory-derived partition chosen because 88% of corpus mass sat in two dir1 blobs — a
//   degenerate layout by mass, independent of any benchmark. CAVEAT: the pool's strata are the
//   axes of a navigation design that is itself under measurement; a future non-directory-aligned
//   design would be measured on a set laid out along this one's axes.
//   SEPARATION: question AUTHORING is an owner judgment (yuri-origin Loop Discipline); this tool
//   only stratifies the corpus so the authored set can be area-spread rather than 87.5% in one
//   tree like find-40 (measured: 35/40 answers in the _SYSTEM tree).
// @use: node bench-pool.mjs [--json] [--per-area=2]   -> writes _SYSTEM/state/atlas/bench-pool.json
// @exports: buildPool, main

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BENCHMARK = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
const INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const OUT_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/bench-pool.json');

const PROTECTED_PREFIXES = ['.env', 'node_modules/', 'backend/data/', '.amp/', '.git/'];

export async function buildPool({ perArea = 2 } = {}) {
  const menuMod = await import('./atlas-menu.mjs');
  const menu = menuMod.loadMenu();
  const nodes = menu.l1.nodes;

  const existingAnswers = new Set(
    readFileSync(BENCHMARK, 'utf8').trim().split('\n').map((l) => {
      const j = JSON.parse(l);
      return (j.expect || []).map((e) => String(e).replace(/^\.\//, '').replace(/\/+$/, ''));
    }).flat(),
  );

  // Basename uniqueness across the id-map (ambiguity = unanswerable).
  const basenameCount = new Map();
  for (const node of Object.values(nodes)) {
    if (!node || typeof node.path !== 'string') continue;
    const base = path.basename(node.path);
    basenameCount.set(base, (basenameCount.get(base) || 0) + 1);
  }

  // FTS reachability (the scorer's substrate).
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(INDEX_DB, { readonly: true });
  const ftsPaths = new Set(db.prepare('SELECT path FROM docs').all().map((r) => r.path));
  db.close();

  const pool = [];
  const perAreaStats = [];
  let excludedExisting = 0;
  let excludedProtected = 0;
  let labeledUnreachable = 0;
  let labeledNonUnique = 0;
  for (const area of [...menu.areas].sort((a, b) => b.members - a.members || a.id.localeCompare(b.id))) {
    const candidates = [];
    for (const memberId of area.memberIds) {
      const node = nodes[memberId];
      if (!node || typeof node.path !== 'string') continue;
      const p = node.path;
      const norm = p.replace(/^\.\//, '').replace(/\/+$/, '');
      if (existingAnswers.has(norm)) { excludedExisting++; continue; }
      if (PROTECTED_PREFIXES.some((pre) => norm.startsWith(pre))) { excludedProtected++; continue; }
      const base = path.basename(norm);
      const ftsReachable = ftsPaths.has(norm);
      const basenameUnique = basenameCount.get(base) === 1;
      if (!ftsReachable) labeledUnreachable++;
      if (!basenameUnique) labeledNonUnique++;
      // LABELS, NOT FILTERS — blind spots stay askable (see header ruling).
      candidates.push({ path: norm, kind: path.extname(norm).replace(/^\./, '') || 'no-ext', fts_reachable: ftsReachable, basename_unique: basenameUnique });
    }
    candidates.sort((a, b) => a.path.localeCompare(b.path));
    // Even spread across the sorted list, not a head-slice: every k-th element,
    // fully reproducible, no alphabetical skew.
    const picked = [];
    if (candidates.length <= perArea) {
      picked.push(...candidates);
    } else {
      const step = candidates.length / perArea;
      for (let i = 0; i < perArea; i++) picked.push(candidates[Math.floor(i * step)]);
    }
    perAreaStats.push({ area: area.id, members: area.members, eligible: candidates.length, picked: picked.length });
    for (const c of picked) pool.push({ ...c, area: area.id });
  }

  return {
    generated: new Date().toISOString(),
    provenance_guard: 'paths + areas + kinds + labels only; no serves/does text, no tag content, no descriptions',
    perArea,
    totalCandidates: pool.length,
    areasWithCandidates: perAreaStats.filter((s) => s.picked > 0).length,
    exclusions: { existingAnswer: excludedExisting, protectedPrefix: excludedProtected },
    labels: { fts_unreachable: labeledUnreachable, basename_non_unique: labeledNonUnique },
    areas: perAreaStats,
    pool,
  };
}

export function main(argv = process.argv.slice(2)) {
  const perArg = argv.find((a) => a.startsWith('--per-area='));
  const perArea = perArg ? parseInt(perArg.slice('--per-area='.length), 10) || 2 : 2;
  return buildPool({ perArea }).then((result) => {
    if (!existsSync(INDEX_DB)) throw new Error(`search index missing: ${INDEX_DB}`);
    writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');
    if (argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`bench-pool: ${result.totalCandidates} candidates across ${result.areasWithCandidates} areas (per-area=${perArea})`);
      console.log(`  wrote ${OUT_PATH}`);
      const dry = result.areas.filter((s) => s.picked === 0);
      if (dry.length) console.log(`  areas with ZERO eligible candidates: ${dry.length} (e.g. ${dry.slice(0, 3).map((d) => d.area).join(', ')})`);
      console.log(`  excluded (hard filters): existingAnswer=${result.exclusions.existingAnswer} protectedPrefix=${result.exclusions.protectedPrefix}`);
      console.log(`  labeled (kept, askable): fts_unreachable=${result.labels.fts_unreachable} basename_non_unique=${result.labels.basename_non_unique}`);
      console.log('  provenance guard: pool carries paths/areas/kinds/labels only — no serves/does, no tags, no descriptions');
    }
    return 0;
  }).catch((err) => {
    console.error(`bench-pool: ${err.message}`);
    return 1;
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().then((code) => { process.exitCode = code; });
