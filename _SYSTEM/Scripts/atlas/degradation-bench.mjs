#!/usr/bin/env node
// @capability: degradation-bench
// @serves: G6a query-degradation measurement | paraphrase sensitivity slope | SLM usability evidence
// @does: measures phrasing sensitivity the way the owner's SLM constraint demands: mechanically
//   degrade the 40 find questions (Orion's G6a transform set), score each resolver arm against the
//   FROZEN scorer on each degraded variant, and report per-arm score, within-question variance,
//   and mean expert->worst drop. The headline is DEGRADATION SLOPE, not peak score. Also measures
//   hierarchical area-SELECTION accuracy in isolation (the menu's one remaining text-dependent
//   step) per degradation level, with uncoverable answers (expected path not in the id-map corpus)
//   reported separately, never silently counted as misses.
//   Degraded benchmark variants are written to _SYSTEM/state/atlas/degraded/ (generated state,
//   gitignored) — _SYSTEM/eval/** is never touched. The scorer runs as a fresh child process per
//   arm per transform (verifier isolation preserved).
// @use: node degradation-bench.mjs [--arms=fastlex,menu] [--skip-scorer]
// @exports: TRANSFORMS, applyTransform, generateVariants, measureSelectionAccuracy, main

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FASTLEX_STOP } from './retrieval-candidates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BENCHMARK = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
const SCORER = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-score.mjs');
const OUT_DIR = path.join(REPO_ROOT, '_SYSTEM/state/atlas/degraded');

// G6a transform set, v2 (SERIES BREAK 2026-07-28 — every v1 number, Orion's committed calibration
// table included, is incomparable across this break; do not diff v2 against v1 anywhere).
//
// G6a is TWO PROXY FAMILIES (Hermes amendment 2026-07-28, Orion refute accepted):
//   G6a-vocab = content-spine transforms. Proxies VOCABULARY POVERTY (a small model emits keywords).
//   G6a-span  = raw positional transforms. Proxies EARLY STOP (max-tokens, cut-off tool args,
//               truncated JSON). v1's raw-positional implementation LIVES ON here, not repaired away.
// BINDING RULE: an arm is gated on the WORSE OF THE TWO FAMILIES. Report both, always, adjacent.
//
// THE FOUR DEFINITION DELTAS vs Orion's (quarantined, unpersisted) table — choices made, documented:
//   1. STOPWORD SET: FASTLEX_STOP (the arm's own list — the scorer's tokenizer is the ground truth
//      for what a query contributes; `before`/`run`/`want` are members). Orion's differed; his
//      table is not ground truth (ad hoc, unpersisted — quarantined by Hermes).
//   2. TOKENIZER: /[a-z0-9_.-]{3,}/g (strips punctuation, re-tokenizes — identical to the fastlex
//      arm's query path, so a transform never produces tokens the resolver cannot consume).
//   3. long_tokens_6 = UNCAPPED keep-all len>=6 on RAW whitespace tokens. A LENGTH filter, NOT a
//      vocabulary filter — raw keeps len>=6 stopwords ('before', 'should', 'whether'), so it lives
//      in G6a-SPAN (Hermes classification ruling 2026-07-28). Orion's was spine -> len>=6 ->
//      slice(0,6) CAPPED (a truncation hybrid). Same name, different function — that is exactly
//      what v2 forbids: one name = one function, semantics written down.
//   4. no_identifiers = identifier-SHAPED tokens /[._/-]|[a-z][A-Z]/ (also kills camelCase:
//      vocabulary poverty includes not knowing identifier FORMS, not only paths). Documented, chosen.
export function contentSpine(question) {
  return String(question).toLowerCase().match(/[a-z0-9_.-]{3,}/g)?.filter((t) => !FASTLEX_STOP.has(t)) || [];
}

const IDENTIFIER_RE = /[._/-]|[a-z][A-Z]/;

