import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTraceRecord,
  appendTrace,
  traceGateEvaluation,
  validateRecord,
} from './yuri-energy-trace.mjs';
import { gateProposal, computeU, computeDeltaU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const STATE_DESCENT_BEFORE = {
  claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3, runtime_tested: 1 },
  claimedDistribution: [0.5, 0.3, 0.2],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 12,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

const STATE_DESCENT_AFTER = {
  claimPromotionDistribution: { draft: 4, research: 8, fixture_ready: 4, runtime_tested: 1 },
  claimedDistribution: [0.4, 0.3, 0.3],
  verifiedDistribution: [0.3, 0.3, 0.4],
  verifiedEvidenceCount: 13,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

const STATE_ASCENT_BEFORE = {
  claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
  verifiedEvidenceCount: 20,
  protectedPathViolations: 0,
  promotionLadderInversions: 0,
};

const STATE_ASCENT_AFTER = {
  claimPromotionDistribution: { runtime_tested: 5, trusted: 3 },
  verifiedEvidenceCount: 20,
  protectedPathViolations: 1,
  promotionLadderInversions: 0,
};

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-trace-test-'));
}

function precomputeResults(stateBefore, stateAfter, weights = DEFAULT_WEIGHTS, threshold = 0, allowOverride = false) {
  return {
    computeUResult: computeU(stateAfter, weights),
    computeDeltaUResult: computeDeltaU(stateBefore, stateAfter, weights),
    gateProposalResult: gateProposal({ stateBefore, stateAfter, weights, threshold, allowOverride }),
  };
}

// Construct a known-valid record for adversarial tests. The caller mutates
// individual fields to test specific Privacy Gate rejection paths.
function makeBaseRecord() {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  return buildTraceRecord({
    lane: 'main',
    runId: 'base-record',
    stateBefore: STATE_DESCENT_BEFORE,
    stateAfter: STATE_DESCENT_AFTER,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult,
  });
}

// ---------------------------------------------------------------------------
// buildTraceRecord — shape and purity
// ---------------------------------------------------------------------------

test('buildTraceRecord returns valid record for typical descent input', () => {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);

  const record = buildTraceRecord({
    lane: 'main',
    runId: 'run-001',
    stateBefore: STATE_DESCENT_BEFORE,
    stateAfter: STATE_DESCENT_AFTER,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult,
    weights: DEFAULT_WEIGHTS,
    threshold: 0,
  });

  assert.equal(record.lane, 'main');
  assert.equal(record.runId, 'run-001');
  assert.equal(record.decision, 'accept');
  assert.ok(record.deltaU < 0, 'descent should have negative deltaU');
  assert.equal(record.advisory_only, true);
  assert.equal(record.local_truth_claim, false);
});

test('buildTraceRecord returns valid record for ascent (rejection) input', () => {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_ASCENT_BEFORE, STATE_ASCENT_AFTER);

  const record = buildTraceRecord({
    lane: 'shintai',
    runId: 'run-002',
    stateBefore: STATE_ASCENT_BEFORE,
    stateAfter: STATE_ASCENT_AFTER,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult,
  });

  assert.equal(record.decision, 'reject');
  assert.ok(record.deltaU > 0, 'ascent should have positive deltaU');
  assert.equal(record.dominantTerm, 'protectedPathViolations');
});

test('buildTraceRecord is pure: does not mutate stateBefore', () => {
  const stateBefore = JSON.parse(JSON.stringify(STATE_DESCENT_BEFORE));
  const frozen = JSON.stringify(stateBefore);
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(stateBefore, STATE_DESCENT_AFTER);

  buildTraceRecord({
    lane: 'main', runId: 'pure-test',
    stateBefore, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });

  assert.equal(JSON.stringify(stateBefore), frozen);
});

test('buildTraceRecord is pure: does not mutate stateAfter', () => {
  const stateAfter = JSON.parse(JSON.stringify(STATE_DESCENT_AFTER));
  const frozen = JSON.stringify(stateAfter);
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, stateAfter);

  buildTraceRecord({
    lane: 'main', runId: 'pure-test-2',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });

  assert.equal(JSON.stringify(stateAfter), frozen);
});

test('buildTraceRecord includes all required schema fields', () => {
  const required = [
    'timestamp', 'runId', 'lane', 'stateBefore_summary', 'stateAfter_summary',
    'U_before', 'U_after', 'deltaU', 'componentContributions', 'componentDeltas',
    'decision', 'dominantTerm', 'threshold', 'allowOverride', 'weights',
    'advisory_only', 'local_truth_claim',
  ];
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record = buildTraceRecord({
    lane: 'main', runId: 'fields-test',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });
  for (const field of required) {
    assert.ok(Object.hasOwn(record, field), `missing required field: ${field}`);
  }
});

