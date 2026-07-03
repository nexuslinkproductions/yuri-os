// ceo.test.mjs — hermetic node:test suite for _SYSTEM/mure/ceo.mjs
// @capability: mure-ceo-entry-test
//
// Covers:
//   1. CLI --dry-run on a sample task prints a plan with ZERO SPEND (child_process).
//   2. buildTaskSpec schema-shape assertions (summary, subtasks[], tags).
//   3. decomposeFreeText: multi-segment split + single-clause pipeline synthesis.
//   4. inferNeeds: feature-detect deriveNeeds when present; fallback when absent.
//   5. dispatchAsCeo: dry-run forces armed:false (never arms); honors injected companyModule.
//   6. watchRun / snapshotRun: degrade gracefully when run dir absent.
//
// No network, no real dispatch, zero spend. Every assertion is local-evidence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTaskSpec, decomposeFreeText, inferNeeds, inferNeedsFallback,
  dispatchAsCeo, snapshotRun, watchRun, renderReport, collectResultLabels,
  CEO_RESULT_LABEL,
} from './ceo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CEO = path.join(HERE, 'ceo.mjs');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// 1. CLI --dry-run (child_process) — the headline test. Asserts a plan prints
//    with zero spend, no swarm dispatch, and a conforming RESULT_LABEL.
// ---------------------------------------------------------------------------
test('CLI --dry-run prints a plan with ZERO SPEND and a P-result label', () => {
  const r = spawnSync(NODE, [CEO, '--dry-run', 'Build a feature module with tests and document it'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(r.status, 0, `ceo exited ${r.status}; stderr: ${r.stderr}`);
  const out = r.stdout || '';
  assert.match(out, /MURE CEO — DRY-RUN/i, 'dry-run banner missing');
  assert.match(out, /CAST \(subtask → role → substrate\/lane → governance\)/i, 'cast table missing');
  assert.match(out, /ZERO SPEND/i, 'zero-spend line missing');
  assert.match(out, /No live swarm/i, 'expected no-live-swarm line in dry-run');
  assert.doesNotMatch(out, /SWARM: runId=/, 'dry-run must not show a live swarm runId');
  // RESULT_LABEL must conform: NNXX_..._(X|P|F)_PASS_COMMITTED, and dry-run → P (partial).
  assert.match(out, /01CE_[A-Z_]+_P_PASS_COMMITTED/, 'dry-run must emit a P-result label');
  // Must mention the intake/decode subtask (envoy).
  assert.match(out, /intake.*envoy/i, 'intake→envoy cast missing');
});

test('CLI --dry-run with no task prints usage and exits non-zero', () => {
  const r = spawnSync(NODE, [CEO, '--dry-run'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(r.status, 0, 'no-task should exit non-zero');
  assert.match(r.stderr || '', /no task given|USAGE/i, 'usage/help missing on empty input');
});

test('CLI --json emits machine-readable JSON with schema fields', () => {
  const r = spawnSync(NODE, [CEO, '--dry-run', '--json', 'Research prior art for a caching layer'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(r.status, 0, `--json exited ${r.status}; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.dryRun, true, 'dryRun must be true');
  assert.equal(typeof parsed.mureArmed, 'boolean', 'mureArmed must be boolean');
  assert.ok(Array.isArray(parsed.casts), 'casts must be an array');
  assert.ok(parsed.casts.length > 0, 'must cast at least one subtask');
  assert.match(parsed.resultLabel, /01CE_[A-Z_]+_P_PASS_COMMITTED/, 'json resultLabel must conform');
  assert.ok(parsed.plan && typeof parsed.plan.subtasks === 'number', 'plan.subtasks missing');
});

// ---------------------------------------------------------------------------
// 2. buildTaskSpec — schema-shape assertions on the built task spec.
// ---------------------------------------------------------------------------
test('buildTaskSpec produces a conforming task spec {summary, subtasks[], tags[]}', async () => {
  const { task, inferenceSource } = await buildTaskSpec('Build a CLI tool with tests', null);
  assert.equal(typeof task.summary, 'string');
  assert.ok(task.summary.length > 0, 'summary non-empty');
  assert.ok(Array.isArray(task.subtasks), 'subtasks is an array');
  assert.ok(task.subtasks.length >= 1, 'at least one subtask');
  assert.ok(Array.isArray(task.tags), 'tags is an array');

  // Each subtask must have the minimum schema fields planCompany expects.
  for (const s of task.subtasks) {
    assert.ok(typeof s.id === 'string' && s.id.length > 0, `subtask id missing: ${JSON.stringify(s)}`);
    assert.ok(typeof s.prompt === 'string' && s.prompt.length > 0, `subtask ${s.id} prompt missing`);
    assert.ok(Array.isArray(s.need), `subtask ${s.id} need must be an array`);
  }

  // The intake/decode subtask must be present as the opener.
  assert.equal(task.subtasks[0].id, 'intake', 'first subtask must be intake (envoy decode)');
  assert.ok(inferenceSource, 'inferenceSource must be set');
});

test('buildTaskSpec synthesizes a default pipeline for a single-clause input', async () => {
  const { task } = await buildTaskSpec('ship the feature', null);
  const ids = task.subtasks.map((s) => s.id);
  assert.ok(ids.includes('research'), 'pipeline must include research');
  assert.ok(ids.includes('build'), 'pipeline must include build');
  assert.ok(ids.includes('verify'), 'pipeline must include verify');
  assert.ok(ids.includes('doc'), 'pipeline must include doc');
  // "ship" → HIGH blast + ship tag.
  assert.ok(task.tags.includes('ship'), 'ship keyword → ship tag');
});

test('buildTaskSpec splits multi-clause input into distinct subtasks', async () => {
  const { task } = await buildTaskSpec('Research caching. Build the module. Write tests. Document it.', null);
  const ids = task.subtasks.map((s) => s.id);
  // intake + at least 3 segments (some may merge).
  assert.ok(task.subtasks.length >= 4, `multi-clause should yield >=4 subtasks, got ${task.subtasks.length}`);
});

// ---------------------------------------------------------------------------
// 3. decomposeFreeText
// ---------------------------------------------------------------------------
test('decomposeFreeText: empty input → no subtasks', async () => {
  const { subtasks } = await decomposeFreeText('', null);
  assert.equal(subtasks.length, 0);
});

// ---------------------------------------------------------------------------
// 4. inferNeeds — feature-detect + fallback
// ---------------------------------------------------------------------------
test('inferNeeds uses deriveNeeds when the companyModule exports it', async () => {
  const stub = { deriveNeeds: (text) => ['stub-cap-from-deriveNeeds'] };
  const { needs, source } = await inferNeeds('anything', stub);
  assert.equal(source, 'deriveNeeds');
  assert.deepEqual(needs, ['stub-cap-from-deriveNeeds']);
});

test('inferNeeds falls back when deriveNeeds is absent', async () => {
  const { needs, source } = await inferNeeds('research the prior art and build it', null);
  assert.equal(source, 'fallback');
  assert.ok(needs.length > 0, 'fallback should infer needs from keywords');
  assert.ok(needs.includes('local-first-search'), 'research keyword → local-first-search');
  assert.ok(needs.includes('code-generation'), 'build keyword → code-generation');
});

test('inferNeeds returns source:none when no keywords match and no deriveNeeds', async () => {
  const { needs, source } = await inferNeeds('zzz qwerty', null);
  assert.equal(source, 'none');
  assert.equal(needs.length, 0);
});

test('inferNeedsFallback: security/audit → security capabilities', () => {
  const needs = inferNeedsFallback('audit the module for security issues');
  assert.ok(needs.includes('security-review'));
  assert.ok(needs.includes('safety-audit'));
});

test('inferNeeds degrades when deriveNeeds throws', async () => {
  const stub = { deriveNeeds: () => { throw new Error('boom'); } };
  const { source } = await inferNeeds('build it', stub);
  assert.equal(source, 'fallback');
});

// ---------------------------------------------------------------------------
// 5. dispatchAsCeo — dry-run forces armed:false; never arms; honors injection
// ---------------------------------------------------------------------------
test('dispatchAsCeo dry-run forces armed:false and never arms', async () => {
  // Stub company module: captures the armed arg CEO passes. Must NEVER receive armed:true.
  let capturedArmed = 'NOT_CALLED';
  const stubCompany = {
    runCompany: async (task, opts) => {
      capturedArmed = opts.armed;
      return {
        name: 'MURE', armed: false, dryRun: true,
        plan: { name: 'MURE', summary: { subtasks: 1, cast: 1, glm: 0, native: 0, inline: 0, held: 0 }, casts: [], glmLeaves: [], nativeSpecs: [], held: [] },
        swarm: null, nativeSpecs: [], held: [],
      };
    },
    isMureArmed: () => false,
  };
  const result = await dispatchAsCeo({ summary: 'x', subtasks: [] }, { dryRun: true, companyModule: stubCompany });
  assert.equal(capturedArmed, false, 'dry-run must pass armed:false to runCompany (never undefined/true)');
  assert.equal(result.ceo.dryRun, true);
  assert.equal(result.ceo.mureArmed, false);
});

test('dispatchAsCeo live-mode passes armed:undefined (lets isMureArmed decide)', async () => {
  let capturedArmed = 'NOT_CALLED';
  const stubCompany = {
    runCompany: async (task, opts) => {
      capturedArmed = opts.armed;
      return { name: 'MURE', armed: false, plan: { summary: {}, casts: [] }, held: [], nativeSpecs: [] };
    },
    isMureArmed: () => false,
  };
  await dispatchAsCeo({ summary: 'x', subtasks: [] }, { dryRun: false, companyModule: stubCompany });
  assert.equal(capturedArmed, undefined, 'live mode must pass armed:undefined so isMureArmed is the sole authority');
});

test('dispatchAsCeo throws clear error if company module lacks runCompany', async () => {
  await assert.rejects(
    () => dispatchAsCeo({ summary: 'x' }, { dryRun: true, companyModule: { isMureArmed: () => false } }),
    /runCompany/,
    'must throw naming runCompany',
  );
});

// ---------------------------------------------------------------------------
// 6. snapshotRun / watchRun — graceful degradation
// ---------------------------------------------------------------------------
test('snapshotRun returns empty + exists:false for a non-existent runId', () => {
  const snap = snapshotRun('nonexistent-run-id-ceo-test-xyz');
  assert.equal(snap.exists, false);
  assert.equal(snap.results.length, 0);
  assert.equal(snap.status, null);
  assert.equal(snap.spawns.length, 0);
});

test('watchRun degrades gracefully when run dir is absent (stops via maxMs)', async () => {
  const logs = [];
  // Tight ceiling so the test doesn't hang; sleep shim is instant.
  const snap = await watchRun('nonexistent-ceo-watch-test', {
    intervalMs: 1,
    maxMs: 5,
    stallMs: 100,
    sleep: async () => {},
    out: (s) => logs.push(s),
  });
  assert.equal(snap.exists, false);
  assert.ok(logs.some((l) => /not found yet|maxMs ceiling/i.test(l)), `expected a not-found or ceiling log; got: ${logs.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// 7. renderReport + collectResultLabels
// ---------------------------------------------------------------------------
test('renderReport renders casts, substrates, CEO summary for a dry-run result', () => {
  const result = {
    name: 'MURE', armed: false, dryRun: true,
    plan: {
      summary: { subtasks: 2, cast: 2, glm: 1, native: 1, inline: 0, held: 0 },
      casts: [
        { subtaskId: 'intake', role: 'envoy', target: { substrate: 'native', lane: 'sonnet' }, ruling: { class: 'self-governable' } },
        { subtaskId: 'build', role: 'engineer', target: { substrate: 'glm', lane: 'glm' }, ruling: { class: 'self-governable' } },
      ],
    },
    held: [],
    nativeSpecs: [],
    swarm: null,
  };
  const report = renderReport(result, {});
  assert.match(report, /CEO REPORT/);
  assert.match(report, /ROLES CAST:/);
  assert.match(report, /SUBSTRATES: glm=1  native=1/);
  assert.match(report, /ZERO SPEND/);
  assert.match(report, /No live swarm/);
});

test('collectResultLabels dedupes labels from pool + snapshot', () => {
  const result = { swarm: { poolOutputs: { a: { resultLabel: '01AB_X_X_PASS_COMMITTED' }, b: { resultLabel: '02CD_Y_P_PASS_COMMITTED' } } } };
  const snap = { results: [{ resultLabel: '01AB_X_X_PASS_COMMITTED' }, { resultLabel: '03EF_Z_F_PASS_COMMITTED' }] };
  const labels = collectResultLabels(result, snap);
  assert.deepEqual(labels.sort(), ['01AB_X_X_PASS_COMMITTED', '02CD_Y_P_PASS_COMMITTED', '03EF_Z_F_PASS_COMMITTED'].sort());
});

test('CEO_RESULT_LABEL prefix conforms to the lane-result grammar (NNXX_)', () => {
  assert.match(CEO_RESULT_LABEL, /^\d{2}[A-Z]{2}_/, 'CEO_RESULT_LABEL must start with NNXX_');
});