/** G6a-vocab — content-spine family (vocabulary poverty). */
export const TRANSFORMS_VOCAB = {
  expert: (q) => q,
  content_only: (q) => contentSpine(q).join(' '),
  no_identifiers: (q) => q.split(/\s+/).filter((t) => !IDENTIFIER_RE.test(t)).join(' '),
  first8: (q) => contentSpine(q).slice(0, 8).join(' '),
  first5: (q) => contentSpine(q).slice(0, 5).join(' '),
  first3: (q) => contentSpine(q).slice(0, 3).join(' '),
  every_other: (q) => contentSpine(q).filter((_, i) => i % 2 === 0).join(' '),
};

/** G6a-span — raw positional family (early stop / truncation). v1 semantics preserved.
 *  long_tokens_6 lives HERE, not in vocab (Hermes classification ruling 2026-07-28): raw
 *  whitespace tokens with len>=6 KEEP STOPWORDS ('before', 'should', 'whether'), which makes it a
 *  LENGTH filter, not a vocabulary filter. UNCAPPED keep-all (Orion's capped hybrid rejected;
 *  divergence documented). One name = one function. */
export const TRANSFORMS_SPAN = {
  expert: (q) => q,
  first8: (q) => q.split(/\s+/).slice(0, 8).join(' '),
  first5: (q) => q.split(/\s+/).slice(0, 5).join(' '),
  first3: (q) => q.split(/\s+/).slice(0, 3).join(' '),
  every_other: (q) => q.split(/\s+/).filter((_, i) => i % 2 === 0).join(' '),
  long_tokens_6: (q) => q.split(/\s+/).filter((t) => t.replace(/[^a-z0-9]/gi, '').length >= 6).join(' '),
};

/** Back-compat flat view (vocab family is the headline; span is always reported adjacent). */
export const TRANSFORMS = TRANSFORMS_VOCAB;

export function applyTransform(name, question, family = 'vocab') {
  const set = family === 'span' ? TRANSFORMS_SPAN : TRANSFORMS_VOCAB;
  const fn = set[name];
  if (!fn) throw new Error(`unknown transform "${name}" in family ${family} (known: ${Object.keys(set).join(', ')})`);
  return fn(question);
}

/** Self-test: spine invariant (content_only == joined spine) AND family divergence (vocab and span
 *  must disagree on at least one probe — if they never diverge, one proxy is redundant and the
 *  two-family claim is false). Throws on failure. */
export function assertSpineInvariant() {
  const probes = [
    'where is model routing decided?',
    'what do I run before broad exploration to navigate an unfamiliar task in this repo?',
    'a factor wants to trade real money — what computes the R0→R1→R2→R3 graduation ladder?',
  ];
  for (const q of probes) {
    if (TRANSFORMS_VOCAB.content_only(q) !== contentSpine(q).join(' ')) {
      throw new Error(`SPINE INVARIANT BROKEN for "${q}" — content_only diverged from contentSpine`);
    }
  }
  const diverged = probes.some((q) => ['first8', 'first5', 'first3', 'every_other'].some(
    (t) => TRANSFORMS_VOCAB[t](q) !== TRANSFORMS_SPAN[t](q),
  ));
  if (!diverged) throw new Error('FAMILY DIVERGENCE CHECK FAILED: G6a-vocab and G6a-span agree on every probe — one proxy is redundant');
  return true;
}

