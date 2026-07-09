#!/usr/bin/env node
// @capability: sol-moe-openclaw-spawn-adapter
// @serves: owner-gated OpenClaw execution for Sol MoE manifests
// @does: converts one executor spawn request into a deterministic, non-delivering `openclaw agent` invocation and normalizes the JSON response
// @use: createOpenClawSpawn({ apply: true, ownerConfirmed: true })
// @exports: createOpenClawSpawn

import { execFile as nodeExecFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;
const DEFAULT_MAX_PROMPT_CHARS = 120_000;

/**
 * Build an injected spawn callback for executeSolMoePlan().
 *
 * This boundary is intentionally disarmed unless the caller supplies both
 * apply:true and ownerConfirmed:true. It never adds --deliver or any reply
 * target, and it does not persist adapter state.
 */
export function createOpenClawSpawn(options = {}) {
  const execFile = options.execFile || nodeExecFile;
  if (typeof execFile !== 'function') {
    throw new TypeError('createOpenClawSpawn requires execFile to be a function');
  }
  const armed = options.apply === true && options.ownerConfirmed === true;
  const command = nonEmpty(options.command) || 'openclaw';
  const timeoutMs = resolveTimeoutMs(options);
  const maxBuffer = positiveInteger(options.maxBuffer, DEFAULT_MAX_BUFFER, 'maxBuffer');
  const maxPromptChars = positiveInteger(options.maxPromptChars, DEFAULT_MAX_PROMPT_CHARS, 'maxPromptChars');
  // Stable inside one execution, fresh across adapter instances. Reusing a
  // content-only session key would leak history from a previous identical run.
  const executionId = nonEmpty(options.executionId) || randomUUID();

  return async function spawnOpenClaw(request = {}) {
    if (!armed) {
      return failure('availability', 'OPENCLAW_SPAWN_DISARMED',
        'OpenClaw spawn is disarmed; apply:true and ownerConfirmed:true are both required.');
    }

    const invalid = validateRequest(request);
    if (invalid) {
      return failure('semantic', 'OPENCLAW_REQUEST_INVALID', invalid);
    }

    let prompt;
    try {
      prompt = buildPrompt(request);
    } catch (error) {
      return failure('semantic', 'OPENCLAW_PROMPT_INVALID', boundedMessage(error));
    }
    if (prompt.length > maxPromptChars) {
      return failure('semantic', 'OPENCLAW_PROMPT_TOO_LARGE',
        `OpenClaw prompt is ${prompt.length} characters; maximum is ${maxPromptChars}. Use artifact references instead of embedding the full payload.`);
    }
    const sessionKey = deterministicSessionKey(request, executionId);
    const timeoutSeconds = Math.ceil(timeoutMs / 1000);
    const args = [
      'agent',
      '--agent', request.agentId,
      '--model', request.model,
      '--thinking', request.thinking,
      '--session-key', sessionKey,
      '--message', prompt,
      '--timeout', String(timeoutSeconds),
      '--json',
    ];
    const startedAt = Date.now();

    let processResult;
    try {
      processResult = await execFileResult(execFile, command, args, {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer,
        windowsHide: true,
        killSignal: 'SIGTERM',
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const kind = classifyFailure(error, error?.stderr);
      return failure(kind, error?.code || failureCode(kind), boundedMessage(error), {
        durationMs,
        stderr: boundedText(error?.stderr),
      });
    }

    const durationMs = Date.now() - startedAt;
    const parsed = parseOpenClawPayload(processResult.stdout);
    if (!parsed.ok) {
      return failure('semantic', parsed.code, parsed.message, { durationMs });
    }

    if (request.purpose === 'verifier') {
      return parseVerifierOutput(parsed.text, durationMs);
    }
    return {
      ok: true,
      output: parsed.text,
      durationMs,
    };
  };
}

function buildPrompt(request) {
  const evidence = Array.isArray(request.upstream?.evidence) ? request.upstream.evidence : [];
  const producer = request.upstream?.producer || request.upstream?.priorProducer || null;
  const priorVerifier = request.upstream?.priorVerifier || null;
  const header = [
    'MURE SOL MOE EXECUTION',
    `Task ID: ${request.taskId}`,
    `Purpose: ${request.purpose}`,
    `Route: ${request.routeKind || 'unspecified'}`,
    `Attempt: ${request.attempt}`,
    '',
    'TASK',
    request.prompt,
    '',
    'UPSTREAM EVIDENCE (advisory; verify before relying on it)',
    stableJson(evidence),
    '',
    'UPSTREAM PRODUCER OUTPUT',
    stableJson(producer),
  ];

  if (priorVerifier) {
    header.push('', 'PRIOR VERIFIER OUTPUT', stableJson(priorVerifier));
  }

  if (request.purpose === 'verifier') {
    header.push(
      '',
      'VERIFIER CONTRACT',
      'Independently verify the producer output against the task and evidence.',
      'Return exactly one JSON object and no markdown, explanation, or surrounding text.',
      'The only valid outputs are {"verdict":"pass"} or {"verdict":"reject"}.',
      'Use reject whenever the evidence is insufficient, ambiguous, or the output is incorrect.',
    );
  } else {
    header.push('', 'Return the requested work product. Do not claim independent verification.');
  }
  return header.join('\n');
}

function deterministicSessionKey(request, executionId) {
  const identity = JSON.stringify({
    executionId,
    taskId: request.taskId,
    purpose: request.purpose,
    entryId: request.id || null,
    routeKind: request.routeKind || null,
    attempt: request.attempt,
    agentId: request.agentId,
    model: request.model,
  });
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return `agent:${request.agentId}:sol-moe:${digest}`;
}

function execFileResult(execFile, command, args, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, stdout = '', stderr = '') => {
      if (settled) return;
      settled = true;
      if (error) {
        error.stdout ??= stdout;
        error.stderr ??= stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    };
    try {
      execFile(command, args, options, done);
    } catch (error) {
      done(error);
    }
  });
}

function parseOpenClawPayload(stdout) {
  let value;
  try {
    value = JSON.parse(String(stdout || '').trim());
  } catch {
    return {
      ok: false,
      code: 'OPENCLAW_JSON_INVALID',
      message: 'OpenClaw did not return valid JSON.',
    };
  }
  const payloads = value?.payloads || value?.result?.payloads || value?.data?.payloads;
  const text = payloads?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return {
      ok: false,
      code: 'OPENCLAW_PAYLOAD_TEXT_MISSING',
      message: 'OpenClaw JSON did not contain a non-empty payloads[0].text string.',
    };
  }
  return { ok: true, text: text.trim() };
}

