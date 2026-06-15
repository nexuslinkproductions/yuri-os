import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVENANCE,
  TEST_COUNTS,
  COMPONENT_META,
  round9,
  downsample,
  resolveStateDir,
  traceDirFor,
  runDescent,
  runDescentRaw,
  buildDescentSection,
  readTraceRecords,
  buildTelemetrySection,
  buildDeltaUDistribution,
  buildComponentsSection,
  buildConfigSection,
  buildRealTrafficSection,
  buildWorkedMathSection,
  buildAttributionSection,
  buildActionStudySection,
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
// Updated 2026-06-14 (energyFormulaVersion 3): the β/drift term is now Wasserstein-1 (was KL). The demo's
// initial state carries real claim-vs-evidence drift, so the trajectory now STARTS higher (W₁ rung-units)
// and descends in larger steps as the claim converges to the evidence. KNOWN_FINAL_U is UNCHANGED: the
// demo's final state has claimed == verified (W₁ = 0 = drift-free), so the last U is identical across the
// KL→W₁ swap. Still strictly monotonically descending, 15/15 accepted (invariant re-verified, not assumed).
// (2026-05-30: the verified-evidence credit is SATURATING -iota·log1p, capped — bounded steps.)
// energyFormulaVersion 3 + μ confidence-coupling (2026-06-14): the μ·conc·W₁ term now also fires on the
// demo's drifted states, so the trajectory starts slightly higher and the steps shift; still strictly
// monotonically descending, 15/15 accepted. KNOWN_FINAL_U unchanged (final state claimed==verified → W₁=0
// → both the drift AND the μ-coupling term are 0 at the end).
const KNOWN_DELTA_U = [
  -0.091304475, -0.102075717, -0.11040005, -0.117557065, -0.124116847,
  -0.130401567, -0.13663347, -0.142998567, -0.149685002, -0.156919652,
  -0.165023143, -0.174524485, -0.186472157, -0.203641698, -0.245602767,
];
const KNOWN_FINAL_U = 0.703364018;
const KNOWN_U_TRAJECTORY = [
  2.94072068, 2.849416205, 2.747340488, 2.636940438, 2.519383373,
  2.395266526, 2.264864959, 2.128231489, 1.985232922, 1.83554792,
  1.678628268, 1.513605125, 1.33908064, 1.152608483, 0.948966785,
  0.703364018,
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
  // Non-finite input renders as ABSENT (null), never a confident 0 (dash-round9-8e).
  assert.equal(round9(Number.NaN), null);
  assert.equal(round9(Infinity), null);
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
  // Real routed traffic now exists and is tagged real; the published figures
  // remain ahead. (Publication voice — no internal workstream identifiers.)
  const realTraffic = sec.surfaces.find((s) => s.surface === 'Real routed traffic');
  assert.equal(realTraffic.provenance, PROVENANCE.REAL);
  assert.ok(sec.surfaces.some((s) => s.provenance === PROVENANCE.PLANNED), 'at least one surface still ahead');
  // No internal artifact names or workstream IDs leak into the reader-facing ledger.
  for (const s of sec.surfaces) {
    assert.ok(!/\.mjs|JSONL|\b[AB]\.\d|Layer-7|computeU/.test(`${s.surface} ${s.note}`), `publication-voice leak in "${s.surface}"`);
  }
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
  assert.equal(data.schema, 'yuri-energy-dashboard-data/v2');
  assert.equal(data.generatedAt, 'FIXED');
  assert.equal(data.descent.provenance, PROVENANCE.REAL);
  assert.equal(data.realTraffic.provenance, PROVENANCE.REAL);
  assert.equal(data.telemetry.provenance, PROVENANCE.REAL);
  assert.equal(data.components.provenance, PROVENANCE.REAL);
  assert.equal(data.workedMath.provenance, PROVENANCE.REAL);
  assert.equal(data.attribution.provenance, PROVENANCE.REAL);
  // actionStudy is PLANNED when no study report is supplied (honest empty state).
  assert.equal(data.actionStudy.provenance, PROVENANCE.PLANNED);
  assert.equal(data.actionStudy.available, false);
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
// buildConfigSection — the live tuned energy landscape + default→tuned delta.
// ---------------------------------------------------------------------------

test('buildConfigSection: no overrides → equals defaults, no tuned weights', () => {
  const base = buildConfigSection({});
  assert.equal(base.provenance, PROVENANCE.REAL);
  assert.deepEqual(base.weights, { ...DEFAULT_WEIGHTS });
  assert.deepEqual(base.tunedWeights, []);
  assert.equal(base.threshold, 0);
  assert.equal(base.thresholdTuned, false);
});

test('buildConfigSection: overrides → merged weights + accurate tuned-weight delta + live block values', () => {
  const tuned = buildConfigSection({ weights: { eta: 50 }, fsrs: { rFloor: 0.7 }, threshold: -1 });
  assert.equal(tuned.weights.eta, 50, 'override applied');
  assert.equal(tuned.weights.beta, DEFAULT_WEIGHTS.beta, 'untouched weights keep the default');
  assert.deepEqual(tuned.tunedWeights, ['eta'], 'only the changed weight is flagged tuned');
  assert.equal(tuned.fsrs.rFloor, 0.7, 'live fsrs value shown (not falsely flagged tuned)');
  assert.equal(tuned.threshold, -1);
  assert.equal(tuned.thresholdTuned, true);
});

test('buildConfigSection: a block present at default values is NOT mislabeled tuned', () => {
  // salience present but no weight/threshold overrides → tunedWeights empty, value still shown
  const c = buildConfigSection({ salience: { depthThreshold: 6 } });
  assert.deepEqual(c.tunedWeights, []);
  assert.equal(c.thresholdTuned, false);
  assert.equal(c.salience.depthThreshold, 6, 'live salience value still rendered');
});

test('aggregate includes the live config section tagged real', async () => {
  const descent = await runDescent();
  const data = aggregate({ descent, traceResult: { records: [], malformed: 0, files: [] }, liveConfig: { fsrs: { rFloor: 0.5 } }, generatedAt: 'FIXED' });
  assert.equal(data.config.provenance, PROVENANCE.REAL);
  assert.equal(data.config.fsrs.rFloor, 0.5);
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
// 13. downsample — keeps endpoints, caps length, deterministic.
// ---------------------------------------------------------------------------

test('downsample keeps first + last and caps to target', () => {
  const pts = Array.from({ length: 500 }, (_, i) => [i, round9(-i / 10)]);
  const out = downsample(pts, 64);
  assert.ok(out.length <= 64, 'capped to target');
  assert.equal(out[0][0], 0, 'keeps first x');
  assert.equal(out[0][1], 0, 'keeps first y');
  assert.equal(out[out.length - 1][0], 499, 'keeps last x');
  assert.equal(out[out.length - 1][1], -49.9, 'keeps last y');
  assert.deepEqual(downsample(pts, 64), out, 'deterministic');
});

test('downsample returns a copy when already under target', () => {
  const pts = [[0, 0], [1, -1]];
  const out = downsample(pts, 64);
  assert.deepEqual(out, pts);
  assert.notEqual(out, pts, 'is a copy, not the same reference');
});

// ---------------------------------------------------------------------------
// 14. buildRealTrafficSection — cumulative ΔU over real dispatch work.
// ---------------------------------------------------------------------------

test('buildRealTrafficSection: dispatch excludes experiment + baseline, accumulates ΔU', () => {
  const records = [
    baselineRecord(),                                              // lane "" — baseline, excluded
    dispatchRecord({ lane: 'experiment', deltaU: -5, timestamp: '2026-05-30T01:00:00.000Z' }), // experiment, excluded from dispatch
    dispatchRecord({ lane: 'session', deltaU: -0.2, timestamp: '2026-05-30T02:00:00.000Z' }),
    dispatchRecord({ lane: 'session', deltaU: -0.3, timestamp: '2026-05-30T03:00:00.000Z' }),
    dispatchRecord({ lane: 'codex-final-pass', deltaU: -0.5, timestamp: '2026-05-31T01:00:00.000Z' }),
  ];
  const rt = buildRealTrafficSection(records);
  assert.equal(rt.provenance, PROVENANCE.REAL);
  assert.equal(rt.totalRecords, 5);
  assert.equal(rt.realTrafficRecords, 4, 'all non-empty lanes');
  assert.equal(rt.dispatchRecords, 3, 'experiment excluded from dispatch');
  assert.equal(rt.experimentRecords, 1);
  assert.equal(rt.baselineRecords, 1);
  assert.equal(rt.cumulativeDeltaU, -1, '-0.2 + -0.3 + -0.5');
  assert.equal(rt.deepestU, -1);
  assert.equal(rt.accepted, 3);
  assert.equal(rt.rejected, 0, 'observe mode → nothing rejected');
  assert.deepEqual(rt.days.map((d) => d.d), ['2026-05-30', '2026-05-31']);
  assert.equal(rt.days[0].n, 2);
  assert.equal(rt.days[0].sum, -0.5);
  assert.equal(rt.series[0][1], -0.2, 'first cumulative point');
  assert.equal(rt.series[rt.series.length - 1][1], -1);
});

test('buildRealTrafficSection: empty records → honest zeroes, no crash', () => {
  const rt = buildRealTrafficSection([]);
  assert.equal(rt.dispatchRecords, 0);
  assert.equal(rt.cumulativeDeltaU, 0);
  assert.deepEqual(rt.series, []);
  assert.deepEqual(rt.days, []);
});

// ---------------------------------------------------------------------------
// 15. buildComponentsSection.list — all eleven components with live weights.
// ---------------------------------------------------------------------------

test('buildComponentsSection emits all twelve components tied to live weights', () => {
  const c = buildComponentsSection();
  assert.equal(c.list.length, 12); // 11 + μ overconfidenceDrift (energyFormulaVersion 3 confidence-coupling)
  assert.equal(c.list.length, COMPONENT_META.length);
  for (const item of c.list) {
    assert.equal(item.w, DEFAULT_WEIGHTS[item.k], `${item.k} weight matches source`);
    assert.ok(['penalty', 'reward', 'critical'].includes(item.kind));
    assert.ok(item.sym && item.cc && item.name);
  }
  // eta is the catastrophic protected-path term.
  const eta = c.list.find((x) => x.k === 'eta');
  assert.equal(eta.w, 100);
  assert.equal(eta.kind, 'critical');
});

// ---------------------------------------------------------------------------
// 16. buildWorkedMathSection — accept terms sum to ΔU; rejects carry teeth.
// ---------------------------------------------------------------------------

test('buildWorkedMathSection: accept example component deltas sum to ΔU', async () => {
  const { steps } = await runDescentRaw();
  const wm = buildWorkedMathSection(steps, null);
  assert.ok(wm.acceptExamples.length >= 1);
  for (const ex of wm.acceptExamples) {
    assert.equal(ex.decision, 'accept');
    // Σ component deltas === ΔU (the additive honesty of computeDeltaU), within rounding.
    assert.ok(Math.abs(ex.sumCheck - ex.deltaU) < 1e-6, `${ex.label}: Σterms (${ex.sumCheck}) ≈ ΔU (${ex.deltaU})`);
    assert.ok(ex.terms.length >= 1);
  }
  assert.deepEqual(wm.rejectExamples, [], 'no study → no reject examples');
});

test('buildWorkedMathSection: reject examples come from the study battery', async () => {
  const { steps } = await runDescentRaw();
  const study = {
    study: { rows: [
      { id: 'p', kind: 'adversarial', label: 'protected', expect: 'reject', decision: 'reject', correct: true, deltaU: 100, dominantTerm: 'protectedPathViolations' },
      { id: 'h', kind: 'healthy', label: 'edit', expect: 'accept', decision: 'accept', correct: true, deltaU: -0.02, dominantTerm: null },
    ] },
  };
  const wm = buildWorkedMathSection(steps, study);
  assert.equal(wm.rejectExamples.length, 1, 'only adversarial rows become reject examples');
  assert.equal(wm.rejectExamples[0].dominantTerm, 'protectedPathViolations');
  assert.equal(wm.rejectExamples[0].dominantSym, 'η');
  assert.equal(wm.rejectExamples[0].deltaU, 100);
});

// ---------------------------------------------------------------------------
// 17. buildAttributionSection — fired flags + policy weights per component.
// ---------------------------------------------------------------------------

test('buildAttributionSection: marks fired components and carries weights', async () => {
  const { steps } = await runDescentRaw();
  const study = { study: { rows: [
    { dominantTerm: 'protectedPathViolations', deltaU: 100 },
  ] } };
  const attr = buildAttributionSection(steps, study);
  assert.equal(attr.nodes.length, 12); // 11 + μ overconfidenceDrift
  const eta = attr.nodes.find((n) => n.cc === 'protectedPathViolations');
  assert.equal(eta.weight, 100);
  assert.equal(eta.fired, true);
  assert.equal(eta.observedMagnitude, 100);
  // logLoss never fires in a clean descent + protected-path battery.
  const logLoss = attr.nodes.find((n) => n.cc === 'logLoss');
  assert.equal(logLoss.fired, false);
  assert.equal(logLoss.observedMagnitude, 0);
});

// ---------------------------------------------------------------------------
// 18. buildActionStudySection — teeth + shadow FP rate, honest planned-empty.
// ---------------------------------------------------------------------------

test('buildActionStudySection: real report → battery + confusion + shadow', () => {
  const report = {
    ranAt: '2026-05-31T15:26:50.773Z',
    study: {
      rows: [
        { id: 'protected-path', kind: 'adversarial', label: 'x', expect: 'reject', decision: 'reject', correct: true, deltaU: 100, dominantTerm: 'protectedPathViolations' },
      ],
      trueRejects: 4, falseAccepts: 0, trueAccepts: 2, falseRejects: 0, allCorrect: true,
    },
    shadow: { total: 3096, wouldReject: 0, falsePositiveRate: 0 },
    verdict: 'CLEAN',
  };
  const sec = buildActionStudySection(report);
  assert.equal(sec.provenance, PROVENANCE.REAL);
  assert.equal(sec.available, true);
  assert.equal(sec.battery[0].dominantSym, 'η');
  assert.deepEqual(sec.confusion, { trueRejects: 4, falseAccepts: 0, trueAccepts: 2, falseRejects: 0, allCorrect: true });
  assert.equal(sec.shadow.falsePositiveRate, 0);
  assert.equal(sec.verdict, 'CLEAN');
});

test('buildActionStudySection: no report → planned, not available', () => {
  const sec = buildActionStudySection(null);
  assert.equal(sec.provenance, PROVENANCE.PLANNED);
  assert.equal(sec.available, false);
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
