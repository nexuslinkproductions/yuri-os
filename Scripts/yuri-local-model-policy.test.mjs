#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const offloadRunnerPath = resolve(__dirname, 'offload-runner.mjs');
const benchmarkPath = resolve(__dirname, 'yuri-local-model-benchmark.mjs');
const heavyModels = new Set(['deepseek-liberated:latest', 'deepseek-v2:16b', 'gemma4:latest']);

const manifestRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-'));

try {
  for (const model of [
    'qwen3.5:4b',
    'qwen2.5:7b',
    'qwen2.5-coder:7b',
    'deepseek-r1:8b',
    'starcoder2:latest',
    'llama3.2:latest',
    'gemma4:e2b',
    'qwen-liberated:latest',
  ]) {
    const [name, tag] = model.split(':');
    mkdirSync(join(manifestRoot, name), { recursive: true });
    writeFileSync(join(manifestRoot, name, tag), '{}');
  }

  const env = {
    ...process.env,
    OLLAMA_MANIFEST_DIR: manifestRoot,
    OLLAMA_API_KEY: '',
    GEMMA_CLOUD_API_KEY: '',
  };

  assert.equal(route('triage-local', env).model, 'qwen3.5:4b');
  assert.equal(route('summarize-local', env).model, 'qwen3.5:4b');
  assert.equal(route('ollama', env).model, 'qwen3.5:4b');
  assert.equal(route('ollama-local', env).model, 'qwen3.5:4b');
  assert.equal(route('gpt-oss', env).model, 'qwen3.5:4b');
  assert.equal(route('code-local', env).model, 'qwen2.5-coder:7b');
  assert.equal(route('deepseek', env).model, 'deepseek-r1:8b');
  assert.equal(route('gemma-local', env).model, 'gemma4:e2b');

  const checkedLanes = ['triage-local', 'summarize-local', 'ollama', 'ollama-local', 'gpt-oss', 'code-local', 'deepseek', 'gemma-local'];
  for (const lane of checkedLanes) {
    const model = route(lane, env).model;
    assert(!heavyModels.has(model), `${lane} must not auto-select heavy manual-only model ${model}`);
  }

  const starcoderRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-coder-fallback-'));
  try {
    for (const model of [
      'qwen3.5:4b',
      'qwen2.5:7b',
      'starcoder2:latest',
      'llama3.2:latest',
    ]) {
      const [name, tag] = model.split(':');
      mkdirSync(join(starcoderRoot, name), { recursive: true });
      writeFileSync(join(starcoderRoot, name, tag), '{}');
    }

    const coderFallbackEnv = {
      ...env,
      OLLAMA_MANIFEST_DIR: starcoderRoot,
    };
    assert.equal(route('code-local', coderFallbackEnv).model, 'starcoder2:latest');
  } finally {
    rmSync(starcoderRoot, { recursive: true, force: true });
  }

  const blockedRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-coder-blocked-'));
  try {
    for (const model of [
      'qwen3.5:4b',
      'qwen2.5:7b',
      'llama3.2:latest',
    ]) {
      const [name, tag] = model.split(':');
      mkdirSync(join(blockedRoot, name), { recursive: true });
      writeFileSync(join(blockedRoot, name, tag), '{}');
    }

    const blockedEnv = {
      ...env,
      OLLAMA_MANIFEST_DIR: blockedRoot,
    };
    const blockedRoute = route('code-local', blockedEnv);
    assert.equal(blockedRoute.kind, 'blocked');
    assert.match(blockedRoute.error, /coder model/i);
  } finally {
    rmSync(blockedRoot, { recursive: true, force: true });
  }

  const benchmark = JSON.parse(execFileSync(
    process.execPath,
    [benchmarkPath, '--dry-run', '--json'],
    { encoding: 'utf8', env },
  ));
  assert.equal(benchmark.dry_run, true);
  assert.equal(benchmark.policy.utility, 'qwen3.5:4b');
  assert.equal(benchmark.policy.code, 'qwen2.5-coder:7b');
  assert.equal(benchmark.summary.failed, 0);
  assert.deepEqual(benchmark.summary.heavy_models_selected, []);

  const offloadCaptureRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-offload-'));
  try {
    const nodeStub = join(offloadCaptureRoot, 'node');
    const captureFile = join(offloadCaptureRoot, 'capture.txt');
writeFileSync(nodeStub, `#!/usr/bin/env bash
set -euo pipefail
: "\${CAPTURE_FILE:?missing capture file}"
printf '%s\n' "$@" > "$CAPTURE_FILE"
`);
    chmodSync(nodeStub, 0o755);

    execFileSync(
      'bash',
      ['Scripts/offload.sh', '--model', 'deepseek-liberated:latest', 'local model policy check'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_FILE: captureFile,
          PATH: `${offloadCaptureRoot}:${process.env.PATH}`,
        },
      }
    );

    const dispatchedArgs = readFileSync(captureFile, 'utf8').trim().split('\n');
    assert.equal(dispatchedArgs[0].endsWith('Scripts/offload-runner.mjs'), true);
    assert.equal(dispatchedArgs[1], 'deepseek');
    assert(!dispatchedArgs.includes('--model'));
    assert(!dispatchedArgs.includes('deepseek-liberated:latest'));
  } finally {
    rmSync(offloadCaptureRoot, { recursive: true, force: true });
  }

  process.stdout.write('yuri-local-model-policy: pass\n');
} finally {
  rmSync(manifestRoot, { recursive: true, force: true });
}

function route(lane, env) {
  return JSON.parse(execFileSync(
    process.execPath,
    [offloadRunnerPath, lane, '--dry-run', 'local model policy check'],
    { encoding: 'utf8', env },
  ));
}
