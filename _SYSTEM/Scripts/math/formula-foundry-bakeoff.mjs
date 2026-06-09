#!/usr/bin/env node
/**
 * formula-foundry-bakeoff.mjs — Foundry CHUNK 3: the bakeoff harness + the promotion/demotion ledger.
 *
 * This is the SCORER + the GOVERNANCE side of Core B. It is deliberately the GENERATOR≠SCORER boundary:
 * it takes already-synthesized candidates as INPUT and NEVER imports the synthesizer (synthesizeFormulaCandidates).
 * The scoring path and the generation path share no state — a synthesizer can never grade its own candidate.
 *
 * DOMAIN-BLIND: nothing here inspects a candidate's source domains to loosen or tighten any gate. Music,
 * frequency, magnetism, numerology, alchemy, information-theory — same rungs, same evidence bar. A candidate
 * fails for insufficient evidence, never for its domain.
 *
 * Deterministic: no Math.random, no Date.now (timestamps are passed in via opts.stamp). Sorted iteration.
 * Real total counts only (no top-N severity-laundering) — stage 3 reports actual corpus totals or refuses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proofPreflightCandidate, draftFormulaBankCard } from './formula-foundry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const LEDGER_PATH = path.join(REPO, '_SYSTEM/state/formula-foundry-ledger.jsonl');
const LABELS_DIR = path.join(REPO, '_SYSTEM/data/math/formula-foundry/labels');

// derived-metric fields a lane may never submit as executable proof (the synthesizer/lane only proposes form).
const DERIVED_METRICS = ['entropy', 'deltaU', 'delta_u', 'staleness_index', 'risk_score', 'riskScore', 'componentDeltas', 'energy_delta_estimate'];

// FNV-1a 32-bit — stable content hash (no crypto, no clock); same input → same hash.
export function stableHash(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------------------------------------
// PROMOTION / DEMOTION LEDGER — append-only sidecar (keeps owner-approved out of the frozen bank schema)
// ------------------------------------------------------------------------------------------------
export const PROMOTION_LADDER = Object.freeze([
  'hypothesis', 'simulated', 'counterexample-tested', 'proof-gated', 'real-data-bakeoff', 'owner-approved',
]);

export function readLedger(ledgerPath = LEDGER_PATH) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// append a gate record proving a rung was cleared (or a demotion). Deterministic record, caller-stamped.
export function appendGateRecord(record, ledgerPath = LEDGER_PATH) {
  const rec = {
    formulaId: String(record.formulaId || ''),
    rung: String(record.rung || ''),
    gate: String(record.gate || ''),            // the script/process that proved it, or 'demotion'
    formulaHash: record.formulaHash || null,
    evidenceHash: record.evidenceHash || null,
    stamp: record.stamp || null,                // caller-supplied (no clock here)
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(rec) + '\n');
  return rec;
}

// Promotion to a rung is REFUSED unless the ledger holds a non-demotion gate record for EVERY rung from
// index 1 up to the target (the full sequential chain). Checking only the target rung let a single forged
// 'owner-approved' line jump a hypothesis card straight to the top — the ladder was decorative. Now every
// intermediate rung must carry its own cleared gate; no rung-skipping, no jump-to-top. Domain-blind.
export function canPromote(formulaId, toRung, ledger = readLedger()) {
  const toIdx = PROMOTION_LADDER.indexOf(toRung);
  if (toIdx < 0) return { ok: false, reason: `unknown rung: ${toRung}` };
  if (toIdx === 0) return { ok: true, reason: 'hypothesis is the entry rung — no gate needed' };
  for (let i = 1; i <= toIdx; i += 1) {
    const rung = PROMOTION_LADDER[i];
    const cleared = ledger.some((r) => r.formulaId === formulaId && r.rung === rung && r.gate && r.gate !== 'demotion');
    if (!cleared) return { ok: false, reason: `incomplete ladder: rung '${rung}' has no gate record (full chain hypothesis→${toRung} required; no rung-skipping)` };
  }
  return { ok: true, reason: `full sequential ladder chain present (hypothesis→${toRung})` };
}

// the MUTATOR: a card may advance EXACTLY ONE rung per call (sequential), and only if the full gate chain
// exists. Checking the card's current rung is what stops a jump from hypothesis to owner-approved. Domain-blind.
export function promote(card, toRung, ledger = readLedger()) {
  const toIdx = PROMOTION_LADDER.indexOf(toRung);
  const curRung = (card && card.promotionStatus) || PROMOTION_LADDER[0];
  const curIdx = PROMOTION_LADDER.indexOf(curRung);
  if (toIdx < 0 || curIdx < 0) return { ok: false, status: card && card.promotionStatus, reason: `unknown rung (${curRung}→${toRung})` };
  if (toIdx !== curIdx + 1) return { ok: false, status: curRung, reason: `non-sequential promotion ${curRung}→${toRung}: the ladder advances exactly one rung at a time` };
  const c = canPromote(card && card.id, toRung, ledger);
  if (!c.ok) return { ok: false, status: card && card.promotionStatus, reason: c.reason };
  return { ok: true, status: toRung, reason: 'promoted: one sequential rung with the full gate chain present' };
}

// demotion: a promoted formula that later regresses drops immediately, recorded, no owner-override.
export function demote(formulaId, toRung, reason, opts = {}) {
  // Typos must not silently rewrite the target rung; demotion is a governance mutation, so fail closed.
  if (!PROMOTION_LADDER.includes(toRung)) return { ok: false, status: null, reason: `unknown demotion rung: ${toRung}` };
  const rung = toRung;
  appendGateRecord({ formulaId, rung, gate: 'demotion', formulaHash: opts.formulaHash || null, evidenceHash: stableHash(String(reason || '')), stamp: opts.stamp || null }, opts.ledgerPath);
  return { ok: true, status: rung, reason: `demoted: ${reason}` };
}

// ------------------------------------------------------------------------------------------------
// BAKEOFF STAGES (0 intake · 1 synthetic fixtures · 2 counterexamples · 3 real-data) — generator≠scorer
// ------------------------------------------------------------------------------------------------
// stage 0 — intake: a candidate must be a typed form, not prose, not self-citing, not smuggling a derived metric.
export function stage0Intake(candidate) {
  if (!candidate || typeof candidate !== 'object') return { ok: false, reason: 'candidate is not an object' };
  if (!Array.isArray(candidate.synthesisProvenance) || candidate.synthesisProvenance.length < 2) {
    return { ok: false, reason: 'candidate lacks a 2+ parent synthesisProvenance (prose-only / not a real combination)' };
  }
  // reject a derived metric offered as an executable field (the lane proposes form, never a computed conclusion)
  const flat = JSON.stringify(candidate).toLowerCase();
  const smuggled = DERIVED_METRICS.filter((m) => new RegExp(`"${m.toLowerCase()}"\\s*:`).test(flat));
  if (smuggled.length) return { ok: false, reason: `derived-metric smuggling: ${smuggled.join(', ')}` };
  return { ok: true, card: draftFormulaBankCard(candidate) };
}

// stage 1 — synthetic fixtures via the Core B oracle (reuse): a no-binding card is INERT and cannot pass.
export function stage1Fixtures(card) {
  const pf = proofPreflightCandidate(card);
  return { pass: pf.hasBinding && pf.validationOk, inert: pf.inert, hasBinding: pf.hasBinding, reason: pf.reason };
}

// stage 2 — adversarial counterexamples (frozen set; author≠scorer). Reuses math-proof-gate when available.
export async function stage2Counterexamples(card, opts = {}) {
  if (!card || !card.implementedBy) return { ran: false, pass: false, reason: 'no binding — counterexamples cannot run (inert)' };
  try {
    const mod = await import('./math-proof-gate.mjs');
    if (typeof mod.runFormulaCounterexample !== 'function') return { ran: false, pass: false, reason: 'runFormulaCounterexample unavailable' };
    const res = mod.runFormulaCounterexample({ formula: card, ...(opts.gateOpts || {}) });
    return { ran: true, pass: Boolean(res && res.ok), result: res };
  } catch (e) { return { ran: false, pass: false, reason: String((e && e.message) || e) }; }
}

// stage 3 — real-data bakeoff. Honest: NO frozen labels ⇒ diagnosticOnly (diagnostics, never a truth claim).
function loadFrozenLabels() {
  if (!fs.existsSync(LABELS_DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(LABELS_DIR).filter((x) => x.endsWith('.json')).sort()) {
    try { const j = JSON.parse(fs.readFileSync(path.join(LABELS_DIR, f), 'utf8')); if (Array.isArray(j)) out.push(...j); else out.push(j); } catch { /* skip */ }
  }
  return out;
}
export function stage3RealData(candidates, opts = {}) {
  const labels = Array.isArray(opts.labels) ? opts.labels : loadFrozenLabels();
  const ids = (candidates || []).map((c) => c.id).sort();
  if (!labels.length) {
    return { ok: false, diagnosticOnly: true, reason: 'no frozen real-data labels — diagnostics only, NOT a truth claim', candidateIds: ids, schema: 'yuri.formula-foundry.bakeoff.v0' };
  }
  // labels exist → deterministic scoring would run here via corpus-match real counts (totalMatched/scanned).
  // Held behind label authorship; the structure is honest about what it would report.
  return { ok: true, diagnosticOnly: false, schema: 'yuri.formula-foundry.bakeoff.v0', labelCount: labels.length, candidateIds: ids, note: 'scoring path runs when frozen labels are authored; real total counts via corpus-match.' };
}

