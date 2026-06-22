#!/usr/bin/env node
// @capability: mure-governance-gate
// @serves: agent self governance gate | 6-gate charter | self-governable or owner-gated | mure governance | decide vs hold | blast radius gate | contention check
// @does: the deterministic implementation of YURI's Self-Governance Charter for MURE roles. Given a proposed decision, returns SELF-GOVERNABLE (decide + execute) iff ALL six gates pass (reversible · evidence-decidable · in-doctrine · blast<=MEDIUM · not-outward · not-contended) AND no constitution veto (protected-path / arming / secrets). ANY failure → OWNER-GATED (a finished ruling that HOLDS for a one-token owner confirm). Pure, conservative (missing info → owner-gated), and cross-references the energy protected-path veto via math-bridge. NEVER LLM-judged — this is code, by design (AG2 OnContextCondition principle).
// @use: import { evaluateGovernance, CLASS } from mure/governance.mjs; const r = evaluateGovernance(decision). decision = {reversible,evidenceDecidable,inDoctrine,blastRadius,outwardFacing,contended,arming,files,transition}.
// @exports: evaluateGovernance, classify, CLASS, BLAST, GATES, DOCTRINE_NOTE
//
// Authority: this IS the gate. A role can register new capabilities but CANNOT modify this gate (closes the
// Gödel-Agent self-modification gap). Arming any gate is ALWAYS owner-gated regardless of the six gates.

import { governanceVeto } from './math-bridge.mjs';

export const CLASS = Object.freeze({ SELF: 'self-governable', OWNER: 'owner-gated' });
export const BLAST = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 });
export const GATES = Object.freeze(['reversible', 'evidenceDecidable', 'inDoctrine', 'blastRadius', 'notOutward', 'notContended']);
export const DOCTRINE_NOTE = 'DISARMED-first · capability-first · Mutation Contract · Protected Surfaces · adversarial verification · no-downgrade';

function blastRank(b) {
  // A numeric blast must be an in-range tier index; a negative / out-of-range / non-integer number is
  // MALFORMED → HIGH (conservative). (native red-team #1: blastRadius:-1 must not read as "safer than LOW".)
  if (typeof b === 'number') return (Number.isInteger(b) && b >= 0 && b <= BLAST.CRITICAL) ? b : BLAST.HIGH;
  const k = String(b || 'HIGH').toUpperCase(); // missing blast → HIGH (conservative)
  return Object.prototype.hasOwnProperty.call(BLAST, k) ? BLAST[k] : BLAST.HIGH;
}

/**
 * Constitution veto — the non-negotiable owner-gate triggers that DOMINATE the six gates.
 * Returns { veto:boolean, reasons:string[] }.
 *   - protected-path: any decision file under a protected surface (energy isProtectedPath, via math-bridge)
 *   - arming: creating a flag / setting an arm env / wiring a live caller of a gated capability
 *   - secrets/outward-publish handled in the six gates + here for secrets
 */
// The gate cannot authorize editing ITSELF (the Gödel-Agent self-modification gap). Enforced HERE at the
// gate layer, not only in goal-engine's pre-filter — so EVERY caller (steward, company.decisionFor, a direct
// evaluateGovernance) is covered, not just the goal-cycle path. (GLM-5.2 final-gate HIGH-1.)
const GATE_SELF_RE = /(^|\/)mure\/governance\.mjs$/i; // case-insensitive (native red-team #2)
export function constitutionVeto(decision = {}) {
  const reasons = [];
  const files = Array.isArray(decision.files) ? decision.files : [];
  for (const f of files) {
    const fp = String(f).replace(/\\/g, '/'); // normalize Windows-style separators (GLM-5.2 re-verify LOW)
    if (GATE_SELF_RE.test(fp)) reasons.push('gate-self-modification');
    const v = governanceVeto({ filePath: fp, isMutating: true }); // governanceVeto checks raw + lowercased path
    if (v.veto) reasons.push(`protected-path:${f}`);
  }
  if (decision.transition) {
    const v = governanceVeto(decision.transition);
    if (v.veto) reasons.push(v.reason || 'protected-path:transition');
  }
  // Truthy-coerce (not === true): any truthy arming/secrets value vetoes — a non-boolean must not slip past.
  if (decision.arming) reasons.push('arming-a-gate');
  if (decision.touchesSensitive) reasons.push('secrets');
  return { veto: reasons.length > 0, reasons };
}

/**
 * Evaluate the six gates. Each gate is true=pass. Missing booleans default to FAIL (conservative —
 * ambiguous decisions are owner-gated, never silently self-executed).
 */
export function evaluateGates(decision = {}) {
  return {
    // reversible/evidence/doctrine require EXPLICIT true (missing → fail, conservative). arming (any truthy)
    // makes it non-reversible-for-self.
    reversible: decision.reversible === true && !decision.arming,
    evidenceDecidable: decision.evidenceDecidable === true,
    inDoctrine: decision.inDoctrine === true,
    blastRadius: blastRank(decision.blastRadius) <= BLAST.MEDIUM,
    // notOutward/notContended falsy-coerce: any truthy value (incl. a non-boolean like 'true' or 1) gates.
    notOutward: !decision.outwardFacing,
    notContended: !decision.contended,
  };
}

/**
 * Full governance ruling. SELF-GOVERNABLE iff (no constitution veto) AND (all six gates pass).
 * @returns {{class, gates, failures, veto, vetoReasons, blast, ruling, decisionId}}
 */
export function evaluateGovernance(decision = {}) {
  const veto = constitutionVeto(decision);
  const gates = evaluateGates(decision);
  const failures = GATES.filter((g) => !gates[g]);
  const selfGovernable = !veto.veto && failures.length === 0;
  const cls = selfGovernable ? CLASS.SELF : CLASS.OWNER;
  const id = String(decision.id || decision.summary || 'decision').slice(0, 80);
  let ruling;
  if (selfGovernable) {
    ruling = `SELF-GOVERNABLE — decide + execute. All 6 gates pass, no veto. (${DOCTRINE_NOTE})`;
  } else if (veto.veto) {
    ruling = `OWNER-GATED — constitution veto: ${veto.reasons.join(', ')}. Produce a finished ruling and HOLD for owner confirm.`;
  } else {
    ruling = `OWNER-GATED — failed gate(s): ${failures.join(', ')}. Produce a finished ruling (calc/sim + recommendation + reversibility/blast) and HOLD for one-token owner confirm.`;
  }
  return {
    class: cls,
    gates,
    failures,
    veto: veto.veto,
    vetoReasons: veto.reasons,
    blast: blastRank(decision.blastRadius),
    ruling,
    decisionId: id,
  };
}

/** Convenience: just the class string. */
export function classify(decision = {}) {
  return evaluateGovernance(decision).class;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--decision');
  let decision = {};
  if (i >= 0) { try { decision = JSON.parse(argv[i + 1]); } catch { /* */ } }
  process.stdout.write(`${JSON.stringify(evaluateGovernance(decision), null, 2)}\n`);
}
