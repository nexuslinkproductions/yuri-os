import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createLedger,
  recordTicket,
  recordDispatch,
  recordProducerOutput,
  recordVerifierVerdict,
  accept,
  reject,
  markLost,
  reconcileLost,
  retry,
  getTicket,
  queryByStatus,
  snapshot,
  LEDGER_SCHEMA_VERSION,
} from './delegation-ledger.mjs';

const baseTicket = {
  id: 'ticket-evidence-1',
  from: 'control',
  to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'worker-a' },
  scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded evidence',
  constraints: ['read-only'],
  evidenceRequirements: ['TERM_COUNT', 'FILE_COUNT'],
  escalationRule: 'return to control on ambiguity',
  writeSet: [],
};

const fullPass = {
  evidence: { TERM_COUNT: '42', FILE_COUNT: '3' },
  summary: 'all good',
};

const passingVerdict = {
  verdict: 'pass',
  checked: ['tests', 'lint'],
};

function freshLedger() {
  return recordTicket(createLedger('test-ledger'), baseTicket);
}

// --- core lifecycle ---

test('ledger records a validated ticket and starts in ticketed', () => {
  const ledger = freshLedger();
  const entry = getTicket(ledger, 'ticket-evidence-1');
  assert.equal(entry.ledgerStatus, 'ticketed');
  assert.equal(entry.ticket.from, 'control');
  assert.equal(entry.ticket.to, 'worker');
  assert.equal(entry.retries, 0);
  assert.ok(Object.isFrozen(entry));
});

test('full happy path: ticketed → dispatched → produced → verified → accepted', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1', { producer: 'deepseek-worker' });
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'dispatched');

  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'produced');

  ledger = recordVerifierVerdict(ledger, 'ticket-evidence-1', passingVerdict);
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'verifying');

  ledger = accept(ledger, 'ticket-evidence-1', 'all evidence present');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'accepted');
  assert.ok(getTicket(ledger, 'ticket-evidence-1').acceptedAt);
});

test('accept without passing verdict is rejected', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  ledger = recordVerifierVerdict(ledger, 'ticket-evidence-1', { verdict: 'fail', failureReason: 'missing tests' });
  assert.throws(() => accept(ledger, 'ticket-evidence-1'), /passing verifier verdict/);
});

// --- evidence enforcement ---

test('producer output missing required evidence is rejected', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  assert.throws(() => recordProducerOutput(ledger, 'ticket-evidence-1', {
    evidence: { TERM_COUNT: '42' },
    summary: 'partial',
  }), /missing evidence/);
});

// --- verifier discipline ---

test('not-checked verdict requires uncheckedReason', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  assert.throws(() => recordVerifierVerdict(ledger, 'ticket-evidence-1', { verdict: 'not-checked' }), /uncheckedReason/);
});

test('fail verdict requires failureReason', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  assert.throws(() => recordVerifierVerdict(ledger, 'ticket-evidence-1', { verdict: 'fail' }), /failureReason/);
});

test('invalid verdict value is rejected', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  assert.throws(() => recordVerifierVerdict(ledger, 'ticket-evidence-1', { verdict: 'maybe' }), /pass|fail|not-checked/);
});

// --- LOST worker and reconciliation ---

test('LOST worker lifecycle: dispatched → lost → reconciled-clean → retried', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = markLost(ledger, 'ticket-evidence-1', 'worker timed out');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'lost');
  assert.ok(getTicket(ledger, 'ticket-evidence-1').lostAt);

  ledger = reconcileLost(ledger, 'ticket-evidence-1', 'reconciled-clean', 'no writes detected');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'reconciled-clean');

  ledger = retry(ledger, 'ticket-evidence-1');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'ticketed');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').retries, 1);
});

test('reconcile-dirty allows retry but does not auto-clean', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = markLost(ledger, 'ticket-evidence-1', 'crash mid-edit');
  ledger = reconcileLost(ledger, 'ticket-evidence-1', 'reconciled-dirty', 'uncommitted changes remain');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'reconciled-dirty');
  ledger = retry(ledger, 'ticket-evidence-1');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'ticketed');
});

test('cannot retry without reconciliation', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = markLost(ledger, 'ticket-evidence-1', 'timeout');
  assert.throws(() => retry(ledger, 'ticket-evidence-1'), /reconciled status/);
});

test('cannot reconcile a non-lost ticket', () => {
  let ledger = freshLedger();
  assert.throws(() => reconcileLost(ledger, 'ticket-evidence-1', 'reconciled-clean'), /status lost/);
});

// --- terminal safety ---

test('terminal states never reopen', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  ledger = recordProducerOutput(ledger, 'ticket-evidence-1', fullPass);
  ledger = recordVerifierVerdict(ledger, 'ticket-evidence-1', passingVerdict);
  ledger = accept(ledger, 'ticket-evidence-1');
  assert.throws(() => recordDispatch(ledger, 'ticket-evidence-1'), /dispatch requires ledger status ticketed/);
});

test('reject is terminal', () => {
  let ledger = freshLedger();
  ledger = reject(ledger, 'ticket-evidence-1', 'bad scope');
  assert.equal(getTicket(ledger, 'ticket-evidence-1').ledgerStatus, 'rejected');
  assert.throws(() => recordDispatch(ledger, 'ticket-evidence-1'), /dispatch requires ledger status ticketed/);
});

// --- provider neutrality ---

test('dispatch metadata does not leak provider/model/route info', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1', {
    producer: 'worker-a',
    note: 'dispatched',
    model: 'openai/gpt-5.6-terra',  // should be ignored, not stored
    provider: 'openai',
  });
  const entry = getTicket(ledger, 'ticket-evidence-1');
  assert.equal(entry.dispatch.producer, 'worker-a');
  assert.equal(entry.dispatch.note, 'dispatched');
  // dispatch only stores producer and note — model/provider are not captured
  assert.deepEqual(Object.keys(entry.dispatch).sort(), ['dispatchedAt', 'note', 'producer']);
});

// --- query and snapshot ---

test('queryByStatus returns matching tickets', () => {
  let ledger = freshLedger();
  ledger = recordTicket(ledger, { ...baseTicket, id: 'ticket-2' });
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  const ticketed = queryByStatus(ledger, 'ticketed');
  const dispatched = queryByStatus(ledger, 'dispatched');
  assert.equal(ticketed.length, 1);
  assert.equal(ticketed[0].ticketId, 'ticket-2');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].ticketId, 'ticket-evidence-1');
});

test('snapshot reports status distribution', () => {
  let ledger = freshLedger();
  ledger = recordDispatch(ledger, 'ticket-evidence-1');
  const snap = snapshot(ledger);
  assert.equal(snap.schemaVersion, LEDGER_SCHEMA_VERSION);
  assert.equal(snap.totalTickets, 1);
  assert.equal(snap.statuses.dispatched, 1);
  assert.equal(snap.statuses.ticketed, undefined);
});

// --- immutability ---

test('ledger entries are deeply frozen', () => {
  const ledger = freshLedger();
  const entry = getTicket(ledger, 'ticket-evidence-1');
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.ticket));
});

// --- shadow-only invariant ---

test('live planner, router, and reducer do not import the delegation ledger', async () => {
  const [planner, router, reducer] = await Promise.all([
    readFile(new URL('./sol-moe-company.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./sol-moe-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./sol-moe-native-dispatch.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(planner.includes('delegation-ledger'), false);
  assert.equal(router.includes('delegation-ledger'), false);
  assert.equal(reducer.includes('delegation-ledger'), false);
});
