#!/usr/bin/env node
// Hermetic tests for the work-ledger dashboard contract (P0 of the MURE master plan,
// .claude/plans/mure-master-plan-2026-07-02.md) + the live-run ingest (P2 ingest seam).
// In-memory DB + tmp jobs dir — no repo state touched, no model calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openLedger, ingestActiveRuns,
  getRunDetail, getArtifactsByRole, getThroughputTrend, getConvergenceTrend, getRoleProductivityTrends,
} from './work-ledger.mjs';

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString();

function seededDb() {
  const db = openLedger(':memory:');
  const run = db.prepare(`INSERT INTO runs (id,kind,summary,status,started,finished,rounds,leaf_count,converged,finalize_ok,roles,session,ingested_at)
    VALUES (@id,'swarm',@summary,@status,@started,@finished,1,2,@converged,0,@roles,NULL,@started)`);
  run.run({ id: 'run-a', summary: 'first', status: 'converged', started: day(3), finished: day(3), converged: 1, roles: '["engineer","scout"]' });
  run.run({ id: 'run-b', summary: 'second', status: 'failed', started: day(2), finished: day(2), converged: 0, roles: '["engineer"]' });
  run.run({ id: 'run-c', summary: 'third', status: 'converged', started: day(1), finished: day(1), converged: 1, roles: '["adjudicator"]' });
  const art = db.prepare(`INSERT INTO artifacts (id,kind,title,path,run,role,created,tags,status,bytes,ingested_at)
    VALUES (@id,'doc',@title,@path,@run,@role,@created,'[]','active',10,@created)`);
  art.run({ id: 'a1', title: 'one.md', path: 'x/one.md', run: 'run-a', role: 'engineer', created: day(3) });
  art.run({ id: 'a2', title: 'two.md', path: 'x/two.md', run: 'run-a', role: 'scout', created: day(1) });
  art.run({ id: 'a3', title: 'three.md', path: 'x/three.md', run: 'run-c', role: 'engineer', created: day(1) });
  db.prepare(`INSERT INTO role_outputs (run_id,role,label,status,chars) VALUES ('run-a','engineer','08CW_X_PASS_COMMITTED','ok',120)`).run();
  return db;
}

test('getRunDetail returns the drawer contract {run, roleOutputs, artifacts}', () => {
  const db = seededDb();
  const d = getRunDetail(db, 'run-a');
  assert.equal(d.run.id, 'run-a');
  assert.equal(d.run.leafCount, 2);
  assert.equal(d.run.converged, true);
  assert.deepEqual(d.run.roles, ['engineer', 'scout']);
  assert.equal(d.roleOutputs.length, 1);
  assert.equal(d.roleOutputs[0].label, '08CW_X_PASS_COMMITTED');
  assert.equal(d.artifacts.length, 2);
  assert.ok(Array.isArray(d.spawns));
  assert.equal(getRunDetail(db, 'nope'), null);
});

test('getArtifactsByRole filters by role and run, newest first', () => {
  const db = seededDb();
  const eng = getArtifactsByRole(db, { roleId: 'engineer' });
  assert.equal(eng.length, 2);
  assert.equal(eng[0].id, 'a3'); // newest first
  const runScoped = getArtifactsByRole(db, { roleId: 'engineer', runId: 'run-a' });
  assert.equal(runScoped.length, 1);
  assert.equal(getArtifactsByRole(db, { limit: 1 }).length, 1);
});

test('getThroughputTrend returns a dense daily window with counts + smoothed avg', () => {
  const db = seededDb();
  const t = getThroughputTrend(db, 5, 2);
  assert.equal(t.length, 5);
  const total = t.reduce((s, x) => s + x.count, 0);
  assert.equal(total, 3);
  for (const p of t) { assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(typeof p.avg, 'number'); }
});

test('getConvergenceTrend returns oldest→newest cumulative runningRate', () => {
  const db = seededDb();
  const c = getConvergenceTrend(db, 60);
  assert.equal(c.length, 3);
  assert.equal(c[0].id, 'run-a');
  assert.equal(c[0].runningRate, 1);       // 1/1
  assert.equal(c[1].runningRate, 0.5);     // 1/2
  assert.equal(c[2].runningRate, +(2 / 3).toFixed(3));
});

test('getRoleProductivityTrends aggregates per-role daily counts, sorted by total', () => {
  const db = seededDb();
  const p = getRoleProductivityTrends(db, 10);
  assert.equal(p[0].role, 'engineer');
  assert.equal(p[0].total, 2);
  assert.ok(p[0].days.every((d) => d.count >= 1));
});

test('ingestActiveRuns: spawns.jsonl with open spawn → running; ended → done; manifest → skipped', () => {
  const db = openLedger(':memory:');
  const jobs = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-jobs-'));
  try {
    // live run: one spawn, no end
    fs.mkdirSync(path.join(jobs, 'glmf-live'));
    fs.writeFileSync(path.join(jobs, 'glmf-live', 'spawns.jsonl'),
      `${JSON.stringify({ label: 'L1', lane: 'glm-max', pid: 111, spawnedAt: day(0) })}\n`);
    // finished run: spawn + end
    fs.mkdirSync(path.join(jobs, 'glmf-done'));
    fs.writeFileSync(path.join(jobs, 'glmf-done', 'spawns.jsonl'),
      `${JSON.stringify({ label: 'L1', lane: 'glm', pid: 222, spawnedAt: day(1) })}\n${JSON.stringify({ label: 'L1', pid: 222, endedAt: day(1), exitCode: 0, status: 'ok' })}\n`);
    // manifest run: must be skipped (ingestJobs owns it)
    fs.mkdirSync(path.join(jobs, 'swarm-final'));
    fs.writeFileSync(path.join(jobs, 'swarm-final', 'manifest.json'), '{"runId":"swarm-final"}');
    fs.writeFileSync(path.join(jobs, 'swarm-final', 'spawns.jsonl'), `${JSON.stringify({ label: 'X', pid: 1, spawnedAt: day(2) })}\n`);
    // runSwarm status.json run: running with rounds
    fs.mkdirSync(path.join(jobs, 'swarm-live'));
    fs.writeFileSync(path.join(jobs, 'swarm-live', 'status.json'),
      JSON.stringify({ runId: 'swarm-live', status: 'running', round: 2, totalLeaves: 4, pending: ['a', 'b'], startedAt: day(0), updatedAt: day(0) }));

    const n = ingestActiveRuns(db, jobs);
    assert.equal(n, 3);
    const rows = Object.fromEntries(db.prepare('SELECT id,status,rounds,leaf_count FROM runs').all().map((r) => [r.id, r]));
    assert.equal(rows['glmf-live'].status, 'running');
    assert.equal(rows['glmf-done'].status, 'done');
    assert.equal(rows['swarm-live'].status, 'running');
    assert.equal(rows['swarm-live'].rounds, 2);
    assert.equal(rows['swarm-live'].leaf_count, 4);
    assert.equal(rows['swarm-final'], undefined); // manifest wins — not touched here
    // idempotent re-ingest
    assert.equal(ingestActiveRuns(db, jobs), 3);
  } finally {
    fs.rmSync(jobs, { recursive: true, force: true });
  }
});
