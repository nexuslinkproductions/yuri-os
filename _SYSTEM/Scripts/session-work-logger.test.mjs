// session-work-logger — red/grey/green. Isolated in-memory DB (never touches the real work-ledger.db).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureJobsSchema, addJob, listJobs } from './job-pool.mjs';
import { syncCommits, closeJob, logCompleted, inferType, OPERATOR_SOURCE } from './session-work-logger.mjs';

const freshDb = () => { const db = new Database(':memory:'); ensureJobsSchema(db); return db; };

// ── GREEN ─────────────────────────────────────────────────────────────────────
test('GREEN: inferType maps conventional-commit prefixes (unknown → improvement)', () => {
  assert.equal(inferType('feat(blender): x'), 'improvement');
  assert.equal(inferType('fix: x'), 'maintenance');
  assert.equal(inferType('research(blender): x'), 'research');
  assert.equal(inferType('build(deps): x'), 'infra');
  assert.equal(inferType('totally freeform subject'), 'improvement');
});

test('GREEN: logCompleted inserts a DONE operator-lane job', () => {
  const db = freshDb();
  const r = logCompleted(db, { title: 'did a thing', type: 'infra', report: 'done', evidence: ['abc'] });
  assert.equal(r.closed, false);
  const j = listJobs(db, { state: 'done' }).find((x) => x.id === r.id);
  assert.ok(j); assert.equal(j.state, 'done'); assert.equal(j.source, OPERATOR_SOURCE);
});

test('GREEN: logCompleted CLOSES a matching OPEN job instead of duplicating', () => {
  const db = freshDb();
  const openId = addJob(db, { title: 'shared task', state: 'open' });
  const before = listJobs(db, {}).length;
  const r = logCompleted(db, { title: 'shared task', report: 'finished by hand' });
  assert.equal(r.closed, true); assert.equal(r.id, openId);
  assert.equal(listJobs(db, {}).length, before, 'no duplicate row created');
  assert.equal(listJobs(db, { state: 'done' }).find((x) => x.id === openId).state, 'done');
});

test('GREEN: closeJob by exact id and by title regex', () => {
  const db = freshDb();
  const id = addJob(db, { title: 'Research foo bar', state: 'open' });
  assert.equal(closeJob(db, id, 'r').ok, true);
  const id2 = addJob(db, { title: 'Build the baz widget', state: 'open' });
  const byMatch = closeJob(db, 'build the baz', 'r');
  assert.equal(byMatch.ok, true); assert.equal(byMatch.id, id2);
});

// ── RED ───────────────────────────────────────────────────────────────────────
test('RED: closeJob no match → ok:false; logCompleted with no title throws', () => {
  const db = freshDb();
  assert.equal(closeJob(db, 'nonexistent-xyz-123', '').ok, false);
  assert.throws(() => logCompleted(db, {}));
});

// ── GREY ──────────────────────────────────────────────────────────────────────
test('GREY: syncCommits is idempotent — 2nd run logs 0, skips what the 1st logged', () => {
  const db = freshDb();
  const r1 = syncCommits(db, { limit: 5 });
  assert.ok(r1.logged >= 1, 'logs recent real commits');
  const r2 = syncCommits(db, { limit: 5 });
  assert.equal(r2.logged, 0, 'no re-log on second run');
  assert.equal(r2.skipped, r1.logged, 'second run skips exactly what the first logged');
  const j = listJobs(db, { state: 'done' }).find((x) => x.id.startsWith('commit-'));
  assert.ok(j && j.source === OPERATOR_SOURCE && Array.isArray(j.evidence) && j.evidence.length === 1, 'done + operator-lane + one-sha evidence');
});
