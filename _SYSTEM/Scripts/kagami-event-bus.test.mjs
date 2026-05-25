import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  appendKagamiEvent,
  appendRouteDecisionEvent,
  getKagamiEventBusHealth,
  kagamiEventFile,
  kagamiSessionIndexFile,
  readKagamiEvents,
  resolveKagamiEventRoot,
} from './kagami-event-bus.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'kagami-events-'));
}

test('Kagami event bus appends and reads canonical JSONL events', () => {
  const root = tempRoot();
  const event = appendKagamiEvent('INTAKE_RECORDED', {
    session: 'rick-test',
    lane: 'gpt-5.5',
    input: 'build the control plane',
  }, { root });

  assert.equal(event.kind, 'INTAKE_RECORDED');
  assert.equal(event.session, 'rick-test');
  assert.equal(event.lane, 'gpt-5.5');
  assert.equal(event.signedBy, 'kagami');

  const rows = readKagamiEvents({ root });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, event.id);
  assert.match(readFileSync(kagamiEventFile(root), 'utf8'), /INTAKE_RECORDED/);

  const sessions = JSON.parse(readFileSync(kagamiSessionIndexFile(root), 'utf8'));
  assert.equal(sessions.sessions['rick-test'].eventCount, 1);
  assert.equal(sessions.sessions['rick-test'].lastKind, 'INTAKE_RECORDED');
});

test('Kagami event bus rejects unknown event kinds', () => {
  const root = tempRoot();

  assert.throws(
    () => appendKagamiEvent('NOT_A_REAL_EVENT', {}, { root }),
    /Unknown Kagami event kind/,
  );
});

test('Kagami event bus rejects protected roots', () => {
  assert.throws(
    () => resolveKagamiEventRoot('.claude/state/kagami-control'),
    /protected/,
  );
  assert.throws(
    () => resolveKagamiEventRoot('backend/data/kagami-control'),
    /protected/,
  );
});

test('Kagami event bus rejects protected evidence refs', () => {
  const root = tempRoot();
  assert.throws(
    () => appendKagamiEvent('EVIDENCE_GATE_PASSED', {
      evidenceRefs: ['.claude/state/pulse-bus.jsonl'],
    }, { root }),
    /evidence ref cannot be protected/,
  );
});

test('route decisions become first-class Kagami events', () => {
  const root = tempRoot();
  const event = appendRouteDecisionEvent({
    class: 'architecture',
    lane: 'gpt-5.5',
    mode: 'auto',
    reason: 'system architecture or cross-domain work',
    blocked: false,
  }, {
    session: 'rick-test',
    source: 'route-dry-run',
  }, { root });

  assert.equal(event.kind, 'ROUTE_DECISION_RECORDED');
  assert.equal(event.lane, 'gpt-5.5');
  assert.equal(event.payload.routeClass, 'architecture');
  assert.equal(event.payload.source, 'route-dry-run');
});

test('readKagamiEvents supports tail limits', () => {
  const root = tempRoot();
  appendKagamiEvent('INTAKE_RECORDED', { n: 1 }, { root });
  appendKagamiEvent('GOAL_BOUND', { n: 2 }, { root });

  const rows = readKagamiEvents({ root, limit: 1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'GOAL_BOUND');
});

test('Kagami event bus health summarizes events and sessions', () => {
  const root = tempRoot();
  appendKagamiEvent('GOAL_BOUND', { session: 'main-session', goalId: 'goal-test' }, { root });
  const health = getKagamiEventBusHealth({ root });

  assert.equal(health.ok, true);
  assert.equal(health.eventCount, 1);
  assert.equal(health.sessionCount, 1);
  assert.equal(health.lastEvent.kind, 'GOAL_BOUND');
});