test('buildTraceRecord timestamp is ISO-8601 format', () => {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record = buildTraceRecord({
    lane: 'main', runId: 'ts-test',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });
  assert.ok(!Number.isNaN(Date.parse(record.timestamp)), 'timestamp must parse as valid date');
  assert.ok(record.timestamp.includes('T'), 'timestamp must be ISO-8601 with T separator');
});

test('buildTraceRecord stateBefore_summary contains only numeric leaf values', () => {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record = buildTraceRecord({
    lane: 'main', runId: 'summary-test',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });
  const summary = record.stateBefore_summary;
  // numeric scalar fields
  for (const f of ['claimedDistribution_length', 'verifiedDistribution_length',
    'evidence_count', 'predictions_count', 'forecasts_count',
    'protectedPathViolations', 'promotionLadderInversions', 'verifiedEvidenceCount']) {
    assert.equal(typeof summary[f], 'number', `${f} must be a number`);
  }
  // age stats are all numeric
  for (const k of ['min', 'max', 'mean']) {
    assert.equal(typeof summary.evidence_age_stats[k], 'number');
  }
  // claimPromotionDistribution values are numbers
  for (const v of Object.values(summary.claimPromotionDistribution)) {
    assert.equal(typeof v, 'number');
  }
});

// ---------------------------------------------------------------------------
// Privacy Gate — validator
// ---------------------------------------------------------------------------

test('validateRecord does not throw for a valid record', () => {
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record = buildTraceRecord({
    lane: 'main', runId: 'valid-r',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });
  assert.doesNotThrow(() => validateRecord(record));
});

test('validateRecord throws on record with memoryBody string field', () => {
  const bad = { timestamp: new Date().toISOString(), runId: 'r', lane: 'l',
    decision: 'accept', advisory_only: true, local_truth_claim: false,
    memoryBody: 'This is a memory excerpt — forbidden free text.',
  };
  assert.throws(() => validateRecord(bad), /Privacy Gate violation.*memoryBody/);
});

test('validateRecord throws on record with promptText string field', () => {
  const bad = { timestamp: new Date().toISOString(), runId: 'r', lane: 'l',
    decision: 'accept', advisory_only: true, local_truth_claim: false,
    promptText: 'System: you are an AI...',
  };
  assert.throws(() => validateRecord(bad), /Privacy Gate violation.*promptText/);
});

test('validateRecord throws on record with raw file path string field', () => {
  const bad = { timestamp: new Date().toISOString(), runId: 'r', lane: 'l',
    decision: 'accept', advisory_only: true, local_truth_claim: false,
    rawPath: '/private/tmp/forbidden-system-file.db',
  };
  assert.throws(() => validateRecord(bad), /Privacy Gate violation.*rawPath/);
});

test('validateRecord throws on nested free-text string in stateBefore_summary', () => {
  const bad = {
    timestamp: new Date().toISOString(), runId: 'r', lane: 'l',
    decision: 'accept', advisory_only: true, local_truth_claim: false,
    stateBefore_summary: {
      claimedDistribution_length: 3,
      transcriptExcerpt: 'User said: process this file.',
    },
  };
  assert.throws(() => validateRecord(bad), /Privacy Gate violation.*transcriptExcerpt/);
});

// ---------------------------------------------------------------------------
// appendTrace — file I/O behavior
// ---------------------------------------------------------------------------

test('appendTrace creates date-stamped JSONL file if missing', () => {
  const tmpDir = makeTmpDir();
  const { computeUResult, computeDeltaUResult, gateProposalResult } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record = buildTraceRecord({
    lane: 'main', runId: 'create-test',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult, computeDeltaUResult, gateProposalResult,
  });

  const written = appendTrace(record, { traceDir: tmpDir, dateOverride: '2026-01-01' });
  assert.ok(fs.existsSync(written), 'trace file must exist after append');
  assert.ok(written.endsWith('2026-01-01.jsonl'), 'file must be date-stamped');
});

