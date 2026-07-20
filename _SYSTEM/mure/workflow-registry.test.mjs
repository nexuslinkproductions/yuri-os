#!/usr/bin/env node
// Tests for mure/workflow-registry.mjs — behavior through the public interface.
// Run: node --test _SYSTEM/mure/workflow-registry.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadWorkflows, validateWorkflows, validateWorkflowsGraph, getWorkflow, matchWorkflowByGoal, indexWorkflows,
} from './workflow-registry.mjs';
import { loadRoster } from './role-registry.mjs';

test('loadWorkflows registers the standard production pipeline recon->...->ship', () => {
  const reg = loadWorkflows();
  const wf = getWorkflow(reg, 'standard-production-pipeline');
  assert.ok(wf, 'standard-production-pipeline is registered');
  assert.equal(wf.stages[0].id, 'recon');
  assert.equal(wf.stages.at(-1).id, 'ship');
  const order = wf.stages.map((s) => s.id);
  assert.deepEqual(order, ['recon', 'plan', 'production', 'verification', 'preview', 'ship']);
});

test('canonical registry validates against the live MURE roster', () => {
  const reg = loadWorkflows();
  const v = validateWorkflows(reg, loadRoster());
  assert.ok(v.ok, 'registry valid; errors: ' + JSON.stringify(v.errors));
  assert.equal(v.workflowCount, reg.workflows.length);
});

test('every stage role resolves to a real MURE role', () => {
  const reg = loadWorkflows();
  const roster = loadRoster();
  for (const wf of reg.workflows) {
    for (const st of wf.stages) {
      assert.ok(roster.byId.get(st.role), `stage ${st.id || st.stage} role ${st.role} exists in roster`);
    }
  }
});

test('validateWorkflows rejects a stage referencing an unknown role', () => {
  const bad = { workflows: [{ id: 'x', name: 'x', description: 'x', trigger: 't', feedbackGate: { type: 'deterministic' }, stages: [{ stage: 's', role: 'no-such-role', gate: 'g' }] }], byId: new Map() };
  bad.byId.set('x', bad.workflows[0]);
  const v = validateWorkflows(bad, loadRoster());
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('unknown role')), 'error names the unknown role');
});

test('validateWorkflows rejects a non-deterministic feedback gate', () => {
  const bad = { workflows: [{ id: 'y', name: 'y', description: 'y', trigger: 't', feedbackGate: { type: 'vibes' }, stages: [{ stage: 's', role: 'scout', gate: 'g' }] }], byId: new Map() };
  bad.byId.set('y', bad.workflows[0]);
  const v = validateWorkflows(bad, loadRoster());
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('deterministic')), 'error names the deterministic requirement');
});

test('production stage carries an owner-gated ship and a deterministic feedback gate', () => {
  const reg = loadWorkflows();
  const wf = getWorkflow(reg, 'standard-production-pipeline');
  const ship = wf.stages.find((s) => (s.id || s.stage) === 'ship');
  assert.equal(ship.autonomy, 'owner-gated', 'ship is owner-gated');
  assert.equal(wf.feedbackGate.type, 'deterministic');
  assert.equal(wf.feedbackGate.loop, 'red-green-refactor');
});

test('matchWorkflowByGoal routes a build/functional goal to the default pipeline', () => {
  const reg = loadWorkflows();
  const wf = matchWorkflowByGoal(reg, 'make yuri-os functional again');
  assert.ok(wf);
  assert.equal(wf.id, 'standard-production-pipeline');
});

test('indexWorkflows exposes workflows by id and by tag', () => {
  const reg = loadWorkflows();
  const idx = indexWorkflows(reg);
  assert.ok(idx.ids.includes('standard-production-pipeline'));
  assert.ok(idx.byTag.get('default').includes('standard-production-pipeline'));
});

