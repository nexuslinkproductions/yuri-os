#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planWorkflow, runWorkflow } from './workflow-runner.mjs';
import { loadWorkflows } from './workflow-registry.mjs';
import { loadRoster } from './role-registry.mjs';
import path from 'node:path';
import os from 'node:os';

import {
  _validateStageGraph,
  _matchTriggerPolicy,
  _buildPacket,
  _resolveStageAutonomy,
  _buildBlackboardPath,
  buildRunId,
  PACKET_STATUS,
  AUTONOMY,
} from './workflow-runner.mjs';

// ============================================================
// TDD: red-first — current _validateStageGraph is partial (only stage-id indexing,
// unknown dependsOn guard, dup guard, finalizeAuthority cap). It LACKS:
//   - consumes/produces artifact-name contract
//   - independentOf contract for verification stages
//   - explicit DAG cycle detection (no Kahn topo-sort; partial topological order)
//   - role-resolution guard (roster param unused)
// Each test below asserts the CORRECT contract; all must PASS after the patched
// runner is integrated. Run with: node --test _SYSTEM/mure/workflow-runner.test.mjs
const roster = {
  meta: {},
  roles: [
    { id: 'architect', name: 'Architect', group: 'engineering', capabilities: ['plan'], substrate: 'native', lane: 'opus', autonomyClass: 'self-governable' },
    { id: 'worker', name: 'Worker', group: 'engineering', capabilities: ['code'], substrate: 'native', lane: 'sonnet', autonomyClass: 'self-governable' },
    { id: 'adjudicator', name: 'Adjudicator', group: 'verification', capabilities: ['verify'], substrate: 'native', lane: 'opus', autonomyClass: 'self-governable' },
    { id: 'oracle', name: 'Oracle', group: 'verification', capabilities: ['verify'], substrate: 'native', lane: 'sonnet', autonomyClass: 'self-governable' },
    { id: 'steward', name: 'Steward', group: 'governance', capabilities: ['governance'], substrate: 'native', lane: 'opus', autonomyClass: 'owner-gated' },
  ],
  byId: null,
  byGroup: null,
  byCapability: null,
};
// Build byId map per loadRoster contract
roster.byId = new Map(roster.roles.map((r) => [r.id, r]));
function makeWorkflow(stages) {
  return {
    id: 'test-wf',
    name: 'Test Workflow',
    stages,
  };
}

