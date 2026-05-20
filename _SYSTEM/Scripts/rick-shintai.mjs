#!/usr/bin/env node
/**
 * rick-shintai.mjs — advisory Shintai squad for the Rick/YURI harness.
 *
 * This module intentionally does not apply patches, stage files, commit, or push.
 * Lanes may draft code and patch-ready guidance, but Rick/Codex applies changes
 * only after review.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthCheckAll } from './worker-tmux.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_SH = path.join(__dirname, 'ai');
const ADVISORY_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'shintai-advisory');

const C = {
  bronze: '\x1b[38;2;205;127;50m',
  cream: '\x1b[38;2;255;248;220m',
  good: '\x1b[38;2;143;188;143m',
  warn: '\x1b[38;2;255;215;0m',
  bad: '\x1b[38;2;255;107;107m',
  dim: '\x1b[2;38;2;139;134;130m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const DEFAULT_SQUAD = [
  { id: 'deepseek', lane: '@deepseek-v4-pro', role: 'Research Lead' },
  { id: 'codex', lane: '@codex-spark', role: 'Implementation Planner' },
  { id: 'nemotron', lane: '@nvidia-nemotron-120b', role: 'Adversarial Critic' },
];

const DEFAULT_HEALTH_LANES = ['@codex-spark', '@deepseek-v4-pro'];

function say(color, message, stream = process.stdout) {
  stream.write(`${color}${message}${C.reset}\n`);
}

function lanePrompt(role, task) {
  return [
    '[Rick · Marcel · YURI]',
    `You are ${role} in Rick's advisory Shintai squad.`,
    'Mode: advisory and patch-prep only. Do not run commands, edit files, stage, commit, or push.',
    'You may draft code snippets and unified-diff guidance for Rick/Codex to review later.',
    'Think three steps ahead and keep the full Rick/YURI harness vision intact.',
    '',
    'Return:',
    '1. Critical architecture risks',
    '2. Minimal implementable harness slice',
    '3. Guardrail failures to avoid',
    '4. Patch-ready implementation guidance',
    '',
    `TASK:\n${task}`,
  ].join('\n');
}

function critiquePrompt(role, task, peers) {
  const peerBlock = peers
    .map(({ label, output }) => `=== ${label} ===\n${String(output || '').slice(0, 3500)}`)
    .join('\n\n');
  return [
    '[Rick · Marcel · YURI]',
    `You are ${role} in Rick's advisory Shintai critique phase.`,
    'Mode: advisory and patch-prep only. No commands, no file edits, no commits.',
    'Critique the peer outputs for operational risk, scope drift, and harness correctness.',
    '',
    peerBlock,
    '',
    `TASK:\n${task}`,
    '',
    'Return 3 concrete flaws, 2 required corrections, and 1 stronger implementation path.',
  ].join('\n');
}

function synthesisPrompt(task, proposals, critiques) {
  const proposalBlock = proposals
    .map(({ id, role, output }) => `### ${role} (${id})\n${String(output || '').slice(0, 3000)}`)
    .join('\n\n');
  const critiqueBlock = critiques
    .map(({ id, output }) => `### ${id}\n${String(output || '').slice(0, 2200)}`)
    .join('\n\n');
  return [
    '[Rick · Marcel · YURI]',
    'You are Rick synthesizing the advisory Shintai results into a safe implementation brief.',
    'Mode: advisory and patch-prep only. Do not tell anyone to stage, commit, or push.',
    '',
    `TASK:\n${task}`,
    '',
    '=== PROPOSALS ===',
    proposalBlock,
    '',
    '=== CRITIQUES ===',
    critiqueBlock,
    '',
    'Produce:',
    '## FINAL_APPROACH',
    '## IMPLEMENTATION_GUIDANCE',
    '## GUARDRAILS',
    '## TESTS',
  ].join('\n');
}

function callLane(lane, prompt, timeout = 120_000) {
  const result = spawnSync('bash', [AI_SH, lane, prompt], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    lane,
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : null,
  };
}

function writeAdvisoryArtifact(payload) {
  mkdirSync(ADVISORY_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(ADVISORY_DIR, `shintai-${stamp}`);
  const md = [
    `# Shintai Advisory: ${payload.task}`,
    '',
    `Generated: ${payload.timestamp}`,
    '',
    '## Synthesis',
    '',
    payload.synthesis,
    '',
    '## Proposals',
    '',
    ...payload.proposals.map((entry) => `### ${entry.role} (${entry.id})\n\n${entry.output}`),
    '',
    '## Critiques',
    '',
    ...payload.critiques.map((entry) => `### ${entry.id}\n\n${entry.output}`),
  ].join('\n');
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2));
  return { markdown: `${base}.md`, json: `${base}.json` };
}

export async function runAdvisory(task, options = {}) {
  const taskText = String(task || '').trim();
  if (!taskText) return { ok: false, task: taskText, error: 'empty Shintai task' };

  const stream = options.stream || process.stdout;
  const squad = options.squad || DEFAULT_SQUAD;
  const healthLanes = options.healthLanes || DEFAULT_HEALTH_LANES;
  const timeoutMs = Number(options.timeoutMs || 120_000);

  if (options.healthCheck !== false) {
    const health = await healthCheckAll(healthLanes);
    if (!health.ok) {
      return {
        ok: false,
        task: taskText,
        health,
        proposals: [],
        critiques: [],
        synthesis: '',
        artifacts: null,
        error: 'Shintai preflight failed',
      };
    }
  }

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: fan-out ──', stream);
  const proposalResults = squad.map(({ id, lane, role }) => {
    say(C.dim, `  ${lane} · ${role}`, stream);
    const result = callLane(lane, lanePrompt(role, taskText), timeoutMs);
    say(result.ok ? C.good : C.warn, `  ${result.ok ? '✓' : '⚠'} ${lane}`, stream);
    return { id, lane, role, output: result.stdout || result.stderr || result.error || '', result };
  });

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: critique ──', stream);
  const critiqueResults = squad.map(({ id, lane, role }) => {
    const peers = proposalResults
      .filter((entry) => entry.id !== id)
      .map((entry) => ({ label: `${entry.role} (${entry.id})`, output: entry.output }));
    const result = callLane(lane, critiquePrompt(role, taskText, peers), Math.min(timeoutMs, 90_000));
    say(result.ok ? C.good : C.warn, `  ${result.ok ? '✓' : '⚠'} critique ${lane}`, stream);
    return { id, lane, role, output: result.stdout || result.stderr || result.error || '', result };
  });

  say(`${C.bronze}${C.bold}`, '\n── Shintai advisory: synthesis ──', stream);
  const synthLane = options.synthesisLane || '@deepseek-v4-pro';
  const synthesisResult = callLane(
    synthLane,
    synthesisPrompt(taskText, proposalResults, critiqueResults),
    timeoutMs,
  );
  const synthesis = synthesisResult.stdout || synthesisResult.stderr || synthesisResult.error || '';
  const payload = {
    ok: proposalResults.some((entry) => entry.result.ok) && Boolean(synthesis),
    task: taskText,
    timestamp: new Date().toISOString(),
    proposals: proposalResults,
    critiques: critiqueResults,
    synthesis,
    health: null,
    artifacts: null,
  };

  if (options.writeArtifact !== false) {
    payload.artifacts = writeAdvisoryArtifact(payload);
  }

  return payload;
}

export async function run(taskSummary, options = {}) {
  const result = await runAdvisory(taskSummary, options);
  if (!result.ok) {
    say(C.bad, `Shintai advisory failed: ${result.error || 'unknown error'}`);
    if (result.health) process.stdout.write(`${JSON.stringify(result.health, null, 2)}\n`);
    return result;
  }
  process.stdout.write(`\n${C.cream}${result.synthesis}${C.reset}\n`);
  if (result.artifacts?.markdown) say(C.dim, `advisory saved → ${result.artifacts.markdown}`);
  return result;
}

if (process.argv[2] === 'run') {
  const task = process.argv.slice(3).join(' ');
  run(task).then((result) => {
    process.exit(result.ok ? 0 : 1);
  }).catch((err) => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(1);
  });
}
