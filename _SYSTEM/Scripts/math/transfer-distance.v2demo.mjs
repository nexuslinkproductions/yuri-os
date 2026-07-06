#!/usr/bin/env node
/**
 * transfer-distance.v2demo.mjs — show the V2 engine (field-distance × operator-bridge) ranking
 * the logbook by "degree of how far," + a FAIR theater test (far distance + NO shared mechanism
 * must gate to ~0, vs the over-harsh swap-a-real-far-mechanism test).
 */
import { readFileSync } from 'node:fs';
import { transferScore } from './transfer-distance.mjs';
import { fieldDistance, operatorSkeletonDistance, fieldClassify } from './transfer-distance-cores.mjs';

const cards = JSON.parse(readFileSync(process.argv[2] || '_SYSTEM/Scripts/math/logbook-truth.json', 'utf8'))
  .filter((c) => c.sourceTheory && c.yuriTarget && c.structuralNum != null);
const CFG = { distFn: fieldDistance, reconFn: operatorSkeletonDistance };
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

const scored = cards.map((c) => {
  const s = transferScore({
    sourceText: c.sourceTheory,
    targetText: `${c.yuriTarget} ${c.theTransfer || ''}`.trim(),
    mechanismText: c.borrowedMechanism || '',
    structuralConf: c.structuralNum, mismatchPresent: !!(c.mismatch && c.mismatch.length > 20),
  }, CFG);
  return { n: c.n, title: c.title.slice(0, 40), field: fieldClassify(c.sourceTheory).field, ...s };
}).sort((a, b) => b.distance - a.distance);

console.log('\n══ V2 — logbook ranked by DEGREE OF FARNESS (field-distance) ══');
console.log('  #  dist  bridge value  source-field          title');
for (const s of scored) {
  console.log(`  ${String(s.n).padStart(2)} ${s.distance.toFixed(2)}  ${s.bridge.toFixed(2)}  ${s.value.toFixed(2)}  ${s.field.padEnd(18)}  ${s.title}`);
}

// ── FAIR theater test: a genuine far transfer vs the SAME far distance with NO shared mechanism ──
const farCard = cards.find((c) => fieldClassify(c.sourceTheory).field === 'physics_neuro') || cards.find((c) => c.n === 30);
const genuine = transferScore({ sourceText: farCard.sourceTheory, targetText: `${farCard.yuriTarget} ${farCard.theTransfer}`, mechanismText: farCard.borrowedMechanism, structuralConf: farCard.structuralNum, mismatchPresent: true }, CFG);
const noMechanism = transferScore({ sourceText: farCard.sourceTheory, targetText: `${farCard.yuriTarget} ${farCard.theTransfer}`, mechanismText: '', structuralConf: farCard.structuralNum, mismatchPresent: true }, CFG);
const nounOnlyM = transferScore({ sourceText: farCard.sourceTheory, targetText: `${farCard.yuriTarget} ${farCard.theTransfer}`, mechanismText: 'the system the data the value the result the thing the part the item the area the field the table the record', structuralConf: farCard.structuralNum, mismatchPresent: true }, CFG);

console.log('\n══ FAIR THEATER TEST (same far distance, mechanism varied) ══');
console.log(`  genuine far transfer (real mechanism): value=${genuine.value.toFixed(3)} bridge=${genuine.bridge.toFixed(3)}`);
console.log(`  far distance, NO mechanism:            value=${noMechanism.value.toFixed(3)} gate=${noMechanism.gate.reason}`);
console.log(`  far distance, noun-only (no operators): value=${nounOnlyM.value.toFixed(3)} bridge=${nounOnlyM.bridge.toFixed(3)}`);
const theaterKilled = noMechanism.value < genuine.value && nounOnlyM.value <= genuine.value;
console.log(`  THEATER ${theaterKilled ? 'KILLED ✓' : 'NOT killed ✗'} (no-mechanism + noun-only score below the genuine transfer)`);
