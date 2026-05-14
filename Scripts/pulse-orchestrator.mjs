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

  // Extract first non-empty content line; skip pure markdown headers/bullets
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // PATCH 043/047 — skip markdown decoration + natural-language preamble sentences (e.g. "Here are 3 risks:")
  const isHeaderOnly = l =>
    /^\*\*[^*]+\*\*:?\s*$/.test(l) ||
    /^#{1,3}\s/.test(l) ||
    /^[-*]\s*$/.test(l) ||
    /^[A-Z][^.!?]*:\s*$/.test(l);
  const contentLine = lines.find(l => !isHeaderOnly(l)) || lines[0] || '(no finding)';
  const finding = contentLine.slice(0, 380);
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
  // OpenClaw bridge returns JSON envelope; extract summary.
  // PATCH 044 — use lastIndexOf('\n{') to find the final JSON block, preventing
  // kernel.py stdout (which contains inline JSON) from polluting the greedy regex match.
  let summary = '';
  try {
    const raw = result.stdout;
    const lastBrace = raw.lastIndexOf('\n{');
    const jsonStr = lastBrace >= 0 ? raw.slice(lastBrace + 1).trim() : raw.trim();
    const env = JSON.parse(jsonStr);
    if (env.status === 'FAILED') {
      logError(`OpenClaw bridge returned FAILED: ${env.error || env.summary || 'empty'}`);
      return null;
    }
    summary = (env.summary || '').trim();
  } catch (_) {
    summary = '';  // parse failed — treat as empty, let the null-check below handle it
  }
  if (!summary) {
    // PATCH 041 — surface raw output for diagnostics instead of silent "gateway may be down"
    const rawSnippet = result.stdout.trim().slice(0, 200).replace(/\n/g, '\\n') || '(empty stdout)';
    const stderrSnippet = result.stderr.trim().slice(0, 100).replace(/\n/g, '\\n') || '(empty stderr)';
    logError(`openclaw_empty_model_output raw="${rawSnippet}" stderr="${stderrSnippet}"`);
    return null;
  }
  const parsed = parseAdvisorOutput(summary);
  // OpenClaw is bridge_advisory per quarantine — tag accordingly
  return { source: 'OPENCLAW', runtimeKind: 'bridge_advisory', ...parsed };
}

