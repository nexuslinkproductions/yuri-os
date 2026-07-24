#!/usr/bin/env node
/**
 * Tests for yuri-prelaunch-attest.mjs only (Variant B §2b).
 * correlationId=yuri-worktree-bootstrap-v1 task=t-7f23415d
 *
 * Does NOT touch yuri-worktree-bootstrap.mjs / .test.mjs or .yuri-bootstrap-bin residue.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  EXIT_HOLD,
  CORRELATION_ID,
  CANONICAL_MAIN_ABS,
  GIT_BIN,
  EXPECTED_MANIFEST_ID,
  EXPECTED_SCHEMA_VERSION,
  manifestPathFor,
  isSessionWorktreePath,
  isOutsideCanonicalMain,
  resolveWorktreesRoot,
  runAttest,
  main,
  realpathNative,
  observeSpine,
  observeDirtyWorktree,
  validateManifestSchema,
  rejectUpstreamSelfRef,
} from './yuri-prelaunch-attest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ATTEST_BIN = path.join(__dirname, 'yuri-prelaunch-attest.mjs');
const ATTEST_SRC = fs.readFileSync(ATTEST_BIN, 'utf8');
const FIXTURE_KEY = 'yuri-prelaunch-attest-test-key-v1';

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return (r.stdout || '').trim();
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/**
 * Build an isolated fake October worktree under <userData>/worktrees/<name>
 * with a minimal governance spine + git history.
 */
function makeSessionWorktree({ name = 'wt-attest', withUpstream = true } = {}) {
  const userData = mkTmp('october-userdata-');
  const wt = path.join(userData, 'worktrees', name);
  fs.mkdirSync(wt, { recursive: true });
  git(wt, ['init']);
  git(wt, ['config', 'user.email', 'attest@test.local']);
  git(wt, ['config', 'user.name', 'attest']);
  const soul = path.join(wt, 'SOUL.md');
  fs.writeFileSync(soul, '# soul fixture\n', 'utf8');
  const origin = path.join(wt, '_SYSTEM', 'yuri-origin.md');
  fs.mkdirSync(path.dirname(origin), { recursive: true });
  fs.writeFileSync(origin, '# origin fixture\n', 'utf8');
  git(wt, ['add', '-A']);
  git(wt, ['commit', '-m', 'attest fixture']);
  // Upstream pin = spine commit (ancestor). Must NOT equal final HEAD (anti self-ref).
  const baseHead = git(wt, ['rev-parse', 'HEAD']);
  const manifestDir = path.join(wt, '_SYSTEM', 'config');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'yuri-worktree-bootstrap-manifest.json');
  const manifest = {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    manifestId: EXPECTED_MANIFEST_ID,
    expectedUpstreamRef: baseHead,
    expectedUpstreamCommit: baseHead,
    spineFiles: [
      { path: 'SOUL.md', sha256: sha256File(soul), role: 'persona-injection', required: true },
      { path: '_SYSTEM/yuri-origin.md', sha256: sha256File(origin), role: 'authority-contract', required: true },
    ],
  };
  if (!withUpstream) {
    // Still schema-valid; hist tests may overwrite with unreachable ref then commit.
    // Keep baseHead pin so READY fixtures without poison still work when withUpstream=false.
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  git(wt, ['add', '-A']);
  git(wt, ['commit', '-m', 'attest manifest']);
  const finalHead = git(wt, ['rev-parse', 'HEAD']);
  assert.notEqual(finalHead, baseHead, 'fixture must not self-ref upstream==HEAD');
  return {
    userData,
    env: { YURI_OCTOBER_USER_DATA: userData },
    wt: realpathNative(wt),
    manifestPath,
    head: finalHead,
    baseHead,
    soul,
  };
}