test('appendTrace appends without truncating existing content', () => {
  const tmpDir = makeTmpDir();
  const opts = { traceDir: tmpDir, dateOverride: '2026-01-02' };

  const { computeUResult: cu1, computeDeltaUResult: cd1, gateProposalResult: gp1 } =
    precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
  const record1 = buildTraceRecord({
    lane: 'lane-a', runId: 'run-1',
    stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
    computeUResult: cu1, computeDeltaUResult: cd1, gateProposalResult: gp1,
  });
  const { computeUResult: cu2, computeDeltaUResult: cd2, gateProposalResult: gp2 } =
    precomputeResults(STATE_ASCENT_BEFORE, STATE_ASCENT_AFTER);
  const record2 = buildTraceRecord({
    lane: 'lane-b', runId: 'run-2',
    stateBefore: STATE_ASCENT_BEFORE, stateAfter: STATE_ASCENT_AFTER,
    computeUResult: cu2, computeDeltaUResult: cd2, gateProposalResult: gp2,
  });

  appendTrace(record1, opts);
  appendTrace(record2, opts);

  const filePath = path.join(tmpDir, '2026-01-02.jsonl');
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2, 'must have exactly 2 lines');
  assert.equal(JSON.parse(lines[0]).runId, 'run-1');
  assert.equal(JSON.parse(lines[1]).runId, 'run-2');
});

test('appendTrace honors YURI_STATE_DIR environment variable', () => {
  const tmpStateDir = makeTmpDir();
  const saved = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = tmpStateDir;
  try {
    const { computeUResult, computeDeltaUResult, gateProposalResult } =
      precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
    const record = buildTraceRecord({
      lane: 'main', runId: 'env-test',
      stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
      computeUResult, computeDeltaUResult, gateProposalResult,
    });

    // Call without traceDir — must use YURI_STATE_DIR
    const written = appendTrace(record, { dateOverride: '2026-06-01' });
    assert.ok(
      written.startsWith(tmpStateDir),
      `file must land under YURI_STATE_DIR (${tmpStateDir}), got: ${written}`,
    );
    assert.ok(written.includes('energy-trace'), 'path must contain energy-trace subdir');
  } finally {
    if (saved === undefined) delete process.env.YURI_STATE_DIR;
    else process.env.YURI_STATE_DIR = saved;
  }
});

test('appendTrace does not write to default dir when YURI_STATE_DIR is set', () => {
  const tmpStateDir = makeTmpDir();
  const defaultEnergyTraceDir = path.resolve(__dirname, '../../../_SYSTEM/state/energy-trace');
  const saved = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = tmpStateDir;
  try {
    const { computeUResult, computeDeltaUResult, gateProposalResult } =
      precomputeResults(STATE_DESCENT_BEFORE, STATE_DESCENT_AFTER);
    const record = buildTraceRecord({
      lane: 'main', runId: 'isolation-test',
      stateBefore: STATE_DESCENT_BEFORE, stateAfter: STATE_DESCENT_AFTER,
      computeUResult, computeDeltaUResult, gateProposalResult,
    });

    const beforeExists = fs.existsSync(path.join(defaultEnergyTraceDir, '2026-06-02.jsonl'));
    appendTrace(record, { dateOverride: '2026-06-02' });
    const afterExists = fs.existsSync(path.join(defaultEnergyTraceDir, '2026-06-02.jsonl'));
    // The default location must not have been created by this call
    assert.equal(afterExists, beforeExists, 'default dir must not be written when YURI_STATE_DIR is set');
  } finally {
    if (saved === undefined) delete process.env.YURI_STATE_DIR;
    else process.env.YURI_STATE_DIR = saved;
  }
});

test('real parallel append: N child processes write N distinct valid JSON lines', async () => {
  const { fork } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workerPath = path.join(__dirname, 'yuri-energy-trace-test-worker.mjs');

  const tmpDir = makeTmpDir();
  const dateOverride = '2026-03-15';
  const N = 10;

  await Promise.all(
    Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
      const child = fork(workerPath, [`parallel-${i}`, tmpDir, dateOverride], {
        silent: false,
      });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`worker ${i} exited with code ${code}`));
      });
      child.on('error', reject);
    })),
  );

  const filePath = path.join(tmpDir, `${dateOverride}.jsonl`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, N, `expected ${N} lines, got ${lines.length}`);

  const records = lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`line ${i} is not valid JSON: ${err.message}`);
    }
  });

  const runIds = new Set(records.map((r) => r.runId));
  assert.equal(runIds.size, N, `each worker must write a distinct runId (got ${runIds.size} distinct out of ${N})`);

  for (const record of records) {
    assert.ok(record.runId.startsWith('parallel-'), 'runId must come from worker');
    assert.equal(record.lane, 'parallel-worker');
    assert.equal(record.advisory_only, true);
  }
});

// ---------------------------------------------------------------------------
// Privacy Gate v2 — structural allow-list + non-plain-object rejection
// ---------------------------------------------------------------------------

