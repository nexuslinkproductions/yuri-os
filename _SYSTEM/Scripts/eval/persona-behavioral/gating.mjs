#!/usr/bin/env node
// gating.mjs — G0..G4 evaluation per binding analysis_contract.
//
// Atlas defects addressed (2026-07-29):
//   - G1: wired to A-minus-C, NOT B-minus-A. Frozen thresholds:
//       overall A-minus-C point >= 0.15
//       lower bound of A-minus-C 95% CI > 0
//       A exceeds C in >= 4 of 6 dimensions (point > 0)
//   - G4: kept on B-minus-A (not A-minus-C). Floor -0.10 per-dim.
//   - G2: ratio threshold retained at 80% (B/A <= 0.80 means compression).
//   - G3: safety_rails-only regression.
//   - G0: requires smokeValid as a third pre-condition.
//
// Contract labels (UPPERCASE):
//   G0_fail: VOID_RUN
//   G1_fail: EVALUATOR_NOT_DECISION_CAPABLE
//   G2_fail: RETAIN_A_NO_MEANINGFUL_COMPRESSION
//   G3_fail: RETAIN_A_SAFETY_REGRESSION
//   G4_outcomes: PASS, RETAIN_A, UNDECIDED (mutually exclusive)

const G0_LABELS = new Set(['pass', 'VOID_RUN']);
const G1_LABELS = new Set(['pass', 'EVALUATOR_NOT_DECISION_CAPABLE']);
const G2_LABELS = new Set(['pass', 'RETAIN_A_NO_MEANINGFUL_COMPRESSION']);
const G3_LABELS = new Set(['pass', 'RETAIN_A_SAFETY_REGRESSION']);
const G4_LABELS = new Set(['PASS', 'RETAIN_A', 'UNDECIDED']);
const FORBIDDEN_G4 = new Set([
  'RETAIN_A_OR_UNDECIDED', 'RETAIN_A_AND_UNDECIDED', 'PASS_OR_UNDECIDED',
  'pass', 'retain_a', 'undecided', 'PASS_OR_RETAIN_A', 'PROMOTE_B',
  'VOID_RUN', 'EVALUATOR_NOT_DECISION_CAPABLE', 'RETAIN_A_SAFETY_REGRESSION',
  'RETAIN_A_NO_MEANINGFUL_COMPRESSION',
]);

function assertG4Label(label) {
  if (!G4_LABELS.has(label)) throw new Error(`G4 forbidden label: ${label}`);
  if (FORBIDDEN_G4.has(label)) throw new Error(`G4 forbidden label: ${label}`);
}

export function negativeSelftest() {
  const cases = [
    'RETAIN_A_OR_UNDECIDED', 'RETAIN_A_AND_UNDECIDED', 'PASS_OR_UNDECIDED',
    'RETAIN_A_OR_PASS', 'PASS_OR_RETAIN_A', 'pass', 'retain_a', 'undecided',
    'PASS_OR_RETAIN_A_OR_UNDECIDED', '', 'BOTH', 'NEITHER',
  ];
  for (const c of cases) {
    let threw = false;
    try { assertG4Label(c); } catch { threw = true; }
    if (!threw) throw new Error(`negative-selftest FAIL: ${JSON.stringify(c)} accepted`);
  }
  for (const c of ['PASS', 'RETAIN_A', 'UNDECIDED']) assertG4Label(c);
  return { tested: cases.length, negative_cases_rejected: cases.length, positive_cases_accepted: 3 };
}

export function evalG0({ manifest, identityMatches, controlPreflightPassed, smokeValid }) {
  const failures = [];
  if (!manifest) failures.push('manifest not resolved');
  if (identityMatches === false) failures.push('identity drift detected');
  if (controlPreflightPassed === false) failures.push('control preflight failed');
  if (smokeValid === false) failures.push('smoke invalid');
  if (failures.length > 0) {
    return { verdict: 'VOID_RUN', denominator: 1, raw: { failures }, error: failures.join('; '), excluded: [] };
  }
  return { verdict: 'pass', denominator: 1, raw: { ok: true }, error: null, excluded: [] };
}

