// @capability: energy-labelaudit
// @serves: label-audit for energy-gate outcome derivation | identity-leak control | per-rule spot-check
// @does: (a) proves that calibrating the gate to its own verdict is circular — a trivial model
//   on gate features (sign of deltaU) achieves ~100% accuracy on the gate's own accept/reject
//   decision, making auto-labels derived from the gate's verdict worthless as calibration targets;
//   (b) per-rule spot-check quantifies each deriver rule's fire rate over firings+signals and checks
//   that rules are not just re-encoding the gate's decision — falsifiable: R1 must fire on accepts
//   (gate said yes, later reverted), R2 must fire on rejects (gate said no, retry succeeded),
//   R3 must not be equivalent to the gate's accept decision.
// @use: identityLeakAudit(firings) for the identity-leak baseline; ruleSpotCheck(firings, signals)
//   for per-rule fire rates and bias checks; fullAudit(firings, signals) for both.
// @exports: identityLeakAudit, ruleSpotCheck, fullAudit
//
// IDENTITY-LEAK PROOF: the energy gate rejects when deltaU > 0 (proposal increases energy) and
// accepts when deltaU <= 0. This is a deterministic threshold rule. Any model that learns
// sign(deltaU) -> decision will achieve ~100% accuracy. This proves that outcome labels derived
// from the gate's own verdict (accept -> "survived", reject -> "rejected-correctly") are CIRCULAR:
// they re-encode the gate's deterministic rule, not an external ground truth. Calibration against
// such labels would calibrate the gate to agree with itself — worthless.
//
// PER-RULE INDEPENDENCE: the deriver's R1/R2/R3 rules use EXTERNAL signals (isReverted,
// isRetriedAndSucceeded, isPromoted). Each rule must be shown to provide information BEYOND the
// gate's own decision. The falsifiable checks are:
//   R1 (reverted): must fire on at least some ACCEPTED proposals (gate said yes, outcome was bad)
//   R2 (retried-and-succeeded): must fire on at least some REJECTED proposals (gate said no, retry worked)
//   R3 (promoted): must NOT be equivalent to the gate's accept decision (some accepts are not promoted)
//
// DISARMED: this module is read-only analysis. It never writes the live prediction ledger.

import { readFirings, deriveOutcome } from '../energy-outcome-deriver.mjs';

// RULES array duplicated from deriver (not exported there — safer to keep local than modify the deriver).
// Matches the deriver's fixed-precedence rule engine exactly.
const RULES = [
  { id: 'R1', effect: 'reverted',             test: (f, s) => !!s.isReverted?.(f.runId) },
  { id: 'R2', effect: 'retried-and-succeeded', test: (f, s) => !!s.isRetriedAndSucceeded?.(f.runId) },
  { id: 'R3', effect: 'survived',              test: (f, s) => !!s.isPromoted?.(f.runId) },
];

// ── 1. identityLeakAudit ──────────────────────────────────────────────────────
// Fits a trivial calibrator on gate features -> gate's own decision and proves it's circular.
//
// The trivial model: predict reject if deltaU > 0, accept otherwise.
// This IS the gate's own rule (gateProposal rejects when deltaU > threshold, threshold ~= 0).
// If this model achieves ~100% accuracy, then any "calibration" using the gate's own verdict
// as a label is just learning the gate's deterministic rule — a circular, worthless baseline.
//
// Returns:
//   { n, trivialAccuracy, trivialBrier, leakScore, verdict, firingsByDecision }
//   - trivialAccuracy: fraction of firings where sign(deltaU) matches the gate's decision
//   - trivialBrier: Brier score of the trivial model (sigmoid(|deltaU|) as confidence)
//   - leakScore: 1.0 = perfect identity leak (gate decision fully determined by its own features)
//   - verdict: 'CIRCULAR' if leakScore >= 0.95, 'SUSPECT' if >= 0.80, 'CLEAN' otherwise

