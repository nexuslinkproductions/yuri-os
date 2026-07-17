#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildVoxKeyPlan,
  CONFIG_PATH,
  acquireOperationLock,
  acquireRecoveryClaim,
  assertManagedPath,
  assertParentIdentityGuard,
  assertRecoveryClaimCurrent,
  assertRollbackQuiescent,
  appendManagedRequireBytes,
  buildTransactionEnvironment,
  captureFileMetadata,
  captureParentIdentityGuard,
  fsyncManagedTree,
  installHammerspoonProjection,
  loadVoxKeyConfig,
  matchVoiceProcess,
  parseSymbolicHotkeyState,
  processCommandIdentity,
  recoverInterruptedOperation,
  readRollbackJournal,
  releaseRecoveryClaim,
  releaseOperationLock,
  removeManagedRequireBytes,
  removeManagedRequireLine,
  rollbackInstalledProjection,
  runTrackedChecked,
  stopOwnedProcessGroup,
  runtimeBindingSha256,
  runtimePaths,
  validateVoxKeyConfig,
  validateInstallReceipt,
  verifyInstalledRuntime,
  verifyPinnedSource,
} from './voxkey-control.mjs';

const sha256 = (body) => createHash('sha256').update(body).digest('hex');

const config = loadVoxKeyConfig();
const controllerPath = path.join(path.dirname(CONFIG_PATH), '../Scripts/voice/voxkey-control.mjs');
const controller = readFileSync(controllerPath, 'utf8');
assert.deepEqual(validateVoxKeyConfig(config), [], 'VoxKey config must satisfy safety defaults');
assert.throws(() => assertRollbackQuiescent(config), /unbind confirmation/, 'rollback must require explicit Hammerspoon unbind confirmation');
assert.equal(config.upstream.commit, 'f4416ebdf00c1ca4d1b1840103f936d965a66b2f', 'upstream commit pin drift');
assert.equal(config.upstream.tree, 'b0c65684b44deddcee148fc8c79f7c307e62ccc4', 'upstream tree pin drift');
assert.equal(config.model.archiveSha256, '5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf', 'model pin drift');
assert.equal(config.privacy.formatter, 'disabled');
assert.equal(config.privacy.autoSubmit, false);
assert.equal(config.privacy.contextCapture, 'disabled');
assert.equal(config.privacy.history, 'disabled');
assert.equal(config.hotkey.automaticSystemRemap, false);
assert.match(config.runtime.operationLock, /voxkey-backups\/\.operation\.lock$/);
assert.equal(config.hotkey.observedBeforeIntegration.enabled, true);
assert.match(config.hotkey.observedBeforeIntegration.rollback, /Re-enable macOS symbolic hotkey 60/);
const baseRuntimeBinding = runtimeBindingSha256(config);
for (const mutate of [
  (value) => { value.privacy.autoSubmit = true; },
  (value) => { value.hotkey.key = 'rightalt'; },
  (value) => { value.runtime.pttHeldFlag = '_SYSTEM/state/voice/other-held.flag'; },
  (value) => { value.model.archiveSha256 = '0'.repeat(64); },
  (value) => { value.activationGates = value.activationGates.slice(1); },
]) {
  const changed = structuredClone(config);
  mutate(changed);
  assert.notEqual(runtimeBindingSha256(changed), baseRuntimeBinding, 'runtime binding must cover every safety-relevant config family');
}
for (const required of [
  'linkSync(candidate, paths.operationLock)',
  'recovery-claim-${lock.token}.lock',
  "'archive', '--format=tar'",
  'export function buildTransactionEnvironment',
  'YURI_VOXKEY_TRANSACTION_ROOT: stageRoot',
  'export function fsyncManagedTree',
  'export function runTrackedChecked',
  'durableRename(stage.stageDataRoot, paths.dataRoot,',
  'export function recoverInterruptedOperation',
  "'rollback-journal.json'",
  "'projection-plan.json'",
]) assert(controller.includes(required), `controller transaction architecture missing: ${required}`);
assert(
  controller.indexOf("projection.moduleSha256 = createHash") < controller.indexOf('atomicWrite(moduleTarget, moduleBody,'),
  'projection hashes must be computed and journaled before any live projection write',
);
const atomicWriteBlock = controller.slice(controller.indexOf('function atomicWrite('), controller.indexOf('\nfunction durableRename('));
assert(
  atomicWriteBlock.indexOf('applyFileMetadata(temporary, metadata)') < atomicWriteBlock.indexOf('fsyncFile(temporary)')
    && atomicWriteBlock.indexOf('fsyncFile(temporary)') < atomicWriteBlock.indexOf('renameSync(temporary, file)')
    && atomicWriteBlock.indexOf('renameSync(temporary, file)') < atomicWriteBlock.indexOf('fsyncDirectory(path.dirname(file))'),
  'atomic writes must durably flush restored metadata before rename and the parent directory after rename',
);

const enabled = parseSymbolicHotkeyState(`{
    60 = {
        enabled = 1;
        value = { parameters = (32, 49, 262144); type = standard; };
    };
}`, 60);
assert.deepEqual(enabled, { known: true, enabled: true }, 'enabled Ctrl+Space fixture must parse');
const disabled = parseSymbolicHotkeyState(`{
    "60" = {
        enabled = 0;
        value = { parameters = (32, 49, 262144); type = standard; };
    };
}`, 60);
assert.deepEqual(disabled, { known: true, enabled: false }, 'disabled Ctrl+Space fixture must parse');
assert.deepEqual(parseSymbolicHotkeyState('{}', 60), { known: false, enabled: null }, 'missing hotkey must fail closed');

