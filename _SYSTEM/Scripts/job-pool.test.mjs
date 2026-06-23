// Job pool + autonomous-company gating — red/grey/green. The safety-critical surface is jobDecision (owner-floor
// + risk→owner-gate) and the DISARMED-by-default runner: an autonomous company must NEVER auto-run an
// owner/blender/arm/high-blast job, and must do nothing while disarmed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openLedger } from './work-ledger.mjs';
import { ensureJobsSchema, addJob, listJobs, rankJobs, completeJob, recommendJob, jobStats, seedPool, JOB_TYPES, PRIORITY } from './job-pool.mjs';
import { jobDecision, isHalted } from './nexus-company.mjs';
import { CLASS } from '../mure/governance.mjs';

const TMP = path.join(os.tmpdir(), `jobpool-test-${process.pid}.db`);
const db = openLedger(TMP);
ensureJobsSchema(db);
after(() => { try { db.close(); for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP + s, { force: true }); } catch { /* */ } });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: addJob + listJobs round-trip', () => {
  const id = addJob(db, { title: 'green test job', type: 'gap', priority: 'high', value: 0.8, risk: 0.3 });
  const j = listJobs(db, {}).find((x) => x.id === id);
  assert.ok(j); assert.equal(j.type, 'gap'); assert.equal(j.priority, 'high'); assert.equal(j.state, 'open');
});

test('GREEN: rankJobs ranks open jobs by mass desc, returns mass+terms', () => {
  const r = rankJobs(db);
  assert.ok(r.length >= 1);
  for (let i = 1; i < r.length; i += 1) assert.ok(r[i - 1].mass >= r[i].mass, 'descending mass');
  assert.ok(Number.isFinite(r[0].mass));
});

test('GREEN: completeJob sets done + report; recommendJob sets recommended', () => {
  const id = addJob(db, { title: 'to complete', type: 'maintenance' });
  const done = completeJob(db, id, 'built X, verified Y');
  assert.equal(done.state, 'done'); assert.match(done.report, /built X/); assert.ok(done.completedAt);
  const rid = recommendJob(db, { title: 'a recommendation', type: 'improvement' });
  assert.equal(listJobs(db, {}).find((x) => x.id === rid).state, 'recommended');
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: invalid type/priority fall back to safe defaults', () => {
  const id = addJob(db, { title: 'bad fields', type: 'nonsense', priority: 'ultra' });
  const j = listJobs(db, {}).find((x) => x.id === id);
  assert.ok(JOB_TYPES.includes(j.type)); assert.equal(j.type, 'improvement');
  assert.ok(PRIORITY[j.priority] != null); assert.equal(j.priority, 'medium');
});

test('RED (safety): jobDecision OWNER-GATES blender / owner-source / arm / critical / high-risk', () => {
  assert.equal(jobDecision({ id: 'b', title: 'x', type: 'blender', risk: 0.2 }).class, CLASS.OWNER);
  assert.equal(jobDecision({ id: 'o', title: 'x', type: 'gap', source: 'owner', risk: 0.2 }).class, CLASS.OWNER);
  assert.equal(jobDecision({ id: 'a', title: 'x', type: 'arm', risk: 0.2 }).class, CLASS.OWNER);
  assert.equal(jobDecision({ id: 'c', title: 'x', type: 'gap', priority: 'critical', risk: 0.2 }).class, CLASS.OWNER);
  assert.equal(jobDecision({ id: 'h', title: 'x', type: 'gap', risk: 0.8 }).class, CLASS.OWNER); // high-blast
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (safety): a low-risk non-owner job is self-governable (auto-runnable when armed)', () => {
  assert.equal(jobDecision({ id: 's', title: 'x', type: 'gap', source: 'organ', risk: 0.2, priority: 'medium' }).class, CLASS.SELF);
});

test('GREY (owner-floor dominates score): a blender job stays owner-gated regardless of low risk/high value', () => {
  const d = jobDecision({ id: 'bf', title: 'x', type: 'blender', source: 'owner', risk: 0.1, value: 1, priority: 'high' });
  assert.equal(d.class, CLASS.OWNER); assert.equal(d.ownerFloor, true);
});

test('GREY (priority boost): same value/risk, higher priority ranks higher', () => {
  const lo = addJob(db, { title: 'prio-lo', type: 'improvement', priority: 'low', value: 0.5, risk: 0.4 });
  const hi = addJob(db, { title: 'prio-hi', type: 'improvement', priority: 'critical', value: 0.5, risk: 0.4 });
  const r = rankJobs(db);
  const iHi = r.findIndex((x) => x.id === hi), iLo = r.findIndex((x) => x.id === lo);
  assert.ok(iHi >= 0 && iLo >= 0 && iHi < iLo, 'critical outranks low');
});

test('GREY (idempotent seed): re-seeding the same jobs does not duplicate', () => {
  const seed = [{ title: 'idem-job', type: 'infra' }, { title: 'idem-job-2', type: 'infra' }];
  seedPool(db, seed); const a = listJobs(db, {}).length;
  seedPool(db, seed); const b = listJobs(db, {}).length;
  assert.equal(a, b, 'no new rows on re-seed');
});

test('GREY (determinism): rankJobs twice yields identical order', () => {
  const a = rankJobs(db).map((j) => j.id), b = rankJobs(db).map((j) => j.id);
  assert.deepEqual(a, b);
});

test('GREY: isHalted reflects the kill-switch flag honestly (boolean)', () => {
  assert.equal(typeof isHalted(), 'boolean');
});
