#!/usr/bin/env node
/**
 * worker-bridge.mjs — Cursor → warm worker terminals (no manual paste)
 *
 * Each worker terminal runs:  node _SYSTEM/Scripts/worker-bridge.mjs loop --worker <name>
 * Cursor hook / CLI enqueues jobs; loops claim and execute with fixed LANE_SESSION.
 *
 * Workers: codex | claude | deepseek
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state');
const PULSE_BUS = path.join(REPO_ROOT, '.claude', 'state', 'pulse-bus.jsonl');
const QUEUES_FILE = path.join(STATE_DIR, 'worker-queues.json');
const OFFLOAD_SH = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'offload.sh');
const CODEX_RUNNER = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'codex-offload-runner.mjs');
const AI_SH = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'ai');
const CONTRACT = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'offload-contract.mjs');

const WORKERS = {
  codex: {
    label: 'Codex',
    lane: 'gpt-5.5',
    laneSession: 'marcel-codex',
    kind: 'codex',
  },
  claude: {
    label: 'Claude Code',
    lane: 'claude',
    laneSession: 'marcel-claude',
    kind: 'claude',
  },
  deepseek: {
    label: 'DeepSeek',
    lane: 'deepseek-v4-pro',
    laneSession: 'marcel-deepseek',
    kind: 'offload',
    offloadFlags: ['--tools'],
  },
};

const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 400;

function emptyQueues() {
  const q = {};
  for (const name of Object.keys(WORKERS)) {
    q[name] = { current: null, tasks: [] };
  }
  return { version: 1, updated: new Date().toISOString(), workers: q };
}

function readQueues() {
  if (!existsSync(QUEUES_FILE)) return emptyQueues();
  try {
    const data = JSON.parse(readFileSync(QUEUES_FILE, 'utf8'));
    if (!data.workers) return emptyQueues();
    for (const name of Object.keys(WORKERS)) {
      if (!data.workers[name]) data.workers[name] = { current: null, tasks: [] };
    }
    return data;
  } catch {
    return emptyQueues();
  }
}

function writeQueues(data) {
  mkdirSync(STATE_DIR, { recursive: true });
  data.updated = new Date().toISOString();
  const tmp = `${QUEUES_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, QUEUES_FILE);
}

function newTask({ worker, prompt, lane, addedBy = 'cursor', meta = {} }) {
  const w = WORKERS[worker];
  if (!w) throw new Error(`unknown worker: ${worker}`);
  return {
    id: randomUUID().slice(0, 12),
    ts: new Date().toISOString(),
    worker,
    prompt: String(prompt).slice(0, 8000),
    lane: lane || w.lane,
    status: 'pending',
    addedBy,
    meta,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

export function enqueue({ worker, prompt, lane, addedBy, meta }) {
  const data = readQueues();
  const task = newTask({ worker, prompt, lane, addedBy, meta });
  data.workers[worker].tasks.push(task);
  writeQueues(data);
  appendPulse({ kind: 'worker-enqueue', worker, id: task.id, addedBy });
  return task;
}

function appendPulse(entry) {
  try {
    appendFileSync(PULSE_BUS, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // non-fatal if pulse-bus unavailable
  }
}

function routePlan(prompt) {
  try {
    const out = execFileSync('node', [CONTRACT, 'route-plan', prompt], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch {
    return { complexityTier: 'standard', codexPolicy: 'dry-run' };
  }
}

function buildWorkerPrompts(userPrompt, plan) {
  const tier = plan.complexityTier || 'standard';
  const codexPolicy = plan.codexPolicy || 'dry-run';
  const out = [];

  const wrap = (role, body) =>
    `[YURI worker dispatch · ${role} · tier=${tier}]\n` +
    `Source: Cursor auto-feed\n\n` +
    `${body}\n\n` +
    `---\nOriginal request:\n${userPrompt}`;

  if (tier === 'trivial') return out;

  if (plan.deepseekAdvisory?.decision?.startsWith('use') || tier !== 'trivial') {
    out.push({
      worker: 'deepseek',
      prompt: wrap(
        'DeepSeek reasoner',
        'Advisory only. Bounded output. No writes unless explicitly in scope. ' +
          'Return: findings, risks, tests_needed (max 80 lines).',
      ),
    });
  }

  if (plan.claudeAdvisory?.decision?.startsWith('use') || tier === 'critical') {
    out.push({
      worker: 'claude',
      prompt: wrap(
        'Claude control-plane review',
        'Advisory only. Review routing, risks, merge gate. ' +
          'Required sections: findings, risks, upgrade_candidates, tests_needed, reject_or_accept_reasoning.',
      ),
    });
  }

  const mutate = /\b(implement|fix|patch|refactor|build|wire|create|add|migrate|debug)\b/i.test(
    userPrompt,
  );
  // Worker terminal = impl lane; feed Codex on mutation verbs even when codexPolicy=none (manual gate is Cursor-side).
  const wantsCodex = mutate && codexPolicy !== 'none' ? true : mutate && tier !== 'trivial';

  if (wantsCodex) {
    const model = plan.codexDispatch?.model || 'gpt-5.5';
    out.push({
      worker: 'codex',
      lane: model,
      prompt: wrap(
        'Codex implementer',
        `## CODEX TASK SPEC (auto-routed)\n` +
          `Goal: ${userPrompt.slice(0, 500)}\n` +
          `Constraints: bounded diff; verify with tests; no protected paths.\n` +
          `Acceptance: passing relevant test command; git diff --stat summary.`,
      ),
    });
  }

  if (tier === 'critical' && codexPolicy === 'none') {
    // critical manual impl — advisors only
    return out.filter((j) => j.worker !== 'codex');
  }

  return out;
}

export function routeFromPrompt(userPrompt, { addedBy = 'cursor-hook' } = {}) {
  const plan = routePlan(userPrompt);
  const jobs = buildWorkerPrompts(userPrompt, plan);
  const enqueued = [];
  for (const job of jobs) {
    enqueued.push(
      enqueue({
        worker: job.worker,
        prompt: job.prompt,
        lane: job.lane,
        addedBy,
        meta: { tier: plan.complexityTier, scenario: plan.scenario },
      }),
    );
  }
  return { plan, enqueued };
}

function nextPending(workerName) {
  const data = readQueues();
  const w = data.workers[workerName];
  if (!w || w.current) return null;
  const pending = w.tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return pending[0] || null;
}

function execTask(task) {
  const spec = WORKERS[task.worker];
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const env = {
      ...process.env,
      LANE_SESSION: spec.laneSession,
      OFFLOAD_PROMPT_TEXT: task.prompt,
    };

    let cmd;
    let args;

    if (spec.kind === 'codex') {
      cmd = 'node';
      args = [CODEX_RUNNER, task.lane];
    } else if (spec.kind === 'claude') {
      cmd = 'bash';
      args = [AI_SH, 'claude', task.prompt];
    } else {
      cmd = 'bash';
      args = [OFFLOAD_SH, '-m', task.lane, ...(spec.offloadFlags || []), task.prompt];
    }

    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (spec.kind === 'codex') {
      try {
        child.stdin.write(task.prompt);
        child.stdin.end();
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolve({ ok: false, output: stdout, error: `timeout after ${TASK_TIMEOUT_MS / 60000}min` });
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: stdout, error: e.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: stdout,
        error: code !== 0 ? stderr.slice(0, 600) : null,
      });
    });
  });
}

async function runOne(workerName) {
  const data = readQueues();
  const w = data.workers[workerName];
  if (!w) return false;
  if (w.current) return false;

  const task = nextPending(workerName);
  if (!task) return false;

  task.status = 'running';
  task.startedAt = new Date().toISOString();
  w.current = task.id;
  writeQueues(data);

  process.stderr.write(
    `\x1b[36m[yuri-worker:${workerName}]\x1b[0m ▶ ${task.id} [${task.lane}]\n`,
  );

  const result = await execTask(task);

  const data2 = readQueues();
  const w2 = data2.workers[workerName];
  const idx = w2.tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    w2.tasks[idx].status = result.ok ? 'done' : 'failed';
    w2.tasks[idx].result = (result.output || '').slice(0, 4000);
    w2.tasks[idx].error = result.error;
    w2.tasks[idx].completedAt = new Date().toISOString();
  }
  w2.current = null;
  writeQueues(data2);

  const outFile = path.join(STATE_DIR, `worker-last-${workerName}.txt`);
  writeFileSync(
    outFile,
    `[${new Date().toISOString()}] ${task.id} ${result.ok ? 'OK' : 'FAIL'}\n\n${(result.output || result.error || '').slice(0, 12000)}\n`,
  );

  appendPulse({
    kind: 'worker-complete',
    worker: workerName,
    id: task.id,
    ok: result.ok,
    outFile: path.basename(outFile),
  });

  process.stderr.write(
    `\x1b[36m[yuri-worker:${workerName}]\x1b[0m ${result.ok ? '✓' : '✗'} ${task.id} → ${outFile}\n`,
  );

  return true;
}

async function loopWorker(workerName) {
  const spec = WORKERS[workerName];
  if (!spec) {
    console.error(`Unknown worker: ${workerName}`);
    process.exit(1);
  }
  process.stderr.write(
    `\x1b[32m[yuri-worker:${workerName}]\x1b[0m listening · LANE_SESSION=${spec.laneSession} · repo=${REPO_ROOT}\n`,
  );
  process.stderr.write(`  Queue file: ${QUEUES_FILE}\n`);

  for (;;) {
    const ran = await runOne(workerName);
    if (!ran) await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function printStatus() {
  const data = readQueues();
  for (const [name, spec] of Object.entries(WORKERS)) {
    const w = data.workers[name] || { tasks: [], current: null };
    const pending = w.tasks.filter((t) => t.status === 'pending').length;
    const running = w.current ? 1 : 0;
    const done = w.tasks.filter((t) => t.status === 'done').length;
    console.log(
      `${spec.label.padEnd(14)} pending=${pending} running=${running} done=${done} session=${spec.laneSession}`,
    );
  }
}

function usage() {
  console.log(`Usage: worker-bridge.mjs <command> [options]

Commands:
  loop --worker <codex|claude|deepseek>   Run in a dedicated terminal (claims queue)
  enqueue --worker <name> --prompt "..."  Enqueue one job
  route --prompt "..."                    route-plan → enqueue workers (Cursor hook)
  status                                  Queue summary

Env:
  YURI_AUTO_FEED=0          Disable auto route (hook respects this)
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === 'loop') {
    let worker = null;
    for (let i = 1; i < argv.length; i += 1) {
      if (argv[i] === '--worker' && argv[i + 1]) worker = argv[i + 1];
    }
    if (!worker) {
      usage();
      process.exit(1);
    }
    await loopWorker(worker);
    return;
  }

  if (cmd === 'enqueue') {
    let worker = null;
    let prompt = null;
    let lane = null;
    for (let i = 1; i < argv.length; i += 1) {
      if (argv[i] === '--worker' && argv[i + 1]) worker = argv[i + 1];
      if (argv[i] === '--prompt' && argv[i + 1]) prompt = argv[i + 1];
      if (argv[i] === '--lane' && argv[i + 1]) lane = argv[i + 1];
    }
    if (!worker || !prompt) {
      usage();
      process.exit(1);
    }
    const t = enqueue({ worker, prompt, lane, addedBy: 'cli' });
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  if (cmd === 'route') {
    let prompt = null;
    for (let i = 1; i < argv.length; i += 1) {
      if (argv[i] === '--prompt' && argv[i + 1]) prompt = argv[i + 1];
    }
    if (!prompt) {
      usage();
      process.exit(1);
    }
    const result = routeFromPrompt(prompt);
    console.log(
      JSON.stringify(
        {
          tier: result.plan.complexityTier,
          enqueued: result.enqueued.map((t) => ({ id: t.id, worker: t.worker, lane: t.lane })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'status') {
    printStatus();
    return;
  }

  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
