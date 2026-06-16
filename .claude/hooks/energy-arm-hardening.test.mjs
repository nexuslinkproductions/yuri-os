// energy-arm-hardening.test.mjs — B3 (audit blocker): the energy-enforce arm flag and the
// breaker snapshot dir must NOT be self-disarmable by a coworker-role model via Bash.
//
// ROLE_TRUST_SURFACES (lane-kernel.mjs) now lists `_SYSTEM/state/energy-enforce.enabled` (file)
// and `_SYSTEM/state/energy-session` (dir); bash-security-guard reads that surface and blocks
// coworker mutation. Coworker role is forced by running with YURI_DEV_KEY UNSET (resolveRole
// fail-closes to coworker when the dev key is absent + the credential exists). The guard only
// DECIDES — it never executes the command — so these probes delete nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'bash-security-guard.js');

function guardDecision(command) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.YURI_DEV_KEY; // → coworker role (fail-closed)
    const child = spawn(process.execPath, [GUARD], { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stdin.end(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ denied: false, timeout: true }); }, 5000);
    child.on('close', () => {
      clearTimeout(timer);
      let denied = false;
      try { denied = JSON.parse(stdout).hookSpecificOutput?.permissionDecision === 'deny'; } catch { /* no JSON → not denied */ }
      resolve({ denied, stdout });
    });
    child.on('error', () => { clearTimeout(timer); resolve({ denied: false, error: true }); });
  });
}

test('B3-1 coworker CANNOT rm the energy-enforce arm flag (self-disarm blocked)', async () => {
  const r = await guardDecision('rm -f _SYSTEM/state/energy-enforce.enabled');
  assert.equal(r.denied, true, 'rm of the arm flag must be blocked for a coworker role');
});

test('B3-2 coworker CANNOT inject a forged breaker snapshot', async () => {
  const r = await guardDecision('echo "{}" > _SYSTEM/state/energy-session/forged.json');
  assert.equal(r.denied, true, 'writing into the breaker snapshot dir must be blocked for a coworker role');
});

test('B3-3 negative control: a benign command is NOT blocked by the role gate', async () => {
  const r = await guardDecision('echo hello');
  assert.equal(r.denied, false, 'benign commands must still pass');
});

test('B3-4 ROLE_TRUST_SURFACES single-sources the two energy-arm paths (lock against regression)', async () => {
  const { ROLE_TRUST_SURFACES } = await import('../../_SYSTEM/Scripts/lane-kernel.mjs');
  assert.ok(ROLE_TRUST_SURFACES.files.includes('_SYSTEM/state/energy-enforce.enabled'), 'arm flag must stay in ROLE_TRUST_SURFACES.files');
  assert.ok(ROLE_TRUST_SURFACES.dirs.includes('_SYSTEM/state/energy-session'), 'snap dir must stay in ROLE_TRUST_SURFACES.dirs');
});
