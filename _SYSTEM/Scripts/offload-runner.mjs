#!/usr/bin/env node

import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { execFileSync, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateToolCall } from './policy/yuri-safety-core.mjs';
import { DEAD_NIM_LANES, isProtectedPath, safeRuntimePath } from './lane-kernel.mjs';
import {
  enforceOutputRails,
  evaluateInputRails,
  evaluateToolInputRails,
  writeRailViolation,
} from './rails.mjs';
import {
  canonicalLaneForModel,
  clearCrashes,
  isQuarantined,
  normalizeLaneId,
  recordCrash,
  recordEscalation,
  selectFallbackLane,
} from './kagami-overseer.mjs';
import { appendMemoryEntry } from './memory-kernel.mjs';
import { YURI_RAILS_CONFIG } from '../kagami/yuri-rails-config.mjs';
import {
  estimateTokensFromText,
  hashPayload,
  normalizeProviderUsage,
  recordTokenEvent,
} from './token-ledger.mjs';
import {
  resolveOllamaAdditiveLane,
  runOllamaCloudChat,
  runOllamaLocalChat,
} from './ollama-adapter.mjs';
import {
  appendPulseTraceEvent,
  compactPulseSnapshot,
  resolvePulseTracePaths,
  writePulseTraceSnapshot,
} from './pulse-trace-ledger.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const writeScope = process.env.DEEPSEEK_WRITE_SCOPE ? new Set(process.env.DEEPSEEK_WRITE_SCOPE.split(':').map(p => resolveRepoPath(p))) : null;
const MODEL_POLICY_PATH = path.join(REPO_ROOT, '.claude/config/models.json');
const MODEL_POLICY = loadModelPolicy();
const LOCAL_MODEL_POLICY = MODEL_POLICY.local || {};
const LOCAL_PRIMARY_MODEL = LOCAL_MODEL_POLICY.primary || 'needle';
const LOCAL_UTILITY_MODEL = LOCAL_MODEL_POLICY.utility || 'needle';
const LOCAL_CODE_MODEL = LOCAL_MODEL_POLICY.code || 'qwen2.5-coder:7b';
const LOCAL_CODE_FALLBACK_MODEL = LOCAL_MODEL_POLICY.code_fallback || 'starcoder2:latest';
const LOCAL_DEEP_REASONING_MODEL = LOCAL_MODEL_POLICY.deep_reasoning || 'deepseek-r1:8b';
const LOCAL_MULTIMODAL_MODEL = LOCAL_MODEL_POLICY.multimodal || 'gemma4:e2b';
const LOCAL_FALLBACK_MODEL = LOCAL_MODEL_POLICY.fallback || 'llama3.2:latest';
const LOCAL_FROZEN_MODELS = LOCAL_MODEL_POLICY.frozen || LOCAL_MODEL_POLICY.manual_only || [];
const LOCAL_MANUAL_ONLY_MODELS = LOCAL_MODEL_POLICY.manual_only || LOCAL_FROZEN_MODELS;

function resolveRepoPath(inputPath = '') {
  const value = String(inputPath || '');
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(REPO_ROOT, value);
}

