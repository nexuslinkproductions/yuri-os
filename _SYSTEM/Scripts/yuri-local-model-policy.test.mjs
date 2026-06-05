#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const offloadRunnerPath = resolve(__dirname, 'offload-runner.mjs');
const benchmarkPath = resolve(__dirname, 'yuri-local-model-benchmark.mjs');
const heavyModels = new Set(['deepseek-r1:8b', 'deepseek-liberated:latest', 'deepseek-v2:16b', 'gemma4:latest']);
const needleRepo = resolve(process.cwd(), '_SYSTEM/tools/needle');
const needleCheckpoint = resolve(process.cwd(), '_SYSTEM/data/models/needle/checkpoints/needle.pkl');
const needlePython = resolve(needleRepo, '.venv/bin/python');
const needleCacheHome = mkdtempSync(join(tmpdir(), 'needle-hf-'));

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
    DEEPSEEK_API_KEY: '',
    CODE_DEEPSEEK_API_KEY: '',
    YURI_KEYCHAIN_SERVICE_PREFIX: 'YURI_OS_MUSUBI_TEST_NO_KEYS',
  };

  assert.equal(route('triage-local', env).model, 'needle');
  assert.equal(route('summarize-local', env).model, 'needle');
  assert.equal(route('ollama', env).model, 'needle');
  assert.equal(route('ollama-local', env).model, 'needle');
  assert.equal(route('gpt-oss', env).model, 'needle');
  assert.equal(route('code-local', env).model, 'qwen2.5-coder:7b');
  const deepseekDefault = route('deepseek', env);
  assert.equal(deepseekDefault.kind, 'blocked');
  assert.equal(deepseekDefault.status, 'SKIPPED_MISSING_KEY');
  assert.match(deepseekDefault.error, /requires DEEPSEEK_API_KEY/);
  const deepseekLocal = route('deepseek-local', env);
  assert.equal(deepseekLocal.kind, 'blocked');
  assert.equal(deepseekLocal.status, 'BLOCKED_FROZEN_MODEL');
  assert.equal(deepseekLocal.frozen, true);
  assert.equal(route('gemma-local', env).model, 'gemma4:e2b');

  const checkedLanes = ['triage-local', 'summarize-local', 'ollama', 'ollama-local', 'gpt-oss', 'code-local', 'gemma-local'];
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
  assert.equal(benchmark.policy.utility, 'needle');
  assert.equal(benchmark.policy.primary, 'needle');
  assert.equal(benchmark.policy.code, 'qwen2.5-coder:7b');
  assert.equal(benchmark.summary.failed, 0);
  assert.deepEqual(benchmark.summary.heavy_models_selected, []);

  if (!existsSync(needleCheckpoint)) {
    execFileSync(
      needlePython,
      [
        '-c',
        'from huggingface_hub import hf_hub_download; import sys; print(hf_hub_download(repo_id="Cactus-Compute/needle", filename="needle.pkl", repo_type="model", local_dir=sys.argv[1], force_download=True))',
        dirname(needleCheckpoint),
      ],
      {
        cwd: needleRepo,
        encoding: 'utf8',
        env: {
          ...process.env,
          HF_HOME: needleCacheHome,
          HF_HUB_DISABLE_XET: '1',
        },
      },
    );
  }

  const needleSmoke = execFileSync(
    needlePython,
    [
      '-c',
      'from needle.cli import main; main()',
      'run',
      '--checkpoint',
      needleCheckpoint,
      '--query',
      "What's the weather in San Francisco?",
      '--tools',
      '[{"name":"get_weather","parameters":{"location":"string"}}]',
    ],
    {
      cwd: needleRepo,
      encoding: 'utf8',
      env: {
        ...process.env,
        HF_HOME: needleCacheHome,
        HF_HUB_DISABLE_XET: '1',
        PYTHONPATH: needleRepo,
      },
    },
  );
  assert.match(needleSmoke, /get_weather/i);
  assert.match(needleSmoke, /SanFrancisco|San Francisco/);

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
      ['_SYSTEM/Scripts/llm-compat.sh', '--model', 'deepseek-liberated:latest', 'local model policy check'],
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
    assert.equal(dispatchedArgs[0].endsWith('_SYSTEM/Scripts/offload-runner.mjs'), true);
    assert.equal(dispatchedArgs[1], 'deepseek-local');
    assert(dispatchedArgs.includes('--model'));
    assert(dispatchedArgs.includes('deepseek-liberated:latest'));
    assert(dispatchedArgs.includes('--dry-run'));

    execFileSync(
      'bash',
      ['_SYSTEM/Scripts/llm-compat.sh', 'deepseek-v4-flash', 'lane-first compatibility check'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_FILE: captureFile,
          PATH: `${offloadCaptureRoot}:${process.env.PATH}`,
          LLM_COMPAT_QUEUE_BYPASS: '1',
        },
      }
    );

    const laneFirstArgs = readFileSync(captureFile, 'utf8').trim().split('\n');
    assert.equal(laneFirstArgs[0].endsWith('_SYSTEM/Scripts/offload-runner.mjs'), true);
    assert.equal(laneFirstArgs[1], 'deepseek-v4-flash');

    execFileSync(
      'bash',
      ['_SYSTEM/Scripts/llm-compat.sh', '--model', 'needle', 'needle smoke test'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_FILE: captureFile,
          PATH: `${offloadCaptureRoot}:${process.env.PATH}`,
          LLM_COMPAT_QUEUE_BYPASS: '1',
        },
      }
    );

    const needleArgs = readFileSync(captureFile, 'utf8').trim().split('\n');
    assert(needleArgs.some((arg) => arg.endsWith('_SYSTEM/Scripts/needle-adapter.mjs')));
    assert(needleArgs.includes('--input-type=module'));
  } finally {
    rmSync(offloadCaptureRoot, { recursive: true, force: true });
  }

  const deepseekCloudCaptureRoot = mkdtempSync(join(tmpdir(), 'yuri-deepseek-cloud-normalization-'));
  try {
    const nodeStub = join(deepseekCloudCaptureRoot, 'node');
    const captureFile = join(deepseekCloudCaptureRoot, 'capture.txt');
writeFileSync(nodeStub, `#!/usr/bin/env bash
set -euo pipefail
: "\${CAPTURE_FILE:?missing capture file}"
printf '%s\n' "$@" > "$CAPTURE_FILE"
`);
    chmodSync(nodeStub, 0o755);

    execFileSync(
      'bash',
      ['_SYSTEM/Scripts/llm-compat.sh', '--model', 'deepseek-v4-pro:max-reasoning', 'cloud reasoning policy check'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_FILE: captureFile,
          PATH: `${deepseekCloudCaptureRoot}:${process.env.PATH}`,
          LLM_COMPAT_QUEUE_BYPASS: '1',
        },
      }
    );

    const dispatchedArgs = readFileSync(captureFile, 'utf8').trim().split('\n');
    assert.equal(dispatchedArgs[0].endsWith('_SYSTEM/Scripts/offload-runner.mjs'), true);
    assert.equal(dispatchedArgs[1], 'deepseek-v4-pro');
    assert(dispatchedArgs.includes('--reasoning'));
    assert(dispatchedArgs.includes('xhigh'));
  } finally {
    rmSync(deepseekCloudCaptureRoot, { recursive: true, force: true });
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
