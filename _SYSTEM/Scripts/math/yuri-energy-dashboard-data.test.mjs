import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVENANCE,
  TEST_COUNTS,
  round9,
  resolveStateDir,
  traceDirFor,
  runDescent,
  buildDescentSection,
  readTraceRecords,
  buildTelemetrySection,
  buildDeltaUDistribution,
  buildComponentsSection,
  buildSurfacesSection,
  buildStatusSection,
  aggregate,
  buildDashboardData,
  parseArgs,
} from './yuri-energy-dashboard-data.mjs';
import { DEFAULT_WEIGHTS } from './yuri-energy.mjs';

// ---------------------------------------------------------------------------
// Helpers — all trace I/O uses an OS tmpdir fixture, NEVER the literal repo
// root. This keeps root-architecture.test.mjs clean (no hardcoded repo path).
// ---------------------------------------------------------------------------

function makeTmpStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-energy-dash-'));
}

// Real ground-truth values from running descent-demo through the real gate.
const KNOWN_DELTA_U = [
  -0.245901439, -0.252360918, -0.256158111, -0.258591147, -0.260221904,
  -0.261350196, -0.262166434, -0.262816416, -0.263438782, -0.264199092,
  -0.265340498, -0.267291313, -0.270964532, -0.278945478, -0.310522196,
];
const KNOWN_FINAL_U = -2.925278775;
const KNOWN_U_TRAJECTORY = [
  1.054989681, 0.809088242, 0.556727324, 0.300569213, 0.041978066,
  -0.218243838, -0.479594034, -0.741760468, -1.004576884, -1.268015666,
  -1.532214758, -1.797555256, -2.064846569, -2.335811101, -2.614756579,
  -2.925278775,
];

// A baseline (empty-lane) record matching the shape written by yuri-energy-trace.
function baselineRecord() {
  return {
    timestamp: '2026-05-28T20:49:12.378Z',
    runId: '',
    lane: '',
    U_before: 0,
    U_after: 0,
    deltaU: 0,
    decision: 'accept',
    dominantTerm: null,
  };
}

