// energy-enforce.test.mjs — process-level test for the PEP hook (B2, audit blocker).
//
// The block channel (stdin event JSON → stdout {permissionDecision:'deny'}) is the ONLY
// component that actually blocks a tool, and the metrics-only burn-in never exercises the
// emit() path. This spawns the hook as a real subprocess (the harness contract) and asserts
// the deny shape + every fail-open path + the B1 pure-read invariant (enforce never mutates
// the snapshot). Hermetic via YURI_STATE_DIR. Pattern mirrors directive-guard.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshBreaker } from '../../_SYSTEM/Scripts/energy-breaker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, 'energy-enforce.mjs');
const SESSION = 'enf-test-sess';

// Run the hook as a subprocess with a hermetic state dir + explicit energy env (the session
// env already has YURI_ENERGY_ENFORCE=1, so we set each var explicitly per scenario).
function runHook({ event, env }) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env };
    delete childEnv.YURI_ENERGY_ENFORCE;
    delete childEnv.YURI_ENERGY_OBSERVABILITY;
    delete childEnv.YURI_ENERGY_BREAKER_RESET;
    Object.assign(childEnv, env);
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.end(JSON.stringify(event ?? {}));
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: -1, stdout, stderr: 'TIMEOUT' }); }, 5000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: 'spawn-error' }); });
  });
}

// Build a hermetic state dir; optionally seed a snapshot with a given breaker.
function withState(breaker) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enf-'));
  const snapDir = path.join(dir, 'energy-session');
  fs.mkdirSync(snapDir, { recursive: true });
  const snapPath = path.join(snapDir, `${SESSION}.json`);
  if (breaker) fs.writeFileSync(snapPath, JSON.stringify({ breaker, sessionId: SESSION, state: { depth: 1 } }) + '\n');
  return { dir, snapPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const OPEN = { ...freshBreaker(), state: 'OPEN', openedAt: Date.now() };       // within cooldown → deny
const CLOSED = freshBreaker();                                                 // → allow
const EVENT = { session_id: SESSION, tool_name: 'Bash', tool_input: { command: 'echo hi' } };
const denies = (out) => { try { return JSON.parse(out).hookSpecificOutput?.permissionDecision === 'deny'; } catch { return false; } };

test('B2-1 no snapshot → FAIL-OPEN (no deny, exit 0)', async () => {
  const s = withState(null);
  try {
    const r = await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_OBSERVABILITY: '1', YURI_ENERGY_ENFORCE: '1' } });
    assert.equal(denies(r.stdout), false, 'no snapshot must fail open (allow)');
    assert.equal(r.code, 0);
  } finally { s.cleanup(); }
});

test('B2-2 breaker OPEN + enforce ARMED → permissionDecision:deny', async () => {
  const s = withState(OPEN);
  try {
    const r = await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_OBSERVABILITY: '1', YURI_ENERGY_ENFORCE: '1' } });
    assert.equal(denies(r.stdout), true, 'OPEN breaker under enforce must emit deny');
    assert.equal(r.code, 0, 'deny rides on exit 0 + JSON (per the harness contract)');
  } finally { s.cleanup(); }
});

test('B2-3 breaker CLOSED → allow (no deny)', async () => {
  const s = withState(CLOSED);
  try {
    const r = await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_OBSERVABILITY: '1', YURI_ENERGY_ENFORCE: '1' } });
    assert.equal(denies(r.stdout), false, 'CLOSED breaker must allow');
  } finally { s.cleanup(); }
});

test('B2-4 observability OFF → no-op (master switch)', async () => {
  const s = withState(OPEN);
  try {
    const r = await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_ENFORCE: '1' } }); // no OBSERVABILITY
    assert.equal(denies(r.stdout), false, 'observability off → no verdicts at all');
    assert.equal(r.stdout.trim(), '', 'no output when the master switch is off');
  } finally { s.cleanup(); }
});

test('B2-5 enforce OFF (metrics-only) → OPEN breaker is audited, NOT blocked', async () => {
  const s = withState(OPEN);
  try {
    const r = await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_OBSERVABILITY: '1' } }); // no ENFORCE
    assert.equal(denies(r.stdout), false, 'metrics-only must never emit a real deny');
  } finally { s.cleanup(); }
});

test('B2-6 (B1 pure-read invariant) enforce NEVER mutates the snapshot on the main path', async () => {
  const s = withState(OPEN);
  try {
    const before = fs.readFileSync(s.snapPath, 'utf8');
    await runHook({ event: EVENT, env: { YURI_STATE_DIR: s.dir, YURI_ENERGY_OBSERVABILITY: '1', YURI_ENERGY_ENFORCE: '1' } });
    const after = fs.readFileSync(s.snapPath, 'utf8');
    assert.equal(after, before, 'enforce must be pure-read — it cannot clobber tick’s snapshot (B1 race fix)');
  } finally { s.cleanup(); }
});
