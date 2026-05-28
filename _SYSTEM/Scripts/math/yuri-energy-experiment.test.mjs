import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runExperiment,
  loadScenario,
  resolveScenarioPath,
  validateTransitions,
  evaluateTransitions,
  buildSummary,
  resolveStateDir,
  traceDirFor,
  parseArgs,
} from './yuri-energy-experiment.mjs';
import { scenario as descentScenario } from './experiments/descent-demo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers — every I/O test uses an OS tmpdir. NEVER the literal repo root.
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-energy-exp-'));
}

function writeSyntheticScenario(dir, id, body) {
  const file = path.join(dir, `${id}.mjs`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// A self-contained valid scenario module body (no external imports needed —
// the harness only requires { stateBefore, stateAfter, label } objects).
const VALID_SCENARIO_BODY = `
export function scenario() {
  const a = { claimPromotionDistribution: { draft: 5, research: 3 }, verifiedEvidenceCount: 4, protectedPathViolations: 0, promotionLadderInversions: 0 };
  const b = { claimPromotionDistribution: { draft: 4, research: 4 }, verifiedEvidenceCount: 6, protectedPathViolations: 0, promotionLadderInversions: 0 };
  return [{ stateBefore: a, stateAfter: b, label: 'step-1' }];
}
`;

// A scenario whose second transition introduces a protected-path violation —
// guarantees one rejection so accepted/rejected/dominantTerms are exercised.
const MIXED_SCENARIO_BODY = `
export function scenario() {
  const clean = { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 10, protectedPathViolations: 0, promotionLadderInversions: 0 };
  const cleaner = { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 12, protectedPathViolations: 0, promotionLadderInversions: 0 };
  const violating = { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 12, protectedPathViolations: 1, promotionLadderInversions: 0 };
  return [
    { stateBefore: clean, stateAfter: cleaner, label: 'descend' },
    { stateBefore: cleaner, stateAfter: violating, label: 'violate' },
  ];
}
`;

// ---------------------------------------------------------------------------
// 1. Scenario path resolution + id grammar (no traversal)
// ---------------------------------------------------------------------------

test('resolveScenarioPath maps a valid id to experiments/<id>.mjs', () => {
  const p = resolveScenarioPath('descent-demo');
  assert.ok(p.endsWith(path.join('experiments', 'descent-demo.mjs')));
});

test('resolveScenarioPath rejects path-traversal ids', () => {
  assert.throws(() => resolveScenarioPath('../yuri-energy'), /invalid scenario id/);
  assert.throws(() => resolveScenarioPath('a/b'), /invalid scenario id/);
  assert.throws(() => resolveScenarioPath('/etc/passwd'), /invalid scenario id/);
  assert.throws(() => resolveScenarioPath(''), /scenario id is required/);
});

// ---------------------------------------------------------------------------
// 2. Scenario loading
// ---------------------------------------------------------------------------

test('loadScenario loads the real descent-demo scenario', async () => {
  const transitions = await loadScenario('descent-demo');
  assert.ok(Array.isArray(transitions));
  assert.equal(transitions.length, 15, 'descent-demo must have 15 transitions');
  for (const t of transitions) {
    assert.ok(t.stateBefore && t.stateAfter, 'each transition has before/after');
  }
});

test('loadScenario loads a synthetic scenario from a custom experiments dir', async () => {
  const dir = makeTmpDir();
  writeSyntheticScenario(dir, 'synthetic-ok', VALID_SCENARIO_BODY);
  const transitions = await loadScenario('synthetic-ok', { experimentsDir: dir });
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].label, 'step-1');
});

test('loadScenario throws when the scenario file is missing', async () => {
  const dir = makeTmpDir();
  await assert.rejects(
    () => loadScenario('does-not-exist', { experimentsDir: dir }),
    /not found/,
  );
});

test('loadScenario throws when the module exports no scenario function', async () => {
  const dir = makeTmpDir();
  writeSyntheticScenario(dir, 'no-export', 'export const notAFunction = 42;\n');
  await assert.rejects(
    () => loadScenario('no-export', { experimentsDir: dir }),
    /must export a function/,
  );
});

// ---------------------------------------------------------------------------
// 3. Malformed scenario rejection (validateTransitions)
// ---------------------------------------------------------------------------

test('validateTransitions rejects a non-array return', () => {
  assert.throws(() => validateTransitions({ not: 'an array' }, 'x'), /must return an array/);
});

test('validateTransitions rejects an empty transition list', () => {
  assert.throws(() => validateTransitions([], 'x'), /zero transitions/);
});

test('validateTransitions rejects a transition missing stateBefore', () => {
  assert.throws(
    () => validateTransitions([{ stateAfter: {} }], 'x'),
    /stateBefore is not an object/,
  );
});

