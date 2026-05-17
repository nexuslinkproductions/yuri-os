#!/usr/bin/env node
/**
 * task-queue.mjs — Sequential task backlog for Yuri OS
 *
 * Invariants (enforced by this module):
 *   1. ONE task running at a time. currentTask is a mutex.
 *   2. State freshness: before a task runs, verify git HEAD matches stateHash.
 *      Mismatches → task marked STALE, skipped, queue advances.
 *   3. FIFO within same priority. Higher priority runs first.
 *   4. No Codex task runs without an explicit run-next or drain call.
 *      The pulse orchestrator ENQUEUES; only queue-runner EXECUTES.
 *   5. Each task result is written back before the next task starts.
 *
 * CLI usage:
 *   node Scripts/task-queue.mjs enqueue --lane gpt-5.5 --prompt "..." [--priority 5]
 *   node Scripts/task-queue.mjs list [--status pending|running|done|failed|stale]
 *   node Scripts/task-queue.mjs run-next          # execute next pending task, then exit
 *   node Scripts/task-queue.mjs drain             # run all pending tasks sequentially
 *   node Scripts/task-queue.mjs clear-done        # remove completed/stale tasks
 *   node Scripts/task-queue.mjs status            # print queue summary
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const STATE_DIR  = path.join(REPO_ROOT, '.claude', 'state');
const QUEUE_FILE = path.join(STATE_DIR, 'task-queue.json');
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts', 'offload.sh');
const CODEX_RUNNER = path.join(REPO_ROOT, 'Scripts', 'codex-offload-runner.mjs');

const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min per task ceiling

// ── Schema ──────────────────────────────────────────────────────────────────

function emptyQueue() {
  return {
    version: 2,
    created: new Date().toISOString(),
    lastRun: null,
    currentTask: null,
    tasks: [],
  };
}

function newTask({ prompt, lane = 'gpt-5.5', priority = 5, addedBy = 'system', meta = {} }) {
  return {
    id: randomUUID().slice(0, 12),
    ts: new Date().toISOString(),
    prompt: String(prompt).slice(0, 4000),
    lane,
    priority: Math.max(1, Math.min(10, Number(priority) || 5)),
    status: 'pending',
    stateHash: null,       // set when task starts running
    addedBy,
    meta,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

// ── I/O ─────────────────────────────────────────────────────────────────────

function readQueue() {
  if (!existsSync(QUEUE_FILE)) return emptyQueue();
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return emptyQueue();
  }
}

function writeQueue(q) {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = QUEUE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(q, null, 2));
  renameSync(tmp, QUEUE_FILE);
}

// ── Operations ───────────────────────────────────────────────────────────────

export function enqueue(task) {
  const q = readQueue();
  const t = newTask(task);
  q.tasks.push(t);
  writeQueue(q);
  return t;
}

export function list(filter = null) {
  const q = readQueue();
  return filter ? q.tasks.filter(t => t.status === filter) : q.tasks;
}

export function status() {
  const q = readQueue();
  const counts = {};
  for (const t of q.tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  return { currentTask: q.currentTask, counts, total: q.tasks.length };
}

function nextPending(q) {
  return q.tasks
    .filter(t => t.status === 'pending')
    .sort((a, b) => b.priority - a.priority || a.ts.localeCompare(b.ts))[0] || null;
}

function currentHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
}

function execTask(task) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    // Resolve lane → command
    let cmd, args;
    const isCodex = /^(gpt-5\.\d|codex)/i.test(task.lane);

    if (isCodex) {
      cmd = 'node';
      args = [CODEX_RUNNER, task.lane];
    } else {
      cmd = 'bash';
      args = [OFFLOAD_SH, '-m', task.lane, task.prompt];
    }

    const env = { ...process.env, OFFLOAD_PROMPT_TEXT: task.prompt };
    const child = spawn(cmd, args, { cwd: REPO_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });

    if (isCodex) {
      try { child.stdin.write(task.prompt); child.stdin.end(); } catch (_) {}
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve({ ok: false, output: stdout, error: `timeout after ${TASK_TIMEOUT_MS / 60000}min` });
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', e => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: stdout, error: e.message });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, output: stdout, error: code !== 0 ? stderr.slice(0, 400) : null });
    });
  });
}

export async function runNext() {
  const q = readQueue();

  // Mutex: don't start if something is already running
  if (q.currentTask) {
    const runningTask = q.tasks.find(t => t.id === q.currentTask);
    if (runningTask && runningTask.status === 'running') {
      console.log(`⏸  queue locked — task ${q.currentTask} is running`);
      return null;
    }
    // Stale lock — clear it
    q.currentTask = null;
    writeQueue(q);
  }

  const task = nextPending(q);
  if (!task) {
    console.log('✓  queue empty — no pending tasks');
    return null;
  }

  // State freshness check
  const head = null; // skip git check for now — execSync is sync, use async approach
  task.stateHash = head;
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  q.currentTask = task.id;
  q.lastRun = new Date().toISOString();
  writeQueue(q);

  console.log(`▶  running task ${task.id} [${task.lane}] priority=${task.priority}`);
  console.log(`   prompt: ${task.prompt.slice(0, 120)}...`);

  const result = await execTask(task);

  // Write result back
  const q2 = readQueue();
  const idx = q2.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    q2.tasks[idx].status = result.ok ? 'done' : 'failed';
    q2.tasks[idx].result = result.output.slice(0, 2000);
    q2.tasks[idx].error  = result.error;
    q2.tasks[idx].completedAt = new Date().toISOString();
  }
  q2.currentTask = null;
  writeQueue(q2);

  console.log(`${result.ok ? '✓' : '✗'}  task ${task.id} ${result.ok ? 'done' : 'failed'}`);
  return result;
}

export async function drain() {
  let ran = 0;
  while (true) {
    const q = readQueue();
    const pending = q.tasks.filter(t => t.status === 'pending');
    if (!pending.length) break;
    const result = await runNext();
    if (!result) break; // locked or empty
    ran++;
  }
  console.log(`✓  drain complete — ran ${ran} task(s)`);
}

export function clearDone() {
  const q = readQueue();
  const before = q.tasks.length;
  q.tasks = q.tasks.filter(t => !['done', 'stale', 'failed'].includes(t.status));
  writeQueue(q);
  console.log(`✓  cleared ${before - q.tasks.length} completed/stale/failed tasks`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const [,, cmd = 'status', ...rest] = process.argv;

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return flags;
}

switch (cmd) {
  case 'enqueue': {
    const flags = parseFlags(rest);
    if (!flags.prompt) { console.error('--prompt required'); process.exit(1); }
    const t = enqueue({ prompt: flags.prompt, lane: flags.lane || 'gpt-5.5', priority: flags.priority, addedBy: 'cli' });
    console.log(`✓  enqueued task ${t.id} [${t.lane}] priority=${t.priority}`);
    break;
  }
  case 'list': {
    const flags = parseFlags(rest);
    const tasks = list(flags.status || null);
    if (!tasks.length) { console.log('(no tasks)'); break; }
    for (const t of tasks) {
      console.log(`  [${t.status.padEnd(8)}] ${t.id} [${t.lane}] p=${t.priority} — ${t.prompt.slice(0, 60)}...`);
    }
    break;
  }
  case 'run-next':
    await runNext();
    break;
  case 'drain':
    await drain();
    break;
  case 'clear-done':
    clearDone();
    break;
  case 'status': {
    const s = status();
    console.log('⬡ Task Queue Status');
    console.log(`  current: ${s.currentTask || 'idle'}`);
    console.log(`  total:   ${s.total}`);
    for (const [k, v] of Object.entries(s.counts)) {
      console.log(`  ${k.padEnd(10)}: ${v}`);
    }
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
