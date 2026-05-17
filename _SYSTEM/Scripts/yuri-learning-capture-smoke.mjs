#!/usr/bin/env node

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(REPO_ROOT, 'backend', 'package.json'));
const Database = backendRequire('better-sqlite3');
const workDir = mkdtempSync(path.join(tmpdir(), 'yuri-learning-'));
const dbPath = path.join(workDir, 'learning.db');
const cli = path.join(REPO_ROOT, 'Scripts/yuri-learning-capture.mjs');

try {
  const summary = run('summary');
  assert.strictEqual(summary.totalSessions, 0);

  const startPayload = {
    sessionId: 'cli-smoke-1',
    command: 'cli-smoke',
    commandType: 'test',
    topicTags: ['cli'],
    goal: 'Smoke test learning bridge',
  };
  assert.strictEqual(run('start', startPayload).ok, true);

  const finalizePayload = {
    sessionId: 'cli-smoke-1',
    outcome: 'stable',
    autoScore: 82,
    whatGotBetter: 'CLI bridge records durable learning candidates.',
    notes: 'CLI bridge records durable learning candidates.',
  };
  assert.strictEqual(run('finalize', finalizePayload).ok, true);
  assert.strictEqual(run('review-session', { sessionId: 'cli-smoke-1', humanScore: 5, notes: 'approved' }).ok, true);

  const db = new Database(dbPath);
  const candidate = db.prepare("SELECT id FROM session_lesson_candidates WHERE status = 'pending' LIMIT 1").get();
  assert(candidate?.id);
  db.close();

  assert.strictEqual(run('review-lesson', { candidateId: candidate.id, action: 'reject', notes: 'smoke reject' }).ok, true);

  const after = run('summary');
  assert.strictEqual(after.totalSessions, 1);
  assert(after.pendingReviewSessions >= 0);
  process.stdout.write('learning-capture-smoke: pass\n');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

function run(command, payload) {
  const args = [cli, command, '--db', dbPath];
  if (payload) args.push('--json', JSON.stringify(payload));
  const raw = execFileSync('node', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(raw);
}
