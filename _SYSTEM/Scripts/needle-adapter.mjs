import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  estimateTokensFromText,
  hashPayload,
  recordTokenEvent,
} from './token-ledger.mjs';

const ROOT = path.resolve(process.cwd());
const NEEDLE_REPO_DIR = process.env.NEEDLE_REPO_DIR || path.join(ROOT, '_SYSTEM/tools/needle');
const NEEDLE_PYTHON = process.env.NEEDLE_PYTHON || path.join(NEEDLE_REPO_DIR, '.venv/bin/python');
const NEEDLE_CHECKPOINT = process.env.NEEDLE_CHECKPOINT || path.join(ROOT, '_SYSTEM/data/models/needle/checkpoints/needle.pkl');
const NEEDLE_HF_HOME = process.env.NEEDLE_HF_HOME || path.join(ROOT, '_SYSTEM/data/models/needle/hf');

export function isNeedleAvailable() {
  return existsSync(NEEDLE_REPO_DIR);
}

export async function runNeedleLocalChat(promptText, systemText, ledger = {}) {
  if (!isNeedleAvailable()) {
    throw new Error(`Needle repo not found at ${NEEDLE_REPO_DIR}`);
  }

  const startedAt = Date.now();
  const query = systemText ? `${systemText}\n\n${promptText}` : promptText;
  const env = {
    ...process.env,
    HF_HOME: NEEDLE_HF_HOME,
    HF_HUB_DISABLE_XET: '1',
    PYTHONUNBUFFERED: '1',
  };

  await ensureNeedleCheckpoint(env);

  const script = [
    'import contextlib',
    'import io',
    'import sys',
    'from needle.model.run import load_checkpoint, generate',
    'from needle.model.architecture import SimpleAttentionNetwork',
    'from needle.dataset.dataset import get_tokenizer',
    '',
    'checkpoint_path = sys.argv[1]',
    'query = sys.argv[2]',
    'with contextlib.redirect_stdout(io.StringIO()):',
    '    params, config = load_checkpoint(checkpoint_path)',
    '    model = SimpleAttentionNetwork(config)',
    '    tokenizer = get_tokenizer()',
    'result = generate(',
    '    model,',
    '    params,',
    '    tokenizer,',
    '    query,',
    '    tools="[]",',
    '    stream=False,',
    '    constrained=False,',
    ')',
    'sys.stdout.write(result)',
  ].join('\n');

  const output = execFileSync(
    NEEDLE_PYTHON,
    ['-c', script, NEEDLE_CHECKPOINT, query],
    {
      cwd: NEEDLE_REPO_DIR,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const text = output.trim();
  await recordTokenEvent({
    trace_id: ledger.traceId || `needle-${Date.now()}-${process.pid}`,
    session_id: process.env.LLM_COMPAT_TASK_ID || '',
    source_path: '_SYSTEM/Scripts/needle-adapter.mjs',
    lane: ledger.lane || 'ollama',
    provider: 'needle-local',
    request_model: 'needle',
    response_model: 'needle',
    operation_type: 'offload_model_call',
    status: 'ok',
    measurement_type: 'estimated_tokenizer',
    accuracy_class: 'estimated',
    input_tokens: estimateTokensFromText(query),
    output_tokens: estimateTokensFromText(text),
    latency_ms: Date.now() - startedAt,
    payload_hash: hashPayload({ query, checkpoint: NEEDLE_CHECKPOINT }),
    metadata: {
      local_runtime: 'needle',
      checkpoint: path.basename(NEEDLE_CHECKPOINT),
      output_chars: text.length,
    },
  });

  return text;
}

async function ensureNeedleCheckpoint(env) {
  if (existsSync(NEEDLE_CHECKPOINT)) {
    return;
  }

  const script = [
    'from huggingface_hub import hf_hub_download',
    'import os',
    'import sys',
    'target_dir = sys.argv[1]',
    'os.makedirs(target_dir, exist_ok=True)',
    'print(hf_hub_download(repo_id="Cactus-Compute/needle", filename="needle.pkl", repo_type="model", local_dir=target_dir, force_download=True))',
  ].join('\n');

  execFileSync(
    NEEDLE_PYTHON,
    ['-c', script, path.dirname(NEEDLE_CHECKPOINT)],
    {
      cwd: NEEDLE_REPO_DIR,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}
