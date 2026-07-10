import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  validateDispatchGovernance,
  deriveArchetypeForAgent,
  GOVERNANCE_SCHEMA_VERSION,
} from './dispatch-governance.mjs';

test('governance allows control to delegate to a worker', () => {
  const result = validateDispatchGovernance({
    purpose: 'delegation',
    fromArchetype: 'control',
    toArchetype: 'worker',
    agentId: 'engineer',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('governance allows control to delegate to a verifier', () => {
  const result = validateDispatchGovernance({
    purpose: 'delegation',
    fromArchetype: 'control',
    toArchetype: 'verifier',
    agentId: 'calibrator',
  });
  assert.equal(result.ok, true);
});

test('governance forbids worker from issuing delegation tickets', () => {
  const result = validateDispatchGovernance({
    purpose: 'delegation',
    fromArchetype: 'worker',
    toArchetype: 'worker',
    agentId: 'scout',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('may not issue delegation tickets')));
});

test('governance forbids architect from executing producer work', () => {
  const result = validateDispatchGovernance({
    purpose: 'producer',
    fromArchetype: 'control',
    toArchetype: 'architect',
    agentId: 'architect',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('may not execute producer work')));
});

test('governance enforces verifier-producer independence', () => {
  const result = validateDispatchGovernance({
    purpose: 'verifier',
    fromArchetype: 'control',
    toArchetype: 'verifier',
    agentId: 'calibrator',
    producerArchetype: 'worker',
    producerAgentId: 'calibrator',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('verifier agent must differ')));
});

test('governance rejects same archetype self-verification', () => {
  const result = validateDispatchGovernance({
    purpose: 'verifier',
    fromArchetype: 'control',
    toArchetype: 'worker',
    agentId: 'engineer',
    producerArchetype: 'worker',
    producerAgentId: 'engineer',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('verifier agent must differ')));
});

test('governance allows delegated orchestrator to issue producer tickets', () => {
  const result = validateDispatchGovernance({
    purpose: 'producer',
    fromArchetype: 'delegated-orchestrator',
    toArchetype: 'worker',
    agentId: 'engineer',
  });
  assert.equal(result.ok, true);
});

test('governance rejects unknown agent for a known archetype', () => {
  const result = validateDispatchGovernance({
    purpose: 'producer',
    fromArchetype: 'control',
    toArchetype: 'worker',
    agentId: 'unknown-agent',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('not a recognized')));
});

test('governance rejects strategic-peer issuing quality escalation', () => {
  const result = validateDispatchGovernance({
    purpose: 'quality-escalation',
    fromArchetype: 'strategic-peer',
    toArchetype: 'worker',
    agentId: 'engineer',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('may not issue quality escalation')));
});

test('deriveArchetypeForAgent maps known agents', () => {
  assert.equal(deriveArchetypeForAgent('engineer'), 'worker');
  assert.equal(deriveArchetypeForAgent('calibrator'), 'verifier');
  assert.equal(deriveArchetypeForAgent('architect'), 'architect');
  assert.equal(deriveArchetypeForAgent('advisor'), 'strategic-peer');
  assert.equal(deriveArchetypeForAgent('helmsman'), 'delegated-orchestrator');
  assert.equal(deriveArchetypeForAgent('unknown'), null);
});

test('governance module is not imported by any live routing code', async () => {
  const files = [
    new URL('./sol-moe-company.mjs', import.meta.url),
    new URL('./sol-moe-router.mjs', import.meta.url),
    new URL('./sol-moe-native-dispatch.mjs', import.meta.url),
    new URL('./sol-moe-run.mjs', import.meta.url),
  ];
  for (const url of files) {
    const source = await readFile(url, 'utf8');
    assert.equal(source.includes('dispatch-governance'), false, `${url.href} must not import dispatch-governance`);
  }
});