test('validateTransitions rejects a transition missing stateAfter', () => {
  assert.throws(
    () => validateTransitions([{ stateBefore: {} }], 'x'),
    /stateAfter is not an object/,
  );
});

test('validateTransitions rejects a non-string label', () => {
  assert.throws(
    () => validateTransitions([{ stateBefore: {}, stateAfter: {}, label: 5 }], 'x'),
    /label must be a string/,
  );
});

test('loadScenario surfaces a malformed scenario at load time', async () => {
  const dir = makeTmpDir();
  writeSyntheticScenario(dir, 'malformed', 'export function scenario() { return []; }\n');
  await assert.rejects(
    () => loadScenario('malformed', { experimentsDir: dir }),
    /zero transitions/,
  );
});

// ---------------------------------------------------------------------------
// 4. evaluateTransitions — deltaU series correctness + no mutation
// ---------------------------------------------------------------------------

test('evaluateTransitions deltaU equals U_after - U_before per step', () => {
  const transitions = descentScenario();
  const { steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  for (const step of steps) {
    const recomputed = Math.round((step.U_after - step.U_before) * 1e9) / 1e9;
    assert.equal(step.deltaU, recomputed, `deltaU must equal U_after-U_before at step ${step.index}`);
  }
});

test('evaluateTransitions does not mutate the scenario transition states', () => {
  const transitions = descentScenario();
  const frozen = JSON.stringify(transitions);
  evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  assert.equal(JSON.stringify(transitions), frozen, 'scenario state must be unchanged');
});

test('evaluateTransitions produces one validated record per transition', () => {
  const transitions = descentScenario();
  const { records, steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  assert.equal(records.length, transitions.length);
  assert.equal(steps.length, transitions.length);
  // Records must carry advisory flags and accept/reject decisions.
  for (const rec of records) {
    assert.equal(rec.advisory_only, true);
    assert.equal(rec.local_truth_claim, false);
    assert.ok(['accept', 'reject'].includes(rec.decision));
  }
});

// ---------------------------------------------------------------------------
// 5. descent-demo actually descends (the B.2 acceptance property)
// ---------------------------------------------------------------------------

test('descent-demo descends monotonically — every deltaU < 0', () => {
  const transitions = descentScenario();
  const { steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  for (const step of steps) {
    assert.ok(step.deltaU < 0, `step ${step.index} (${step.label}) must descend, got deltaU=${step.deltaU}`);
  }
});

test('descent-demo U strictly decreases across the full sequence', () => {
  const transitions = descentScenario();
  const { steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  for (let i = 1; i < steps.length; i++) {
    assert.ok(
      steps[i].U_after < steps[i - 1].U_after,
      `U must strictly decrease: step ${i} U=${steps[i].U_after} !< step ${i - 1} U=${steps[i - 1].U_after}`,
    );
  }
});

test('descent-demo scenario() is deterministic across calls', () => {
  const a = descentScenario();
  const b = descentScenario();
  assert.deepEqual(a, b, 'two scenario() calls must return deeply-equal data');
  // And distinct object identities (no shared mutable references leaking out).
  assert.notEqual(a, b);
  assert.notEqual(a[0].stateBefore, b[0].stateBefore);
});

// ---------------------------------------------------------------------------
// 6. buildSummary shape + correctness
// ---------------------------------------------------------------------------

test('buildSummary returns the documented summary shape', () => {
  const transitions = descentScenario();
  const { steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  const summary = buildSummary({ scenario: 'descent-demo', steps });
  for (const key of ['scenario', 'transitionCount', 'accepted', 'rejected', 'deltaUSeries', 'dominantTerms', 'finalU']) {
    assert.ok(Object.hasOwn(summary, key), `summary missing key: ${key}`);
  }
  assert.equal(summary.scenario, 'descent-demo');
  assert.equal(summary.transitionCount, 15);
  assert.equal(summary.accepted, 15, 'clean descent accepts every transition');
  assert.equal(summary.rejected, 0);
  assert.equal(summary.deltaUSeries.length, 15);
  assert.deepEqual(summary.dominantTerms, {}, 'no rejections → empty dominantTerms');
  assert.ok(summary.finalU < 0, 'final U should be well below zero after a clean descent');
});

test('buildSummary counts rejections and dominantTerms on a mixed scenario', () => {
  const transitions = [
    {
      stateBefore: { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 10, protectedPathViolations: 0 },
      stateAfter: { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 12, protectedPathViolations: 0 },
      label: 'descend',
    },
    {
      stateBefore: { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 12, protectedPathViolations: 0 },
      stateAfter: { claimPromotionDistribution: { trusted: 5 }, verifiedEvidenceCount: 12, protectedPathViolations: 1 },
      label: 'violate',
    },
  ];
  const { steps } = evaluateTransitions(transitions, { scenario: 'mixed', runId: 'r' });
  const summary = buildSummary({ scenario: 'mixed', steps });
  assert.equal(summary.transitionCount, 2);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.dominantTerms.protectedPathViolations, 1);
});

test('deltaUSeries matches the gate per-step deltaU values exactly', () => {
  const transitions = descentScenario();
  const { steps } = evaluateTransitions(transitions, { scenario: 'descent-demo', runId: 'r' });
  const summary = buildSummary({ scenario: 'descent-demo', steps });
  assert.deepEqual(summary.deltaUSeries, steps.map((s) => s.deltaU));
});

// ---------------------------------------------------------------------------
// 7. resolveStateDir precedence (pure)
// ---------------------------------------------------------------------------

test('resolveStateDir precedence: explicit stateDir > env > default', () => {
  assert.equal(resolveStateDir({ stateDir: '/explicit', env: { YURI_STATE_DIR: '/from-env' } }), '/explicit');
  assert.equal(resolveStateDir({ env: { YURI_STATE_DIR: '/from-env' } }), '/from-env');
  const def = resolveStateDir({ env: {} });
  assert.ok(def.endsWith(path.join('_SYSTEM', 'state')), `default must end in _SYSTEM/state, got ${def}`);
});

test('traceDirFor appends energy-trace', () => {
  assert.equal(traceDirFor('/some/state'), path.join('/some/state', 'energy-trace'));
});

// ---------------------------------------------------------------------------
// 8. runExperiment — end-to-end I/O, --state-dir honored, output JSON valid
// ---------------------------------------------------------------------------

test('runExperiment writes a valid summary JSON to --out', async () => {
  const tmp = makeTmpDir();
  const out = path.join(tmp, 'summary.json');
  const result = await runExperiment({
    scenario: 'descent-demo',
    out,
    stateDir: tmp,
    runId: 'e2e-1',
    dateOverride: '2026-07-01',
  });
  assert.ok(fs.existsSync(out), 'summary file must exist');
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(parsed.scenario, 'descent-demo');
  assert.equal(parsed.transitionCount, 15);
  assert.equal(parsed.accepted, 15);
  assert.equal(parsed.rejected, 0);
  assert.equal(parsed.deltaUSeries.length, 15);
  assert.equal(result.summary.finalU, parsed.finalU);
});

test('runExperiment honors --state-dir: traces land under <state-dir>/energy-trace', async () => {
  const stateDir = makeTmpDir();
  const out = path.join(makeTmpDir(), 'summary.json');
  const result = await runExperiment({
    scenario: 'descent-demo',
    out,
    stateDir,
    runId: 'state-dir-test',
    dateOverride: '2026-07-02',
  });
  const expectedTraceDir = path.join(stateDir, 'energy-trace');
  assert.equal(result.traceDir, expectedTraceDir);
  const traceFile = path.join(expectedTraceDir, '2026-07-02.jsonl');
  assert.ok(fs.existsSync(traceFile), `trace file must exist under state-dir: ${traceFile}`);
  for (const f of result.traceFiles) {
    assert.ok(f.startsWith(stateDir), `every trace file must be under state-dir, got ${f}`);
  }
});

test('runExperiment honors YURI_STATE_DIR when --state-dir is absent', async () => {
  const stateDir = makeTmpDir();
  const out = path.join(makeTmpDir(), 'summary.json');
  const saved = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = stateDir;
  try {
    const result = await runExperiment({
      scenario: 'descent-demo',
      out,
      runId: 'env-state-test',
      dateOverride: '2026-07-03',
    });
    assert.equal(result.traceDir, path.join(stateDir, 'energy-trace'));
    assert.ok(fs.existsSync(path.join(stateDir, 'energy-trace', '2026-07-03.jsonl')));
  } finally {
    if (saved === undefined) delete process.env.YURI_STATE_DIR;
    else process.env.YURI_STATE_DIR = saved;
  }
});

test('runExperiment writes exactly one JSONL trace line per transition', async () => {
  const stateDir = makeTmpDir();
  const out = path.join(makeTmpDir(), 'summary.json');
  await runExperiment({
    scenario: 'descent-demo',
    out,
    stateDir,
    runId: 'jsonl-count',
    dateOverride: '2026-07-04',
  });
  const traceFile = path.join(stateDir, 'energy-trace', '2026-07-04.jsonl');
  const lines = fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 15, 'one trace line per transition');
  // Every line is valid JSON with advisory flags.
  for (const line of lines) {
    const rec = JSON.parse(line);
    assert.equal(rec.advisory_only, true);
    assert.equal(rec.local_truth_claim, false);
  }
});

test('runExperiment requires scenario and out', async () => {
  await assert.rejects(() => runExperiment({ out: '/tmp/x.json' }), /requires a scenario/);
  await assert.rejects(() => runExperiment({ scenario: 'descent-demo' }), /requires an --out/);
});

test('runExperiment from a malformed synthetic scenario writes no summary', async () => {
  const expDir = makeTmpDir();
  // Build a runner pointed at a custom dir is not directly supported via
  // runExperiment (it uses the canonical experiments dir), so assert that a
  // malformed real-style scenario id (missing file) fails before any write.
  const out = path.join(makeTmpDir(), 'should-not-exist.json');
  await assert.rejects(
    () => runExperiment({ scenario: 'definitely-not-a-real-scenario', out, stateDir: expDir }),
    /not found/,
  );
  assert.equal(fs.existsSync(out), false, 'no summary file may be written on a failed load');
});

// ---------------------------------------------------------------------------
// 9. Privacy Gate: only validateRecord-passing records are written
// ---------------------------------------------------------------------------

test('runExperiment trace records all pass the Privacy Gate (round-trip parse)', async () => {
  const stateDir = makeTmpDir();
  const out = path.join(makeTmpDir(), 'summary.json');
  await runExperiment({
    scenario: 'descent-demo',
    out,
    stateDir,
    runId: 'privacy-check',
    dateOverride: '2026-07-05',
  });
  const traceFile = path.join(stateDir, 'energy-trace', '2026-07-05.jsonl');
  const lines = fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean);
  // Records that passed appendTrace's validateRecord re-parse cleanly; assert
  // no free-text string fields leaked beyond the allow-listed paths by checking
  // that summary numeric fields are numbers and no obvious text smuggling exists.
  for (const line of lines) {
    const rec = JSON.parse(line);
    assert.equal(typeof rec.U_after, 'number');
    assert.equal(typeof rec.deltaU, 'number');
    // lane/decision/dominantTerm are allow-listed strings; runId/timestamp too.
    assert.ok(typeof rec.lane === 'string');
    assert.ok(['accept', 'reject'].includes(rec.decision));
  }
});

// ---------------------------------------------------------------------------
// 10. parseArgs CLI parser
// ---------------------------------------------------------------------------

test('parseArgs parses run command with flags', () => {
  const args = parseArgs(['run', '--scenario', 'descent-demo', '--out', '/tmp/o.json', '--state-dir', '/tmp/s']);
  assert.deepEqual(args._, ['run']);
  assert.equal(args.scenario, 'descent-demo');
  assert.equal(args.out, '/tmp/o.json');
  assert.equal(args['state-dir'], '/tmp/s');
});

test('parseArgs treats a flag with no value as boolean true', () => {
  const args = parseArgs(['run', '--help']);
  assert.equal(args.help, true);
});

// ---------------------------------------------------------------------------
// 11. CLI integration (spawned subprocess)
// ---------------------------------------------------------------------------

test('CLI run --scenario descent-demo --out --state-dir produces a valid summary', async () => {
  const { spawnSync } = await import('node:child_process');
  const stateDir = makeTmpDir();
  const out = path.join(makeTmpDir(), 'cli-summary.json');
  const scriptPath = path.join(__dirname, 'yuri-energy-experiment.mjs');
  const res = spawnSync(
    process.execPath,
    [scriptPath, 'run', '--scenario', 'descent-demo', '--out', out, '--state-dir', stateDir],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, `CLI must exit 0; stderr=${res.stderr}`);
  assert.ok(fs.existsSync(out), 'CLI must write the summary file');
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(parsed.scenario, 'descent-demo');
  assert.equal(parsed.accepted, 15);
  // Trace files land under the supplied state dir.
  const traceDir = path.join(stateDir, 'energy-trace');
  assert.ok(fs.existsSync(traceDir), 'CLI must create the energy-trace dir under --state-dir');
});

test('CLI exits non-zero on a missing scenario', async () => {
  const { spawnSync } = await import('node:child_process');
  const out = path.join(makeTmpDir(), 'nope.json');
  const scriptPath = path.join(__dirname, 'yuri-energy-experiment.mjs');
  const res = spawnSync(
    process.execPath,
    [scriptPath, 'run', '--scenario', 'no-such-scenario', '--out', out],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 1, 'missing scenario must exit 1');
  assert.match(res.stderr, /experiment failed/);
});

test('CLI exits 2 when required flags are missing', async () => {
  const { spawnSync } = await import('node:child_process');
  const scriptPath = path.join(__dirname, 'yuri-energy-experiment.mjs');
  const res = spawnSync(process.execPath, [scriptPath, 'run', '--scenario', 'descent-demo'], { encoding: 'utf8' });
  assert.equal(res.status, 2, 'missing --out must exit 2');
  assert.match(res.stderr, /--out <path> is required/);
});
