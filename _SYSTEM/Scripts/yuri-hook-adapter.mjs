#!/usr/bin/env node
// @capability: yuri-universal-hook-adapter
// @serves: universal hook adapter | PreToolUse | Claude hooks | Codex hooks | OMP hooks | UserPromptSubmit timeout | hook exit 1 prevention
// @does: Normalizes Claude, Codex, and OMP pre-tool events onto the canonical YURI safety and URL policies, renders harness-native deny output, and fail-soft wraps October prompt-context delivery.
// @use: Provider projections call this file through a root-anchored absolute command; use --check for deterministic fixtures and --delegate-october pre-prompt for the bounded external prompt bridge.
// @exports: buildDelegateEnvironment, normalizePreToolEvent, evaluateUniversalPreTool, renderHookDecision, runExternalDelegate, runCli

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateToolCall } from './policy/yuri-safety-core.mjs';
import { scanCommand } from './url-policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SUPPORTED_HARNESSES = new Set(['claude', 'codex', 'omp']);
const SHELL_TOOLS = new Set(['bash', 'shell', 'exec_command', 'execcommand', 'terminal']);
const DELEGATE_ENV_KEYS = [
  'HOME',
  'LANG',
  'LC_ALL',
  'OCTOBER_BUS_CANVAS',
  'OCTOBER_BUS_NODE',
  'OCTOBER_BUS_PORT',
  'PATH',
  'TMPDIR',
];

export function buildDelegateEnvironment(source = process.env) {
  return Object.fromEntries(
    DELEGATE_ENV_KEYS
      .filter((key) => typeof source[key] === 'string' && source[key])
      .map((key) => [key, source[key]]),
  );
}

function normalizeToolName(value) {
  return String(value ?? '')
    .split('.')
    .pop()
    .replace(/[^a-z0-9_-]/giu, '')
    .toLowerCase();
}

export function normalizePreToolEvent(event = {}, harness = 'codex') {
  const normalizedHarness = String(harness).toLowerCase();
  if (!SUPPORTED_HARNESSES.has(normalizedHarness)) throw new Error(`unsupported hook harness: ${harness}`);
  if (normalizedHarness === 'omp') {
    return {
      harness: normalizedHarness,
      hookEventName: 'PreToolUse',
      toolName: event.toolName ?? event.tool_name ?? event.name ?? '',
      toolInput: event.input ?? event.toolInput ?? event.tool_input ?? {},
      cwd: event.cwd ?? event.input?.cwd ?? event.input?.workdir,
    };
  }
  return {
    harness: normalizedHarness,
    hookEventName: event.hook_event_name ?? event.hookEventName ?? 'PreToolUse',
    toolName: event.tool_name ?? event.toolName ?? event.name ?? event.tool ?? '',
    toolInput: event.tool_input ?? event.toolInput ?? event.input ?? event.arguments ?? {},
    cwd: event.cwd ?? event.tool_input?.cwd ?? event.toolInput?.cwd,
  };
}

export function evaluateUniversalPreTool(event = {}, { harness = 'codex' } = {}) {
  let normalized;
  try {
    normalized = normalizePreToolEvent(event, harness);
    const safety = evaluateToolCall(normalized.toolName, normalized.toolInput, { cwd: normalized.cwd });
    if (!safety?.allowed) return safety;

    const tool = normalizeToolName(normalized.toolName);
    const command = normalized.toolInput?.command ?? normalized.toolInput?.cmd ?? '';
    if (SHELL_TOOLS.has(tool) && typeof command === 'string' && command) {
      const blocked = scanCommand(command);
      if (blocked) return { allowed: false, decision: 'deny', reason: blocked.reason };
    }
    return { allowed: true, decision: 'allow' };
  } catch (error) {
    return { allowed: false, decision: 'deny', reason: `YURI hook evaluator error: ${String(error?.message ?? error)}` };
  }
}

export function renderHookDecision(harness, decision) {
  if (decision?.allowed) return null;
  const reason = String(decision?.reason || 'YURI policy denied the tool call');
  if (String(harness).toLowerCase() === 'omp') return { block: true, reason };
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function readStdin(stream = process.stdin) {
  return new Promise((resolve) => {
    let raw = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => { raw += chunk; });
    stream.on('end', () => resolve(raw));
  });
}

export function runExternalDelegate({
  script,
  mode,
  input = '',
  timeoutMs = 1800,
  spawnImpl = spawn,
} = {}) {
  return new Promise((resolve) => {
    if (!script || !existsSync(script)) {
      resolve({ ok: false, timedOut: false, stdout: '', reason: 'delegate absent' });
      return;
    }

    let settled = false;
    let stdout = '';
    let timer;
    let terminationTimer;
    const finish = (result, { keepTerminationTimer = false } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!keepTerminationTimer) clearTimeout(terminationTimer);
      resolve(result);
    };

    let child;
    try {
      child = spawnImpl(process.execPath, [script, mode], {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'ignore'],
        env: buildDelegateEnvironment(),
      });
    } catch (error) {
      finish({ ok: false, timedOut: false, stdout: '', reason: String(error?.message ?? error) });
      return;
    }

    timer = setTimeout(() => {
      child.kill('SIGTERM');
      terminationTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      terminationTimer.unref?.();
      finish(
        { ok: false, timedOut: true, stdout: '', reason: 'delegate deadline exceeded' },
        { keepTerminationTimer: true },
      );
    }, Math.max(1, Number(timeoutMs) || 1800));
    timer.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.on('error', (error) => finish({ ok: false, timedOut: false, stdout: '', reason: String(error?.message ?? error) }));
    child.on('close', (code, signal) => finish({
      ok: code === 0,
      timedOut: false,
      stdout: code === 0 ? stdout : '',
      reason: code === 0 ? '' : `delegate ended code=${code ?? 'null'} signal=${signal ?? 'none'}`,
    }));
    child.stdin?.end(String(input));
  });
}

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1] ?? fallback;
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdin = io.stdin ?? process.stdin;
  const stdout = io.stdout ?? process.stdout;
  const raw = await readStdin(stdin);
  const delegateMode = option(argv, '--delegate-october');
  if (delegateMode) {
    const result = await runExternalDelegate({
      script: io.delegateScript || process.env.OCTOBER_BUS_HOOK_PATH || path.join(os.homedir(), '.october', 'bus-hook.mjs'),
      mode: delegateMode,
      input: raw,
      timeoutMs: Number(option(argv, '--timeout-ms', '1800')),
      spawnImpl: io.spawnImpl || spawn,
    });
    if (result.ok && result.stdout) stdout.write(result.stdout);
    return 0; // telemetry/context delegation is always fail-soft
  }

  const harness = String(option(argv, '--harness', 'codex')).toLowerCase();
  const eventName = option(argv, '--event', 'PreToolUse');
  let event;
  let decision;
  try {
    event = raw.trim() ? JSON.parse(raw) : {};
    if (eventName !== 'PreToolUse') throw new Error(`unsupported enforcement event: ${eventName}`);
    decision = evaluateUniversalPreTool(event, { harness });
  } catch (error) {
    decision = { allowed: false, decision: 'deny', reason: `invalid hook input: ${String(error?.message ?? error)}` };
  }
  const output = renderHookDecision(harness, decision);
  if (output) stdout.write(`${JSON.stringify(output)}\n`);
  return argv.includes('--check') && !decision.allowed ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 0; });
}