test('_validateStageGraph: accepts a well-formed artifact-name DAG with independentOf on verifiers', () => {
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'] },
    { id: 'implement', role: 'worker', dependsOn: ['plan'], consumes: ['plan.md'], produces: ['impl.diff'] },
    { id: 'verify', role: 'adjudicator', dependsOn: ['implement'], consumes: ['impl.diff'], independentOf: ['implement'], produces: ['verdict.json'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, true, `unexpected errors: ${JSON.stringify(r.errors)}`);
  assert.deepEqual(r.topologicalOrder, ['plan', 'implement', 'verify']);
});

test('_validateStageGraph: rejects unknown dependsOn target', () => {
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'] },
    { id: 'implement', role: 'worker', dependsOn: ['phantom'], consumes: ['plan.md'], produces: ['impl.diff'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("phantom")), 'expected unknown dependsOn message');
});

test('_validateStageGraph: rejects consumes without produces-ancestor', () => {
  const wf = makeWorkflow([
    { id: 'implement', role: 'worker', consumes: ['plan.md'], produces: ['impl.diff'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("consumes artifact 'plan.md'")), 'expected consumes-without-producer error');
});

test('_validateStageGraph: rejects verifier without independentOf', () => {
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'] },
    { id: 'implement', role: 'worker', dependsOn: ['plan'], consumes: ['plan.md'], produces: ['impl.diff'] },
    { id: 'verify', role: 'adjudicator', dependsOn: ['implement'], consumes: ['impl.diff'] }, // NO independentOf
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('independentOf')), 'expected verifier independentOf error');
});

test('_validateStageGraph: detects DAG cycle', () => {
  const wf = makeWorkflow([
    { id: 'a', role: 'architect', dependsOn: ['c'], produces: ['a.md'] },
    { id: 'b', role: 'worker', dependsOn: ['a'], consumes: ['a.md'], produces: ['b.diff'] },
    { id: 'c', role: 'worker', dependsOn: ['b'], consumes: ['b.diff'], produces: ['c.md'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('cycle')), 'expected cycle error');
});

test('_validateStageGraph: rejects duplicate stage id', () => {
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'] },
    { id: 'plan', role: 'worker', produces: ['impl.diff'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate')), 'expected duplicate id error');
});

test('_validateStageGraph: rejects unknown role', () => {
  const wf = makeWorkflow([
    { id: 'plan', role: 'phantom-role', produces: ['plan.md'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('unknown role')), 'expected unknown role error');
});

test('_validateStageGraph: rejects multiple finalizeAuthority stages', () => {
  const wf = makeWorkflow([
    { id: 'final-a', role: 'architect', finalizeAuthority: true, produces: ['a.md'] },
    { id: 'final-b', role: 'architect', finalizeAuthority: true, produces: ['b.md'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('finalizeAuthority')), 'expected finalizeAuthority cap error');
});

test('_matchTriggerPolicy: returns top scored workflow', () => {
  const reg = { workflows: [
    { id: 'recover', tags: ['backend', 'recovery'] },
    { id: 'sync', tags: ['skills', 'sync'] },
  ] };
  const id = _matchTriggerPolicy(reg, 'backend recovery planning', { minScore: 1 });
  assert.equal(id, 'recover');
});

test('_matchTriggerPolicy: throws on no match (FAIL-CLOSED)', () => {
  const reg = { workflows: [
    { id: 'recover', tags: ['backend'] },
  ] };
  assert.throws(() => _matchTriggerPolicy(reg, 'totally unrelated', { minScore: 1 }), /no workflow matched/);
});

test('_matchTriggerPolicy: throws on ambiguous tie', () => {
  const reg = { workflows: [
    { id: 'alpha', tags: ['shared'] },
    { id: 'bravo', tags: ['shared'] },
  ] };
  assert.throws(() => _matchTriggerPolicy(reg, 'shared thing', { minScore: 1 }), /AMBIGUOUS/);
});

test('_buildPacket: requires laneId/role/status/resultLabel', () => {
  const pkt = _buildPacket({ laneId: 'sol:test', role: 'worker', status: 'ok', resultLabel: 'X_PASS', text: 'ok' });
  assert.equal(pkt.laneId, 'sol:test');
  assert.equal(pkt.role, 'worker');
  assert.equal(pkt.status, 'ok');
  assert.ok(pkt.tamperHash && pkt.tamperHash.length === 64);
});

test('_buildPacket: rejects invalid status', () => {
  assert.throws(() => _buildPacket({ laneId: 'x', role: 'y', status: 'bogus', resultLabel: 'X' }), /invalid status/);
});

test('_resolveStageAutonomy: owner-gated floor wins', () => {
  const stage = { autonomy: 'self-governable' };
  const role = { autonomyClass: 'owner-gated' };
  assert.equal(_resolveStageAutonomy(stage, role), 'owner-gated');
});

test('_resolveStageAutonomy: stage flag forces owner-gated', () => {
  const stage = { autonomy: 'owner-gated' };
  const role = { autonomyClass: 'self-governable' };
  assert.equal(_resolveStageAutonomy(stage, role), 'owner-gated');
});

test('_resolveStageAutonomy: default self-governable', () => {
  const stage = {};
  const role = { autonomyClass: 'self-governable' };
  assert.equal(_resolveStageAutonomy(stage, role), 'self-governable');
});

test('buildRunId: deterministic + filesystem-safe', () => {
  const fixed = new Date('2026-07-21T00:00:00.000Z');
  const id = buildRunId('test-wf', fixed);
  assert.ok(/^test-wf__/.test(id));
  assert.ok(/^[A-Za-z0-9_.-]+$/.test(id), 'runId must be filesystem-safe');
});

test('_buildBlackboardPath: respects blackboardRoot override', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-'));
  const p = _buildBlackboardPath(tmp, 'run-1', 'plan');
  assert.equal(p, path.join(tmp, 'run-1', 'results', 'plan.json'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('PACKET_STATUS: includes only the 4 canonical values', () => {
  assert.deepEqual([...PACKET_STATUS], ['ok', 'malformed', 'error', 'timeout']);
});

test('AUTONOMY: includes only the 2 canonical values', () => {
  assert.deepEqual([...AUTONOMY], ['self-governable', 'owner-gated']);
});
// === Contract migration tests (RED — stage-graph contract fix) ===

test('_validateStageGraph: cycle error reports the involved stage IDs', () => {
  const wf = makeWorkflow([
    { id: 'a', role: 'architect', dependsOn: ['c'], produces: ['a.md'] },
    { id: 'b', role: 'worker', dependsOn: ['a'], consumes: ['a.md'], produces: ['b.diff'] },
    { id: 'c', role: 'worker', dependsOn: ['b'], consumes: ['b.diff'], produces: ['c.md'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false);
  const cycleErr = r.errors.find((e) => e.includes('cycle'));
  assert.ok(cycleErr, 'expected an error mentioning cycle');
  // Contract: cycle members must appear as comma/space-separated stage IDs — not just substring-match.
  const members = ['a', 'b', 'c'];
  const foundCount = members.filter((id) => new RegExp(`(?:^|[^A-Za-z0-9_])${id}(?:[^A-Za-z0-9_]|$)`).test(cycleErr)).length;
  assert.ok(foundCount >= 1, `cycle error must name at least one cycle member (a/b/c), got: ${cycleErr}`);
});

test('planWorkflow: emits stages in topologicalOrder (scrambled declaration)', () => {
  // Declared out of topo order — verify stage comes BEFORE plan stage.
  const wf = makeWorkflow([
    { id: 'verify', role: 'adjudicator', dependsOn: ['implement'], consumes: ['impl.diff'], independentOf: ['implement'], produces: ['verdict.json'], gate: 'adversarial-pass' },
    { id: 'plan', role: 'architect', produces: ['plan.md'], gate: 'plan-ready' },
    { id: 'implement', role: 'worker', dependsOn: ['plan'], consumes: ['plan.md'], produces: ['impl.diff'], gate: 'tests-green' },
  ]);
  const plan = planWorkflow({ workflowId: 'test-wf', registry: { byId: new Map([['test-wf', wf]]) }, roster });
  const ids = plan.stages.map((s) => s.id || s.stage);
  assert.deepEqual(ids, ['plan', 'implement', 'verify'], 'plan.stages must be topo-sorted even when declared out of order');
});

test('planWorkflow: planned stage emits id (canonical) and stage (alias)', () => {
  // Verifier lane (sonnet) differs from producer lane (opus) -> graph validates.
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'], gate: 'plan-ready' },
    { id: 'verify', role: 'oracle', dependsOn: ['plan'], consumes: ['plan.md'], independentOf: ['plan'], produces: ['verdict.json'], gate: 'adversarial-pass' },
  ]);
  const plan = planWorkflow({ workflowId: 'test-wf', registry: { byId: new Map([['test-wf', wf]]) }, roster });
  const verifyStage = plan.stages.find((s) => (s.id || s.stage) === 'verify');
  assert.equal(verifyStage.id, 'verify', 'id field must be canonical');
  assert.equal(verifyStage.stage, 'verify', 'stage alias preserved for existing consumers');
});

test('runWorkflow runtime: stage-graph contract rejects verifier-on-same-lane before any dispatch', async () => {
  // Both adjudicator and architect resolve to lane='opus' in the rig roster -> graph-validation should throw before any dispatch.
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'], gate: 'plan-ready' },
    { id: 'verify', role: 'adjudicator', dependsOn: ['plan'], consumes: ['plan.md'], independentOf: ['plan'], produces: ['verdict.json'], gate: 'adversarial-pass' },
  ]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-'));
  try {
    await assert.rejects(
      runWorkflow({
        workflowId: 'test-wf',
        armed: true,
        blackboardRoot: tmp,
        roster,
        registry: { byId: new Map([['test-wf', wf]]) },
        dispatch: async () => ({ payload: { agent: 'stub' } }),
        testRunner: async () => ({ status: 'ok' }),
        ownerDecision: async () => ({ decision: 'defer' }),
      }),
      (err) => /stage graph invalid/.test(err.message) && /independence|independentOf/i.test(err.message),
      'expected runWorkflow to throw stage-graph invalid + independence error before any dispatch',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('_validateStageGraph: rejects independentOf on a non-verifier-like role', () => {
  // chronicler is NOT a verifier-like role; carrying independentOf must be rejected by clause (4a).
  const wf = makeWorkflow([
    { id: 'plan', role: 'architect', produces: ['plan.md'] },
    { id: 'preview', role: 'chronicler', dependsOn: ['plan'], consumes: ['plan.md'], independentOf: ['plan'], produces: ['owner-preview'] },
  ]);
  const r = _validateStageGraph(wf, roster);
  assert.equal(r.ok, false, 'expected graph invalid; non-verifier role carrying independentOf must be rejected');
  assert.ok(
    r.errors.some((e) => /NOT a verifier-like role|independentOf must not be set/i.test(e)),
    'expected non-verifier independentOf rejection error, got: ' + JSON.stringify(r.errors),
  );
});

