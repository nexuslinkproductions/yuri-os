#!/usr/bin/env node
// @capability: nano-external-lane
// @serves: external nano | nano via llm-lane | mimo nano | deepseek nano | codex nano | route nano through llm-compat | fully agentic external lane | external lane work fn
// @does: G4 — turns an external model lane (mimo / deepseek / codex / local) into a NANO SWARM work fn that routes through llm-lane, so an external nano gets the SAME equipped harness as a native one: the ~675-line YURI spine preamble, the evaluateToolCall safety core, the gated read+exec tool loop, the coreOnDispatch energy trace, and the 24-iter agentic loop — NOT a bare single-shot mimo.mjs call. The work fn plugs straight into nano-tick.
// @use: externalNanoWork({lane:'deepseek-v4-pro', task:'...'}) returns a work(ctx) for tick(nanoId,{work,...}). Dispatch routes ONLY through llm-lane (enforced); raw mimo.mjs / script paths are refused. Live firing needs egress for the chosen lane (codex/deepseek curl-gated in this sandbox — an environment fix, separate from this wiring).
// @exports: externalNanoWork, buildExternalPrompt, assertLlmLaneRouted, defaultLlmLaneRunner, governedFireDecision
//
// WHY route through llm-lane and not mimo.mjs directly: raw mimo.mjs is a bare single-shot with no spine,
// no tools, no safety core, no energy trace — a nano built on it would be "structurally blind". llm-lane
// already wires all of that (verified live: imports policy/yuri-safety-core + lane-core-hooks, injects the
// full loadout, runs the gated 24-iter loop). So the external nano inherits YURI's structure for free.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LLM_LANE = path.join(HERE, 'llm-lane.mjs');

// A lane id must be an llm-lane lane KEY/alias (resolved by llm-lane's table), never a path or a script
// name — this is what structurally forbids routing a nano around llm-lane straight into raw mimo.mjs.
export function assertLlmLaneRouted(lane) {
  const l = String(lane || '').trim();
  if (!l) throw new Error('externalNanoWork: lane required');
  if (l.includes('/') || /\.(mjs|js|cjs|sh)$/i.test(l)) {
    throw new Error(`externalNanoWork: lane must be an llm-lane lane key, not a path/script ("${l}"). External nanos route through llm-lane only — never raw mimo.mjs.`);
  }
  return l;
}

/** Compose the task + per-tick swarm context into the prompt the external lane receives. */
export function buildExternalPrompt(task, ctx = {}, includeBrain = false) {
  const lines = [];
  if (ctx.nanoId) lines.push(`You are NANO SWARM lane "${ctx.nanoId}", routed through llm-lane with the full YURI operator harness.`);
  if (ctx.goalId) lines.push(`Goal: ${ctx.goalId}`);
  if (ctx.shard) lines.push(`Work shard you hold the lease on: ${ctx.shard}`);
  if (includeBrain && ctx.brain) lines.push(`\nSwarm awareness (recent peer activity):\n${ctx.brain}`);
  lines.push('', String(task || '').trim());
  return lines.join('\n');
}

/** Default runner: spawn the llm-lane CLI, capture its --out file (the lane's final text). `env` is merged
 *  over process.env so tree ctx (YURI_NANO_*) crosses the process boundary to a spawned child lane. */
export function defaultLlmLaneRunner({ lane, prompt, reasoning, maxIters, contextFiles, timeoutMs, env = null, model = null }) {
  const outFile = path.join(os.tmpdir(), `nano-ext-${process.pid}-${crypto.randomBytes(4).toString('hex')}.txt`);
  const args = [LLM_LANE, lane, prompt, '--out', outFile, '--max-iters', String(maxIters || 24)];
  if (reasoning) args.push('--reasoning', reasoning);
  if (model) args.push('--model', model);   // per-child model (e.g. cross-family ollama-cloud swarm: nemotron/glm/minimax/kimi)
  if (Array.isArray(contextFiles) && contextFiles.length) args.push('--context', contextFiles.join(','));
  const res = spawnSync('node', args, { encoding: 'utf8', timeout: timeoutMs || 200000, maxBuffer: 16 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env });
  let output = '';
  try { output = fs.readFileSync(outFile, 'utf8'); } catch { /* lane may have failed before writing */ }
  try { fs.unlinkSync(outFile); } catch { /* best-effort */ }
  return { exitCode: res.status, output: output || (res.stdout || ''), stderr: res.stderr || '', signal: res.signal || null };
}

