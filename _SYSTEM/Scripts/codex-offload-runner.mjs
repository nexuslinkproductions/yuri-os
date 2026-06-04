#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimateTokensFromText, hashPayload, recordTokenEvent } from './token-ledger.mjs';

// ─── Model tiers ────────────────────────────────────────────────────────────
// sandbox:       codex --sandbox value (read-only | workspace-write | danger-full-access)
// defaultReason: applied when caller passes no --reasoning flag
// ignoreRules:   whether to pass --ignore-rules (false = allow project .rules for max features)

const MODEL_CONFIG = {
  'gpt-5.3-codex-spark': {
    sandbox: 'read-only',
    defaultReasoning: null,
    ignoreRules: true,
    label: 'codex-spark',
  },
  'gpt-5.4-mini': {
    sandbox: 'workspace-write',
    defaultReasoning: 'high',
    ignoreRules: true,
    label: 'gpt-5.4-mini',
  },
  'gpt-5.5': {
    sandbox: 'workspace-write',
    defaultReasoning: 'high',   // caller can escalate to xhigh → maps to 'max'
    ignoreRules: false,          // allow project rules — maximum features
    label: 'gpt-5.5',
  },
};

// Alias → canonical model ID
const ALIAS_MAP = new Map([
  // spark tier (gpt-5.3-codex-spark — bounded, read-only, no reasoning hint)
  ['codex-spark',        'gpt-5.3-codex-spark'],
  ['spark',              'gpt-5.3-codex-spark'],
  ['fast-codex',         'gpt-5.3-codex-spark'],
  ['gpt-5.3-codex-spark','gpt-5.3-codex-spark'],
  ['gpt-5.3-codex',     'gpt-5.3-codex-spark'],
  // mini tier (gpt-5.4-mini — workspace-write, high reasoning default)
  ['gpt-5.4-mini',      'gpt-5.4-mini'],
  ['gpt-5.4',           'gpt-5.4-mini'],
  ['codex-mini',        'gpt-5.4-mini'],
  // full tier (gpt-5.5 — workspace-write, high→xhigh reasoning, project rules enabled)
  ['gpt-5.5',           'gpt-5.5'],
  ['codex',             'gpt-5.5'],
  ['codex-high',        'gpt-5.5'],
  ['codex-full',        'gpt-5.5'],
]);

const DEFAULT_MODEL_ID    = 'gpt-5.3-codex-spark';
const SMOKE_PROMPT        = 'Reply exactly CODEX_SPARK_SMOKE_OK and do not inspect files.';
const SPARK_READY_MARKER  = 'CODEX_SPARK_LANE_READY';
const SKIP_RE             = /(?:rate limit|rate-limited|queued|unavailable|temporarily unavailable|capacity|retry later|busy)/i;
const DEFAULT_TIMEOUT_MS  = 6 * 60 * 60 * 1000;

const scriptDir  = path.dirname(fileURLToPath(import.meta.url));
const repoRoot   = path.resolve(scriptDir, '..');
const argv       = process.argv.slice(2);
const options    = parseArgs(argv);
const envPrompt  = (process.env.OFFLOAD_PROMPT_TEXT || '').trim();
const prompt     = options.prompt || envPrompt || (options.smoke || options.proveRoute ? SMOKE_PROMPT : '');
const traceId    = process.env.TOKEN_LEDGER_TRACE_ID || process.env.OFFLOAD_TASK_ID || `codex-${options.modelId}-${Date.now()}-${process.pid}`;

if (options.dryRun) {
  const artifactDir = prepareArtifactDir(options.artifactDir);
  const preview = buildPreview({ options, prompt, artifactDir });
  writeArtifact(artifactDir, 'dry-run.json', preview);
  emitStatus(preview);
  process.exit(0);
}

if (!prompt) {
  emitStatus({ lane: options.modelConfig.label, model: options.modelId, status: 'BLOCKED_MISSING_PROMPT', reason: 'Missing prompt.' });
  process.exit(1);
}

const artifactDir = prepareArtifactDir(options.artifactDir);
const run = await runCodex({ options, prompt, artifactDir, traceId });

if (run.status === 'SKIPPED_OR_RATE_LIMITED') { emitStatus(run.summary); process.exit(0); }
if (run.status === 'FAILED')                  { emitStatus(run.summary); process.exit(1); }

if (options.smoke) {
  const smokeOk = run.output.trim() === 'CODEX_SPARK_SMOKE_OK';
  const summary = { ...run.summary, status: smokeOk ? 'SMOKE_OK' : 'SMOKE_MISMATCH', expected: 'CODEX_SPARK_SMOKE_OK', observed: run.output.trim() };
  writeArtifact(artifactDir, 'smoke.json', summary);
  emitStatus(summary);
  if (smokeOk) { process.stdout.write('CODEX_SPARK_SMOKE_OK\n'); process.exit(0); }
  process.exit(1);
}

