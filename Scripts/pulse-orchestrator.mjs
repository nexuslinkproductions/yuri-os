#!/usr/bin/env node
// PATCH 031 — Pulse Cortex orchestrator
//
// Entry point for the symbiotic pulse auto-trigger architecture. Spawned
// detached by .claude/hooks/user-prompt-submit.js on every non-trivial
// user prompt. Reads the classifier (offload-contract.mjs route-plan),
// fans out advisors in parallel via Promise.allSettled, writes findings
// to .claude/state/pulse-bus.json.
//
// Authority model:
//   - DeepSeek, OpenClaw, Hermes-forecast, Cassandra = ADVISORY ONLY.
//     Never grant write or canonical authority.
//   - OpenClaw is quarantined per OFFLOAD_CONTRACT.claudeProtocolGate.openClaw:
//     bridge_advisory only. Tagged in pulse-bus accordingly.
//   - Two-phase Codex auto-impl (PATCH 036) calls a separate runner.
//     Orchestrator only writes advisor findings + flags codexPolicy in plan.
//   - Failure modes: any advisor that throws/EPIPE/times-out is logged to
//     pulse-errors.log; bus still receives whatever returned.

import { spawn } from 'node:child_process';
import { promises as fsp, existsSync, mkdirSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const PLAN_PATH = path.join(STATE_DIR, 'pulse-plan.json');
const ERROR_LOG = path.join(STATE_DIR, 'pulse-errors.log');
const CONTRACT = path.join(REPO_ROOT, 'Scripts', 'offload-contract.mjs');
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts', 'offload.sh');
const OPENCLAW_BRIDGE = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'openclaw-bridge.sh');

const TIMEOUT_DEEPSEEK_MS = 60_000;
const TIMEOUT_OPENCLAW_MS = 60_000;
const TIMEOUT_SWARM_MS    = 90_000;

// Lazy require for the CommonJS pulse-bus module from ESM context
const requireFromCjs = (await import('node:module')).createRequire(import.meta.url);
const pulseBus = requireFromCjs(path.join(REPO_ROOT, '.claude', 'hooks', 'pulse-bus.js'));

function logError(msg) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const line = `${new Date().toISOString()} [pulse-orchestrator] ${msg}\n`;
    appendFileSync(ERROR_LOG, line);
  } catch (_) { /* never throw */ }
}

function execWithTimeout(cmd, args, opts = {}, timeoutMs = 60_000, stdin = null) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(cmd, args, { cwd: REPO_ROOT, ...opts });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve({ code: -1, stdout, stderr: stderr + '\n[orchestrator] timeout', timedOut: true });
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + '\n[orchestrator] spawn-error: ' + e.message, error: true });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    if (stdin != null) {
      try { child.stdin.write(stdin); child.stdin.end(); } catch (_) {}
    }
  });
}

async function buildRoutePlan(prompt) {
  const result = await execWithTimeout('node', [CONTRACT, 'route-plan', prompt], {}, 15_000);
  if (result.code !== 0) {
    logError(`route-plan failed (${result.code}): ${result.stderr.slice(0, 300)}`);
    return null;
  }
  try { return JSON.parse(result.stdout); }
  catch (e) {
    logError(`route-plan JSON parse failed: ${e.message}`);
    return null;
  }
}

function writePlanFile(plan, turnId) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const payload = { turn_id: turnId, ts: new Date().toISOString(), plan };
    const tmp = PLAN_PATH + '.tmp';
    writeFileSync(tmp, JSON.stringify(payload, null, 2));
    renameSync(tmp, PLAN_PATH);
  } catch (e) {
    logError(`writePlanFile failed: ${e.message}`);
  }
}

function parseAdvisorOutput(raw) {
  if (!raw) return { severity: 'INFO', finding: '(no output)', confidence: 0.2 };
  const text = String(raw).trim();
  if (/^PASS\s*$/i.test(text)) return { severity: 'INFO', finding: 'PASS', confidence: 0.9 };

  // Heuristic severity scan
  let severity = 'INFO';
  if (/\b(critical|catastrophic|highest risk)\b/i.test(text)) severity = 'CRITICAL';
  else if (/\b(high risk|hard block|blocker|broken)\b/i.test(text)) severity = 'HIGH';
  else if (/\b(warn|warning|caution|risk|concern|stale|leak|race)\b/i.test(text)) severity = 'WARN';

  // Extract first non-empty content line, trimmed
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const finding = (lines[0] || '(no finding)').slice(0, 380);
  // Crude confidence: bigger output + multiple lines = more confidence
  const confidence = Math.min(0.95, 0.3 + lines.length * 0.05);
  return { severity, finding, confidence };
}

async function dispatchDeepSeekPreflight(prompt, plan, turnId) {
  const preflightPrompt = `PULSE_PREFLIGHT (turn=${turnId})
SCENARIO: ${plan.scenario}
LANE: ${plan.lane}
TIER: ${plan.complexityTier}
PROMPT: "${String(prompt).slice(0, 240)}"

QUESTION: Identify the single biggest risk, ambiguity, or missing context the main thread should weigh before acting. Be concrete. 1-3 lines.
OUTPUT_CAP: 40 lines`;

  const result = await execWithTimeout(
    'bash',
    [OFFLOAD_SH, '@deepseek', '--no-tools', preflightPrompt],
    {},
    TIMEOUT_DEEPSEEK_MS
  );
  if (result.code !== 0 || result.timedOut) {
    logError(`DeepSeek preflight failed (code=${result.code} timeout=${!!result.timedOut})`);
    return null;
  }
  const parsed = parseAdvisorOutput(result.stdout);
  return { source: 'DEEPSEEK', runtimeKind: 'model_advisor', ...parsed };
}

