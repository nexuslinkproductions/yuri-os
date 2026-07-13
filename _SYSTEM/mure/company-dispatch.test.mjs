import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyDispatch, planWorkstream, deriveApplyOutcome } from './company-dispatch.mjs';
import { successfulSidecarLeafIds } from '../Scripts/runFleet.mjs';

test('GREEN: planWorkstream WS-A has zero blocking held after owner lock', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json');
  assert.equal(entry.blockingHeld, 0);
  assert.equal(entry.blocked, false);
  assert.equal(entry.clearedHeld, 1);
});

test('GREEN: WS-G fully clears after owner lock with allowArming on steward gate', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-g-cline-pass.json');
  assert.equal(entry.held, 0);
  assert.equal(entry.blockingHeld, 0);
  assert.equal(entry.blocked, false);
  assert.ok(entry.glm >= 1);
  assert.equal(entry.clearedHeld, 1);
});

test('GREEN: companyDispatch dry-run-all produces manifest', async () => {
  const outDir = '_SYSTEM/lane-output/dispatch-test';
  const m = await companyDispatch({
    dryRunAll: true,
    apply: false,
    outDir: `${process.cwd()}/${outDir}`,
    taskFiles: [
      '02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json',
      '02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json',
    ],
  });
  assert.ok(m.manifestPath);
  assert.equal(m.streams.length, 2);
  assert.equal(m.errors.length, 0);
  assert.ok(m.streams.every((s) => s.status === 'planned' || s.status === 'skipped-held'));
});

test('GREEN: extractBlockingLeaves helper deduplicates and filters null leafId', async () => {
  // Import the internal helper for testing
  const { extractBlockingLeaves } = await import('./company-dispatch.mjs');

  const roundLog = [
    {
      verdict: {
        blocking: [
          { layer: 'obligation-floor', leafId: 'leaf-1', reason: 'missing' },
          { layer: 'adversarial', leafId: 'leaf-2', reason: 'gap' },
        ],
      },
    },
    {
      verdict: {
        blocking: [
          { layer: 'convergence', leafId: 'leaf-1', reason: 'recheck' }, // duplicate
          { layer: 'obligation-floor', leafId: null, reason: 'cross-cutting' },
        ],
      },
    },
  ];

  const blocking = extractBlockingLeaves(roundLog);
  assert.equal(blocking.length, 2);
  assert.ok(blocking.includes('leaf-1'));
  assert.ok(blocking.includes('leaf-2'));
});

// ---------------------------------------------------------------------------
// Sidecar lifecycle regression: swarm absent must not auto-fail.
// Defect: when runFleet handles every GLM leaf through successful sidecars,
// runCompany returns swarm:null (glmLeavesToDispatch is empty).  The old inline
// `finalizeOk = swarm?.finalizeOk === true` evaluated to false → spurious
// 'applied-with-failures' + error.  deriveApplyOutcome must classify from
// aggregate sidecar/native/inline outcomes when swarm is absent.
// ---------------------------------------------------------------------------

// Helper: construct a runFleet-shaped result with the given overrides.
function mockFleetResult(overrides = {}) {
  return {
    dryRun: false,
    glmLeaves: [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }],
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 0,
      armed: true,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2', ok: true },
        { label: 'L3', ok: true },
      ],
    },
    clineSidecar: { tasks: [] },
    zaiSidecar: { tasks: [] },
    routerSuggestions: [],
    run: {
      armed: true,
      swarm: null,
      nativeResults: { pool: {}, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
      mlpFeedback: { persisted: false, count: 0, advisory: true },
    },
    mlpFeedback: { persisted: false, count: 0, advisory: true },
    ...overrides,
  };
}

test('REGRESSION: deriveApplyOutcome classifies all-sidecar success (swarm:null) as applied', () => {
  const outcome = deriveApplyOutcome(mockFleetResult());
  assert.equal(outcome.status, 'applied', 'all-sidecar success must be applied, not applied-with-failures');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.error, null);
});

