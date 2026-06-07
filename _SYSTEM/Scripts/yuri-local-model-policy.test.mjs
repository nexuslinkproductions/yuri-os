#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ollamaLanePath = resolve(__dirname, 'ollama-lane.mjs');
const benchmarkPath = resolve(__dirname, 'yuri-local-model-benchmark.mjs');
const llmCompatPath = resolve(__dirname, 'llm-compat.sh');

const tempRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-'));

try {
  const manifestRoot = join(tempRoot, 'manifests');
  const binRoot = join(tempRoot, 'bin');
  mkdirSync(binRoot, { recursive: true });
  writeFileSync(join(binRoot, 'ollama'), `#!/usr/bin/env bash
if [[ "\${1:-}" == "list" ]]; then
  printf 'NAME ID SIZE MODIFIED\\n'
  exit 0
fi
exit 1
`);
  chmodSync(join(binRoot, 'ollama'), 0o755);

  for (const model of ['gemma4:12b-it-qat', 'gemma4:e2b', 'needle']) {
    const [name, tag] = model.split(':');
    mkdirSync(join(manifestRoot, name), { recursive: true });
    writeFileSync(join(manifestRoot, name, tag || 'latest'), '{}');
  }

  const env = {
    ...process.env,
    PATH: `${binRoot}:${process.env.PATH}`,
    OLLAMA_MANIFEST_DIR: manifestRoot,
    OLLAMA_API_KEY: '',
    OLLAMA_CLOUD_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    CODE_DEEPSEEK_API_KEY: '',
    YURI_KEYCHAIN_SERVICE_PREFIX: 'YURI_OS_MUSUBI_TEST_NO_KEYS',
  };

  for (const lane of ['triage-local', 'summarize-local', 'ollama', 'ollama-local', 'gpt-oss', 'code-local', 'gemma-local']) {
    const resolved = routeLane(lane, env);
    assert.equal(resolved.kind, 'local', `${lane} should resolve locally`);
    assert.equal(resolved.model, 'gemma4:12b-it-qat', `${lane} should select Gemma 4 12B QAT only`);
  }

  {
    const resolved = routeLane('gemma-local', env, ['--model', 'gemma4:e2b']);
    assert.equal(resolved.model, 'gemma4:12b-it-qat');
  }

  {
    const resolved = JSON.parse(execFileSync(
      'bash',
      [llmCompatPath, '--model', 'needle', '--dry-run', 'retired needle compatibility check'],
      { encoding: 'utf8', env },
    ));
    assert.equal(resolved.lane, 'gemma-local');
    assert.equal(resolved.model, 'gemma4:12b-it-qat');
  }

  {
    const benchmark = JSON.parse(execFileSync(
      process.execPath,
      [benchmarkPath, '--dry-run', '--json'],
      { encoding: 'utf8', env },
    ));
    assert.equal(benchmark.dry_run, true);
    assert.equal(benchmark.policy.utility, 'gemma4:12b-it-qat');
    assert.equal(benchmark.policy.primary, 'gemma4:12b-it-qat');
    assert.equal(benchmark.policy.code, 'gemma4:12b-it-qat');
    assert.deepEqual(benchmark.policy.active_routed_models, ['gemma4:12b-it-qat']);
    assert.equal(benchmark.acceptance.reasoning_enabled_by_default, true);
    assert.equal(benchmark.summary.failed, 0);
    assert.deepEqual(benchmark.summary.non_policy_models_selected, []);
  }

  {
    const emptyManifest = join(tempRoot, 'empty-manifest');
    mkdirSync(emptyManifest, { recursive: true });
    const blocked = spawnSync(
      process.execPath,
      [ollamaLanePath, 'gemma-local', '--dry-run', 'missing model check'],
      { encoding: 'utf8', env: { ...env, OLLAMA_MANIFEST_DIR: emptyManifest } },
    );
    assert.equal(blocked.status, 1);
    const payload = JSON.parse(blocked.stdout);
    assert.equal(payload.model, 'gemma4:12b-it-qat');
    assert.match(payload.error, /gemma4:12b-it-qat/);
    assert.doesNotMatch(payload.error, /needle|e2b/i);
  }

  process.stdout.write('yuri-local-model-policy: pass\n');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function routeLane(lane, env, extraArgs = []) {
  return JSON.parse(execFileSync(
    process.execPath,
    [ollamaLanePath, lane, '--dry-run', 'local model policy check', ...extraArgs],
    { encoding: 'utf8', env },
  ));
}
