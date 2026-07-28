#!/usr/bin/env node
// @capability: bench-validate
// @serves: benchmark ground-truth audit gate | leakage scan both channels | stratification and reachability report
// @does: validates an AUTHORED n>=100 find set against the three-clause rule (owner directive
//   2026-07-28) before anything is measured on it. Checks, in order:
//   1. SHAPE — n>=100, unique ids, single expect path per question, and FIND-ONLY: any non-find
//      type FAILS (locate/enter are exploratory-contaminated and the n>=100 brief is a find set;
//      a mixed set sneaks unmeasured types back in through the side door).
//   2. REACHABILITY — every expect path exists in the id-map corpus AND the FTS search index.
//      Unreachable = WARN (coverage ceiling; author decides — unwinnable questions are kept per
//      doctrine but must be marked, never silent).
//   3. LEAKAGE, BOTH CHANNELS (fail-closed):
//      (a) PATH channel — question text contains the answer's basename or a multi-segment path
//          fragment (the q037 'graduation ladder' class);
//      (b) ENRICHER channel — question shares DISTINCTIVE tokens with the answer's capability
//          card serves/does (distinctive = appears in <=5 of the cards, so a shared common word
//          cannot false-fire, while a shared rare phrase always fires);
//      (c) INDEXER channel (Channel S) — question shares >=2 tokens with the answer FILE'S OWN
//          in-source @capability/@serves/@does tag lines, which the base indexer already ingests
//          (Orion's residual channel: the circle re-forms through the indexer even with no
//          enricher run).
//   4. STRATIFICATION — answer spread across balanced-menu areas: reports area distribution and
//      FAILS if any single area holds >25% of answers (find-40's defect: 87.5% in one tree) or
//      if fewer than 8 areas are occupied (owner requirement 2026-07-28: the set must span at
//      least 8 areas). 8-19 occupied areas = WARN (thin but valid); >=20 = healthy spread.
//   5. PROVENANCE GATES (L4, Hermes assignment 2026-07-28) — for generated candidates, provenance
//      is MANDATORY: missing provenance = unauditable = FAIL.
//      G-SELF-REFERENCE: a question sharing even ONE distinctive token (corpus path-token df <= 25)
//      with its own answer's path segments, basename, or in-source tags = automatic FAIL. This is
//      the mechanized version of the retracted locate-leak class (q041/q042/q045: 'atlas' df=19,
//      'policy' df=16 — both under 25; structural tokens like 'system' df=2573 sit far above, so
//      the floor separates leak vocabulary from corpus structure by construction, not by taste).
//      G-FRAME-DIVERSITY: fewer than 5 distinct frames at n>=100, or one frame above 2x uniform
//      share (the point where a single phrasing dominates the variance estimate) = FAIL.
//      G-SOURCE-CONCENTRATION: one source_kind above 50% of the set = FAIL (majority-cap; a
//      dominant register measures register sensitivity, not navigation).
//   Exit 1 on any FAIL. Every check prints per-question evidence, never just a count.
// @use: node bench-validate.mjs <authored.jsonl> [--json] [--min-n=100]
// @exports: validateBenchmark, main

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FASTLEX_STOP } from './retrieval-candidates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CAPABILITIES_PATH = path.join(REPO_ROOT, '_SYSTEM/capabilities.json');
const INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const MIN_N = 100;
const MAX_AREA_SHARE = 0.25;
const MIN_AREAS_OCCUPIED_FAIL = 8; // owner requirement: at least 8 areas (hard floor)
const MIN_AREAS_OCCUPIED_WARN = 20; // below this the spread is thin but valid
const DISTINCTIVE_CARD_DF = 5; // a card token appearing in <=5 cards is distinctive
const SELF_REFERENCE_DF = 25; // corpus path-token df ceiling for G-SELF-REFERENCE (see header: leak class 16-19, structural >50)
const MIN_DISTINCT_FRAMES = 5; // at n>=100, fewer means phrasing samples, not questions
const MAX_FRAME_SHARE_MULTIPLE = 2; // >2x uniform share = one phrasing dominates the variance estimate
const MAX_SOURCE_KIND_SHARE = 0.5; // majority-cap: above this the set measures register, not navigation

function qTokens(text) {
  return new Set((String(text).toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []).filter((t) => !FASTLEX_STOP.has(t)));
}