function parseVerifierOutput(text, durationMs) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return failure('semantic', 'OPENCLAW_VERDICT_INVALID',
      'Verifier output was not strict JSON.', { durationMs });
  }
  const verdict = value?.verdict;
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).length !== 1
      || !['pass', 'reject'].includes(verdict)) {
    return failure('semantic', 'OPENCLAW_VERDICT_INVALID',
      'Verifier output must contain verdict "pass" or "reject".', { durationMs });
  }
  return {
    ok: true,
    output: { verdict },
    verdict,
    accepted: verdict === 'pass',
    verifierPass: verdict === 'pass',
    durationMs,
  };
}

function classifyFailure(error, stderr) {
  const text = `${error?.code || ''} ${error?.message || ''} ${stderr || ''}`.toLowerCase();
  if (error?.killed === true || error?.code === 'ETIMEDOUT' || /timed?\s*out|timeout/.test(text)) {
    return 'timeout';
  }
  if (/\b429\b|rate[ -]?limit|quota|too many (?:concurrent )?requests|resource exhausted|usage.{0,20}limit|limit.{0,20}(?:reached|exceeded|reset)|reset (?:at|in|after)/.test(text)) {
    return 'rate-limit';
  }
  if (/\b401\b|\b403\b|\b503\b|unauthori[sz]ed|forbidden|auth(?:entication|orization)?|credentials?|api[ -]?key|token.{0,20}(?:expired|invalid)|no available auth profile|all models failed|provider.{0,30}(?:unavailable|down|failed)|model.{0,30}(?:unavailable|not available|requires)|requires a newer version|not supported|service unavailable|overloaded/.test(text)) {
    return 'availability';
  }
  return 'transport';
}

function validateRequest(request) {
  for (const field of ['taskId', 'purpose', 'agentId', 'model', 'thinking', 'prompt']) {
    if (!nonEmpty(request[field])) return `OpenClaw spawn request requires ${field}.`;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(request.agentId)) {
    return 'OpenClaw spawn request agentId contains unsupported characters.';
  }
  if (!/^[A-Za-z0-9._:/-]+$/.test(request.model) || request.model.startsWith('-')) {
    return 'OpenClaw spawn request model contains unsupported characters.';
  }
  if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max'].includes(request.thinking)) {
    return 'OpenClaw spawn request thinking level is invalid.';
  }
  if (!Number.isInteger(Number(request.attempt)) || Number(request.attempt) < 1) {
    return 'OpenClaw spawn request requires a positive integer attempt.';
  }
  return null;
}

function resolveTimeoutMs(options) {
  if (options.timeoutMs !== undefined) {
    return positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
  }
  if (options.timeoutSeconds !== undefined) {
    return positiveInteger(options.timeoutSeconds, DEFAULT_TIMEOUT_MS / 1000, 'timeoutSeconds') * 1000;
  }
  return DEFAULT_TIMEOUT_MS;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return number;
}

function failure(failureKind, code, message, extra = {}) {
  return {
    ok: false,
    status: code === 'OPENCLAW_SPAWN_DISARMED' ? 'disarmed' : 'failed',
    failureKind,
    error: { code, message },
    durationMs: extra.durationMs ?? null,
    ...(extra.stderr ? { stderr: extra.stderr } : {}),
  };
}

function failureCode(kind) {
  return `OPENCLAW_${String(kind).toUpperCase().replace('-', '_')}_FAILURE`;
}

function boundedMessage(error) {
  return boundedText(error?.message) || 'OpenClaw process execution failed.';
}

function boundedText(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 4000) : '';
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stableJson(value) {
  return JSON.stringify(value ?? null, objectKeysSorted, 2);
}

function objectKeysSorted(_key, value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}