function isInsideRepoRoot(absPath) {
  const relative = path.relative(REPO_ROOT, absPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveToolCwd(cwd = '') {
  const resolved = cwd ? resolveRepoPath(cwd) : REPO_ROOT;
  if (!isInsideRepoRoot(resolved)) {
    throw new Error(`cwd outside repo root: ${cwd}`);
  }
  return resolved;
}

function envOrKeychain(...names) {
  for (const name of names) {
    const value = process.env[name] || '';
    if (value) return value;
    if (process.platform !== 'darwin') continue;
    try {
      const out = execFileSync('security', [
        'find-generic-password',
        '-a', process.env.USER || 'yuri',
        '-s', `${process.env.YURI_KEYCHAIN_SERVICE_PREFIX || 'YURI_OS_MUSUBI'}:${name}`,
        '-w',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) return out;
    } catch {}
  }
  return '';
}

const TOOL_REPETITION_SENTINEL = 'Reached tool call repetition limit; returning partial result.';
const DEFAULT_LONG_OFFLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const argv = process.argv.slice(2);

if (argv.includes('--inventory')) {
  const localModels = listLocalModels();
  console.log(JSON.stringify(buildInventory(localModels), null, 2));
  process.exit(0);
}

let lane = (argv.shift() || '').toLowerCase();
const options = parseArgs(argv);
const laneRequest = normalizeLaneRequest(lane, options.reasoning);
lane = laneRequest.lane;
options.reasoning = laneRequest.reasoning || options.reasoning;
const envPrompt = process.env.OFFLOAD_PROMPT_TEXT;
const prompt = envPrompt !== undefined ? envPrompt : options.prompt.trim();
const ledgerTraceId = process.env.TOKEN_LEDGER_TRACE_ID || process.env.OFFLOAD_TASK_ID || `offload-${Date.now()}-${process.pid}`;
const STREAM_OUTPUT = /^(1|true|yes|on)$/i.test(process.env.OFFLOAD_STREAM || '');

if (!lane) {
  console.error('Usage: offload-runner <lane|pulse> [--model <id>] [--system <prompt>] [--reasoning <low|medium|high|xhigh>] [--tools|--no-tools] [--dry-run] [--inventory] [--plan-json <json>] [--plan-file <path>] <prompt>');
  process.exit(1);
}

if (lane === 'pulse' || lane === 'symbiotic-pulse') {
  const result = await runPulsePlan(options, prompt, ledgerTraceId);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (!prompt && !options.dryRun) {
  console.error('Missing prompt.');
  process.exit(1);
}

if (!options.dryRun) {
  const inputRail = evaluateInputRails(prompt, { source: 'user', noexec: true });
  if (!inputRail.ok) {
    writeRailViolation(inputRail);
    console.error(`[input-rail] ${inputRail.reasons.join('; ')}`);
    process.exit(2);
  }
  if (inputRail.severity === 'warn' && inputRail.reasons.length) {
    process.stderr.write(`[input-rail] ${inputRail.reasons.join('; ')}\n`);
  }
}

const localModels = listLocalModels();
let resolved = resolveLane(lane, options.model, localModels, options.dryRun, options);
if (options.toolsExplicit) {
  resolved.tools = options.tools;
}

if (options.dryRun) {
  const out = { lane, ...resolved };
  if (out.apiKey) out.apiKey = '[set]';
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (
  resolved.status === 'SKIPPED_MISSING_ENDPOINT' ||
  resolved.status === 'SKIPPED_MISSING_KEY' ||
  resolved.status === 'BLOCKED_PAID_MODEL' ||
  resolved.status === 'BLOCKED_FROZEN_MODEL' ||
  resolved.kind === 'blocked'
) {
  console.error(`[${lane}] ${resolved.status}: ${resolved.error}`);
  process.exit(0);
}

const quarantineSubstitution = maybeSubstituteQuarantinedLane(lane, resolved, options, localModels);
if (quarantineSubstitution.substituted) {
  process.stderr.write(`[kagami] quarantined ${quarantineSubstitution.from}; substituting ${quarantineSubstitution.to}\n`);
  lane = quarantineSubstitution.to;
  resolved = quarantineSubstitution.resolved;
}

if (resolved.kind === 'local') {
  const result = await runLocalChat(resolved.model, prompt, options.system, { lane, traceId: ledgerTraceId });
  process.exit(emitAndRecordResult(result, 0, options.outputFile));
}

if (resolved.protocol === 'ollama-native') {
  const result = await runOllamaCloudChat(resolved.endpoint, resolved.apiKey, resolved.model, prompt, options.system, { lane, traceId: ledgerTraceId });
  process.exit(emitAndRecordResult(result, 0, options.outputFile));
}

if (resolved.protocol === 'responses') {
  const result = await runOpenAIResponses(resolved.endpoint, resolved.apiKey, resolved.model, prompt, options.system, {
    maxTokens: resolved.maxTokens,
    reasoningEffort: resolved.reasoningEffort,
    timeout: resolved.timeout,
    lane,
    traceId: ledgerTraceId,
    streamOutput: STREAM_OUTPUT,
    streamWriter: (chunk) => process.stdout.write(chunk),
    streamStatusWriter: (line) => process.stderr.write(line),
  });
  process.exit(emitAndRecordResult(result, 0, options.outputFile));
}

const result = await runCloudChatWithFallback(resolved, prompt, options, {
  lane,
  traceId: ledgerTraceId,
  streamOutput: STREAM_OUTPUT,
  streamWriter: (chunk) => process.stdout.write(chunk),
  streamStatusWriter: (line) => process.stderr.write(line),
});
process.exit(emitAndRecordResult(result, 0, options.outputFile));

function resultText(result) {
  if (typeof result === 'string') return result;
  return String(result?.text ?? '');
}

function resultWasStreamed(result) {
  return Boolean(result && typeof result === 'object' && result.streamed);
}

function emitResult(result) {
  const text = resultText(result);
  const enforced = enforceOutputRails(text, {
    requireEvidence: YURI_RAILS_CONFIG.output.evidenceRequiredForRepoClaims,
    maxOutputChars: YURI_RAILS_CONFIG.output.maxChars,
    ...outputRailContextFromEnv(),
  });
  if (!enforced.ok) {
    writeRailViolation(enforced);
    process.stderr.write(`[output-rail] blocked: ${enforced.reasons.join('; ')}\n`);
    return enforced;
  }
  if (resultWasStreamed(result)) {
    maybeAppendOffloadMemory(enforced.text, enforced);
    if (text && !text.endsWith('\n')) process.stdout.write('\n');
    return enforced;
  }
  if (enforced.severity === 'warn' && enforced.reasons.length) {
    process.stderr.write(`[output-rail] ${enforced.reasons.join('; ')}\n`);
  }
  maybeAppendOffloadMemory(enforced.text, enforced);
  process.stdout.write(enforced.text + (enforced.text.endsWith('\n') ? '' : '\n'));
  return enforced;
}

function emitAndRecordResult(result, exitCode = 0, outputFile = '') {
  const outputRail = emitResult(result);
  let finalExitCode = outputRail?.ok === false ? 2 : exitCode;
  let outputRecord = outputRail;
  if (outputRail?.ok !== false && outputFile) {
    const writeResult = writeAcceptedOutputFile(outputFile, outputRail.text);
    if (writeResult.ok === false) {
      finalExitCode = 2;
      outputRecord = {
        ...outputRail,
        ok: false,
        severity: 'block',
        reasons: [...(outputRail?.reasons || []), ...(writeResult.violation?.reasons || [])],
        evidence: {
          ...(outputRail?.evidence || {}),
          outputFile: writeResult.violation?.evidence || { path: outputFile },
        },
      };
    }
  }
  recordLaneOutputEvidence(result, finalExitCode, outputRecord);
  return finalExitCode;
}

function writeAcceptedOutputFile(outputFile, text) {
  const resolved = path.resolve(outputFile);
  if (isProtectedPath(resolved)) {
    const violation = {
      ok: false,
      rail: 'output-file',
      severity: 'block',
      reasons: [`protected output file denied: ${outputFile}`],
      evidence: { path: resolved },
    };
    writeRailViolation(violation);
    process.stderr.write(`[output-rail] blocked output file: protected output file denied: ${outputFile}\n`);
    return { ok: false, violation };
  }
  try {
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, text, 'utf-8');
    return { ok: true, path: resolved };
  } catch (e) {
    process.stderr.write(`[offload-runner] --output-file write failed: ${e.message}\n`);
    return {
      ok: false,
      violation: {
        ok: false,
        rail: 'output-file',
        severity: 'block',
        reasons: [`output file write failed: ${e.message}`],
        evidence: { path: resolved },
      },
    };
  }
}

function outputRailContextFromEnv() {
  const requiredEvidenceIds = parseEnvList('YURI_OUTPUT_REQUIRED_EVIDENCE_IDS');
  const evidenceSourceIds = parseEnvList('YURI_OUTPUT_EVIDENCE_IDS');
  return {
    requiredEvidenceIds,
    evidenceSources: evidenceSourceIds.map((id) => ({ id })),
    evidence: evidenceSourceIds.length > 0 ? { sourceIds: evidenceSourceIds } : undefined,
  };
}

function parseEnvList(name) {
  return String(process.env[name] || '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function maybeAppendOffloadMemory(text, outputRail) {
  if (!/^(1|true|yes|on)$/i.test(process.env.YURI_OFFLOAD_MEMORY_LEDGER || '')) return;
  const result = appendMemoryEntry({
    originLane: lane,
    type: 'evidence',
    scope: 'session',
    content: String(text || '').slice(0, 16_000),
    metadata: {
      traceId: ledgerTraceId,
      outputRail: {
        severity: outputRail?.severity || 'allow',
        reasons: outputRail?.reasons || [],
      },
    },
  });
  if (!result.ok) process.stderr.write(`[memory-ledger] ${result.error}\n`);
  for (const warning of result.warnings || []) process.stderr.write(`[memory-ledger] ${warning}\n`);
}

function recordLaneOutputEvidence(result, exitCode = 0, outputRail = null) {
  const logPath = safeRuntimePath('YURI_MEMORY_LEDGER_PATH', path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-ledger.jsonl'));
  if (!logPath) return;
  const text = resultText(result);
  const bytes = Buffer.byteLength(text || '', 'utf8');
  const payload = {
    timestamp: new Date().toISOString(),
    type: 'lane_output',
    lane,
    exitCode,
    bytes,
    taskId: ledgerTraceId,
    content: `lane ${lane} completed with ${bytes} output bytes`,
    contentSha256: hashPayload(text || ''),
    metadata: {
      streamed: resultWasStreamed(result),
      outputRail: outputRail ? {
        ok: outputRail.ok,
        severity: outputRail.severity,
        reasons: outputRail.reasons || [],
        evidence: outputRail.evidence || {},
      } : null,
    },
  };
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
  } catch (err) {
    process.stderr.write(`[memory-ledger] lane_output append failed: ${err.message}\n`);
  }
}

async function runCloudChatWithFallback(resolved, promptText, runnerOptions, context) {
  const baseLaneId = quarantineLaneId(context.lane, resolved);
  const baseOptions = {
    extraHeaders: resolved.extraHeaders,
    maxTokens: resolved.maxTokens,
    timeout: resolved.timeout,
    lane: context.lane,
    traceId: context.traceId,
    tools: resolved.tools,
    session: runnerOptions.session,
    fresh: runnerOptions.fresh,
    noSession: runnerOptions.noSession,
    streamOutput: context.streamOutput,
    streamWriter: context.streamWriter,
    streamStatusWriter: context.streamStatusWriter,
  };

  try {
    const result = await runOpenAICompatibleChat(
      resolved.endpoint,
      resolved.apiKey,
      resolved.model,
      promptText,
      runnerOptions.system,
      resolved.extraBody,
      baseOptions,
    );
    noteLaneSuccess(baseLaneId);
    return result;
  } catch (err) {
    const fallbackLane = transientFallbackLaneFor(context.lane);
    if (isTransientProviderError(err)) noteLaneCrash(baseLaneId, err, 'base-transient-failure');
    if (!isTransientProviderError(err) || !fallbackLane) throw err;
    recordNimTransientIncident({
      lane: context.lane,
      model: resolved.model,
      status: err.httpStatus || null,
      action: 'fallback',
      fallbackLane,
      error: err.message,
    });
    context.streamStatusWriter?.(`\x1b[2m[retry] ${context.lane} transient failure; falling back to ${fallbackLane}\x1b[0m\n`);
    const fallback = resolveLane(fallbackLane, '', localModels, false, runnerOptions);
    const fallbackLaneId = quarantineLaneId(fallbackLane, fallback);
    try {
      const result = await runOpenAICompatibleChat(
        fallback.endpoint,
        fallback.apiKey,
        fallback.model,
        promptText,
        runnerOptions.system,
        fallback.extraBody,
        {
          ...baseOptions,
          extraHeaders: fallback.extraHeaders,
          maxTokens: fallback.maxTokens,
          timeout: fallback.timeout,
          lane: fallbackLane,
          tools: fallback.tools,
        },
      );
      noteLaneSuccess(fallbackLaneId);
      return result;
    } catch (fallbackError) {
      if (isTransientProviderError(fallbackError)) noteLaneCrash(fallbackLaneId, fallbackError, 'fallback-transient-failure');
      throw fallbackError;
    }
  }
}

function maybeSubstituteQuarantinedLane(currentLane, currentResolved, runnerOptions, availableLocalModels) {
  const laneId = quarantineLaneId(currentLane, currentResolved);
  if (!laneId || !isQuarantined(laneId)) {
    return { substituted: false, from: laneId, to: '', resolved: currentResolved };
  }
  const fallbackLane = selectFallbackLane(laneId);
  if (!fallbackLane) {
    recordEscalation(laneId, {
      code: 'NO_HEALTHY_LANE_FOR_TASK',
      reason: 'target lane quarantined and no healthy fallback lane available',
    });
    throw new Error(`NO_HEALTHY_LANE_FOR_TASK: ${laneId}`);
  }
  const fallbackResolved = resolveLane(fallbackLane, '', availableLocalModels, false, runnerOptions);
  return {
    substituted: true,
    from: laneId,
    to: fallbackLane,
    resolved: fallbackResolved,
  };
}

function quarantineLaneId(laneName, resolvedLane = {}) {
  return canonicalLaneForModel(resolvedLane.model) || normalizeLaneId(laneName);
}

function noteLaneCrash(laneId, err, reason) {
  if (!laneId) return;
  recordCrash(laneId, {
    reason,
    status: err?.httpStatus ?? err?.status ?? null,
    error: err?.message || '',
  });
}

function noteLaneSuccess(laneId) {
  if (!laneId) return;
  clearCrashes(laneId, { reason: 'provider-success' });
}

function transientFallbackLaneFor(laneName) {
  const laneKey = String(laneName || '').replace(/^@/, '');
  const fallbacks = {
    'nvidia-nemotron-120b': 'nvidia-nemotron-nano-30b',
    'nvidia-nemotron-nano-30b': 'nvidia-mistral-medium',
    'nvidia-mistral-large': 'nvidia-mistral-medium',
    'nvidia-qwen3-next': 'nvidia-qwen-coder',
  };
  return fallbacks[laneKey] || '';
}

function isTransientProviderError(err) {
  return Boolean(err?.transient || [502, 503].includes(Number(err?.httpStatus)) || isTransientFetchError(err));
}

function isTransientFetchError(err) {
  const code = String(err?.cause?.code || err?.code || err?.name || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    ['UND_ERR_HEADERS_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ABORTERROR'].includes(code) ||
    /headers timeout|fetch failed|network|socket|timed out|timeout/.test(message)
  );
}

function parseArgs(rest) {
  const out = {
    model: '',
    system: '',
    prompt: '',
    dryRun: false,
    inventory: false,
    reasoning: '',
    maxOutputTokens: undefined,
    planJson: '',
    planFile: '',
    executePulse: false,
    tools: false,
    toolsExplicit: false,
    outputFile: '',
    session: process.env.LANE_SESSION || 'default',
    fresh: process.env.LANE_FRESH === '1' || process.env.LANE_FRESH === 'true',
    noSession: process.env.LANE_NO_SESSION === '1' || process.env.LANE_NO_SESSION === 'true',
  };
  const promptParts = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--model' && rest[i + 1]) {
      out.model = rest[++i];
      continue;
    }
    if (token === '--system' && rest[i + 1]) {
      out.system = rest[++i];
      continue;
    }
    if (token === '--reasoning' && rest[i + 1]) {
      out.reasoning = rest[++i];
      continue;
    }
    if (token === '--tools') {
      out.tools = true;
      out.toolsExplicit = true;
      continue;
    }
    if (token === '--no-tools' || token === '--text-only') {
      out.tools = false;
      out.toolsExplicit = true;
      continue;
    }
    if (token === '--max-output-tokens' && rest[i + 1]) {
      out.maxOutputTokens = parseInt(rest[++i], 10);
      continue;
    }
    if (token === '--plan-json' && rest[i + 1]) {
      out.planJson = rest[++i];
      continue;
    }
    if (token === '--plan-file' && rest[i + 1]) {
      out.planFile = rest[++i];
      continue;
    }
    if (token === '--output-file' && rest[i + 1]) {
      out.outputFile = rest[++i];
      continue;
    }
    if (token === '--execute-pulse' || token === '--execute') {
      out.executePulse = true;
      continue;
    }
    if (token === '--dry-run' || token === '--route-only') {
      out.dryRun = true;
      continue;
    }
    if (token === '--inventory') {
      out.inventory = true;
      continue;
    }
    if (token === '--session' && rest[i + 1]) {
      out.session = rest[++i];
      continue;
    }
    if (token === '--fresh' || token === '--new-session') {
      out.fresh = true;
      continue;
    }
    if (token === '--no-session' || token === '--no-lane-session') {
      out.noSession = true;
      continue;
    }
    promptParts.push(token);
  }

  out.prompt = promptParts.join(' ');
  return out;
}

function normalizeLaneRequest(rawLane, rawReasoning = '') {
  const cleanLane = String(rawLane || '').toLowerCase();
  const suffixCapable = /^(deepseek-v4-|deepseek-cloud|code-deepseek|deepseek-reasoner|deepseek-chat)/.test(cleanLane);
  const parts = suffixCapable ? cleanLane.split(':') : [cleanLane];
  const baseLane = parts.shift() || '';
  const suffix = parts.join(':');
  const suffixReasoning = normalizeReasoningDepth(suffix);
  const explicitReasoning = normalizeReasoningDepth(rawReasoning);
  const alias = {
    'deepseek-cloud': 'deepseek-v4-pro',
    'code-deepseek': 'deepseek-v4-pro',
    'deepseek-reasoner': 'deepseek-v4-pro',
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-v4-pro-lite-budget': 'deepseek-v4-pro',
    'minimax-m27': 'nvidia-minimax-m27',
    'minimax-m2.7': 'nvidia-minimax-m2.7',
    'nemotron-super-49b': 'nvidia-nemotron-super-49b',
    'mistral-nemotron': 'nvidia-mistral-nemotron',
    'magistral-small': 'nvidia-magistral-small',
    'qwen-coder-32b': 'nvidia-qwen-coder-32b',
    'llama4-maverick': 'nvidia-llama4-maverick',
    'vision-90b': 'nvidia-vision-90b',
    'nemotron-nano-vl-8b': 'nvidia-nemotron-nano-vl-8b',
    'nemotron-mini-4b': 'nvidia-nemotron-mini-4b',
    'usdcode': 'nvidia-usdcode',
  };
  const lane = alias[baseLane] || baseLane;
  const reasoning = explicitReasoning || suffixReasoning || (baseLane === 'deepseek-v4-pro-lite-budget' ? 'low' : '');
  return { lane, reasoning };
}

function normalizeReasoningDepth(value = '') {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return '';
  if (['off', 'none', 'false', 'disabled'].includes(v)) return 'off';
  if (['lite', 'light', 'low', 'budget', 'cheap'].includes(v)) return 'low';
  if (['medium', 'normal', 'standard', 'balanced'].includes(v)) return 'medium';
  if (['reasoning', 'deep', 'high', 'thinking'].includes(v)) return 'high';
  if (['max', 'maximum', 'max-reasoning', 'xhigh', 'extra-high', 'ultra'].includes(v)) return 'xhigh';
  return '';
}

async function runPulsePlan(options, promptText, traceId) {
  const pulsePlan = readPulsePlan(options);
  const stages = pulsePlan?.symbioticPulse?.stages || [];
  const requestedExecute = options.executePulse === true && options.dryRun !== true;
  const planMode = pulsePlan?.mode || 'plan_only';
  const execute = requestedExecute && !String(planMode).includes('observe');
  const pulseTraceId = pulsePlan?.pulseTrace?.traceId || traceId;
  const selectedLaneIds = [...new Set(stages.flatMap((stage) => stage.laneIds || stage.lanes || []))]
    .filter((id) => id && id !== 'main-session');
  const stageOrder = stages.map((stage) => stage.id).filter(Boolean);
  const tracePaths = resolvePulseTracePaths();
  const pulseTraceEvents = [];

  const base = {
    schema_version: 1,
    executor: 'offload-runner',
    mode: execute ? 'pulse_execute' : 'pulse_dry_run',
    advisory_only: true,
    local_truth_claim: false,
    pulse_plan_schema_version: pulsePlan?.schema_version || null,
    pulse_trace_id: pulseTraceId,
    pulse_seed_sha256: pulsePlan?.pulseTrace?.decisionTrace?.pulseSeedSha256 || '',
    selected_lane_ids: selectedLaneIds,
    stage_order: stageOrder,
    stage_count: stages.length,
    trigger_all_at_once: false,
    pulse_trace_ledger_path: tracePaths.ledgerPath,
    non_claims: [
      'no hidden chain-of-thought storage',
      'no automatic mutation',
      'no local-truth claim from model output',
    ],
  };

  recordPulseEvent(pulseTraceEvents, {
    traceId: pulseTraceId,
    type: execute ? 'pulse.execute.started' : 'pulse.dry_run.planned',
    status: execute ? 'started' : 'planned',
    payload: {
      plan_schema_version: pulsePlan?.schema_version || null,
      mode: base.mode,
      stage_order: stageOrder,
      selected_lane_ids: selectedLaneIds,
      prompt_sha256: hashPayload(promptText || ''),
    },
  });

  const result = {
    ...base,
    stages: stages.map((stage) => ({
      id: stage.id,
      capability: stage.capability,
      laneIds: stage.laneIds || stage.lanes || [],
      skillIds: stage.skillIds || [],
      executionMode: stage.executionMode,
      status: execute ? 'not_executed_in_reconciliation_port' : 'planned',
      nativeOnly: !!stage.nativeOnly,
    })),
  };

  recordPulseEvent(pulseTraceEvents, {
    traceId: pulseTraceId,
    type: execute ? 'pulse.execute.completed' : 'pulse.dry_run.completed',
    status: execute ? 'completed' : 'planned',
    payload: {
      stage_count: stages.length,
      selected_lane_ids: selectedLaneIds,
      trigger_all_at_once: false,
    },
  });

  const snapshotPath = persistPulseTraceSnapshot(pulsePlan, result, pulseTraceId, pulseTraceEvents);
  if (snapshotPath) result.pulse_trace_snapshot_path = snapshotPath;
  result.pulse_trace_events = pulseTraceEvents;
  return result;
}

function readPulsePlan(options) {
  if (options.planJson) {
    return JSON.parse(options.planJson);
  }
  if (options.planFile) {
    return JSON.parse(readFileSync(path.resolve(options.planFile), 'utf8'));
  }
  throw new Error('pulse lane requires --plan-json or --plan-file');
}

function recordPulseEvent(events, event) {
  const recorded = appendPulseTraceEvent(event);
  events.push({
    event_id: recorded.event_id,
    trace_id: recorded.trace_id,
    type: recorded.type,
    status: recorded.status,
    stage_id: recorded.stage_id,
    lane_id: recorded.lane_id,
    payload_sha256: recorded.payload_sha256,
  });
  return recorded;
}

function persistPulseTraceSnapshot(pulsePlan, result, pulseTraceId, events) {
  const snapshot = compactPulseSnapshot(pulsePlan, {
    ...result,
    pulse_trace_events: events,
  });
  return writePulseTraceSnapshot(pulseTraceId, snapshot);
}

function resolveLane(requestedLane, forcedModel, localModels, dryRun = false, options = {}) {
  const normalizedForcedModel = normalizeForcedModel(forcedModel, requestedLane);
  if (DEAD_NIM_LANES.includes(requestedLane)) {
    const error = `Dead NIM lane blocked at resolution: ${requestedLane}`;
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: 'blocked',
        model: normalizedForcedModel || '',
        executable: false,
        status: 'DEAD_LANE_EXECUTION_BLOCKED',
        error,
      };
    }
    throw new Error(`DEAD_LANE_EXECUTION_BLOCKED: ${error}`);
  }

  if (requestedLane === 'gemma' || requestedLane === 'gemma-local' || requestedLane === 'gemma-cloud') {
    return resolveGemmaLane(requestedLane, normalizedForcedModel, localModels, dryRun);
  }

  if (requestedLane === 'ollama' || requestedLane === 'ollama-local' || requestedLane === 'ollama-cloud') {
    return resolveOllamaAdditiveLane(requestedLane, normalizedForcedModel, localModels, dryRun);
  }

  if (['nvidia-deepseek', 'nvidia-deepseek-v4-pro', 'nvidia-deepseek-v4-flash'].includes(requestedLane)) {
    const error = 'NVIDIA_DEEPSEEK_RETIRED: use direct deepseek-v4-pro or deepseek-v4-flash';
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: 'blocked',
        model: normalizedForcedModel || requestedLane.replace(/^nvidia-/, ''),
        executable: false,
        status: 'NVIDIA_DEEPSEEK_RETIRED',
        error,
      };
    }
    throw new Error(error);
  }

  if (requestedLane === 'code-local') {
    return resolveCodeLocalLane(
      normalizedForcedModel || normalizeForcedModel(process.env.CODE_LOCAL_MODEL || '', 'code-local') || '',
      localModels,
      dryRun
    );
  }

  const laneMap = {
    'gpt-oss': {
      kind: 'local',
      model: normalizedForcedModel || normalizeForcedModel(process.env.GPT_OSS_MODEL || '', 'gpt-oss') || pickFirstExisting([
        LOCAL_UTILITY_MODEL,
        LOCAL_PRIMARY_MODEL,
        LOCAL_FALLBACK_MODEL
      ], localModels)
    },
    'deepseek': resolveDeepseekDefaultLane(normalizedForcedModel, localModels, dryRun),
    'deepseek-local': resolveDeepseekLocalLane(
      normalizedForcedModel || normalizeForcedModel(process.env.DEEPSEEK_LOCAL_MODEL || process.env.DEEPSEEK_MODEL || '', 'deepseek-local') || ''
    ),
    'kimi': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.KIMI_BASE_URL || ''),
      apiKey: process.env.KIMI_API_KEY || '',
      model: normalizedForcedModel || process.env.KIMI_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('kimi')
    },
    'moonshot': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1'),
      apiKey: process.env.MOONSHOT_API_KEY || '',
      model: normalizedForcedModel || process.env.MOONSHOT_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('moonshot')
    },
    'deepseek-v4-flash': deepseekLane(normalizedForcedModel, {
      defaultModel: 'deepseek-v4-flash',
      envVars: ['DEEPSEEK_FLASH_MODEL'],
      thinking: false,
      maxTokens: 4096,
      timeout: parseInt(process.env.DEEPSEEK_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
    }, options),
    'deepseek-v4-pro': deepseekLane(normalizedForcedModel, {
      defaultModel: 'deepseek-v4-pro',
      envVars: ['DEEPSEEK_PRO_MODEL'],
      thinking: true,
      maxTokens: 8192,
      timeout: parseInt(process.env.DEEPSEEK_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
    }, options),
    'triage-local': {
      kind: 'local',
      model: normalizedForcedModel || normalizeForcedModel(process.env.TRIAGE_LOCAL_MODEL || '', 'triage-local') || pickFirstExisting([
        LOCAL_UTILITY_MODEL,
        LOCAL_PRIMARY_MODEL,
        LOCAL_FALLBACK_MODEL
      ], localModels)
    },
    'summarize-local': {
      kind: 'local',
      model: normalizedForcedModel || normalizeForcedModel(process.env.SUMMARIZE_LOCAL_MODEL || '', 'summarize-local') || pickFirstExisting([
        LOCAL_UTILITY_MODEL,
        LOCAL_PRIMARY_MODEL,
        LOCAL_FALLBACK_MODEL
      ], localModels)
    },
    'reason-kimi': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.REASON_KIMI_BASE_URL || process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'),
      apiKey: process.env.REASON_KIMI_API_KEY || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || '',
      model: normalizedForcedModel || process.env.REASON_KIMI_MODEL || 'kimi-k2.6',
      extraBody: cloudExtraBody('reason-kimi')
    },
    'reason-cloud': {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.REASON_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.REASON_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '',
      model: normalizedForcedModel || process.env.REASON_CLOUD_MODEL || 'qwen2.5:72b',
    },
    'code-cloud': {
      kind: 'cloud',
      protocol: 'ollama-native',
      endpoint: process.env.CODE_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
      apiKey: process.env.CODE_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '',
      model: normalizedForcedModel || process.env.CODE_CLOUD_MODEL || 'qwen2.5-coder:32b',
    },
    'nvidia-nim': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-llama-405b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'meta/llama-3.1-405b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-llama-70b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'meta/llama-3.3-70b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-nemotron': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      tools: false,
      requiresKey: true,
    },
    'nvidia-nemotron-70b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/llama-3.1-nemotron-70b-instruct',
      tools: false,
      requiresKey: true,
    },
    'nvidia-nemotron-super-49b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      tools: true,
      requiresKey: true,
    },
    'nvidia-dracarys': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_DRACARYS || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'abacusai/dracarys-llama-3.1-70b-instruct',
      tools: false,
      requiresKey: true,
    },
    'nvidia-glm': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_GLM || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'z-ai/glm-5.1',
      tools: false,
      requiresKey: true,
    },
    'nvidia-minimax-m27': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_MINIMAX_M27 || process.env.MINIMAX_M27_NIM_API_KEY || process.env.MINIMAX_NIM_API_KEY || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'minimaxai/minimax-m2.7',
      tools: true,
      requiresKey: true,
    },
    'nvidia-minimax-m2.7': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_MINIMAX_M27 || process.env.MINIMAX_M27_NIM_API_KEY || process.env.MINIMAX_NIM_API_KEY || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'minimaxai/minimax-m2.7',
      tools: true,
      requiresKey: true,
    },
    'nvidia-ising': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_ISING || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      tools: false,
      requiresKey: true,
    },
    'nvidia-nemotron-nano-30b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/nemotron-3-nano-30b-a3b',
      tools: true,
      requiresKey: true,
    },
    'nvidia-nemotron-nano-vl-8b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
      tools: true,
      requiresKey: true,
    },
    'nvidia-nemotron-mini-4b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/nemotron-mini-4b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-gpt-oss-120b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_GPT_OSS_120B || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'openai/gpt-oss-120b',
      tools: false,
      requiresKey: true,
    },
    'nvidia-nemotron-120b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_GPT_OSS_120B || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/nemotron-3-super-120b-a12b',
      tools: false,
      requiresKey: true,
    },
    'nvidia-qwen3-next': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_KEY_QWEN3_NEXT || process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'qwen/qwen3-next-80b-a3b-instruct',
      tools: false,
      requiresKey: true,
    },
    'nvidia-mistral': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'mistralai/mistral-large-2-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-mistral-medium': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'mistralai/mistral-medium-3.5-128b',
      tools: false, // NIM Mistral-3 chat template breaks with tools — synthetic assistant turn trips add_generation_prompt
      requiresKey: true,
    },
    'nvidia-mistral-large': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'mistralai/mistral-large-3-675b-instruct-2512',
      tools: false, // NIM Mistral-3 chat template breaks with tools — synthetic assistant turn trips add_generation_prompt
      requiresKey: true,
    },
    'nvidia-mistral-nemotron': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'mistralai/mistral-nemotron',
      tools: true,
      requiresKey: true,
    },
    'nvidia-magistral-small': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'mistralai/magistral-small-2506',
      tools: true,
      requiresKey: true,
    },
    'nvidia-qwen': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'qwen/qwen2.5-72b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-qwen-397b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'qwen/qwen3.5-397b-a17b',
      tools: true,
      requiresKey: true,
    },
    'nvidia-qwen-coder-32b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'qwen/qwen2.5-coder-32b-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-phi': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'microsoft/phi-4',
      tools: true,
      requiresKey: true,
    },
    'nvidia-llama4-maverick': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'meta/llama-4-maverick-17b-128e-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-vision-90b': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'meta/llama-3.2-90b-vision-instruct',
      tools: true,
      requiresKey: true,
    },
    'nvidia-usdcode': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: normalizedForcedModel || 'nvidia/usdcode',
      tools: true,
      requiresKey: true,
    },
    'openrouter-free': {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'),
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: normalizedForcedModel || process.env.OPENROUTER_MODEL || 'openrouter/free',
      maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '2048', 10),
      timeout: 30000,
      extraHeaders: {
        'HTTP-Referer': 'https://yuri.local',
        'X-OpenRouter-Title': 'YURI',
      },
      requiresKey: true,
    },
    'codex': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: process.env.CODEX_MODEL || 'gpt-5.5',
      defaultReasoningEffort: 'high',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MAX_OUTPUT_TOKENS || '8192', 10),
      timeout: parseInt(process.env.CODEX_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
    'codex-mini': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: process.env.CODEX_MINI_MODEL || 'gpt-5.4-mini',
      defaultReasoningEffort: 'medium',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MINI_MAX_OUTPUT_TOKENS || '4096', 10),
      timeout: parseInt(process.env.CODEX_MINI_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
    'gpt-5.5': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: 'gpt-5.5',
      defaultReasoningEffort: 'high',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MAX_OUTPUT_TOKENS || '8192', 10),
      timeout: parseInt(process.env.CODEX_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
    'gpt-5.4': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: 'gpt-5.4',
      defaultReasoningEffort: 'medium',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MAX_OUTPUT_TOKENS || '8192', 10),
      timeout: parseInt(process.env.CODEX_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
    'gpt-5.4-mini': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: 'gpt-5.4-mini',
      defaultReasoningEffort: 'medium',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MINI_MAX_OUTPUT_TOKENS || '4096', 10),
      timeout: parseInt(process.env.CODEX_MINI_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
    'gpt-5.3-codex': openAiResponsesLane(normalizedForcedModel, {
      defaultModel: 'gpt-5.3-codex',
      defaultReasoningEffort: 'high',
      maxTokens: options.maxOutputTokens || parseInt(process.env.CODEX_MAX_OUTPUT_TOKENS || '8192', 10),
      timeout: parseInt(process.env.CODEX_TIMEOUT_MS || String(DEFAULT_LONG_OFFLOAD_TIMEOUT_MS), 10),
      reasoningEffort: options.reasoning,
    }),
  };

  const resolved = laneMap[requestedLane];
  if (!resolved) {
    if (requestedLane === 'claude') {
      throw new Error('Lane "claude" removed from this runner. Use "deepseek-v4-pro" for DeepSeek advisory work.');
    }
    throw new Error(`Unsupported lane: ${requestedLane}`);
  }

  if (resolved.kind === 'blocked') {
    return resolved;
  }

  if (resolved.kind === 'local') {
    if (!resolved.model || !localModels.has(resolved.model)) {
      const error = !resolved.model
        ? `Lane "${requestedLane}" needs a local model installed.`
        : `Lane "${requestedLane}" requires "${resolved.model}" to be installed.`;
      if (dryRun) {
        return {
          kind: 'blocked',
          model: resolved.model || '',
          executable: false,
          error,
        };
      }
      throw new Error(error);
    }
    return { kind: 'local', model: resolved.model };
  }

  if (!resolved.endpoint) {
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: resolved.kind,
        protocol: resolved.protocol,
        endpoint: '',
        apiKey: resolved.apiKey || '',
        model: resolved.model,
        extraBody: resolved.extraBody,
        executable: false,
        status: 'SKIPPED_MISSING_ENDPOINT',
        error: `Missing endpoint for lane: ${requestedLane}`,
      };
    }
    throw new Error(`Missing endpoint for lane: ${requestedLane}`);
  }

  if (resolved.requiresKey && !resolved.apiKey) {
    if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
      return {
        kind: resolved.kind,
        protocol: resolved.protocol,
        endpoint: resolved.endpoint,
        apiKey: '',
        model: resolved.model,
        extraBody: resolved.extraBody,
        maxTokens: resolved.maxTokens,
        timeout: resolved.timeout,
        reasoningEffort: resolved.reasoningEffort,
        executable: false,
        status: 'SKIPPED_MISSING_KEY',
        error: `Missing API key for lane: ${requestedLane}`,
      };
    }
    throw new Error(`Missing API key for lane: ${requestedLane}`);
  }

  if (requestedLane === 'openrouter-free') {
    const model = resolved.model;
    const isFree = model === 'openrouter/free' || model.endsWith(':free');
    if (!isFree && process.env.OPENROUTER_ALLOW_PAID !== '1') {
      if (dryRun || process.env.OFFLOAD_OPTIONAL === '1') {
        return {
          kind: 'blocked',
          model,
          executable: false,
          status: 'BLOCKED_PAID_MODEL',
          error: `Model "${model}" requires OPENROUTER_ALLOW_PAID=1`,
        };
      }
      throw new Error(`OpenRouter paid model blocked: "${model}". Set OPENROUTER_ALLOW_PAID=1 to allow.`);
    }
  }

  return resolved;
}