export function identityLeakAudit(firings) {
  if (!firings) {
    firings = readFirings();
  }
  if (firings.length === 0) {
    return {
      n: 0, trivialAccuracy: NaN, trivialBrier: NaN, leakScore: NaN,
      verdict: 'NO_DATA', firingsByDecision: { accepts: 0, rejects: 0 },
      acceptsPosDelta: 0, rejectsNegDelta: 0,
    };
  }

  let correct = 0;
  let brierSum = 0;
  let accepts = 0;
  let rejects = 0;
  let acceptsPosDelta = 0;  // accepts with deltaU > 0 (should be ~0)
  let rejectsNegDelta = 0;  // rejects with deltaU <= 0 (should be ~0)

  for (const f of firings) {
    const du = Number(f.deltaU) || 0;
    const dec = f.decision;
    if (!dec) continue;

    // Trivial model: predict reject if deltaU > 0, accept otherwise
    const predicted = du > 0 ? 'reject' : 'accept';
    const actual = dec;

    if (predicted === actual) correct++;

    // Brier score: confidence from sigmoid(|deltaU|), outcome 1 if reject, 0 if accept
    const confidence = 1 / (1 + Math.exp(-Math.abs(du)));
    const outcome = dec === 'reject' ? 1 : 0;
    brierSum += (confidence - outcome) ** 2;

    if (dec === 'accept') {
      accepts++;
      if (du > 0) acceptsPosDelta++;
    } else {
      rejects++;
      if (du <= 0) rejectsNegDelta++;
    }
  }

  const n = accepts + rejects;
  if (n === 0) {
    return {
      n: 0, trivialAccuracy: NaN, trivialBrier: NaN, leakScore: NaN,
      verdict: 'NO_DATA', firingsByDecision: { accepts: 0, rejects: 0 },
      acceptsPosDelta: 0, rejectsNegDelta: 0,
    };
  }

  const trivialAccuracy = correct / n;
  const trivialBrier = brierSum / n;

  // Leak score: how well the gate's own features predict its own decision.
  // 1.0 = perfect (the decision is fully determined by features the gate already uses).
  // This IS expected for a deterministic gate — the point is that calibration against
  // the gate's own verdict is circular, not that the gate is broken.
  const leakScore = trivialAccuracy;

  let verdict;
  if (leakScore >= 0.95) verdict = 'CIRCULAR';
  else if (leakScore >= 0.80) verdict = 'SUSPECT';
  else verdict = 'CLEAN';

  return {
    n,
    trivialAccuracy,
    trivialBrier,
    leakScore,
    verdict,
    firingsByDecision: { accepts, rejects },
    acceptsPosDelta,
    rejectsNegDelta,
    // The key finding: if trivialAccuracy ~= 1.0, then the gate's own verdict
    // is a deterministic function of its inputs. Using it as a calibration label
    // is circular — you'd be calibrating the gate to agree with itself.
    interpretation: trivialAccuracy >= 0.95
      ? 'IDENTITY LEAK: the gate decision is a deterministic function of deltaU. ' +
        'Using the gate\'s own verdict as an outcome label is circular — ' +
        'calibration would just learn the gate\'s existing rule. ' +
        'Outcome labels MUST come from external signals (R1/R2/R3).'
      : trivialAccuracy >= 0.80
        ? 'SUSPECT: the gate decision is mostly determined by deltaU. ' +
          'Using the gate\'s own verdict as an outcome label risks circularity. ' +
          'External signals should dominate the label derivation.'
        : 'CLEAN: the gate decision is not trivially determined by deltaU. ' +
          'The gate\'s verdict may carry independent information.',
  };
}

// ── 2. ruleSpotCheck ──────────────────────────────────────────────────────────
// For each deriver rule R1/R2/R3, quantifies fire rate and checks independence
// from the gate's own decision.
//
// Falsifiable checks:
//   R1 (reverted): must fire on at least some ACCEPTED proposals
//     (gate said yes, but the proposal was later reverted — genuinely new info)
//   R2 (retried-and-succeeded): must fire on at least some REJECTED proposals
//     (gate said no, but retry succeeded — genuinely new info)
//   R3 (promoted): must NOT be equivalent to the gate's accept decision
//     (some accepts are not promoted — promotion adds info beyond acceptance)
//
// Returns per-rule: { id, effect, fireCount, fireRate, acceptsHit, rejectsHit,
//                      mutualInformation, independenceVerdict }