if (options.proveRoute) {
  const smokeRun = await runCodex({ options, prompt: SMOKE_PROMPT, artifactDir, traceId });
  if (smokeRun.status === 'SKIPPED_OR_RATE_LIMITED') { emitStatus(smokeRun.summary); process.exit(0); }
  if (smokeRun.status === 'FAILED')                  { emitStatus(smokeRun.summary); process.exit(1); }
  const smokeOk = smokeRun.output.trim() === 'CODEX_SPARK_SMOKE_OK';
  const summary = {
    lane: options.modelConfig.label, model: options.modelId,
    status: smokeOk ? 'CODEX_SPARK_LANE_READY' : 'SMOKE_MISMATCH',
    routeMarker: smokeOk ? SPARK_READY_MARKER : '',
    artifactDir,
    dryRun: buildPreview({ options, prompt, artifactDir }),
    smoke: { status: smokeOk ? 'SMOKE_OK' : 'SMOKE_MISMATCH', expected: 'CODEX_SPARK_SMOKE_OK', observed: smokeRun.output.trim() },
  };
  writeArtifact(artifactDir, 'prove-route.json', summary);
  emitStatus(summary);
  if (smokeOk) { process.stdout.write(`${SPARK_READY_MARKER}\n`); process.exit(0); }
  process.exit(1);
}

writeArtifact(artifactDir, 'run.json', run.summary);
process.stdout.write(run.output + (run.output.endsWith('\n') ? '' : '\n'));
process.exit(0);

// ─── parseArgs ───────────────────────────────────────────────────────────────
function parseArgs(rest) {
  const out = {
    modelId:       DEFAULT_MODEL_ID,
    modelConfig:   MODEL_CONFIG[DEFAULT_MODEL_ID],
    reasoningArg:  null,      // caller-supplied depth (pre-map)
    reasoningEffort: null,    // mapped codex effort level
    dryRun:        false,
    smoke:         false,
    proveRoute:    false,
    sandboxOverride: null,    // --sandbox override (DRAFT read-only = the gate-on-the-gate)
    promptParts:   [],
    artifactDir:   '',
    workspaceRoot: process.env.CODEX_TARGET_WORKTREE || process.env.CODEX_SPARK_WORKSPACE || repoRoot,
    timeoutMs:     parseInt(process.env.CODEX_SPARK_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
  };

  const args = [...rest];

  // First positional may be a model alias
  if (args[0] && !args[0].startsWith('-') && ALIAS_MAP.has(args[0].toLowerCase())) {
    out.modelId = ALIAS_MAP.get(args.shift().toLowerCase());
    out.modelConfig = MODEL_CONFIG[out.modelId];
  }

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--dry-run' || token === '--route-only') { out.dryRun = true; continue; }
    if (token === '--smoke')                               { out.smoke = true; continue; }
    if (token === '--prove-route')                         { out.proveRoute = true; continue; }
    if (token === '--model' && args[i + 1]) {
      const m = ALIAS_MAP.get(args[++i].toLowerCase()) || args[i];
      out.modelId     = m;
      out.modelConfig = MODEL_CONFIG[m] || MODEL_CONFIG[DEFAULT_MODEL_ID];
      continue;
    }
    if (token === '--reasoning' && args[i + 1]) {
      out.reasoningArg = args[++i];
      continue;
    }
    if (token === '--sandbox' && args[i + 1]) { out.sandboxOverride = args[++i]; continue; }
    if (token === '--artifact-dir' && args[i + 1]) { out.artifactDir  = args[++i]; continue; }
    if (token === '--cd'           && args[i + 1]) { out.workspaceRoot = path.resolve(args[++i]); continue; }
    if (token === '--timeout-ms'   && args[i + 1]) { out.timeoutMs    = parseInt(args[++i], 10); continue; }
    out.promptParts.push(token);
  }

  out.prompt = out.promptParts.join(' ').trim();

  // --sandbox override: validate against the codex enum and clone the model config (order-
  // independent vs --model, which resets modelConfig). DRAFT lanes pass read-only.
  if (out.sandboxOverride) {
    const allowedSandbox = new Set(['read-only', 'workspace-write', 'danger-full-access']);
    if (allowedSandbox.has(out.sandboxOverride)) out.modelConfig = { ...out.modelConfig, sandbox: out.sandboxOverride };
    else process.stderr.write(`[runner] ignoring invalid --sandbox '${out.sandboxOverride}'\n`);
  }

  // Resolve reasoning: caller arg → model default → null
  const rawDepth = out.reasoningArg || out.modelConfig.defaultReasoning;
  out.reasoningEffort = mapReasoningEffort(rawDepth);

  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = DEFAULT_TIMEOUT_MS;
  out.workspaceRoot = path.resolve(out.workspaceRoot || repoRoot);
  return out;
}