/** Write one variant benchmark per transform per FAMILY (find questions only, same ids/expect/type). */
export function generateVariants({ benchmarkPath = BENCHMARK, outDir = OUT_DIR } = {}) {
  assertSpineInvariant();
  const items = readFileSync(benchmarkPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    .filter((j) => (j.type || 'find') === 'find');
  mkdirSync(outDir, { recursive: true });
  const written = { vocab: {}, span: {} };
  for (const [name, fn] of Object.entries(TRANSFORMS_VOCAB)) {
    const p = path.join(outDir, `vocab-${name}.jsonl`);
    writeFileSync(p, items.map((j) => JSON.stringify({ ...j, q: fn(j.q) })).join('\n') + '\n', 'utf8');
    written.vocab[name] = p;
  }
  for (const [name, fn] of Object.entries(TRANSFORMS_SPAN)) {
    const p = path.join(outDir, `span-${name}.jsonl`);
    writeFileSync(p, items.map((j) => JSON.stringify({ ...j, q: fn(j.q) })).join('\n') + '\n', 'utf8');
    written.span[name] = p;
  }
  return { count: items.length, variants: written };
}

function runScorerOnVariant(resolver, benchmarkPath, repoRoot = REPO_ROOT) {
  const stdout = execFileSync(process.execPath, [SCORER, `--resolver=${resolver}`, `--benchmark=${benchmarkPath}`, '--json'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME }, // verifier isolation: no caller context
  });
  return JSON.parse(stdout);
}

/**
 * Area-SELECTION accuracy in isolation (menu claim's load-bearing step), per transform per family.
 * Ground truth: expected answer path -> its balanced area (the menu's own node->area assignment).
 * Answers with no id-map node are UNCOVERABLE — counted separately, never as misses.
 * Reported for BOTH families: the menu arm is gated on the worse of the two, so its selection
 * evidence must be too. Macro (per-area) view included so blob-prior mass cannot masquerade as
 * capability (the 0.95 == always-top-3 tautology, measured 2026-07-28).
 */
