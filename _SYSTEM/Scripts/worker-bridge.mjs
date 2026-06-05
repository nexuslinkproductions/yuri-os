#!/usr/bin/env node
/**
 * worker-bridge.mjs — IDE/Kagami → warm worker terminals (no manual paste)
 *
 * Each worker terminal runs:  node _SYSTEM/Scripts/worker-bridge.mjs loop --worker <name>
 * IDE, Kagami, or CLI enqueues jobs; loops claim and execute with fixed LANE_SESSION.
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
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { buildRickLanePacket, lanePersonaForWorker } from './lane-persona-map.mjs';
import { captureWorkerPane, feedWorkerTui, scheduleCaptureAfterFeed } from './worker-tmux.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_BRIDGE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../..');
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state');
const PULSE_BUS = path.join(STATE_DIR, 'pulse-bus.jsonl');
const QUEUES_FILE = path.join(STATE_DIR, 'worker-queues.json');
const LLM_COMPAT_SH = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'llm-compat.sh');
const CODEX_RUNNER = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'codex-offload-runner.mjs');
const AI_SH = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'ai');
const CONTRACT = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'llm-compat-contract.mjs');

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
    offloadFlags: [],
  },
};

const TASK_TIMEOUT_MS = Number(process.env.YURI_WORKER_TASK_TIMEOUT_MS || 6 * 60 * 60 * 1000);
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

function newTask({ worker, prompt, lane, addedBy = 'ide', meta = {} }) {
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

function claudeModelForTask(meta = {}) {
  return meta.model || process.env.YURI_CLAUDE_MODEL || process.env.YURI_MODEL || 'sonnet';
}

function buildClaudeRickPacket(prompt, options = {}) {
  return buildRickLanePacket('claude', prompt, options);
}

export function enqueue({ worker, prompt, lane, addedBy, meta }) {
  const data = readQueues();
  const task = newTask({ worker, prompt, lane, addedBy, meta });
  const spec = WORKERS[worker];
  const claudeModel = spec.kind === 'claude' ? claudeModelForTask(task.meta) : null;
  if (claudeModel) task.meta = { ...(task.meta || {}), model: claudeModel };
  appendWorkerEvent('LANE_DISPATCHED', {
    source: 'worker-bridge:enqueue',
    worker,
    lane: task.lane,
    session: spec.laneSession,
    model: claudeModel,
    taskId: task.id,
    addedBy,
    status: spec.kind === 'claude' ? 'fed-live-tui' : 'queued',
    meta: task.meta,
  });
  if (spec.kind === 'claude') {
    task.startedAt = new Date().toISOString();
    const lanePrompt = buildClaudeRickPacket(task.prompt, { model: claudeModel });
    const feed = feedWorkerTui('claude', lanePrompt);
    const capture = feed.ok
      ? scheduleCaptureAfterFeed('claude', task.id, {
          lane: task.lane,
          session: spec.laneSession,
          model: claudeModel,
          delayMs: Number(process.env.YURI_CLAUDE_CAPTURE_DELAY_MS || 20_000),
          lines: Number(process.env.YURI_CLAUDE_CAPTURE_LINES || 500),
        })
      : null;
    task.status = feed.ok ? 'done' : 'failed';
    task.result = feed.ok
      ? [
          `fed live Claude TUI via ${feed.transport || 'tmux'} target=${feed.target || 'unknown'}`,
          capture?.scheduled ? `capture scheduled after ${capture.delayMs}ms` : null,
        ].filter(Boolean).join('; ')
      : null;
    task.error = feed.ok ? null : feed.error || 'Claude TUI feed failed';
    task.completedAt = new Date().toISOString();
    data.workers[worker].tasks.push(task);
    writeQueues(data);
    appendPulse({
      kind: feed.ok ? 'worker-feed' : 'worker-feed-failed',
      worker,
      id: task.id,
      addedBy,
    });
    appendWorkerEvent('LANE_OUTPUT_DELTA', {
      source: 'worker-bridge:claude-feed',
      worker,
      lane: task.lane,
      session: spec.laneSession,
      model: claudeModel,
      taskId: task.id,
      ok: feed.ok,
      status: task.status,
      target: feed.target || null,
      captureScheduled: Boolean(capture?.scheduled),
      captureDelayMs: capture?.delayMs ?? null,
      error: task.error,
    });
    return task;
  }
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

function appendWorkerEvent(kind, payload = {}) {
  try {
    appendKagamiEvent(kind, {
      source: 'worker-bridge',
      ...payload,
    });
  } catch {
    // Worker queues should keep moving even if telemetry is temporarily unavailable.
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

  const wrap = (worker, role, body, options = {}) => {
    const persona = lanePersonaForWorker(worker, options);
    return buildRickLanePacket(
      worker,
      `[YURI worker dispatch · ${persona.packetRole} · ${role} · tier=${tier}]\n` +
        `Source: YURI worker bridge\n\n` +
        `${body}\n\n` +
        `---\nOriginal request:\n${userPrompt}`,
      options,
    );
  };

  if (tier === 'trivial') return out;

  if (plan.deepseekAdvisory?.decision?.startsWith('use') || tier !== 'trivial') {
    out.push({
      worker: 'deepseek',
      prompt: wrap(
        'deepseek',
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
        'claude',
        'Claude control-plane review',
        'Advisory only. Review routing, risks, merge gate. ' +
          'Required sections: findings, risks, upgrade_candidates, tests_needed, reject_or_accept_reasoning.',
        { model: claudeModelForTask() },
      ),
    });
  }

  const mutate = /\b(implement|fix|patch|refactor|build|wire|create|add|migrate|debug)\b/i.test(
    userPrompt,
  );
  // Worker terminal = impl lane; feed Codex on mutation verbs even when codexPolicy=none.
  const wantsCodex = mutate && codexPolicy !== 'none' ? true : mutate && tier !== 'trivial';

  if (wantsCodex) {
    const model = plan.codexDispatch?.model || 'gpt-5.5';
    out.push({
      worker: 'codex',
      lane: model,
      prompt: wrap(
        'codex',
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

export function routeFromPrompt(userPrompt, { addedBy = 'ide-hook' } = {}) {
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

function execClaudeTuiTask(task) {
  return new Promise((resolve) => {
    const model = claudeModelForTask(task.meta);
    const feed = feedWorkerTui('claude', buildClaudeRickPacket(task.prompt, { model }));
    if (!feed.ok) {
      resolve({ ok: false, output: '', error: feed.error || 'Claude TUI feed failed' });
      return;
    }

    const delayMs = Number(process.env.YURI_CLAUDE_CAPTURE_DELAY_MS || 1500);
    const lines = Number(process.env.YURI_CLAUDE_CAPTURE_LINES || 160);
    setTimeout(() => {
      const capture = captureWorkerPane('claude', lines);
      const captured = capture.ok
        ? capture.text.slice(-6000)
        : `Claude pane capture unavailable: ${capture.error || 'unknown error'}`;
      resolve({
        ok: true,
        output: [
          `fed live Claude TUI via ${feed.transport || 'tmux'} target=${feed.target || 'unknown'}`,
          captured,
        ].join('\n\n'),
        error: null,
      });
    }, Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1500);
  });
}

function execTask(task) {
  const spec = WORKERS[task.worker];
  if (spec.kind === 'claude') return execClaudeTuiTask(task);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const env = {
      ...process.env,
      LANE_SESSION: spec.laneSession,
      LLM_COMPAT_PROMPT_TEXT: task.prompt,
    };

    let cmd;
    let args;

    if (spec.kind === 'codex') {
      cmd = 'node';
      args = [CODEX_RUNNER, task.lane];
    } else {
      cmd = 'bash';
      args = [LLM_COMPAT_SH, '-m', task.lane, ...(spec.offloadFlags || []), task.prompt];
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
  appendWorkerEvent('LANE_DISPATCHED', {
    source: 'worker-bridge:run-one',
    worker: workerName,
    lane: task.lane,
    session: WORKERS[workerName].laneSession,
    taskId: task.id,
    status: 'running',
    meta: task.meta || {},
  });

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
  const evidenceRef = path.relative(REPO_ROOT, outFile);
  appendWorkerEvent('LANE_OUTPUT_DELTA', {
    source: 'worker-bridge:complete',
    worker: workerName,
    lane: task.lane,
    session: WORKERS[workerName].laneSession,
    taskId: task.id,
    ok: result.ok,
    status: result.ok ? 'done' : 'failed',
    evidenceRefs: [evidenceRef],
    error: result.error || null,
  });
  if (workerName === 'codex') {
    appendWorkerEvent(result.ok ? 'CODEX_VERIFICATION_PASSED' : 'CODEX_VERIFICATION_FAILED', {
      source: 'worker-bridge:codex-complete',
      worker: workerName,
      lane: task.lane,
      session: WORKERS[workerName].laneSession,
      taskId: task.id,
      evidenceRefs: [evidenceRef],
      error: result.error || null,
    });
  }

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
  route --prompt "..."                    route-plan → enqueue workers (IDE/Kagami hook)
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

if (path.resolve(WORKER_BRIDGE_PATH) === path.resolve(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