function normalizeForcedModel(forcedModel, lane) {
  if (!forcedModel) return '';

  // Strip routing suffixes (:cloud, :local, :remote) — they're routing hints, not model IDs
  forcedModel = forcedModel.replace(/:(?:cloud|local|remote)$/i, '');

  const normalized = forcedModel.replace(/[_]/g, '-').toLowerCase();
  const laneName = lane.replace(/[_]/g, '-').toLowerCase();

  if (normalized === laneName) return '';
  if (laneName === 'gpt-oss' && (normalized === 'gptoss' || normalized === 'gpt-oss')) return '';
  if (laneName === 'deepseek' && normalized === 'deepseek') return '';
  if (laneName === 'nvidia-deepseek' && normalized === 'nvidia-deepseek') return '';
  if (laneName === 'nvidia-deepseek-v4-pro' && normalized === 'nvidia-deepseek-v4-pro') return '';
  if (laneName === 'nvidia-deepseek-v4-flash' && normalized === 'nvidia-deepseek-v4-flash') return '';
  if (/^deepseek-ai\/deepseek-v4-(?:flash|pro)$/.test(normalized)) return normalized.replace(/^deepseek-ai\//, '');
  if (laneName === 'deepseek-local' && (normalized === 'deepseek-local' || normalized === 'deepseek')) return '';
  if ((laneName === 'ollama' || laneName === 'ollama-local' || laneName === 'ollama-cloud') && (normalized === 'ollama' || normalized === 'ollama-local' || normalized === 'ollama-cloud')) return '';
  if (laneName === 'kimi' && (normalized === 'kimi' || normalized === 'moonshot')) return '';
  if (laneName === 'moonshot' && (normalized === 'moonshot' || normalized === 'kimi')) return '';
  if (laneName === 'triage-local' && normalized === 'triage-local') return '';
  if (laneName === 'summarize-local' && normalized === 'summarize-local') return '';
  if (laneName === 'code-local' && normalized === 'code-local') return '';
  if (laneName === 'reason-cloud' && normalized === 'reason-cloud') return '';
  if (laneName === 'code-cloud' && normalized === 'code-cloud') return '';
  if (laneName === 'reason-kimi' && (normalized === 'reason-kimi' || normalized === 'kimi')) return '';
  if (laneName === 'gemma-local' && normalized === 'gemma-local') return '';
  if (laneName === 'gemma-cloud' && normalized === 'gemma-cloud') return '';
  if (laneName === 'gemma' && normalized === 'gemma') return '';
  if (laneName === 'codex' && normalized === 'codex') return '';
  if (laneName === 'codex-mini' && normalized === 'codex-mini') return '';

  if (['ollama', 'ollama-local', 'ollama-cloud', 'triage-local', 'summarize-local', 'gpt-oss'].includes(laneName)) {
    if (['qwen3.5', 'qwen3.5:4b', 'qwen3.5:latest', 'qwen-liberated', 'qwen-liberated:latest'].includes(normalized)) return LOCAL_UTILITY_MODEL;
    if (['qwen2.5', 'qwen2.5:7b', 'qwen2.5:latest'].includes(normalized)) return LOCAL_PRIMARY_MODEL;
    if (['llama3.2', 'llama3.2:latest'].includes(normalized)) return LOCAL_FALLBACK_MODEL;
  }

  if (laneName === 'code-local') {
    if (['qwen2.5-coder', 'qwen2.5-coder:7b', 'qwen2.5-coder:latest'].includes(normalized)) return LOCAL_CODE_MODEL;
    if (['starcoder2', 'starcoder2:latest'].includes(normalized)) return LOCAL_CODE_FALLBACK_MODEL;
  }

  if (laneName === 'deepseek') {
    if (['deepseek-r1', 'deepseek-r1:8b', 'deepseek-r1:latest'].includes(normalized)) return LOCAL_DEEP_REASONING_MODEL;
    if (['qwen2.5', 'qwen2.5:7b', 'qwen2.5:latest'].includes(normalized)) return LOCAL_PRIMARY_MODEL;
    if (['qwen3.5', 'qwen3.5:4b', 'qwen3.5:latest'].includes(normalized)) return LOCAL_UTILITY_MODEL;
    if (['llama3.2', 'llama3.2:latest'].includes(normalized)) return LOCAL_FALLBACK_MODEL;
  }

  if (laneName === 'gemma' || laneName === 'gemma-local') {
    if (['gemma4', 'gemma4:e2b', 'gemma4:latest', 'gemma'].includes(normalized)) return LOCAL_MULTIMODAL_MODEL;
  }

  if (laneName === 'gemma-cloud') {
    if (['gemma4', 'gemma4:latest', 'gemma'].includes(normalized)) return 'gemma4:e4b';
  }

  return forcedModel;
}

function openAiResponsesLane(normalizedForcedModel, options) {
  return {
    kind: 'cloud',
    protocol: 'responses',
    endpoint: normalizeOpenAIBaseUrl(process.env.CODEX_ENDPOINT || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
    apiKey: process.env.OPENAI_API_KEY || '',
    model: normalizedForcedModel || options.defaultModel,
    reasoningEffort: validateReasoningEffort(
      options.reasoningEffort || process.env.CODEX_REASONING_EFFORT || options.defaultReasoningEffort,
    ),
    maxTokens: options.maxTokens,
    timeout: options.timeout,
    requiresKey: true,
  };
}

function validateReasoningEffort(value) {
  const effort = normalizeReasoningDepth(value) || (value || '').toLowerCase();
  if (['low', 'medium', 'high', 'xhigh'].includes(effort)) return effort;
  throw new Error(`Invalid reasoning effort "${value}". Use low, medium, high, or xhigh.`);
}

function cloudExtraBody(provider) {
  if (provider === 'kimi' || provider === 'reason-kimi') {
    return { chat_template_kwargs: { thinking: true } };
  }
  return undefined;
}

function resolveDeepseekModel(options) {
  for (const envName of options.envVars || []) {
    const val = process.env[envName] || '';
    if (val) return normalizeDeepseekPublicModel(val);
  }
  return options.defaultModel;
}

function resolveDeepseekRuntime(options, runnerOptions = {}) {
  const depth = normalizeReasoningDepth(runnerOptions.reasoning);
  const baseThinking = !!options.thinking;
  const thinking = depth === 'off' || depth === 'low' ? false : depth ? true : baseThinking;
  const maxTokenByDepth = {
    off: Math.min(options.maxTokens, 2048),
    low: Math.min(options.maxTokens, 2048),
    medium: Math.max(options.maxTokens, 4096),
    high: Math.max(options.maxTokens, 8192),
    xhigh: Math.max(options.maxTokens, 8192),
  };
  const timeoutByDepth = {
    off: options.timeout,
    low: options.timeout,
    medium: options.timeout,
    high: options.timeout,
    xhigh: options.timeout,
  };
  return {
    reasoningDepth: depth || (baseThinking ? 'high' : 'off'),
    thinking,
    maxTokens: depth ? maxTokenByDepth[depth] : options.maxTokens,
    timeout: depth ? timeoutByDepth[depth] : options.timeout,
  };
}

function deepseekLane(normalizedForcedModel, options, runnerOptions = {}) {
  const runtime = resolveDeepseekRuntime(options, runnerOptions);
  return {
    kind: 'cloud',
    endpoint: normalizeOpenAIBaseUrl(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'),
    apiKey: envOrKeychain('DEEPSEEK_API_KEY', 'CODE_DEEPSEEK_API_KEY'),
    model: normalizedForcedModel || resolveDeepseekModel(options),
    maxTokens: runtime.maxTokens,
    timeout: runtime.timeout,
    reasoningDepth: runtime.reasoningDepth,
    // Direct DeepSeek API is the canonical paid lane again. Tools default ON
    // unless explicitly disabled by the caller.
    tools: runnerOptions.tools !== false,
    requiresKey: true,
    resolvedVia: 'deepseek-direct',
  };
}

function resolveDeepseekDefaultLane(normalizedForcedModel, localModels, dryRun) {
  if (normalizedForcedModel) {
    if (isLocalDeepseekModel(normalizedForcedModel)) {
      return resolveDeepseekLocalLane(normalizedForcedModel);
    }
    return {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'),
      apiKey: envOrKeychain('DEEPSEEK_API_KEY', 'CODE_DEEPSEEK_API_KEY'),
      model: normalizedForcedModel,
      maxTokens: parseInt(process.env.DEEPSEEK_DEFAULT_MAX_TOKENS || '4096', 10),
      timeout: parseInt(process.env.DEEPSEEK_DEFAULT_TIMEOUT_MS || '60000', 10),
      reasoningDepth: 'off',
      tools: true,
      requiresKey: true,
      resolvedVia: 'deepseek-direct-forced',
    };
  }

  const deepseekApiKey = envOrKeychain('DEEPSEEK_API_KEY', 'CODE_DEEPSEEK_API_KEY');
  if (deepseekApiKey) {
    return {
      kind: 'cloud',
      endpoint: normalizeOpenAIBaseUrl(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'),
      apiKey: deepseekApiKey,
      model: normalizeDeepseekPublicModel(process.env.DEEPSEEK_DEFAULT_MODEL || process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-v4-flash'),
      maxTokens: parseInt(process.env.DEEPSEEK_DEFAULT_MAX_TOKENS || '4096', 10),
      timeout: parseInt(process.env.DEEPSEEK_DEFAULT_TIMEOUT_MS || '60000', 10),
      reasoningDepth: 'off',
      tools: true,
      requiresKey: true,
      resolvedVia: 'deepseek-direct-default',
    };
  }

  return blockedDeepseekLocal(
    LOCAL_DEEP_REASONING_MODEL,
    'Lane "deepseek" requires DEEPSEEK_API_KEY or CODE_DEEPSEEK_API_KEY. NVIDIA fallback is disabled by policy.',
    'cloud-required',
    'SKIPPED_MISSING_KEY',
  );
}

function resolveDeepseekLocalLane(forcedModel) {
  const model = forcedModel || LOCAL_DEEP_REASONING_MODEL;
  return blockedDeepseekLocal(
    model,
    `Lane "deepseek-local" is frozen. Local DeepSeek models are disabled to prevent system hangs: ${model}`,
    forcedModel ? 'forced-local-frozen' : 'local-frozen',
  );
}

function isLocalDeepseekModel(model) {
  return /^deepseek-(r1|v2|liberated)(:|$)/i.test(String(model || ''));
}

function blockedDeepseekLocal(model, error, resolvedVia, status = 'BLOCKED_FROZEN_MODEL') {
  return {
    kind: 'blocked',
    model,
    executable: false,
    status,
    error,
    frozen: true,
    resolvedVia,
  };
}

function resolveGemmaLane(lane, normalizedForcedModel, localModels, dryRun = false) {
  if (normalizedForcedModel && !normalizedForcedModel.startsWith('gemma4:')) {
    throw new Error(`Lane "${lane}" requires a gemma4: model, got "${normalizedForcedModel}".`);
  }

  if (lane === 'gemma-local') {
    const model = normalizedForcedModel || normalizeGemmaLocalModel(envGemmaModel('GEMMA_LOCAL_MODEL')) || pickGemmaLocal(localModels);
    if (!model) {
      if (dryRun) {
        return {
          kind: 'local',
          model: 'gemma4:e2b',
          installed: false,
          executable: false,
          error: 'No local gemma4 model installed. Run: ollama pull gemma4:e2b',
        };
      }
      throw new Error('Lane "gemma-local": no local gemma4 model installed. Run: ollama pull gemma4:e2b');
    }
    return { kind: 'local', model, installed: true, executable: true };
  }

  if (lane === 'gemma-cloud') {
    const apiKey = process.env.GEMMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';
    const endpoint = process.env.GEMMA_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat';
    const model = normalizedForcedModel || normalizeGemmaCloudModel(envGemmaModel('GEMMA_CLOUD_MODEL')) || 'gemma4:e4b';
    if (!apiKey) {
      if (dryRun) {
        return {
          kind: 'cloud',
          protocol: 'ollama-native',
          endpoint,
          model,
          hasKey: false,
          executable: false,
          error: 'Missing OLLAMA_API_KEY or GEMMA_CLOUD_API_KEY',
        };
      }
      throw new Error('Lane "gemma-cloud" requires OLLAMA_API_KEY or GEMMA_CLOUD_API_KEY.');
    }
    return { kind: 'cloud', protocol: 'ollama-native', endpoint, apiKey, model, hasKey: true, executable: true };
  }

  // lane === 'gemma' — cloud-first, local fallback
  const hasCloudKey = !!(process.env.OLLAMA_API_KEY || process.env.GEMMA_CLOUD_API_KEY);
  if (hasCloudKey) {
      return {
        kind: 'cloud',
        protocol: 'ollama-native',
        endpoint: process.env.GEMMA_CLOUD_ENDPOINT || process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat',
        apiKey: process.env.GEMMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY,
      model: normalizedForcedModel || normalizeGemmaCloudModel(envGemmaModel('GEMMA_MODEL')) || 'gemma4:e4b',
        resolvedVia: 'cloud',
        executable: true,
      };
  }

  const localModel = normalizedForcedModel || normalizeGemmaLocalModel(envGemmaModel('GEMMA_MODEL')) || pickGemmaLocal(localModels);
  if (localModel) return { kind: 'local', model: localModel, resolvedVia: 'local', executable: true };

  if (dryRun) {
    return {
      kind: 'blocked',
      model: 'gemma4:e2b',
      hasCloudKey: false,
      hasLocalModel: false,
      executable: false,
      error: 'No OLLAMA_API_KEY for cloud and no local gemma4 model installed. Install gemma4:e2b or set OLLAMA_API_KEY.',
    };
  }
  throw new Error('Lane "gemma": no OLLAMA_API_KEY for cloud and no local gemma4 model installed. Install gemma4:e2b or set OLLAMA_API_KEY.');
}

function resolveCodeLocalLane(forcedModel, localModels, dryRun = false) {
  if (forcedModel) {
    if (!isCoderModel(forcedModel)) {
      return codeLaneBlocked(forcedModel, dryRun, `Lane "code-local" requires a coder model, got "${forcedModel}".`);
    }

    if (localModels.has(forcedModel)) {
      return { kind: 'local', model: forcedModel, resolvedVia: 'forced', additive: false };
    }

    return codeLaneBlocked(
      forcedModel,
      dryRun,
      `Lane "code-local" requires "${forcedModel}" to be installed. Run: ollama pull ${forcedModel}`
    );
  }

  for (const candidate of [LOCAL_CODE_MODEL, LOCAL_CODE_FALLBACK_MODEL]) {
    if (candidate && localModels.has(candidate)) {
      return { kind: 'local', model: candidate, resolvedVia: 'local', additive: false };
    }
  }

  return codeLaneBlocked(
    LOCAL_CODE_MODEL,
    dryRun,
    `Lane "code-local" needs a coder model. Install ${LOCAL_CODE_MODEL} or ${LOCAL_CODE_FALLBACK_MODEL}.`
  );
}

function codeLaneBlocked(model, dryRun, error) {
  if (dryRun) {
    return {
      kind: 'blocked',
      model,
      executable: false,
      additive: false,
      error,
    };
  }

  throw new Error(error);
}

function isCoderModel(model) {
  const clean = String(model || '').toLowerCase();
  return clean.startsWith('qwen2.5-coder') || clean.startsWith('starcoder2');
}

function loadModelPolicy() {
  try {
    if (!existsSync(MODEL_POLICY_PATH)) return {};
    return JSON.parse(readFileSync(MODEL_POLICY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function envGemmaModel(envName) {
  const val = process.env[envName] || '';
  if (!val) return '';
  if (val.startsWith('gemma4:')) return val;
  throw new Error(`${envName}="${val}" is not a gemma4: model. Gemma lanes require gemma4: models only.`);
}

function normalizeGemmaLocalModel(model) {
  const clean = String(model || '').toLowerCase();
  if (!clean) return '';
  if (['gemma4', 'gemma4:latest', 'gemma'].includes(clean)) return LOCAL_MULTIMODAL_MODEL;
  return clean.startsWith('gemma4:') ? model : '';
}

function normalizeGemmaCloudModel(model) {
  const clean = String(model || '').toLowerCase();
  if (!clean) return '';
  if (['gemma4', 'gemma4:latest', 'gemma'].includes(clean)) return 'gemma4:e4b';
  return clean.startsWith('gemma4:') ? model : '';
}

function pickGemmaLocal(localModels) {
  for (const c of ['gemma4:e2b', 'gemma4:e4b']) {
    if (localModels.has(c)) return c;
  }
  return '';
}

function normalizeOpenAIBaseUrl(url) {
  const trimmed = (url || '').replace(/\/$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function pickFirstExisting(candidates, localModels) {
  for (const candidate of candidates) {
    if (localModels.has(candidate)) return candidate;
  }
  return candidates[0];
}

function listLocalModels() {
  const models = new Set();
  const manifestRoot = process.env.OLLAMA_MANIFEST_DIR || path.join(process.env.HOME || '', '.ollama/models/manifests/registry.ollama.ai/library');
  const needleRepo = process.env.NEEDLE_REPO_DIR || path.join(REPO_ROOT, '_SYSTEM/tools/needle');

  if (!existsSync(manifestRoot)) {
    if (existsSync(needleRepo)) models.add('needle');
    return models;
  }

  const stack = [manifestRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of safeReadDir(current)) {
      const full = path.join(current, entry);
      const stat = safeStat(full);
      if (!stat) continue;
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }

      const rel = path.relative(manifestRoot, full);
      const parts = rel.split(path.sep);
      if (parts.length >= 2) {
        models.add(`${parts[0]}:${parts[1]}`);
      }
    }
  }

  if (existsSync(needleRepo)) {
    models.add('needle');
  }

  return models;
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir) || [];
  } catch {
    return [];
  }
}

function safeStat(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function buildInventory(localModels) {
  const laneNames = ['ollama', 'ollama-local', 'ollama-cloud', 'gpt-oss', 'deepseek', 'deepseek-local', 'deepseek-v4-flash', 'deepseek-v4-pro', 'triage-local', 'summarize-local', 'code-local', 'reason-cloud', 'code-cloud', 'nvidia-llama-405b', 'nvidia-llama-70b', 'nvidia-llama4-maverick', 'nvidia-nemotron', 'nvidia-nemotron-70b', 'nvidia-nemotron-super-49b', 'nvidia-nemotron-nano-vl-8b', 'nvidia-nemotron-mini-4b', 'nvidia-dracarys', 'nvidia-glm', 'nvidia-minimax-m27', 'nvidia-minimax-m2.7', 'nvidia-ising', 'nvidia-nemotron-nano-30b', 'nvidia-gpt-oss-120b', 'nvidia-nemotron-120b', 'nvidia-qwen3-next', 'nvidia-mistral', 'nvidia-mistral-medium', 'nvidia-mistral-large', 'nvidia-mistral-nemotron', 'nvidia-magistral-small', 'nvidia-qwen', 'nvidia-qwen-397b', 'nvidia-qwen-coder-32b', 'nvidia-phi', 'nvidia-vision-90b', 'nvidia-usdcode', 'gemma-local', 'gemma-cloud', 'gemma', 'openrouter-free', 'codex', 'codex-mini', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'];
  const lanes = {};
  for (const name of laneNames) {
    try {
      const r = resolveLane(name, '', localModels, true);
      lanes[name] = { kind: r.kind, model: r.model };
      if (r.endpoint) lanes[name].endpoint = r.endpoint;
      if (r.protocol) lanes[name].protocol = r.protocol;
      if (r.apiKey !== undefined) lanes[name].hasKey = !!r.apiKey;
      if (r.executable !== undefined) lanes[name].executable = r.executable;
      if (r.frozen !== undefined) lanes[name].frozen = r.frozen;
      if (r.status) lanes[name].status = r.status;
      if (r.error) lanes[name].error = r.error;
      if (r.resolvedVia) lanes[name].resolvedVia = r.resolvedVia;
      if (r.extraBody?.thinking?.type) lanes[name].thinking = r.extraBody.thinking.type;
      if (r.reasoningEffort !== undefined) lanes[name].reasoningEffort = r.reasoningEffort;
      if (r.reasoningDepth !== undefined) lanes[name].reasoningDepth = r.reasoningDepth;
      if (r.tools !== undefined) lanes[name].tools = r.tools;
      if (r.maxTokens !== undefined) lanes[name].maxTokens = r.maxTokens;
      if (r.timeout !== undefined) lanes[name].timeout = r.timeout;
      if (r.requiresKey !== undefined) lanes[name].requiresKey = r.requiresKey;
    } catch (e) {
      lanes[name] = { error: e.message };
    }
  }
  return {
    lanes,
    localModels: [...localModels].sort(),
    localPolicy: {
      primary: LOCAL_PRIMARY_MODEL,
      utility: LOCAL_UTILITY_MODEL,
      code: LOCAL_CODE_MODEL,
      codeFallback: LOCAL_CODE_FALLBACK_MODEL,
      deepReasoning: LOCAL_DEEP_REASONING_MODEL,
      multimodal: LOCAL_MULTIMODAL_MODEL,
      fallback: LOCAL_FALLBACK_MODEL,
      frozen: [...LOCAL_FROZEN_MODELS],
      manualOnly: [...LOCAL_MANUAL_ONLY_MODELS],
    },
  };
}

async function runOpenAIResponses(endpoint, apiKey, model, promptText, systemText, opts = {}) {
  const startedAt = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    input: promptText,
    store: false,
    ...(systemText ? { instructions: systemText } : {}),
    ...(opts.maxTokens ? { max_output_tokens: opts.maxTokens } : {}),
    ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
    ...(opts.streamOutput ? { stream: true } : {}),
  };

  const fetchOpts = { method: 'POST', headers, body: JSON.stringify(body) };
  let timeoutId;
  if (opts.timeout) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), opts.timeout);
    fetchOpts.signal = controller.signal;
  }

  let response;
  try {
    response = await fetch(`${endpoint}/responses`, fetchOpts);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    await recordOffloadLedger({
      lane: opts.lane,
      traceId: opts.traceId,
      provider: 'openai-responses',
      requestModel: model,
      status: 'error',
      measurement: { measurement_type: 'unobservable', accuracy_class: 'not_measurable' },
      startedAt,
      promptText,
      systemText,
      endpoint,
      metadata: { http_status: response.status, error_hash: hashPayload(errText) },
    });
    if (response.status === 402) throw new Error(`HTTP_402: ${errText}`);
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`OPENAI_RESPONSES_${response.status}: ${errText}`);
  }

  if (body.stream === true) {
    opts.streamStatusWriter?.('\x1b[2m[stream] connected responses\x1b[0m\n');
    const streamed = await readResponsesStream(response, {
      onText: opts.streamWriter,
      onReasoning: (chunk) => {
        if (process.env.OFFLOAD_STREAM_REASONING === '1') opts.streamStatusWriter?.(`\x1b[2m[reasoning] ${chunk}\x1b[0m`);
      },
    });
    const output = streamed.text || (streamed.finalResponse ? extractResponseText(streamed.finalResponse) : '');
    await recordOffloadLedger({
      lane: opts.lane,
      traceId: opts.traceId,
      provider: 'openai-responses',
      requestModel: model,
      responseModel: streamed.finalResponse?.model || model,
      status: 'ok',
      measurement: normalizeProviderUsage('openai', streamed.usage || streamed.finalResponse?.usage, {
        input_tokens: estimateTokensFromText([systemText, promptText].filter(Boolean).join('\n')),
        output_tokens: estimateTokensFromText(output),
      }),
      startedAt,
      promptText,
      systemText,
      endpoint,
      metadata: { streamed: true, response_id_hash: streamed.finalResponse?.id ? hashPayload(streamed.finalResponse.id) : '' },
    });
    return { text: output, streamed: true };
  }

  const data = await response.json();
  const output = extractResponseText(data);
  await recordOffloadLedger({
    lane: opts.lane,
    traceId: opts.traceId,
    provider: 'openai-responses',
    requestModel: model,
    responseModel: data.model || model,
    status: 'ok',
    measurement: normalizeProviderUsage('openai', data.usage, {
      input_tokens: estimateTokensFromText([systemText, promptText].filter(Boolean).join('\n')),
      output_tokens: estimateTokensFromText(output),
    }),
    startedAt,
    promptText,
    systemText,
    endpoint,
    metadata: { response_id_hash: data.id ? hashPayload(data.id) : '' },
  });
  return output;
}

async function readResponsesStream(response, handlers = {}) {
  const onText = handlers.onText || (() => {});
  const onReasoning = handlers.onReasoning || (() => {});
  const state = {
    text: '',
    reasoning: '',
    usage: null,
    finalResponse: null,
  };

  await readSseResponse(response, (payload) => {
    const type = payload.type || '';
    if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      state.text += payload.delta;
      onText(payload.delta);
    }
    if (
      (type === 'response.reasoning_text.delta' ||
        type === 'response.reasoning.delta' ||
        type === 'response.output_item.delta') &&
      typeof payload.delta === 'string'
    ) {
      state.reasoning += payload.delta;
      onReasoning(payload.delta);
    }
    if (payload.response) {
      state.finalResponse = payload.response;
      if (payload.response.usage) state.usage = payload.response.usage;
    }
    if (payload.usage) state.usage = payload.usage;
  });

  return state;
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  if (parts.length > 0) return parts.join('\n');

  if (data.status === 'incomplete') {
    const reason = data.incomplete_details?.reason || 'unknown';
    throw new Error(`OPENAI_RESPONSES_INCOMPLETE: ${reason}`);
  }

  throw new Error('No text output from Responses API');
}

async function runLocalChat(model, promptText, systemText, ledger = {}) {
  return runOllamaLocalChat(model, promptText, systemText, ledger);
}

async function runOllamaRemote(endpoint, apiKey, model, promptText, systemText, ledger = {}) {
  return runOllamaCloudChat(endpoint, apiKey, model, promptText, systemText, ledger);
}

function normalizeDeepseekPublicModel(model = '') {
  return String(model || '').replace(/^deepseek-ai\//, '');
}

function wireModelForProvider(endpoint = '', model = '', lane = '') {
  const publicModel = normalizeDeepseekPublicModel(model);
  const isDeepseekV4 = /^deepseek-v4-(?:flash|pro)$/.test(publicModel);
  const isDeepseekLane = /^(?:deepseek|deepseek-v4-|nvidia-deepseek)/.test(String(lane || ''));
  const isNvidiaEndpoint = /integrate\.api\.nvidia\.com/i.test(String(endpoint || ''));
  if (isDeepseekV4 && isNvidiaEndpoint) return `deepseek-ai/${publicModel}`;
  if (isDeepseekV4 && isDeepseekLane) return publicModel;
  return model;
}

async function runOpenAICompatibleChat(endpoint, apiKey, model, promptText, systemText, extraBody, opts = {}) {
  const requestModel = wireModelForProvider(endpoint, model, opts.lane);
  // Persistent lane session: NIM uses provider+model identity so parallel
  // council lanes do not collide on the generic provider bucket.
  const { laneSessionModelId, loadLaneSession } = await import('./lane-session.mjs');
  const laneSession = loadLaneSession({
    modelId: laneSessionModelId({ lane: opts.lane, model: requestModel, endpoint }),
    sessionName: opts.session || 'default',
    fresh: opts.fresh === true,
    disabled: opts.noSession === true,
  });

  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  // Prepend persistent history before the new user turn so the provider sees full prior context.
  if (laneSession.enabled && laneSession.history.length > 0) {
    for (const turn of laneSession.history) messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: promptText });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);

  const toolDefinitions = [
    {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Execute bash shell commands and return output',
        parameters: {
          type: 'object',
          properties: {
            cmd: { type: 'string', description: 'Bash command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional, defaults to current)' }
          },
          required: ['cmd']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
            lines: { type: 'number', description: 'Max lines to read (optional)' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'grep',
        description: 'Search files for a pattern, returns matching lines with line numbers',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern' },
            path: { type: 'string', description: 'File or directory to search (optional, defaults to repo root)' },
            flags: { type: 'string', description: 'grep flags e.g. "rn", "rni" (optional, default "rn")' }
          },
          required: ['pattern']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_dir',
        description: 'List files and directories at a path',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to list' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'edit_file',
        description: 'Replace exact old_string with new_string in a file (exact match required)',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to edit' },
            old_string: { type: 'string', description: 'Exact text to replace' },
            new_string: { type: 'string', description: 'Replacement text' }
          },
          required: ['path', 'old_string', 'new_string']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'skill_invoke',
        description: 'Load SKILL.md instructions for a named Yuri OS skill',
        parameters: {
          type: 'object',
          properties: {
            skill_name: { type: 'string', description: 'Skill directory name under root skills/' }
          },
          required: ['skill_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'palace_query',
        description: 'Query Yuri OS semantic memory (palace/vault) for relevant context using natural language',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query against semantic memory' },
            top: { type: 'number', description: 'Number of results to return (default 5)' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ollama_run',
        description: 'Run a prompt through a local Ollama model (needle/llama3.2) for lightweight inference',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Prompt to send to the local model' },
            model: { type: 'string', description: 'Ollama model name (default: needle)' }
          },
          required: ['prompt']
        }
      }
    }
  ];

  // Try with tools first; fall back to text-only if not supported
  let supportsTools = opts.tools === true;
  const maxIterations = 20;
  let iteration = 0;
  let lastToolCallNames = []; // Track last tool calls to detect loops
  let lastCallSig = '';
  let consecutiveIdenticalCallSigs = 0;
  let consecutiveToolCalls = 0;
  let toolLoopRecovered = false; // allow one graceful recovery before hard throw

  while (iteration < maxIterations) {
    iteration++;

    const requestExtraBody = { ...(extraBody || {}) };
    if (!supportsTools) {
      delete requestExtraBody.tools;
      delete requestExtraBody.tool_choice;
    }

    const streamThisRound = opts.streamOutput === true && !supportsTools;
    const body = {
      model: requestModel,
      messages,
      ...(streamThisRound ? { stream: true } : {}),
      ...(supportsTools && { tools: toolDefinitions, tool_choice: 'auto' }),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...requestExtraBody
    };

    let response;
    const startedAt = Date.now();
    response = await fetchChatCompletionsWithRetry(`${endpoint}/chat/completions`, {
      headers,
      body,
      timeout: opts.timeout,
      lane: opts.lane,
      model,
      endpoint,
      iteration,
    });

    if (!response.ok) {
      const errText = await response.text();
      // If tool-use is not supported OR the chat template chokes on tools
      // (NIM Mistral-3 family injects a synthetic assistant turn that trips
      // add_generation_prompt), disable tools and retry text-only.
      if (
        supportsTools &&
        (errText.includes('unknown variant') ||
          errText.includes('tool') ||
          errText.includes('add_generation_prompt') ||
          errText.includes('last message is from the assistant'))
      ) {
        supportsTools = false;
        iteration = 0; // Reset iteration counter
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
          messages.pop(); // Remove trailing assistant message if any
        }
        continue;
      }
      await recordOffloadLedger({
        lane: opts.lane,
        traceId: opts.traceId,
        provider: providerFromEndpoint(endpoint),
        requestModel: model,
        status: 'error',
        measurement: { measurement_type: 'unobservable', accuracy_class: 'not_measurable' },
        startedAt,
        promptText,
        systemText,
        endpoint,
        metadata: { http_status: response.status, iteration, error_hash: hashPayload(errText) },
      });
      if (response.status === 402) throw new Error(`HTTP_402: ${errText}`);
      if (response.status === 429) throw new Error('RATE_LIMITED');
      const error = new Error(`OPENAI_COMPAT_${response.status}: ${errText}`);
      error.httpStatus = response.status;
      error.transient = YURI_RAILS_CONFIG.execution.transientHttpRetry.statuses.includes(response.status);
      throw error;
    }

    if (streamThisRound) {
      opts.streamStatusWriter?.(`\x1b[2m[stream] connected ${opts.lane || model}\x1b[0m\n`);
      const streamed = await readOpenAICompatibleChatStream(response, {
        onText: opts.streamWriter,
        onReasoning: (chunk) => {
          if (process.env.OFFLOAD_STREAM_REASONING === '1') opts.streamStatusWriter?.(`\x1b[2m[reasoning] ${chunk}\x1b[0m`);
        },
      });
      const finalText = streamed.text || '';
      const measurement = normalizeProviderUsage('openai-compatible', streamed.usage, {
        input_tokens: estimateTokensFromText(messages.map((m) => m.content || '').join('\n')),
        output_tokens: estimateTokensFromText(finalText),
      });
      await recordOffloadLedger({
        lane: opts.lane,
        traceId: opts.traceId,
        provider: providerFromEndpoint(endpoint),
        requestModel: model,
        responseModel: normalizeDeepseekPublicModel(streamed.responseModel || model),
        status: 'ok',
        measurement,
        startedAt,
        promptText,
        systemText,
        endpoint,
        metadata: {
          iteration,
          supports_tools: false,
          streamed: true,
        },
      });

      messages.push({ role: 'assistant', content: finalText });
      autoRecordOutcome(opts?.lane, opts?.traceId, finalText);
      if (laneSession.enabled) {
        try {
          laneSession.record(promptText, finalText);
          process.stderr.write(`\x1b[2m[lane-session] persisted to ${laneSession.sessionPath}\x1b[0m\n`);
        } catch (e) {
          process.stderr.write(`[lane-session] persist failed: ${e.message}\n`);
        }
      }
      return { text: finalText, streamed: true };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) throw new Error('No response from model');
    const measurement = normalizeProviderUsage('openai-compatible', data.usage, {
      input_tokens: estimateTokensFromText(messages.map((m) => m.content || '').join('\n')),
      output_tokens: estimateTokensFromText(message.content || ''),
    });
    const cacheMetrics = extractDeepSeekCacheMetrics(data.usage);
    if (cacheMetrics) {
      measurement.cache_read_tokens = cacheMetrics.prompt_cache_hit_tokens;
      measurement.prompt_cache_hit_tokens = cacheMetrics.prompt_cache_hit_tokens;
      measurement.prompt_cache_miss_tokens = cacheMetrics.prompt_cache_miss_tokens;
    }
    await recordOffloadLedger({
      lane: opts.lane,
      traceId: opts.traceId,
      provider: providerFromEndpoint(endpoint),
      requestModel: model,
      responseModel: normalizeDeepseekPublicModel(data.model || model),
      status: 'ok',
      measurement,
      startedAt,
      promptText,
      systemText,
      endpoint,
      metadata: {
        iteration,
        supports_tools: supportsTools,
        tool_call_count: Array.isArray(message.tool_calls) ? message.tool_calls.length : 0,
        ...(cacheMetrics ?? {}),
      },
    });

    // Add assistant's response to conversation
    messages.push({ role: 'assistant', content: message.content || '' });

    // Check if model requested tool calls (only if tools are supported)
    if (supportsTools && message.tool_calls && message.tool_calls.length > 0) {
      try {
        const currentCallSig = message.tool_calls
          .map((tc) => {
            const name = tc.function.name;
            const rawArgs = tc.function.arguments;
            let args = rawArgs;
            if (typeof rawArgs === 'string') {
              try {
                args = JSON.parse(rawArgs);
              } catch {
                args = rawArgs;
              }
            }
            if (name === 'write_file' && args && typeof args === 'object') {
              return `${name}:${JSON.stringify({ path: args.path, content: args.content })}`;
            }
            if (name === 'bash' && args && typeof args === 'object') {
              return `${name}:${JSON.stringify({ cmd: args.cmd })}`;
            }
            return `${name}:${JSON.stringify(rawArgs)}`;
          })
          .sort()
          .join('|');
        if (lastCallSig === currentCallSig) {
          consecutiveIdenticalCallSigs++;
        } else {
          consecutiveIdenticalCallSigs = 0;
        }
        if (consecutiveIdenticalCallSigs >= 2 && iteration >= 3) {
          throw new Error('TOOL_ARG_REPETITION: identical tool+args called twice in a row');
        }
        lastCallSig = currentCallSig;
      } catch (err) {
        if (err?.message?.startsWith('TOOL_ARG_REPETITION:')) throw err;
        console.warn('Tool argument repetition guard skipped:', err?.message || err);
      }

      const currentToolNames = message.tool_calls.map(tc => tc.function.name).sort().join(',');
      if (lastToolCallNames === currentToolNames && iteration >= 3) {
        if (!toolLoopRecovered) {
          toolLoopRecovered = true;
          lastToolCallNames = null;
          consecutiveToolCalls = 0;
          messages.push({
            role: 'user',
            content: `TOOL_LOOP_NOTICE: "${currentToolNames}" was called 3+ times without new progress. Provide your final answer as plain text — no further tool calls.`,
          });
          continue;
        }
        throw new Error('TOOL_LOOP_DETECTED: same tools called 3+ times after recovery: ' + currentToolNames);
      }
      lastToolCallNames = currentToolNames;
      consecutiveToolCalls++;
      if (consecutiveToolCalls > 12) {
        throw new Error('TOOL_RUNAWAY: model has made ' + consecutiveToolCalls + ' consecutive tool calls without text output');
      }

      // Execute tools and collect results
      const toolResults = [];
      for (const toolCall of message.tool_calls) {
        const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
        toolResults.push(`Tool ${toolCall.function.name}: ${result}`);
      }

      // Add tool results as user message
      messages.push({
        role: 'user',
        content: `Tool execution results:\n${toolResults.join('\n')}`
      });
      continue;
    }

    // No more tool calls or tools disabled — return final answer
    consecutiveToolCalls = 0;
    const finalText = message.content || '';
    if (cacheMetrics) {
      const totalCacheTokens = cacheMetrics.prompt_cache_hit_tokens + cacheMetrics.prompt_cache_miss_tokens;
      const ratio = totalCacheTokens > 0 ? cacheMetrics.prompt_cache_hit_tokens / totalCacheTokens : 0;
      process.stderr.write(`\x1b[2m[cache] hit=${cacheMetrics.prompt_cache_hit_tokens} miss=${cacheMetrics.prompt_cache_miss_tokens} ratio=${ratio.toFixed(2)}\x1b[0m\n`);
    }
    autoRecordOutcome(opts?.lane, opts?.traceId, finalText);
    // Persistent lane: record this round to the lane's jsonl so the next dispatch sees it.
    if (laneSession.enabled) {
      try {
        laneSession.record(promptText, finalText);
        process.stderr.write(`\x1b[2m[lane-session] persisted to ${laneSession.sessionPath}\x1b[0m\n`);
      } catch (e) {
        process.stderr.write(`[lane-session] persist failed: ${e.message}\n`);
      }
    }
    return finalText;
  }

  throw new Error(`Loop exceeded max iterations (${maxIterations})`);
}

async function readOpenAICompatibleChatStream(response, onText = () => {}) {
  const handlers = typeof onText === 'function' ? { onText } : (onText || {});
  const writeText = handlers.onText || (() => {});
  const writeReasoning = handlers.onReasoning || (() => {});
  const state = {
    text: '',
    reasoning: '',
    usage: null,
    responseModel: '',
  };

  await readSseResponse(response, (payload) => {
    if (payload.model) state.responseModel = payload.model;
    if (payload.usage) state.usage = payload.usage;
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    const deltaObject = choice?.delta || {};
    const delta = deltaObject.content ?? choice?.message?.content ?? choice?.text ?? '';
    const reasoning =
      deltaObject.reasoning_content ??
      deltaObject.reasoning ??
      deltaObject.thinking ??
      payload.reasoning_content ??
      payload.reasoning ??
      '';
    if (typeof delta === 'string' && delta.length > 0) {
      state.text += delta;
      writeText(delta);
    }
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      state.reasoning += reasoning;
      writeReasoning(reasoning);
    }
  });

  return state;
}

