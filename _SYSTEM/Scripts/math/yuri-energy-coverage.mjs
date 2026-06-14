#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Measure which regions of computeU's input space any test/run has
//                ever exercised — coverage closure, the UVM covergroup transfer.
//                Candidate D of the substrate-frontier-grade mission (T3 GAP).
//   target:      NEW file only. Reads computeU output; mutates NO gate behavior.
//   constraints: dependency-free; sign-aware reachable bins only (no fake holes);
//                observe-only; reversible by deletion.
//   acceptance:  reports real per-component bin coverage + holes; a never-hit
//                reachable bin shows as a hole; structurally-unreachable bins are
//                NOT counted (honest denominator).
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-coverage.test.mjs
//   rollback:    rm this file + its .test.mjs.
// ===========================================================================
//
// @capability: energy-coverage-meter
// @serves: input-space coverage of computeU | which test regions are unexercised | coverage closure for the energy gate | covergroup bins + holes report
// @does: a UVM-style covergroup over computeU's 12 contribution keys — sign-aware bins, per-component holes, overall coverage %, and cross-coverage over key pairs to find untested component interactions; can populate from example-test states or the random state space
// @use: run after building/changing tests to see which input regions are never exercised (the holes the hand-authored suite misses); pairs with the invariant prover (proves correctness where coverage proves reach)
// @exports: makeCoverage, hit, report, binOf, COMPONENT_KEYS, CREDIT_KEYS, ALWAYS_EMITTED, STRUCTURAL_PHANTOMS, coverageFromStates, coverageFromGenerator
//
// Frontier transfer: coverage-driven verification (UVM covergroups / coverage
// closure) → the YURI scoring function. Coverage proves REACH; the invariant
// prover (yuri-energy-invariants.mjs) proves CORRECTNESS. Different axes.

