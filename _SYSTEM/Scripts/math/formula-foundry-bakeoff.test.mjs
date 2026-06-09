#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeFormulaCandidates, draftFormulaBankCard } from './formula-foundry.mjs';
import {
  runBakeoff, stage0Intake, stage1Fixtures, stage3RealData,
  canPromote, promote, demote, appendGateRecord, readLedger, PROMOTION_LADDER, stableHash,
} from './formula-foundry-bakeoff.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- GENERATOR ≠ SCORER (structural): the bakeoff module must NOT import the synthesizer ---
const src = fs.readFileSync(path.join(__dirname, 'formula-foundry-bakeoff.mjs'), 'utf8');
// strip comments so prose describing the discipline ("never imports synthesizeFormulaCandidates") isn't a false hit.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const moduleBody = code.split('if (import.meta.url')[0];
ok(!/import\b[^;]*synthesizeFormulaCandidates/.test(moduleBody),
  'bakeoff module body does NOT import synthesizeFormulaCandidates (generator≠scorer boundary)');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(code), 'no Math.random() / Date.now() / new Date() call (deterministic)');

// --- the harness on real synthesized candidates ---
const { candidates } = synthesizeFormulaCandidates({ maxCandidates: 10 });
const r = await runBakeoff(candidates);
ok(r.generatorScorerSeparate === true && r.domainBlind === true, 'bakeoff report declares generator≠scorer + domain-blind');
ok(r.promotableCount === 0, 'no inert candidate (no kernel binding) is promotable through the bakeoff');
ok(r.stage3.diagnosticOnly === true, 'stage 3 is diagnosticOnly with no frozen labels (honest — not a truth claim)');
ok(r.perCandidate.every((p, i) => i === 0 || r.perCandidate[i - 1].id.localeCompare(p.id) <= 0), 'bakeoff results are deterministically sorted');

// --- stage 0 intake gates ---
ok(stage0Intake({ id: 'x', synthesisProvenance: ['a', 'b'], entropy: 0.42 }).ok === false, 'stage0 rejects derived-metric smuggling (entropy as field)');
ok(stage0Intake({ id: 'x', synthesisProvenance: ['only-one'] }).ok === false, 'stage0 rejects a non-combination (prose-only / <2 parents)');
ok(stage0Intake(candidates[0]).ok === true, 'stage0 accepts a real synthesized candidate');

// --- ledger: promotion needs the FULL sequential gate chain — no rung-skipping, no jump-to-top (B-1/B-2 fix) ---
ok(PROMOTION_LADDER.length === 6 && PROMOTION_LADDER[0] === 'hypothesis', 'the 6-rung ladder is defined');
ok(canPromote('f1', 'proof-gated', []).ok === false, 'no gate records → promotion refused');
// a full sequential chain: every rung from simulated..proof-gated cleared by its own gate
const fullChain = (id) => ['simulated', 'counterexample-tested', 'proof-gated'].map((rung) => ({ formulaId: id, rung, gate: 'math-proof-gate', stamp: '2026-06-08' }));
ok(canPromote('f1', 'proof-gated', fullChain('f1')).ok === true, 'full sequential chain → promotion allowed');
// SECURITY (B-2): a lone target-rung record with no intermediate chain is REFUSED (no rung-skipping / jump-to-top)
ok(canPromote('f1', 'proof-gated', [{ formulaId: 'f1', rung: 'proof-gated', gate: 'forged' }]).ok === false,
  'a lone proof-gated record with no intermediate chain → REFUSED');
ok(canPromote('atk', 'owner-approved', [{ formulaId: 'atk', rung: 'owner-approved', gate: 'forged' }]).ok === false,
  'B-2: one forged owner-approved line does NOT authorize the top rung');
// the mutator: refuses no-record, refuses a multi-rung jump, promotes a single sequential step with the chain
ok(promote({ id: 'f1', promotionStatus: 'hypothesis' }, 'simulated', []).ok === false, 'mutator REFUSES with no gate record');
ok(promote({ id: 'f1', promotionStatus: 'simulated' }, 'owner-approved', fullChain('f1')).ok === false, 'mutator REFUSES a multi-rung jump (non-sequential)');
ok(promote({ id: 'f1', promotionStatus: 'counterexample-tested' }, 'proof-gated', fullChain('f1')).ok === true, 'mutator promotes ONE sequential step with the full chain present');
// domain-blind: a music-domain formula is gated identically (only evidence matters)
ok(canPromote('mus', 'proof-gated', fullChain('mus')).ok === canPromote('f1', 'proof-gated', fullChain('f1')).ok,
  'a music-domain formula promotes by the SAME chain rule (domain-blind)');
// a demotion record at a rung does NOT count as a clearing gate
ok(canPromote('f2', 'proof-gated', [fullChain('f2')[0], fullChain('f2')[1], { formulaId: 'f2', rung: 'proof-gated', gate: 'demotion' }]).ok === false,
  'a demotion record at a rung does NOT authorize that rung');

// --- demotion appends a gate:demotion record (deterministic, append-only) ---
const tmpLedger = path.join('/tmp', `bakeoff-test-ledger-${stableHash('t')}.jsonl`);
try { fs.unlinkSync(tmpLedger); } catch { /* ignore */ }
const badDemotion = demote('f3', 'prof-gated', 'typo target', { ledgerPath: tmpLedger, stamp: '2026-06-08' });
ok(badDemotion.ok === false && !fs.existsSync(tmpLedger), 'B-3: invalid demotion rung fails closed and writes no ledger record');
demote('f3', 'hypothesis', 'real-data regression', { ledgerPath: tmpLedger, stamp: '2026-06-08' });
const recs = readLedger(tmpLedger);
ok(recs.length === 1 && recs[0].gate === 'demotion' && recs[0].formulaId === 'f3', 'demote appends a gate:demotion record');
try { fs.unlinkSync(tmpLedger); } catch { /* ignore */ }

// --- stableHash is deterministic ---
ok(stableHash({ a: 1 }) === stableHash({ a: 1 }), 'stableHash is deterministic');

console.log(`\nformula-foundry-bakeoff.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