async function fetchChatCompletionsWithRetry(url, options = {}) {
  const retryConfig = YURI_RAILS_CONFIG.execution.transientHttpRetry;
  const retryStatuses = new Set(retryConfig.statuses || [502, 503]);
  const attempts = Math.max(1, Number(retryConfig.attempts || 1));
  let lastResponse = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const fetchOpts = {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
    };
    let timeoutId;
    if (options.timeout) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), options.timeout);
      fetchOpts.signal = controller.signal;
    }

    try {
      lastResponse = await fetch(url, fetchOpts);
    } catch (err) {
      const transientError = decorateTransientFetchError(err);
      recordNimTransientIncident({
        lane: options.lane,
        model: options.model,
        endpoint: endpointHost(options.endpoint),
        status: transientError.code || transientError.name || null,
        attempt,
        maxAttempts: attempts,
        iteration: options.iteration,
        action: attempt >= attempts ? 'throw-fetch-error' : 'retry-fetch-error',
        error: transientError.message,
      });
      if (!transientError.transient || attempt >= attempts) throw transientError;
      await sleep(retryConfig.backoffMs?.[attempt - 1] ?? 1000);
      continue;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!retryStatuses.has(lastResponse.status) || attempt >= attempts) {
      return lastResponse;
    }

    recordNimTransientIncident({
      lane: options.lane,
      model: options.model,
      endpoint: endpointHost(options.endpoint),
      status: lastResponse.status,
      attempt,
      maxAttempts: attempts,
      iteration: options.iteration,
      action: 'retry',
    });
    await sleep(retryConfig.backoffMs?.[attempt - 1] ?? 1000);
  }

  return lastResponse;
}

