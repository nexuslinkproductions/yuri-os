#!/usr/bin/env node
// @capability: arm-significance-gate
// @serves: peek-safe arm comparison | paired per-question significance | decided/undecided verdict
// @does: compares two frozen-scorer JSON outputs (resolver arms) on the PAIRED per-question value
//   deltas via eval-processing's empirical-Bernstein confidence sequence (time-uniform: valid
//   under continuous monitoring, which a loop requires). Primary quantity = the scorer's own
//   per-question `value` (the atlas_score objective); hit@1/hit@3 deltas are secondary
//   diagnostics only. Verdict: DECIDED-BETTER / DECIDED-WORSE / UNDECIDED-AT-THIS-N.
// @use: node arm-significance.mjs <challenger.json> <baseline.json> [--alpha=0.05] [--json]
//   Reach for this instead of ranking two arms on a raw score delta — a 1-2 question swing on
//   n=40 is exactly the case this gate exists for.
// @exports: compareArms, main

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { confidenceSequence } from '../eval-processing.mjs';

/**
 * @param challenger scorer JSON ({per_question:[{id, value, hit1, hit3}]})
 * @param baseline   scorer JSON, same shape (same question set required)
 * @returns verdict object with primary + diagnostic confidence-sequence outcomes
 */
export function compareArms(challenger, baseline, { alpha = 0.05 } = {}) {
  const baseById = new Map(baseline.per_question.map((q) => [q.id, q]));
  const pairs = [];
  for (const q of challenger.per_question) {
    const b = baseById.get(q.id);
    if (!b) throw new Error(`question ${q.id} missing from baseline — arms must run the same benchmark`);
    pairs.push({
      id: q.id,
      type: q.type || 'find',
      dValue: q.value - b.value,
      dHit1: (q.hit1 ? 1 : 0) - (b.hit1 ? 1 : 0),
      dHit3: (q.hit3 ? 1 : 0) - (b.hit3 ? 1 : 0),
    });
  }

  const run = (key) => {
    const cs = confidenceSequence({ alpha, range: [-1, 1] });
    for (const p of pairs) cs.push(p[key]);
    const ci = cs.ci();
    return { decision: cs.decided(0), mean: ci.mean, lo: ci.lo, hi: ci.hi, n: ci.n };
  };

  const primary = run('dValue');
  const diag1 = run('dHit1');
  const diag3 = run('dHit3');

  const verdict = primary.decision === 'above' ? 'DECIDED-BETTER'
    : primary.decision === 'below' ? 'DECIDED-WORSE'
    : 'UNDECIDED-AT-THIS-N';

  // Per-type mean values per arm (directional only — small n by construction).
  const byType = {};
  for (const q of challenger.per_question) {
    const t = q.type || 'find';
    (byType[t] ||= { n: 0, challSum: 0, baseSum: 0 });
    byType[t].n++;
    byType[t].challSum += q.value;
    byType[t].baseSum += baseById.get(q.id).value;
  }
  for (const t of Object.values(byType)) {
    t.challenger = t.challSum / t.n;
    t.baseline = t.baseSum / t.n;
    delete t.challSum;
    delete t.baseSum;
  }

  return {
    verdict,
    primary: { quantity: 'per-question value delta', ...primary },
    diagnostics: { hit1: diag1, hit3: diag3 },
    byType,
    n: pairs.length,
    alpha,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = { alpha: 0.05, json: false, files: [] };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a.startsWith('--alpha=')) args.alpha = Number(a.slice('--alpha='.length));
    else args.files.push(a);
  }
  if (args.files.length !== 2) {
    console.error('usage: arm-significance.mjs <challenger.json> <baseline.json> [--alpha=0.05] [--json]');
    return 2;
  }
  const [challenger, baseline] = args.files.map((f) => JSON.parse(readFileSync(path.resolve(f), 'utf8')));
  const r = compareArms(challenger, baseline, { alpha: args.alpha });
  if (args.json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const fmt = (d) => `${d.decision} (mean ${d.mean.toFixed(4)}, CI [${d.lo.toFixed(4)}, ${d.hi.toFixed(4)}], n=${d.n})`;
    console.log(`${challenger.resolver || 'challenger'} vs ${baseline.resolver || 'baseline'}: ${r.verdict}`);
    console.log(`  primary (value delta): ${fmt(r.primary)}`);
    console.log(`  hit@1 diagnostic:      ${fmt(r.diagnostics.hit1)}`);
    console.log(`  hit@3 diagnostic:      ${fmt(r.diagnostics.hit3)}`);
    for (const [t, v] of Object.entries(r.byType)) {
      console.log(`  type ${t} (n=${v.n}): challenger ${v.challenger.toFixed(4)} vs baseline ${v.baseline.toFixed(4)}`);
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
