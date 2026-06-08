#!/usr/bin/env node
import {
  classifyDimension, dimensionsCompatible, catalogFormulas, coverageReport,
  composeCheck, composableTargets,
} from './formula-foundry.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

// --- dimension classifier (closed-set, deterministic priority) ---
ok(classifyDimension('bits when base=2, nats when base=e').dimension === 'INFORMATION', 'bits/nats -> INFORMATION');
ok(classifyDimension('dimensionless probability weights; normalized internally').dimension === 'PROBABILITY',
  'specific PROBABILITY beats generic DIMENSIONLESS (priority order)');
ok(classifyDimension('total path cost (sum of edge weights)').dimension === 'DISTANCE', 'path cost -> DISTANCE');
ok(classifyDimension('').dimension === 'UNKNOWN', 'empty -> UNKNOWN');
ok(classifyDimension('a completely novel xyzzy unit').dimension === 'UNKNOWN', 'unmatched -> UNKNOWN');

// --- compatibility relation (the silent-garbage closer) ---
ok(dimensionsCompatible('INFORMATION', 'DISTANCE').compatible === false, 'INFORMATION -> DISTANCE REJECTED (bits != length)');
ok(dimensionsCompatible('PROBABILITY', 'ENERGY').compatible === false, 'PROBABILITY -> ENERGY REJECTED');
ok(dimensionsCompatible('INFORMATION', 'INFORMATION').compatible === true, 'exact match allowed');
ok(dimensionsCompatible('PROBABILITY', 'SCORE').compatible === true && dimensionsCompatible('PROBABILITY', 'SCORE').confidence === 'scalar',
  'scalar-family pure numbers bridge (PROBABILITY ~ SCORE)');
ok(dimensionsCompatible('UNKNOWN', 'ENERGY').compatible === true && dimensionsCompatible('UNKNOWN', 'ENERGY').confidence === 'low',
  'UNKNOWN cannot be disproven -> allowed, low confidence');

// --- catalog over the real banks ---
const cat = catalogFormulas();
ok(cat.banks === 6, `catalog reads 6 banks (got ${cat.banks})`);
ok(cat.count >= 20, `catalog has the bank cards (got ${cat.count})`);
ok(cat.cards.every((c, i) => i === 0 || cat.cards[i - 1].id.localeCompare(c.id) <= 0), 'catalog cards are id-sorted (determinism)');
const kl = cat.cards.find((c) => c.id === 'kl-divergence');
ok(kl && kl.outputDim === 'INFORMATION', 'kl-divergence output typed INFORMATION');
ok(kl && kl.inputDims.p === 'PROBABILITY' && kl.inputDims.q === 'PROBABILITY', 'kl-divergence p/q inputs typed PROBABILITY');

// --- determinism: two catalog runs byte-identical ---
ok(JSON.stringify(catalogFormulas()) === JSON.stringify(catalogFormulas()), 'catalog byte-identical across runs');

// --- composition: a constructed INCOHERENT pair must be rejected at composition time (before any oracle) ---
const infoCard = { id: 'synthetic-info-out', outputDim: 'INFORMATION', inputDims: {} };
const distCard = { id: 'synthetic-dist-in', outputDim: 'DISTANCE', inputDims: { path: 'DISTANCE', budget: 'DISTANCE' } };
const bad = composeCheck(infoCard, distCard);
ok(bad.legal === false && bad.compatibleSlots.length === 0, 'INFORMATION-out -> all-DISTANCE-in composition is ILLEGAL (dimensional gate)');
ok(bad.reasons.some((r) => r.includes('mismatch')), 'illegal composition reports the dimensional mismatch reason');

// --- composition: a coherent pair has at least one legal slot ---
const distOut = { id: 'synthetic-dist-out', outputDim: 'DISTANCE', inputDims: {} };
const good = composeCheck(distOut, distCard);
ok(good.legal === true && good.compatibleSlots.length === 2, 'DISTANCE-out -> DISTANCE-in slots are legal (both slots)');

// --- self-composition rejected ---
ok(composeCheck({ id: 'x', outputDim: 'SCORE', inputDims: { a: 'SCORE' } }, { id: 'x', outputDim: 'SCORE', inputDims: { a: 'SCORE' } }).legal === false,
  'self-composition rejected');

// --- composableTargets over the real catalog is deterministic + sorted ---
const astar = cat.cards.find((c) => c.id === 'astar-evaluation');
if (astar) {
  const t1 = composableTargets(astar, cat);
  const t2 = composableTargets(astar, cat);
  ok(JSON.stringify(t1) === JSON.stringify(t2), 'composableTargets deterministic');
  ok(t1.every((x, i) => i === 0 || t1[i - 1].to.localeCompare(x.to) <= 0), 'composableTargets id-sorted');
}

// --- coverage: kernel-fn binding worklist, no broken (orphan) bindings in the live banks ---
const cov = await coverageReport();
ok(cov.cardCount === cat.count && cov.kernelExportCount > 0, 'coverage spans the catalog + kernel');
ok(cov.orphanCards.length === 0, 'no orphan cards (every implementedBy resolves to a real kernel export)');
ok(Array.isArray(cov.unboundPrimitives) && cov.unboundPrimitives.every((s, i) => i === 0 || cov.unboundPrimitives[i - 1].localeCompare(s) <= 0),
  'unbound-primitive worklist is sorted');

console.log(`\nformula-foundry.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