function decorateTransientFetchError(err) {
  if (!isTransientFetchError(err)) return err;
  err.transient = true;
  err.httpStatus = err.httpStatus || null;
  err.code = err.cause?.code || err.code || err.name || 'FETCH_TRANSIENT';
  return err;
}

function recordNimTransientIncident(payload = {}) {
  const logPath = safeRuntimePath('YURI_NIM_TRANSIENT_INCIDENT_LOG', path.resolve(YURI_RAILS_CONFIG.execution.transientHttpRetry.incidentLog));
  if (!logPath) return;
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })}\n`);
  } catch {
    // Incident logging must never block the lane call.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSseResponse(response, onPayload) {
  if (!response.body) return;
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = consumeSseBuffer(buffer, onPayload);
  }

  buffer += decoder.decode();
  consumeSseBuffer(`${buffer}\n`, onPayload);
}

function consumeSseBuffer(buffer, onPayload) {
  let cursor = buffer.indexOf('\n');
  while (cursor >= 0) {
    const rawLine = buffer.slice(0, cursor);
    buffer = buffer.slice(cursor + 1);
    const line = rawLine.trim();
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          onPayload(JSON.parse(data));
        } catch {}
      }
    }
    cursor = buffer.indexOf('\n');
  }
  return buffer;
}

function autoRecordOutcome(lane, traceId, text) {
  if (!lane) return;
  try {
    let outcome = 'empty';
    let outcome_source = 'heuristic_content_quality';
    if (text && text.length >= 50) {
      const lower = text.toLowerCase();
      const isRefusal = /\bi (cannot|can't|am unable|won't|will not)\b/.test(lower) && text.length < 300;
      const isError = /\b(rate limit|api error|connection refused|timeout|503|502)\b/.test(lower);
      const hasStructure = /\n[-*•]|\n\d+\.|\n#{1,3} |```/.test(text);
      if (isError) outcome = 'error';
      else if (isRefusal) outcome = 'refusal';
      else if (hasStructure || text.length >= 200) outcome = 'success';
      else outcome = 'success';
    }
    const record = JSON.stringify({
      ts: new Date().toISOString(),
      lane,
      traceId: traceId || null,
      outcome,
      outcome_source,
      text_length: text ? text.length : 0,
    });
    const feedbackPath = resolveLaneFeedbackPath();
    if (!feedbackPath) return;
    mkdirSync(path.dirname(feedbackPath), { recursive: true });
    appendFileSync(feedbackPath, record + '\n');
  } catch (_) { /* never block on outcome recording */ }
}

