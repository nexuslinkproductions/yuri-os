#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateToolCall } from './policy/yuri-safety-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'codex-offload-runner.mjs');
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-offload-runner-test-'));

try {
  const workspace = path.join(tempRoot, 'workspace');
  const artifacts = path.join(tempRoot, 'artifacts');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), '# isolated workspace\n');

  execFileSync(
    process.execPath,
    [script, '--dry-run', '--cd', workspace, '--artifact-dir', artifacts, 'isolation smoke'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        YURI_DB_PATH: path.join(tempRoot, 'sandbox-learning.db'),
      },
    },
  );
  const preview = JSON.parse(fs.readFileSync(path.join(artifacts, 'dry-run.json'), 'utf8'));
  assert.equal(preview.workspaceRoot, workspace, 'workspace root missing from preview');
  assert(preview.command.includes('--cd'), 'codex command should include --cd');
  assert.equal(preview.command[preview.command.indexOf('--cd') + 1], workspace, 'codex --cd should target isolated workspace');
  assert.equal(preview.env_redirects.YURI_DB_PATH, path.join(tempRoot, 'sandbox-learning.db'), 'sandbox DB redirect should be visible');
  assert.equal(preview.timeoutMs, 21600000, 'Codex Spark default timeout must allow long offload work');

  const codexConfig = fs.readFileSync(path.join(repoRoot, '.codex/config.toml'), 'utf8');
  const offloadMcpConfig = codexConfig.match(/\[mcp_servers\.yuriOffload\]([\s\S]*?)(?=\n\[|\n\[\[|$)/);
  assert(offloadMcpConfig, 'yuriOffload MCP config missing');
  const timeoutMatch = offloadMcpConfig[1].match(/\btool_timeout_sec\s*=\s*(\d+)/);
  assert(timeoutMatch, 'yuriOffload tool_timeout_sec missing');
  assert(
    Number(timeoutMatch[1]) >= 21600,
    'yuriOffload MCP timeout must not reintroduce the 180s offload cap',
  );

  const responsesPreview = JSON.parse(execFileSync(
    process.execPath,
    [path.join(__dirname, 'offload-runner.mjs'), 'codex', '--dry-run', 'timeout smoke'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));
  assert.equal(responsesPreview.timeout, 21600000, 'Codex Responses default timeout must allow long offload work');

  const deepseekPreview = JSON.parse(execFileSync(
    process.execPath,
    [path.join(__dirname, 'offload-runner.mjs'), 'deepseek-v4-pro:max-reasoning', '--dry-run', 'timeout smoke'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DEEPSEEK_API_KEY: 'test-key' },
    },
  ));
  assert.equal(deepseekPreview.timeout, 21600000, 'DeepSeek Pro default timeout must allow long offload work');

  const protectedEnvHydration = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'set -a; source .env; set +a; OFFLOAD_PROMPT_TEXT="Return OK" node _SYSTEM/Scripts/offload-runner.mjs deepseek-v4-pro',
  });
  assert.equal(protectedEnvHydration.allowed, true, 'DeepSeek direct runner should be allowed to read .env for key hydration');

  const protectedEnvWrite = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'echo SECRET=mutated >> .env; OFFLOAD_PROMPT_TEXT="Return OK" node _SYSTEM/Scripts/offload-runner.mjs deepseek-v4-pro',
  });
  assert.equal(protectedEnvWrite.allowed, false, 'DeepSeek hook allowance must not permit .env writes');

  process.stdout.write('codex-offload-runner: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
