// adversarial-probe.mjs — recovered, pure compatibility scenario for the
// tracked energy adversarial harness. The historical untracked fixture was
// lost; these transitions preserve its documented five attack classes and
// current v3 safety properties without I/O or runtime state.

export const ATTACK_CLASSES = Object.freeze([
  'weight-ratio',
  'component-blind-spot',
  'stale-evidence',
  'distribution-edge',
  'threshold-edge',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const uniformSix = Object.freeze([1, 1, 1, 1, 1, 1]);

export const scenario = deepFreeze([
  {
    label: 'class1:weight-ratio:entropy-vs-drift',
    stateBefore: {
      claimPromotionDistribution: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      claimedDistribution: uniformSix,
      verifiedDistribution: uniformSix,
    },
    stateAfter: {
      claimPromotionDistribution: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      claimedDistribution: uniformSix,
      verifiedDistribution: [0, 0, 1, 0, 0, 0],
    },
  },
  {
    label: 'class2:component-blind-spot:malformed-outcome',
    stateBefore: { predictions: [], outcomes: [] },
    stateAfter: { predictions: [0.99], outcomes: [2] },
  },
  {
    label: 'class3:stale-evidence:at-cap',
    stateBefore: {
      verifiedEvidenceCount: 0,
      evidence: [{ base: 1, age: 0, halfLife: 7 }],
    },
    stateAfter: {
      verifiedEvidenceCount: 50,
      evidence: [{ base: 1, age: 70, halfLife: 7 }],
    },
  },
  {
    label: 'class4:distribution-edge:length-mismatch',
    stateBefore: {
      claimedDistribution: [1, 0, 0],
      verifiedDistribution: [1, 0, 0],
    },
    stateAfter: {
      claimedDistribution: [1, 0, 0],
      verifiedDistribution: [0, 1],
    },
  },
  {
    label: 'class5:threshold-edge:epsilon-above',
    stateBefore: {},
    stateAfter: { claimPromotionDistribution: [0.9999999999, 0.0000000001] },
  },
  {
    label: 'class1:weight-ratio:protected-path-mask',
    stateBefore: { protectedPathViolations: 0, verifiedEvidenceCount: 0 },
    stateAfter: { protectedPathViolations: 1, verifiedEvidenceCount: 50 },
  },
  {
    label: 'class1:weight-ratio:ladder-inversion-mask',
    stateBefore: { promotionLadderInversions: 0, verifiedEvidenceCount: 0 },
    stateAfter: { promotionLadderInversions: 1, verifiedEvidenceCount: 50 },
  },
]);

export const expectVeto = deepFreeze([
  { shouldReject: true, vetoExpected: false },
  { shouldReject: true, vetoExpected: false },
  { shouldReject: true, vetoExpected: false },
  { shouldReject: true, vetoExpected: false },
  { shouldReject: true, vetoExpected: false },
  { shouldReject: true, vetoExpected: true },
  { shouldReject: true, vetoExpected: true },
]);

export default scenario;