function resolveLaneFeedbackPath() {
  const requested = process.env.OFFLOAD_FEEDBACK_PATH || process.env.YURI_LANE_FEEDBACK_PATH || path.join(process.env.HOME || '/tmp', '.yuri', 'lane-feedback.jsonl');
  const resolved = path.resolve(requested);
  const protectedParts = [
    `${path.sep}.claude${path.sep}state${path.sep}`,
    `${path.sep}.claude${path.sep}history${path.sep}`,
    `${path.sep}backend${path.sep}data${path.sep}`,
    `${path.sep}node_modules${path.sep}`,
  ];
  if (protectedParts.some((part) => `${resolved}${path.sep}`.includes(part))) return '';
  if (path.basename(resolved) === '.env') return '';
  return resolved;
}

function extractDeepSeekCacheMetrics(usage = {}) {
  if (!usage || usage.prompt_cache_hit_tokens == null || usage.prompt_cache_miss_tokens == null) return null;
  const hit = Number(usage?.prompt_cache_hit_tokens);
  const miss = Number(usage?.prompt_cache_miss_tokens);
  if (!Number.isFinite(hit) || !Number.isFinite(miss)) return null;
  return {
    prompt_cache_hit_tokens: Math.max(0, Math.trunc(hit)),
    prompt_cache_miss_tokens: Math.max(0, Math.trunc(miss)),
  };
}

