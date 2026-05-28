#!/usr/bin/env node
/**
 * Test worker for yuri-energy-trace.test.mjs parallel-append test.
 *
 * Spawned via child_process.fork from the test. Receives runId and tmpDir
 * (and optional date override) as argv. Builds a synthetic trace record and
 * appends it via the real appendTrace path. Exits 0 on success, 1 on failure.
 *
 * This is a test-only worker. Not imported by production code.
 */

import {
  buildTraceRecord,
  appendTrace,
} from './yuri-energy-trace.mjs';
import {
  computeU,
  computeDeltaU,
  gateProposal,
} from './yuri-energy.mjs';

const [runId, tmpDir, dateOverride] = process.argv.slice(2);

if (!runId || !tmpDir) {
  console.error('usage: yuri-energy-trace-test-worker.mjs <runId> <tmpDir> [date]');
  process.exit(2);
}

const stateBefore = {
  claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3 },
  claimedDistribution: [0.5, 0.3, 0.2],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 12,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

const stateAfter = {
  claimPromotionDistribution: { draft: 4, research: 8, fixture_ready: 4 },
  claimedDistribution: [0.4, 0.3, 0.3],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 13,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

try {
  const computeUResult = computeU(stateAfter);
  const computeDeltaUResult = computeDeltaU(stateBefore, stateAfter);
  const gateProposalResult = gateProposal({ stateBefore, stateAfter });
  const record = buildTraceRecord({
    lane: 'parallel-worker',
    runId,
    stateBefore,
    stateAfter,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult,
  });
  appendTrace(record, { traceDir: tmpDir, dateOverride });
  process.exit(0);
} catch (err) {
  console.error(`worker ${runId} failed: ${err.message}`);
  process.exit(1);
}