import { computeU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { makeRng, genState } from './yuri-energy-invariants.mjs';

// The 12 contribution keys computeU can emit (the design-under-test surface).
export const COMPONENT_KEYS = [
  'entropy', 'wasserstein', 'overconfidenceDrift', 'logLoss', 'brier',
  'repeatedFailure', 'malformedForecast', 'staleness',
  'protectedPathViolations', 'promotionLadderInversions',
  'informationGain', 'verifiedEvidenceCredit',
];
// The two credit (≤0) keys — they reach the negative bins, never the positive ones.
export const CREDIT_KEYS = new Set(['informationGain', 'verifiedEvidenceCredit']);

const PENALTY_BINS = ['absent', 'zero', 'tiny', 'small', 'med', 'large'];   // value ≥ 0
const CREDIT_BINS = ['absent', 'zero', 'ntiny', 'nsmall', 'nlarge'];        // value ≤ 0
// These three contributions are emitted UNCONDITIONALLY by computeU (yuri-energy.mjs:693-700),
// so 'absent' is structurally UNREACHABLE for them — counting it would be a permanent false
// hole that dishonestly deflates coverage. Honest denominator: drop 'absent' for these keys.
export const ALWAYS_EMITTED = new Set(['protectedPathViolations', 'promotionLadderInversions', 'verifiedEvidenceCredit']);

// STRUCTURAL PHANTOM BINS (B2, 2026-06-14): bins NO valid computeU input can produce, by the
// evaluator's IN-CODE structure — NOT by the generator's input domain. The distinction is the
// whole anti-laundering point: entropy 'large' is unreachable for genState (≤6 classes) but
// reachable for a real giant-support distribution → dropping it would relabel a GENERATOR gap as
// impossibility and hide it. So only two structural classes are dropped, both verified against the
// real code and re-proven by a falsifiable test (energy-coverage.test.mjs throws extreme inputs and
// asserts nothing lands in a phantom):
//   (a) DISCRETE quantization — contribution = weight × integer count, so only specific magnitudes
//       occur and the gaps between them are unreachable;
//   (b) IN-CODE magnitude CLAMP — the evaluator bounds its own output.
// Net 14 bins (67→53). Conservative by design: when reachability is unbounded-in-principle the bin
// is KEPT (an honest hole), never dropped.
export const STRUCTURAL_PHANTOMS = {
  // (a) discrete weight×integer-count evaluators:
  malformedForecast: ['zero', 'tiny', 'small', 'med'],   // λ=50·count, skipped at 0 ⇒ {absent} ∪ {≥50='large'}
  protectedPathViolations: ['tiny', 'small', 'med'],     // η=100·count, always emitted ⇒ {0='zero'} ∪ {≥100='large'}
  repeatedFailure: ['tiny', 'small'],                    // κ=5·count ⇒ {0,5,10,15…}; nothing in (0,2]
  promotionLadderInversions: ['tiny', 'small'],          // θ=10·count ⇒ {0,10,20…}; nothing in (0,2]
  // (b) in-code magnitude-clamped credits:
  verifiedEvidenceCredit: ['nsmall', 'nlarge'],          // −ι·log1p(min(ev,50)) ⇒ |m| ≤ 0.393
  informationGain: ['nlarge'],                           // −ε·normalized, normalized clamped to [0,1] ⇒ |m| ≤ 1
};
const reachableBins = (key) => {
  let base = CREDIT_KEYS.has(key) ? CREDIT_BINS : PENALTY_BINS;
  if (ALWAYS_EMITTED.has(key)) base = base.filter((b) => b !== 'absent');
  const phantom = STRUCTURAL_PHANTOMS[key];
  if (phantom) base = base.filter((b) => !phantom.includes(b));
  return base;
};

// Which bin a contribution value lands in. `present` = the key appeared in
// contributions (a skipped component is 'absent', itself a coverage point).
export function binOf(value, present, isCredit) {
  if (!present) return 'absent';
  const v = Number(value);
  if (!Number.isFinite(v)) return isCredit ? 'nlarge' : 'large'; // non-finite → extreme bin
  if (Math.abs(v) < 1e-9) return 'zero';
  // SIGN-VIOLATION guard (B2, 2026-06-14): a penalty contribution must be ≥0 and a credit ≤0 by
  // construction. A wrong-signed value previously fell through to a magnitude bin ('tiny' for a
  // negative penalty, 'ntiny' for a positive credit), LAUNDERING a sign bug as ordinary coverage.
  // Surface it as a distinct error bin so a sign violation shows up loudly instead of hiding. These
  // bins are in NO reachable set (report() ignores them in binsHit/holes) → a hit is an anomaly, and
  // the sign-convention invariant in yuri-energy-invariants.mjs is the prover that should catch it.
  if (!isCredit && v < 0) return 'err-negative';
  if (isCredit && v > 0) return 'err-positive';
  if (isCredit) {
    const m = -v; // magnitude of the credit
    if (m <= 0.5) return 'ntiny';
    if (m <= 2) return 'nsmall';
    return 'nlarge';
  }
  if (v <= 0.5) return 'tiny';
  if (v <= 2) return 'small';
  if (v <= 10) return 'med';
  return 'large';
}

export function makeCoverage() {
  const perComponent = {};
  for (const k of COMPONENT_KEYS) perComponent[k] = new Set();
  return { perComponent, cross: new Map(), samples: 0 };
}

// Key pairs whose INTERACTION we track (untested combinations are interaction holes).
const CROSS_PAIRS = [
  ['wasserstein', 'overconfidenceDrift'], // drift × confidence-coupling (the v3+μ pair)
  ['entropy', 'wasserstein'],             // uncertainty × drift
  ['protectedPathViolations', 'verifiedEvidenceCredit'], // barrier × credit (can a credit mask a barrier?)
];

export function hit(cov, contributions) {
  if (!contributions || typeof contributions !== 'object') return cov;
  const binFor = (key) => binOf(contributions[key], key in contributions, CREDIT_KEYS.has(key));
  for (const k of COMPONENT_KEYS) cov.perComponent[k].add(binFor(k));
  for (const [a, b] of CROSS_PAIRS) {
    const combo = `${binFor(a)}|${binFor(b)}`;
    const ckey = `${a}×${b}`;
    if (!cov.cross.has(ckey)) cov.cross.set(ckey, new Set());
    cov.cross.get(ckey).add(combo);
  }
  cov.samples += 1;
  return cov;
}

export function report(cov) {
  const perComponent = {};
  let hitTotal = 0;
  let reachTotal = 0;
  for (const k of COMPONENT_KEYS) {
    const reach = reachableBins(k);
    const hits = [...cov.perComponent[k]].filter((b) => reach.includes(b));
    const holes = reach.filter((b) => !cov.perComponent[k].has(b));
    perComponent[k] = { binsHit: hits.length, binsTotal: reach.length, holes, pct: +(hits.length / reach.length).toFixed(3) };
    hitTotal += hits.length;
    reachTotal += reach.length;
  }
  const cross = {};
  for (const [a, b] of CROSS_PAIRS) {
    const ckey = `${a}×${b}`;
    const seen = cov.cross.get(ckey)?.size || 0;
    const space = reachableBins(a).length * reachableBins(b).length;
    cross[ckey] = { combosSeen: seen, combosTotal: space, pct: +(seen / space).toFixed(3) };
  }
  return {
    samples: cov.samples,
    overallPct: +(hitTotal / reachTotal).toFixed(3),
    binsHit: hitTotal,
    binsTotal: reachTotal,
    perComponent,
    cross,
  };
}

// Populate from an array of states (e.g. the example-test inputs).
export function coverageFromStates(states, weights = DEFAULT_WEIGHTS) {
  const cov = makeCoverage();
  for (const s of Array.isArray(states) ? states : []) {
    try { hit(cov, computeU(s, weights).result.contributions); } catch { /* skip a bad state */ }
  }
  return cov;
}

// Populate from the random state space (the invariant harness's generator).
export function coverageFromGenerator(n = 5000, seed = 0x5eed, weights = DEFAULT_WEIGHTS) {
  const cov = makeCoverage();
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    try { hit(cov, computeU(genState(rng), weights).result.contributions); } catch { /* skip */ }
  }
  return cov;
}

// CLI: report coverage of the random state space + flag holes.
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2]) || 8000;
  const r = report(coverageFromGenerator(n));
  console.log(`\ncomputeU input-space coverage over ${r.samples} random states: ${(r.overallPct * 100).toFixed(1)}% (${r.binsHit}/${r.binsTotal} reachable bins)\n`);
  for (const [k, v] of Object.entries(r.perComponent)) {
    const flag = v.holes.length ? `  HOLES: ${v.holes.join(',')}` : '';
    console.log(`  ${(v.pct * 100).toFixed(0).padStart(3)}%  ${k.padEnd(26)} ${v.binsHit}/${v.binsTotal}${flag}`);
  }
  console.log('\ncross-coverage (component interactions):');
  for (const [k, v] of Object.entries(r.cross)) console.log(`  ${(v.pct * 100).toFixed(0).padStart(3)}%  ${k.padEnd(46)} ${v.combosSeen}/${v.combosTotal}`);
  console.log('\nNote: holes are reachable-but-unexercised bins — coverage proves REACH, not correctness (see yuri-energy-invariants.mjs).');
}