async function recordOffloadLedger({
  lane,
  traceId,
  provider,
  requestModel,
  responseModel,
  status,
  measurement,
  startedAt,
  promptText,
  systemText,
  endpoint,
  metadata = {},
}) {
  const safeMeasurement = measurement || { measurement_type: 'unobservable', accuracy_class: 'not_measurable' };
  await recordTokenEvent({
    trace_id: traceId,
    source_path: '_SYSTEM/Scripts/offload-runner.mjs',
    lane,
    provider,
    request_model: requestModel,
    response_model: responseModel || requestModel,
    operation_type: 'model_call',
    status,
    ...safeMeasurement,
    latency_ms: Date.now() - startedAt,
    payload_hash: hashPayload({ prompt: promptText, system: systemText, model: requestModel, lane }),
    metadata: {
      prompt_chars: promptText?.length || 0,
      system_chars: systemText?.length || 0,
      endpoint_host: endpointHost(endpoint),
      prompt_cache_hit_tokens: safeMeasurement.prompt_cache_hit_tokens,
      prompt_cache_miss_tokens: safeMeasurement.prompt_cache_miss_tokens,
      ...metadata,
    },
  });
}

function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return '';
  }
}

function providerFromEndpoint(endpoint) {
  const host = endpointHost(endpoint);
  if (host.includes('deepseek')) return 'deepseek';
  if (host.includes('moonshot')) return 'moonshot';
  if (host.includes('openrouter')) return 'openrouter';
  if (host.includes('openai')) return 'openai-compatible';
  return 'openai-compatible';
}