const plan = buildVoxKeyPlan(config);
assert.equal(plan.hotkey, 'Ctrl+Space');
assert.equal(plan.automaticSystemRemap, false);
assert.equal(plan.formatter, 'disabled');
assert(plan.installSteps.some((step) => step.includes('capacity-clearance token')), 'install plan must require explicit capacity clearance');
assert(plan.installSteps.some((step) => step.includes('durable global operation lock')), 'install plan must include crash-safe global serialization');
assert(plan.activationGates.includes('recovery-capacity-clearance'), 'capacity gate missing');
assert(plan.activationGates.includes('transactional-install-and-recovery-tests'), 'transaction recovery gate missing');
assert(plan.activationGates.includes('macos-control-space-remapped-with-rollback'), 'hotkey rollback gate missing');

const lua = readFileSync(path.join(path.dirname(CONFIG_PATH), '../Scripts/voice/yuri-voxkey.lua'), 'utf8');
assert(lua.includes(`local expectedRuntimeBindingSha256 = "${baseRuntimeBinding}"`), 'Lua receipt gate must pin the complete runtime safety binding');
for (const required of [
  'hs.canvas.new',
  'bottom Flow Bar',
  'hs.hotkey.systemAssigned',
  'assignment.enabled == false',
  'hs.hotkey.assignable',
  'hs.eventtap.isSecureInputEnabled',
  'maxRecordingSeconds = 120',
  'hs.caffeinate.watcher.screensDidLock',
  'ptt-owner.lock',
  'hs.fs.mkdir(ownerLock)',
  'hs.fs.lockDir(ownerLock, maxRecordingSeconds + 15)',
  'AXSecureTextField',
  'AXFocusedUIElement',
  'targetWindow',
  'sameTarget',
  'ptt-held.flag',
  'VOXKEY_NO_FORMAT = "1"',
  'Another voice listener is active',
  'Release to transcribe · Esc cancels',
  'local repoRoot = home .. "/YURI-OS-MUSUBI"',
  'local command = home .. "/.local/bin/voxkey"',
  'local runtimePython = dataRoot .. "/venv/bin/python"',
  'os.setsid()',
  'local function processGroupRows(run)',
  '/bin/kill -KILL -- -',
  'local receiptPath = home .. "/.local/state/yuri/voxkey-install.json"',
  'receipt.schemaVersion ~= 2',
  'receipt.activation ~= "pending-hammerspoon-reload-tcc-and-assignability-proof"',
  'receipt.runtimeBindingSha256 ~= expectedRuntimeBindingSha256',
  'not validSha256(receipt.managedAppendSha256)',
  'sha256(moduleBody) ~= receipt.moduleSha256',
  'commandAttributes.target ~= fingerprint.commandLinkTarget',
  'sha256(nodeLockBody) ~= upstreamNodeLockSha256',
  'local output, ok = hs.execute("/bin/ps -ax -o command=", true)',
  'if ok ~= true or type(output) ~= "string" then return nil, "process-table-unavailable" end',
  'option == "-o" or option == "+o" or option == "-O" or option == "+O"',
  'terminationGraceSeconds = 0.75',
  'transcriptionTimeoutSeconds = 30',
  'cancelRun("Transcription timed out; process terminated")',
  'hardKillTask(run)',
  'hs.timer.usleep(50000)',
  'M.unbind({ synchronous = true })',
  'if not activeRun then releaseOwnership() end',
]) assert(lua.includes(required), `Lua adapter missing: ${required}`);
assert(!lua.includes('key code 36'), 'adapter must never auto-submit Enter');
assert(!lua.includes('require("voxkey")'), 'adapter must not revive the ungoverned upstream module');
assert(!lua.includes(':activate('), 'adapter must never steal focus back before insertion');
assert(!lua.includes('os.getenv("YURI_REPO")'), 'repo root must not accept an unreceipted environment override');
assert(!lua.includes('os.getenv("VOXKEY_COMMAND")'), 'command path must not accept an unreceipted environment override');
assert(lua.includes('type = "oval"'), 'Flow Bar status geometry must use a framed oval');
assert(lua.includes('local enabled = hotkey:enable()'), 'hotkey enable result must be checked');
const cancelBlock = lua.slice(lua.indexOf('cancelRun = function'), lua.indexOf('\nlocal function startRecording'));
assert(!cancelBlock.includes('activeRun = nil'), 'cancellation must retain the active run until child exit is proven');
assert(!cancelBlock.includes('releaseOwnership()'), 'cancellation must retain PTT ownership until child exit is proven');
assert(cancelBlock.includes('beginCancellation(run)'), 'cancellation must use the grace/escalation state machine');
const stopRecordingBlock = lua.slice(lua.indexOf('local function stopRecording'), lua.indexOf('\nlocal function hotkeyAvailable'));
assert(!stopRecordingBlock.includes('releaseOwnership()'), 'key release must retain PTT ownership through transcription exit');
const finishRunBlock = lua.slice(lua.indexOf('finishRun = function'), lua.indexOf('\ncancelRun = function'));
assert(finishRunBlock.includes('releaseOwnership()'), 'only terminal run completion may release PTT ownership');

