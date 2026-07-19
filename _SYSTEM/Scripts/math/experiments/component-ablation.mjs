// component-ablation.mjs — recovered, pure v3 compatibility scenario for the
// tracked ablation harness. The historical untracked fixture was lost; these
// transitions preserve its documented per-component isolation behavior.

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const uniformSix = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];

const scenario = deepFreeze([
  {
    label: 'T_a:entropy-signal',
    stateBefore: { claimPromotionDistribution: [1, 0] },
    stateAfter: { claimPromotionDistribution: [1, 1] },
  },
  {
    label: 'T_b:drift-reject',
    stateBefore: {
      claimedDistribution: uniformSix,
      verifiedDistribution: uniformSix,
    },
    stateAfter: {
      claimedDistribution: uniformSix,
      verifiedDistribution: [0, 0, 1, 0, 0, 0],
    },
  },
  {
    label: 'T_g:logLoss-signal',
    stateBefore: { predictions: [0.1], outcomes: [0] },
    stateAfter: { predictions: [0.49], outcomes: [0] },
  },
  {
    label: 'T_d:brier-signal',
    stateBefore: { forecasts: [0], results: [0] },
    stateAfter: { forecasts: [0.5], results: [0] },
  },
  {
    label: 'T_e:infoGain-credit',
    stateBefore: {
      priorState: [1, 1, 1, 1],
      posteriorState: [1, 1, 1, 1],
    },
    stateAfter: {
      priorState: [1, 1, 1, 1],
      posteriorState: [1, 0, 0, 0],
    },
  },
  {
    label: 'T_z:staleness-signal',
    stateBefore: { evidence: [{ base: 1, age: 0, halfLife: 7 }] },
    stateAfter: { evidence: [{ base: 1, age: 70, halfLife: 7 }] },
  },
  {
    label: 'T_i:evidence-credit',
    stateBefore: { verifiedEvidenceCount: 0 },
    stateAfter: { verifiedEvidenceCount: 10 },
  },
  {
    label: 'T_r:lambda+kappa-reject',
    stateBefore: {
      predictions: [],
      outcomes: [],
      forecasts: [0],
      results: [0],
    },
    stateAfter: {
      predictions: [0.99, 0.99, 0.99],
      outcomes: [0, 0, 0],
      forecasts: [2],
      results: [0],
    },
  },
  {
    label: 'T_l:lambda-only',
    stateBefore: { forecasts: [0], results: [0] },
    stateAfter: { forecasts: [2], results: [0] },
  },
  {
    label: 'T_k:kappa-offset',
    stateBefore: { predictions: [0.01, 0.01], outcomes: [0, 0] },
    stateAfter: { predictions: [0.99, 0.99], outcomes: [0, 0] },
  },
  {
    label: 'T_k2:kappa-raw',
    stateBefore: { predictions: [], outcomes: [] },
    stateAfter: { predictions: [0.9, 0.9, 0.9], outcomes: [0, 0, 0] },
  },
  {
    label: 'T_m:overconfidence-signal',
    stateBefore: {
      claimedDistribution: [1, 0, 0],
      verifiedDistribution: [1, 0, 0],
    },
    stateAfter: {
      claimedDistribution: [1, 0, 0],
      verifiedDistribution: [0, 1, 0],
    },
  },
]);

export { scenario };
export default scenario;