function tagTokens(text) {
  // in-source tag lines only (@capability/@serves/@does/@use/@exports blocks)
  const toks = new Set();
  for (const line of String(text).split('\n')) {
    if (/^\s*(?:\/\/|#|\*)\s*@(capability|serves|does|use|exports)/.test(line)) {
      for (const t of line.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) {
        if (!FASTLEX_STOP.has(t)) toks.add(t);
      }
    }
  }
  return toks;
}

export async function validateBenchmark(filePath, { minN = MIN_N } = {}) {
  const failures = [];
  const warnings = [];
  const evidence = [];
  let unreachable = 0;

  const items = readFileSync(filePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  // 1. SHAPE
  if (items.length < minN) failures.push(`n=${items.length} < ${minN}`);
  const ids = new Set();
  const promptByNorm = new Map(); // normalized prompt -> first id (duplicate-prompt check)
  for (const it of items) {
    if (ids.has(it.id)) failures.push(`duplicate id: ${it.id}`);
    ids.add(it.id);
    if (typeof it.q !== 'string' || it.q.trim().length === 0) {
      failures.push(`${it.id}: missing or blank question text (never coerced to "undefined")`);
    } else {
      const normQ = it.q.toLowerCase().replace(/\s+/g, ' ').trim();
      if (promptByNorm.has(normQ)) {
        failures.push(`duplicate prompt (normalized): ${it.id} collides with ${promptByNorm.get(normQ)} — "${normQ.slice(0, 80)}"`);
      } else {
        promptByNorm.set(normQ, it.id);
      }
    }
    if (!Array.isArray(it.expect) || it.expect.length !== 1) failures.push(`${it.id}: expect must be a single path (got ${JSON.stringify(it.expect)})`);
    if (it.type && it.type !== 'find') failures.push(`${it.id}: non-find type "${it.type}" — this set is FIND-ONLY by design (locate/enter are exploratory-contaminated; no mixed types)`);
  }

  // Load corpora.
  const menuMod = await import('./atlas-menu.mjs');
  const menu = menuMod.loadMenu();
  const nodes = menu.l1.nodes;
  const areaOfNode = new Map();
  for (const a of menu.areas) for (const id of a.memberIds) areaOfNode.set(id, a.id);
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(INDEX_DB, { readonly: true });
  const ftsStmt = db.prepare('SELECT 1 FROM docs WHERE path = ? LIMIT 1');
  const caps = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  const capEntries = Array.isArray(caps && caps.capabilities) ? caps.capabilities : [];
  const capByMech = new Map();
  const cardDf = new Map();
  for (const c of capEntries) {
    const mech = typeof c.mechanism === 'string' ? c.mechanism.replace(/^\.\//, '') : null;
    if (!mech) continue;
    if (!capByMech.has(mech)) capByMech.set(mech, { serves: new Set(), does: new Set() });
    for (const s of Array.isArray(c.serves) ? c.serves : []) capByMech.get(mech).serves.add(s);
    if (typeof c.does === 'string') capByMech.get(mech).does.add(c.does);
  }
  for (const agg of capByMech.values()) {
    const toks = new Set();
    for (const s of [...agg.serves, ...agg.does]) for (const t of s.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) toks.add(t);
    for (const t of toks) cardDf.set(t, (cardDf.get(t) || 0) + 1);
  }

  // Corpus path-token df (for G-SELF-REFERENCE distinctiveness) — computed once per run.
  const pathTokenDf = new Map();
  for (const n of Object.values(nodes)) {
    if (!n || typeof n.path !== 'string') continue;
    const toks = new Set(n.path.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
    for (const t of toks) pathTokenDf.set(t, (pathTokenDf.get(t) || 0) + 1);
  }

  for (const it of items) {
    const expect = String(it.expect?.[0] || '').replace(/^\.\//, '').replace(/\/+$/, '');
    const qt = qTokens(it.q);

    // PROVENANCE presence — ALL FOUR fields mandatory for every question (an unattributable
    // question is unauditable and gets culled on sight; partial provenance is partial auditability).
    const p = it.provenance;
    const provenanceOk = p && typeof p === 'object'
      && typeof p.source_kind === 'string' && p.source_kind.length > 0
      && typeof p.source_path === 'string' && p.source_path.length > 0
      && typeof p.source_line === 'number' && Number.isFinite(p.source_line)
      && typeof p.frame_id === 'string' && p.frame_id.length > 0;
    if (!provenanceOk) {
      failures.push(`${it.id}: missing mandatory provenance {source_kind, source_path, source_line, frame_id} — all four required, partial provenance is partial auditability`);
    }

    // G-SELF-REFERENCE: no distinctive token (df <= 25) shared with the answer's own path segments
    // or basename. This is the mechanized locate-leak (q041/q042/q045) class.
    const segs = expect.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    const selfHits = [...qt].filter((t) => segs.includes(t) && (pathTokenDf.get(t) || 0) <= SELF_REFERENCE_DF && !['mjs', 'json', 'jsonl', 'yaml', 'ts', 'tsx', 'jsx', 'py'].includes(t));
    if (selfHits.length > 0) {
      failures.push(`${it.id}: G-SELF-REFERENCE — question shares distinctive token(s) [${selfHits.join(', ')}] with its own answer's path (automatic fail; the retracted locate-leak class)`);
    }

    // 2. REACHABILITY
    const nodeId = menu.l1.pathToId.get(expect);
    const inFts = !!ftsStmt.get(expect);
    if (!nodeId || !inFts) {
      unreachable++;
      warnings.push(`${it.id}: answer ${expect} unreachable (id-map=${!!nodeId}, fts=${inFts}) — coverage ceiling; kept per doctrine, marked`);
    }

    // 3a. PATH leakage
    const base = path.basename(expect).toLowerCase();
    const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '');
    const qLower = String(it.q).toLowerCase();
    if ((baseNoExt.length >= 3 && qLower.includes(baseNoExt)) || qLower.includes(expect.toLowerCase())) {
      failures.push(`${it.id}: PATH-CHANNEL leak — question contains answer basename/path ("${baseNoExt}")`);
    }

    // 3b. ENRICHER channel (capability card serves/does)
    const card = capByMech.get(expect);
    if (card) {
      const cardToks = new Set();
      for (const s of [...card.serves, ...card.does]) for (const t of s.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) cardToks.add(t);
      const shared = [...qt].filter((t) => cardToks.has(t) && (cardDf.get(t) || 99) <= DISTINCTIVE_CARD_DF);
      if (shared.length > 0) {
        failures.push(`${it.id}: ENRICHER-CHANNEL leak — question shares distinctive card token(s) [${shared.join(', ')}] with the answer's capability card (provenance-undecidable overlap; the 2026-07-28 enrichment lesson)`);
      }
    }

    // 3c. INDEXER channel (answer file's own in-source tags)
    const abs = path.join(REPO_ROOT, expect);
    if (existsSync(abs) && /\.(mjs|js|ts|py|sh|md)$/.test(expect)) {
      let src = '';
      try { src = readFileSync(abs, 'utf8').slice(0, 8000); } catch { /* unreadable -> no tags */ }
      const tt = tagTokens(src);
      const sharedS = [...qt].filter((t) => tt.has(t) && !['capability', 'serves', 'does', 'exports'].includes(t));
      if (sharedS.length >= 2) {
        failures.push(`${it.id}: INDEXER-CHANNEL (Channel S) leak — question shares ${sharedS.length} token(s) [${sharedS.join(', ')}] with the answer file's own @serves/@does tag lines`);
      }
    }

    evidence.push({ id: it.id, expect, area: areaOfNode.get(nodeId) || null });
  }
  db.close();

  // G-FRAME-DIVERSITY + G-SOURCE-CONCENTRATION (provenance-driven)
  const frameCounts = new Map();
  const kindCounts = new Map();
  for (const it of items) {
    if (it.provenance?.frame_id) frameCounts.set(it.provenance.frame_id, (frameCounts.get(it.provenance.frame_id) || 0) + 1);
    if (it.provenance?.source_kind) kindCounts.set(it.provenance.source_kind, (kindCounts.get(it.provenance.source_kind) || 0) + 1);
  }
  if (items.length >= minN && frameCounts.size > 0) {
    if (frameCounts.size < MIN_DISTINCT_FRAMES) {
      failures.push(`G-FRAME-DIVERSITY: only ${frameCounts.size} distinct frames at n=${items.length} (< ${MIN_DISTINCT_FRAMES}) — phrasing samples, not independent questions`);
    }
    const topFrame = [...frameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const uniform = items.length / frameCounts.size;
    if (topFrame[1] > MAX_FRAME_SHARE_MULTIPLE * uniform) {
      failures.push(`G-FRAME-DIVERSITY: frame "${topFrame[0]}" holds ${topFrame[1]}/${items.length} (> ${MAX_FRAME_SHARE_MULTIPLE}x uniform ${uniform.toFixed(1)}) — one phrasing dominates the variance estimate`);
    }
  }
  if (items.length >= minN && kindCounts.size > 0) {
    const topKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topKind[1] / items.length > MAX_SOURCE_KIND_SHARE) {
      failures.push(`G-SOURCE-CONCENTRATION: source kind "${topKind[0]}" holds ${(100 * topKind[1] / items.length).toFixed(0)}% of the set (> ${MAX_SOURCE_KIND_SHARE * 100}%) — measures register sensitivity, not navigation`);
    }
  }

  // 4. STRATIFICATION
  const areaDist = new Map();
  let unassigned = 0;
  for (const e of evidence) {
    if (!e.area) { unassigned++; continue; }
    areaDist.set(e.area, (areaDist.get(e.area) || 0) + 1);
  }
  const topArea = [...areaDist.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topArea && topArea[1] / items.length > MAX_AREA_SHARE) {
    failures.push(`STRATIFICATION: area "${topArea[0]}" holds ${topArea[1]}/${items.length} answers (${(100 * topArea[1] / items.length).toFixed(0)}% > ${MAX_AREA_SHARE * 100}%) — find-40's 87.5%-in-one-tree defect class`);
  }
  if (areaDist.size < MIN_AREAS_OCCUPIED_FAIL && items.length >= minN) {
    failures.push(`STRATIFICATION: only ${areaDist.size} areas occupied at n=${items.length} (< ${MIN_AREAS_OCCUPIED_FAIL} — the owner's minimum spread requirement)`);
  } else if (areaDist.size < MIN_AREAS_OCCUPIED_WARN && items.length >= minN) {
    warnings.push(`STRATIFICATION: ${areaDist.size} areas occupied at n=${items.length} (>= ${MIN_AREAS_OCCUPIED_FAIL} so valid, < ${MIN_AREAS_OCCUPIED_WARN} so thin — wider spread would raise discriminative power)`);
  }

  // WINNABILITY-PRUNING CHECK (Hermes 2026-07-28): a set with ZERO unreachable answers at full n
  // is suspiciously clean — every answer happens to be findable by the incumbent substrate, which
  // is what a benchmark pruned to winnable items looks like from the outside. Blind spots are the
  // most valuable items in the set; their total absence is a signal, not a success.
  if (unreachable === 0 && items.length >= minN) {
    warnings.push(`WINNABILITY-PRUNING SUSPECTED: 0/${items.length} answers unreachable — a set with no blind-spot questions may have been authored or filtered against what the system can currently find (keep unwinnable questions: they are where the system is blind)`);
  }

  return {
    file: filePath,
    n: items.length,
    pass: failures.length === 0,
    failures,
    warnings,
    unreachableCount: unreachable,
    frameMix: Object.fromEntries(frameCounts),
    sourceKindMix: Object.fromEntries(kindCounts),
    stratification: {
      areasOccupied: areaDist.size,
      topArea: topArea ? { area: topArea[0], count: topArea[1], share: topArea[1] / items.length } : null,
      unassignedAnswers: unassigned,
    },
    evidence,
  };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--test')) {
    return runSelfTest().then((ok) => (ok ? 0 : 1));
  }
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: bench-validate.mjs <authored.jsonl> [--json] [--min-n=100]');
    return 2;
  }
  const minNArg = argv.find((a) => a.startsWith('--min-n='));
  const minN = minNArg ? parseInt(minNArg.slice('--min-n='.length), 10) || MIN_N : MIN_N;
  return validateBenchmark(path.resolve(file), { minN }).then((r) => {
    if (argv.includes('--json')) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`bench-validate: ${r.file} n=${r.n} -> ${r.pass ? 'PASS' : 'FAIL'}`);
      for (const f of r.failures) console.log(`  FAIL ${f}`);
      for (const w of r.warnings) console.log(`  WARN ${w}`);
      console.log(`  stratification: ${r.stratification.areasOccupied} areas occupied, top share ${r.stratification.topArea ? (100 * r.stratification.topArea.share).toFixed(0) + '%' : 'n/a'}`);
    }
    return r.pass ? 0 : 1;
  }).catch((err) => {
    console.error(`bench-validate: ${err.message}`);
    return 2;
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().then((code) => { process.exitCode = code; });

// ---------------------------------------------------------------------------
// SELF-TEST — every L4 gate OBSERVED FIRING on a synthetic failing case (the
// coverage-gate standard: a gate never watched rejecting something cannot reject).
// Probes evaluate ONLY their targeted gate's failure prefixes; unrelated failures
// from other checks are ignored so each probe isolates one instrument.
// ---------------------------------------------------------------------------
import { mkdtempSync, writeFileSync as writeTmp, rmSync } from 'node:fs';
import os from 'node:os';

async function runSelfTest() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-validate-test-'));
  let pass = true;
  const check = (name, cond, detail = '') => {
    console.log(`[bench-validate --test] ${name}: ${cond ? 'PASS' : 'FAIL'}${cond ? '' : ` ${detail}`}`);
    if (!cond) pass = false;
  };
  const prov = (kind, frame, line = 7) => ({ source_kind: kind, source_path: 'synthetic/source.md', source_line: line, frame_id: frame });
  const mk = (name, items) => {
    const p = path.join(dir, `${name}.jsonl`);
    writeTmp(p, items.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
    return p;
  };
  const failuresOf = async (name, items, minN = 2) => (await validateBenchmark(mk(name, items), { minN })).failures;
  const EXPECT = '_SYSTEM/Scripts/xref-query.mjs';

  // CLEAN — every L4 gate quiet on a well-formed small set.
  const clean = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].map((f, i) => ({
    id: `c${i}`, q: `what retries backoff under contention variant ${i}`, expect: [EXPECT], provenance: prov(i % 2 ? 'commit-message' : 'reference-doc', f),
  }));
  const cleanFails = await failuresOf('clean', clean);
  check('clean set: no L4 gate fires', !cleanFails.some((f) => /: G-/.test(f) || f.startsWith('G-') || f.includes('provenance')), JSON.stringify(cleanFails.filter((f) => /G-/.test(f))));

  // NEGATIVE 1 — G-SELF-REFERENCE: question containing its answer's distinctive path token.
  const selfRef = [{ id: 's1', q: 'what does xref wire together at runtime', expect: [EXPECT], provenance: prov('commit-message', 'F1') }];
  const srFails = await failuresOf('selfref', selfRef);
  check('G-SELF-REFERENCE rejects a question naming its own answer token', srFails.some((f) => f.startsWith('s1: G-SELF-REFERENCE')), JSON.stringify(srFails));

  // NEGATIVE 2 — G-FRAME-DIVERSITY: all questions one frame.
  const oneFrame = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, q: `where is thing ${i} handled`, expect: [EXPECT], provenance: prov(i % 2 ? 'a' : 'b', 'F1') }));
  const fdFails = await failuresOf('framediv', oneFrame, 6);
  check('G-FRAME-DIVERSITY rejects a single-frame set', fdFails.some((f) => f.startsWith('G-FRAME-DIVERSITY')), JSON.stringify(fdFails));

  // NEGATIVE 3 — G-SOURCE-CONCENTRATION: 5/6 from one source kind.
  const oneKind = Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, q: `what computes thing ${i}`, expect: [EXPECT], provenance: prov(i === 0 ? 'reference-doc' : 'commit-message', `F${(i % 6) + 1}`) }));
  const scFails = await failuresOf('srckind', oneKind, 6);
  check('G-SOURCE-CONCENTRATION rejects register dominance', scFails.some((f) => f.startsWith('G-SOURCE-CONCENTRATION')), JSON.stringify(scFails));

  // NEGATIVE 4 — partial provenance (missing source_line) is not auditable.
  const partial = [{ id: 'p1', q: 'what retries backoff', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'x.md', frame_id: 'F1' } }];
  const pvFails = await failuresOf('prov', partial);
  check('partial provenance FAILS (all four fields mandatory)', pvFails.some((f) => f.includes('missing mandatory provenance')), JSON.stringify(pvFails));

  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`[bench-validate --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

export { runSelfTest };
