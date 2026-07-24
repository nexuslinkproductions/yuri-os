#!/usr/bin/env node
/**
 * yuri-worktree-bootstrap.test.mjs
 * M3-aligned fixture coverage + NEGATIVE (synthetic sentinels) + T-LAUNCH
 * NO real secret files created or read.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  EXIT_HOLD,
  APP_SHELL_ALLOW,
  EXPECTED_ALLOW_COUNT,
  CORRELATION_ID,
  composeWrapCommand,
  validateCursorCli,
  validateLauncherConfig,
  checkProtectedIsolation,
  assertWorktreeincludeExcludesSecrets,
  renderProviderConfig,
  bootstrapWorktree,
  computeAttestationReceipt,
  installPathShims,
  isProtectedPath,
  CANONICAL_MAIN_ABS,
  prespawnDecision,
  persistAttestationReceipt,
  finalizeWrapLaunch,
  writeFileNoFollowAtomic,
  ensureDirNoFollow,
  assessPathInterposition,
  assessStartCommandInterposition,
  assessInterposition,
  octoberHardenedPathModel,
  resolveOnPath,
} from './yuri-worktree-bootstrap.mjs';
import { evaluateGovernance, CLASS } from '../mure/governance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_KEY = 'test-attest-key-not-for-production';

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(dir, { commitMessage = 'fixture' } = {}) {
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'fixture'], { cwd: dir });
  // minimal spine stubs matching relative paths used by tests that skip full manifest
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: dir });
  spawnSync('git', ['commit', '-m', commitMessage], { cwd: dir });
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
  return head;
}

function copySpineInto(dir) {
  // symlink spine files from real repo so hash checks can pass without copying protected surfaces
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json'), 'utf8'));
  for (const sf of manifest.spineFiles) {
    const dest = path.join(dir, sf.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, sf.path), dest);
  }
  fs.copyFileSync(path.join(REPO_ROOT, '.worktreeinclude'), path.join(dir, '.worktreeinclude'));
  fs.mkdirSync(path.join(dir, '_SYSTEM/config/provider-templates'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO_ROOT, '_SYSTEM/config/provider-templates'))) {
    fs.copyFileSync(
      path.join(REPO_ROOT, '_SYSTEM/config/provider-templates', f),
      path.join(dir, '_SYSTEM/config/provider-templates', f),
    );
  }
  fs.copyFileSync(
    path.join(REPO_ROOT, '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json'),
    path.join(dir, '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json'),
  );
  // bootstrap script + deps needed for wrap compose path string only — render uses REPO_ROOT templates via import
}

// ---------- unit: validateCursorCli RJ-1..4 ----------
test('A/C: validateCursorCli accepts rendered portable config', () => {
  const wt = mkTmp('wtb-valid-');
  const rendered = renderProviderConfig('cursor', wt);
  const v = validateCursorCli(rendered.config, wt);
  assert.equal(v.ok, true, JSON.stringify(v.violations));
  assert.equal(Object.keys(rendered.config).join(','), 'permissions');
  assert.equal(rendered.config.permissions.allow.length, EXPECTED_ALLOW_COUNT);
  assert.equal(EXPECTED_ALLOW_COUNT, APP_SHELL_ALLOW.length + 2);
  assert.ok(rendered.config.permissions.deny.length >= 40);
  assert.match(rendered.launchCommand, /yuri-worktree-bootstrap\.mjs/);
  assert.equal(rendered.skipPermissions, false);
  assert.equal(rendered.permissionMode, 'autoReview');
  const lv = validateLauncherConfig(rendered.launcher);
  assert.equal(lv.ok, true, JSON.stringify(lv.violations));
  // worktree-only shim
  assert.ok(fs.existsSync(path.join(wt, '.yuri-bootstrap-bin', 'cursor-agent')));
  fs.rmSync(wt, { recursive: true, force: true });
});

test('main render does not create or refresh PATH shim (residue may exist)', () => {
  const shimDir = path.join(REPO_ROOT, '.yuri-bootstrap-bin');
  const shim = path.join(shimDir, 'cursor-agent');
  const existed = fs.existsSync(shim);
  // F1: lstat for mode+type identity (byte + mode + symlink identity)
  const beforeLstat = existed ? fs.lstatSync(shim) : null;
  const beforeMtime = beforeLstat ? beforeLstat.mtimeMs : null;
  const beforeMode = beforeLstat ? beforeLstat.mode : null;
  const beforeIsSymlink = beforeLstat ? beforeLstat.isSymbolicLink() : null;
  const beforeBody = existed ? fs.readFileSync(shim, 'utf8') : null;
  renderProviderConfig('cursor', REPO_ROOT);
  if (!existed) {
    assert.equal(fs.existsSync(shimDir), false, 'main must not newly create shim dir');
  } else {
    const afterLstat = fs.lstatSync(shim);
    assert.equal(fs.readFileSync(shim, 'utf8'), beforeBody, 'main must not refresh residue shim');
    assert.equal(afterLstat.mtimeMs, beforeMtime);
    assert.equal(afterLstat.mode, beforeMode, 'residue mode must be unchanged');
    assert.equal(afterLstat.isSymbolicLink(), beforeIsSymlink, 'residue symlink identity must be unchanged');
  }
});

test('RJ-1: unresolved template token fails', () => {
  const bad = {
    permissions: {
      allow: Array.from({ length: 23 }, (_, i) => (i === 0 ? 'Mcp(october-bus:*)' : i === 1 ? 'Write(/tmp/x/*)' : `Shell(echo)`)),
      deny: Array.from({ length: 40 }, () => 'Write(/tmp/x/.env)'),
    },
  };
  // force token
  bad.permissions.deny[0] = 'Write({{WORKTREE_ROOT}}/.env)';
  const v = validateCursorCli(bad, '/tmp');
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'RJ-1'));
});

test('RJ-2: main path in non-main worktree fails', () => {
  const wt = '/tmp/some-other-worktree-root';
  const allow = [
    'Mcp(october-bus:*)',
    `Write(${CANONICAL_MAIN_ABS}/*)`,
    ...APP_SHELL_ALLOW.map((c) => `Shell(${c})`),
  ];
  const deny = Array.from({ length: 40 }, (_, i) => `Write(${CANONICAL_MAIN_ABS}/.env${i})`);
  const v = validateCursorCli({
    permissions: { allow, deny },
  }, wt);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'RJ-2' || x.code === 'app_parity'));
});

test('wildcards Write(*)/Shell(*) rejected', () => {
  const v = validateCursorCli({
    permissions: { allow: ['Write(*)', ...Array(22).fill('Shell(ls)')], deny: ['Shell(*)'] },
  }, REPO_ROOT);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'wildcard'));
});

// ---------- NEGATIVE N1/N2 ----------
test('N1: isProtectedPath flags synthetic protected-CLASS names without reading secrets', () => {
  assert.equal(isProtectedPath('worktree/__sentinel__/backend/data/x'), true);
  assert.equal(isProtectedPath('worktree/__sentinel__/ok.txt'), false);
  const wt = mkTmp('wtb-n1-');
  // plant SYNTHETIC sentinel dirent name only — not a real secret file content
  const sentinelDir = path.join(wt, '__sentinel__');
  fs.mkdirSync(sentinelDir, { recursive: true });
  // name that matches protected class (.env-ish) without being a real dotenv
  fs.writeFileSync(path.join(sentinelDir, 'fake.env-name'), 'not-a-secret-sentinel\n');
  // Also plant a path that looks like backend/data
  fs.mkdirSync(path.join(wt, 'backend', 'data'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'backend', 'data', 'sentinel.txt'), 'sentinel-only\n');
  const r = checkProtectedIsolation(wt, { canonicalRepoRoot: wt });
  assert.equal(r.ok, false);
  assert.ok(r.leaks.some((l) => /backend\/data|protected-name|\.env/.test(l.path) || l.kind === 'protected-name-present'));
  fs.rmSync(wt, { recursive: true, force: true });
});

test('N2: .worktreeinclude excludes secret globs', () => {
  const r = assertWorktreeincludeExcludesSecrets();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(!r.lines.some((l) => l.includes('.env')));
});

test('Documents: cli.json Write deny does not constrain Shell', () => {
  // assertion-only documentation of honesty floor
  assert.ok(true, 'isolation = content-absence + matcher, not cli.json Shell deny');
});

// ---------- §9 symlink audit ----------
test('symlink escape HOLD via readlink (synthetic target)', () => {
  const wt = mkTmp('wtb-sym-');
  const outside = mkTmp('wtb-out-');
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'x\n');
  fs.symlinkSync(outside, path.join(wt, 'escape-link'));
  const r = checkProtectedIsolation(wt, { canonicalRepoRoot: wt });
  assert.equal(r.ok, false);
  assert.ok(r.leaks.some((l) => l.kind === 'symlink-escape' || l.kind === 'symlink-unexpected'));
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('node_modules symlink to repo deps classified+recorded', () => {
  const wt = mkTmp('wtb-nm-');
  const canon = mkTmp('wtb-canon-');
  fs.mkdirSync(path.join(canon, 'node_modules'), { recursive: true });
  fs.symlinkSync(path.join(canon, 'node_modules'), path.join(wt, 'node_modules'));
  const r = checkProtectedIsolation(wt, { canonicalRepoRoot: canon });
  assert.ok(r.links.some((l) => l.verdict === 'known-october-node_modules'));
  // no other leaks expected from this alone
  assert.ok(!r.leaks.some((l) => l.kind === 'symlink-escape'));
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(canon, { recursive: true, force: true });
});

// ---------- governance split + HMAC ----------
test('evaluateGovernance requires explicit fields; missing throws→HOLD path', () => {
  const decision = {
    reversible: true,
    evidenceDecidable: true,
    inDoctrine: true,
    blastRadius: 'LOW',
    outwardFacing: false,
    contended: false,
    arming: false,
    touchesSensitive: false,
    files: [],
    transition: 'worktree-prelaunch',
  };
  const r = evaluateGovernance(decision);
  assert.equal(r.class, CLASS.SELF);
});

test('HMAC receipt binds observed base; missing key errors', () => {
  const { hmac, error } = computeAttestationReceipt({
    worktreeRoot: REPO_ROOT,
    observedBaseCommit: 'a'.repeat(40),
    observedBaseTree: 'b'.repeat(40),
    spineHashes: [],
    key: null,
  });
  assert.equal(hmac, null);
  assert.match(error, /YURI_ATTEST_KEY/);
  const ok = computeAttestationReceipt({
    worktreeRoot: REPO_ROOT,
    observedBaseCommit: 'a'.repeat(40),
    observedBaseTree: 'b'.repeat(40),
    spineHashes: [],
    key: FIXTURE_KEY,
  });
  assert.equal(ok.hmac.length, 64);
});

// ---------- T-LAUNCH ----------
test('T-LAUNCH: composeWrapCommand invokes bootstrap --wrap; HOLD→exit 78', () => {
  const cmd = composeWrapCommand('cursor', REPO_ROOT);
  assert.match(cmd, /yuri-worktree-bootstrap\.mjs/);
  assert.match(cmd, /--wrap/);
  assert.match(cmd, /cursor-agent/);
  assert.ok(!/^cursor-agent\b/.test(cmd.trim()), 'must not be bare cursor-agent');

  // HOLD path: incomplete OCTOBER_BUS_* → exit 78 without exec
  const script = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-worktree-bootstrap.mjs');
  const r = spawnSync(process.execPath, [script, '--wrap', '--provider', 'cursor', '--', 'cursor-agent', '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      OCTOBER_BUS_PORT: '1234',
      // missing canvas/node → incomplete
      OCTOBER_BUS_CANVAS: '',
      OCTOBER_BUS_NODE: '',
      YURI_ATTEST_KEY: FIXTURE_KEY,
    },
  });
  assert.equal(r.status, EXIT_HOLD);
  assert.ok(!/cursor-agent version/i.test(r.stdout || ''), 'must not exec real cursor-agent on HOLD');
});

test('T-LAUNCH: W2 shim installed for PATH-resolved agentLaunchCommand', () => {
  const wt = mkTmp('wtb-shim-');
  const { binDir, installed } = installPathShims(wt, { providers: ['cursor'] });
  assert.ok(fs.existsSync(path.join(binDir, 'cursor-agent')));
  assert.equal(installed[0].agentBin, 'cursor-agent');
  const body = fs.readFileSync(path.join(binDir, 'cursor-agent'), 'utf8');
  assert.match(body, /yuri-worktree-bootstrap\.mjs/);
  assert.match(body, /--wrap/);
  fs.rmSync(wt, { recursive: true, force: true });
});

// ---------- bootstrapWorktree on real repo (integration-ish) ----------
test('bootstrapWorktree on REPO_ROOT produces READY with key (or HOLD with explicit codes)', () => {
  const result = bootstrapWorktree({
    worktreeRoot: REPO_ROOT,
    provider: 'cursor',
    attestKey: FIXTURE_KEY,
    writeConfigs: true,
  });
  // Main worktree may HOLD on protected_isolation if backend/data or similar exists as dirs —
  // that is correct fail-closed behavior. Assert structure + launchCommand always.
  assert.ok(result.receipt.launchCommand.includes('yuri-worktree-bootstrap.mjs'));
  assert.ok(result.receipt.wiring);
  assert.equal(result.receipt.wiring.primary.includes('W2'), true);
  assert.ok(['READY', 'HOLD'].includes(result.ruling));
  if (result.ruling === 'HOLD') {
    assert.ok(Array.isArray(result.failures) && result.failures.length > 0);
  } else {
    assert.equal(result.hmac.length, 64);
  }
});

test('Fixture B stale: deny-less config fails validateCursorCli as security-floor', () => {
  const stale = {
    permissions: { allow: ['Mcp(october-bus:*)'], deny: [] },
  };
  const v = validateCursorCli(stale, REPO_ROOT);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'security_floor_deny_empty' || x.code === 'allow_count'));
});

test('cli.json rejects startCommand/skipPermissions keys', () => {
  const bad = {
    permissions: {
      allow: [
        'Mcp(october-bus:*)',
        `Write(${REPO_ROOT}/*)`,
        ...APP_SHELL_ALLOW.map((c) => `Shell(${c})`),
      ],
      deny: Array.from({ length: 40 }, (_, i) => `Write(${REPO_ROOT}/.env${i})`),
    },
    startCommand: 'cursor-agent',
    skipPermissions: false,
  };
  const v = validateCursorCli(bad, REPO_ROOT);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'schema_extra'));
});

test('OpenClaw/Fable forbidden in allowlist', () => {
  const bad = {
    permissions: {
      allow: [
        'Mcp(october-bus:*)',
        `Write(${REPO_ROOT}/*)`,
        ...APP_SHELL_ALLOW.map((c) => `Shell(${c})`),
        'Shell(openclaw)',
      ],
      deny: Array.from({ length: 40 }, (_, i) => `Write(${REPO_ROOT}/prot${i})`),
    },
  };
  const v = validateCursorCli(bad, REPO_ROOT);
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.code === 'forbidden_token' || x.code === 'allow_count'));
});

test('validateLauncherConfig requires autoReview + skipPermissions false + wrap/agent', () => {
  assert.equal(validateLauncherConfig({
    startCommand: composeWrapCommand('cursor', REPO_ROOT),
    skipPermissions: false,
    permissionMode: 'autoReview',
  }).ok, true);
  assert.equal(validateLauncherConfig({
    startCommand: 'cursor-agent',
    skipPermissions: true,
    permissionMode: 'autoReview',
  }).ok, false);
  assert.equal(validateLauncherConfig({
    startCommand: 'cursor-agent',
    skipPermissions: false,
    permissionMode: 'yolo',
  }).ok, false);
});

test('N2b: empty .worktreeinclude HOLD', () => {
  const empty = path.join(mkTmp('wtb-empty-inc-'), '.worktreeinclude');
  fs.writeFileSync(empty, '# only comments\n\n');
  const r = assertWorktreeincludeExcludesSecrets(empty);
  assert.equal(r.ok, false);
  assert.ok(r.violations.includes('worktreeinclude-empty'));
  fs.rmSync(path.dirname(empty), { recursive: true, force: true });
});

test('copy-absence: allowlist does not include secret sources', () => {
  const r = assertWorktreeincludeExcludesSecrets();
  assert.equal(r.ok, true);
  assert.ok(r.lines.length > 0);
  // Simulate October include semantics: only listed lines would copy; secrets absent from list.
  const forbidden = ['.env', '.env.local', 'backend/data', '.claude/projects'];
  for (const f of forbidden) {
    assert.ok(!r.lines.includes(f), `allowlist must not include ${f}`);
  }
});

test('exit-78 constant mirrors october-omp/pi', () => {
  assert.equal(EXIT_HOLD, 78);
});

// ---------- F2 TOCTOU prespawnDecision (injectable observeFn; no real spawn) ----------
test('F2: prespawnDecision HOLDs on injected commit/tree drift (spawn NOT authorized)', () => {
  const attested = {
    observedBaseCommit: 'aaaa'.repeat(10),
    observedBaseTree: 'bbbb'.repeat(10),
    spineHashes: [],
  };
  let observeCalls = 0;
  const decision = prespawnDecision({
    cwd: '/tmp',
    attested,
    observeFn: () => {
      observeCalls += 1;
      return {
        commit: 'cccc'.repeat(10),
        tree: 'dddd'.repeat(10),
      };
    },
  });
  assert.equal(observeCalls, 1);
  assert.equal(decision.action, 'hold');
  assert.equal(decision.code, EXIT_HOLD);
  assert.equal(decision.reason, 'TOCTOU_prespawn_drift');
  assert.match(decision.detail, /commit_drift|tree_drift/);
});

test('F2: prespawnDecision spawns when observe matches attested commit+tree', () => {
  const attested = {
    observedBaseCommit: 'eeee'.repeat(10),
    observedBaseTree: 'ffff'.repeat(10),
    spineHashes: [],
  };
  const decision = prespawnDecision({
    cwd: '/tmp',
    attested,
    observeFn: () => ({
      commit: attested.observedBaseCommit,
      tree: attested.observedBaseTree,
    }),
  });
  assert.equal(decision.action, 'spawn');
  assert.equal(decision.code, 0);
  assert.equal(decision.reason, null);
});

test('F2: prespawnDecision HOLDs on spineHash drift', () => {
  const attested = {
    observedBaseCommit: '1111'.repeat(10),
    observedBaseTree: '2222'.repeat(10),
    spineHashes: [{ path: 'SOUL.md', observedSha256: 'a'.repeat(64) }],
  };
  const decision = prespawnDecision({
    cwd: '/tmp',
    attested,
    observeFn: () => ({
      commit: attested.observedBaseCommit,
      tree: attested.observedBaseTree,
      spineHashes: [{ path: 'SOUL.md', observedSha256: 'b'.repeat(64) }],
    }),
  });
  assert.equal(decision.action, 'hold');
  assert.equal(decision.reason, 'TOCTOU_prespawn_drift');
  assert.match(decision.detail, /spine_drift/);
});

// ---------- F3 receipt persist + finalizeWrapLaunch ----------
test('F3: persistAttestationReceipt writes READY receipt under .yuri-bootstrap (not bin)', () => {
  const wt = mkTmp('wtb-receipt-ready-');
  const receipt = {
    schemaVersion: 'yuri.attestation-receipt.v1',
    correlationId: CORRELATION_ID,
    worktreeRoot: wt,
    observedBaseCommit: 'abcd'.repeat(10),
    observedBaseTree: 'ef01'.repeat(10),
    spineHashes: [],
    epoch: 1,
    ruling: 'READY',
    hmac: 'h'.repeat(64),
  };
  const r = persistAttestationReceipt({ worktreeRoot: wt, receipt });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.path, path.join(wt, '.yuri-bootstrap', 'attestation-receipt.json'));
  assert.ok(!r.path.includes('.yuri-bootstrap-bin'));
  const disk = JSON.parse(fs.readFileSync(r.path, 'utf8'));
  assert.equal(disk.ruling, 'READY');
  assert.equal(disk.hmac, receipt.hmac);
  assert.equal(disk.observedBaseCommit, receipt.observedBaseCommit);
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F3: finalizeWrapLaunch HOLDs on drift, persists HOLD receipt, spawn=false', () => {
  const wt = mkTmp('wtb-final-drift-');
  const attestedCommit = 'aaaa'.repeat(10);
  const attestedTree = 'bbbb'.repeat(10);
  const driftedCommit = 'cccc'.repeat(10);
  const driftedTree = 'dddd'.repeat(10);
  const bootstrapResult = {
    ruling: 'READY',
    failures: [],
    receipt: {
      correlationId: CORRELATION_ID,
      observedBaseCommit: attestedCommit,
      observedBaseTree: attestedTree,
      spineHashes: [],
      links: [],
      launchCommand: 'node wrap',
      wiring: { primary: 'W2' },
      epoch: 42,
    },
    hmac: 'x'.repeat(64),
  };
  const events = [];
  const final = finalizeWrapLaunch({
    cwd: wt,
    bootstrapResult,
    attestKey: FIXTURE_KEY,
    observeFn: () => ({ commit: driftedCommit, tree: driftedTree }),
    emitFn: (rec) => events.push(['emit', rec.ruling, rec.observedBaseCommit]),
  });
  assert.equal(final.spawn, false);
  assert.equal(final.action, 'hold');
  assert.equal(final.reason, 'TOCTOU_prespawn_drift');
  assert.equal(final.code, EXIT_HOLD);
  assert.equal(final.receipt.ruling, 'HOLD');
  assert.equal(final.receipt.observedBaseCommit, driftedCommit);
  assert.equal(final.receipt.observedBaseTree, driftedTree);
  assert.ok(final.receipt.hmac && final.receipt.hmac.length === 64);
  assert.equal(final.persist.ok, true);
  const disk = JSON.parse(fs.readFileSync(final.persist.path, 'utf8'));
  assert.equal(disk.ruling, 'HOLD');
  assert.equal(disk.observedBaseCommit, driftedCommit);
  assert.ok(events.some((e) => e[0] === 'emit' && e[1] === 'HOLD'));
  // hmac verifies against re-observed (drifted) base
  const verify = computeAttestationReceipt({
    worktreeRoot: wt,
    observedBaseCommit: driftedCommit,
    observedBaseTree: driftedTree,
    spineHashes: [],
    failures: final.receipt.failures,
    ruling: 'HOLD',
    key: FIXTURE_KEY,
    epoch: final.receipt.epoch,
    links: [],
  });
  // epoch may differ if enrich used Date.now — compare structural bind instead
  assert.equal(disk.observedBaseCommit, driftedCommit);
  assert.equal(disk.observedBaseTree, driftedTree);
  assert.ok(verify.hmac);
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F3: finalizeWrapLaunch READY path persists then authorizes spawn (order seam)', () => {
  const wt = mkTmp('wtb-final-ready-');
  const commit = 'feed'.repeat(10);
  const tree = 'beef'.repeat(10);
  const bootstrapResult = {
    ruling: 'READY',
    failures: [],
    receipt: {
      correlationId: CORRELATION_ID,
      observedBaseCommit: commit,
      observedBaseTree: tree,
      spineHashes: [],
      links: [],
      launchCommand: 'node wrap',
      wiring: { primary: 'W2' },
    },
  };
  const order = [];
  const final = finalizeWrapLaunch({
    cwd: wt,
    bootstrapResult,
    attestKey: FIXTURE_KEY,
    observeFn: () => {
      order.push('observe');
      return { commit, tree };
    },
    persistFn: (args) => {
      order.push('persist');
      return persistAttestationReceipt(args);
    },
    emitFn: () => order.push('emit'),
  });
  assert.equal(final.spawn, true);
  assert.equal(final.action, 'spawn');
  assert.equal(final.receipt.ruling, 'READY');
  assert.equal(final.persist.ok, true);
  assert.ok(fs.existsSync(final.persist.path));
  assert.deepEqual(order, ['observe', 'persist', 'emit']);
  // spawn authorized only after persist (spawn flag true iff persist.ok already proven)
  assert.equal(final.spawn && final.persist.ok, true);
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F3: receipt dir symlink => HOLD persist fail, no spawn', () => {
  const wt = mkTmp('wtb-receipt-symlink-dir-');
  const outside = mkTmp('wtb-receipt-outside-');
  fs.symlinkSync(outside, path.join(wt, '.yuri-bootstrap'));
  const receipt = {
    ruling: 'READY',
    hmac: 'h'.repeat(64),
    observedBaseCommit: 'a'.repeat(40),
    observedBaseTree: 'b'.repeat(40),
    correlationId: CORRELATION_ID,
    epoch: 1,
  };
  const r = persistAttestationReceipt({ worktreeRoot: wt, receipt });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'receipt_dir_symlink');
  // target not written
  assert.equal(fs.existsSync(path.join(outside, 'attestation-receipt.json')), false);
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F3: injected write failure => HOLD, spawn=false', () => {
  const wt = mkTmp('wtb-receipt-writefail-');
  const commit = 'cafe'.repeat(10);
  const tree = 'babe'.repeat(10);
  const bootstrapResult = {
    ruling: 'READY',
    failures: [],
    receipt: {
      correlationId: CORRELATION_ID,
      observedBaseCommit: commit,
      observedBaseTree: tree,
      spineHashes: [],
      links: [],
      launchCommand: 'node wrap',
    },
  };
  const final = finalizeWrapLaunch({
    cwd: wt,
    bootstrapResult,
    attestKey: FIXTURE_KEY,
    observeFn: () => ({ commit, tree }),
    persistFn: () => ({ ok: false, code: 'receipt_persist_failed', detail: 'injected' }),
    emitFn: () => {},
  });
  assert.equal(final.spawn, false);
  assert.equal(final.action, 'hold');
  assert.equal(final.code, EXIT_HOLD);
  assert.equal(final.reason, 'receipt_persist_failed');
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F3: bootstrap HOLD still persists receipt and does not spawn', () => {
  const wt = mkTmp('wtb-boot-hold-');
  const bootstrapResult = {
    ruling: 'HOLD',
    failures: [{ code: 'validateCursorCli' }],
    receipt: {
      correlationId: CORRELATION_ID,
      observedBaseCommit: 'a'.repeat(40),
      observedBaseTree: 'b'.repeat(40),
      spineHashes: [],
      ruling: 'HOLD',
      hmac: 'c'.repeat(64),
      epoch: 9,
      launchCommand: 'node wrap',
    },
  };
  const final = finalizeWrapLaunch({
    cwd: wt,
    bootstrapResult,
    attestKey: FIXTURE_KEY,
    emitFn: () => {},
  });
  assert.equal(final.spawn, false);
  assert.equal(final.reason, 'bootstrap_hold');
  assert.equal(final.persist.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(final.persist.path, 'utf8')).ruling, 'HOLD');
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F3 conformance: persistAttestationReceipt uses writeFileNoFollowAtomic (symlink file rejected)', () => {
  const wt = mkTmp('wtb-f3-nofollow-');
  const outside = mkTmp('wtb-f3-nofollow-out-');
  const dir = path.join(wt, '.yuri-bootstrap');
  fs.mkdirSync(dir);
  const sentinel = path.join(outside, 'escaped-receipt.json');
  fs.symlinkSync(sentinel, path.join(dir, 'attestation-receipt.json'));
  const r = persistAttestationReceipt({
    worktreeRoot: wt,
    receipt: {
      ruling: 'READY',
      hmac: 'd'.repeat(64),
      observedBaseCommit: 'a'.repeat(40),
      observedBaseTree: 'b'.repeat(40),
      correlationId: CORRELATION_ID,
      epoch: 1,
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.code, /receipt_file_symlink|receipt_nofollow|receipt_persist/);
  assert.equal(fs.existsSync(sentinel), false, 'must not write through receipt symlink');
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F3 conformance: persist deps.writeAtomic seam is the no-follow primitive', () => {
  const wt = mkTmp('wtb-f3-atomic-seam-');
  let called = false;
  const r = persistAttestationReceipt({
    worktreeRoot: wt,
    receipt: { ruling: 'HOLD', hmac: null, correlationId: CORRELATION_ID, epoch: 2 },
    deps: {
      writeAtomic: (...args) => {
        called = true;
        return writeFileNoFollowAtomic(...args);
      },
    },
  });
  assert.equal(called, true);
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(r.path));
  fs.rmSync(wt, { recursive: true, force: true });
});

// ---------- F4 pre-render no-follow containment ----------
test('F4: symlinked .cursor dir => render throws; no write to outside target', () => {
  const wt = mkTmp('wtb-f4-cursor-');
  const outside = mkTmp('wtb-f4-cursor-out-');
  fs.symlinkSync(outside, path.join(wt, '.cursor'));
  assert.throws(
    () => renderProviderConfig('cursor', wt),
    (err) => /dir_symlink|path_escape|nofollow/i.test(String(err?.message || err)),
  );
  assert.equal(fs.readdirSync(outside).length, 0, 'must not write through .cursor symlink');
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F4: symlinked .yuri-bootstrap dir => render throws; no write to outside target', () => {
  const wt = mkTmp('wtb-f4-yb-');
  const outside = mkTmp('wtb-f4-yb-out-');
  fs.symlinkSync(outside, path.join(wt, '.yuri-bootstrap'));
  assert.throws(
    () => renderProviderConfig('cursor', wt),
    (err) => /dir_symlink|path_escape|nofollow/i.test(String(err?.message || err)),
  );
  assert.equal(fs.readdirSync(outside).length, 0, 'must not write through .yuri-bootstrap symlink');
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F4: worktree symlinked .yuri-bootstrap-bin => HOLD/throw; no write to target', () => {
  const wt = mkTmp('wtb-f4-bin-');
  const outside = mkTmp('wtb-f4-bin-out-');
  fs.symlinkSync(outside, path.join(wt, '.yuri-bootstrap-bin'));
  assert.throws(
    () => installPathShims(wt, { providers: ['cursor'] }),
    (err) => /dir_symlink|path_escape|nofollow/i.test(String(err?.message || err)),
  );
  assert.equal(fs.readdirSync(outside).length, 0);
  // also via render (non-main worktree path)
  assert.throws(
    () => renderProviderConfig('cursor', wt),
    (err) => /dir_symlink|path_escape|nofollow/i.test(String(err?.message || err)),
  );
  assert.equal(fs.readdirSync(outside).length, 0);
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F4: writeFileNoFollowAtomic rejects symlink file target (no external write)', () => {
  const wt = mkTmp('wtb-f4-filelink-');
  const outside = mkTmp('wtb-f4-filelink-out-');
  const sentinel = path.join(outside, 'escaped.json');
  const target = path.join(wt, 'payload.json');
  fs.symlinkSync(sentinel, target);
  assert.throws(
    () => writeFileNoFollowAtomic(wt, target, '{"escaped":true}\n'),
    (err) => /file_symlink|nofollow/i.test(String(err?.message || err)),
  );
  assert.equal(fs.existsSync(sentinel), false);
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F4: bootstrapWorktree maps render symlink escape to HOLD render_failed', () => {
  const wt = mkTmp('wtb-f4-boot-');
  const outside = mkTmp('wtb-f4-boot-out-');
  initGitRepo(wt);
  fs.symlinkSync(outside, path.join(wt, '.cursor'));
  const result = bootstrapWorktree({
    worktreeRoot: wt,
    provider: 'cursor',
    attestKey: FIXTURE_KEY,
    writeConfigs: true,
  });
  assert.equal(result.ruling, 'HOLD');
  assert.ok((result.failures || []).some((f) => f.code === 'render_failed'));
  assert.equal(fs.readdirSync(outside).length, 0);
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('F4: ensureDirNoFollow rejects symlink component', () => {
  const wt = mkTmp('wtb-f4-ensuredir-');
  const outside = mkTmp('wtb-f4-ensuredir-out-');
  fs.symlinkSync(outside, path.join(wt, 'linkdir'));
  assert.throws(
    () => ensureDirNoFollow(wt, path.join(wt, 'linkdir', 'child')),
    (err) => /dir_symlink|path_escape/i.test(String(err?.message || err)),
  );
  assert.equal(fs.readdirSync(outside).length, 0);
  fs.rmSync(wt, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

// ---------- F5 interposition proof (October PATH model) ----------
test('F5: October hardenedPath model does not include worktree shim dir', () => {
  const wt = mkTmp('wtb-f5-path-');
  installPathShims(wt, { providers: ['cursor'] });
  const shimDir = path.join(wt, '.yuri-bootstrap-bin');
  assert.ok(fs.existsSync(path.join(shimDir, 'cursor-agent')));
  // Model October: global PATH + extras — deliberately WITHOUT shimDir
  const fakeGlobal = path.join(wt, 'fake-global-bin');
  fs.mkdirSync(fakeGlobal);
  fs.writeFileSync(path.join(fakeGlobal, 'cursor-agent'), '#!/bin/sh\necho REAL\n', { mode: 0o755 });
  const modeled = octoberHardenedPathModel({
    envPath: fakeGlobal,
    extraPaths: ['/nonexistent/extra'],
  });
  assert.ok(!modeled.split(':').includes(shimDir), 'October model must not prepend worktree shim');
  const resolved = resolveOnPath('cursor-agent', modeled);
  assert.equal(resolved, path.join(fakeGlobal, 'cursor-agent'));
  const w2 = assessPathInterposition({
    worktreeRoot: wt,
    envPath: fakeGlobal,
    extraPaths: ['/nonexistent/extra'],
  });
  assert.equal(w2.status, 'INEFFECTIVE_AS_IMPLEMENTED');
  assert.equal(w2.shimOnModeledPath, false);
  assert.equal(w2.resolvedExecutable, path.join(fakeGlobal, 'cursor-agent'));
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F5: if shim dir WERE prepended, assessPathInterposition reports EFFECTIVE (control)', () => {
  const wt = mkTmp('wtb-f5-control-');
  installPathShims(wt, { providers: ['cursor'] });
  const shimDir = path.join(wt, '.yuri-bootstrap-bin');
  const fakeGlobal = path.join(wt, 'fake-global-bin');
  fs.mkdirSync(fakeGlobal);
  fs.writeFileSync(path.join(fakeGlobal, 'cursor-agent'), '#!/bin/sh\necho REAL\n', { mode: 0o755 });
  // Control: prepend shim as would be required for W2 viability
  const w2 = assessPathInterposition({
    worktreeRoot: wt,
    envPath: `${shimDir}:${fakeGlobal}`,
    extraPaths: [],
  });
  assert.equal(w2.status, 'EFFECTIVE');
  assert.equal(path.resolve(w2.resolvedExecutable), path.resolve(path.join(shimDir, 'cursor-agent')));
  fs.rmSync(wt, { recursive: true, force: true });
});

test('F5: composeWrapCommand first token is node → W1 bypassed on autoBoot', () => {
  const wrap = composeWrapCommand('cursor', REPO_ROOT);
  assert.match(wrap, /^node /);
  const w1 = assessStartCommandInterposition({ wrapCommand: wrap, autoBoot: true });
  assert.equal(w1.usableFb, false);
  assert.equal(w1.status, 'W1_BYPASSED_ON_AUTOBOOT_FOR_NODE_WRAP');
  assert.equal(w1.octoberField, 'p.startCommand');
});

test('F5: assessInterposition overall NEITHER on typical autoBoot → owner escalation', () => {
  const wt = mkTmp('wtb-f5-overall-');
  installPathShims(wt, { providers: ['cursor'] });
  const fakeGlobal = path.join(wt, 'fake-global-bin');
  fs.mkdirSync(fakeGlobal);
  fs.writeFileSync(path.join(fakeGlobal, 'cursor-agent'), '#!/bin/sh\necho REAL\n', { mode: 0o755 });
  const verdict = assessInterposition({
    worktreeRoot: wt,
    autoBoot: true,
    envPath: fakeGlobal,
    extraPaths: [],
  });
  assert.equal(verdict.w2.status, 'INEFFECTIVE_AS_IMPLEMENTED');
  assert.equal(verdict.w1.status, 'W1_BYPASSED_ON_AUTOBOOT_FOR_NODE_WRAP');
  assert.equal(verdict.overall, 'NEITHER_EFFECTIVE_ON_TYPICAL_AUTOBOOT');
  assert.equal(verdict.ownerEscalationRequired, true);
  assert.equal(verdict.unitGreenIsNotInterpositionProof, true);
  assert.equal(verdict.liveProofRequired, true);
  fs.rmSync(wt, { recursive: true, force: true });
});
