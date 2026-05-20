#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = new Set(process.argv.slice(2));
const includeBrowser = !args.has('--skip-browser');

const checks = [
  ['syntax:rails', process.execPath, ['--check', '_SYSTEM/Scripts/rails.mjs']],
  ['syntax:yuri-control-plane', process.execPath, ['--check', '_SYSTEM/Scripts/yuri-control-plane.mjs']],
  ['syntax:memory-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/memory-kernel.mjs']],
  ['syntax:automation-kernel', process.execPath, ['--check', '_SYSTEM/Scripts/automation-kernel.mjs']],
  ['syntax:shintai-dispatch', process.execPath, ['--check', '_SYSTEM/Scripts/shintai-dispatch.mjs']],
  ['syntax:rick-repl', process.execPath, ['--check', '_SYSTEM/Scripts/rick-repl.mjs']],
  ['test:rails', process.execPath, ['--test', '_SYSTEM/Scripts/rails.test.mjs']],
  ['test:yuri-control-plane', process.execPath, ['--test', '_SYSTEM/Scripts/yuri-control-plane.test.mjs']],
  ['test:memory-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/memory-kernel.test.mjs']],
  ['test:automation-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/automation-kernel.test.mjs']],
  ['test:lane-kernel', process.execPath, ['--test', '_SYSTEM/Scripts/lane-kernel.test.mjs']],
  ['test:rick-harness-runtime', process.execPath, ['--test', '_SYSTEM/Scripts/rick-harness-runtime.test.mjs']],
  ['offload:contract-regression', process.execPath, ['_SYSTEM/Scripts/offload-contract-regression.test.mjs']],
  ['offload:dispatch-drift', process.execPath, ['_SYSTEM/Scripts/offload-contract-dispatch-check.mjs']],
];

if (includeBrowser) {
  checks.push(['browser-harness:health', 'bash', ['_SYSTEM/Scripts/browser-harness-runner.sh', '--health']]);
}

const results = checks.map(([name, command, commandArgs]) => {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: name.startsWith('test:rick') ? 20_000 : 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    name,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    ms: Date.now() - started,
    stdout: tail(result.stdout),
    stderr: tail(result.stderr || result.error?.message || ''),
  };
});

for (const result of results) {
  process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.name} ${result.ms}ms\n`);
  if (!result.ok) {
    if (result.stdout) process.stdout.write(result.stdout + '\n');
    if (result.stderr) process.stderr.write(result.stderr + '\n');
  }
}

const ok = results.every((result) => result.ok);
process.stdout.write(`${ok ? 'YURI_SUPERCHARGE_GATE_PASS' : 'YURI_SUPERCHARGE_GATE_FAIL'}\n`);
process.exit(ok ? 0 : 1);

function tail(value, max = 4000) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(-max) : text;
}
