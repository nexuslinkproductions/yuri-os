#!/usr/bin/env node
import fs from 'node:fs';
import {
  classifyDimension, dimensionsCompatible, catalogFormulas, coverageReport,
  composeCheck, composableTargets,
  composeOperatorSequences, synthesizeFormulaCandidates, draftFormulaBankCard, proofPreflightCandidate,
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
ok(classifyDimension(['bit']).dimension === 'UNKNOWN' && classifyDimension(['bit']).malformed === true,
  'non-string unit arrays are flagged malformed instead of coerced into dimensions');
ok(classifyDimension({ toString: () => 'energy' }).dimension === 'UNKNOWN' && classifyDimension({ toString: () => 'energy' }).malformed === true,
  'non-string unit objects are flagged malformed instead of coerced into dimensions');

// --- compatibility relation (the silent-garbage closer) ---
ok(dimensionsCompatible('INFORMATION', 'DISTANCE').compatible === false, 'INFORMATION -> DISTANCE REJECTED (bits != length)');
ok(dimensionsCompatible('PROBABILITY', 'ENERGY').compatible === false, 'PROBABILITY -> ENERGY REJECTED');
ok(dimensionsCompatible('INFORMATION', 'INFORMATION').compatible === true, 'exact match allowed');
ok(dimensionsCompatible('PROBABILITY', 'SCORE').compatible === true && dimensionsCompatible('PROBABILITY', 'SCORE').confidence === 'scalar',
  'scalar-family pure numbers bridge (PROBABILITY ~ SCORE)');
ok(dimensionsCompatible('UNKNOWN', 'ENERGY').compatible === false && dimensionsCompatible('UNKNOWN', 'ENERGY').confidence === 'speculative',
  'UNKNOWN is speculative-only, never a legal move');

// --- gates-foundry-3: keyword-table regressions ---
ok(classifyDimension('mean negative log likelihood in nats').dimension === 'INFORMATION', 'log-loss output is INFORMATION not PROBABILITY');
ok(classifyDimension('positive time constant in same units as age').dimension === 'TIME', 'half-life knob is TIME');
ok(classifyDimension('outcome utility or cost units').dimension === 'UNKNOWN', 'generic caller-declared cost prose no longer steals DISTANCE');
ok(classifyDimension('non-negative evidence likelihood').dimension === 'PROBABILITY', 'bare likelihood still PROBABILITY');
ok(classifyDimension('same edge cost units as the graph edges').dimension === 'DISTANCE', 'astar heuristic keeps DISTANCE after generic-cost removal');

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

const corruptBankDir = '/private/tmp/yuri-formula-foundry-corrupt-test';
fs.rmSync(corruptBankDir, { recursive: true, force: true });
fs.mkdirSync(corruptBankDir, { recursive: true });
fs.writeFileSync(`${corruptBankDir}/bad.json`, '{ not json', 'utf8');
fs.writeFileSync(`${corruptBankDir}/good.json`, JSON.stringify({
  id: 'good-bank',
  formulas: [{ id: 'good-formula', units: { inputs: { x: 'score' }, output: 'score' } }],
}), 'utf8');
const corruptCat = catalogFormulas({ bankDir: corruptBankDir });
ok(corruptCat.banks === 2 && corruptCat.count === 1, 'catalog keeps valid banks when one bank JSON is corrupt');
ok(corruptCat.skipped.length === 1 && corruptCat.skipped[0].file === 'bad.json' && corruptCat.skipped[0].error,
  'catalog reports corrupt bank JSON in skipped diagnostics');
fs.rmSync(corruptBankDir, { recursive: true, force: true });

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

// --- gates-foundry-4: UNKNOWN output cannot mint a legal move; speculative channel reports candidates ---
const launder = composeCheck({ id: 'garbage', outputDim: 'UNKNOWN', inputDims: {} }, { id: 'sink', outputDim: 'ENERGY', inputDims: { u: 'ENERGY', v: 'UNKNOWN' } });
ok(launder.legal === false, 'UNKNOWN output cannot mint a legal move into anything');
ok((launder.speculativeSlots || []).length === 2, 'speculative channel still reports the candidates');
// range containment runs on ALL confidence tiers (the exact-path [-1,1]->[0,1] hole)
const catRange = catalogFormulas();
const byId = (id) => catRange.cards.find((c) => c.id === id);
const cosBayes = composeCheck(byId('cosine-similarity'), byId('bayes-update'));
ok(cosBayes.legal === true && !cosBayes.compatibleSlots.some((s) => s.slot === 'prior'),
  'cosine[-1,1] cannot silently feed the bayes prior [0,1] slot (range-excluded)');
ok((cosBayes.excludedSlots || []).some((s) => s.slot === 'prior' && /range mismatch/.test(s.reason)),
  'prior exclusion carries the range-mismatch reason');
ok(cosBayes.compatibleSlots.every((s) => s.rangeUnverified === true),
  'range-silent likelihood slots stay compatible but flagged rangeUnverified');
const cosDecay = composeCheck(byId('cosine-similarity'), byId('confidence-decay'));
ok(!cosDecay.compatibleSlots.some((s) => s.slot === 'base')
  && (cosDecay.excludedSlots || []).some((s) => s.slot === 'base' && /range mismatch/.test(s.reason)),
  'same-dimension exact path is range-checked too: SCORE[-1,1] cannot feed confidence-decay base SCORE[0,1]');

// --- gates-foundry-5: parameter slots are never composition targets ---
const klCe = composeCheck(byId('kl-divergence'), byId('cross-entropy'));
ok(klCe.legal === false, 'KL output can no longer feed the entropy-family base knob');
ok(klCe.reasons.some((x) => /parameter slot/.test(x)), 'base rejected as a parameter slot, not just dimension');
const ctrl = composeCheck(byId('bayes-update'), byId('log-loss'));
ok(ctrl.legal === true, 'data slots on a parameterSlots card stay composable');
ok(ctrl.compatibleSlots.some((s) => s.slot === 'predictions') && !ctrl.compatibleSlots.some((s) => s.slot === 'epsilon'),
  'predictions composable, epsilon excluded as parameter');

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

// --- SYNTHESIS VERB (CHUNK 2) — creativity unbounded, promotion gated ---
const synCat = catalogFormulas();
const seqs = composeOperatorSequences(synCat, { maxCandidates: 50 });
ok(seqs.sequences.length > 0, 'composeOperatorSequences finds legal chains');
// every hop in every sequence is dimensionally legal (composeCheck guaranteed)
ok(seqs.sequences.every((s) => s.hops.every((h) => {
  const a = synCat.cards.find((c) => c.id === h.from || c.id === s.chain[s.chain.indexOf(h.to) - 1]);
  return dimensionsCompatible(h.fromDim, h.toDim).compatible;
})), 'every synthesized hop is dimensionally compatible (no illegal combination escapes)');
ok(seqs.sequences.every((s, i) => i === 0 || seqs.sequences[i - 1].chain.join('>').localeCompare(s.chain.join('>')) <= 0), 'sequences are deterministically sorted');

const branchyCatalog = {
  cards: [
    { id: 'source', outputDim: 'SCORE', inputDims: {}, sourceDomains: ['test'] },
    { id: 'target-a', outputDim: 'SCORE', inputDims: { x: 'SCORE' }, sourceDomains: ['test'] },
    { id: 'target-b', outputDim: 'SCORE', inputDims: { x: 'SCORE' }, sourceDomains: ['test'] },
    { id: 'target-c', outputDim: 'SCORE', inputDims: { x: 'SCORE' }, sourceDomains: ['test'] },
  ],
};
const branchCut = composeOperatorSequences(branchyCatalog, {
  startIds: ['source'],
  maxChainLength: 2,
  maxBranchingPerNode: 1,
  maxCandidates: 10,
});
ok(branchCut.truncated === true && branchCut.truncation.branchDropped === 2,
  'maxBranch drops legal successors loudly via truncated + branchDropped count');

const syn = synthesizeFormulaCandidates({ catalog: synCat, maxCandidates: 50 });
ok(syn.candidates.length > 0, 'synthesizeFormulaCandidates produces candidates');
// THE core guarantee: every candidate is INERT (research + advisory + no kernel binding)
ok(syn.candidates.every((c) => c.promotionStatus === 'research' && c.advisoryOnly === true && c.implementedBy === null),
  'EVERY synthesized candidate is inert: research + advisoryOnly + no implementedBy');
ok(syn.candidates.every((c) => Array.isArray(c.synthesisProvenance) && c.synthesisProvenance.length >= 2),
  'every candidate carries synthesisProvenance (parent card ids)');
// determinism
const idsA = JSON.stringify(synthesizeFormulaCandidates({ catalog: synCat, maxCandidates: 50 }).candidates.map((c) => c.id));
const idsB = JSON.stringify(synthesizeFormulaCandidates({ catalog: synCat, maxCandidates: 50 }).candidates.map((c) => c.id));
ok(idsA === idsB, 'synthesis is byte-deterministic (content-addressed ids, no RNG/clock)');

// draftFormulaBankCard mints a research card that is structurally unable to promote
const draft = draftFormulaBankCard(syn.candidates[0]);
ok(draft.promotionStatus === 'research' && draft.advisoryOnly === true && draft.implementedBy === null,
  'draftFormulaBankCard mints research + advisoryOnly + no implementedBy');
ok(Array.isArray(draft.proofObligations) && draft.proofObligations.length >= 2, 'draft card carries proof obligations (bind a kernel symbol + green worked example)');

// no-promotion-without-green-worked-example: preflight reports inert for a no-binding card
const pf = proofPreflightCandidate(draft);
ok(pf.inert === true && pf.hasBinding === false, 'preflight: a no-binding synthesized card is INERT by construction');

// DOMAIN-BLIND gate: a music/frequency/magnetism candidate is inert by the SAME rule as any other (no binding),
// NOT because it is "symbolic" — and it would promote the SAME way (bind a kernel symbol + green worked example).
const musicCandidate = { id: 'synth.test.music', promotionStatus: 'research', advisoryOnly: true, implementedBy: null, synthesisProvenance: ['a', 'b'], sourceDomains: ['music-theory'], outputDim: 'SCORE' };
const infoCandidate = { id: 'synth.test.info', promotionStatus: 'research', advisoryOnly: true, implementedBy: null, synthesisProvenance: ['a', 'b'], sourceDomains: ['information-theory'], outputDim: 'INFORMATION' };
const musicPf = proofPreflightCandidate(draftFormulaBankCard(musicCandidate));
const infoPf = proofPreflightCandidate(draftFormulaBankCard(infoCandidate));
ok(musicPf.inert === infoPf.inert && musicPf.inert === true && musicPf.reason === infoPf.reason,
  'music-theory and information-theory candidates are gated IDENTICALLY (domain-blind: inert only for lack of binding, not for domain)');

// a card claiming promoted status WITHOUT a binding is still caught inert (no fake promotion)
const fakePromoted = { id: 'synth.fake', promotionStatus: 'verified-baseline', advisoryOnly: false, implementedBy: null, synthesisProvenance: ['a', 'b'], outputDim: 'SCORE' };
ok(proofPreflightCandidate(fakePromoted).inert === true, 'a card claiming verified-baseline with NO binding is still inert (cannot fake promotion)');

console.log(`\nformula-foundry.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