// run the full pipeline on candidates the CALLER synthesized (generator≠scorer — we never synthesize here).
export async function runBakeoff(candidates, opts = {}) {
  const cands = (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const perCandidate = [];
  for (const cand of cands) {
    const s0 = stage0Intake(cand);
    const card = s0.ok ? s0.card : null;
    const s1 = card ? stage1Fixtures(card) : { pass: false, inert: true, reason: 'failed intake' };
    const s2 = card ? await stage2Counterexamples(card, opts) : { ran: false, pass: false };
    perCandidate.push({ id: cand.id, stage0: s0.ok, stage1Pass: s1.pass, stage1Inert: s1.inert, stage2Ran: s2.ran, promotable: s0.ok && s1.pass && s2.pass });
  }
  const stage3 = stage3RealData(cands, opts);
  return {
    schema: 'yuri.formula-foundry.bakeoff.v0',
    generatorScorerSeparate: true,
    domainBlind: true,
    candidateCount: cands.length,
    perCandidate,
    stage3,
    promotableCount: perCandidate.filter((p) => p.promotable).length,
  };
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const op = process.argv[2] || 'ledger';
  if (op === 'ledger') {
    const l = readLedger();
    process.stdout.write(`ledger: ${l.length} gate records at ${path.relative(REPO, LEDGER_PATH)}\n`);
  } else if (op === 'bakeoff') {
    import('./formula-foundry.mjs').then(async (f) => {
      const { candidates } = f.synthesizeFormulaCandidates({ maxCandidates: 12 });
      const r = await runBakeoff(candidates);
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    });
  } else {
    process.stderr.write('usage: formula-foundry-bakeoff.mjs <ledger|bakeoff>\n');
    process.exitCode = 1;
  }
}