test('REGRESSION: deriveApplyOutcome fails closed when an armed sidecar returns incomplete terminal results', () => {
  const result = mockFleetResult({
    ollamaSidecar: {
      tasks: [{ label: 'L1' }, { label: 'L2' }, { label: 'L3' }],
      spawned: true,
      spawnExitCode: 0,
      armed: true,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2', ok: true },
      ],
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /ollama sidecar.*missing terminal result.*L3/i);
});

test('REGRESSION: deriveApplyOutcome fails closed when a spawned sidecar emits no terminal results', () => {
  const result = mockFleetResult({
    ollamaSidecar: {
      tasks: [{ label: 'L1' }],
      spawned: true,
      spawnExitCode: 0,
      armed: true,
      results: [],
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /ollama sidecar.*missing terminal result.*L1/i);
});

test('PRESERVE: swarm present + finalizeOk true → applied', () => {
  const outcome = deriveApplyOutcome({
    run: { swarm: { finalizeOk: true, finalizeReason: 'converged' } },
  });
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.error, null);
});

test('PRESERVE: swarm present + finalizeOk false → applied-with-failures', () => {
  const outcome = deriveApplyOutcome({
    run: { swarm: { finalizeOk: false, finalizeReason: 'budget-exhausted' } },
  });
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.ok(outcome.error.includes('swarm.finalizeOk=false'));
});

test('REGRESSION: swarm success + native terminal failure → applied-with-failures', () => {
  const outcome = deriveApplyOutcome({
    run: {
      swarm: { finalizeOk: true, finalizeReason: 'converged' },
      nativeSpecs: [{ id: 'reviewer-1', role: 'reviewer' }],
      nativeResults: { pool: { 'reviewer-1': { status: 'fail' } }, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  });
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /native reviewer: fail/i);
});

test('REGRESSION: swarm success + inline terminal failure → applied-with-failures', () => {
  const outcome = deriveApplyOutcome({
    run: {
      swarm: { finalizeOk: true, finalizeReason: 'converged' },
      plan: { inlineSpecs: [{ id: 'oracle-1', role: 'oracle' }] },
      nativeResults: { pool: {}, skipped: [] },
      inlineResults: {
        pool: { 'inline:oracle:oracle-1': { status: 'error' } },
        packets: [],
        skipped: [],
      },
    },
  });
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /inline oracle: error/i);
});

test('PRESERVE: swarm absent + sidecar leaf failed → applied-with-failures', () => {
  const result = mockFleetResult({
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 1,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2', ok: false },
        { label: 'L3', ok: true },
      ],
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('PRESERVE: swarm absent + sidecar spawn error → applied-with-failures', () => {
  const result = mockFleetResult({
    ollamaSidecar: { tasks: [] },
    zaiSidecar: { spawned: false, spawnError: 'ENOENT: node' },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('PRESERVE: swarm absent + native spec failure → applied-with-failures', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      nativeSpecs: [{ id: 'checker', role: 'checker' }],
      nativeResults: { pool: { checker: { status: 'fail' } }, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('INTEGRATION: companyDispatch apply with mock runFleet all-sidecar success → no hasFailures', async () => {
  const outDir = `${process.cwd()}/_SYSTEM/lane-output/dispatch-test-sidecar`;
  const mockRunFleet = async () => mockFleetResult({
    glmLeaves: [{ id: 'ws-a-leaf-1' }, { id: 'ws-a-leaf-2' }],
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 0,
      armed: true,
      results: [
        { label: 'ws-a-leaf-1', ok: true },
        { label: 'ws-a-leaf-2', ok: true },
      ],
    },
  });
  const m = await companyDispatch({
    apply: true,
    dryRunAll: false,
    outDir,
    runFleet: mockRunFleet,
    taskFiles: ['02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json'],
  });
  assert.equal(m.hasFailures, false, 'all-sidecar success must not set hasFailures');
  assert.equal(m.errors.length, 0, 'no errors expected for all-sidecar success');
  assert.equal(m.streams.length, 1);
  assert.equal(m.streams[0].status, 'applied', 'stream status should be applied');
  assert.equal(m.streams[0].swarm, null, 'swarm entry should be null when all leaves sidecar-handled');
});

// ---------------------------------------------------------------------------
// Deepening: native/inline spec completeness, sidecar fallback, strict ok.
// ---------------------------------------------------------------------------

test('DEEP: successfulSidecarLeafIds filters by ok===true only', () => {
  const ids = successfulSidecarLeafIds([
    { label: 'L1', ok: true },
    { label: 'L2', ok: false },
    { label: 'L3', ok: true },
    { label: 'L4' },
  ]);
  assert.deepEqual(ids, ['L1', 'L3']);
});

test('DEEP: all-sidecar success + nativeSpecs expected but native unavailable → applied-with-failures', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      nativeSpecs: [{ id: 'nat-1', role: 'checker' }],
      nativeResults: { pool: {}, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
  assert.ok(outcome.error.includes('native'));
});

test('DEEP: all-sidecar success + nativeSpecs with successful native → applied', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      nativeSpecs: [{ id: 'nat-1', role: 'checker' }],
      nativeResults: { pool: { 'nat-1': { status: 'ok' } }, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.ok, true);
});

test('DEEP: failed sidecar leaf + successful swarm fallback → applied', () => {
  const result = {
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 1,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2', ok: false },
      ],
    },
    zaiSidecar: { tasks: [] },
    run: {
      swarm: { finalizeOk: true, finalizeReason: 'converged' },
      nativeResults: { pool: {}, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  };
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.ok, true);
});

test('DEEP: failed sidecar leaf + failed swarm fallback → applied-with-failures', () => {
  const result = {
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 1,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2', ok: false },
      ],
    },
    zaiSidecar: { tasks: [] },
    run: {
      swarm: { finalizeOk: false, finalizeReason: 'budget-exhausted' },
      nativeResults: { pool: {}, skipped: [] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
    },
  };
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('DEEP: partial sidecar results (ok field missing) → fail-closed', () => {
  const result = mockFleetResult({
    ollamaSidecar: {
      spawned: true,
      spawnExitCode: 0,
      results: [
        { label: 'L1', ok: true },
        { label: 'L2' },
      ],
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('DEEP: inline spec skipped (environmental) → NOT a failure', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      plan: { inlineSpecs: [{ id: 'cal-1', role: 'calibrator' }] },
      inlineResults: {
        pool: { 'inline:calibrator:cal-1': { status: 'skipped' } },
        packets: [],
        skipped: [],
      },
      nativeResults: { pool: {}, skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.ok, true);
});

test('DEEP: inline spec missing → failure', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      plan: { inlineSpecs: [{ id: 'cal-1', role: 'calibrator' }] },
      inlineResults: { pool: {}, packets: [], skipped: [] },
      nativeResults: { pool: {}, skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});

test('DEEP: inline spec error → failure', () => {
  const result = mockFleetResult({
    run: {
      swarm: null,
      plan: { inlineSpecs: [{ id: 'ora-1', role: 'oracle' }] },
      inlineResults: {
        pool: { 'inline:oracle:ora-1': { status: 'error' } },
        packets: [],
        skipped: [],
      },
      nativeResults: { pool: {}, skipped: [] },
    },
  });
  const outcome = deriveApplyOutcome(result);
  assert.equal(outcome.status, 'applied-with-failures');
  assert.equal(outcome.ok, false);
});
