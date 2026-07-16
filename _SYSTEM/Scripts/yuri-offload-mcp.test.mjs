#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ADAPTER = path.join(ROOT, '.codex/adapters/yuri-offload-mcp.mjs');

function rpc(request) {
  const run = spawnSync(process.execPath, [ADAPTER], {
    cwd: ROOT,
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1, run.stdout);
  return JSON.parse(lines[0]);
}

function toolCall(arguments_) {
  return rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'yuri.offload_task', arguments: arguments_ },
  });
}

test('tool schema is closed and advertises disabled attachments', () => {
  const response = rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const schema = response.result.tools[0].inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.files.maxItems, 0);
  assert.deepEqual(new Set(schema.properties.lane_hint.enum), new Set(['deepseek-v4-pro', 'deepseek-v4-flash']));
});

test('file attachments are rejected before any path can be read', () => {
  for (const file of ['README.md', '../outside.txt', '.git/config']) {
    const response = toolCall({ prompt: 'bounded', files: [file], dry_run: true });
    assert.match(response.error.message, /file attachments are disabled/i, file);
  }
});

test('unknown keys, unsupported lanes, duplicate fanout, and malformed budgets fail closed', () => {
  const cases = [
    [{ prompt: 'x', rogue: true }, /unknown argument key/],
    [{ prompt: 'x', lane_hint: 'codex' }, /unsupported lane/],
    [{ prompt: 'x', fanout_lanes: ['deepseek-v4-pro', 'deepseek-v4-pro'] }, /must not contain duplicates/],
    [{ prompt: 'x', budget_tokens: 1.5 }, /budget_tokens must be an integer/],
  ];
  for (const [args, expected] of cases) {
    const response = toolCall(args);
    assert.match(response.error.message, expected);
  }
});

test('mutation_allowed=true is rejected before task creation', () => {
  const response = toolCall({ prompt: 'x', mutation_allowed: true });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /mutation_allowed=true is blocked/);
});