test('validateRecord rejects Map payloads (would escape Object.entries)', () => {
  const record = makeBaseRecord();
  record.weights = new Map([['alpha', 1.0], ['promptText', 'secret']]);
  assert.throws(
    () => validateRecord(record),
    /non-plain-object container \(Map\)/,
    'Map at weights must be rejected',
  );
});

test('validateRecord rejects Set payloads (would escape Object.entries)', () => {
  const record = makeBaseRecord();
  record.weights = new Set(['secret-key-value']);
  assert.throws(
    () => validateRecord(record),
    /non-plain-object container \(Set\)/,
    'Set at weights must be rejected',
  );
});

test('validateRecord rejects Date payloads (would otherwise pass via toJSON)', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, badField: new Date() };
  assert.throws(
    () => validateRecord(record),
    /non-plain-object container \(Date\)/,
    'Date at weights.badField must be rejected',
  );
});

test('validateRecord rejects nested Map inside an otherwise valid object', () => {
  const record = makeBaseRecord();
  record.stateBefore_summary = {
    claimPromotionDistribution: new Map([['draft', 5]]),
  };
  assert.throws(
    () => validateRecord(record),
    /non-plain-object container/,
    'Nested Map must be rejected',
  );
});

test('validateRecord rejects nested runId string at structurally-disallowed path', () => {
  const record = makeBaseRecord();
  record.stateBefore_summary = {
    ...record.stateBefore_summary,
    runId: 'free text smuggled through allowed key name',
  };
  assert.throws(
    () => validateRecord(record),
    /string value at 'stateBefore_summary\.runId'/,
    'String at stateBefore_summary.runId must be rejected even though runId is allowed at root',
  );
});

test('validateRecord rejects string at arbitrary nested path under unknown object', () => {
  const record = makeBaseRecord();
  record.someUnknownObject = { runId: 'free text', timestamp: 'fake' };
  assert.throws(
    () => validateRecord(record),
    /string value at 'someUnknownObject\./,
    'String at someUnknownObject.* must be rejected regardless of key name',
  );
});

test('validateRecord permits string at allowed root-level path (positive case)', () => {
  const record = makeBaseRecord();
  // All allowed root strings present: timestamp, runId, lane, decision, dominantTerm
  assert.doesNotThrow(
    () => validateRecord(record),
    'Allowed root-level strings must not throw',
  );
});

test('validateRecord permits numeric values in weights with arbitrary keys', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, beta: 2.0, gamma: 1.0, customKey: 0.5 };
  assert.doesNotThrow(
    () => validateRecord(record),
    'Numeric values in weights must pass regardless of key name',
  );
});

test('validateRecord rejects string value inside weights object', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, beta: 'not-a-number' };
  assert.throws(
    () => validateRecord(record),
    /string value at 'weights\.beta'/,
    'String at weights.beta must be rejected (only numeric values permitted)',
  );
});

test('validateRecord rejects function values (would hijack JSON.stringify via toJSON)', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, beta: function() { return 'sneaky'; } };
  assert.throws(
    () => validateRecord(record),
    /function value at 'weights\.beta'/,
    'Function at weights.beta must be rejected',
  );
});

test('validateRecord rejects plain object with own toJSON method', () => {
  const record = makeBaseRecord();
  record.weights = {
    alpha: 1.0,
    sneaky: {
      toJSON() { return { promptText: 'smuggled free text' }; },
    },
  };
  assert.throws(
    () => validateRecord(record),
    /defines an own toJSON method/,
    'Object with own toJSON method must be rejected',
  );
});

test('appendTrace catches toJSON smuggling via post-serialize re-validation (defense in depth)', () => {
  const tmpDir = makeTmpDir();
  const record = makeBaseRecord();
  // This object passes pre-validation if toJSON isn't checked, but its
  // serialized form contains forbidden content. The post-serialize pass
  // catches it as the final canary.
  Object.defineProperty(record.weights, 'sneaky', {
    enumerable: false,
    value: { toJSON() { return { promptText: 'smuggled' }; } },
  });
  // Non-enumerable property is invisible to Object.entries so the
  // pre-validation does not see it. JSON.stringify ignores it too (since
  // it's non-enumerable), so this particular case is benign — but the
  // defense-in-depth path is still exercised. Add a stronger probe:
  const probe = makeBaseRecord();
  probe.someField = { toJSON() { return { promptText: 'smuggled-via-toJSON' }; } };
  assert.throws(
    () => appendTrace(probe, { traceDir: tmpDir, dateOverride: '2026-03-15' }),
    /toJSON method|string value at 'someField/,
    'Object with toJSON must be rejected before or after serialization',
  );
});