async function dispatchOpenClawPreflight(prompt, plan, turnId) {
  const payload = JSON.stringify({
    task_id: '',
    from_agent: 'ENKI',
    channel: `internal:pulse-cortex:${turnId}`,
    message: `PULSE_PREFLIGHT pattern advisory. Scenario=${plan.scenario}, tier=${plan.complexityTier}. Prompt: "${String(prompt).slice(0, 200)}". CRITIQUE: pattern weakness or architectural lens the analytic advisor may miss. 1-3 lines, 30 lines max.`,
    origin: 'ENKI',
  });
  const result = await execWithTimeout(
    'bash',
    [OPENCLAW_BRIDGE],
    {},
    TIMEOUT_OPENCLAW_MS,
    payload
  );
  if (result.code !== 0 || result.timedOut) {
    logError(`OpenClaw preflight failed (code=${result.code} timeout=${!!result.timedOut})`);
    return null;
  }
  // OpenClaw bridge returns JSON envelope; extract summary
  let summary = '';
  try {
    const env = JSON.parse(result.stdout.match(/\{[\s\S]*\}\s*$/)?.[0] || result.stdout);
    if (env.status === 'FAILED') {
      logError(`OpenClaw bridge returned FAILED: ${env.error || env.summary || 'empty'}`);
      return null;
    }
    summary = (env.summary || '').trim();
  } catch (_) {
    summary = result.stdout.trim();
  }
  if (!summary) {
    logError(`OpenClaw preflight empty summary; gateway may be down or model returned nothing`);
    return null;
  }
  const parsed = parseAdvisorOutput(summary);
  // OpenClaw is bridge_advisory per quarantine — tag accordingly
  return { source: 'OPENCLAW', runtimeKind: 'bridge_advisory', ...parsed };
}

async function dispatchHermesForecast(prompt, plan, turnId) {
  // Placeholder for PATCH 034 — native function lives in scout-runner.js
  // For PATCH 031 the orchestrator emits a stub finding so the bus sees the slot.
  return {
    source: 'HERMES_FC',
    runtimeKind: 'native_function',
    severity: 'INFO',
    finding: '(PATCH 034 stub) Hermes-forecast not yet wired',
    confidence: 0.5,
  };
}

async function dispatchCassandra(prompt, plan, turnId) {
  // Placeholder for PATCH 035 — full impl reads git log + EOT history
  return {
    source: 'CASSANDRA',
    runtimeKind: 'native_function',
    severity: 'INFO',
    finding: '(PATCH 035 stub) Cassandra strategic foresight not yet wired',
    confidence: 0.4,
  };
}

async function dispatchSwarmFanout(prompt, plan, turnId) {
  // Critical-tier only. Ruflo @swarm fan-out via offload.sh.
  const result = await execWithTimeout(
    'bash',
    [OFFLOAD_SH, '@swarm', `PULSE_SWARM (turn=${turnId}) ${String(prompt).slice(0, 300)}`],
    {},
    TIMEOUT_SWARM_MS
  );
  if (result.code !== 0 || result.timedOut) {
    logError(`@swarm fan-out failed (code=${result.code} timeout=${!!result.timedOut})`);
    return null;
  }
  const parsed = parseAdvisorOutput(result.stdout);
  return { source: 'SWARM', runtimeKind: 'swarm_dispatch', ...parsed };
}

function buildTaskMap(ensemble, prompt, plan, turnId) {
  const m = {};
  for (const slot of ensemble) {
    if (slot === 'deepseek-preflight') m.deepseek = () => dispatchDeepSeekPreflight(prompt, plan, turnId);
    if (slot === 'openclaw-preflight') m.openclaw = () => dispatchOpenClawPreflight(prompt, plan, turnId);
    if (slot === 'hermes-forecast')    m.hermesFC = () => dispatchHermesForecast(prompt, plan, turnId);
    if (slot === 'cassandra')          m.cassandra = () => dispatchCassandra(prompt, plan, turnId);
    if (slot === 'swarm-fanout')       m.swarm    = () => dispatchSwarmFanout(prompt, plan, turnId);
  }
  return m;
}

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) {
    logError('orchestrator invoked without prompt');
    process.exit(0);
  }
  const turnId = process.env.PULSE_TURN_ID || randomUUID().slice(0, 8);

  pulseBus.initIfMissing();

  const plan = await buildRoutePlan(prompt);
  if (!plan) {
    logError('orchestrator aborting: no plan');
    process.exit(0);
  }
  writePlanFile(plan, turnId);

  if (plan.complexityTier === 'trivial' || !plan.ensemble || plan.ensemble.length === 0) {
    process.exit(0); // trivial: orchestrator just publishes the plan and stops
  }

  const tasks = buildTaskMap(plan.ensemble, prompt, plan, turnId);
  const entries = Object.entries(tasks);
  const results = await Promise.allSettled(entries.map(([, fn]) => fn()));

  const findings = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) findings.push(r.value);
    else if (r.status === 'rejected') logError(`advisor rejected: ${r.reason?.message || r.reason}`);
  });

  for (const f of findings) {
    pulseBus.appendFinding(f.source, f.severity, f.runtimeKind, f.finding, {
      turnId,
      confidence: f.confidence,
    });
  }

  // PATCH 031 — advisor disagreement detector
  const turnEntries = pulseBus.findingsByTurn(turnId);
  if (pulseBus.detectDisagreement(turnEntries)) {
    pulseBus.appendFinding(
      'CORTEX',
      'WARN',
      'meta',
      `Advisor disagreement detected across ${turnEntries.length} findings on turn ${turnId}`,
      { turnId, confidence: 0.9 }
    );
  }

  process.exit(0);
}

main().catch((e) => {
  logError(`orchestrator fatal: ${e.message}`);
  process.exit(0);
});