test('validateWorkflows rejects a stage missing the canonical id field', () => {
  const reg = {
    workflows: [{
      id: 'wf-bad', name: 'bad', description: 'd', trigger: 't', feedbackGate: { type: 'deterministic', loop: 'red-green-refactor' },
      stages: [{ role: 'scout', gate: 'g', consumes: [], produces: [], dependsOn: [] }],
    }],
  };
  const v = validateWorkflows(reg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('id')), `expected id-required error, got: ${JSON.stringify(v.errors)}`);
});

test('validateWorkflows rejects a stage where consumes/produces/dependsOn are not arrays', () => {
  const reg = {
    workflows: [{
      id: 'wf-scalar', name: 's', description: 'd', trigger: 't', feedbackGate: { type: 'deterministic', loop: 'red-green-refactor' },
      stages: [{ id: 'plan', role: 'architect', gate: 'g', consumes: 'scalar', produces: ['a.md'], dependsOn: [] }],
    }],
  };
  const v = validateWorkflows(reg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /consumes|produces|dependsOn/.test(e)), `expected array-shape error, got: ${JSON.stringify(v.errors)}`);
});

test('validateWorkflows accepts a fully-conforming migrated stage', () => {
  const reg = loadWorkflows();
  const v = validateWorkflows(reg);
  assert.equal(v.ok, true, `unexpected errors: ${JSON.stringify(v.errors)}`);
  const wf = getWorkflow(reg, 'standard-production-pipeline');
  for (const s of wf.stages) {
    assert.ok(Array.isArray(s.consumes), `${s.id} consumes must be array`);
    assert.ok(Array.isArray(s.produces), `${s.id} produces must be array`);
    assert.ok(Array.isArray(s.dependsOn), `${s.id} dependsOn must be array`);
    if (s.id === 'recon') assert.deepEqual(s.dependsOn, [], 'root stage must have dependsOn=[]');
  }
  // ship (steward) is NOT a verifier — must NOT have independentOf
  const ship = wf.stages.find((s) => (s.id || s.stage) === 'ship');
  assert.ok(!('independentOf' in ship), `ship must not carry independentOf (steward is not verifier); got: ${JSON.stringify(ship)}`);
});

test('validateWorkflowsGraph: rejects a workflow containing a cycle', () => {
  const reg = {
    workflows: [{
      id: 'wf-cycle', name: 'c', description: 'd', trigger: 't',
      feedbackGate: { type: 'deterministic', loop: 'red-green-refactor' },
      stages: [
        { id: 'a', role: 'architect', produces: ['a.md'], dependsOn: ['c'] },
        { id: 'b', role: 'worker', consumes: ['a.md'], produces: ['b.diff'], dependsOn: ['a'] },
        { id: 'c', role: 'worker', consumes: ['b.diff'], produces: ['c.md'], dependsOn: ['b'] },
      ],
    }],
  };
  const v = validateWorkflowsGraph(reg);
  assert.equal(v.ok, false, 'expected graph invalid (cycle)');
  assert.ok(v.errors.some((e) => /cycle/.test(e)), 'expected cycle error, got: ' + JSON.stringify(v.errors));
});

test('validateWorkflowsGraph: rejects an unknown dependsOn target', () => {
  const reg = {
    workflows: [{
      id: 'wf-unknown-dep', name: 'u', description: 'd', trigger: 't',
      feedbackGate: { type: 'deterministic', loop: 'red-green-refactor' },
      stages: [
        { id: 'plan', role: 'architect', produces: ['plan.md'] },
        { id: 'build', role: 'worker', consumes: ['plan.md'], produces: ['impl.diff'], dependsOn: ['phantom-stage'] },
      ],
    }],
  };
  const v = validateWorkflowsGraph(reg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /dependsOn unknown stage: phantom-stage/.test(e)), 'expected unknown-dep error, got: ' + JSON.stringify(v.errors));
});

test('validateWorkflowsGraph: accepts the canonical migrated standard-production-pipeline', () => {
  const reg = loadWorkflows();
  const v = validateWorkflowsGraph(reg);
  assert.equal(v.ok, true, `expected graph valid, errors: ${JSON.stringify(v.errors)}`);
  assert.equal(v.workflowCount, 1);
});