function dispatchRecord(overrides = {}) {
  return {
    timestamp: '2026-05-28T21:00:00.000Z',
    runId: 'r1',
    lane: 'main',
    U_before: 0.5,
    U_after: 0.24,
    deltaU: -0.26,
    decision: 'accept',
    dominantTerm: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. round9 — float stabilization + negative-zero normalization.
// ---------------------------------------------------------------------------

test('round9 stabilizes floats and normalizes -0 to 0', () => {
  assert.equal(round9(-0.2459014392345), -0.245901439);
  assert.equal(round9(0), 0);
  assert.equal(round9(-0), 0);
  assert.equal(Object.is(round9(-0.00000000001), 0), true); // collapses to +0
  assert.equal(round9(Number.NaN), 0);
  assert.equal(round9(Infinity), 0);
});

// ---------------------------------------------------------------------------
// 2. resolveStateDir / traceDirFor precedence.
// ---------------------------------------------------------------------------

test('resolveStateDir honors explicit option over env, env over default', () => {
  assert.equal(resolveStateDir({ stateDir: '/tmp/explicit', env: { YURI_STATE_DIR: '/tmp/env' } }), '/tmp/explicit');
  assert.equal(resolveStateDir({ env: { YURI_STATE_DIR: '/tmp/env' } }), '/tmp/env');
  const def = resolveStateDir({ env: {} });
  assert.equal(def.endsWith(path.join('_SYSTEM', 'state')), true);
  assert.equal(traceDirFor('/tmp/x'), path.join('/tmp/x', 'energy-trace'));
});

// ---------------------------------------------------------------------------
// 3. runDescent — REAL descent series + trajectory matches ground truth.
// ---------------------------------------------------------------------------

test('runDescent reproduces the known real descent-demo values exactly', async () => {
  const descent = await runDescent();
  assert.equal(descent.provenance, PROVENANCE.REAL);
  assert.equal(descent.scenario, 'descent-demo');
  assert.equal(descent.transitionCount, 15);
  assert.equal(descent.accepted, 15);
  assert.equal(descent.rejected, 0);
  assert.deepEqual(descent.deltaUSeries, KNOWN_DELTA_U);
  assert.equal(descent.finalU, KNOWN_FINAL_U);
  assert.deepEqual(descent.dominantTerms, {});
});

test('runDescent emits a 16-point monotonically-descending U trajectory', async () => {
  const descent = await runDescent();
  assert.equal(descent.uTrajectory.length, 16);
  assert.deepEqual(descent.uTrajectory, KNOWN_U_TRAJECTORY);
  // Trajectory must descend strictly (clean case).
  for (let i = 1; i < descent.uTrajectory.length; i++) {
    assert.ok(descent.uTrajectory[i] < descent.uTrajectory[i - 1], `point ${i} must descend`);
  }
  // Last trajectory point equals finalU.
  assert.equal(descent.uTrajectory[descent.uTrajectory.length - 1], descent.finalU);
  // Labels align with the 15 transitions.
  assert.equal(descent.labels.length, 15);
  assert.equal(descent.labels[0], 'submit-claim');
});

// ---------------------------------------------------------------------------
// 4. buildDescentSection — pure reducer rejects empty input.
// ---------------------------------------------------------------------------

test('buildDescentSection throws on empty steps and is pure on valid input', () => {
  assert.throws(() => buildDescentSection('x', []), /non-empty steps array/);
  const steps = [
    { U_before: 1, U_after: 0.5, deltaU: -0.5, accept: true, label: 'a', dominantTerm: null },
    { U_before: 0.5, U_after: 0.2, deltaU: -0.3, accept: true, label: 'b', dominantTerm: null },
  ];
  const a = buildDescentSection('x', steps);
  const b = buildDescentSection('x', steps);
  assert.deepEqual(a, b);
  assert.deepEqual(a.uTrajectory, [1, 0.5, 0.2]);
  assert.equal(a.finalU, 0.2);
});

test('buildDescentSection counts dominant terms only over rejected steps', () => {
  const steps = [
    { U_before: 0, U_after: 1, deltaU: 1, accept: false, label: 'bad', dominantTerm: 'protectedPathViolations' },
    { U_before: 1, U_after: 2, deltaU: 1, accept: false, label: 'bad2', dominantTerm: 'protectedPathViolations' },
    { U_before: 2, U_after: 1.5, deltaU: -0.5, accept: true, label: 'ok', dominantTerm: null },
  ];
  const out = buildDescentSection('x', steps);
  assert.equal(out.accepted, 1);
  assert.equal(out.rejected, 2);
  assert.deepEqual(out.dominantTerms, { protectedPathViolations: 2 });
});

// ---------------------------------------------------------------------------
// 5. readTraceRecords — missing dir → empty; reads + counts malformed.
// ---------------------------------------------------------------------------

test('readTraceRecords returns empty for a missing trace directory', () => {
  const dir = makeTmpStateDir();
  fs.rmSync(dir, { recursive: true, force: true }); // now missing
  const res = readTraceRecords({ stateDir: dir });
  assert.deepEqual(res.records, []);
  assert.equal(res.malformed, 0);
  assert.deepEqual(res.files, []);
});

test('readTraceRecords parses jsonl lines and tallies malformed lines', () => {
  const stateDir = makeTmpStateDir();
  const traceDir = traceDirFor(stateDir);
  fs.mkdirSync(traceDir, { recursive: true });
  const lines = [
    JSON.stringify(baselineRecord()),
    JSON.stringify(dispatchRecord()),
    '{ not valid json',
    '', // blank line is skipped, not malformed
  ];
  fs.writeFileSync(path.join(traceDir, '2026-05-28.jsonl'), lines.join('\n') + '\n');
  const res = readTraceRecords({ stateDir });
  assert.equal(res.records.length, 2);
  assert.equal(res.malformed, 1);
  assert.deepEqual(res.files, ['2026-05-28.jsonl']);
});

// ---------------------------------------------------------------------------
// 6. buildTelemetrySection — empty-trace honesty (0 real records).
// ---------------------------------------------------------------------------

test('buildTelemetrySection reports 0 real-traffic for all-baseline records', () => {
  const records = Array.from({ length: 35 }, () => baselineRecord());
  const tele = buildTelemetrySection(records);
  assert.equal(tele.provenance, PROVENANCE.REAL);
  assert.equal(tele.totalRecords, 35);
  assert.equal(tele.realTrafficRecords, 0);
  assert.equal(tele.dispatchRecords, 0);
  assert.equal(tele.chip, '0 real-traffic records · B.1 open');
  assert.deepEqual(tele.byLane, { '<baseline>': 35 });
  assert.deepEqual(tele.sampleRecords, []); // no fabricated rows
  assert.deepEqual(tele.deltaUDistribution, { count: 0, buckets: [] });
});

// ---------------------------------------------------------------------------
// 7. buildTelemetrySection — by-lane counting + experiment vs dispatch split.
// ---------------------------------------------------------------------------

test('buildTelemetrySection splits experiment-lane from real dispatch lanes', () => {
  const records = [
    baselineRecord(),
    dispatchRecord({ lane: 'experiment', runId: 'e1' }),
    dispatchRecord({ lane: 'experiment', runId: 'e2' }),
    dispatchRecord({ lane: 'main', runId: 'm1' }),
    dispatchRecord({ lane: 'quantum', runId: 'q1', deltaU: 0.2, decision: 'reject', dominantTerm: 'klDivergence' }),
  ];
  const tele = buildTelemetrySection(records);
  assert.equal(tele.totalRecords, 5);
  assert.equal(tele.realTrafficRecords, 4); // lane != ""
  assert.equal(tele.experimentRecords, 2);
  assert.equal(tele.dispatchRecords, 2); // main + quantum
  assert.equal(tele.chip, '2 dispatch records · B.1 collecting');
  assert.deepEqual(tele.byLane, { '<baseline>': 1, experiment: 2, main: 1, quantum: 1 });
  assert.equal(tele.accepted, 3);
  assert.equal(tele.rejected, 1);
  assert.deepEqual(tele.dominantTerms, { klDivergence: 1 });
  assert.equal(tele.sampleRecords.length, 4);
});

// ---------------------------------------------------------------------------
// 8. buildDeltaUDistribution — empty vs populated.
// ---------------------------------------------------------------------------

test('buildDeltaUDistribution returns empty for no values and buckets otherwise', () => {
  assert.deepEqual(buildDeltaUDistribution([]), { count: 0, buckets: [] });
  assert.deepEqual(buildDeltaUDistribution([Number.NaN, Infinity]), { count: 0, buckets: [] });
  const dist = buildDeltaUDistribution([-0.26, -0.04, 0.18, 100]);
  assert.equal(dist.count, 4);
  assert.equal(dist.buckets.length, 10);
  const summed = dist.buckets.reduce((a, b) => a + b.count, 0);
  assert.equal(summed, 4);
});

// ---------------------------------------------------------------------------
// 9. buildComponentsSection — weights match source exactly.
// ---------------------------------------------------------------------------

test('buildComponentsSection mirrors DEFAULT_WEIGHTS exactly', () => {
  const comp = buildComponentsSection();
  assert.equal(comp.provenance, PROVENANCE.REAL);
  assert.deepEqual(comp.weights, { ...DEFAULT_WEIGHTS });
});

// ---------------------------------------------------------------------------
// 10. buildSurfacesSection + buildStatusSection — provenance tags present.
// ---------------------------------------------------------------------------

test('every surface carries a valid provenance tag', () => {
  const sec = buildSurfacesSection();
  const valid = new Set(Object.values(PROVENANCE));
  assert.ok(sec.surfaces.length > 0);
  for (const s of sec.surfaces) {
    assert.ok(valid.has(s.provenance), `surface "${s.surface}" has invalid provenance ${s.provenance}`);
    assert.equal(typeof s.note, 'string');
  }
  // The B.1 surface must be planned (zero real dispatch traces yet).
  const b1 = sec.surfaces.find((s) => s.surface.includes('B.1'));
  assert.equal(b1.provenance, PROVENANCE.PLANNED);
});

test('buildStatusSection sums the test counts and keeps the snapshot flag', () => {
  const status = buildStatusSection();
  assert.equal(status.provenance, PROVENANCE.REAL);
  assert.deepEqual(status.testCounts, { ...TEST_COUNTS });
  assert.equal(status.totalTests, 28 + 39 + 26 + 35 + 32);
  assert.equal(status.testCountsSource, 'snapshot');
  const b1 = status.workstreams.find((w) => w.id === 'B.1');
  assert.equal(b1.state, 'COLLECTING');
  const actionMode = status.workstreams.find((w) => w.id === 'A.2.b');
  assert.equal(actionMode.state, 'GATED');
});

// ---------------------------------------------------------------------------
// 11. aggregate — full DATA shape + provenance on every section.
// ---------------------------------------------------------------------------

test('aggregate composes a DATA object with provenance on every section', async () => {
  const descent = await runDescent();
  const traceResult = { records: [baselineRecord(), baselineRecord()], malformed: 0, files: ['f.jsonl'] };
  const data = aggregate({ descent, traceResult, generatedAt: 'FIXED' });
  assert.equal(data.schema, 'yuri-energy-dashboard-data/v1');
  assert.equal(data.generatedAt, 'FIXED');
  assert.equal(data.descent.provenance, PROVENANCE.REAL);
  assert.equal(data.telemetry.provenance, PROVENANCE.REAL);
  assert.equal(data.components.provenance, PROVENANCE.REAL);
  assert.equal(data.surfaces.provenance, 'mixed');
  assert.equal(data.status.provenance, PROVENANCE.REAL);
  assert.equal(data.advisory_only, true);
  assert.equal(data.local_truth_claim, false);
  assert.equal(data.telemetry.totalRecords, 2);
  assert.equal(data.telemetry.realTrafficRecords, 0);
  assert.equal(data.telemetry.sourceFiles[0], 'f.jsonl');
});

test('aggregate throws without a descent section', () => {
  assert.throws(() => aggregate({ traceResult: { records: [] } }), /requires a descent section/);
});

// ---------------------------------------------------------------------------
// 12. No fabricated values — the emitted DATA never invents telemetry rows.
// ---------------------------------------------------------------------------

test('aggregate never fabricates telemetry rows from an empty real trace', async () => {
  const descent = await runDescent();
  const data = aggregate({ descent, traceResult: { records: [], malformed: 0, files: [] } });
  assert.deepEqual(data.telemetry.sampleRecords, []);
  assert.equal(data.telemetry.totalRecords, 0);
  assert.equal(data.telemetry.chip, '0 real-traffic records · B.1 open');
  // Descent series is the real one, not a placeholder.
  assert.deepEqual(data.descent.deltaUSeries, KNOWN_DELTA_U);
});

// ---------------------------------------------------------------------------
// 13. buildDashboardData — end-to-end with YURI_STATE_DIR honored.
// ---------------------------------------------------------------------------

test('buildDashboardData honors YURI_STATE_DIR via env and reads real traces', async () => {
  const stateDir = makeTmpStateDir();
  const traceDir = traceDirFor(stateDir);
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(
    path.join(traceDir, '2026-05-28.jsonl'),
    [JSON.stringify(baselineRecord()), JSON.stringify(dispatchRecord())].join('\n') + '\n',
  );
  const data = await buildDashboardData({ env: { YURI_STATE_DIR: stateDir }, generatedAt: 'X' });
  assert.equal(data.telemetry.totalRecords, 2);
  assert.equal(data.telemetry.dispatchRecords, 1);
  assert.equal(data.telemetry.chip, '1 dispatch records · B.1 collecting');
  assert.equal(data.descent.transitionCount, 15);
});

// ---------------------------------------------------------------------------
// 14. CLI arg parsing.
// ---------------------------------------------------------------------------

test('parseArgs parses flags, values, and bare positionals', () => {
  const args = parseArgs(['--out', '/tmp/x.json', '--state-dir', '/tmp/s', '--help']);
  assert.equal(args.out, '/tmp/x.json');
  assert.equal(args['state-dir'], '/tmp/s');
  assert.equal(args.help, true);
});