export function ruleSpotCheck(firings, signals) {
  if (!firings || firings.length === 0) {
    firings = readFirings();
  }
  if (!signals) {
    signals = {};
  }

  const n = firings.length;
  if (n === 0) {
    return { n: 0, rules: [], overallVerdict: 'NO_DATA' };
  }

  const results = [];

  for (const rule of RULES) {
    let fireCount = 0;
    let acceptsHit = 0;  // rule fires on a firing where decision=accept
    let rejectsHit = 0;  // rule fires on a firing where decision=reject
    let acceptsTotal = 0;
    let rejectsTotal = 0;

    for (const f of firings) {
      const dec = f.decision;
      if (dec === 'accept') acceptsTotal++;
      else if (dec === 'reject') rejectsTotal++;

      if (rule.test(f, signals)) {
        fireCount++;
        if (dec === 'accept') acceptsHit++;
        else if (dec === 'reject') rejectsHit++;
      }
    }

    const fireRate = fireCount / n;

    // Mutual information between rule firing and gate decision.
    // MI(R; D) = sum_{r,d} P(r,d) log2(P(r,d) / (P(r)P(d)))
    // If MI ~= 0, the rule is independent of the gate's decision (good).
    // If MI ~= H(D), the rule is perfectly correlated with the gate's decision (bad — laundering).
    const pFire = fireCount / n;
    const pAccept = acceptsTotal / n;
    const pReject = rejectsTotal / n;

    // Joint probabilities
    const pFireAccept = acceptsHit / n;
    const pFireReject = rejectsHit / n;
    const pNotFire = 1 - pFire;

    const pNotFireAccept = (acceptsTotal - acceptsHit) / n;
    const pNotFireReject = (rejectsTotal - rejectsHit) / n;

    // Compute MI safely (avoid log(0))
    let mi = 0;
    const joints = [
      { pr: pFireAccept, pr1: pFire, pr2: pAccept },
      { pr: pFireReject, pr1: pFire, pr2: pReject },
      { pr: pNotFireAccept, pr1: pNotFire, pr2: pAccept },
      { pr: pNotFireReject, pr1: pNotFire, pr2: pReject },
    ];
    for (const j of joints) {
      if (j.pr > 0 && j.pr1 > 0 && j.pr2 > 0) {
        const ratio = j.pr / (j.pr1 * j.pr2);
        if (ratio > 0) mi += j.pr * Math.log2(ratio);
      }
    }

    // Entropy of decision for normalization
    let hDecision = 0;
    if (pAccept > 0) hDecision -= pAccept * Math.log2(pAccept);
    if (pReject > 0) hDecision -= pReject * Math.log2(pReject);

    // Normalized MI: 0 = independent, 1 = perfectly correlated
    const normalizedMI = hDecision > 0 ? mi / hDecision : 0;

    // Falsifiable independence checks per rule
    let independenceVerdict;
    if (rule.id === 'R1') {
      // R1 (reverted) must fire on at least some accepts
      if (acceptsHit > 0) {
        independenceVerdict = 'INDEPENDENT';
      } else if (fireCount === 0) {
        independenceVerdict = 'NO_FIRES';
      } else {
        independenceVerdict = 'LAUNDERING';
      }
    } else if (rule.id === 'R2') {
      // R2 (retried-and-succeeded) must fire on at least some rejects
      if (rejectsHit > 0) {
        independenceVerdict = 'INDEPENDENT';
      } else if (fireCount === 0) {
        independenceVerdict = 'NO_FIRES';
      } else {
        independenceVerdict = 'LAUNDERING';
      }
    } else if (rule.id === 'R3') {
      // R3 (promoted) must not be equivalent to accept
      // It's OK for R3 to fire mostly on accepts (you can't promote what wasn't accepted),
      // but it must not fire on ALL accepts (some accepts are not promoted)
      if (fireCount === 0) {
        independenceVerdict = 'NO_FIRES';
      } else if (acceptsTotal > 0 && acceptsHit === acceptsTotal) {
        // R3 fires on every accept — it's just re-encoding the gate's accept decision
        independenceVerdict = 'LAUNDERING';
      } else if (acceptsHit < acceptsTotal) {
        // R3 fires on some but not all accepts — it adds information
        independenceVerdict = 'INDEPENDENT';
      } else {
        independenceVerdict = 'INDEPENDENT';
      }
    } else {
      independenceVerdict = 'UNKNOWN';
    }

    results.push({
      id: rule.id,
      effect: rule.effect,
      fireCount,
      fireRate,
      acceptsHit,
      rejectsHit,
      acceptsTotal,
      rejectsTotal,
      mutualInformation: mi,
      normalizedMI,
      independenceVerdict,
    });
  }

  // Overall verdict: all rules must be INDEPENDENT or NO_FIRES (no signal yet is OK,
  // laundering is not)
  const laundering = results.filter(r => r.independenceVerdict === 'LAUNDERING');
  const overallVerdict = laundering.length > 0
    ? 'LAUNDERING_DETECTED'
    : results.every(r => r.independenceVerdict === 'NO_FIRES')
      ? 'NO_SIGNALS'
      : 'INDEPENDENT';

  return { n, rules: results, overallVerdict };
}

// ── 3. fullAudit ─────────────────────────────────────────────────────────────
// Runs both identity-leak audit and per-rule spot-check.

export function fullAudit(firings, signals) {
  if (!firings || firings.length === 0) {
    firings = readFirings();
  }
  if (!signals) {
    signals = {};
  }

  const identityLeak = identityLeakAudit(firings);
  const ruleCheck = ruleSpotCheck(firings, signals);

  // Build a combined conclusion
  let conclusion = '';
  if (identityLeak.verdict === 'CIRCULAR') {
    conclusion = 'IDENTITY LEAK: the gate\'s own verdict is a deterministic function of deltaU. ' +
      'Calibrating against the gate\'s own labels is circular. ';
  } else if (identityLeak.verdict === 'SUSPECT') {
    conclusion = 'SUSPECT: the gate\'s verdict is mostly determined by deltaU. ';
  } else {
    conclusion = 'CLEAN: the gate\'s verdict is not trivially determined by deltaU. ';
  }

  if (ruleCheck.overallVerdict === 'LAUNDERING_DETECTED') {
    conclusion += 'LAUNDERING DETECTED: some deriver rules are re-encoding the gate\'s decision. ' +
      'The laundering rules are: ' +
      ruleCheck.rules.filter(r => r.independenceVerdict === 'LAUNDERING').map(r => r.id).join(', ') + '. ';
  } else if (ruleCheck.overallVerdict === 'NO_SIGNALS') {
    conclusion += 'No external signals available yet — per-rule independence cannot be verified. ' +
      'Outcome labels MUST come from external signals (R1/R2/R3), not the gate\'s own verdict.';
  } else {
    conclusion += 'All deriver rules are independent of the gate\'s decision. ' +
      'Outcome labels from external signals (R1/R2/R3) are valid calibration targets.';
  }

  return {
    identityLeak,
    ruleSpotCheck: ruleCheck,
    conclusion,
  };
}
