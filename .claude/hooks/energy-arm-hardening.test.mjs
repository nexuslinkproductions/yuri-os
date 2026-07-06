// energy-arm-hardening.test.mjs — B3 (audit blocker): the energy-enforce arm flag and the
// breaker snapshot dir must NOT be self-disarmable via Bash.
//
// Re-targeted 2026-07-06: originally gated on a "coworker" role (forced by unsetting
// YURI_DEV_KEY), which has since been removed as dead code — dev-credential.json does
// not exist anywhere on disk, so activeRole() could never resolve to 'coworker' in the
// first place, and these 3 tests (B3-1/2/5) had been silently failing for weeks. The
// underlying threat doesn't depend on a human-operator role distinction: an agent/lane
// tampering with its own safety gate is the live concern on a single-operator machine,
// so the block in bash-security-guard.js is now UNIVERSAL (same mechanism as the .env
// hard-block), not role-gated. The guard only DECIDES — it never executes the command —
// so these probes delete nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'bash-security-guard.js');

function guardDecision(command) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GUARD], { stdio: ['pipe', 'pipe', 'pipe'] });
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

test('B3-1 rm of the energy-enforce arm flag is blocked (self-disarm)', async () => {
  const r = await guardDecision('rm -f _SYSTEM/state/energy-enforce.enabled');
  assert.equal(r.denied, true, 'rm of the arm flag must be blocked');
});

test('B3-2 writing into the breaker snapshot dir is blocked (forged snapshot)', async () => {
  const r = await guardDecision('echo "{}" > _SYSTEM/state/energy-session/forged.json');
  assert.equal(r.denied, true, 'writing into the breaker snapshot dir must be blocked');
});

test('B3-3 negative control: a benign command is NOT blocked', async () => {
  const r = await guardDecision('echo hello');
  assert.equal(r.denied, false, 'benign commands must still pass');
});

test('B3-4 ROLE_TRUST_SURFACES single-sources the two energy-arm paths (lock against regression)', async () => {
  const { ROLE_TRUST_SURFACES } = await import('../../_SYSTEM/Scripts/lane-kernel.mjs');
  assert.ok(ROLE_TRUST_SURFACES.files.includes('_SYSTEM/state/energy-enforce.enabled'), 'arm flag must stay in ROLE_TRUST_SURFACES.files');
  assert.ok(ROLE_TRUST_SURFACES.dirs.includes('_SYSTEM/state/energy-session'), 'snap dir must stay in ROLE_TRUST_SURFACES.dirs');
});

test('B3-5 (peer red-team catch) the energy gate enforcement CODE is protected — Edit/tee-neuter is blocked', async () => {
  const { ROLE_TRUST_SURFACES } = await import('../../_SYSTEM/Scripts/lane-kernel.mjs');
  assert.ok(ROLE_TRUST_SURFACES.files.includes('.claude/hooks/energy-enforce.mjs'), 'the PEP code must be trust-protected');
  assert.ok(ROLE_TRUST_SURFACES.files.includes('.claude/hooks/energy-tick.mjs'), 'the tick (sole writer) code must be trust-protected');
  // The rm vector is caught by the blanket .claude rule; this guards the Edit/write-tool vector.
  const r = await guardDecision('echo neutered | tee .claude/hooks/energy-enforce.mjs');
  assert.equal(r.denied, true, 'writing to the enforcement code must be blocked');
});

test('B3-6 sed-mutate of the enforcement code is blocked', async () => {
  const r = await guardDecision('sed -i "" "s/x/y/" .claude/hooks/energy-tick.mjs');
  assert.equal(r.denied, true, 'sed -i on the enforcement code must be blocked');
});

test('B3-7 the arm surface is still protected inside a shell wrapper (bash -c)', async () => {
  const r = await guardDecision('bash -c "rm -f _SYSTEM/state/energy-enforce.enabled"');
  assert.equal(r.denied, true, 'a wrapped rm of the arm flag must still be blocked');
});
