#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../claude-protocol-guard.js');

function runHook(input) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function parseHookOutput(result) {
  if (!result.stdout) return null;
  return JSON.parse(result.stdout);
}

function warningFor(input) {
  const result = runHook(input);
  assert.equal(result.status, 0, result.stderr);
  const parsed = parseHookOutput(result);
  return parsed?.hookSpecificOutput?.additionalContext || '';
}

function expectWarning(name, input, marker) {
  const warning = warningFor(input);
  assert.ok(warning.includes('<claude-protocol-gate severity="WARN">'), `${name}: missing gate warning`);
  assert.ok(warning.includes(marker), `${name}: missing marker ${marker}`);
  const parsed = parseHookOutput(runHook(input));
  assert.equal(parsed?.hookSpecificOutput?.permissionDecision, undefined, `${name}: must not deny`);
}

function expectPass(name, input) {
  const result = runHook(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', `${name}: expected silent pass`);
}

function bash(command) {
  return { tool_name: 'Bash', tool_input: { command } };
}

expectWarning(
  'direct mutation without Claude packet',
  { tool_name: 'Edit', tool_input: { file_path: 'CLAUDE.md', old_string: 'a', new_string: 'b' } },
  'missing-control-packet',
);

expectWarning(
  'Codex dispatch without task spec',
  bash('codex exec "fix the route planner"'),
  'missing-codex-task-spec',
);

expectPass(
  'Codex dispatch with valid task spec',
  bash(`codex exec "## CODEX TASK SPEC

**Goal:** fix route planner

**Target files:**
- _SYSTEM/Scripts/llm-compat-contract.mjs - route classification

**Constraints:**
- no new dependencies

**Acceptance criteria:**
- [ ] route plan test passes

**Test command:** \`npm run test:llm-compat-contract\`

**Rollback boundary:** \`git diff HEAD\`

**Prohibited:**
- No auto-commit"`),
);

expectWarning(
  'high-risk route-plan evidence warning',
  bash('node _SYSTEM/Scripts/llm-compat-contract.mjs route-plan "promote protocol routing memory into canonical state"'),
  'missing-route-plan-evidence',
);

process.stdout.write('claude-protocol-guard: pass\n');