// ─── Reasoning effort mapping ────────────────────────────────────────────────
// offload.sh --reasoning values → codex -c reasoning_effort= values
function mapReasoningEffort(depth) {
  if (!depth) return null;
  const d = String(depth).toLowerCase();
  if (['xhigh', 'max', 'maximum', 'ultra', 'extra-high'].includes(d)) return 'max';
  if (['high', 'thinking', 'deep'].includes(d))                        return 'high';
  if (['medium'].includes(d))                                           return 'medium';
  if (['low'].includes(d))                                              return 'low';
  return null;
}

// ─── Command builder ─────────────────────────────────────────────────────────
function buildCodexArgs({ modelId, config, reasoningEffort, prompt, artifactDir, workspaceRoot }) {
  const lastMessagePath = path.join(artifactDir, 'last-message.txt');
  const args = [
    'exec',
    '--model',    modelId,
    '--sandbox',  config.sandbox,
    '--full-auto',            // non-TTY: never wait for interactive write approval
    '--ephemeral',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '--cd',       workspaceRoot,
    '--output-last-message', lastMessagePath,
  ];
  if (config.ignoreRules)   args.push('--ignore-rules');
  if (reasoningEffort)      args.push('-c', `reasoning_effort=${reasoningEffort}`);
  args.push(prompt);
  return args;
}

// ─── buildPreview ────────────────────────────────────────────────────────────
function buildPreview({ options, prompt, artifactDir }) {
  const { modelId, modelConfig, reasoningEffort, workspaceRoot, timeoutMs } = options;
  const args = buildCodexArgs({ modelId, config: modelConfig, reasoningEffort, prompt: prompt || SMOKE_PROMPT, artifactDir, workspaceRoot });
  return {
    lane:          modelConfig.label,
    model:         modelId,
    sandbox:       modelConfig.sandbox,
    reasoningEffort: reasoningEffort || null,
    status:        'DRY_RUN',
    routeMarker:   '',
    artifactDir,
    workspaceRoot,
    timeoutMs,
    env_redirects: sandboxEnvRedirects(process.env),
    command:       ['codex', ...args],
    prompt,
  };
}