assert.deepEqual(processCommandIdentity('/usr/bin/python3 -u /repo/_SYSTEM/Scripts/voice/voice-ptt.py'), {
  executable: '/usr/bin/python3',
  script: '/repo/_SYSTEM/Scripts/voice/voice-ptt.py',
});
assert.equal(matchVoiceProcess('/usr/bin/python3 /repo/_SYSTEM/Scripts/voice/voice-ptt.py', config.exclusiveListenerPatterns), '_SYSTEM/Scripts/voice/voice-ptt.py');
assert.equal(matchVoiceProcess('/usr/bin/node agent.js "prompt mentions _SYSTEM/Scripts/voice/voice-ptt.py"', config.exclusiveListenerPatterns), '', 'prompt text must not create a process false-positive');
assert.equal(matchVoiceProcess('/usr/bin/python3 -W ignore -X dev agent.py "_SYSTEM/Scripts/voice/voice-ptt.py"', config.exclusiveListenerPatterns), '', 'Python option operands must not be mistaken for script identity');
assert.equal(matchVoiceProcess('/bin/bash -o pipefail /repo/_SYSTEM/Scripts/voice/voice-listen.sh', config.exclusiveListenerPatterns), '_SYSTEM/Scripts/voice/voice-listen.sh', 'shell option operands must not hide the voice script');
assert.equal(matchVoiceProcess('/usr/bin/env -u FOO /usr/bin/python3 /repo/_SYSTEM/Scripts/voice/voice-ptt.py', config.exclusiveListenerPatterns), '_SYSTEM/Scripts/voice/voice-ptt.py', 'env option operands must not hide the voice script');
assert.equal(matchVoiceProcess('/Users/test/.local/bin/voxkey record', config.exclusiveListenerPatterns), 'voxkey-cli');
assert.equal(matchVoiceProcess('/usr/bin/python3 -m voxkey record', config.exclusiveListenerPatterns), 'voxkey-cli');
assert.equal(removeManagedRequireLine('print("before")\nrequire("yuri-voxkey") -- YURI:voxkey-managed-v1\nprint("after")\n'), 'print("before")\nprint("after")\n');
assert.throws(() => removeManagedRequireLine('print("no owned line")\n'), /exactly one managed/);
const exactInitFixture = Buffer.from('print("before")\r\n-- trailing bytes  \t', 'utf8');
const projectedInitFixture = appendManagedRequireBytes(exactInitFixture);
assert(removeManagedRequireBytes(projectedInitFixture, exactInitFixture).equals(exactInitFixture), 'rollback with no unrelated edits must be byte-for-byte exact');
const laterEditFixture = Buffer.from('print("later")\n', 'utf8');
const rolledBackWithLaterEdit = removeManagedRequireBytes(Buffer.concat([projectedInitFixture, laterEditFixture]), exactInitFixture);
assert(rolledBackWithLaterEdit.subarray(0, exactInitFixture.length).equals(exactInitFixture), 'rollback with later edits must preserve the exact prior byte prefix');
assert.match(rolledBackWithLaterEdit.toString('utf8'), /\nprint\("later"\)\n$/, 'rollback must keep later edits syntactically separated');
const processGroupSignals = [];
let processGroupWaits = 0;
assert.equal(stopOwnedProcessGroup(4242, {
  exists: () => true,
  signal: (groupId, signalName) => processGroupSignals.push([groupId, signalName]),
  wait: () => (++processGroupWaits) === 2,
}), true, 'owned process groups must escalate until quiescence is proven');
assert.deepEqual(processGroupSignals, [[4242, 'SIGTERM'], [4242, 'SIGKILL']]);
assert.throws(() => stopOwnedProcessGroup(4242, {
  exists: () => true,
  signal: () => {},
  wait: () => false,
}), /did not quiesce/, 'process-group quiescence failure must remain blocking');

const temporary = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'yuri-voxkey-source-'));
const temporaryLink = `${temporary}-symlink`;
try {
  writeFileSync(path.join(temporary, 'install.sh'), '#!/bin/sh\nexit 0\n');
  execFileSync('git', ['init', '-q'], { cwd: temporary });
  execFileSync('git', ['add', 'install.sh'], { cwd: temporary });
  execFileSync('git', ['-c', 'user.name=YURI Test', '-c', 'user.email=yuri-test@example.invalid', 'commit', '-qm', 'fixture'], { cwd: temporary });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: temporary, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: temporary, encoding: 'utf8' }).trim();
  const digest = createHash('sha256').update(readFileSync(path.join(temporary, 'install.sh'))).digest('hex');
  const fixtureConfig = {
    ...config,
    upstream: { ...config.upstream, commit, tree, files: { 'install.sh': digest } },
  };
  const receipt = verifyPinnedSource(temporary, fixtureConfig);
  assert.equal(receipt.ok, true, receipt.errors.join('; '));
  writeFileSync(path.join(temporary, 'install.sh'), '#!/bin/sh\nexit 1\n');
  const drift = verifyPinnedSource(temporary, fixtureConfig);
  assert.equal(drift.ok, false, 'dirty/hash-drifted source must fail');
  assert(drift.errors.some((error) => error.includes('dirty')));
  assert(drift.errors.some((error) => error.includes('hash mismatch')));
  rmSync(path.join(temporary, 'install.sh'));
  writeFileSync(path.join(temporary, 'real-install.sh'), '#!/bin/sh\nexit 0\n');
  symlinkSync(path.join(temporary, 'real-install.sh'), path.join(temporary, 'install.sh'));
  const linked = verifyPinnedSource(temporary, fixtureConfig);
  assert.equal(linked.ok, false, 'symlinked pinned files must fail closed');
  assert(linked.errors.some((error) => error.includes('unsafe pinned file')));
  symlinkSync(temporary, temporaryLink);
  assert.throws(() => verifyPinnedSource(temporaryLink, fixtureConfig), /symlinked managed path refused/, 'source-root symlinks must be rejected before Git traversal');
  renameSync(path.join(temporary, '.git'), path.join(temporary, '.git-real'));
  symlinkSync(path.join(temporary, '.git-real'), path.join(temporary, '.git'));
  assert.throws(() => verifyPinnedSource(temporary, fixtureConfig), /symlinked managed path refused/, 'symlinked Git metadata must be rejected before Git traversal');
} finally {
  rmSync(temporaryLink, { force: true });
  rmSync(temporary, { recursive: true, force: true });
}

const transactionRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'yuri-voxkey-transaction-'));
try {
  const hammerspoonRoot = path.join(transactionRoot, 'hammerspoon');
  const stateRoot = path.join(transactionRoot, 'state');
  const backupRoot = path.join(stateRoot, 'backups');
  const dataRoot = path.join(transactionRoot, 'share', 'voxkey');
  const command = path.join(transactionRoot, 'bin', 'voxkey');
  const module = path.join(hammerspoonRoot, 'yuri-voxkey.lua');
  const init = path.join(hammerspoonRoot, 'init.lua');
  const receiptPath = path.join(stateRoot, 'voxkey-install.json');
  const transactionId = 'voxkey-00000000-0000-4000-8000-000000000001';
  const backupDir = path.join(backupRoot, transactionId);
  const runtimeLockBody = '{"fixture":true}\n';
  const originalInitBytes = Buffer.from('print("before")\r\n-- preserve trailing bytes  \t', 'utf8');
  const fixtureConfig = {
    ...config,
    upstream: {
      ...config.upstream,
      files: { ...config.upstream.files, 'package-lock.json': sha256(runtimeLockBody) },
    },
    runtime: {
      ...config.runtime,
      command,
      dataRoot,
      modelRoot: path.join(dataRoot, 'models', 'parakeet'),
      hammerspoonModule: module,
      hammerspoonInit: init,
      receipt: receiptPath,
      backupRoot,
      operationLock: path.join(backupRoot, '.operation.lock'),
      pttHeldFlag: path.join(transactionRoot, 'voice-state', 'ptt-held.flag'),
      pttOwnerLock: path.join(transactionRoot, 'voice-state', 'ptt-owner.lock', 'lockfile.lfs'),
    },
  };
  mkdirSync(backupDir, { recursive: true });
  const operation = acquireOperationLock(fixtureConfig, 'install', transactionId);
  assert.throws(() => acquireOperationLock(fixtureConfig, 'rollback', transactionId), /operation lock exists/, 'only one controller may own the runtime mutation lock');
  const stageRoot = path.join(backupDir, 'test-stage');
  const stage = {
    stageRoot,
    stageHome: path.join(stageRoot, 'home'),
    stageDataHome: path.join(stageRoot, 'data'),
  };
  mkdirSync(stage.stageHome, { recursive: true });
  mkdirSync(stage.stageDataHome, { recursive: true });
  const poisonedKeys = ['BASH_ENV', 'NODE_OPTIONS', 'PYTHONPATH', 'AWS_SECRET_ACCESS_KEY', 'NPM_CONFIG_PREFIX', 'TMPDIR'];
  const priorEnvironment = Object.fromEntries(poisonedKeys.map((key) => [key, process.env[key]]));
  for (const key of poisonedKeys) process.env[key] = path.join(transactionRoot, `poison-${key}`);
  const isolatedEnvironment = buildTransactionEnvironment(stage, process.execPath, { transactionId });
  for (const key of ['BASH_ENV', 'NODE_OPTIONS', 'PYTHONPATH', 'AWS_SECRET_ACCESS_KEY', 'NPM_CONFIG_PREFIX']) {
    assert.equal(isolatedEnvironment[key], undefined, `ambient ${key} must not enter the transaction`);
  }
  for (const key of ['HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'PIP_CACHE_DIR', 'NPM_CONFIG_CACHE']) {
    const relative = path.relative(stageRoot, isolatedEnvironment[key]);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${key} must remain inside staging`);
  }
  for (const [key, value] of Object.entries(priorEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  runTrackedChecked('/bin/sh', ['-c', 'exit 0'], {
    env: isolatedEnvironment,
    stdio: 'inherit',
  }, 'tracked child fixture', {
    config: fixtureConfig,
    lock: operation,
    transaction: { transactionId, backupDir },
  });
  assert(
    readdirSync(backupDir).some((name) => /^child-state-.*\.json$/.test(name)),
    'tracked child execution must leave a durable process-group state record',
  );
  assert.throws(
    () => runTrackedChecked('/bin/sh', ['-c', 'sleep 5 &'], {
      env: isolatedEnvironment,
      stdio: 'pipe',
      encoding: 'utf8',
    }, 'tracked descendant leak fixture', {
      config: fixtureConfig,
      lock: operation,
      transaction: { transactionId, backupDir },
    }),
    /live descendants|failed with exit/,
    'normal-path child completion must terminate and reject leaked descendants',
  );
  const firstClaim = acquireRecoveryClaim(fixtureConfig, operation);
  assert.throws(() => acquireRecoveryClaim(fixtureConfig, operation), /already owned/, 'only one recovery claimant may own a transaction');
  const deadPid = spawnSync('/usr/bin/true').pid;
  const staleClaimRecord = JSON.parse(readFileSync(firstClaim.claimPath, 'utf8'));
  writeFileSync(firstClaim.claimPath, `${JSON.stringify({
    ...staleClaimRecord,
    owner: { pid: deadPid, ppid: 1, startToken: 'dead-process-start-token' },
  }, null, 2)}\n`);
  const takeoverClaim = acquireRecoveryClaim(fixtureConfig, operation);
  assert.equal(assertRecoveryClaimCurrent(fixtureConfig, takeoverClaim).token, operation.token, 'stale recovery claims must be atomically reclaimable');
  const takeoverClaimBody = readFileSync(takeoverClaim.claimPath, 'utf8');
  const originalClaimPath = path.join(backupDir, 'recovery-claim-before-cas-swap.json');
  const replacementClaimPath = path.join(backupDir, 'recovery-claim-replacement-quarantine.json');
  renameSync(takeoverClaim.claimPath, originalClaimPath);
  writeFileSync(takeoverClaim.claimPath, takeoverClaimBody);
  assert.throws(
    () => assertRecoveryClaimCurrent(fixtureConfig, takeoverClaim),
    /claim pathname changed/,
    'recovery claimant must reject a same-bytes claim-path inode replacement before mutation',
  );
  renameSync(takeoverClaim.claimPath, replacementClaimPath);
  renameSync(originalClaimPath, takeoverClaim.claimPath);
  assert.equal(assertRecoveryClaimCurrent(fixtureConfig, takeoverClaim).token, operation.token);
  const operationLockBody = readFileSync(fixtureConfig.runtime.operationLock, 'utf8');
  const originalOperationLock = path.join(backupDir, 'operation-lock-before-cas-swap.json');
  const replacementOperationLock = path.join(backupDir, 'operation-lock-replacement-quarantine.json');
  renameSync(fixtureConfig.runtime.operationLock, originalOperationLock);
  writeFileSync(fixtureConfig.runtime.operationLock, operationLockBody);
  assert.throws(
    () => assertRecoveryClaimCurrent(fixtureConfig, takeoverClaim),
    /operation lock changed/,
    'recovery claimant must reject a same-bytes operation-lock inode replacement before mutation',
  );
  renameSync(fixtureConfig.runtime.operationLock, replacementOperationLock);
  renameSync(originalOperationLock, fixtureConfig.runtime.operationLock);
  assert.equal(assertRecoveryClaimCurrent(fixtureConfig, takeoverClaim).token, operation.token);
  assert.equal(existsSync(releaseRecoveryClaim(takeoverClaim, 'unit-test')), true);
  const archivedOperation = releaseOperationLock(fixtureConfig, operation, 'unit-test');
  assert.equal(existsSync(archivedOperation), true, 'released operation locks must be durably archived');
  mkdirSync(hammerspoonRoot, { recursive: true });
  writeFileSync(module, '-- prior module\n');
  writeFileSync(init, originalInitBytes);
  chmodSync(module, 0o750);
  chmodSync(init, 0o640);
  if (existsSync('/usr/bin/xattr')) {
    execFileSync('/usr/bin/xattr', ['-w', 'com.yuri.voxkey-test', 'fixture-xattr', init]);
  }
  const projection = installHammerspoonProjection(fixtureConfig, { transactionId, backupDir });
  assert.match(readFileSync(init, 'utf8'), /YURI:voxkey-managed-v1/);
  assert.equal(lstatSync(module).mode & 0o7777, 0o750, 'projection must preserve prior module mode');
  assert.equal(lstatSync(init).mode & 0o7777, 0o640, 'projection must preserve prior init mode');
  if (existsSync('/usr/bin/xattr')) {
    assert.equal(execFileSync('/usr/bin/xattr', ['-p', 'com.yuri.voxkey-test', init], { encoding: 'utf8' }).trim(), 'fixture-xattr');
  }
  writeFileSync(init, `${readFileSync(init, 'utf8')}print("later unrelated edit")\n`);
  const commandTarget = path.join(dataRoot, 'venv', 'bin', 'voxkey');
  const nodeLock = path.join(dataRoot, 'node', 'package-lock.json');
  mkdirSync(path.dirname(commandTarget), { recursive: true });
  mkdirSync(path.dirname(nodeLock), { recursive: true });
  writeFileSync(commandTarget, '#!/bin/sh\n');
  writeFileSync(nodeLock, runtimeLockBody);
  mkdirSync(path.dirname(command), { recursive: true });
  symlinkSync(commandTarget, command);
  const runtimeMarker = `${JSON.stringify({
    schemaVersion: 1,
    transactionId,
    upstream: { commit: fixtureConfig.upstream.commit, tree: fixtureConfig.upstream.tree },
    commandLinkTarget: commandTarget,
    commandTargetSha256: sha256('#!/bin/sh\n'),
    nodeLockSha256: sha256(runtimeLockBody),
  }, null, 2)}\n`;
  const markerPath = path.join(dataRoot, '.yuri-voxkey-owner.json');
  writeFileSync(markerPath, runtimeMarker);
  const receipt = {
    schemaVersion: 2,
    runtimeBindingSha256: runtimeBindingSha256(fixtureConfig),
    transactionId,
    upstream: { commit: config.upstream.commit, tree: config.upstream.tree },
    backupDir,
    command,
    dataRoot,
    module,
    init,
    moduleSha256: projection.moduleSha256,
    moduleBeforeSha256: projection.moduleBeforeSha256,
  initAfterSha256: projection.initAfterSha256,
  initBeforeSha256: projection.initBeforeSha256,
  managedAppendSha256: projection.managedAppendSha256,
    previous: projection.previous,
    previousMetadata: projection.previousMetadata,
    parentGuard: projection.parentGuard,
    requireAdded: true,
    runtimeCreated: true,
    runtimeFingerprint: {
      commandLinkTarget: commandTarget,
      commandTargetSha256: sha256('#!/bin/sh\n'),
      nodeLockSha256: sha256(runtimeLockBody),
      markerSha256: sha256(runtimeMarker),
    },
  };
  assert.equal(validateInstallReceipt(fixtureConfig, receipt).module, module);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(verifyInstalledRuntime(fixtureConfig).transactionId, transactionId, 'doctor verification must traverse the complete receipt/runtime fingerprint');
  writeFileSync(commandTarget, '#!/bin/sh\n# tampered\n');
  assert.throws(() => verifyInstalledRuntime(fixtureConfig), /fingerprint mismatch/, 'doctor verification must reject live command-target drift');
  writeFileSync(commandTarget, '#!/bin/sh\n');
  const tampered = { ...receipt, module: path.join(transactionRoot, 'victim.txt') };
  assert.throws(() => validateInstallReceipt(fixtureConfig, tampered), /does not match configured target/);
  assert.throws(() => validateInstallReceipt(fixtureConfig, { ...receipt, transactionId: '../../escape' }), /invalid install receipt/);

  assert.throws(() => rollbackInstalledProjection(fixtureConfig, receipt), /quiescence proof/);
  let rollbackFault;
  try { rollbackInstalledProjection(fixtureConfig, receipt, { quiescenceProved: true, _testFaultAfterPhase: 'module-applied' }); }
  catch (error) { rollbackFault = error; }
  assert.match(rollbackFault?.message || '', /injected rollback fault/, 'a mid-rollback failure must surface after restoring the exact live state');
  assert.doesNotMatch(rollbackFault.message, /recovery failed/, 'caught rollback faults must restore without a secondary recovery failure');
  assert.equal(existsSync(command), true, 'failed rollback must restore the command');
  assert.equal(existsSync(dataRoot), true, 'failed rollback must restore the data root');
  assert.match(readFileSync(init, 'utf8'), /later unrelated edit/, 'failed rollback must restore the current init snapshot');
  assert.equal(lstatSync(module).mode & 0o7777, 0o750, 'failed rollback recovery must preserve module mode');
  assert.equal(lstatSync(init).mode & 0o7777, 0o640, 'failed rollback recovery must preserve init mode');
  const rollbackJournalPath = path.join(backupDir, 'rollback-journal.json');
  const originalRollbackJournal = readFileSync(rollbackJournalPath, 'utf8');
  const tamperedRollbackJournal = JSON.parse(originalRollbackJournal);
  const victimPath = path.join(transactionRoot, 'victim.txt');
  writeFileSync(victimPath, 'do-not-move\n');
  const victimInode = lstatSync(victimPath).ino;
  tamperedRollbackJournal.runtimeMoves[0].from = victimPath;
  writeFileSync(rollbackJournalPath, `${JSON.stringify(tamperedRollbackJournal, null, 2)}\n`);
  assert.throws(() => readRollbackJournal(fixtureConfig, transactionId), /runtimeMoves\[0\]\.from mismatch/, 'rollback journal paths must be exact-bound to config');
  assert.equal(lstatSync(victimPath).ino, victimInode, 'tampered rollback recovery must not move the victim inode');
  assert.equal(readFileSync(victimPath, 'utf8'), 'do-not-move\n');
  writeFileSync(rollbackJournalPath, originalRollbackJournal);
  const rolledBack = rollbackInstalledProjection(fixtureConfig, receipt, { quiescenceProved: true });
  const nextInit = readFileSync(init, 'utf8');
  assert(readFileSync(init).subarray(0, originalInitBytes.length).equals(originalInitBytes), 'rollback must preserve the original init.lua byte prefix exactly');
  assert.match(nextInit, /print\("before"\)/);
  assert.match(nextInit, /later unrelated edit/);
  assert.doesNotMatch(nextInit, /YURI:voxkey-managed-v1/, 'rollback must remove only the owned require line');
  assert.equal(readFileSync(module, 'utf8'), '-- prior module\n', 'prior module must be restored');
  assert.equal(lstatSync(module).mode & 0o7777, 0o750, 'final rollback must restore prior module mode');
  assert.equal(lstatSync(init).mode & 0o7777, 0o640, 'final rollback must retain prior init mode');
  if (existsSync('/usr/bin/xattr')) {
    assert.equal(execFileSync('/usr/bin/xattr', ['-p', 'com.yuri.voxkey-test', init], { encoding: 'utf8' }).trim(), 'fixture-xattr');
  }
  assert.equal(existsSync(command), false, 'owned command must leave its live path');
  assert.equal(existsSync(dataRoot), false, 'owned data root must leave its live path');
  assert(rolledBack.runtimeMoves.some((move) => move.to.endsWith('rolled-back-voxkey-data')), 'runtime data must be quarantined');
  const retry = rollbackInstalledProjection(fixtureConfig, receipt, { quiescenceProved: true });
  assert.equal(retry.alreadyApplied, true, 'successful rollback must be idempotently finalizable');

  const real = path.join(transactionRoot, 'real-root');
  const linked = path.join(transactionRoot, 'linked-root');
  mkdirSync(real);
  symlinkSync(real, linked);
  assert.throws(() => assertManagedPath(path.join(linked, 'target')), /symlinked managed path refused/);
  const fsyncTree = path.join(backupDir, 'fsync-tree');
  mkdirSync(path.join(fsyncTree, 'nested'), { recursive: true });
  writeFileSync(path.join(fsyncTree, 'nested', 'payload.txt'), 'durable\n');
  symlinkSync(victimPath, path.join(fsyncTree, 'outside-link'));
  assert.equal(fsyncManagedTree(fsyncTree), true, 'runtime tree fsync must accept regular files and refuse to follow symlinks');
  if (existsSync('/usr/bin/mkfifo')) {
    execFileSync('/usr/bin/mkfifo', [path.join(fsyncTree, 'unsupported-fifo')]);
    assert.throws(() => fsyncManagedTree(fsyncTree), /unsupported entry/, 'runtime tree fsync must fail closed on special files');
  }
  const guardedPaths = runtimePaths(fixtureConfig);
  const parentGuard = captureParentIdentityGuard(guardedPaths);
  assert.equal(assertParentIdentityGuard(guardedPaths, parentGuard), true);
  const movedHammerspoonRoot = `${hammerspoonRoot}.original`;
  const replacementHammerspoonRoot = `${hammerspoonRoot}.replacement`;
  renameSync(hammerspoonRoot, movedHammerspoonRoot);
  mkdirSync(hammerspoonRoot, { mode: 0o700 });
  assert.throws(
    () => assertParentIdentityGuard(guardedPaths, parentGuard),
    /managed parent identity changed/,
    'parent directory inode replacement must fail closed before mutation',
  );
  renameSync(hammerspoonRoot, replacementHammerspoonRoot);
  renameSync(movedHammerspoonRoot, hammerspoonRoot);
  assert.equal(sha256(readFileSync(path.join(backupDir, 'yuri-voxkey.lua.before'))), receipt.moduleBeforeSha256);
} finally {
  rmSync(transactionRoot, { recursive: true, force: true });
}

const absentInitRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'yuri-voxkey-absent-init-'));
try {
  const hammerspoonRoot = path.join(absentInitRoot, 'hammerspoon');
  const backupRoot = path.join(absentInitRoot, 'state', 'backups');
  const dataRoot = path.join(absentInitRoot, 'share', 'voxkey');
  const command = path.join(absentInitRoot, 'bin', 'voxkey');
  const module = path.join(hammerspoonRoot, 'yuri-voxkey.lua');
  const init = path.join(hammerspoonRoot, 'init.lua');
  const transactionId = 'voxkey-00000000-0000-4000-8000-000000000002';
  const backupDir = path.join(backupRoot, transactionId);
  const lockBody = '{"absentInitFixture":true}\n';
  const fixtureConfig = {
    ...config,
    upstream: { ...config.upstream, files: { ...config.upstream.files, 'package-lock.json': sha256(lockBody) } },
    runtime: {
      ...config.runtime,
      command,
      dataRoot,
      modelRoot: path.join(dataRoot, 'models', 'parakeet'),
      hammerspoonModule: module,
      hammerspoonInit: init,
      receipt: path.join(absentInitRoot, 'state', 'receipt.json'),
      backupRoot,
      operationLock: path.join(backupRoot, '.operation.lock'),
      pttHeldFlag: path.join(absentInitRoot, 'voice-state', 'ptt-held.flag'),
      pttOwnerLock: path.join(absentInitRoot, 'voice-state', 'ptt-owner.lock', 'lockfile.lfs'),
    },
  };
  mkdirSync(backupDir, { recursive: true });
  const projection = installHammerspoonProjection(fixtureConfig, { transactionId, backupDir });
  assert.deepEqual(projection.previous, { module: false, init: false });
  const commandTarget = path.join(dataRoot, 'venv', 'bin', 'voxkey');
  const nodeLock = path.join(dataRoot, 'node', 'package-lock.json');
  mkdirSync(path.dirname(commandTarget), { recursive: true });
  mkdirSync(path.dirname(nodeLock), { recursive: true });
  writeFileSync(commandTarget, '#!/bin/sh\n');
  writeFileSync(nodeLock, lockBody);
  mkdirSync(path.dirname(command), { recursive: true });
  symlinkSync(commandTarget, command);
  const markerBody = `${JSON.stringify({
    schemaVersion: 1,
    transactionId,
    upstream: { commit: fixtureConfig.upstream.commit, tree: fixtureConfig.upstream.tree },
    commandLinkTarget: commandTarget,
    commandTargetSha256: sha256('#!/bin/sh\n'),
    nodeLockSha256: sha256(lockBody),
  }, null, 2)}\n`;
  writeFileSync(path.join(dataRoot, '.yuri-voxkey-owner.json'), markerBody);
  const receipt = {
    schemaVersion: 2,
    runtimeBindingSha256: runtimeBindingSha256(fixtureConfig),
    transactionId,
    upstream: { commit: fixtureConfig.upstream.commit, tree: fixtureConfig.upstream.tree },
    backupDir,
    command,
    dataRoot,
    module,
    init,
    moduleSha256: projection.moduleSha256,
    moduleBeforeSha256: null,
    initAfterSha256: projection.initAfterSha256,
    initBeforeSha256: null,
    managedAppendSha256: projection.managedAppendSha256,
    previous: projection.previous,
    previousMetadata: projection.previousMetadata,
    parentGuard: projection.parentGuard,
    requireAdded: true,
    runtimeCreated: true,
    runtimeFingerprint: {
      commandLinkTarget: commandTarget,
      commandTargetSha256: sha256('#!/bin/sh\n'),
      nodeLockSha256: sha256(lockBody),
      markerSha256: sha256(markerBody),
    },
  };
  const result = rollbackInstalledProjection(fixtureConfig, receipt, { quiescenceProved: true });
  assert.equal(result.initDisposition, 'removed-created');
  assert.equal(existsSync(init), false, 'rollback must restore an originally absent init.lua as absent');
  assert.equal(existsSync(module), false, 'rollback must restore an originally absent module as absent');
  assert.equal(rollbackInstalledProjection(fixtureConfig, receipt, { quiescenceProved: true }).alreadyApplied, true);
} finally {
  rmSync(absentInitRoot, { recursive: true, force: true });
}

const recoveryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'yuri-voxkey-recovery-'));
try {
  const backupRoot = path.join(recoveryRoot, 'state', 'backups');
  const dataRoot = path.join(recoveryRoot, 'share', 'voxkey');
  const command = path.join(recoveryRoot, 'bin', 'voxkey');
  const transactionId = 'voxkey-00000000-0000-4000-8000-000000000003';
  const backupDir = path.join(backupRoot, transactionId);
  const fixtureConfig = {
    ...config,
    runtime: {
      ...config.runtime,
      command,
      dataRoot,
      modelRoot: path.join(dataRoot, 'models', 'parakeet'),
      hammerspoonModule: path.join(recoveryRoot, 'hammerspoon', 'yuri-voxkey.lua'),
      hammerspoonInit: path.join(recoveryRoot, 'hammerspoon', 'init.lua'),
      receipt: path.join(recoveryRoot, 'state', 'receipt.json'),
      backupRoot,
      operationLock: path.join(backupRoot, '.operation.lock'),
      pttHeldFlag: path.join(recoveryRoot, 'voice-state', 'ptt-held.flag'),
      pttOwnerLock: path.join(recoveryRoot, 'voice-state', 'ptt-owner.lock', 'lockfile.lfs'),
    },
  };
  mkdirSync(backupDir, { recursive: true });
  const recoveryPaths = runtimePaths(fixtureConfig);
  const recoveryParentGuard = captureParentIdentityGuard(recoveryPaths);
  writeFileSync(path.join(backupDir, 'transaction.json'), `${JSON.stringify({
    schemaVersion: 2,
    transactionId,
    runtimeBindingSha256: runtimeBindingSha256(fixtureConfig),
    parentGuard: recoveryParentGuard,
    status: 'runtime-promoted-repairing',
  }, null, 2)}\n`);
  const lock = acquireOperationLock(fixtureConfig, 'install', transactionId);
  const deadPid = spawnSync('/usr/bin/true').pid;
  const lockPath = fixtureConfig.runtime.operationLock;
  const lockRecord = JSON.parse(readFileSync(lockPath, 'utf8'));
  const interruptedLockRecord = {
    ...lockRecord,
    pid: deadPid,
    owner: { pid: deadPid, ppid: 1, startToken: 'dead-controller-start-token' },
    parentGuard: recoveryParentGuard,
    stageRoot: path.join(backupDir, 'staging'),
    sourceRoot: path.join(backupDir, 'pinned-source'),
  };
  writeFileSync(lockPath, `${JSON.stringify(interruptedLockRecord, null, 2)}\n`);
  mkdirSync(path.join(dataRoot, 'venv', 'bin'), { recursive: true });
  writeFileSync(path.join(dataRoot, 'venv', 'bin', 'voxkey'), '#!/bin/sh\n');
  writeFileSync(path.join(dataRoot, '.yuri-voxkey-stage.json'), `${JSON.stringify({ schemaVersion: 1, transactionId, status: 'promoted-repairing' })}\n`);
  mkdirSync(path.dirname(command), { recursive: true });
  symlinkSync(path.join(dataRoot, 'venv', 'bin', 'voxkey'), command);
  const trackedToken = randomUUID();
  const trackedSpecPath = path.join(backupDir, `child-spec-${trackedToken}.json`);
  const trackedStatePath = path.join(backupDir, `child-state-${trackedToken}.json`);
  const trackedSpec = {
    schemaVersion: 1,
    transactionId,
    operationToken: interruptedLockRecord.token,
    token: trackedToken,
    backupDir,
    specPath: trackedSpecPath,
    statePath: trackedStatePath,
    command: '/bin/sh',
    args: ['-c', 'sleep 60'],
    cwd: '',
    label: 'orphan descendant fixture',
  };
  writeFileSync(trackedSpecPath, `${JSON.stringify(trackedSpec, null, 2)}\n`);
  const recoveryStage = {
    stageRoot: path.join(backupDir, 'process-stage'),
    stageHome: path.join(backupDir, 'process-stage', 'home'),
    stageDataHome: path.join(backupDir, 'process-stage', 'data'),
  };
  mkdirSync(recoveryStage.stageHome, { recursive: true });
  mkdirSync(recoveryStage.stageDataHome, { recursive: true });
  const supervisor = spawn(process.execPath, [controllerPath, '__run-tracked', '--child-spec', trackedSpecPath], {
    detached: true,
    stdio: 'ignore',
    env: buildTransactionEnvironment(recoveryStage, process.execPath, { transactionId }),
  });
  const stateDeadline = Date.now() + 3000;
  let trackedState = null;
  while (Date.now() < stateDeadline) {
    if (existsSync(trackedStatePath)) {
      try {
        const observed = JSON.parse(readFileSync(trackedStatePath, 'utf8'));
        if (observed.status === 'running') { trackedState = observed; break; }
      } catch {}
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  assert(trackedState, 'tracked descendant supervisor must publish its child process-group state');
  let ownerProcessTableReads = 0;
  const ownerProcessTable = () => {
    ownerProcessTableReads += 1;
    return ownerProcessTableReads === 1
      ? [{ pid: trackedState.supervisorPid, pgid: trackedState.processGroupId, command: `${process.execPath} ${controllerPath} __run-tracked ${trackedSpecPath}` }]
      : [];
  };
  const recovered = recoverInterruptedOperation(fixtureConfig, {
    hammerspoonUnbound: true,
    _testProcessTable: '',
    _testOwnerProcessTable: ownerProcessTable,
    _testProcessStartTokens: {
      [deadPid]: '',
      [trackedState.supervisorPid]: trackedState.supervisorStartToken,
    },
  });
  assert.equal(recovered.disposition, 'partial-install-quarantined');
  assert.equal(existsSync(command), false, 'crash recovery must remove the partial live command');
  assert.equal(existsSync(dataRoot), false, 'crash recovery must remove the partial live data root');
  assert.equal(existsSync(recovered.archivedLock), true, 'crash recovery must archive and release the operation lock');
  assert.equal(existsSync(recovered.archivedClaim), true, 'crash recovery must archive its exclusive claimant');
  assert(ownerProcessTableReads >= 2, 'crash recovery must signal and re-check the tracked process group');
} finally {
  rmSync(recoveryRoot, { recursive: true, force: true });
}

process.stdout.write('voxkey-control: pass\n');
