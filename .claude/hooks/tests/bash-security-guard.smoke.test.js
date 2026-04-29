#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../bash-security-guard.js');

let pass = 0;
let fail = 0;

function runHook(input) {
  const result = spawnSync('node', [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
  });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), status: result.status };
}

function parseOut(out) {
  if (!out.stdout) return null;
  try { return JSON.parse(out.stdout); } catch { return null; }
}

function assert(label, ok, detail = '') {
  if (ok) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

function bashInput(cmd) {
  return { tool_name: 'Bash', tool_input: { command: cmd } };
}

function expectBlock(label, cmd) {
  const out = runHook(bashInput(cmd));
  const p = parseOut(out);
  assert(label, out.status === 0 && p && p.hookSpecificOutput && p.hookSpecificOutput.permissionDecision === 'deny',
    `stdout=${JSON.stringify(out.stdout)}`);
}

function expectAdvisory(label, cmd) {
  const out = runHook(bashInput(cmd));
  const p = parseOut(out);
  assert(label, out.status === 0 && p && p.hookSpecificOutput && p.hookSpecificOutput.additionalContext && !p.hookSpecificOutput.permissionDecision,
    `stdout=${JSON.stringify(out.stdout)}`);
}

function expectPass(label, cmd) {
  const out = runHook(bashInput(cmd));
  assert(label, out.status === 0 && out.stdout === '', `stdout=${JSON.stringify(out.stdout)}`);
}

// --- Block cases ---
console.log('\nBlock cases:');
expectBlock('cat .env', 'cat .env');
expectBlock('cat ./.env', 'cat ./.env');
expectBlock('cat .claude/history.jsonl', 'cat .claude/history.jsonl');
expectBlock('cat .claude/memory-bus.json', 'cat .claude/memory-bus.json');
expectBlock('cat .claude/settings.local.json', 'cat .claude/settings.local.json');
expectBlock('cat .claude/state/session-state.json', 'cat .claude/state/session-state.json');
expectBlock('cat .claude/state/scout-bus.json', 'cat .claude/state/scout-bus.json');
expectBlock('cat .claude/state/scout-errors.log', 'cat .claude/state/scout-errors.log');
expectBlock('cat .claude/state/token-session.json', 'cat .claude/state/token-session.json');
expectBlock('bash -c "cat .env"', 'bash -c "cat .env"');
expectBlock('echo X > .env', 'echo X > .env');
expectBlock('rm -rf .claude', 'rm -rf .claude');
expectBlock('git add .claude', 'git add .claude');
expectBlock('git add -A .claude', 'git add -A .claude');

// --- Advisory cases ---
console.log('\nAdvisory cases:');
expectAdvisory('env', 'env');
expectAdvisory('printenv', 'printenv');
expectAdvisory('bash -c "ls"', 'bash -c "ls"');
expectAdvisory('python3 -c "print(1)"', 'python3 -c "print(1)"');
expectAdvisory('node -e "console.log(1)"', 'node -e "console.log(1)"');
expectAdvisory('git add .', 'git add .');
expectAdvisory('git reset --hard', 'git reset --hard');

// --- Pass / false-positive cases ---
console.log('\nPass cases:');
expectPass('git status', 'git status');
expectPass('pwd', 'pwd');
expectPass('cat .env.example', 'cat .env.example');
expectPass('cat .env.local', 'cat .env.local');
expectPass('cat .env.template', 'cat .env.template');
expectPass('cat README.env.md', 'cat README.env.md');
expectPass('cat .claude/settings.json', 'cat .claude/settings.json');
expectPass('git add .claude/hooks/new-hook.js', 'git add .claude/hooks/new-hook.js');
expectPass('echo "dotenv loaded"', 'echo "dotenv loaded"');

// --- Malformed / non-Bash cases ---
console.log('\nMalformed / non-Bash cases:');
{
  const out = runHook('not json at all }{');
  assert('malformed JSON exits 0 silently', out.status === 0 && out.stdout === '', `stdout=${JSON.stringify(out.stdout)}`);
}
{
  const out = runHook('');
  assert('empty input exits 0 silently', out.status === 0 && out.stdout === '', `stdout=${JSON.stringify(out.stdout)}`);
}
{
  const out = runHook({ tool_name: 'Read', tool_input: { file_path: '.env' } });
  assert('non-Bash tool passes silently', out.status === 0 && out.stdout === '', `stdout=${JSON.stringify(out.stdout)}`);
}
{
  const out = runHook({ tool_name: 'Bash', tool_input: {} });
  assert('Bash with no command passes silently', out.status === 0 && out.stdout === '', `stdout=${JSON.stringify(out.stdout)}`);
}

// --- Summary ---
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
