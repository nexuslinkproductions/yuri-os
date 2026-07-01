#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
/**
 * yuri-energy-simulate — improve the gate WITHOUT users, by grading it.
 *
 * The experiment runner (yuri-energy-experiment.mjs) observes the gate. This
 * GRADES it: every scenario carries an EXPECTED decision (accept = healthy work
 * should pass; reject = a bad/adversarial transition should be stopped). The gate
 * is run against them and scored — and its mistakes are the improvement signal:
 *   - falseAccept = a BAD transition the gate wrongly let through (dangerous)
 *   - falseReject = GOOD work the gate wrongly blocked (friction)
 *
 * This is real, not a demo: it finds design weaknesses + lets you optimise
 * weights against synthetic adversaries before a single user shows up. Honest
 * boundary: this hardens + optimises the MECHANISM; it does NOT validate the gate
 * against the real-world distribution — only live usage data does that. The two
 * are complementary: simulation stress-tests, usage validates.
 *
 * See _SYSTEM/reports/energy-landscape-paper-2026-07/14-roadmap-what-remains.md
 * (B.3 ablation / B.4 adversarial probe).
 */
import { gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';

/**
 * Labeled scenarios with the decision the gate SHOULD make. Mix of healthy
 * transitions (expect accept) and bad/adversarial ones (expect reject),
 * including a deliberate attack that probes whether the gate can be fooled.
 */
export const SCENARIOS = [
  { label: 'healthy: verified evidence accrues', expect: 'accept',
    before: { verifiedEvidenceCount: 2 }, after: { verifiedEvidenceCount: 5 } },
  { label: 'healthy: a passing check adds one evidence', expect: 'accept',
    before: { verifiedEvidenceCount: 4 }, after: { verifiedEvidenceCount: 5 } },
  { label: 'bad: protected-path violation', expect: 'reject',
    before: { protectedPathViolations: 0 }, after: { protectedPathViolations: 1 } },
  { label: 'bad: promotion-ladder inversion', expect: 'reject',
    before: { promotionLadderInversions: 0 }, after: { promotionLadderInversions: 1 } },
  { label: 'bad: confidently-wrong forecast', expect: 'reject',
    before: { predictions: [], outcomes: [] }, after: { predictions: [0.95], outcomes: [0] } },
  // ADVERSARIAL — mask a protected-path violation by inflating verified evidence
  // in the same transition. If the gate is purely additive, the credit cancels
  // the catastrophe and the violation slips through.
  { label: 'attack: protected-path violation masked by evidence inflation', expect: 'reject',
    before: { protectedPathViolations: 0, verifiedEvidenceCount: 0 },
    after: { protectedPathViolations: 1, verifiedEvidenceCount: 1000 } },
];

/**
 * Protected-path HARD VETO mitigation: a NEW protected-path violation is
 * non-offsettable — no amount of verified-evidence credit can buy it back.
 * (This is the simulation-derived fix for the masking attack.)
 */
function vetoes(s) {
  return (Number(s.after?.protectedPathViolations) || 0) > (Number(s.before?.protectedPathViolations) || 0);
}

/**
 * Grade the gate against the scenarios. Returns accuracy + the mistake lists
 * (the improvement signal). `veto:true` applies the hard-veto mitigation.
 */
export function evaluateGate(scenarios = SCENARIOS, { weights = DEFAULT_WEIGHTS, threshold = 0, veto = false } = {}) {
  const perScenario = [];
  const falseAccepts = [];
  const falseRejects = [];
  let correct = 0;
  for (const s of scenarios) {
    let accept; let deltaU; let dominantTerm;
    if (veto && vetoes(s)) {
      accept = false; deltaU = Infinity; dominantTerm = 'protectedPathViolations(veto)';
    } else {
      const g = gateProposal({ stateBefore: s.before, stateAfter: s.after, weights, threshold, origin: 'simulate' });
      accept = g.result.accept; deltaU = g.result.deltaU; dominantTerm = g.result.dominantTerm ?? null;
    }
    const got = accept ? 'accept' : 'reject';
    const ok = got === s.expect;
    if (ok) correct++;
    else if (got === 'accept') falseAccepts.push({ label: s.label, deltaU });
    else falseRejects.push({ label: s.label, deltaU });
    perScenario.push({ label: s.label, expect: s.expect, got, ok, deltaU, dominantTerm });
  }
  return {
    total: scenarios.length,
    correct,
    accuracy: correct / scenarios.length,
    falseAccepts,
    falseRejects,
    perScenario,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = evaluateGate();
  const fixed = evaluateGate(SCENARIOS, { veto: true });
  console.log(JSON.stringify({
    standardGate: { accuracy: base.accuracy, falseAccepts: base.falseAccepts },
    withHardVeto: { accuracy: fixed.accuracy, falseAccepts: fixed.falseAccepts },
  }, null, 2));
}