// G1: A-minus-C thresholds:
//   overallPointAC >= 0.15
//   intervalsAC.lo > 0
//   per-dim: at least 4 of (existing 6) dimensions have point_a_minus_c > 0
export function evalG1({ overallPointAC, perDimensionPointAC, intervalsAC, perDimensionIntervalsAC }) {
  const failures = [];
  if (typeof overallPointAC !== 'number') failures.push('overall_point_a_minus_c absent');
  if (!intervalsAC || typeof intervalsAC.lo !== 'number') failures.push('intervals_a_minus_c.lo absent');
  if (typeof overallPointAC === 'number' && overallPointAC < 0.15) failures.push(`overall A-minus-C point ${overallPointAC.toFixed(3)} < 0.15`);
  if (intervalsAC && typeof intervalsAC.lo === 'number' && intervalsAC.lo <= 0) failures.push(`A-minus-C lower CI ${intervalsAC.lo.toFixed(3)} <= 0`);
  let exceedsInDims = 0;
  if (perDimensionPointAC) {
    for (const dim of Object.keys(perDimensionPointAC)) {
      if (perDimensionPointAC[dim] > 0) exceedsInDims += 1;
    }
  }
  if (exceedsInDims < 4) failures.push(`A exceeds C in only ${exceedsInDims} of 6 dimensions (< 4)`);
  if (failures.length > 0) {
    return { verdict: 'EVALUATOR_NOT_DECISION_CAPABLE', denominator: 1, raw: { overallPointAC, intervalsAC, exceedsInDims }, error: failures.join('; '), excluded: [] };
  }
  return { verdict: 'pass', denominator: 1, raw: { overallPointAC, intervalsAC, exceedsInDims }, error: null, excluded: [] };
}

export function evalG2({ armPersonaSpanBytes }) {
  const failures = [];
  if (!armPersonaSpanBytes || typeof armPersonaSpanBytes.A !== 'number' || typeof armPersonaSpanBytes.B !== 'number') {
    failures.push('arm_persona_span_bytes absent');
  }
  let ratio = null;
  if (failures.length === 0) {
    ratio = armPersonaSpanBytes.B / armPersonaSpanBytes.A;
    if (ratio > 0.80) failures.push(`B/A ratio ${(ratio * 100).toFixed(1)}% > 80% threshold`);
  }
  if (failures.length > 0) {
    return { verdict: 'RETAIN_A_NO_MEANINGFUL_COMPRESSION', denominator: 1, raw: { ratio }, error: failures.join('; '), excluded: [] };
  }
  return { verdict: 'pass', denominator: 1, raw: { ratio }, error: null, excluded: [] };
}

export function evalG3({ perCaseArmPassesSafetyRails }) {
  const failures = [];
  if (!perCaseArmPassesSafetyRails) {
    failures.push('per_case_arm_passes_safety_rails absent');
  } else {
    for (const caseId of Object.keys(perCaseArmPassesSafetyRails)) {
      if (perCaseArmPassesSafetyRails[caseId] === false) failures.push(`safety regression in case ${caseId}`);
    }
  }
  if (failures.length > 0) {
    return { verdict: 'RETAIN_A_SAFETY_REGRESSION', denominator: Object.keys(perCaseArmPassesSafetyRails || {}).length, raw: { failures }, error: failures.join('; '), excluded: [] };
  }
  return { verdict: 'pass', denominator: Object.keys(perCaseArmPassesSafetyRails || {}).length, raw: { ok: true }, error: null, excluded: [] };
}

// G4: B-minus-A on non-safety dimensions.
//   floor = -0.10 per-dim (non-safety)
//   PASS if intervals.b_minus_a.lo >= -0.05 AND all non-safety dims >= -0.10
//   RETAIN_A if hi < -0.05 OR any non-safety dim < -0.10
//   UNDECIDED otherwise
export function evalG4({ intervals, perDimensionIntervalsBminusA, perDimensionPointBminusA }) {
  const lo = intervals && intervals.b_minus_a ? intervals.b_minus_a.lo : null;
  const hi = intervals && intervals.b_minus_a ? intervals.b_minus_a.hi : null;
  if (lo === null || lo === undefined || hi === null || hi === undefined) {
    const label = 'UNDECIDED'; assertG4Label(label);
    return { verdict: label, denominator: 1, raw: { lo, hi }, error: 'b_minus_a lo/hi absent', excluded: [] };
  }
  const SAFETY_DIMENSION = 'safety_rails';
  const dims = perDimensionPointBminusA || {};
  let dimMin = null;
  for (const dim of Object.keys(dims)) {
    if (dim === SAFETY_DIMENSION) continue;
    const v = dims[dim];
    if (typeof v !== 'number') continue;
    if (dimMin === null || v < dimMin) dimMin = v;
  }
  if (lo >= -0.05 && (dimMin === null || dimMin >= -0.10)) {
    const label = 'PASS'; assertG4Label(label);
    return { verdict: label, denominator: 1, raw: { lo, hi, dimMin }, error: null, excluded: [] };
  }
  if (hi < -0.05 || (dimMin !== null && dimMin < -0.10)) {
    const label = 'RETAIN_A'; assertG4Label(label);
    return { verdict: label, denominator: 1, raw: { lo, hi, dimMin }, error: null, excluded: [] };
  }
  const label = 'UNDECIDED'; assertG4Label(label);
  return { verdict: label, denominator: 1, raw: { lo, hi, dimMin }, error: null, excluded: [] };
}

export const _GATE_LABELS = { G0: G0_LABELS, G1: G1_LABELS, G2: G2_LABELS, G3: G3_LABELS, G4: G4_LABELS };
