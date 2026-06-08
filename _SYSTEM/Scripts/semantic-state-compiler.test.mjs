import assert from 'node:assert/strict';

import { compileSemanticStatePacket } from './semantic-state-compiler.mjs';

{
  const compiled = compileSemanticStatePacket({
    stateBefore: {
      entropy: 0.85,
      staleness_index: 'high',
      energy_delta_estimate: null,
    },
    stateAfter: {
      entropy: 0.42,
      staleness_index: 'low',
      energy_delta_estimate: -0.15,
    },
  });
  assert.equal(compiled.status, 'rejected');
  assert.equal(compiled.verification.derivedMetricSmugglingRejected, true);
  assert.deepEqual(
    compiled.result.rejectedFields.map((field) => field.field).sort(),
    ['energy_delta_estimate', 'energy_delta_estimate', 'entropy', 'entropy', 'staleness_index', 'staleness_index'].sort(),
  );
}

{
  const compiled = compileSemanticStatePacket({
    claimedMetrics: {
      entropy: 'lower',
      deltaU: 'negative',
    },
    stateBefore: {
      claimPromotionDistribution: [0.25, 0.25, 0.25, 0.25],
      claimedDistribution: [0.7, 0.1, 0.1, 0.1],
      verifiedDistribution: [0.25, 0.25, 0.25, 0.25],
      priorState: [0.25, 0.25, 0.25, 0.25],
      posteriorState: [0.25, 0.25, 0.25, 0.25],
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: 0,
    },
    stateAfter: {
      claimPromotionDistribution: [0.7, 0.1, 0.1, 0.1],
      claimedDistribution: [0.7, 0.1, 0.1, 0.1],
      verifiedDistribution: [0.7, 0.1, 0.1, 0.1],
      priorState: [0.25, 0.25, 0.25, 0.25],
      posteriorState: [0.7, 0.1, 0.1, 0.1],
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: 1,
    },
  });
  assert.equal(compiled.status, 'partial');
  assert.deepEqual(compiled.result.rejectedFields, []);
  assert.ok(compiled.result.advisoryFields.some((field) => field.path === '$.claimedMetrics.entropy'));
  assert.equal(compiled.result.compiled.stateAfter.verifiedEvidenceCount, 1);
}

{
  const compiled = compileSemanticStatePacket({
    state: {
      note: 'look in backend/data/raw.sqlite',
    },
  });
  assert.equal(compiled.status, 'rejected');
  assert.match(compiled.verification.reason, /protected path/);
}

{
  const compiled = compileSemanticStatePacket({
    mutation: 'write',
    state: {
      claimPromotionDistribution: [1],
    },
  });
  assert.equal(compiled.status, 'rejected');
  assert.match(compiled.verification.reason, /mutation/);
}

{
  const compiled = compileSemanticStatePacket({
    stateBefore: {
      verifiedDistribution: 0.82,
      protectedPathViolations: 45,
      priorState: 'unregulated_provider_dispatch',
      results: ['leakage_detected', 'overflow_event'],
    },
    stateAfter: {
      verifiedDistribution: 0.98,
      protectedPathViolations: 1,
      posteriorState: 'gated_canonical_dispatch',
      results: ['success', 'gate_blocked_safe'],
    },
  });
  assert.equal(compiled.status, 'rejected');
  assert.deepEqual(
    compiled.result.rejectedFields.map((field) => field.field).sort(),
    ['posteriorState', 'priorState', 'results', 'results', 'verifiedDistribution', 'verifiedDistribution'].sort(),
  );
  assert.ok(compiled.result.rejectedFields.every((field) => field.reason === 'canonical_type_mismatch'));
}

{
  const compiled = compileSemanticStatePacket({
    state: {
      evidence: [
        {
          base: '0.8',
          age: '2',
          halfLife: '10',
          description: 'advisory text must not ride into executable energy state',
        },
      ],
    },
  });
  assert.equal(compiled.status, 'compiled');
  assert.deepEqual(compiled.result.compiled.state.evidence, [{ base: 0.8, age: 2, halfLife: 10 }]);
}

{
  const compiled = compileSemanticStatePacket({
    state: {
      evidence: [{ label: 'human-readable evidence without executable aging fields' }],
    },
  });
  assert.equal(compiled.status, 'rejected');
  assert.ok(compiled.result.rejectedFields.some((field) => field.field === 'evidence'));
  assert.ok(compiled.result.rejectedFields.some((field) => field.expected.includes('evidence[].base')));
}

{
  const compiled = compileSemanticStatePacket({
    stateBefore: {
      evidence: [{ base: 0.72, age: 5, halfLife: 12 }],
      verifiedEvidenceCount: 3,
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
    },
    stateAfter: {
      evidence: [{ base: 0.89, age: 1, halfLife: 12 }],
      verifiedEvidenceCount: 5,
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
    },
    predictions: 'advisory prediction must not vanish beside executable states',
    outcomes: 'advisory outcome must not vanish beside executable states',
  });
  assert.equal(compiled.status, 'partial');
  assert.deepEqual(
    compiled.result.advisoryFields.map((field) => [field.path, field.reason]).sort(),
    [
      ['$.outcomes', 'canonical_field_outside_executable_state'],
      ['$.predictions', 'canonical_field_outside_executable_state'],
    ],
  );
  assert.equal(compiled.result.compiled.stateAfter.verifiedEvidenceCount, 5);
}

console.log('semantic-state-compiler: pass');
