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

// PROMOTED 2026-06-13: qwen-local is the default local SLM (primary/utility/code/deep_reasoning);
// gemma4:12b-it-qat retained as fallback + the `gemma`/multimodal slots. This test asserts the new
// policy: generic local lanes resolve to qwen when installed; the gemma-local lane stays on gemma;
// when NOTHING is installed the lane is blocked referencing the gemma candidate.
const QWEN = 'hf.co/Jackrong/Qwen3.5-9B-GLM5.1-Distill-v1-GGUF:Q5_K_M';
const GEMMA = 'gemma4:12b-it-qat';

const tempRoot = mkdtempSync(join(tmpdir(), 'yuri-local-model-policy-'));

try {
  const manifestRoot = join(tempRoot, 'manifests');
  const binRoot = join(tempRoot, 'bin');
  mkdirSync(binRoot, { recursive: true });
  // Fake ollama: `list` reports BOTH the promoted qwen primary and the gemma fallback as installed.
  writeFileSync(join(binRoot, 'ollama'), `#!/usr/bin/env bash
if [[ "\${1:-}" == "list" ]]; then
  printf 'NAME ID SIZE MODIFIED\\n'
  printf '%s\\n' '${QWEN}  aaa  6.4GB  now'
  printf '%s\\n' '${GEMMA}  bbb  7.1GB  now'
  exit 0
fi
exit 1
`);
  chmodSync(join(binRoot, 'ollama'), 0o755);

  for (const model of [GEMMA, 'gemma4:e2b', 'needle']) {
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

  // Generic local lanes resolve to the promoted qwen primary when it is installed.
  for (const lane of ['triage-local', 'summarize-local', 'ollama', 'ollama-local', 'gpt-oss', 'code-local']) {
    const resolved = routeLane(lane, env);
    assert.equal(resolved.kind, 'local', `${lane} should resolve locally`);
    assert.equal(resolved.model, QWEN, `${lane} should select the promoted qwen local primary`);
  }

  // The gemma-local lane stays pinned to gemma (its own candidate set), not qwen.
  {
    const resolved = routeLane('gemma-local', env);
    assert.equal(resolved.kind, 'local');
    assert.equal(resolved.model, GEMMA, 'gemma-local lane stays on gemma4:12b-it-qat');
  }

  // A retired alias forced onto the gemma lane still normalizes to gemma4:12b-it-qat.
  {
    const resolved = routeLane('gemma-local', env, ['--model', 'gemma4:e2b']);
    assert.equal(resolved.model, GEMMA);
  }

  {
    const resolved = JSON.parse(execFileSync(
      'bash',
      [llmCompatPath, '--model', 'needle', '--dry-run', 'retired needle compatibility check'],
      { encoding: 'utf8', env },
    ));
    assert.equal(resolved.lane, 'gemma-local');
    assert.equal(resolved.model, GEMMA);
  }

  {
    const benchmark = JSON.parse(execFileSync(
      process.execPath,
      [benchmarkPath, '--dry-run', '--json'],
      { encoding: 'utf8', env },
    ));
    assert.equal(benchmark.dry_run, true);
    assert.equal(benchmark.policy.utility, QWEN, 'utility promoted to qwen');
    assert.equal(benchmark.policy.primary, QWEN, 'primary promoted to qwen');
    assert.equal(benchmark.policy.code, QWEN, 'code promoted to qwen');
    assert.ok(benchmark.policy.active_routed_models.includes(QWEN), 'active set includes qwen');
    assert.ok(benchmark.policy.active_routed_models.includes(GEMMA), 'active set still includes gemma fallback');
    assert.equal(benchmark.acceptance.reasoning_enabled_by_default, true);
    assert.equal(benchmark.summary.failed, 0, 'all scenarios planned (qwen + gemma installed in fake env)');
    // Policy-driven now: every selected model is in policy, so nothing is flagged non-policy.
    assert.deepEqual(benchmark.summary.non_policy_models_selected, []);
  }

  {
    // Nothing installed -> the gemma-local lane is blocked, referencing the gemma candidate only.
    const emptyManifest = join(tempRoot, 'empty-manifest');
    const emptyBin = join(tempRoot, 'empty-bin');
    mkdirSync(emptyManifest, { recursive: true });
    mkdirSync(emptyBin, { recursive: true });
    writeFileSync(join(emptyBin, 'ollama'), "#!/usr/bin/env bash\nif [[ \"${1:-}\" == \"list\" ]]; then printf 'NAME ID SIZE MODIFIED\\n'; exit 0; fi\nexit 1\n");
    chmodSync(join(emptyBin, 'ollama'), 0o755);
    const blocked = spawnSync(
      process.execPath,
      [ollamaLanePath, 'gemma-local', '--dry-run', 'missing model check'],
      { encoding: 'utf8', env: { ...env, PATH: `${emptyBin}:${process.env.PATH}`, OLLAMA_MANIFEST_DIR: emptyManifest } },
    );
    assert.equal(blocked.status, 1);
    const payload = JSON.parse(blocked.stdout);
    assert.equal(payload.model, GEMMA);
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
