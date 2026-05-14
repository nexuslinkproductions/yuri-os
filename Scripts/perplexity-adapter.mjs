#!/usr/bin/env node
// Perplexity API adapter — OpenAI-compatible lane for Scripts/offload.sh
// Lane: perplexity | Models: sonar-pro (default), sonar-reasoning-pro (high/xhigh)
// Auth: PERPLEXITY_API_KEY env var

import { estimateTokensFromText, hashPayload, recordTokenEvent } from './token-ledger.mjs';

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MODEL       = 'sonar-pro';
const REASONING_MODEL     = 'sonar-reasoning-pro';
const TIMEOUT_MS          = Number(process.env.PERPLEXITY_TIMEOUT_MS) || 120_000;

const argv       = process.argv.slice(2);
const opts       = parseArgs(argv);
const envPrompt  = (process.env.OFFLOAD_PROMPT_TEXT || '').trim();
const prompt     = opts.prompt || envPrompt;
const traceId    = process.env.TOKEN_LEDGER_TRACE_ID || process.env.OFFLOAD_TASK_ID || `perplexity-${Date.now()}-${process.pid}`;

if (opts.dryRun) {
  const preview = buildPreview(opts, prompt);
  process.stderr.write(JSON.stringify(preview, null, 2) + '\n');
  process.exit(0);
}

const apiKey = process.env.PERPLEXITY_API_KEY || '';
if (!apiKey) {
  process.stderr.write(JSON.stringify({ lane: 'perplexity', model: opts.model, status: 'BLOCKED_MISSING_KEY', reason: 'Missing PERPLEXITY_API_KEY', exitCode: 1 }) + '\n');
  process.exit(1);
}

if (!prompt) {
  process.stderr.write(JSON.stringify({ lane: 'perplexity', model: opts.model, status: 'BLOCKED_MISSING_PROMPT', reason: 'Missing prompt.', exitCode: 1 }) + '\n');
  process.exit(1);
}

const result = await run(opts, prompt, apiKey, traceId);
if (result.ok) {
  process.stdout.write(result.text + (result.text.endsWith('\n') ? '' : '\n'));
  process.exit(0);
} else {
  process.stderr.write(JSON.stringify({ lane: 'perplexity', model: result.model, status: 'FAILED', reason: result.reason, exitCode: result.exitCode }) + '\n');
  process.exit(1);
}

// ─── Core request ─────────────────────────────────────────────────────────────
async function run(opts, prompt, apiKey, traceId) {
  const model      = opts.model;
  const startedAt  = Date.now();
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(PERPLEXITY_ENDPOINT, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal:  controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, model, reason: `HTTP ${resp.status}: ${body.slice(0, 200)}`, exitCode: resp.status };
    }

    const data  = await resp.json();
    const text  = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};

    await recordTokenEvent({
      trace_id:         traceId,
      source_path:      'Scripts/perplexity-adapter.mjs',
      lane:             'perplexity',
      provider:         'perplexity-api',
      request_model:    model,
      response_model:   data?.model || model,
      operation_type:   'perplexity_offload',
      status:           'ok',
      measurement_type: 'api_reported',
      input_tokens:     usage.prompt_tokens     || estimateTokensFromText(prompt),
      output_tokens:    usage.completion_tokens || estimateTokensFromText(text),
      accuracy_class:   usage.prompt_tokens ? 'api_reported_exact' : 'estimate_chars_div_4_pm25',
      estimator_version:'perplexity_v1',
      latency_ms:       Date.now() - startedAt,
      payload_hash:     hashPayload({ prompt, model }),
      metadata:         { prompt_chars: prompt.length, output_chars: text.length, usage },
    });

    return { ok: true, model, text };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    const reason = isTimeout ? `Timed out after ${TIMEOUT_MS}ms` : (err.message || String(err));
    return { ok: false, model, reason, exitCode: isTimeout ? 124 : 1 };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function selectModel(reasoningDepth) {
  if (!reasoningDepth) return process.env.PERPLEXITY_MODEL || DEFAULT_MODEL;
  const d = reasoningDepth.toLowerCase();
  if (['high', 'xhigh', 'max', 'maximum', 'ultra'].includes(d)) return REASONING_MODEL;
  return process.env.PERPLEXITY_MODEL || DEFAULT_MODEL;
}

function parseArgs(rest) {
  const out = { dryRun: false, model: DEFAULT_MODEL, promptParts: [] };
  const args = [...rest];
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--dry-run' || t === '--route-only') { out.dryRun = true; continue; }
    if ((t === '--model' || t === '-m') && args[i + 1]) { out.model = args[++i]; continue; }
    if (t === '--reasoning' && args[i + 1]) { out.model = selectModel(args[++i]); continue; }
    out.promptParts.push(t);
  }
  out.prompt = out.promptParts.join(' ').trim();
  return out;
}

function buildPreview(opts, prompt) {
  return {
    lane:     'perplexity',
    model:    opts.model,
    status:   'DRY_RUN',
    reason:   'Dry-run preview.',
    exitCode: 0,
    endpoint: PERPLEXITY_ENDPOINT,
    keySet:   !!(process.env.PERPLEXITY_API_KEY),
    prompt,
  };
}