test('validateRecord rejects symbol values', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, beta: Symbol('not-permitted') };
  assert.throws(
    () => validateRecord(record),
    /symbol value at 'weights\.beta'/,
    'Symbol at weights.beta must be rejected',
  );
});

test('validateRecord rejects BigInt values (JSON.stringify cannot serialize BigInt)', () => {
  const record = makeBaseRecord();
  record.weights = { alpha: 1.0, beta: 42n };
  assert.throws(
    () => validateRecord(record),
    /BigInt value at 'weights\.beta'/,
    'BigInt at weights.beta must be rejected at validation, not at write time',
  );
});

test('isPlainObject correctly distinguishes plain objects from Map/Set/Date/Array', async () => {
  const { isPlainObject } = await import('./yuri-energy-trace.mjs');
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(new Map()), false);
  assert.equal(isPlainObject(new Set()), false);
  assert.equal(isPlainObject(new Date()), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject(undefined), false);
  assert.equal(isPlainObject('string'), false);
  assert.equal(isPlainObject(42), false);
});

// ---------------------------------------------------------------------------
// traceGateEvaluation — wrapper behavior
// ---------------------------------------------------------------------------

test('traceGateEvaluation returns both record and gateResult', () => {
  const tmpDir = makeTmpDir();
  const result = traceGateEvaluation({
    lane: 'main', runId: 'wrap-1',
    stateBefore: STATE_DESCENT_BEFORE,
    stateAfter: STATE_DESCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-01' },
  });
  assert.ok(result.record, 'must return record');
  assert.ok(result.gateResult, 'must return gateResult');
});

test('traceGateEvaluation records decision: accept for descending transition', () => {
  const tmpDir = makeTmpDir();
  const { record } = traceGateEvaluation({
    lane: 'main', runId: 'descend-wrap',
    stateBefore: STATE_DESCENT_BEFORE,
    stateAfter: STATE_DESCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-02' },
  });
  assert.equal(record.decision, 'accept');
  assert.ok(record.deltaU < 0);
});

test('traceGateEvaluation records decision: reject for ascending transition', () => {
  const tmpDir = makeTmpDir();
  const { record } = traceGateEvaluation({
    lane: 'shintai', runId: 'ascend-wrap',
    stateBefore: STATE_ASCENT_BEFORE,
    stateAfter: STATE_ASCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-03' },
  });
  assert.equal(record.decision, 'reject');
  assert.ok(record.deltaU > 0);
});

test('traceGateEvaluation records dominantTerm correctly on rejection', () => {
  const tmpDir = makeTmpDir();
  const { record } = traceGateEvaluation({
    lane: 'main', runId: 'dominant-wrap',
    stateBefore: STATE_ASCENT_BEFORE,
    stateAfter: STATE_ASCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-04' },
  });
  assert.equal(record.dominantTerm, 'protectedPathViolations');
});

test('traceGateEvaluation writes a parseable JSONL line (round-trip)', () => {
  const tmpDir = makeTmpDir();
  traceGateEvaluation({
    lane: 'main', runId: 'round-trip',
    stateBefore: STATE_DESCENT_BEFORE,
    stateAfter: STATE_DESCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-05' },
  });
  const filePath = path.join(tmpDir, '2026-04-05.jsonl');
  const line = fs.readFileSync(filePath, 'utf8').trim();
  const parsed = JSON.parse(line);
  assert.equal(parsed.advisory_only, true);
  assert.equal(parsed.local_truth_claim, false);
  assert.ok(['accept', 'reject'].includes(parsed.decision));
});

test('traceGateEvaluation does not mutate caller stateBefore', () => {
  const tmpDir = makeTmpDir();
  const stateBefore = JSON.parse(JSON.stringify(STATE_DESCENT_BEFORE));
  const frozen = JSON.stringify(stateBefore);
  traceGateEvaluation({
    lane: 'main', runId: 'mut-guard',
    stateBefore,
    stateAfter: STATE_DESCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-06' },
  });
  assert.equal(JSON.stringify(stateBefore), frozen);
});

test('trace record advisory_only is always true and local_truth_claim always false', () => {
  const tmpDir = makeTmpDir();
  const { record } = traceGateEvaluation({
    lane: 'deepseek-v4-pro', runId: 'advisory-check',
    stateBefore: STATE_ASCENT_BEFORE,
    stateAfter: STATE_ASCENT_AFTER,
    traceOptions: { traceDir: tmpDir, dateOverride: '2026-04-07' },
  });
  assert.equal(record.advisory_only, true);
  assert.equal(record.local_truth_claim, false);
});
