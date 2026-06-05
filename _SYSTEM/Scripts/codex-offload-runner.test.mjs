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
const repoRoot = path.resolve(__dirname, '..', '..');
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


  // DeepSeek dispatch now runs through the minimal llm-lane.mjs core (offload-runner.mjs retired).
  const protectedEnvHydration = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'set -a; source .env; set +a; OFFLOAD_PROMPT_TEXT="Return OK" node _SYSTEM/Scripts/llm-lane.mjs deepseek',
  });
  assert.equal(protectedEnvHydration.allowed, true, 'Direct DeepSeek runner should be allowed to read .env for key hydration');

  const protectedEnvWrite = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'echo SECRET=mutated >> .env; OFFLOAD_PROMPT_TEXT="Return OK" node _SYSTEM/Scripts/llm-lane.mjs deepseek',
  });
  assert.equal(protectedEnvWrite.allowed, false, 'DeepSeek hook allowance must not permit .env writes');

  const protectedClaudeProjectWrite = evaluateToolCall('write_file', {
    path: '.claude/projects/session.json',
  }, { cwd: repoRoot });
  assert.equal(protectedClaudeProjectWrite.allowed, false, 'Claude project runtime writes must stay blocked');

  const protectedAmpWrite = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'touch .amp/runtime.json',
  });
  assert.equal(protectedAmpWrite.allowed, false, '.amp runtime mutation must stay blocked');

  const pluginRouteStamp = path.join(tempRoot, 'context-router-last.json');
  const pluginBeforeRoute = evaluateToolCall('mcp__codex_apps__github._list_installed_accounts', {}, {
    routeStampPath: pluginRouteStamp,
    now: 1000,
  });
  assert.equal(pluginBeforeRoute.allowed, false, 'Codex app/plugin tools must route through context-router first');

  const routeCommand = evaluateToolCall('Bash', {
    cwd: repoRoot,
    command: 'node _SYSTEM/Scripts/context-router.mjs "github plugin task"',
  }, {
    routeStampPath: pluginRouteStamp,
    now: 1000,
  });
  assert.equal(routeCommand.allowed, true, 'context-router command should be allowed');
  assert.equal(fs.existsSync(pluginRouteStamp), true, 'context-router command should stamp the plugin gate');

  const pluginAfterRoute = evaluateToolCall('mcp__codex_apps__github._list_installed_accounts', {}, {
    routeStampPath: pluginRouteStamp,
    now: 1000,
  });
  assert.equal(pluginAfterRoute.allowed, true, 'Codex app/plugin tools should be allowed after fresh routing');

  const emptyResponseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-offload-runner-empty-'));
  try {
    const tempRunnerDir = path.join(emptyResponseRoot, 'runner');
    const tempBinDir = path.join(tempRunnerDir, 'bin');
    fs.mkdirSync(tempBinDir, { recursive: true });

    const stubCodex = path.join(tempBinDir, 'codex');
    fs.writeFileSync(stubCodex, '#!/usr/bin/env bash\nexit 0\n');
    fs.chmodSync(stubCodex, 0o755);

    const tempScript = path.join(tempRunnerDir, 'codex-offload-runner.mjs');
    const tempTokenLedger = path.join(tempRunnerDir, 'token-ledger.mjs');
    fs.mkdirSync(tempRunnerDir, { recursive: true });
    fs.copyFileSync(script, tempScript);
    fs.copyFileSync(path.join(__dirname, 'token-ledger.mjs'), tempTokenLedger);
    fs.writeFileSync(
      tempScript,
      fs.readFileSync(tempScript, 'utf8').replace(
        "const codexBin = '/opt/homebrew/bin/codex';",
        `const codexBin = ${JSON.stringify(stubCodex)};`,
      ),
    );

    let failure = null;
    try {
      execFileSync(
        process.execPath,
        [tempScript, '--artifact-dir', path.join(emptyResponseRoot, 'artifacts'), 'empty response probe'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            TOKEN_LEDGER_DB_PATH: path.join(emptyResponseRoot, 'token-ledger.db'),
            TOKEN_LEDGER_FAULT_DIR: path.join(emptyResponseRoot, 'faults'),
            TOKEN_LEDGER_QUEUE_DIR: path.join(emptyResponseRoot, 'queue'),
            TOKEN_LEDGER_VAULT_DIR: path.join(emptyResponseRoot, 'vault'),
          },
        },
      );
    } catch (error) {
      failure = error;
    }

    assert(failure, 'runner should exit non-zero on empty non-skip response');
    assert.equal(failure.status, 1, 'empty non-skip response should exit with code 1');
    assert.match(failure.stderr, /\[codex\] empty response — check quota or task spec/);
  } finally {
    fs.rmSync(emptyResponseRoot, { recursive: true, force: true });
  }

  process.stdout.write('codex-offload-runner: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