/**
 * Build a nano-tick `work(ctx)` fn that dispatches the task to an external lane through llm-lane.
 * opts.runLane is injectable (tests pass a fake; default spawns the real llm-lane CLI).
 */
export function externalNanoWork({
  lane, task, reasoning = 'xhigh', maxIters = 24, contextFiles = [], includeBrain = false,
  timeoutMs = 200000, runLane = defaultLlmLaneRunner, env = null, model = null,
} = {}) {
  const laneId = assertLlmLaneRouted(lane);
  return async function externalWork(ctx = {}) {
    const prompt = buildExternalPrompt(task, ctx, includeBrain);
    let r;
    try { r = await runLane({ lane: laneId, prompt, reasoning, maxIters, contextFiles, timeoutMs, env, model }); }
    catch (e) { return { ok: false, lane: laneId, via: 'llm-lane', error: String(e?.message || e) }; }
    const output = String(r?.output || '').trim();
    const ok = (r?.exitCode === 0 || r?.exitCode == null) && output.length > 0;
    return {
      ok, lane: laneId, via: 'llm-lane', exitCode: r?.exitCode ?? null,
      output, ...(ok ? {} : { stderr: String(r?.stderr || '').slice(0, 500) }),
    };
  };
}

/**
 * Bypass guard (Move 1b INC-5, 07-ARCHITECTURE.md §13 #7). Direct CLI fire of this module is the ungoverned
 * spawn vector — a lane's bash running `node nano-external.mjs <lane> "<task>"` would skip spawn_nano's
 * depth/fan-out/budget/cost caps entirely. The GOVERNED path (spawn_nano) calls externalNanoWork()
 * PROGRAMMATICALLY and never touches this CLI, so the CLI fire path has no legitimate non-operator use.
 * --dry (routing proof) is always allowed; an actual fire requires the operator escape hatch
 * YURI_NANO_CLI_FIRE=1. The HARD stop against an adversarial lane is the bash-security-guard hook deny
 * (deferred: that hook file is currently dirty with another session's work — must not be swept; ready patch
 * lives in 02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/inc5-bash-guard-deny.patch.md).
 */
export function governedFireDecision({ dry = false, env = process.env } = {}) {
  if (dry) return { allow: true, mode: 'dry' };
  if (env.YURI_NANO_CLI_FIRE === '1') return { allow: true, mode: 'operator-cli-fire' };
  return {
    allow: false, reason: 'ungoverned-cli-fire-refused',
    message: 'Direct nano-external CLI fire is refused — spawn via the governed spawn_nano tool (depth/fan-out/budget/cost caps). Operator override: YURI_NANO_CLI_FIRE=1.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [lane, ...rest] = process.argv.slice(2);
  const dry = rest.includes('--dry');
  const task = rest.filter((a) => a !== '--dry').join(' ') || 'Summarize what YURI is in two sentences.';
  if (!lane) { process.stdout.write('usage: nano-external.mjs <lane-key> "<task>" [--dry]\n'); process.exit(2); }
  const gate = governedFireDecision({ dry });
  if (!gate.allow) { process.stderr.write(`${JSON.stringify({ refused: true, ...gate }, null, 2)}\n`); process.exit(3); }
  if (dry) {
    // prove the routing without firing: show the prompt + that it targets llm-lane.
    process.stdout.write(`${JSON.stringify({ lane: assertLlmLaneRouted(lane), via: 'llm-lane', prompt: buildExternalPrompt(task, { nanoId: 'nano-ext-cli', goalId: 'cli' }) }, null, 2)}\n`);
  } else {
    externalNanoWork({ lane, task })({ nanoId: 'nano-ext-cli', goalId: 'cli' })
      .then((r) => process.stdout.write(`${JSON.stringify(r, null, 2)}\n`));
  }
}