export function measureSelectionAccuracy(menuMod, items, families = { vocab: Object.keys(TRANSFORMS_VOCAB), span: Object.keys(TRANSFORMS_SPAN) }) {
  const menu = menuMod.loadMenu();
  const areaOfNode = new Map();
  for (const a of menu.areas) for (const id of a.memberIds) areaOfNode.set(id, a.id);
  const out = {};
  for (const [fam, transforms] of Object.entries(families)) {
    for (const t of transforms) {
      let h1 = 0; let h3 = 0; let coverable = 0; let uncoverable = 0;
      const perArea = new Map();
      for (const item of items) {
        const norm = String(item.expect[0]).replace(/^\.\//, '').replace(/\/+$/, '');
        const nodeId = menu.l1.pathToId.get(norm);
        const truthArea = nodeId ? areaOfNode.get(nodeId) : null;
        if (!truthArea) { uncoverable++; continue; }
        coverable++;
        const sel = menuMod.selectArea(applyTransform(t, item.q, fam), menu);
        const hit1 = sel.ranked[0]?.areaId === truthArea;
        const hit3 = sel.ranked.slice(0, 3).some((r) => r.areaId === truthArea);
        if (hit1) h1++;
        if (hit3) h3++;
        const r = perArea.get(truthArea) || { n: 0, h1: 0, h3: 0 };
        r.n++; if (hit1) r.h1++; if (hit3) r.h3++;
        perArea.set(truthArea, r);
      }
      let m1 = 0; let m3 = 0;
      for (const r of perArea.values()) { m1 += r.h1 / r.n; m3 += r.h3 / r.n; }
      out[`${fam}:${t}`] = {
        coverable, uncoverable,
        at1: coverable ? h1 / coverable : null,
        at3: coverable ? h3 / coverable : null,
        macroAt1: perArea.size ? m1 / perArea.size : null,
        macroAt3: perArea.size ? m3 / perArea.size : null,
        areasOccupied: perArea.size,
      };
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const armsArg = argv.find((a) => a.startsWith('--arms='));
  const arms = armsArg ? armsArg.slice(7).split(',') : ['fastlex', 'menu'];
  const skipScorer = argv.includes('--skip-scorer');

  const { count, variants } = generateVariants();
  console.log(`degradation-bench v2 (SERIES BREAK — no v2-vs-v1 diffs): ${count} find questions, two families (vocab + span), gate = WORSE OF THE TWO`);

  // (a) per-arm degradation slope through the FROZEN scorer, BOTH families, adjacent.
  if (!skipScorer) {
    for (const arm of arms) {
      const tables = { vocab: {}, span: {} };
      for (const fam of ['vocab', 'span']) {
        for (const [t, p] of Object.entries(variants[fam])) {
          const r = runScorerOnVariant(arm, p);
          tables[fam][t] = { score: r.atlas_score, perQ: Object.fromEntries(r.per_question.map((q) => [q.id, q.value])) };
        }
      }
      const shared = ['expert', 'first8', 'first5', 'first3', 'every_other'];
      const vocabOnly = ['content_only', 'no_identifiers'];
      const spanOnly = ['long_tokens_6']; // length filter — lives in span (Hermes ruling 2026-07-28)
      const row = [
        `expert ${tables.vocab.expert.score.toFixed(4)}`,
        ...vocabOnly.map((t) => `v:${t} ${tables.vocab[t].score.toFixed(4)}`),
        ...spanOnly.map((t) => `s:${t} ${tables.span[t].score.toFixed(4)}`),
        ...shared.slice(1).map((t) => `v:${t} ${tables.vocab[t].score.toFixed(4)} | s:${t} ${tables.span[t].score.toFixed(4)}`),
      ].join(' ; ');
      // binding rule: family-worst per shared transform + overall worst (span-only included)
      const sharedWorst = Object.fromEntries(shared.slice(1).map((t) => [t, Math.min(tables.vocab[t].score, tables.span[t].score)]));
      const degradedScores = (fam) => Object.entries(fam).filter(([t]) => t !== 'expert').map(([, v]) => v.score);
      const worst = Math.min(...degradedScores(tables.vocab), ...degradedScores(tables.span));
      console.log(`\n${arm}: ${row}`);
      console.log(`  family-worst (binding): ${Object.entries(sharedWorst).map(([t, s]) => `${t} ${s.toFixed(4)}`).join(' | ')}`);
      console.log(`  WORST-CASE gate number: ${worst.toFixed(4)} | expert->worst drop: ${(tables.vocab.expert.score - worst).toFixed(4)}`);
      // within-question variance across ALL degraded variants (both families)
      const ids = Object.keys(tables.vocab.expert.perQ);
      let varSum = 0;
      for (const id of ids) {
        const vals = [...Object.values(tables.vocab), ...Object.values(tables.span)].map((v) => v.perQ[id]);
        const mean = vals.reduce((a, c) => a + c, 0) / vals.length;
        varSum += vals.reduce((a, c) => a + (c - mean) ** 2, 0) / vals.length;
      }
      console.log(`  within-question variance (mean, both families): ${(varSum / ids.length).toFixed(4)}`);
    }
  }

  // (b) area-SELECTION accuracy in isolation — BOTH families (binding rule applies here too)
  return import('./atlas-menu.mjs').then((menuMod) => {
    const items = readFileSync(BENCHMARK, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      .filter((j) => (j.type || 'find') === 'find');
    const sel = measureSelectionAccuracy(menuMod, items);
    console.log('\narea-SELECTION accuracy in isolation (both families, coverable answers only; macro = per-area, prior-resistant):');
    for (const [t, v] of Object.entries(sel)) {
      console.log(`  ${t.padEnd(22)} @1=${(v.at1 ?? 0).toFixed(3)} @3=${(v.at3 ?? 0).toFixed(3)} macro@1=${(v.macroAt1 ?? 0).toFixed(3)} macro@3=${(v.macroAt3 ?? 0).toFixed(3)} (coverable=${v.coverable}, uncoverable=${v.uncoverable}, areas=${v.areasOccupied})`);
    }
    return 0;
  }).catch((err) => {
    console.error(`degradation-bench: ${err.message}`);
    return 1;
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().then((code) => { process.exitCode = code; });
