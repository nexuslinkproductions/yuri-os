// directive-guard.test.mjs — node --test directive-guard.test.mjs
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { processEvent, clearDirectiveCache, buildActionSignature, matchPattern, parseFrontmatter } from './directive-guard.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH  = join(__dirname, 'directive-guard.mjs');

// ── Fixture directive ──────────────────────────────────────────
const DIRECTIVE_MD = `\
---
handle: mimo-context
tier: observe
description: "Mimo runs require large context"
conditions:
  - "bash:*mimo*"
constraints:
  - kind: bash_flag_below
    flag: "--max"
    min: 131072
    message: "mimo --max should be >= 131072 (128k tokens) for adequate context"
---
Standing directive for Mimo tool usage.
`;

// ── Helper: run hook as child process ──────────────────────────
function runHook(stdinInput) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.stdin.end(stdinInput ?? '');
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ exitCode: -1, stdout, stderr: 'TIMEOUT' }); }, 5000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? -1, stdout, stderr }); });
    child.on('error',    ()    => { clearTimeout(timer); resolve({ exitCode: -1, stdout, stderr: 'spawn error' }); });
  });
}

// ── Tests ──────────────────────────────────────────────────────
describe('directive-guard', () => {
  let tmpDir, memoryDir, auditLog;

  before(async () => {
    tmpDir    = await mkdtemp(join(tmpdir(), 'dg-test-'));
    memoryDir = join(tmpDir, 'memory');
    auditLog  = join(tmpDir, 'audit.log');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'mimo-directives.md'), DIRECTIVE_MD, 'utf-8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(() => clearDirectiveCache());

  it('(a) surfaces directive + would-warn for --max 8192', async () => {
    const result = await processEvent(
      { session_id: 't-a', tool_name: 'Bash', tool_input: { command: 'node mimo.mjs --max 8192' } },
      { memoryDir, auditLog },
    );
    assert.ok(result, 'should return a result');
    assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.match(ctx, /\[DIRECTIVE: mimo-context\]/, 'must contain directive handle');
    assert.match(ctx, /would-warn/, 'must contain would-warn');
    assert.match(ctx, /131072/, 'must reference the min threshold');
    const log = await readFile(auditLog, 'utf-8');
    const entries = log.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const warns = entries.filter(e => e.action === 'would_warn' && e.directive === 'mimo-context');
    assert.ok(warns.length > 0, 'audit log must contain a would_warn entry');
    assert.equal(warns[warns.length - 1].kind, 'bash_flag_below');
  });

  it('(b) surfaces directive without would-warn for compliant --max 131072', async () => {
    const result = await processEvent(
      { session_id: 't-b', tool_name: 'Bash', tool_input: { command: 'node mimo.mjs --max 131072' } },
      { memoryDir, auditLog },
    );
    assert.ok(result, 'should return a result (directive matches)');
    const ctx = result.hookSpecificOutput.additionalContext;
    assert.match(ctx, /\[DIRECTIVE: mimo-context\]/, 'must surface the directive');
    assert.ok(!ctx.includes('would-warn'), 'must NOT have would-warn for compliant value');
  });

  it('(c) returns null for unrelated ls command', async () => {
    const result = await processEvent(
      { session_id: 't-c', tool_name: 'Bash', tool_input: { command: 'ls -la' } },
      { memoryDir, auditLog },
    );
    assert.strictEqual(result, null, 'must return null — no directives match');
  });

  it('(d-1) empty stdin → exit 0, no stdout', async () => {
    const { exitCode, stdout } = await runHook('');
    assert.strictEqual(exitCode, 0, 'must exit 0');
    assert.strictEqual(stdout, '', 'must produce no stdout');
  });

  it('(d-2) malformed JSON stdin → exit 0, no stdout', async () => {
    const { exitCode, stdout } = await runHook('{broken json !@#$%');
    assert.strictEqual(exitCode, 0, 'must exit 0');
    assert.strictEqual(stdout, '', 'must produce no stdout');
  });

  it('(d-3) valid JSON but non-object (null) → exit 0, no stdout', async () => {
    const { exitCode, stdout } = await runHook('null');
    assert.strictEqual(exitCode, 0, 'must exit 0');
    assert.strictEqual(stdout, '', 'must produce no stdout');
  });

  it('(e) output never contains permissionDecision or deny', async () => {
    const result = await processEvent(
      { session_id: 't-e', tool_name: 'Bash', tool_input: { command: 'node mimo.mjs --max 1' } },
      { memoryDir, auditLog },
    );
    if (result) {
      const json = JSON.stringify(result);
      assert.ok(!json.includes('permissionDecision'), 'must never contain permissionDecision');
      assert.ok(!json.includes('"deny"'),             'must never contain deny string');
      assert.ok(!('permissionDecision' in result),     'result must not have permissionDecision key');
    }
    const { exitCode, stdout } = await runHook(JSON.stringify({
      session_id: 't-e2',
      tool_name: 'Bash',
      tool_input: { command: 'node mimo.mjs --max 1' },
    }));
    assert.strictEqual(exitCode, 0, 'spawned process must exit 0');
    if (stdout) {
      const parsed = JSON.parse(stdout);
      assert.ok(!('permissionDecision' in parsed), 'spawned output must not have permissionDecision');
    }
  });

  it('buildActionSignature formats correctly', () => {
    assert.equal(buildActionSignature({ tool_name: 'Bash', tool_input: { command: 'ls' } }), 'bash:ls');
    assert.equal(buildActionSignature({ tool_name: 'Write', tool_input: { file_path: '/tmp/f.txt' } }), 'write:/tmp/f.txt');
    assert.equal(buildActionSignature({ tool_name: 'Read', tool_input: {} }), 'read:');
    assert.equal(buildActionSignature({}), ':');
  });

  it('matchPattern handles glob and substring', () => {
    assert.ok(matchPattern('bash:*mimo*',   'bash:node mimo.mjs --max 8192'));
    assert.ok(!matchPattern('bash:*mimo*',  'bash:ls -la'));
    assert.ok(matchPattern('deploy',        'bash:deploy --prod'));
    assert.ok(!matchPattern('deploy',       'bash:ls -la'));
  });

  it('parseFrontmatter parses directive structure', () => {
    const fm = parseFrontmatter(DIRECTIVE_MD);
    assert.equal(fm.handle, 'mimo-context');
    assert.equal(fm.tier, 'observe');
    assert.deepStrictEqual(fm.conditions, ['bash:*mimo*']);
    assert.equal(fm.constraints.length, 1);
    assert.equal(fm.constraints[0].kind, 'bash_flag_below');
    assert.equal(fm.constraints[0].min, 131072);
  });

  it('parseFrontmatter returns null for files without frontmatter', () => {
    assert.strictEqual(parseFrontmatter('# Just a readme\nNo frontmatter here.'), null);
  });
});