// ─── runCodex ────────────────────────────────────────────────────────────────
async function runCodex({ options, prompt, artifactDir, traceId }) {
  const { modelId, modelConfig, reasoningEffort, workspaceRoot, timeoutMs } = options;

  if (!workspaceRoot || !path.isAbsolute(workspaceRoot) || !readableDirectory(workspaceRoot)) {
    return { status: 'FAILED', output: '', summary: { lane: modelConfig.label, model: modelId, status: 'FAILED', reason: `Workspace root unavailable: ${workspaceRoot || 'missing'}`, artifactDir } };
  }

  const startedAt        = Date.now();
  const lastMessagePath  = path.join(artifactDir, 'last-message.txt');
  const codexArgs        = buildCodexArgs({ modelId, config: modelConfig, reasoningEffort, prompt, artifactDir, workspaceRoot });

  const invocation = {
    lane:            modelConfig.label,
    model:           modelId,
    sandbox:         modelConfig.sandbox,
    reasoningEffort: reasoningEffort || null,
    prompt, cwd: workspaceRoot, artifactDir,
    env_redirects:   sandboxEnvRedirects(process.env),
    command:         ['codex', ...codexArgs],
  };
  writeArtifact(artifactDir, 'invocation.json', invocation);

  const codexBin = '/opt/homebrew/bin/codex';
  const spawnEnv = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
  };
  const child = spawn(codexBin, codexArgs, { cwd: workspaceRoot, env: spawnEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
  }, timeoutMs);

  const outcome = await new Promise((resolve) => {
    child.on('error',  (error)            => { clearTimeout(timer); resolve({ exitCode: null, signal: null, error, stdout, stderr }); });
    child.on('close',  (exitCode, signal)  => { clearTimeout(timer); resolve({ exitCode, signal, error: null, stdout, stderr }); });
  });

  writeArtifact(artifactDir, 'stdout.log', outcome.stdout);
  writeArtifact(artifactDir, 'stderr.log', outcome.stderr);

  if (outcome.error?.code === 'ENOENT') {
    await recordCodexLedger({ traceId, modelId, modelConfig, prompt, output: '', status: 'skipped', startedAt, artifactDir, metadata: { reason: 'Codex binary unavailable.' } });
    return { status: 'SKIPPED_OR_RATE_LIMITED', output: '', summary: { lane: modelConfig.label, model: modelId, status: 'SKIPPED_OR_RATE_LIMITED', reason: 'Codex binary unavailable.', artifactDir } };
  }

  const lastMessage = readMaybe(lastMessagePath);
  const outputText  = [outcome.stdout, outcome.stderr, outcome.error?.message || ''].filter(Boolean).join('\n');
  const output      = lastMessage || outcome.stdout || '';
  const combined    = [output, outputText].filter(Boolean).join('\n');

  // Only apply SKIP_RE when lastMessage is empty — prevents false positives from
  // injected context (YURI_CONTEXT blocks) containing words like "unavailable".
  if (timedOut || (!lastMessage && SKIP_RE.test(combined))) {
    const reason = timedOut ? `Timed out waiting for ${modelId}.` : classifySkipReason(combined);
    await recordCodexLedger({ traceId, modelId, modelConfig, prompt, output, status: 'skipped', startedAt, artifactDir, metadata: { reason, exit_code: outcome.exitCode, signal: outcome.signal, timed_out: timedOut } });
    return { status: 'SKIPPED_OR_RATE_LIMITED', output, summary: { lane: modelConfig.label, model: modelId, status: 'SKIPPED_OR_RATE_LIMITED', reason, exitCode: outcome.exitCode, signal: outcome.signal, timedOut, artifactDir } };
  }

  if (outcome.exitCode !== 0) {
    const reason = outcome.error?.message || `Codex exited with code ${outcome.exitCode}.`;
    await recordCodexLedger({ traceId, modelId, modelConfig, prompt, output, status: 'error', startedAt, artifactDir, metadata: { reason_hash: hashPayload(reason), exit_code: outcome.exitCode, signal: outcome.signal } });
    return { status: 'FAILED', output, summary: { lane: modelConfig.label, model: modelId, status: 'FAILED', reason, exitCode: outcome.exitCode, signal: outcome.signal, artifactDir } };
  }

  if (!lastMessage && !SKIP_RE.test(outputText)) {
    process.stderr.write('[codex] empty response — check quota or task spec\n');
    process.exit(1);
  }

  await recordCodexLedger({ traceId, modelId, modelConfig, prompt, output, status: 'ok', startedAt, artifactDir, metadata: { exit_code: outcome.exitCode, signal: outcome.signal } });
  return { status: 'OK', output, summary: { lane: modelConfig.label, model: modelId, sandbox: modelConfig.sandbox, status: 'OK', exitCode: outcome.exitCode, signal: outcome.signal, artifactDir } };
}

// ─── Ledger ───────────────────────────────────────────────────────────────────
async function recordCodexLedger({ traceId, modelId, modelConfig, prompt, output, status, startedAt, artifactDir, metadata = {} }) {
  await recordTokenEvent({
    trace_id:         traceId,
    source_path:      '_SYSTEM/Scripts/codex-offload-runner.mjs',
    lane:             modelConfig.label,
    provider:         'codex-cli',
    request_model:    modelId,
    response_model:   modelId,
    operation_type:   'codex_offload',
    status,
    measurement_type: 'estimated_bytes',
    input_tokens:     estimateTokensFromText(prompt),
    output_tokens:    estimateTokensFromText(output),
    accuracy_class:   'estimate_chars_div_4_pm25',
    estimator_version:'chars_div_4_v1',
    latency_ms:       Date.now() - startedAt,
    payload_hash:     hashPayload({ prompt, model: modelId }),
    metadata: { prompt_chars: prompt.length, output_chars: output.length, artifact_dir_hash: hashPayload(artifactDir), ...metadata },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function prepareArtifactDir(overrideDir) {
  const base = overrideDir || mkdtempSync(path.join(os.tmpdir(), 'yuri-codex-'));
  mkdirSync(base, { recursive: true });
  return path.resolve(base);
}

function readableDirectory(dirPath) {
  try { return statSync(dirPath).isDirectory(); } catch { return false; }
}

function readMaybe(filePath) {
  try { return readFileSync(filePath, 'utf8').trim(); } catch { return ''; }
}

function sandboxEnvRedirects(env) {
  const r = {};
  if (env.YURI_DB_PATH) r.YURI_DB_PATH = env.YURI_DB_PATH;
  return r;
}

function classifySkipReason(text) {
  if (/queued/i.test(text))           return 'Codex queued.';
  if (/rate limit|rate-limited/i.test(text)) return 'Codex rate-limited.';
  if (/unavailable/i.test(text))      return 'Codex unavailable.';
  return 'Codex unavailable or rate-limited.';
}

function writeArtifact(dir, name, data) {
  writeFileSync(path.join(dir, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
}

function emitStatus(data) {
  process.stderr.write(`${JSON.stringify(data, null, 2)}\n`);
}