test('GIT_BIN is absolute /usr/bin/git (no PATH resolve)', () => {
  assert.equal(GIT_BIN, '/usr/bin/git');
  assert.match(ATTEST_SRC, /spawnSync\(GIT_BIN/);
  assert.doesNotMatch(ATTEST_SRC, /spawnSync\(\s*['"]git['"]/);
});

test('PASS under hostile PATH with fake git ahead of system (absolute GIT_BIN)', () => {
  const fx = makeSessionWorktree({ name: 'hostile-path' });
  const evilDir = mkTmp('evil-git-');
  const evilGit = path.join(evilDir, 'git');
  fs.writeFileSync(
    evilGit,
    '#!/bin/sh\necho EVIL_FORGED_SHA >&2\nexit 1\n',
    { mode: 0o755 },
  );
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: { ...fx.env, PATH: `${evilDir}:/usr/bin:/bin` },
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.ruling, 'READY');
  assert.ok(result.receipt?.observedBaseCommit);
  assert.notEqual(result.receipt.observedBaseCommit, 'EVIL_FORGED_SHA');
});

test('standalone: NO import from yuri-worktree-bootstrap (blocker 2 Option A)', () => {
  assert.doesNotMatch(
    ATTEST_SRC,
    /from\s+['"]\.\/yuri-worktree-bootstrap\.mjs['"]/,
    'must not import bootstrap WIP',
  );
  assert.match(ATTEST_SRC, /Vendored F4\/F3 primitives/);
  assert.match(ATTEST_SRC, /bootstrapImport:\s*false/);
});

test('isSessionWorktreePath matches October userData/worktrees prefix', () => {
  const userData = mkTmp('oct-ud-');
  const env = { YURI_OCTOBER_USER_DATA: userData };
  const root = resolveWorktreesRoot(env);
  const inside = path.join(root, 'abc123');
  fs.mkdirSync(inside, { recursive: true });
  assert.equal(isSessionWorktreePath(inside, env), true);
  assert.equal(isSessionWorktreePath(path.join(inside, 'nested'), env), true);
  assert.equal(isSessionWorktreePath(REPO_ROOT, env), false);
});

test('isOutsideCanonicalMain boundary-safe (October insert semantics)', () => {
  const main = '/repo/main';
  assert.equal(isOutsideCanonicalMain('/repo/main', main), false);
  assert.equal(isOutsideCanonicalMain('/repo/main/sub', main), false);
  assert.equal(isOutsideCanonicalMain('/repo/worktrees/x', main), true);
  assert.equal(isOutsideCanonicalMain('/other', main), true);
});

test('PASS derives manifest from worktree root (no injected manifestPath)', () => {
  const fx = makeSessionWorktree({ name: 'derive-manifest' });
  assert.equal(
    manifestPathFor(fx.wt),
    path.join(fx.wt, '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json'),
  );
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    // intentionally omit manifestPath
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.ruling, 'READY');
});

test('PASS: session worktree emits READY receipt under .yuri-bootstrap', () => {
  const fx = makeSessionWorktree({ name: 'pass-wt' });
  const epoch = crypto.randomUUID();
  const result = runAttest({
    cwd: fx.wt,
    epoch,
    env: fx.env,
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
    canonicalMainAbs: CANONICAL_MAIN_ABS,
  });
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.ruling, 'READY');
  assert.ok(result.receiptPath);
  assert.equal(result.receiptPath, path.join(fx.wt, '.yuri-bootstrap', 'attestation-receipt.json'));
  assert.ok(!result.receiptPath.includes('.yuri-bootstrap-bin'));
  const disk = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
  assert.equal(disk.ruling, 'READY');
  assert.equal(disk.schemaVersion, 'yuri.attestation-receipt.v1');
  assert.equal(disk.correlationId, CORRELATION_ID);
  assert.equal(disk.epoch, epoch);
  assert.ok(disk.hmac && disk.hmac.length === 64);
  assert.equal(disk.prelaunch.module, 'yuri-prelaunch-attest');
  assert.equal(disk.prelaunch.bootstrapImport, false);
  assert.ok(disk.prelaunch.toctouResidual);
  assert.match(disk.prelaunch.toctouResidual, /Griffin-§2a-final-sync-reattest/);
  assert.doesNotMatch(disk.prelaunch.toctouResidual, /F2-primary/);
  assert.match(disk.prelaunch.toctouResidual, /bootstrap-F2-NOT-wired-into-October/);
  assert.ok(String(disk.prelaunch.manifestPath || '').endsWith('_SYSTEM/config/yuri-worktree-bootstrap-manifest.json')
    || String(disk.prelaunch.manifestPath || '').includes('_SYSTEM/config/yuri-worktree-bootstrap-manifest.json'));
});

test('HOLD: --force-hold / forceHold exits 78 and persists HOLD receipt', () => {
  const fx = makeSessionWorktree({ name: 'hold-wt' });
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    forceHold: true,
    env: fx.env,
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.ruling, 'HOLD');
  assert.ok(result.receiptPath);
  const disk = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
  assert.equal(disk.ruling, 'HOLD');
  assert.ok(disk.failures.some((f) => f.code === 'force_hold'));
});

test('HOLD: non-session-worktree path exits 78 (no receipt required)', () => {
  const plain = mkTmp('plain-cwd-');
  git(plain, ['init']);
  const result = runAttest({
    cwd: plain,
    epoch: crypto.randomUUID(),
    env: { YURI_OCTOBER_USER_DATA: mkTmp('oct-empty-') },
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.ruling, 'HOLD');
  assert.equal(result.reason, 'not_session_worktree');
});

test('main exclusion: canonical main cwd => exit 0 SKIP_MAIN, no receipt', () => {
  const result = runAttest({
    cwd: REPO_ROOT,
    epoch: crypto.randomUUID(),
    env: { YURI_OCTOBER_USER_DATA: mkTmp('oct-mainex-') },
    attestKey: FIXTURE_KEY,
    canonicalMainAbs: REPO_ROOT,
  });
  assert.equal(result.code, 0);
  assert.equal(result.ruling, 'SKIP_MAIN');
  assert.equal(result.receiptPath, null);
});

test('HOLD: lexical worktree symlink escaping outside => symlink_escape_outside_worktrees', () => {
  const userData = mkTmp('oct-sym-out-');
  const env = { YURI_OCTOBER_USER_DATA: userData };
  const lexicalSlot = path.join(userData, 'worktrees', 'escape-out');
  fs.mkdirSync(path.dirname(lexicalSlot), { recursive: true });
  const outside = mkTmp('outside-repo-');
  git(outside, ['init']);
  git(outside, ['config', 'user.email', 'attest@test.local']);
  git(outside, ['config', 'user.name', 'attest']);
  fs.writeFileSync(path.join(outside, 'README'), 'x\n');
  git(outside, ['add', '-A']);
  git(outside, ['commit', '-m', 'out']);
  fs.symlinkSync(outside, lexicalSlot);
  assert.equal(isSessionWorktreePath(path.resolve(lexicalSlot), env, { resolveSymlinks: false }), true);
  const result = runAttest({
    cwd: lexicalSlot,
    epoch: crypto.randomUUID(),
    env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.ruling, 'HOLD');
  assert.equal(result.reason, 'symlink_escape_outside_worktrees');
});

test('HOLD: lexical worktree symlink escaping to main => symlink_escape_to_main', () => {
  const userData = mkTmp('oct-sym-main-');
  const env = { YURI_OCTOBER_USER_DATA: userData };
  const lexicalSlot = path.join(userData, 'worktrees', 'escape-main');
  fs.mkdirSync(path.dirname(lexicalSlot), { recursive: true });
  fs.symlinkSync(REPO_ROOT, lexicalSlot);
  assert.equal(isSessionWorktreePath(path.resolve(lexicalSlot), env, { resolveSymlinks: false }), true);
  const result = runAttest({
    cwd: lexicalSlot,
    epoch: crypto.randomUUID(),
    env,
    attestKey: FIXTURE_KEY,
    canonicalMainAbs: REPO_ROOT,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.ruling, 'HOLD');
  assert.equal(result.reason, 'symlink_escape_to_main');
});

test('PASS enter via outside→into worktree symlink (blocker 1 both-direction)', () => {
  const fx = makeSessionWorktree({ name: 'into-wt' });
  const outside = mkTmp('outside-link-');
  const link = path.join(outside, 'portal');
  fs.symlinkSync(fx.wt, link);
  assert.equal(isSessionWorktreePath(path.resolve(link), fx.env, { resolveSymlinks: false }), false);
  assert.equal(isSessionWorktreePath(realpathNative(link), fx.env, { resolveSymlinks: true }), true);
  const result = runAttest({
    cwd: link,
    epoch: crypto.randomUUID(),
    env: fx.env,
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.ruling, 'READY');
});

test('HOLD: manifest_hash_mismatch on spine drift (blocker 3)', () => {
  const fx = makeSessionWorktree({ name: 'hash-drift' });
  fs.writeFileSync(fx.soul, '# soul fixture TAMPERED\n', 'utf8');
  // Commit drift so dirty_worktree does not mask hash mismatch.
  git(fx.wt, ['add', '-A']);
  git(fx.wt, ['commit', '-m', 'tamper soul without manifest update']);
  const spine = observeSpine(fx.wt, fx.manifestPath);
  assert.ok(spine.failures.some((f) => f.code === 'manifest_hash_mismatch'));
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.ruling, 'HOLD');
  assert.equal(result.reason, 'manifest_hash_mismatch');
  const disk = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
  assert.ok(disk.failures.some((f) => f.code === 'manifest_hash_mismatch'));
});

test('HOLD: incomplete OCTOBER_BUS identity (blocker 3)', () => {
  const fx = makeSessionWorktree({ name: 'oct-id' });
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: { ...fx.env, OCTOBER_BUS_PORT: '1234' }, // partial
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.ok(
    result.reason === 'october_identity'
      || (result.receipt && result.receipt.failures.some((f) => f.code === 'october_identity')),
  );
});

test('HOLD: disconnected_history when expectedUpstream unreachable', () => {
  const fx = makeSessionWorktree({ name: 'hist', withUpstream: false });
  const manifest = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
  manifest.expectedUpstreamRef = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  manifest.expectedUpstreamCommit = manifest.expectedUpstreamRef;
  fs.writeFileSync(fx.manifestPath, JSON.stringify(manifest, null, 2));
  // Commit poison so dirty_worktree does not mask disconnected_history.
  git(fx.wt, ['add', '-A']);
  git(fx.wt, ['commit', '-m', 'poison upstream pin']);
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    manifestPath: fx.manifestPath,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.reason, 'disconnected_history');
});

test('HOLD: dirty_worktree blocks uncommitted coordinated manifest+spine tamper', () => {
  const fx = makeSessionWorktree({ name: 'dirty-tamper' });
  assert.equal(observeDirtyWorktree(fx.wt).dirty, false);
  // Coordinated uncommitted tamper: rewrite spine + matching manifest shas; HEAD unchanged.
  const tamperedSoul = '# soul TAMPERED uncommitted\n';
  fs.writeFileSync(fx.soul, tamperedSoul, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
  manifest.spineFiles = manifest.spineFiles.map((sf) => (
    sf.path === 'SOUL.md'
      ? { ...sf, sha256: sha256File(fx.soul) }
      : sf
  ));
  fs.writeFileSync(fx.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  assert.equal(observeDirtyWorktree(fx.wt).dirty, true);
  // Spine hashes alone would PASS (consistent tamper) — dirty_worktree must HOLD.
  // Schema still valid so observeSpine gets past schema; hash match would pass.
  const spine = observeSpine(fx.wt, fx.manifestPath);
  assert.equal(spine.ok, true, 'consistent tamper fools observeSpine hashes');
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.reason, 'dirty_worktree');
  const disk = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
  assert.ok(disk.failures.some((f) => f.code === 'dirty_worktree'));
});

test('HOLD: committed minimal/empty spineFiles bypass (Orion upgraded blocker)', () => {
  const fx = makeSessionWorktree({ name: 'min-manifest' });
  const head = git(fx.wt, ['rev-parse', 'HEAD']);
  const minimal = {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    manifestId: EXPECTED_MANIFEST_ID,
    expectedUpstreamRef: head,
    expectedUpstreamCommit: head,
    spineFiles: [],
  };
  assert.ok(validateManifestSchema(minimal).some((f) => f.code === 'manifest_spine_empty'));
  fs.writeFileSync(fx.manifestPath, JSON.stringify(minimal, null, 2), 'utf8');
  git(fx.wt, ['add', '-A']);
  git(fx.wt, ['commit', '-m', 'minimal empty spine']);
  // Committed + clean + self-ref HEAD + empty spine → must HOLD (not READY).
  assert.equal(observeDirtyWorktree(fx.wt).dirty, false);
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  const codes = (result.receipt?.failures || []).map((f) => f.code);
  assert.ok(
    codes.includes('manifest_spine_empty') || codes.includes('upstream_self_ref'),
    JSON.stringify(codes),
  );
});

test('HOLD: wrong manifestId / unknown keys / missing role', () => {
  const fx = makeSessionWorktree({ name: 'schema-bad' });
  const bad = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
  bad.manifestId = 'attacker.manifest';
  bad.extraEvil = true;
  delete bad.spineFiles[0].role;
  fs.writeFileSync(fx.manifestPath, JSON.stringify(bad, null, 2), 'utf8');
  git(fx.wt, ['add', '-A']);
  git(fx.wt, ['commit', '-m', 'schema poison']);
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(result.code, EXIT_HOLD);
  const codes = new Set((result.receipt?.failures || []).map((f) => f.code));
  assert.ok(codes.has('manifest_id_mismatch'), JSON.stringify([...codes]));
  assert.ok(codes.has('manifest_unknown_key'), JSON.stringify([...codes]));
  assert.ok(codes.has('manifest_spine_field'), JSON.stringify([...codes]));
});

test('HOLD: upstream_self_ref when expectedUpstreamRef equals observed HEAD', () => {
  const fx = makeSessionWorktree({ name: 'self-ref' });
  assert.equal(rejectUpstreamSelfRef(fx.baseHead, fx.baseHead).ok, false);
  assert.equal(rejectUpstreamSelfRef(fx.baseHead, fx.head).ok, true);
  const tree = git(fx.wt, ['rev-parse', `${fx.baseHead}^{tree}`]);
  const result = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
    observeGitBaseFn: () => ({ commit: fx.baseHead, tree }),
  });
  assert.equal(result.code, EXIT_HOLD);
  assert.equal(result.reason, 'upstream_self_ref');
  assert.ok(result.receipt.failures.some((f) => f.code === 'upstream_self_ref'));
});

test('READY re-attest ignores attest-owned .yuri-bootstrap receipt dirt', () => {
  const fx = makeSessionWorktree({ name: 'reattest' });
  const first = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(first.code, 0, JSON.stringify(first));
  assert.equal(first.ruling, 'READY');
  assert.equal(observeDirtyWorktree(fx.wt).dirty, false, 'receipt under .yuri-bootstrap must not trip dirty');
  const second = runAttest({
    cwd: fx.wt,
    epoch: crypto.randomUUID(),
    env: fx.env,
    attestKey: FIXTURE_KEY,
  });
  assert.equal(second.code, 0, JSON.stringify(second));
  assert.equal(second.ruling, 'READY');
});

test('CLI: attest --cwd --epoch spawn exit codes', () => {
  const fx = makeSessionWorktree({ name: 'cli-wt' });
  const env = {
    ...process.env,
    YURI_OCTOBER_USER_DATA: fx.userData,
    YURI_ATTEST_KEY: FIXTURE_KEY,
    YURI_PRELAUNCH_FORCE_HOLD: '1',
  };
  const pass = spawnSync(
    process.execPath,
    [ATTEST_BIN, 'attest', '--cwd', fx.wt, '--epoch', crypto.randomUUID()],
    { encoding: 'utf8', env },
  );
  assert.equal(pass.status, EXIT_HOLD, pass.stderr);
  assert.match(pass.stderr, /yuri-prelaunch-attest:/);
  const bad = spawnSync(process.execPath, [ATTEST_BIN, 'nope'], { encoding: 'utf8', env });
  assert.equal(bad.status, EXIT_HOLD);
});

test('CLI main() returns EXIT_HOLD on missing --cwd', () => {
  const code = main(['attest', '--epoch', 'x'], { env: {}, attestKey: FIXTURE_KEY });
  assert.equal(code, EXIT_HOLD);
});

test('frozen bootstrap module hash unchanged (no mutation)', () => {
  const r = spawnSync('shasum', ['-a', '256', path.join(__dirname, 'yuri-worktree-bootstrap.mjs')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  const hash = r.stdout.trim().split(/\s+/)[0];
  assert.equal(hash, 'd4a28499f42a687caf8096224b540a344e58a20317fa945bb870d7929e1adfc1');
});

test('residue .yuri-bootstrap-bin/cursor-agent preserved (9abfb753 contract)', () => {
  const residue = path.join(REPO_ROOT, '.yuri-bootstrap-bin', 'cursor-agent');
  assert.ok(fs.existsSync(residue), 'residue cursor-agent must remain');
  const st = fs.statSync(residue);
  assert.ok(st.isFile());
  assert.ok((st.mode & 0o111) !== 0, 'residue must stay executable');
});