async function dispatchHermesForecast(prompt, plan, turnId) {
  // PATCH 034 — native predictive temporal/scope forecast.
  // Inputs: .claude/state/session-state.json (context.pct + files_written),
  // plus the prompt itself (file path mentions, top-level scope breadth).
  // Output: 1-line forecast with severity scaled to predicted pressure.
  const SESSION_STATE = path.join(REPO_ROOT, '.claude', 'state', 'session-state.json');
  let contextPct = 0;
  let filesWrittenCount = 0;
  try {
    const raw = await fsp.readFile(SESSION_STATE, 'utf8');
    const state = JSON.parse(raw);
    contextPct = Math.round(state?.context?.pct || 0);
    filesWrittenCount = Array.isArray(state?.files_written) ? state.files_written.length : 0;
  } catch (_) { /* missing state = fresh session, leave zeros */ }

  const pathMatches = String(prompt).match(/[/][\w./-]+\.[a-z]+/gi) || [];
  const topLevels = new Set(pathMatches.map(p => p.replace(/^\//, '').split('/')[0]).filter(Boolean));
  const fileCount = pathMatches.length;

  let severity = 'INFO';
  let finding;
  if (contextPct >= 70) {
    severity = 'WARN';
    finding = `Context at ${contextPct}% before this turn; high risk of crossing auto-compact threshold mid-task.`;
  } else if (contextPct >= 55 && fileCount > 2) {
    severity = 'WARN';
    finding = `Context at ${contextPct}% + ${fileCount} file paths in prompt; scope likely pushes past 70%.`;
  } else if (topLevels.size >= 4) {
    severity = 'WARN';
    finding = `Prompt scope spans ${topLevels.size} top-level areas (${[...topLevels].slice(0,4).join(', ')}); consider scoping down.`;
  } else if (filesWrittenCount >= 10 && fileCount > 0) {
    severity = 'INFO';
    finding = `Session has written ${filesWrittenCount} files already; cumulative drift risk elevated.`;
  } else {
    finding = `Forecast clean: ctx=${contextPct}% scope=${topLevels.size}-area session_writes=${filesWrittenCount}.`;
  }

  return {
    source: 'HERMES_FC',
    runtimeKind: 'native_function',
    severity,
    finding,
    confidence: 0.85, // native heuristic, deterministic inputs
  };
}

async function dispatchCassandra(prompt, plan, turnId) {
  // PATCH 035 — strategic-foresight scout.
  // Reads git log + EOT history + peer pulse-bus findings on this turn,
  // emits 1-line prediction of the failure mode most likely to bite.
  // Per DeepSeek dogfood advisory: wrap inputs in Promise.race with 2s
  // budget so git mid-commit cannot block the detached process.

  const SESSION_JOURNAL = path.join(REPO_ROOT, '.claude', 'projects',
    '-Users-marcelspatz-NUDIMMUD', 'memory', 'session-journal.md');

  const readWithTimeout = (fn, ms) => Promise.race([
    fn().catch(() => ''),
    new Promise((resolve) => setTimeout(() => resolve(''), ms)),
  ]);

  const gitLog = await readWithTimeout(
    () => execWithTimeout('git', ['log', '--oneline', '-5'], {}, 1800).then(r => r.stdout || ''),
    2000
  );
  const journalTail = await readWithTimeout(
    async () => {
      try {
        const raw = await fsp.readFile(SESSION_JOURNAL, 'utf8');
        return raw.split('\n').slice(-60).join('\n');
      } catch { return ''; }
    },
    2000
  );

  // Peer findings already on bus for this turn (DeepSeek, OpenClaw, Hermes_FC)
  const peers = pulseBus.findingsByTurn(turnId);
  const peerDigest = peers.map(p => `${p.source}:${p.severity}:${p.finding.slice(0, 80)}`).join(' | ');

  // Heuristic native fallback BEFORE the model call so we always have a finding.
  let nativeForesight = null;
  const promptLower = String(prompt).toLowerCase();
  const recentMemoryDb = /memory\.db/.test(gitLog) && /memory\.db|kernel|canonical/.test(promptLower);
  const recentProtocolChurn = (gitLog.match(/protocol|routing|offload-contract|hooks\//gi) || []).length >= 2 &&
                              /protocol|routing|hooks|offload/i.test(prompt);
  const recentRollback = /revert|rollback|fix.*regression/i.test(gitLog);

  if (recentMemoryDb) {
    nativeForesight = { severity: 'HIGH', finding: 'Recent memory.db touch in last 5 commits + this prompt re-enters canonical surface; verify promotion gate before mutation.' };
  } else if (recentProtocolChurn) {
    nativeForesight = { severity: 'WARN', finding: `Last commits show ${(gitLog.match(/protocol|routing|offload-contract|hooks\//gi) || []).length}+ protocol/routing changes; cumulative drift risk elevated — run offload-contract regression before commit.` };
  } else if (recentRollback) {
    nativeForesight = { severity: 'WARN', finding: 'Recent rollback/revert in git log — current campaign overlaps the unstable area; preserve rollback boundary.' };
  } else {
    nativeForesight = { severity: 'INFO', finding: 'No historical risk patterns detected in last 5 commits or recent EOT journal.' };
  }

  // Try model upgrade (DeepSeek flash, bounded 25s) — if it succeeds, replace native finding.
  // Native finding is the floor; model is the lift.
  try {
    const cassPrompt = `CASSANDRA strategic foresight. Prompt: "${String(prompt).slice(0, 180)}".
Recent commits:
${gitLog.slice(0, 600)}
Peer cortex findings this turn:
${peerDigest.slice(0, 400) || '(none)'}
Output ONE line predicting the highest-probability failure mode for this turn. Format: SEVERITY:WARN|HIGH|CRITICAL :: <prediction>. Be concrete.`;
    const result = await execWithTimeout(
      'bash',
      [OFFLOAD_SH, '@deepseek-v4-flash', '--no-tools', cassPrompt],
      {},
      25_000
    );
    if (result.code === 0 && !result.timedOut && result.stdout) {
      const line = result.stdout.split('\n').map(s => s.trim()).filter(Boolean).pop() || '';
      const m = line.match(/SEVERITY[:=]\s*(INFO|WARN|HIGH|CRITICAL)\s*::?\s*(.+)/i);
      if (m) {
        nativeForesight = { severity: m[1].toUpperCase(), finding: m[2].slice(0, 380) };
      } else if (line.length > 10) {
        nativeForesight = { severity: nativeForesight.severity, finding: line.slice(0, 380) };
      }
    }
  } catch (e) {
    logError(`Cassandra model upgrade failed: ${e.message}`);
    // Keep native foresight as fallback
  }

  return {
    source: 'CASSANDRA',
    runtimeKind: nativeForesight ? 'native_function' : 'model_advisor',
    severity: nativeForesight.severity,
    finding: nativeForesight.finding,
    confidence: 0.7,
  };
}

async function dispatchSwarmFanout(prompt, plan, turnId) {
  // PATCH 040 — native two-model DeepSeek fan-out replacing Ruflo @swarm backend call.
  // Runs deepseek-v4-flash + deepseek-v4-pro in parallel; merges findings.
  // No external service dependency — eliminates the port-3004 hard fail.
  const swarmPrompt = `PULSE_SWARM (turn=${turnId}) tier=${plan.complexityTier} scenario=${plan.scenario}
${String(prompt).slice(0, 300)}
TASK: Independent strategic risk scan. What could go wrong that the primary analysis missed? 1-3 lines.`;

  const [flashResult, proResult] = await Promise.allSettled([
    execWithTimeout('bash', [OFFLOAD_SH, '-m', 'deepseek-v4-flash', '--no-tools', swarmPrompt], {}, TIMEOUT_DEEPSEEK_MS),
    execWithTimeout('bash', [OFFLOAD_SH, '-m', 'deepseek-v4-pro',   '--no-tools', swarmPrompt], {}, TIMEOUT_DEEPSEEK_MS),
  ]);

  const outputs = [];
  for (const [label, r] of [['flash', flashResult], ['pro', proResult]]) {
    if (r.status === 'fulfilled' && r.value.code === 0 && !r.value.timedOut && r.value.stdout.trim()) {
      outputs.push(r.value.stdout.trim());
    } else {
      const err = r.status === 'rejected' ? r.reason?.message : `code=${r.value?.code}`;
      logError(`@swarm ${label} failed: ${err}`);
    }
  }

  if (outputs.length === 0) return null;

  // Merge: use highest-severity finding across both outputs
  const candidates = outputs.map(parseAdvisorOutput);
  const severityRank = { CRITICAL: 4, HIGH: 3, WARN: 2, INFO: 1 };
  candidates.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
  const best = candidates[0];

  return { source: 'SWARM', runtimeKind: 'swarm_dispatch', ...best };
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
    // PATCH 033 — explicit OpenClaw quarantine: force bridge_advisory tagging
    // and cap severity at HIGH (never CRITICAL) so OpenClaw advisories cannot
    // auto-trigger downstream critical-tier escalation by themselves. Codex
    // and main thread are the final authority.
    if (f.source === 'OPENCLAW') {
      f.runtimeKind = 'bridge_advisory';
      if (f.severity === 'CRITICAL') f.severity = 'HIGH';
      f.finding = `[bridge_advisory] ${f.finding}`;
    }
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

  // PATCH 037 — Pulse Beacon: emit outward sinks for critical findings.
  // Detached spawn so beacon failures (osascript, vault path missing) never
  // block the orchestrator's clean exit. Beacon honors plan.beaconLevel.
  if (plan.beaconLevel && plan.beaconLevel !== 'none') {
    try {
      const beaconScript = path.join(REPO_ROOT, 'Scripts', 'pulse-beacon.mjs');
      const beacon = spawn('node', [beaconScript, 'emit'], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: 'ignore',
      });
      beacon.unref();
    } catch (e) {
      logError(`beacon spawn failed: ${e.message}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  logError(`orchestrator fatal: ${e.message}`);
  process.exit(0);
});
