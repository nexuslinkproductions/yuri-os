import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ARCHETYPES,
  createDelegationTicket,
  createRunLifecycle,
  getArchetypeContract,
  transitionRunLifecycle,
} from './archetype-contract.mjs';

const baseTicket = {
  id: 'ticket-1',
  from: 'control',
  to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'worker-a' },
  scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded evidence',
  constraints: ['read-only'],
  evidenceRequirements: ['TERM_COUNT evidence'],
  escalationRule: 'return to control on ambiguity',
  writeSet: [],
};

test('contract exposes exactly the six provider-neutral archetypes', () => {
  assert.deepEqual(ARCHETYPES, ['control', 'architect', 'strategic-peer', 'delegated-orchestrator', 'worker', 'verifier']);
  assert.equal(getArchetypeContract('worker').mayExecuteWork, true);
  assert.equal(getArchetypeContract('control').mayIssueTickets, true);
  assert.throws(() => getArchetypeContract('advisor'), /unknown archetype/);
});

test('ticket is strict, provider-neutral, and immutable', () => {
  const ticket = createDelegationTicket(baseTicket);
  assert.equal(ticket.schemaVersion, 'mure-archetype-ticket-v1');
  assert.ok(Object.isFrozen(ticket));
  assert.throws(() => { ticket.id = 'mutated'; }, TypeError);
  for (const [field, value] of Object.entries({
    model: 'openai/gpt-5.6-terra', provider: 'openai', agentId: 'mure-engineer',
    route: 'worker', spawn: true, execution: 'native', runtime: 'subagent',
  })) {
    assert.throws(() => createDelegationTicket({ ...baseTicket, [field]: value }), /routing field/);
  }
});

test('ticket rejects missing fields, illegal delegates, and self-verification', () => {
  assert.throws(() => createDelegationTicket({ ...baseTicket, scope: [] }), /scope/);
  assert.throws(() => createDelegationTicket({ ...baseTicket, actors: { issuer: 'sol-parent' } }), /assignee/);
  assert.throws(() => createDelegationTicket({ ...baseTicket, from: 'worker' }), /may not issue/);
  assert.throws(() => createDelegationTicket({ ...baseTicket, to: 'control' }), /may not be assigned/);
  assert.throws(() => createDelegationTicket({
    ...baseTicket,
    to: 'verifier',
    actors: { issuer: 'sol-parent', assignee: 'reviewer-a', producer: 'reviewer-a' },
  }), /may not verify itself/);
});

test('lifecycle is pure, terminal, and rejects invalid skips', () => {
  const planned = createRunLifecycle('run-1');
  const ticketed = transitionRunLifecycle(planned, 'ticketed', 'ticket created');
  const reviewed = transitionRunLifecycle(ticketed, 'in-review');
  const verified = transitionRunLifecycle(reviewed, 'verified');
  const accepted = transitionRunLifecycle(verified, 'accepted');
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.history.length, 4);
  assert.throws(() => transitionRunLifecycle(planned, 'verified'), /illegal lifecycle transition/);
  assert.throws(() => transitionRunLifecycle(accepted, 'ticketed'), /terminal lifecycle status/);
  assert.equal(JSON.stringify(accepted).includes('sessions_spawn'), false);
  assert.equal(JSON.stringify(accepted).includes('provider'), false);
  assert.equal(JSON.stringify(accepted).includes('model'), false);
});

test('live planner and reducer do not import the shadow-only contract', async () => {
  const [planner, reducer] = await Promise.all([
    readFile(new URL('./sol-moe-company.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./sol-moe-native-dispatch.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(planner.includes('archetype-contract'), false);
  assert.equal(reducer.includes('archetype-contract'), false);
});