async function executeTool(name, argsStr) {
  try {
    let args = {};
    if (typeof argsStr === 'string') {
      args = JSON.parse(argsStr);
    } else {
      args = argsStr;
    }

    const inputRail = evaluateToolInputRails(toolRailPayload(name, args), { source: 'agent-tool' });
    if (!inputRail.ok) {
      writeRailViolation(inputRail);
      return `RAIL_BLOCKED: ${inputRail.reasons.join('; ')}`;
    }

    if (name === 'bash') {
      const { cmd, cwd } = args;
      if (!cmd) return 'ERROR: Missing cmd parameter';
      const toolCwd = resolveToolCwd(cwd);
      const safety = evaluateToolCall('bash', { cmd, cwd: toolCwd }, { source: 'offload-runner' });
      if (!safety.allowed) return `SAFETY_BLOCKED: ${safety.reason}`;
      try {
        const output = execSync(cmd, {
          cwd: toolCwd,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.trim();
      } catch (e) {
        return `bash error (exit ${e.status}): ${e.stderr?.toString() || e.message}`;
      }
    }

    if (name === 'read_file') {
      const { path: filePath, lines } = args;
      if (!filePath) return 'ERROR: Missing path parameter';
      const resolvedPath = resolveRepoPath(filePath);
      if (!isInsideRepoRoot(resolvedPath)) return `SCOPE_BLOCKED: read outside repo root: ${filePath}`;
      try {
        let content = readFileSync(resolvedPath, 'utf-8');
        if (lines) {
          const fileLines = content.split('\n');
          content = fileLines.slice(0, lines).join('\n');
        }
        return content;
      } catch (e) {
        return `read_file error: ${e.message}`;
      }
    }

    if (name === 'write_file') {
      const { path: filePath, content } = args;
      if (!filePath || content === undefined) return 'ERROR: Missing path or content parameter';
      const resolvedPath = resolveRepoPath(filePath);
      if (!isInsideRepoRoot(resolvedPath)) return `SCOPE_BLOCKED: write outside repo root: ${filePath}`;
      if (writeScope && !writeScope.has(resolvedPath)) {
        return 'SCOPE_BLOCKED: write to ' + filePath + ' is outside the dispatch write-scope manifest';
      }
      const safety = evaluateToolCall('write_file', { path: filePath }, { source: 'offload-runner' });
      if (!safety.allowed) return `SAFETY_BLOCKED: ${safety.reason}`;
      try {
        writeFileSync(resolvedPath, content, 'utf-8');
        return `✓ Wrote ${content.length} bytes to ${filePath}`;
      } catch (e) {
        return `write_file error: ${e.message}`;
      }
    }

    if (name === 'grep') {
      const { pattern, path: targetPath, flags = 'rn' } = args;
      if (!pattern) return 'ERROR: Missing pattern parameter';
      const safety = evaluateToolCall('bash', { cmd: `grep -${flags} "${pattern}" "${targetPath || '.'}"` }, { source: 'offload-runner' });
      if (!safety.allowed) return `SAFETY_BLOCKED: ${safety.reason}`;
      try {
        const output = execSync(`grep -${flags} "${pattern}" "${targetPath || '.'}"`, {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          maxBuffer: 2 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return output.trim() || '(no matches)';
      } catch (e) {
        return e.status === 1 ? '(no matches)' : `grep error: ${e.stderr?.toString() || e.message}`;
      }
    }

    if (name === 'list_dir') {
      const { path: dirPath } = args;
      if (!dirPath) return 'ERROR: Missing path parameter';
      const resolvedPath = resolveRepoPath(dirPath);
      if (!isInsideRepoRoot(resolvedPath)) return `SCOPE_BLOCKED: list outside repo root: ${dirPath}`;
      try {
        const { readdirSync: rds, statSync: ss } = await import('node:fs');
        const entries = rds(resolvedPath, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n');
      } catch (e) {
        return `list_dir error: ${e.message}`;
      }
    }

    if (name === 'edit_file') {
      const { path: filePath, old_string, new_string } = args;
      if (!filePath || old_string === undefined || new_string === undefined) return 'ERROR: Missing path, old_string, or new_string';
      const safety = evaluateToolCall('write_file', { path: filePath }, { source: 'offload-runner' });
      if (!safety.allowed) return `SAFETY_BLOCKED: ${safety.reason}`;
      const resolvedPath = resolveRepoPath(filePath);
      if (!isInsideRepoRoot(resolvedPath)) return `SCOPE_BLOCKED: edit outside repo root: ${filePath}`;
      if (writeScope && !writeScope.has(resolvedPath)) {
        return 'SCOPE_BLOCKED: edit to ' + filePath + ' is outside write-scope manifest';
      }
      try {
        const content = readFileSync(resolvedPath, 'utf-8');
        if (!content.includes(old_string)) return `edit_file error: old_string not found in ${filePath}`;
        const updated = content.replace(old_string, new_string);
        writeFileSync(resolvedPath, updated, 'utf-8');
        return `✓ Edited ${filePath}`;
      } catch (e) {
        return `edit_file error: ${e.message}`;
      }
    }

    if (name === 'skill_invoke') {
      const { skill_name } = args;
      if (!skill_name) return 'ERROR: Missing skill_name parameter';
      const skillPath = path.join(REPO_ROOT, '.claude', 'skills', skill_name, 'SKILL.md');
      try {
        const content = readFileSync(skillPath, 'utf-8');
        return `SKILL_INSTRUCTIONS [${skill_name}]:\n${content.slice(0, 4000)}`;
      } catch (e) {
        return `skill_invoke error: SKILL.md not found for "${skill_name}" — ${e.message}`;
      }
    }

    if (name === 'palace_query') {
      const { query, top = 5 } = args;
      if (!query) return 'ERROR: Missing query parameter';
      try {
        const safeQuery = query.replace(/"/g, '\\"');
        const out = execSync(
          `node _SYSTEM/Scripts/memory-query.mjs "${safeQuery}" --top ${top}`,
          { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return out.trim() || '(no results)';
      } catch (e) {
        return `palace_query error: ${e.stderr?.toString() || e.message}`;
      }
    }

    if (name === 'ollama_run') {
      const { prompt: ollamaPrompt, model: ollamaModel = 'needle' } = args;
      if (!ollamaPrompt) return 'ERROR: Missing prompt parameter';
      try {
        const payload = JSON.stringify({ model: ollamaModel, prompt: ollamaPrompt, stream: false });
        const out = execSync(
          `curl -s --max-time 60 http://localhost:11434/api/generate -d ${JSON.stringify(payload)}`,
          { encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        try { return JSON.parse(out).response || out.trim(); } catch { return out.trim(); }
      } catch (e) {
        return `ollama_run error: ${e.stderr?.toString() || e.message}`;
      }
    }

    return `ERROR: Unknown tool "${name}"`;
  } catch (e) {
    return `Tool execution error: ${e.message}`;
  }
}

function toolRailPayload(name, args = {}) {
  switch (name) {
    case 'bash':
      return { kind: 'shell', command: args.cmd || '', cwd: args.cwd || '' };
    case 'read_file':
    case 'list_dir':
      return { kind: name, path: args.path || '' };
    case 'write_file':
      return { kind: name, path: args.path || '', content: args.content || '' };
    case 'edit_file':
      return { kind: name, path: args.path || '', old_string: args.old_string || '', new_string: args.new_string || '' };
    case 'grep':
      return { kind: name, path: args.path || '.', command: `grep -${args.flags || 'rn'} ${args.pattern || ''} ${args.path || '.'}` };
    default:
      return { kind: name };
  }
}
