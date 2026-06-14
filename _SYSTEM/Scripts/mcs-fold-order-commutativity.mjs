#!/usr/bin/env node
// @capability: mcs-fold-order-commutativity
// @serves: prove canonical fold order-independence | does drain order change the truth | commutativity of convergence | quantum order-effect on memory fold | contested winner order-dependence
// @does: the FOUNDATION proof for the canonical store's core claim — "shards drain in ANY order -> the same
//   canonical truth." Reuses the anti-drift-anchored reference `fold` (mcs-fold-mutation-sweep, pinned to the
//   real store) and folds each scenario's event multiset over K SEEDED random PERMUTATIONS. Measures three
//   surfaces separately: (1) the CONTESTED key SET, (2) NON-contested winners, (3) the bare winner OF a
//   contested key. The order-effect question (a la quantum-hypothesis qqEquality): which of these commute?
//   Expected + what we verify: (1)+(2) are order-INVARIANT (settled truth + conflict DETECTION are stable);
//   (3) is order-DEPENDENT by construction (last-write-wins among an unresolved conflict) — contained by the
//   contested flag, and the precise reason an order-INVARIANT resolver is the right next build.
// @use: node mcs-fold-order-commutativity.mjs  (prints per-scenario commutativity verdict + the contested-winner
//   order-dependence count). The permanent regression is mcs-fold-order-commutativity.test.mjs.
// @exports: scenarios, foldSurfaces, runCommutativity, permute
// @depends: mcs-fold-mutation-sweep.mjs (fold, makeEnvelope)

import { fold, makeEnvelope } from './mcs-fold-mutation-sweep.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function permute(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ev = (lane, claim) => makeEnvelope(claim, lane);

// Scenarios exercise every convergence rule under permutation. supersedes uses a closure so the target's
// eventId is real. NOTE: a fold permutation is only LEGAL if it never places a superseding event before its
// target is *mintable* — but eventIds are content-hashes (independent of order), and the fold's supersededIds
// guard is explicitly order-independent (marks dead whether target folded-already or arrives-later), so ALL
// permutations are semantically valid inputs. That is precisely the property under test.
export const scenarios = [
  { name: 'two-lane conflict (no supersede)', events: [
    ev('A', { subject: 's', predicate: 'p', object: 1 }),
    ev('B', { subject: 's', predicate: 'p', object: 2 }) ] },
  { name: 'three-lane conflict', events: [
    ev('A', { subject: 's', predicate: 'p', object: 1 }),
    ev('B', { subject: 's', predicate: 'p', object: 2 }),
    ev('C', { subject: 's', predicate: 'p', object: 3 }) ] },
  { name: 'clean self-supersede (resolution)', events: (() => {
    const a = ev('A', { subject: 's', predicate: 'p', object: 'v1' });
    const b = ev('A', { subject: 's', predicate: 'p', object: 'v2', supersedes: a.eventId });
    return [a, b]; })() },
  { name: 'conflict + one side superseded', events: (() => {
    const a = ev('A', { subject: 's', predicate: 'p', object: 1 });
    const b = ev('B', { subject: 's', predicate: 'p', object: 2 });
    const a2 = ev('A', { subject: 's', predicate: 'p', object: 9, supersedes: a.eventId });
    return [a, b, a2]; })() },
  { name: 'retract then reassert', events: [
    ev('A', { subject: 's', predicate: 'p', object: 1 }),
    ev('A', { kind: 'retract', subject: 's', predicate: 'p', object: 1 }),
    ev('B', { subject: 's', predicate: 'p', object: 7 }) ] },
  { name: 'multi-key mixed (2 keys, 1 contested 1 settled)', events: [
    ev('A', { subject: 's1', predicate: 'p', object: 1 }),
    ev('B', { subject: 's1', predicate: 'p', object: 2 }),
    ev('A', { subject: 's2', predicate: 'p', object: 'only' }) ] },
];

/** Canonicalize a fold result into the three order-effect surfaces. */
export function foldSurfaces(events) {
  const { byKey, contested } = fold(events);
  const contestedKeys = [...contested.keys()].sort();
  const contestedSet = new Set(contestedKeys);
  const nonContestedWinners = {};
  const contestedWinners = {};
  for (const [k, e] of byKey) {
    if (contestedSet.has(k)) contestedWinners[k] = JSON.stringify(e.object);
    else nonContestedWinners[k] = JSON.stringify(e.object);
  }
  return { contestedKeys, nonContestedWinners, contestedWinners };
}

/** Fold a scenario over K seeded permutations; report which surfaces are order-invariant. */
export function runCommutativity(scenario, K = 400, seed = 1234) {
  const rnd = mulberry32(seed);
  const ref = foldSurfaces(scenario.events);
  const refKeys = JSON.stringify(ref.contestedKeys);
  const refNon = JSON.stringify(ref.nonContestedWinners);
  let contestedKeysStable = true, nonContestedStable = true;
  const winnerVariants = {};   // contested key -> Set of distinct winners observed across permutations
  for (const k of ref.contestedKeys) winnerVariants[k] = new Set();
  for (let i = 0; i < K; i += 1) {
    const s = foldSurfaces(permute(scenario.events, rnd));
    if (JSON.stringify(s.contestedKeys) !== refKeys) contestedKeysStable = false;
    if (JSON.stringify(s.nonContestedWinners) !== refNon) nonContestedStable = false;
    for (const [k, w] of Object.entries(s.contestedWinners)) (winnerVariants[k] ||= new Set()).add(w);
  }
  const contestedWinnerOrderDependent = Object.values(winnerVariants).some((set) => set.size > 1);
  return {
    name: scenario.name, K,
    contestedKeys: ref.contestedKeys,
    contestedKeysStable,          // conflict DETECTION order-invariant?
    nonContestedStable,           // settled TRUTH order-invariant?
    contestedWinnerOrderDependent, // bare winner of an unresolved conflict order-dependent? (expected true)
    winnerVariantCounts: Object.fromEntries(Object.entries(winnerVariants).map(([k, s]) => [k, s.size])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== canonical fold — ORDER COMMUTATIVITY (400 seeded permutations/scenario) ===\n');
  let foundationHolds = true;
  for (const sc of scenarios) {
    const r = runCommutativity(sc);
    if (!r.contestedKeysStable || !r.nonContestedStable) foundationHolds = false;
    console.log(`• ${r.name}`);
    console.log(`    conflict-detection (contested set) order-invariant: ${r.contestedKeysStable}`);
    console.log(`    settled-truth (non-contested winners) order-invariant: ${r.nonContestedStable}`);
    console.log(`    contested bare-winner order-dependent: ${r.contestedWinnerOrderDependent}${r.contestedKeys.length ? ` (variants: ${JSON.stringify(r.winnerVariantCounts)})` : ' (n/a — none contested)'}`);
  }
  console.log('\nVERDICT:');
  console.log(`• FOUNDATION (truth + conflict-detection commute under any drain order): ${foundationHolds ? 'HOLDS' : 'VIOLATED'}`);
  console.log('• The bare winner of a CONTESTED key is last-write-wins = drain-order-dependent BY DESIGN —');
  console.log('  contained by the contested flag, and the precise motivation for an order-INVARIANT resolver');
  console.log('  (trust × recency × evidence) that proposes a stable likely-truth without deleting the loser.');
}
