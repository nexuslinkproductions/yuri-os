#!/usr/bin/env node
// @capability: voice-voxkey-control
// @serves: install voxkey | voxkey doctor | ctrl space push to talk | local dictation | voice flow bar
// @does: verifies the pinned VoxKey source and activation gates, reports runtime health, and performs an explicitly approved home-runtime install with transactional Hammerspoon configuration.
// @use: node _SYSTEM/Scripts/voice/voxkey-control.mjs plan|doctor|verify-source --source PATH|install --source PATH --approve-runtime-mutation --capacity-cleared|rollback|recover --approve-runtime-mutation --confirm-hammerspoon-unbound
// @exports: loadVoxKeyConfig, validateVoxKeyConfig, verifyPinnedSource, parseSymbolicHotkeyState, inspectVoxKeyRuntime, verifyInstalledRuntime, buildVoxKeyPlan, appendManagedRequireBytes, removeManagedRequireBytes, captureFileMetadata, captureParentIdentityGuard, assertParentIdentityGuard, fsyncManagedTree, runtimePaths, runtimeBindingSha256, acquireOperationLock, releaseOperationLock, acquireRecoveryClaim, assertRecoveryClaimCurrent, releaseRecoveryClaim, buildTransactionEnvironment, readRollbackJournal, stopOwnedProcessGroup, runTrackedChecked, recoverInterruptedOperation
// @status: active
// @supersedes: voice-ptt-control

import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);
const CURRENT_PROCESS_START_TOKEN = `epoch:${Math.floor((Date.now() - (process.uptime() * 1000)) / 1000)}`;
export const REPO_ROOT = path.resolve(HERE, '../../..');
export const CONFIG_PATH = path.join(REPO_ROOT, '_SYSTEM/config/yuri-voxkey.json');
export const HAMMERSPOON_SOURCE = path.join(HERE, 'yuri-voxkey.lua');
const PROTECTED_SEGMENTS = [
  '/backend/data/', '/_SYSTEM/backend/data/', '/.claude/state/', '/.claude/history/',
  '/.claude/file-history/', '/.claude/projects/', '/node_modules/', '/.amp/',
];

export function loadVoxKeyConfig(configPath = CONFIG_PATH) {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function validateVoxKeyConfig(config) {
  const errors = [];
  if (config?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (config?.id !== 'yuri-voxkey') errors.push('id must be yuri-voxkey');
  if (!/^[a-f0-9]{40}$/.test(String(config?.upstream?.commit || ''))) errors.push('upstream commit must be a full SHA-1');
  if (!/^[a-f0-9]{40}$/.test(String(config?.upstream?.tree || ''))) errors.push('upstream tree must be a full SHA-1');
  if (!/^[a-f0-9]{64}$/.test(String(config?.model?.archiveSha256 || ''))) errors.push('model archive hash must be SHA-256');
  if (config?.requirements?.python !== '3.10') errors.push('locked runtime requires Python 3.10');
  if (config?.hotkey?.modifiers?.join('+') !== 'ctrl' || config?.hotkey?.key !== 'space') errors.push('hotkey must be Ctrl+Space');
  if (config?.hotkey?.macOSSymbolicHotKeyId !== 60 || config?.hotkey?.requireAssignable !== true) errors.push('Ctrl+Space assignability gate is invalid');
  if (config?.hotkey?.automaticSystemRemap !== false) errors.push('automatic system hotkey remap must remain disabled');
  if (config?.hotkey?.observedBeforeIntegration?.enabled !== true) errors.push('prior Ctrl+Space state and rollback must be recorded');
  if (config?.privacy?.formatter !== 'disabled') errors.push('formatter must default disabled');
  if (config?.privacy?.contextCapture !== 'disabled') errors.push('context capture must default disabled');
  if (config?.privacy?.history !== 'disabled') errors.push('history must default disabled');
  if (config?.privacy?.cloudSync !== 'disabled') errors.push('cloud sync must default disabled');
  if (config?.privacy?.screenCapture !== 'disabled') errors.push('screen capture must default disabled');
  if (config?.privacy?.secureFields !== 'deny') errors.push('secure fields must remain denied');
  if (config?.privacy?.autoSubmit !== false) errors.push('auto-submit must remain false');
  if (config?.privacy?.launchAtLogin !== false) errors.push('launch-at-login must remain false before activation');
  if (!String(config?.runtime?.pttOwnerLock || '').endsWith('/ptt-owner.lock/lockfile.lfs')) errors.push('PTT owner lock path missing');
  if (!String(config?.runtime?.operationLock || '').endsWith('/voxkey-backups/.operation.lock')) errors.push('global operation lock path missing');
  if (!config?.activationGates?.includes('transactional-install-and-recovery-tests')) errors.push('transactional recovery activation gate missing');
  if (!Array.isArray(config?.exclusiveListenerPatterns) || !config.exclusiveListenerPatterns.length) errors.push('exclusive listener patterns missing');
  for (const [relativePath, digest] of Object.entries(config?.upstream?.files || {})) {
    if (path.isAbsolute(relativePath) || relativePath.includes('..')) errors.push(`unsafe upstream file path: ${relativePath}`);
    if (!/^[a-f0-9]{64}$/.test(String(digest))) errors.push(`invalid upstream SHA-256: ${relativePath}`);
  }
  return errors;
}

export function expandHome(value, home = process.env.HOME || '') {
  const raw = String(value || '');
  if (raw === '~') return home;
  if (raw.startsWith('~/')) return path.join(home, raw.slice(2));
  return path.resolve(REPO_ROOT, raw);
}

function assertUnprotected(inputPath) {
  const absolute = path.resolve(inputPath);
  const normalized = `/${absolute.replaceAll('\\', '/').replace(/^\/+/, '')}/`;
  if (normalized.endsWith('/.env/')) throw new Error(`protected path refused: ${inputPath}`);
  if (PROTECTED_SEGMENTS.some((segment) => normalized.includes(segment))) {
    throw new Error(`protected path refused: ${inputPath}`);
  }
  return absolute;
}

function assertNoSymlinkComponents(inputPath, { allowLeafSymlink = false } = {}) {
  const absolute = path.resolve(inputPath);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    if (!existsSync(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink() && !(allowLeafSymlink && index === parts.length - 1)) {
      throw new Error(`symlinked managed path refused: ${cursor}`);
    }
  }
  return absolute;
}

export function assertManagedPath(inputPath, { root = '', allowLeafSymlink = false } = {}) {
  const absolute = assertNoSymlinkComponents(assertUnprotected(inputPath), { allowLeafSymlink });
  if (root) {
    const rootAbsolute = assertNoSymlinkComponents(assertUnprotected(root));
    const relative = path.relative(rootAbsolute, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`managed path must be a child of ${rootAbsolute}: ${absolute}`);
    }
    if (existsSync(rootAbsolute) && existsSync(absolute) && !allowLeafSymlink) {
      const realRoot = realpathSync(rootAbsolute);
      const realTarget = realpathSync(absolute);
      const realRelative = path.relative(realRoot, realTarget);
      if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        throw new Error(`canonical managed path escapes root: ${absolute}`);
      }
    }
  }
  return absolute;
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function readManagedRegularFile(file, { root = '' } = {}) {
  const safe = assertManagedPath(file, root ? { root } : {});
  if (!existsSync(safe) || !lstatSync(safe).isFile()) throw new Error(`managed regular file required: ${safe}`);
  return readFileSync(safe);
}

function readManagedRegularFileSnapshot(file, { root = '' } = {}) {
  const safe = assertManagedPath(file, root ? { root } : {});
  const noFollow = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(safe, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`managed regular file required: ${safe}`);
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new Error(`managed file changed while reading: ${safe}`);
    }
    const pathStats = lstatSync(safe);
    if (!pathStats.isFile() || pathStats.dev !== after.dev || pathStats.ino !== after.ino) {
      throw new Error(`managed file pathname changed while reading: ${safe}`);
    }
    return {
      body,
      identity: {
        dev: String(after.dev),
        ino: String(after.ino),
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    };
  } finally {
    closeSync(descriptor);
  }
}

function sha256ManagedFile(file, options = {}) {
  return createHash('sha256').update(readManagedRegularFile(file, options)).digest('hex');
}

function runText(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  }).trim();
}

export function verifyPinnedSource(sourcePath, config = loadVoxKeyConfig()) {
  // Refuse a symlinked checkout before invoking Git. Git's own path traversal is
  // deliberately not part of the trust boundary for a pinned install source.
  const source = assertManagedPath(path.resolve(sourcePath || ''));
  const errors = [];
  const gitEntry = assertManagedPath(path.join(source, '.git'), { root: source });
  if (!existsSync(gitEntry)) return { ok: false, source, errors: ['source is not a Git checkout'] };
  if (!lstatSync(gitEntry).isDirectory() && !lstatSync(gitEntry).isFile()) {
    return { ok: false, source, errors: ['source Git metadata is not a regular file or directory'] };
  }
  let commit = '';
  let tree = '';
  let dirty = '';
  try {
    commit = runText('git', ['-C', source, 'rev-parse', 'HEAD']);
    tree = runText('git', ['-C', source, 'rev-parse', 'HEAD^{tree}']);
    dirty = runText('git', ['-C', source, 'status', '--porcelain=v1', '--untracked-files=all']);
  } catch (error) {
    errors.push(`git verification failed: ${error.message}`);
  }
  if (commit !== config.upstream.commit) errors.push(`commit mismatch: ${commit || '(missing)'}`);
  if (tree !== config.upstream.tree) errors.push(`tree mismatch: ${tree || '(missing)'}`);
  if (dirty) errors.push('source checkout is dirty');
  const hashes = {};
  for (const [relativePath, expected] of Object.entries(config.upstream.files)) {
    let file;
    try { file = assertManagedPath(path.join(source, relativePath), { root: source }); }
    catch (error) { errors.push(`unsafe pinned file: ${relativePath}: ${error.message}`); continue; }
    if (!existsSync(file)) {
      errors.push(`missing pinned file: ${relativePath}`);
      continue;
    }
    if (!lstatSync(file).isFile()) {
      errors.push(`pinned file is not a regular file: ${relativePath}`);
      continue;
    }
    const actual = createHash('sha256').update(readManagedRegularFile(file, { root: source })).digest('hex');
    hashes[relativePath] = actual;
    if (actual !== expected) errors.push(`hash mismatch: ${relativePath}`);
  }
  return { ok: errors.length === 0, source, commit, tree, clean: !dirty, hashes, errors };
}

export function parseSymbolicHotkeyState(output, id = 60) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(output || '').match(new RegExp(`(?:^|\\n)\\s*"?${escaped}"?\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`));
  if (!match) return { known: false, enabled: null };
  const enabledMatch = match[1].match(/\benabled\s*=\s*(\d+)\s*;/);
  return enabledMatch
    ? { known: true, enabled: enabledMatch[1] === '1' }
    : { known: false, enabled: null };
}

function systemHotkeyState(config) {
  try {
    const output = runText('/usr/bin/defaults', ['read', 'com.apple.symbolichotkeys', 'AppleSymbolicHotKeys']);
    return parseSymbolicHotkeyState(output, config.hotkey.macOSSymbolicHotKeyId);
  } catch (error) {
    return { known: false, enabled: null, error: error.message };
  }
}

function commandPath(command) {
  try { return runText('/usr/bin/which', [command]); } catch { return ''; }
}

function pythonCandidate() {
  const candidates = [
    process.env.VOXKEY_PYTHON,
    '/opt/homebrew/bin/python3.10',
    '/usr/local/bin/python3.10',
    commandPath('python3.10'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

function pythonVersion(candidate) {
  if (!candidate) return '';
  try { return runText(candidate, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))']); } catch { return ''; }
}

function hammerspoonPath() {
  return ['/Applications/Hammerspoon.app', path.join(process.env.HOME || '', 'Applications/Hammerspoon.app')]
    .find((candidate) => existsSync(candidate)) || '';
}

function shellWords(command) {
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  for (const character of String(command || '')) {
    if (escaped) { word += character; escaped = false; continue; }
    if (character === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = '';
      else word += character;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\s/.test(character)) {
      if (word) { words.push(word); word = ''; }
      continue;
    }
    word += character;
  }
  if (word) words.push(word);
  return words;
}

export function processCommandIdentity(command) {
  const words = shellWords(command);
  let index = 0;
  if (path.basename(words[index] || '') === 'env') {
    index += 1;
    while (index < words.length) {
      const option = words[index];
      if (option === '--') { index += 1; break; }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(option)) { index += 1; continue; }
      if (['-u', '--unset', '-C', '--chdir', '-S', '--split-string'].includes(option)) {
        index += words[index + 1] ? 2 : 1;
        continue;
      }
      if (/^(?:--unset=|--chdir=|--split-string=|-[uC].+)/.test(option)) { index += 1; continue; }
      if (option.startsWith('-')) { index += 1; continue; }
      break;
    }
  }
  const executable = words[index] || '';
  const executableName = path.basename(executable).toLowerCase();
  const interpreter = /^(?:python(?:\d+(?:\.\d+)*)?|node|bun|bash|sh|zsh|dash|ruby|perl|osascript)$/.test(executableName);
  const shellInterpreter = /^(?:bash|sh|zsh|dash)$/.test(executableName);
  let script = executable;
  if (interpreter) {
    index += 1;
    while (index < words.length && (words[index].startsWith('-') || (shellInterpreter && words[index].startsWith('+')))) {
      const option = words[index];
      if (option === '--') { index += 1; break; }
      if (option === '-m' && words[index + 1]) return { executable, script: `module:${words[index + 1]}` };
      const inlineShell = shellInterpreter && !option.startsWith('--') && option.slice(1).includes('c');
      if (['-c', '-e', '--eval', '--print'].includes(option) || inlineShell) return { executable, script: 'inline-code' };
      const consumesOperand = executableName.startsWith('python')
        ? ['-W', '-X', '--check-hash-based-pycs'].includes(option)
        : (shellInterpreter
          ? ['-o', '+o', '-O', '+O', '--rcfile', '--init-file'].includes(option)
          : ['-r', '--require', '--loader', '--import'].includes(option));
      index += consumesOperand ? 2 : 1;
    }
    script = words[index] || '';
  }
  return { executable, script };
}

export function matchVoiceProcess(command, patterns) {
  const identity = processCommandIdentity(command);
  const candidates = [identity.executable, identity.script].filter(Boolean).map((value) => value.replaceAll('\\', '/'));
  if (candidates.some((candidate) => path.basename(candidate).toLowerCase() === 'voxkey') || identity.script === 'module:voxkey') {
    return 'voxkey-cli';
  }
  for (const pattern of patterns) {
    const normalized = String(pattern).replaceAll('\\', '/').replace(/^\.\//, '');
    if (candidates.some((candidate) => candidate === normalized || candidate.endsWith(`/${normalized}`))) return normalized;
  }
  return '';
}

function processConflicts(patterns, { _testProcessTable = null } = {}) {
  let table = '';
  if (typeof _testProcessTable === 'string') table = _testProcessTable;
  else {
    try { table = runText('/bin/ps', ['-ax', '-o', 'pid=,command=']); } catch { return [{ pid: null, pattern: 'process-table-unavailable' }]; }
  }
  const conflicts = [];
  for (const line of table.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match || Number(match[1]) === process.pid) continue;
    const identity = matchVoiceProcess(match[2], patterns);
    if (identity) conflicts.push({ pid: Number(match[1]), identity });
  }
  return conflicts;
}

function freeBytes(target) {
  try {
    const stats = statfsSync(target, { bigint: true });
    return stats.bavail * stats.bsize;
  } catch { return 0n; }
}

function check(id, status, detail, extra = {}) {
  return { id, status, detail, ...extra };
}

export function inspectVoxKeyRuntime({ config = loadVoxKeyConfig(), preinstall = false, sourcePath = '' } = {}) {
  const checks = [];
  const configErrors = validateVoxKeyConfig(config);
  checks.push(check('config', configErrors.length ? 'fail' : 'pass', configErrors.join('; ') || 'schema and safety defaults valid'));

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push(check('node', nodeMajor >= config.requirements.nodeMinimumMajor ? 'pass' : 'fail', process.version));

  const python = pythonCandidate();
  const version = pythonVersion(python);
  checks.push(check('python-3.10', version.startsWith('3.10.') ? 'pass' : 'fail', python ? `${python} (${version || 'unreadable'})` : 'not installed'));

  const hammerspoon = hammerspoonPath();
  checks.push(check('hammerspoon', hammerspoon ? 'pass' : 'fail', hammerspoon || 'not installed'));

  const hotkey = systemHotkeyState(config);
  checks.push(check(
    'ctrl-space-system-conflict',
    hotkey.known && hotkey.enabled === false ? 'pass' : 'fail',
    hotkey.known ? (hotkey.enabled ? 'macOS symbolic hotkey 60 is still enabled' : 'macOS symbolic hotkey 60 is disabled') : 'could not prove symbolic hotkey 60 state',
    { symbolicHotkey: hotkey },
  ));

  const conflicts = processConflicts(config.exclusiveListenerPatterns);
  checks.push(check('exclusive-listener', conflicts.length ? 'fail' : 'pass', conflicts.length ? `${conflicts.length} competing listener(s)` : 'no competing listener', { conflicts }));

  const available = freeBytes(process.env.HOME || REPO_ROOT);
  const minimum = BigInt(config.requirements.minimumFreeBytes);
  checks.push(check('free-space', available >= minimum ? 'pass' : 'fail', `${available} bytes available; ${minimum} required`));

  const command = expandHome(config.runtime.command);
  const modelRoot = expandHome(config.runtime.modelRoot);
  const modelFiles = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'];
  const missingModelFiles = modelFiles.filter((name) => !existsSync(path.join(modelRoot, name)));
  checks.push(check('runtime-command', existsSync(command) ? 'pass' : (preinstall ? 'pending' : 'fail'), existsSync(command) ? command : 'not installed'));
  checks.push(check('model', missingModelFiles.length ? (preinstall ? 'pending' : 'fail') : 'pass', missingModelFiles.length ? `missing: ${missingModelFiles.join(', ')}` : modelRoot));

  const receiptPath = expandHome(config.runtime.receipt);
  if (!entryExists(receiptPath)) {
    checks.push(check('runtime-fingerprint', preinstall ? 'pending' : 'fail', 'install receipt not present'));
  } else {
    try {
      const verified = verifyInstalledRuntime(config);
      checks.push(check('runtime-fingerprint', 'pass', verified.transactionId, { runtimeFingerprint: verified.runtimeFingerprint }));
    } catch (error) {
      checks.push(check('runtime-fingerprint', 'fail', error.message));
    }
  }

  if (sourcePath) {
    const source = verifyPinnedSource(sourcePath, config);
    checks.push(check('pinned-source', source.ok ? 'pass' : 'fail', source.ok ? source.commit : source.errors.join('; '), { source }));
  }

  return {
    ok: !checks.some((item) => item.status === 'fail'),
    mode: preinstall ? 'preinstall' : 'runtime',
    checks,
  };
}

export function buildVoxKeyPlan(config = loadVoxKeyConfig()) {
  return {
    id: config.id,
    state: config.status,
    engine: `${config.upstream.repository}@${config.upstream.commit}`,
    hotkey: 'Ctrl+Space',
    automaticSystemRemap: false,
    formatter: 'disabled',
    autoSubmit: false,
    contextCapture: 'disabled',
    history: 'disabled',
    installSteps: [
      'obtain recovery capacity clearance',
      'install exact Python 3.10 and Hammerspoon from approved sources',
      'disable or remap macOS symbolic hotkey 60 and record its rollback',
      'verify the exact clean VoxKey commit, tree, and file hashes',
      'run the upstream installer in an isolated transaction stage with --no-hammerspoon and VOXKEY_NO_FORMAT=1 after an explicit capacity-clearance token',
      'atomically promote, repair, fingerprint, and crash-recover the owned runtime under one durable global operation lock',
      'transactionally install the YURI Hammerspoon module and exactly one require line',
      'grant Microphone and Accessibility interactively',
      'reload Hammerspoon, prove Ctrl+Space assignability, then run acceptance tests',
    ],
    activationGates: config.activationGates,
  };
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(directoryPath, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function fsyncFile(file) {
  const descriptor = openSync(file, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function xattrBinary() {
  return process.platform === 'darwin' && existsSync('/usr/bin/xattr') ? '/usr/bin/xattr' : '';
}

function readExtendedAttributes(file) {
  const binary = xattrBinary();
  if (!binary) return {};
  let names = '';
  try { names = runText(binary, [file]); }
  catch (error) {
    throw new Error(`cannot enumerate extended attributes for ${file}: ${error.message}`);
  }
  const attributes = {};
  const attributeNames = names.split('\n').map((item) => item.trim()).filter(Boolean);
  if (attributeNames.length > 64) throw new Error(`too many extended attributes on ${file}`);
  let totalHexBytes = 0;
  for (const name of attributeNames) {
    if (name.includes('\n') || name.includes('\0')) throw new Error(`unsafe extended attribute name on ${file}`);
    const hex = runText(binary, ['-px', name, file]).replace(/\s+/g, '').toLowerCase();
    if (!/^(?:[a-f0-9]{2})*$/.test(hex)) throw new Error(`invalid extended attribute encoding on ${file}: ${name}`);
    totalHexBytes += hex.length / 2;
    if (totalHexBytes > 256 * 1024) throw new Error(`extended attributes exceed the managed metadata limit on ${file}`);
    attributes[name] = hex;
  }
  return attributes;
}

function validateFileMetadata(metadata) {
  if (!metadata || !Number.isInteger(metadata.mode) || metadata.mode < 0 || metadata.mode > 0o7777) {
    throw new Error('managed file metadata mode is invalid');
  }
  if (!Number.isInteger(metadata.uid) || !Number.isInteger(metadata.gid)) throw new Error('managed file metadata ownership is invalid');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new Error('managed file has unsupported foreign ownership');
  }
  if (typeof process.getgid === 'function' && metadata.gid !== process.getgid()) {
    throw new Error('managed file has unsupported foreign group ownership');
  }
  if (!metadata.xattrs || Array.isArray(metadata.xattrs) || typeof metadata.xattrs !== 'object') {
    throw new Error('managed file extended attributes are invalid');
  }
  for (const [name, hex] of Object.entries(metadata.xattrs)) {
    if (!name || name.includes('\n') || name.includes('\0') || !/^(?:[a-f0-9]{2})*$/.test(String(hex))) {
      throw new Error('managed file extended attribute entry is invalid');
    }
  }
  return metadata;
}

export function captureFileMetadata(file) {
  const safe = assertManagedPath(file);
  const stats = lstatSync(safe);
  if (!stats.isFile()) throw new Error(`managed metadata target is not a regular file: ${safe}`);
  if (stats.nlink !== 1) throw new Error(`managed metadata target has unsupported hard links: ${safe}`);
  if (process.platform === 'darwin' && existsSync('/bin/ls')) {
    const acl = runText('/bin/ls', ['-lde', safe]).split('\n').slice(1).some((line) => /^\s*\d+:/.test(line));
    if (acl) throw new Error(`managed metadata target has an unsupported ACL: ${safe}`);
  }
  if (process.platform === 'darwin' && existsSync('/usr/bin/stat')) {
    const flags = runText('/usr/bin/stat', ['-f', '%Sf', safe]);
    if (flags && flags !== '-') throw new Error(`managed metadata target has unsupported flags (${flags}): ${safe}`);
  }
  return validateFileMetadata({
    mode: stats.mode & 0o7777,
    uid: stats.uid,
    gid: stats.gid,
    xattrs: readExtendedAttributes(safe),
  });
}

function applyFileMetadata(file, metadata) {
  if (!metadata) return;
  validateFileMetadata(metadata);
  chmodSync(file, metadata.mode);
  const binary = xattrBinary();
  if (!binary && Object.keys(metadata.xattrs).length) throw new Error('extended attributes cannot be restored on this platform');
  for (const [name, hex] of Object.entries(metadata.xattrs)) {
    execFileSync(binary, ['-wx', name, hex, file], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
}

function assertFileMetadataMatches(file, expected, label) {
  const actual = captureFileMetadata(file);
  if (JSON.stringify(actual) !== JSON.stringify(validateFileMetadata(expected))) {
    throw new Error(`${label} metadata mismatch`);
  }
  return true;
}

function directoryIdentity(directoryPath) {
  const safe = assertManagedPath(directoryPath);
  const descriptor = openSync(safe, 'r');
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isDirectory()) throw new Error(`managed parent is not a directory: ${safe}`);
    return {
      path: safe,
      realpath: realpathSync(safe),
      dev: String(stats.dev),
      ino: String(stats.ino),
      uid: stats.uid,
      mode: stats.mode & 0o7777,
    };
  } finally {
    closeSync(descriptor);
  }
}

function mutationParentPaths(paths) {
  return [...new Set([
    paths.backupRoot,
    paths.dataHome,
    path.dirname(paths.command),
    path.dirname(paths.moduleTarget),
    path.dirname(paths.initTarget),
    path.dirname(paths.receiptPath),
  ].map((item) => path.resolve(item)))].sort();
}

export function captureParentIdentityGuard(paths) {
  const parents = mutationParentPaths(paths);
  for (const parent of parents) {
    assertManagedPath(parent);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    assertManagedPath(parent);
  }
  return parents.map(directoryIdentity);
}

export function assertParentIdentityGuard(paths, guard) {
  if (!Array.isArray(guard)) throw new Error('managed parent identity guard is missing');
  const expectedPaths = mutationParentPaths(paths);
  const byPath = new Map(guard.map((entry) => [entry?.path, entry]));
  if (byPath.size !== guard.length || expectedPaths.some((parent) => !byPath.has(parent))) {
    throw new Error('managed parent identity guard path set mismatch');
  }
  for (const expected of guard) {
    const parent = expected?.path;
    if (!expected || expected.realpath !== parent || !/^\d+$/.test(String(expected.dev)) || !/^\d+$/.test(String(expected.ino))) {
      throw new Error(`managed parent identity guard entry is invalid: ${parent}`);
    }
    const actual = directoryIdentity(parent);
    for (const field of ['realpath', 'dev', 'ino', 'uid']) {
      if (actual[field] !== expected[field]) throw new Error(`managed parent identity changed (${field}): ${parent}`);
    }
    if ((actual.mode & 0o022) !== 0) throw new Error(`managed parent is group/other writable: ${parent}`);
  }
  return true;
}

function extendParentIdentityGuard(paths, guard, directoryPaths) {
  assertParentIdentityGuard(paths, guard);
  const byPath = new Map(guard.map((entry) => [entry.path, entry]));
  for (const directoryPath of directoryPaths) {
    const safe = assertManagedPath(directoryPath);
    if (!byPath.has(safe)) byPath.set(safe, directoryIdentity(safe));
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function atomicWrite(file, content, mode = 0o600, { metadata = null, parentGuard = null, paths = null } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (parentGuard) assertParentIdentityGuard(paths, parentGuard);
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, 'wx', metadata?.mode ?? mode);
  try {
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  if (metadata) applyFileMetadata(temporary, metadata);
  else chmodSync(temporary, mode);
  // chmod/xattr updates happen after the content fsync. Flush the inode again
  // so a successful rename never advertises metadata that only lived in cache.
  fsyncFile(temporary);
  if (parentGuard) assertParentIdentityGuard(paths, parentGuard);
  renameSync(temporary, file);
  fsyncDirectory(path.dirname(file));
  if (parentGuard) assertParentIdentityGuard(paths, parentGuard);
}

function durableRename(from, to, { parentGuard = null, paths = null } = {}) {
  const fromDirectory = path.dirname(from);
  const toDirectory = path.dirname(to);
  if (parentGuard) assertParentIdentityGuard(paths, parentGuard);
  renameSync(from, to);
  for (const directoryPath of new Set([fromDirectory, toDirectory])) fsyncDirectory(directoryPath);
  if (parentGuard) assertParentIdentityGuard(paths, parentGuard);
}

export function fsyncManagedTree(root) {
  const safeRoot = assertManagedPath(root);
  if (!lstatSync(safeRoot).isDirectory()) throw new Error(`fsync tree root is not a directory: ${safeRoot}`);
  const visit = (directoryPath) => {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      const stats = lstatSync(entryPath);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) visit(entryPath);
      else if (stats.isFile()) {
        const descriptor = openSync(entryPath, 'r');
        try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
      } else throw new Error(`unsupported entry in durable runtime tree: ${entryPath}`);
    }
    fsyncDirectory(directoryPath);
  };
  visit(safeRoot);
  return true;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const MANAGED_REQUIRE_LINE = 'require("yuri-voxkey") -- YURI:voxkey-managed-v1';
const MANAGED_REQUIRE_RE = /^[ \t]*require[ \t]*(?:\([ \t]*)?["']yuri-voxkey["'][ \t]*\)?[ \t]*;?[ \t]*--[ \t]*YURI:voxkey-managed-v1[ \t]*$/;
const ANY_YURI_REQUIRE_RE = /\brequire\s*(?:\(\s*)?["']yuri-voxkey["']\s*\)?/;
const LEGACY_REQUIRE_RE = /\brequire\s*(?:\(\s*)?["']voxkey["']\s*\)?/;

function managedRequireAppendBytes(priorBytes) {
  const prior = Buffer.from(priorBytes || '');
  const separator = prior.length > 0 && prior[prior.length - 1] !== 0x0a ? '\n' : '';
  return Buffer.from(`${separator}${MANAGED_REQUIRE_LINE}\n`, 'utf8');
}

export function appendManagedRequireBytes(priorBytes) {
  const prior = Buffer.from(priorBytes || '');
  return Buffer.concat([prior, managedRequireAppendBytes(prior)]);
}

export function removeManagedRequireBytes(currentBytes, priorBytes) {
  const current = Buffer.from(currentBytes || '');
  const prior = Buffer.from(priorBytes || '');
  const append = managedRequireAppendBytes(prior);
  if (current.length < prior.length + append.length
    || !current.subarray(0, prior.length).equals(prior)
    || !current.subarray(prior.length, prior.length + append.length).equals(append)) {
    throw new Error('init.lua managed append changed or its exact prior-byte prefix diverged');
  }
  const unrelatedSuffix = current.subarray(prior.length + append.length);
  // With later user edits, retain the single line separator that made those
  // edits syntactically independent. With no later edits, restore the exact
  // original byte stream (including CRLF/trailing whitespace/no-final-LF).
  const bridge = unrelatedSuffix.length > 0 && prior.length > 0 && prior[prior.length - 1] !== 0x0a
    ? Buffer.from('\n')
    : Buffer.alloc(0);
  return Buffer.concat([prior, bridge, unrelatedSuffix]);
}

function entryExists(file) {
  try { lstatSync(file); return true; } catch { return false; }
}

export function runtimePaths(config) {
  const backupRoot = assertManagedPath(expandHome(config.runtime.backupRoot));
  const receiptPath = assertManagedPath(expandHome(config.runtime.receipt));
  const moduleTarget = assertManagedPath(expandHome(config.runtime.hammerspoonModule));
  const initTarget = assertManagedPath(expandHome(config.runtime.hammerspoonInit));
  const dataRoot = assertManagedPath(expandHome(config.runtime.dataRoot));
  const modelRoot = assertManagedPath(expandHome(config.runtime.modelRoot), { root: dataRoot, allowLeafSymlink: true });
  const command = assertManagedPath(expandHome(config.runtime.command), { allowLeafSymlink: true });
  const pttHeldFlag = assertManagedPath(expandHome(config.runtime.pttHeldFlag));
  const pttOwnerLock = assertManagedPath(expandHome(config.runtime.pttOwnerLock));
  if (path.basename(dataRoot) !== 'voxkey') throw new Error('runtime dataRoot must end in /voxkey');
  const dataHome = assertManagedPath(path.dirname(dataRoot));
  const operationLock = assertManagedPath(expandHome(config.runtime.operationLock), { root: backupRoot });
  return { backupRoot, receiptPath, moduleTarget, initTarget, dataRoot, dataHome, modelRoot, command, pttHeldFlag, pttOwnerLock, operationLock };
}

export function runtimeBindingSha256(config) {
  const paths = runtimePaths(config);
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
  };
  const safetyBinding = {
    schemaVersion: config.schemaVersion,
    id: config.id,
    upstream: {
      repository: config.upstream.repository,
      commit: config.upstream.commit,
      tree: config.upstream.tree,
      files: config.upstream.files,
    },
    model: config.model,
    requirements: config.requirements,
    runtime: {
      command: paths.command,
      dataRoot: paths.dataRoot,
      modelRoot: paths.modelRoot,
      module: paths.moduleTarget,
      init: paths.initTarget,
      receipt: paths.receiptPath,
      backupRoot: paths.backupRoot,
      operationLock: paths.operationLock,
      pttHeldFlag: paths.pttHeldFlag,
      pttOwnerLock: paths.pttOwnerLock,
    },
    hotkey: config.hotkey,
    privacy: config.privacy,
    exclusiveListenerPatterns: config.exclusiveListenerPatterns,
    activationGates: config.activationGates,
  };
  return createHash('sha256').update(JSON.stringify(canonicalize(safetyBinding))).digest('hex');
}

function readManagedJson(file, options = {}) {
  return JSON.parse(readManagedRegularFile(file, options).toString('utf8'));
}

function readManagedJsonSnapshot(file, options = {}) {
  const snapshot = readManagedRegularFileSnapshot(file, options);
  return { ...snapshot, value: JSON.parse(snapshot.body.toString('utf8')) };
}

function processStartToken(pid, testTokens = null) {
  if (!Number.isInteger(pid) || pid <= 0) return '';
  if (testTokens && Object.prototype.hasOwnProperty.call(testTokens, pid)) return testTokens[pid];
  if (pid === process.pid) return CURRENT_PROCESS_START_TOKEN;
  try { process.kill(pid, 0); }
  catch (error) {
    if (error?.code === 'ESRCH') return '';
    return null;
  }
  try {
    const parsed = Date.parse(runText('/bin/ps', ['-p', String(pid), '-o', 'lstart=']));
    return Number.isFinite(parsed) ? `epoch:${Math.floor(parsed / 1000)}` : null;
  }
  catch { return null; }
}

function processStartTokensMatch(expected, actual) {
  const expectedMatch = String(expected || '').match(/^epoch:(\d+)$/);
  const actualMatch = String(actual || '').match(/^epoch:(\d+)$/);
  if (expectedMatch && actualMatch) return Math.abs(Number(expectedMatch[1]) - Number(actualMatch[1])) <= 1;
  return Boolean(expected && actual && expected === actual);
}

function processIdentity(pid = process.pid) {
  const startToken = processStartToken(pid);
  if (!startToken) throw new Error(`cannot capture process start identity for PID ${pid}`);
  return { pid, ppid: process.ppid, startToken };
}

function validateOperationLockRecord(config, record) {
  if (record?.schemaVersion !== 2) throw new Error('operation lock schema mismatch');
  if (!['install', 'rollback'].includes(record?.operation)) throw new Error('operation lock kind is invalid');
  if (!/^[0-9a-f-]{36}$/i.test(String(record?.token || ''))) throw new Error('operation lock token is invalid');
  const backupDir = transactionDirectory(config, record?.transactionId);
  if (record?.backupDir !== backupDir) throw new Error('operation lock backup directory mismatch');
  if (record?.runtimeBindingSha256 !== runtimeBindingSha256(config)) throw new Error('operation lock runtime binding mismatch');
  if (!Number.isInteger(record?.owner?.pid) || record.owner.pid <= 0 || !record.owner.startToken) {
    throw new Error('operation lock owner identity is invalid');
  }
  if (record.pid !== record.owner.pid) throw new Error('operation lock owner PID mismatch');
  return { ...record, backupDir };
}

export function acquireOperationLock(config, operation, transactionId = `voxkey-${randomUUID()}`) {
  if (!['install', 'rollback'].includes(operation)) throw new Error(`unsupported operation lock kind: ${operation}`);
  const paths = runtimePaths(config);
  mkdirSync(paths.backupRoot, { recursive: true, mode: 0o700 });
  const backupDir = transactionDirectory(config, transactionId);
  if (!entryExists(backupDir) || !lstatSync(backupDir).isDirectory()) {
    throw new Error('operation lock requires a durable transaction directory');
  }
  const token = randomUUID();
  const owner = processIdentity();
  const lock = {
    schemaVersion: 2,
    operation,
    token,
    transactionId,
    backupDir,
    runtimeBindingSha256: runtimeBindingSha256(config),
    acquiredAt: new Date().toISOString(),
    pid: owner.pid,
    owner,
  };
  const candidate = assertManagedPath(path.join(backupDir, `operation-lock-candidate-${token}.json`), { root: backupDir });
  atomicWrite(candidate, `${JSON.stringify(lock, null, 2)}\n`);
  try { linkSync(candidate, paths.operationLock); }
  catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`VoxKey operation lock exists; run the explicit recover command before another mutation: ${paths.operationLock}`);
    }
    throw error;
  }
  const backupRootDescriptor = openSync(paths.backupRoot, 'r');
  try { fsyncSync(backupRootDescriptor); } finally { closeSync(backupRootDescriptor); }
  return { ...lock, lockPath: paths.operationLock, candidate, paths };
}

function readOperationLock(config) {
  const paths = runtimePaths(config);
  if (!entryExists(paths.operationLock)) throw new Error('no interrupted VoxKey operation lock is present');
  if (!lstatSync(paths.operationLock).isFile()) throw new Error('operation lock is not a regular file');
  const snapshot = readManagedJsonSnapshot(paths.operationLock, { root: paths.backupRoot });
  const record = validateOperationLockRecord(config, snapshot.value);
  return { ...record, lockPath: paths.operationLock, lockIdentity: snapshot.identity, paths };
}

function updateOperationLock(config, lock, status, detail = {}) {
  const current = readOperationLock(config);
  if (current.token !== lock.token || current.transactionId !== lock.transactionId) {
    throw new Error('operation lock ownership changed');
  }
  const next = {
    schemaVersion: 2,
    operation: lock.operation,
    token: lock.token,
    transactionId: lock.transactionId,
    backupDir: lock.backupDir,
    runtimeBindingSha256: lock.runtimeBindingSha256,
    acquiredAt: lock.acquiredAt,
    pid: lock.pid,
    owner: lock.owner,
    ...(current.sourceRoot ? { sourceRoot: current.sourceRoot } : {}),
    ...(current.stageRoot ? { stageRoot: current.stageRoot } : {}),
    ...(current.rolledBackReceipt ? { rolledBackReceipt: current.rolledBackReceipt } : {}),
    ...(current.parentGuard ? { parentGuard: current.parentGuard } : {}),
    status,
    ...detail,
    updatedAt: new Date().toISOString(),
  };
  atomicWrite(lock.lockPath, `${JSON.stringify(next, null, 2)}\n`);
  Object.assign(lock, next);
  return lock;
}

export function releaseOperationLock(config, lock, status = 'released') {
  const current = readOperationLock(config);
  if (current.token !== lock?.token || current.transactionId !== lock?.transactionId) {
    throw new Error('refusing to release an operation lock owned by another transaction');
  }
  const safeStatus = String(status).replace(/[^a-z0-9-]/gi, '-').slice(0, 48) || 'released';
  const destination = assertManagedPath(path.join(current.backupDir, `operation-lock-${safeStatus}`), { root: current.backupDir });
  if (entryExists(destination)) throw new Error(`operation-lock archive already exists: ${destination}`);
  atomicWrite(current.lockPath, `${JSON.stringify({ ...current, status, releasedAt: new Date().toISOString() }, null, 2)}\n`);
  durableRename(current.lockPath, destination);
  return destination;
}

function operationLockIdentity(lockPath) {
  return readManagedRegularFileSnapshot(lockPath).identity;
}

function recoveryClaimPath(lock) {
  return assertManagedPath(path.join(lock.backupDir, `recovery-claim-${lock.token}.lock`), { root: lock.backupDir });
}

function validateRecoveryClaim(lock, claim, claimPath) {
  const expectedCandidate = assertManagedPath(
    path.join(lock.backupDir, `recovery-claim-candidate-${claim?.recoveryToken}.json`),
    { root: lock.backupDir },
  );
  if (claim?.schemaVersion !== 1 || claim?.transactionId !== lock.transactionId
    || claim?.operationToken !== lock.token || claim?.claimPath !== claimPath
    || claim?.candidate !== expectedCandidate
    || !/^[0-9a-f-]{36}$/i.test(String(claim?.recoveryToken || ''))
    || !Number.isInteger(claim?.owner?.pid) || !claim.owner.startToken
    || !/^\d+$/.test(String(claim?.observedLock?.dev))
    || !/^\d+$/.test(String(claim?.observedLock?.ino))
    || !/^[a-f0-9]{64}$/.test(String(claim?.observedLock?.sha256))) {
    throw new Error('recovery claim record is invalid');
  }
  return claim;
}

function processIdentityIsLive(identity, testTokens = null) {
  if (!identity?.pid || !identity?.startToken) return false;
  const token = processStartToken(identity.pid, testTokens);
  if (token === null) throw new Error(`cannot prove process start identity for PID ${identity.pid}`);
  return processStartTokensMatch(identity.startToken, token);
}

export function acquireRecoveryClaim(config, observedLock = readOperationLock(config)) {
  const claimPath = recoveryClaimPath(observedLock);
  const recoveryToken = randomUUID();
  const candidate = assertManagedPath(path.join(observedLock.backupDir, `recovery-claim-candidate-${recoveryToken}.json`), { root: observedLock.backupDir });
  const claim = {
    schemaVersion: 1,
    transactionId: observedLock.transactionId,
    operationToken: observedLock.token,
    recoveryToken,
    claimPath,
    candidate,
    observedLock: observedLock.lockIdentity || operationLockIdentity(observedLock.lockPath),
    owner: processIdentity(),
    acquiredAt: new Date().toISOString(),
  };
  atomicWrite(candidate, `${JSON.stringify(claim, null, 2)}\n`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      linkSync(candidate, claimPath);
      fsyncDirectory(observedLock.backupDir);
      const claimIdentity = operationLockIdentity(claimPath);
      let current;
      try { current = readOperationLock(config); }
      catch (lockReadError) {
        const invalidArchive = assertManagedPath(path.join(observedLock.backupDir, `recovery-claim-invalid-${recoveryToken}.json`), { root: observedLock.backupDir });
        durableRename(claimPath, invalidArchive);
        throw lockReadError;
      }
      const currentIdentity = operationLockIdentity(current.lockPath);
      if (current.token !== observedLock.token || current.transactionId !== observedLock.transactionId
        || currentIdentity.dev !== claim.observedLock.dev || currentIdentity.ino !== claim.observedLock.ino
        || currentIdentity.sha256 !== claim.observedLock.sha256) {
        const invalidArchive = assertManagedPath(path.join(observedLock.backupDir, `recovery-claim-invalid-${recoveryToken}.json`), { root: observedLock.backupDir });
        durableRename(claimPath, invalidArchive);
        throw new Error('operation lock changed while acquiring recovery claim');
      }
      return { ...claim, claimIdentity, lock: current };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing;
      let existingIdentity;
      try {
        const existingSnapshot = readManagedJsonSnapshot(claimPath, { root: observedLock.backupDir });
        existing = validateRecoveryClaim(observedLock, existingSnapshot.value, claimPath);
        existingIdentity = existingSnapshot.identity;
      } catch (claimReadError) {
        if (claimReadError?.code === 'ENOENT' || !entryExists(claimPath)) continue;
        throw claimReadError;
      }
      if (processIdentityIsLive(existing.owner)) {
        throw new Error(`VoxKey recovery is already owned by PID ${existing.owner.pid}`);
      }
      const staleArchive = assertManagedPath(path.join(observedLock.backupDir, `recovery-claim-stale-${existing.recoveryToken}.json`), { root: observedLock.backupDir });
      if (entryExists(staleArchive)) throw new Error('stale recovery claim archive already exists');
      try {
        durableRename(claimPath, staleArchive);
        const archivedIdentity = operationLockIdentity(staleArchive);
        if (JSON.stringify(archivedIdentity) !== JSON.stringify(existingIdentity)) {
          throw new Error('stale recovery claim pathname changed during takeover');
        }
      }
      catch (renameError) {
        if (renameError?.code !== 'ENOENT') throw renameError;
      }
    }
  }
  throw new Error('could not atomically acquire the VoxKey recovery claim');
}

export function assertRecoveryClaimCurrent(config, claim) {
  const currentClaimSnapshot = readManagedJsonSnapshot(claim.claimPath, { root: claim.lock.backupDir });
  const currentClaim = validateRecoveryClaim(claim.lock, currentClaimSnapshot.value, claim.claimPath);
  if (currentClaim.recoveryToken !== claim.recoveryToken || !processIdentityIsLive(currentClaim.owner)) {
    throw new Error('recovery claim ownership changed');
  }
  if (!claim.claimIdentity || JSON.stringify(currentClaimSnapshot.identity) !== JSON.stringify(claim.claimIdentity)) {
    throw new Error('recovery claim pathname changed');
  }
  const currentLock = readOperationLock(config);
  const identity = operationLockIdentity(currentLock.lockPath);
  if (currentLock.token !== claim.operationToken || currentLock.transactionId !== claim.transactionId
    || identity.dev !== claim.observedLock.dev || identity.ino !== claim.observedLock.ino
    || identity.sha256 !== claim.observedLock.sha256) {
    throw new Error('operation lock changed after recovery claim');
  }
  return currentLock;
}

export function releaseRecoveryClaim(claim, status = 'released') {
  const snapshot = readManagedJsonSnapshot(claim.claimPath, { root: claim.lock.backupDir });
  const current = validateRecoveryClaim(claim.lock, snapshot.value, claim.claimPath);
  if (current.recoveryToken !== claim.recoveryToken) throw new Error('refusing to release another recovery claimant');
  if (!claim.claimIdentity || JSON.stringify(snapshot.identity) !== JSON.stringify(claim.claimIdentity)) {
    throw new Error('refusing to release a replaced recovery claim pathname');
  }
  const safeStatus = String(status).replace(/[^a-z0-9-]/gi, '-').slice(0, 32) || 'released';
  const destination = assertManagedPath(path.join(claim.lock.backupDir, `recovery-claim-${safeStatus}-${claim.recoveryToken}.json`), { root: claim.lock.backupDir });
  if (entryExists(destination)) throw new Error('recovery claim archive already exists');
  durableRename(claim.claimPath, destination);
  return destination;
}

function transactionDirectory(config, transactionId) {
  if (!/^voxkey-[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(transactionId || ''))) {
    throw new Error('invalid VoxKey transaction id');
  }
  const { backupRoot } = runtimePaths(config);
  return assertManagedPath(path.join(backupRoot, transactionId), { root: backupRoot });
}

function createTransaction(config, transactionId = `voxkey-${randomUUID()}`) {
  const paths = runtimePaths(config);
  mkdirSync(paths.backupRoot, { recursive: true, mode: 0o700 });
  assertManagedPath(paths.backupRoot);
  const backupDir = transactionDirectory(config, transactionId);
  mkdirSync(backupDir, { recursive: false, mode: 0o700 });
  const transaction = { transactionId, backupDir, paths, config, runtimeBindingSha256: runtimeBindingSha256(config) };
  atomicWrite(path.join(backupDir, 'transaction.json'), `${JSON.stringify({
    schemaVersion: 2,
    transactionId,
    runtimeBindingSha256: runtimeBindingSha256(config),
    status: 'installing',
    createdAt: new Date().toISOString(),
    targets: { command: paths.command, dataRoot: paths.dataRoot, module: paths.moduleTarget, init: paths.initTarget },
  }, null, 2)}\n`);
  return transaction;
}

function updateTransaction(transaction, status, detail = '') {
  if (!/^[a-f0-9]{64}$/.test(String(transaction.runtimeBindingSha256 || ''))) {
    throw new Error('transaction runtime binding is missing');
  }
  atomicWrite(path.join(transaction.backupDir, 'transaction.json'), `${JSON.stringify({
    schemaVersion: 2,
    transactionId: transaction.transactionId,
    runtimeBindingSha256: transaction.runtimeBindingSha256,
    status,
    detail,
    updatedAt: new Date().toISOString(),
    targets: {
      command: transaction.paths.command,
      dataRoot: transaction.paths.dataRoot,
      module: transaction.paths.moduleTarget,
      init: transaction.paths.initTarget,
    },
    ...(transaction.parentGuard ? { parentGuard: transaction.parentGuard } : {}),
  }, null, 2)}\n`);
}

function stagingPaths(transaction) {
  const stageRoot = assertManagedPath(path.join(transaction.backupDir, 'staging'), { root: transaction.backupDir });
  const stageHome = assertManagedPath(path.join(stageRoot, 'home'), { root: stageRoot });
  const stageDataHome = assertManagedPath(path.join(stageRoot, 'data'), { root: stageRoot });
  const stageDataRoot = assertManagedPath(path.join(stageDataHome, 'voxkey'), { root: stageDataHome });
  const stageCommand = assertManagedPath(path.join(stageHome, '.local/bin/voxkey'), { root: stageHome, allowLeafSymlink: true });
  return { stageRoot, stageHome, stageDataHome, stageDataRoot, stageCommand };
}

function prepareStaging(transaction) {
  const stage = stagingPaths(transaction);
  if (entryExists(stage.stageRoot)) throw new Error(`transaction staging already exists: ${stage.stageRoot}`);
  mkdirSync(stage.stageHome, { recursive: true, mode: 0o700 });
  mkdirSync(stage.stageDataHome, { recursive: true, mode: 0o700 });
  return stage;
}

const TRANSACTION_ENV_PASSTHROUGH = [
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'SYSTEM_VERSION_COMPAT',
];
const TRANSACTION_WRITE_ENV = [
  'HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'TMPDIR',
  'PIP_CACHE_DIR', 'PYTHONPYCACHEPREFIX', 'UV_CACHE_DIR', 'NPM_CONFIG_CACHE', 'npm_config_cache',
  'YARN_CACHE_FOLDER', 'COREPACK_HOME', 'CARGO_HOME',
];

export function buildTransactionEnvironment(stage, python, { dataHome = stage?.stageDataHome, transactionId = '' } = {}) {
  if (!stage?.stageRoot || !stage?.stageHome || !stage?.stageDataHome) throw new Error('transaction staging paths are incomplete');
  const stageRoot = assertManagedPath(stage.stageRoot);
  const safeDataHome = assertManagedPath(dataHome);
  const roots = {
    HOME: assertManagedPath(stage.stageHome, { root: stageRoot }),
    XDG_DATA_HOME: safeDataHome,
    XDG_CACHE_HOME: assertManagedPath(path.join(stageRoot, 'cache'), { root: stageRoot }),
    XDG_CONFIG_HOME: assertManagedPath(path.join(stageRoot, 'config'), { root: stageRoot }),
    XDG_STATE_HOME: assertManagedPath(path.join(stageRoot, 'state'), { root: stageRoot }),
    TMPDIR: assertManagedPath(path.join(stageRoot, 'tmp'), { root: stageRoot }),
    PIP_CACHE_DIR: assertManagedPath(path.join(stageRoot, 'cache/pip'), { root: stageRoot }),
    PYTHONPYCACHEPREFIX: assertManagedPath(path.join(stageRoot, 'cache/pycache'), { root: stageRoot }),
    UV_CACHE_DIR: assertManagedPath(path.join(stageRoot, 'cache/uv'), { root: stageRoot }),
    NPM_CONFIG_CACHE: assertManagedPath(path.join(stageRoot, 'cache/npm'), { root: stageRoot }),
    npm_config_cache: assertManagedPath(path.join(stageRoot, 'cache/npm'), { root: stageRoot }),
    YARN_CACHE_FOLDER: assertManagedPath(path.join(stageRoot, 'cache/yarn'), { root: stageRoot }),
    COREPACK_HOME: assertManagedPath(path.join(stageRoot, 'cache/corepack'), { root: stageRoot }),
    CARGO_HOME: assertManagedPath(path.join(stageRoot, 'cache/cargo'), { root: stageRoot }),
  };
  for (const directoryPath of Object.values(roots)) {
    mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
    assertManagedPath(directoryPath);
  }
  const environment = {
    PATH: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    ...roots,
    VOXKEY_PYTHON: assertManagedPath(python, { allowLeafSymlink: true }),
    VOXKEY_NO_FORMAT: '1',
    PIP_CONFIG_FILE: '/dev/null',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '0',
    YURI_VOXKEY_TRANSACTION_ID: String(transactionId || ''),
    YURI_VOXKEY_TRANSACTION_ROOT: stageRoot,
  };
  for (const key of TRANSACTION_ENV_PASSTHROUGH) {
    if (typeof process.env[key] === 'string' && process.env[key]) environment[key] = process.env[key];
  }
  for (const key of TRANSACTION_WRITE_ENV) {
    const value = environment[key];
    if (key === 'XDG_DATA_HOME' && value === safeDataHome) continue;
    const relative = path.relative(stageRoot, value);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`transaction environment escaped staging: ${key}`);
    }
  }
  return environment;
}

function assertTransactionEnvironment(environment, config, transaction) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error('tracked mutation requires a sanitized transaction environment');
  }
  const allowed = new Set([
    'PATH', ...TRANSACTION_ENV_PASSTHROUGH, ...TRANSACTION_WRITE_ENV,
    'VOXKEY_PYTHON', 'VOXKEY_NO_FORMAT', 'PIP_CONFIG_FILE', 'PIP_DISABLE_PIP_VERSION_CHECK',
    'PYTHONNOUSERSITE', 'PYTHONDONTWRITEBYTECODE', 'YURI_VOXKEY_TRANSACTION_ID',
    'YURI_VOXKEY_TRANSACTION_ROOT',
  ]);
  const unexpected = Object.keys(environment).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`tracked mutation environment contains unapproved keys: ${unexpected.join(', ')}`);
  if (environment.YURI_VOXKEY_TRANSACTION_ID !== transaction.transactionId) throw new Error('tracked mutation transaction id mismatch');
  const stageRoot = assertManagedPath(environment.YURI_VOXKEY_TRANSACTION_ROOT, { root: transaction.backupDir });
  const liveDataHome = runtimePaths(config).dataHome;
  for (const key of TRANSACTION_WRITE_ENV) {
    const value = assertManagedPath(environment[key]);
    if (key === 'XDG_DATA_HOME' && value === liveDataHome) continue;
    const relative = path.relative(stageRoot, value);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`tracked mutation environment escaped transaction root: ${key}`);
    }
  }
  if (environment.PIP_CONFIG_FILE !== '/dev/null' || environment.VOXKEY_NO_FORMAT !== '1') {
    throw new Error('tracked mutation environment safety constants changed');
  }
  return true;
}

function writeStagingOwnershipMarker(stageDataRoot, transaction, status = 'staged', { parentGuard = null, paths = null } = {}) {
  const markerPath = assertManagedPath(path.join(stageDataRoot, '.yuri-voxkey-stage.json'), { root: stageDataRoot });
  atomicWrite(markerPath, `${JSON.stringify({
    schemaVersion: 1,
    transactionId: transaction.transactionId,
    status,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 0o600, { parentGuard, paths });
  return markerPath;
}

function stageMarkerMatches(dataRoot, transactionId) {
  if (!entryExists(dataRoot) || !lstatSync(dataRoot).isDirectory()) return false;
  const markerPath = assertManagedPath(path.join(dataRoot, '.yuri-voxkey-stage.json'), { root: dataRoot });
  if (!entryExists(markerPath)) return false;
  try {
    const marker = readManagedJson(markerPath, { root: dataRoot });
    return marker.schemaVersion === 1 && marker.transactionId === transactionId;
  } catch {
    return false;
  }
}

function backupHash(file, root) {
  return existsSync(file) ? sha256ManagedFile(file, { root }) : null;
}

function inspectRuntimeFingerprint(config, transactionId, { createMarker = false, parentGuard = null } = {}) {
  const paths = runtimePaths(config);
  if (!entryExists(paths.command) || !lstatSync(paths.command).isSymbolicLink()) {
    throw new Error('owned VoxKey command must be a symlink');
  }
  const commandLinkTarget = readlinkSync(paths.command);
  const commandTarget = assertManagedPath(path.resolve(path.dirname(paths.command), commandLinkTarget), { root: paths.dataRoot });
  if (!existsSync(commandTarget) || !lstatSync(commandTarget).isFile()) throw new Error('VoxKey command target is missing or not a regular file');
  const nodeLock = assertManagedPath(path.join(paths.dataRoot, 'node/package-lock.json'), { root: paths.dataRoot });
  if (!existsSync(nodeLock) || !lstatSync(nodeLock).isFile()) throw new Error('installed VoxKey package lock is missing');
  const nodeLockSha256 = sha256File(nodeLock);
  if (nodeLockSha256 !== config.upstream.files['package-lock.json']) throw new Error('installed VoxKey package lock does not match the pinned source');
  const markerPath = assertManagedPath(path.join(paths.dataRoot, '.yuri-voxkey-owner.json'), { root: paths.dataRoot });
  if (createMarker) {
    if (entryExists(markerPath)) throw new Error('runtime ownership marker already exists');
    atomicWrite(markerPath, `${JSON.stringify({
      schemaVersion: 1,
      transactionId,
      upstream: { commit: config.upstream.commit, tree: config.upstream.tree },
      commandLinkTarget,
      commandTargetSha256: sha256File(commandTarget),
      nodeLockSha256,
    }, null, 2)}\n`, 0o600, { parentGuard, paths });
  }
  if (!existsSync(markerPath) || !lstatSync(markerPath).isFile()) throw new Error('runtime ownership marker is missing');
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (marker.schemaVersion !== 1 || marker.transactionId !== transactionId) throw new Error('runtime ownership marker transaction mismatch');
  if (marker.upstream?.commit !== config.upstream.commit || marker.upstream?.tree !== config.upstream.tree) throw new Error('runtime ownership marker source mismatch');
  const fingerprint = {
    commandLinkTarget,
    commandTargetSha256: sha256File(commandTarget),
    nodeLockSha256,
    markerSha256: sha256File(markerPath),
  };
  if (marker.commandLinkTarget !== fingerprint.commandLinkTarget
    || marker.commandTargetSha256 !== fingerprint.commandTargetSha256
    || marker.nodeLockSha256 !== fingerprint.nodeLockSha256) {
    throw new Error('runtime ownership marker fingerprint mismatch');
  }
  return fingerprint;
}

function verifyRuntimeFingerprint(config, transactionId, expected) {
  const actual = inspectRuntimeFingerprint(config, transactionId);
  for (const field of ['commandLinkTarget', 'commandTargetSha256', 'nodeLockSha256', 'markerSha256']) {
    if (actual[field] !== expected?.[field]) throw new Error(`runtime ownership fingerprint mismatch: ${field}`);
  }
  return actual;
}

export function verifyInstalledRuntime(config) {
  const paths = runtimePaths(config);
  const receipt = readManagedJson(paths.receiptPath);
  const targets = validateInstallReceipt(config, receipt);
  const runtimeFingerprint = verifyRuntimeFingerprint(config, receipt.transactionId, receipt.runtimeFingerprint);
  if (!entryExists(paths.moduleTarget) || sha256ManagedFile(paths.moduleTarget) !== receipt.moduleSha256) {
    throw new Error('installed Hammerspoon module fingerprint mismatch');
  }
  if (!entryExists(paths.initTarget)) throw new Error('installed Hammerspoon init.lua is missing');
  const priorInit = receipt.previous.init
    ? readManagedRegularFile(path.join(targets.backupDir, 'init.lua.before'), { root: targets.backupDir })
    : Buffer.alloc(0);
  const managedAppendSha256 = createHash('sha256').update(managedRequireAppendBytes(priorInit)).digest('hex');
  if (managedAppendSha256 !== receipt.managedAppendSha256) throw new Error('managed init.lua append fingerprint mismatch');
  removeManagedRequireBytes(readManagedRegularFile(paths.initTarget), priorInit);
  return { transactionId: receipt.transactionId, receipt, runtimeFingerprint };
}

export function installHammerspoonProjection(config, transaction) {
  const paths = runtimePaths(config);
  const { moduleTarget, initTarget } = paths;
  const backupDir = transactionDirectory(config, transaction?.transactionId);
  if (transaction?.backupDir !== backupDir) throw new Error('transaction backup directory does not match its id');
  const previous = { module: entryExists(moduleTarget), init: entryExists(initTarget) };
  const previousMetadata = {
    module: previous.module ? captureFileMetadata(moduleTarget) : null,
    init: previous.init ? captureFileMetadata(initTarget) : null,
  };
  const moduleBackup = path.join(backupDir, 'yuri-voxkey.lua.before');
  const initBackup = path.join(backupDir, 'init.lua.before');
  const journalPath = path.join(backupDir, 'projection-plan.json');
  const parentGuard = transaction?.parentGuard || captureParentIdentityGuard(paths);
  assertParentIdentityGuard(paths, parentGuard);
  const projection = {
    backupDir, previous, previousMetadata, moduleTarget, initTarget, moduleBackup, initBackup, journalPath,
    requireAdded: true, parentGuard, paths, runtimeBindingSha256: runtimeBindingSha256(config),
  };
  if (previous.module) atomicWrite(moduleBackup, readManagedRegularFile(moduleTarget));
  if (previous.init) atomicWrite(initBackup, readManagedRegularFile(initTarget));
  projection.moduleBeforeSha256 = backupHash(moduleBackup, backupDir);
  projection.initBeforeSha256 = backupHash(initBackup, backupDir);
  const initBeforeBytes = previous.init ? readManagedRegularFile(initTarget) : Buffer.alloc(0);
  const initBody = initBeforeBytes.toString('utf8');
  if (!Buffer.from(initBody, 'utf8').equals(initBeforeBytes)) {
    throw new Error('init.lua is not valid UTF-8; refusing a byte-unsafe projection');
  }
  if (LEGACY_REQUIRE_RE.test(initBody)) {
    throw new Error('legacy VoxKey require is present; remove or quarantine it before activation');
  }
  if (ANY_YURI_REQUIRE_RE.test(initBody)) {
    throw new Error('an unmanaged yuri-voxkey require is already present');
  }
  const nextInit = appendManagedRequireBytes(initBeforeBytes);
  const moduleBody = readManagedRegularFile(HAMMERSPOON_SOURCE).toString('utf8');
  projection.moduleSha256 = createHash('sha256').update(moduleBody).digest('hex');
  projection.initAfterSha256 = createHash('sha256').update(nextInit).digest('hex');
  projection.managedAppendSha256 = createHash('sha256').update(managedRequireAppendBytes(initBeforeBytes)).digest('hex');
  writeProjectionJournal(projection, 'prepared');
  try {
    mkdirSync(path.dirname(moduleTarget), { recursive: true, mode: 0o700 });
    assertManagedPath(moduleTarget);
    assertManagedPath(initTarget);
    atomicWrite(moduleTarget, moduleBody, previousMetadata.module?.mode ?? 0o600, {
      metadata: previousMetadata.module,
      parentGuard,
      paths,
    });
    if (sha256ManagedFile(moduleTarget) !== projection.moduleSha256) throw new Error('projected module hash mismatch');
    writeProjectionJournal(projection, 'module-written');
    atomicWrite(initTarget, nextInit, previousMetadata.init?.mode ?? 0o600, {
      metadata: previousMetadata.init,
      parentGuard,
      paths,
    });
    if (sha256ManagedFile(initTarget) !== projection.initAfterSha256) throw new Error('projected init hash mismatch');
    writeProjectionJournal(projection, 'projected');
    return projection;
  } catch (error) {
    try { restoreProjectionAfterInstallFailure(projection); }
    catch (restoreError) { throw new Error(`${error.message}; projection recovery failed: ${restoreError.message}`); }
    throw error;
  }
}

function writeProjectionJournal(projection, status) {
  atomicWrite(projection.journalPath, `${JSON.stringify({
    schemaVersion: 2,
    transactionId: path.basename(projection.backupDir),
    runtimeBindingSha256: projection.runtimeBindingSha256,
    status,
    previous: projection.previous,
    previousMetadata: projection.previousMetadata,
    parentGuard: projection.parentGuard,
    moduleTarget: projection.moduleTarget,
    initTarget: projection.initTarget,
    moduleBackup: projection.moduleBackup,
    initBackup: projection.initBackup,
    moduleBeforeSha256: projection.moduleBeforeSha256,
    initBeforeSha256: projection.initBeforeSha256,
    moduleSha256: projection.moduleSha256,
    initAfterSha256: projection.initAfterSha256,
    managedAppendSha256: projection.managedAppendSha256,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

function projectionStateFromJournal(config, transactionId) {
  const backupDir = transactionDirectory(config, transactionId);
  const journalPath = assertManagedPath(path.join(backupDir, 'projection-plan.json'), { root: backupDir });
  if (!entryExists(journalPath)) return null;
  const journal = readManagedJson(journalPath, { root: backupDir });
  const paths = runtimePaths(config);
  const expected = {
    backupDir,
    previous: journal.previous,
    previousMetadata: journal.previousMetadata,
    parentGuard: journal.parentGuard,
    paths,
    runtimeBindingSha256: runtimeBindingSha256(config),
    moduleTarget: paths.moduleTarget,
    initTarget: paths.initTarget,
    moduleBackup: path.join(backupDir, 'yuri-voxkey.lua.before'),
    initBackup: path.join(backupDir, 'init.lua.before'),
    journalPath,
    requireAdded: true,
    moduleBeforeSha256: journal.moduleBeforeSha256,
    initBeforeSha256: journal.initBeforeSha256,
    moduleSha256: journal.moduleSha256,
    initAfterSha256: journal.initAfterSha256,
    managedAppendSha256: journal.managedAppendSha256,
  };
  if (journal.schemaVersion !== 2 || journal.transactionId !== transactionId) throw new Error('projection journal identity mismatch');
  if (journal.runtimeBindingSha256 !== expected.runtimeBindingSha256) throw new Error('projection journal runtime binding mismatch');
  for (const field of ['moduleTarget', 'initTarget', 'moduleBackup', 'initBackup']) {
    if (journal[field] !== expected[field]) throw new Error(`projection journal ${field} mismatch`);
  }
  if (typeof journal.previous?.module !== 'boolean' || typeof journal.previous?.init !== 'boolean') throw new Error('projection journal prior-state flags invalid');
  if (journal.previous.module) validateFileMetadata(journal.previousMetadata?.module);
  else if (journal.previousMetadata?.module !== null) throw new Error('projection journal prior module metadata mismatch');
  if (journal.previous.init) validateFileMetadata(journal.previousMetadata?.init);
  else if (journal.previousMetadata?.init !== null) throw new Error('projection journal prior init metadata mismatch');
  assertParentIdentityGuard(paths, journal.parentGuard);
  for (const field of ['moduleSha256', 'initAfterSha256', 'managedAppendSha256']) {
    if (!/^[a-f0-9]{64}$/.test(String(journal[field] || ''))) throw new Error(`projection journal ${field} invalid`);
  }
  return expected;
}

function restoreProjectionAfterInstallFailure(projection) {
  if (!projection) return;
  if (entryExists(projection.moduleTarget)) {
    const currentHash = sha256ManagedFile(projection.moduleTarget);
    if (projection.previous.module && currentHash === projection.moduleBeforeSha256) {
      // The write never became visible; the original is already intact.
      assertFileMetadataMatches(projection.moduleTarget, projection.previousMetadata.module, 'prior module');
    } else if (currentHash !== projection.moduleSha256) {
      throw new Error('module changed during failed install; refusing to overwrite it');
    } else if (projection.previous.module) {
      atomicWrite(
        projection.moduleTarget,
        readManagedRegularFile(projection.moduleBackup, { root: projection.backupDir }),
        projection.previousMetadata.module.mode,
        { metadata: projection.previousMetadata.module, parentGuard: projection.parentGuard, paths: projection.paths },
      );
    } else {
      const failedModule = path.join(projection.backupDir, 'yuri-voxkey.lua.failed-install');
      if (entryExists(failedModule)) throw new Error('failed-install module quarantine already exists');
      durableRename(projection.moduleTarget, failedModule, { parentGuard: projection.parentGuard, paths: projection.paths });
    }
  }
  if (entryExists(projection.initTarget)) {
    const currentHash = sha256ManagedFile(projection.initTarget);
    if (projection.previous.init && currentHash === projection.initBeforeSha256) {
      // The write never became visible; the original is already intact.
      assertFileMetadataMatches(projection.initTarget, projection.previousMetadata.init, 'prior init');
    } else if (currentHash !== projection.initAfterSha256) {
      throw new Error('init.lua changed during failed install; refusing to overwrite it');
    } else if (projection.previous.init) {
      atomicWrite(
        projection.initTarget,
        readManagedRegularFile(projection.initBackup, { root: projection.backupDir }),
        projection.previousMetadata.init.mode,
        { metadata: projection.previousMetadata.init, parentGuard: projection.parentGuard, paths: projection.paths },
      );
    } else {
      const failedInit = path.join(projection.backupDir, 'init.lua.failed-install');
      if (entryExists(failedInit)) throw new Error('failed-install init quarantine already exists');
      durableRename(projection.initTarget, failedInit, { parentGuard: projection.parentGuard, paths: projection.paths });
    }
  }
  writeProjectionJournal(projection, 'restored');
}

function quarantineRuntime(config, backupDir, label, { parentGuard = null } = {}) {
  const moves = [];
  const paths = runtimePaths(config);
  const candidates = runtimeQuarantinePlan(config, backupDir, label);
  try {
    for (const candidate of candidates) {
      if (!entryExists(candidate.from)) continue;
      if (entryExists(candidate.to)) throw new Error(`quarantine target already exists: ${candidate.to}`);
      durableRename(candidate.from, candidate.to, { parentGuard, paths });
      moves.push(candidate);
    }
    return moves;
  } catch (error) {
    for (const move of [...moves].reverse()) {
      if (entryExists(move.to) && !entryExists(move.from)) durableRename(move.to, move.from, { parentGuard, paths });
    }
    throw error;
  }
}

function restoreRuntimeQuarantine(moves, { parentGuard = null, paths = null } = {}) {
  for (const move of [...moves].reverse()) {
    if (entryExists(move.to) && !entryExists(move.from)) durableRename(move.to, move.from, { parentGuard, paths });
  }
}

function runtimeQuarantinePlan(config, backupDir, label) {
  const paths = runtimePaths(config);
  return [
    { from: paths.command, to: assertManagedPath(path.join(backupDir, `${label}-voxkey-command`), { root: backupDir }) },
    { from: paths.dataRoot, to: assertManagedPath(path.join(backupDir, `${label}-voxkey-data`), { root: backupDir }) },
  ];
}

export function removeManagedRequireLine(body) {
  const lines = String(body || '').split('\n');
  const matches = lines.reduce((count, line) => count + (MANAGED_REQUIRE_RE.test(line) ? 1 : 0), 0);
  if (matches !== 1) throw new Error(`expected exactly one managed yuri-voxkey require, found ${matches}`);
  return lines.filter((line) => !MANAGED_REQUIRE_RE.test(line)).join('\n');
}

function managedRequireCount(body) {
  return String(body || '').split('\n').reduce((count, line) => count + (MANAGED_REQUIRE_RE.test(line) ? 1 : 0), 0);
}

export function validateInstallReceipt(config, receipt) {
  const paths = runtimePaths(config);
  const errors = [];
  if (receipt?.schemaVersion !== 2) errors.push('receipt schemaVersion must be 2');
  if (receipt?.runtimeBindingSha256 !== runtimeBindingSha256(config)) errors.push('receipt runtime binding mismatch');
  let backupDir = '';
  try { backupDir = transactionDirectory(config, receipt?.transactionId); } catch (error) { errors.push(error.message); }
  const expected = {
    backupDir,
    command: paths.command,
    dataRoot: paths.dataRoot,
    module: paths.moduleTarget,
    init: paths.initTarget,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (receipt?.[field] !== value) errors.push(`receipt ${field} does not match configured target`);
  }
  if (receipt?.upstream?.commit !== config.upstream.commit || receipt?.upstream?.tree !== config.upstream.tree) errors.push('receipt upstream pin mismatch');
  if (receipt?.runtimeCreated !== true) errors.push('receipt does not prove runtime ownership');
  if (receipt?.requireAdded !== true) errors.push('receipt does not prove managed require ownership');
  if (typeof receipt?.previous?.module !== 'boolean' || typeof receipt?.previous?.init !== 'boolean') errors.push('receipt previous-state flags invalid');
  for (const field of ['moduleSha256', 'initAfterSha256', 'managedAppendSha256']) {
    if (!/^[a-f0-9]{64}$/.test(String(receipt?.[field] || ''))) errors.push(`receipt ${field} invalid`);
  }
  for (const field of ['moduleBeforeSha256', 'initBeforeSha256']) {
    const value = receipt?.[field];
    if (value !== null && !/^[a-f0-9]{64}$/.test(String(value || ''))) errors.push(`receipt ${field} invalid`);
  }
  if (!receipt?.runtimeFingerprint?.commandLinkTarget) errors.push('receipt runtime command link target missing');
  for (const field of ['commandTargetSha256', 'nodeLockSha256', 'markerSha256']) {
    if (!/^[a-f0-9]{64}$/.test(String(receipt?.runtimeFingerprint?.[field] || ''))) errors.push(`receipt runtime fingerprint ${field} invalid`);
  }
  if (typeof receipt?.previous?.module === 'boolean' && (receipt.previous.module !== (receipt.moduleBeforeSha256 !== null))) errors.push('receipt prior-module hash/state mismatch');
  if (typeof receipt?.previous?.init === 'boolean' && (receipt.previous.init !== (receipt.initBeforeSha256 !== null))) errors.push('receipt prior-init hash/state mismatch');
  try {
    if (receipt?.previous?.module) validateFileMetadata(receipt?.previousMetadata?.module);
    else if (receipt?.previousMetadata?.module !== null) errors.push('receipt prior module metadata mismatch');
    if (receipt?.previous?.init) validateFileMetadata(receipt?.previousMetadata?.init);
    else if (receipt?.previousMetadata?.init !== null) errors.push('receipt prior init metadata mismatch');
  } catch (error) { errors.push(error.message); }
  try { assertParentIdentityGuard(paths, receipt?.parentGuard); }
  catch (error) { errors.push(error.message); }
  if (errors.length) throw new Error(`invalid install receipt: ${errors.join('; ')}`);
  return { ...expected, transactionId: receipt.transactionId };
}

export function assertRollbackQuiescent(config, { hammerspoonUnbound = false, _testProcessTable = null } = {}) {
  if (!hammerspoonUnbound) throw new Error('rollback requires an explicit Hammerspoon unbind confirmation');
  const paths = runtimePaths(config);
  if (entryExists(paths.pttHeldFlag) || entryExists(paths.pttOwnerLock)) {
    throw new Error('push-to-talk ownership is still active; stop the writer before rollback');
  }
  const conflicts = processConflicts(config.exclusiveListenerPatterns, { _testProcessTable });
  if (conflicts.length) throw new Error(`voice writer still active or unverifiable: ${conflicts.map((item) => item.identity || item.pattern).join(', ')}`);
  return true;
}

function writeRollbackJournal(journalPath, journal, status) {
  const next = { ...journal, schemaVersion: 2, status, updatedAt: new Date().toISOString() };
  atomicWrite(journalPath, `${JSON.stringify(next, null, 2)}\n`);
  Object.assign(journal, next);
  return journal;
}

export function readRollbackJournal(config, transactionId) {
  const backupDir = transactionDirectory(config, transactionId);
  const journalPath = assertManagedPath(path.join(backupDir, 'rollback-journal.json'), { root: backupDir });
  if (!entryExists(journalPath)) return null;
  const journal = readManagedJson(journalPath, { root: backupDir });
  if (journal.schemaVersion !== 2 || journal.transactionId !== transactionId) throw new Error('rollback journal identity mismatch');
  if (journal.backupDir !== backupDir) throw new Error('rollback journal backup directory mismatch');
  if (journal.runtimeBindingSha256 !== runtimeBindingSha256(config)) throw new Error('rollback journal runtime binding mismatch');
  if (!/^[0-9a-f-]{36}$/i.test(String(journal.operationId || ''))) throw new Error('rollback journal operation id is invalid');
  const paths = runtimePaths(config);
  const expected = {
    moduleSnapshot: path.join(backupDir, 'rollback-current-module.lua'),
    initSnapshot: path.join(backupDir, 'rollback-current-init.lua'),
    moduleRemovedPath: path.join(backupDir, `rolled-back-yuri-voxkey-${journal.operationId}.lua`),
    initRemovedPath: path.join(backupDir, `rolled-back-created-init-${journal.operationId}.lua`),
    runtimeMoves: runtimeQuarantinePlan(config, backupDir, 'rolled-back'),
  };
  for (const field of ['moduleSnapshot', 'initSnapshot', 'moduleRemovedPath', 'initRemovedPath']) {
    if (journal[field] !== expected[field]) throw new Error(`rollback journal ${field} mismatch`);
  }
  if (!Array.isArray(journal.runtimeMoves) || journal.runtimeMoves.length !== expected.runtimeMoves.length) {
    throw new Error('rollback journal runtimeMoves length mismatch');
  }
  for (let index = 0; index < expected.runtimeMoves.length; index++) {
    for (const field of ['from', 'to']) {
      if (journal.runtimeMoves[index]?.[field] !== expected.runtimeMoves[index][field]) {
        throw new Error(`rollback journal runtimeMoves[${index}].${field} mismatch`);
      }
    }
  }
  validateFileMetadata(journal.moduleSnapshotMetadata);
  validateFileMetadata(journal.initSnapshotMetadata);
  assertParentIdentityGuard(paths, journal.parentGuard);
  return { ...journal, journalPath };
}

function restoreRollbackFromJournal(config, receipt, journal) {
  const targets = validateInstallReceipt(config, receipt);
  if (journal.runtimeBindingSha256 !== runtimeBindingSha256(config)) throw new Error('rollback recovery runtime binding mismatch');
  if (!/^[0-9a-f-]{36}$/i.test(String(journal.operationId || ''))
    || journal.moduleRemovedPath !== path.join(targets.backupDir, `rolled-back-yuri-voxkey-${journal.operationId}.lua`)
    || journal.initRemovedPath !== path.join(targets.backupDir, `rolled-back-created-init-${journal.operationId}.lua`)) {
    throw new Error('rollback recovery quarantine path binding mismatch');
  }
  const expectedRuntimeMoves = runtimeQuarantinePlan(config, targets.backupDir, 'rolled-back');
  if (!Array.isArray(journal.runtimeMoves) || journal.runtimeMoves.length !== expectedRuntimeMoves.length
    || expectedRuntimeMoves.some((expected, index) => expected.from !== journal.runtimeMoves[index]?.from || expected.to !== journal.runtimeMoves[index]?.to)) {
    throw new Error('rollback recovery runtimeMoves do not match configured targets');
  }
  assertParentIdentityGuard(runtimePaths(config), journal.parentGuard);
  const moduleSnapshot = assertManagedPath(journal.moduleSnapshot, { root: targets.backupDir });
  const initSnapshot = assertManagedPath(journal.initSnapshot, { root: targets.backupDir });
  if (sha256ManagedFile(moduleSnapshot, { root: targets.backupDir }) !== journal.moduleSnapshotSha256) throw new Error('rollback module recovery snapshot mismatch');
  if (sha256ManagedFile(initSnapshot, { root: targets.backupDir }) !== journal.initSnapshotSha256) throw new Error('rollback init recovery snapshot mismatch');

  for (const move of [...expectedRuntimeMoves].reverse()) {
    const from = assertManagedPath(move.from, { allowLeafSymlink: true });
    const to = assertManagedPath(move.to, { root: targets.backupDir, allowLeafSymlink: true });
    const fromExists = entryExists(from);
    const toExists = entryExists(to);
    if (fromExists && toExists) throw new Error(`rollback runtime recovery diverged at ${from}`);
    if (!fromExists && !toExists) throw new Error(`rollback runtime recovery lost both states at ${from}`);
    if (toExists) durableRename(to, from, { parentGuard: journal.parentGuard, paths: runtimePaths(config) });
  }

  const currentModuleHash = entryExists(targets.module) ? sha256ManagedFile(targets.module) : null;
  const allowedModuleAfter = receipt.previous.module ? receipt.moduleBeforeSha256 : null;
  if (![journal.moduleSnapshotSha256, allowedModuleAfter].includes(currentModuleHash)) {
    throw new Error('rollback module target diverged during recovery');
  }
  const moduleRemovedPath = assertManagedPath(journal.moduleRemovedPath, { root: targets.backupDir });
  const initRemovedPath = assertManagedPath(journal.initRemovedPath, { root: targets.backupDir });
  if (entryExists(moduleRemovedPath)) {
    if (entryExists(targets.module)) throw new Error('rollback module exists in live and recovery quarantine');
    durableRename(moduleRemovedPath, targets.module, { parentGuard: journal.parentGuard, paths: runtimePaths(config) });
  } else if (currentModuleHash !== journal.moduleSnapshotSha256) {
    atomicWrite(targets.module, readManagedRegularFile(moduleSnapshot, { root: targets.backupDir }), journal.moduleSnapshotMetadata.mode, {
      metadata: journal.moduleSnapshotMetadata,
      parentGuard: journal.parentGuard,
      paths: runtimePaths(config),
    });
  }

  const currentInitHash = entryExists(targets.init) ? sha256ManagedFile(targets.init) : null;
  const allowedInitAfter = journal.initDisposition === 'removed-created' ? null : journal.nextInitSha256;
  if (![journal.initSnapshotSha256, allowedInitAfter].includes(currentInitHash)) {
    throw new Error('rollback init target diverged during recovery');
  }
  if (entryExists(initRemovedPath)) {
    if (entryExists(targets.init)) throw new Error('rollback init exists in live and recovery quarantine');
    durableRename(initRemovedPath, targets.init, { parentGuard: journal.parentGuard, paths: runtimePaths(config) });
  } else if (currentInitHash !== journal.initSnapshotSha256) {
    atomicWrite(targets.init, readManagedRegularFile(initSnapshot, { root: targets.backupDir }), journal.initSnapshotMetadata.mode, {
      metadata: journal.initSnapshotMetadata,
      parentGuard: journal.parentGuard,
      paths: runtimePaths(config),
    });
  }

  writeRollbackJournal(journal.journalPath, journal, 'recovered-live-state');
  return { targets, recovered: true };
}

function verifyCompletedRollback(config, receipt, targets, marker) {
  if (marker.schemaVersion !== 2 || marker.transactionId !== receipt.transactionId || marker.status !== 'rolled-back-runtime-quarantined') {
    throw new Error('rollback result marker is invalid');
  }
  if (entryExists(targets.command) || entryExists(targets.dataRoot)) throw new Error('rollback marker exists but runtime live paths reappeared');
  if (marker.initDisposition === 'removed-created') {
    if (entryExists(targets.init)) throw new Error('rollback marker requires the controller-created init.lua to remain absent');
  } else if (!['cleaned-existing', 'retained-unrelated'].includes(marker.initDisposition)) {
    throw new Error('rollback marker init disposition is invalid');
  } else if (!entryExists(targets.init) || managedRequireCount(readManagedRegularFile(targets.init).toString('utf8')) !== 0) {
    throw new Error('rollback marker exists but init.lua is not clean');
  }
  if (receipt.previous.module) {
    if (!entryExists(targets.module) || sha256ManagedFile(targets.module) !== receipt.moduleBeforeSha256) throw new Error('rollback marker exists but prior module is not restored');
    assertFileMetadataMatches(targets.module, receipt.previousMetadata.module, 'restored prior module');
  } else if (entryExists(targets.module)) throw new Error('rollback marker exists but managed module reappeared');
  if (receipt.previous.init && entryExists(targets.init)) {
    assertFileMetadataMatches(targets.init, receipt.previousMetadata.init, 'restored prior init');
  }
  const runtimeMoves = runtimeQuarantinePlan(config, targets.backupDir, 'rolled-back');
  for (const move of runtimeMoves) {
    if (!entryExists(move.to)) throw new Error(`rollback marker quarantine is missing: ${move.to}`);
  }
  return { targets, alreadyApplied: true, runtimeMoves, initDisposition: marker.initDisposition };
}

export function rollbackInstalledProjection(config, receipt, { quiescenceProved = false, _testFaultAfterPhase = '' } = {}) {
  if (!quiescenceProved) throw new Error('rollback quiescence proof is required');
  const targets = validateInstallReceipt(config, receipt);
  const moduleBackup = path.join(targets.backupDir, 'yuri-voxkey.lua.before');
  const initBackup = path.join(targets.backupDir, 'init.lua.before');
  const rollbackResultPath = path.join(targets.backupDir, 'rollback-result.json');
  if (entryExists(rollbackResultPath)) {
    return verifyCompletedRollback(config, receipt, targets, readManagedJson(rollbackResultPath, { root: targets.backupDir }));
  }
  if (!entryExists(targets.module) || sha256File(targets.module) !== receipt.moduleSha256) {
    throw new Error('installed module missing or changed; refusing rollback overwrite');
  }
  if (receipt.previous.module && (!existsSync(moduleBackup) || sha256ManagedFile(moduleBackup, { root: targets.backupDir }) !== receipt.moduleBeforeSha256)) {
    throw new Error('prior module backup missing or hash-mismatched');
  }
  if (receipt.previous.init && (!existsSync(initBackup) || sha256ManagedFile(initBackup, { root: targets.backupDir }) !== receipt.initBeforeSha256)) {
    throw new Error('prior init backup missing or hash-mismatched');
  }
  if (!entryExists(targets.init)) throw new Error('init.lua is missing; refusing partial rollback');
  const currentInit = readManagedRegularFile(targets.init);
  const priorInit = receipt.previous.init
    ? readManagedRegularFile(initBackup, { root: targets.backupDir })
    : Buffer.alloc(0);
  const nextInit = removeManagedRequireBytes(currentInit, priorInit);
  if (createHash('sha256').update(managedRequireAppendBytes(priorInit)).digest('hex') !== receipt.managedAppendSha256) {
    throw new Error('install receipt managed append binding mismatch');
  }
  const moduleSnapshotMetadata = captureFileMetadata(targets.module);
  const initSnapshotMetadata = captureFileMetadata(targets.init);
  if (!entryExists(targets.command) || !entryExists(targets.dataRoot)) {
    throw new Error('owned VoxKey runtime is incomplete; refusing partial rollback');
  }
  verifyRuntimeFingerprint(config, receipt.transactionId, receipt.runtimeFingerprint);

  const rollbackModule = path.join(targets.backupDir, 'rollback-current-module.lua');
  const rollbackInit = path.join(targets.backupDir, 'rollback-current-init.lua');
  const journalPath = path.join(targets.backupDir, 'rollback-journal.json');
  const existingJournal = readRollbackJournal(config, receipt.transactionId);
  if (existingJournal && existingJournal.status !== 'recovered-live-state') {
    throw new Error('an interrupted rollback journal requires explicit recover before retry');
  }
  atomicWrite(rollbackModule, readManagedRegularFile(targets.module));
  atomicWrite(rollbackInit, readManagedRegularFile(targets.init));
  const initDisposition = !receipt.previous.init && nextInit.toString('utf8').trim() === ''
    ? 'removed-created'
    : (receipt.previous.init ? 'cleaned-existing' : 'retained-unrelated');
  const operationId = randomUUID();
  const journal = {
    transactionId: receipt.transactionId,
    operationId,
    backupDir: targets.backupDir,
    runtimeBindingSha256: runtimeBindingSha256(config),
    parentGuard: receipt.parentGuard,
    moduleSnapshot: rollbackModule,
    initSnapshot: rollbackInit,
    moduleSnapshotMetadata,
    initSnapshotMetadata,
    moduleSnapshotSha256: sha256ManagedFile(rollbackModule, { root: targets.backupDir }),
    initSnapshotSha256: sha256ManagedFile(rollbackInit, { root: targets.backupDir }),
    initDisposition,
    nextInitSha256: initDisposition === 'removed-created' ? null : createHash('sha256').update(nextInit).digest('hex'),
    moduleRemovedPath: path.join(targets.backupDir, `rolled-back-yuri-voxkey-${operationId}.lua`),
    initRemovedPath: path.join(targets.backupDir, `rolled-back-created-init-${operationId}.lua`),
    runtimeMoves: runtimeQuarantinePlan(config, targets.backupDir, 'rolled-back'),
  };
  for (const move of journal.runtimeMoves) {
    if (entryExists(move.to)) throw new Error(`rollback quarantine target already exists: ${move.to}`);
  }
  writeRollbackJournal(journalPath, journal, 'prepared');
  let runtimeMoves = [];
  try {
    if (initDisposition === 'removed-created') {
      durableRename(targets.init, journal.initRemovedPath, { parentGuard: receipt.parentGuard, paths: runtimePaths(config) });
    } else {
      atomicWrite(targets.init, nextInit, initSnapshotMetadata.mode, {
        metadata: initSnapshotMetadata,
        parentGuard: receipt.parentGuard,
        paths: runtimePaths(config),
      });
    }
    writeRollbackJournal(journalPath, journal, 'init-applied');
    if (receipt.previous.module) {
      atomicWrite(targets.module, readManagedRegularFile(moduleBackup, { root: targets.backupDir }), receipt.previousMetadata.module.mode, {
        metadata: receipt.previousMetadata.module,
        parentGuard: receipt.parentGuard,
        paths: runtimePaths(config),
      });
    } else durableRename(targets.module, journal.moduleRemovedPath, { parentGuard: receipt.parentGuard, paths: runtimePaths(config) });
    writeRollbackJournal(journalPath, journal, 'module-applied');
    if (_testFaultAfterPhase === 'module-applied') throw new Error('injected rollback fault after module phase');
    runtimeMoves = quarantineRuntime(config, targets.backupDir, 'rolled-back', { parentGuard: receipt.parentGuard });
    writeRollbackJournal(journalPath, journal, 'runtime-quarantined');
    atomicWrite(rollbackResultPath, `${JSON.stringify({
      schemaVersion: 2,
      transactionId: receipt.transactionId,
      status: 'rolled-back-runtime-quarantined',
      initDisposition,
      completedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    writeRollbackJournal(journalPath, journal, 'completed');
    return { targets, runtimeMoves, initDisposition };
  } catch (error) {
    if (entryExists(rollbackResultPath)) {
      const abortedResult = path.join(targets.backupDir, `rollback-result-aborted-${operationId}.json`);
      if (entryExists(abortedResult)) throw new Error(`${error.message}; rollback result recovery target already exists`);
      durableRename(rollbackResultPath, abortedResult);
    }
    try { restoreRollbackFromJournal(config, receipt, { ...journal, journalPath }); }
    catch (restoreError) { throw new Error(`${error.message}; rollback recovery failed: ${restoreError.message}`); }
    throw error;
  }
}

function trackedChildPaths(transaction, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) throw new Error('tracked child token is invalid');
  const specPath = assertManagedPath(path.join(transaction.backupDir, `child-spec-${token}.json`), { root: transaction.backupDir });
  const statePath = assertManagedPath(path.join(transaction.backupDir, `child-state-${token}.json`), { root: transaction.backupDir });
  return { specPath, statePath };
}

function readProcessTable(testProcessTable = null) {
  if (typeof testProcessTable === 'function') return testProcessTable();
  if (Array.isArray(testProcessTable)) return testProcessTable;
  let output;
  try { output = runText('/bin/ps', ['-ax', '-o', 'pid=,pgid=,command=']); }
  catch (error) { throw new Error(`cannot prove process-group quiescence: ${error.message}`); }
  const rows = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), pgid: Number(match[2]), command: match[3] });
  }
  if (!rows.length) throw new Error('cannot prove process-group quiescence: process table was empty or unparseable');
  return rows;
}

function waitForProcessGroupExit(pgid, timeoutMs, testProcessTable = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!readProcessTable(testProcessTable).some((row) => row.pgid === pgid)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return !readProcessTable(testProcessTable).some((row) => row.pgid === pgid);
}

function processGroupExists(processGroupId) {
  try { process.kill(-processGroupId, 0); return true; }
  catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw new Error(`cannot prove tracked process-group state: ${error.message}`);
  }
}

function waitForOwnedProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupExists(processGroupId)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return !processGroupExists(processGroupId);
}

export function stopOwnedProcessGroup(processGroupId, {
  exists = processGroupExists,
  signal = (groupId, signalName) => process.kill(-groupId, signalName),
  wait = waitForOwnedProcessGroupExit,
} = {}) {
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) throw new Error('owned process-group id is invalid');
  if (!exists(processGroupId)) return false;
  try { signal(processGroupId, 'SIGTERM'); }
  catch (error) { if (error?.code !== 'ESRCH') throw new Error(`cannot stop tracked descendant group: ${error.message}`); }
  if (!wait(processGroupId, 750)) {
    try { signal(processGroupId, 'SIGKILL'); }
    catch (error) { if (error?.code !== 'ESRCH') throw new Error(`cannot kill tracked descendant group: ${error.message}`); }
    if (!wait(processGroupId, 750)) {
      throw new Error(`tracked child descendants did not quiesce: ${processGroupId}`);
    }
  }
  return true;
}

function readTrackedChildStates(lock) {
  const states = [];
  for (const entry of readdirSync(lock.backupDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^child-state-[0-9a-f-]{36}\.json$/i.test(entry.name)) continue;
    const statePath = assertManagedPath(path.join(lock.backupDir, entry.name), { root: lock.backupDir });
    const state = readManagedJson(statePath, { root: lock.backupDir });
    if (state.schemaVersion !== 1 || state.transactionId !== lock.transactionId
      || state.operationToken !== lock.token || state.statePath !== statePath
      || !Number.isInteger(state.processGroupId) || state.processGroupId <= 0
      || !Number.isInteger(state.supervisorPid) || state.supervisorPid <= 0
      || !state.supervisorStartToken) {
      throw new Error(`tracked child state is invalid: ${statePath}`);
    }
    states.push(state);
  }
  return states;
}

function stopTrackedDescendants(lock, { testProcessTable = null, testProcessStartTokens = null } = {}) {
  for (const state of readTrackedChildStates(lock)) {
    let rows = readProcessTable(testProcessTable).filter((row) => row.pgid === state.processGroupId);
    if (!rows.length) continue;
    const liveSupervisorToken = processStartToken(state.supervisorPid, testProcessStartTokens);
    if (liveSupervisorToken === null) throw new Error(`cannot prove tracked supervisor identity: ${state.supervisorPid}`);
    if (liveSupervisorToken && !processStartTokensMatch(state.supervisorStartToken, liveSupervisorToken)) {
      throw new Error(`tracked child process-group leader PID was reused: ${state.supervisorPid}`);
    }
    const expectedExecutable = path.basename(state.command || '');
    if (!rows.some((row) => row.pid === state.supervisorPid || (expectedExecutable && row.command.includes(expectedExecutable)))) {
      throw new Error(`tracked child process group identity cannot be proven: ${state.processGroupId}`);
    }
    try { process.kill(-state.processGroupId, 'SIGTERM'); }
    catch (error) { if (error?.code !== 'ESRCH') throw new Error(`cannot stop tracked child process group: ${error.message}`); }
    if (!waitForProcessGroupExit(state.processGroupId, 750, testProcessTable)) {
      try { process.kill(-state.processGroupId, 'SIGKILL'); }
      catch (error) { if (error?.code !== 'ESRCH') throw new Error(`cannot kill tracked child process group: ${error.message}`); }
      if (!waitForProcessGroupExit(state.processGroupId, 750, testProcessTable)) {
        throw new Error(`tracked child process group did not stop: ${state.processGroupId}`);
      }
    }
    rows = readProcessTable(testProcessTable).filter((row) => row.pgid === state.processGroupId);
    if (rows.length) throw new Error(`tracked child descendants remain live: ${state.processGroupId}`);
  }
}

export function runTrackedChecked(command, args, options, label, { config, lock, transaction }) {
  const current = readOperationLock(config);
  if (current.token !== lock.token || current.transactionId !== transaction.transactionId) {
    throw new Error('tracked child launch lost operation-lock ownership');
  }
  assertTransactionEnvironment(options?.env, config, transaction);
  const token = randomUUID();
  const { specPath, statePath } = trackedChildPaths(transaction, token);
  const spec = {
    schemaVersion: 1,
    transactionId: transaction.transactionId,
    operationToken: lock.token,
    token,
    backupDir: transaction.backupDir,
    specPath,
    statePath,
    command: assertManagedPath(command, { allowLeafSymlink: true }),
    args: args.map(String),
    cwd: options?.cwd ? assertManagedPath(options.cwd) : '',
    label,
  };
  atomicWrite(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const result = spawnSync(process.execPath, [SELF_PATH, '__run-tracked', '--child-spec', specPath], {
    env: options?.env,
    stdio: options?.stdio || 'inherit',
    encoding: options?.encoding,
    detached: true,
  });
  if (result.error) throw new Error(`${label} supervisor failed to start: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} supervisor terminated by signal ${result.signal}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}`);
  const state = readManagedJson(statePath, { root: transaction.backupDir });
  if (state.status !== 'completed' || state.exitCode !== 0 || state.transactionId !== transaction.transactionId) {
    throw new Error(`${label} tracked child completion proof is invalid`);
  }
  return result;
}

async function runTrackedChild(specPath) {
  const safeSpecPath = assertManagedPath(specPath);
  const spec = readManagedJson(safeSpecPath);
  if (spec.schemaVersion !== 1 || spec.specPath !== safeSpecPath || !/^[0-9a-f-]{36}$/i.test(String(spec.token || ''))) {
    throw new Error('tracked child specification is invalid');
  }
  if (assertManagedPath(spec.statePath, { root: spec.backupDir }) !== spec.statePath
    || assertManagedPath(spec.specPath, { root: spec.backupDir }) !== spec.specPath) {
    throw new Error('tracked child specification path binding failed');
  }
  // The supervisor is detached from the controller. The workload is detached
  // once more below so its group can be proved/killed without ever signaling
  // this supervisor or the controller itself.
  const baseState = {
    schemaVersion: 1,
    transactionId: spec.transactionId,
    operationToken: spec.operationToken,
    token: spec.token,
    statePath: spec.statePath,
    specPath: spec.specPath,
    command: spec.command,
    args: spec.args,
    supervisorPid: process.pid,
    supervisorStartToken: processStartToken(process.pid),
    processGroupId: process.pid,
    status: 'launching',
    startedAt: new Date().toISOString(),
  };
  atomicWrite(spec.statePath, `${JSON.stringify(baseState, null, 2)}\n`);
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd || undefined,
    env: process.env,
    stdio: 'inherit',
    detached: true,
  });
  if (!Number.isInteger(child.pid) || child.pid <= 0) throw new Error(`${spec.label} did not publish a child PID`);
  const runningState = {
    ...baseState,
    childPid: child.pid,
    processGroupId: child.pid,
    processGroupLeaderStartToken: processStartToken(child.pid),
    status: 'running',
  };
  atomicWrite(spec.statePath, `${JSON.stringify(runningState, null, 2)}\n`);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => {
      let descendantError = '';
      try {
        if (stopOwnedProcessGroup(child.pid)) {
          descendantError = 'tracked child left live descendants after its direct process exited';
        }
      } catch (error) {
        descendantError = error.message;
      }
      const finalState = {
        ...baseState,
        childPid: child.pid,
        processGroupId: child.pid,
        processGroupLeaderStartToken: processStartToken(child.pid),
        status: exitCode === 0 && !signal && !descendantError ? 'completed' : 'failed',
        exitCode,
        signal: signal || null,
        descendantQuiescence: descendantError ? 'failed' : 'proven',
        descendantError: descendantError || null,
        completedAt: new Date().toISOString(),
      };
      atomicWrite(spec.statePath, `${JSON.stringify(finalState, null, 2)}\n`);
      if (exitCode === 0 && !signal && !descendantError) resolve();
      else reject(new Error(descendantError || `${spec.label} exited ${signal || exitCode}`));
    });
  });
}

function createPinnedSourceSnapshot(source, config, transaction, lock, environment) {
  const archivePath = assertManagedPath(path.join(transaction.backupDir, 'pinned-source.tar'), { root: transaction.backupDir });
  const snapshotRoot = assertManagedPath(path.join(transaction.backupDir, 'pinned-source'), { root: transaction.backupDir });
  if (entryExists(archivePath) || entryExists(snapshotRoot)) throw new Error('pinned source snapshot already exists');
  runTrackedChecked(commandPath('git'), ['-C', source.source, 'archive', '--format=tar', `--output=${archivePath}`, source.commit], {
    encoding: 'utf8',
    env: environment,
    stdio: 'inherit',
  }, 'pinned source archive', { config, lock, transaction });
  if (!entryExists(archivePath) || !lstatSync(archivePath).isFile()) throw new Error('pinned source archive was not created as a regular file');
  mkdirSync(snapshotRoot, { recursive: false, mode: 0o700 });
  runTrackedChecked('/usr/bin/tar', ['-xf', archivePath, '-C', snapshotRoot], {
    encoding: 'utf8', env: environment, stdio: 'inherit',
  }, 'pinned source extraction', { config, lock, transaction });
  const hashes = {};
  for (const [relativePath, expected] of Object.entries(config.upstream.files)) {
    const file = assertManagedPath(path.join(snapshotRoot, relativePath), { root: snapshotRoot });
    if (!entryExists(file) || !lstatSync(file).isFile()) throw new Error(`pinned source snapshot file is missing or non-regular: ${relativePath}`);
    hashes[relativePath] = sha256ManagedFile(file, { root: snapshotRoot });
    if (hashes[relativePath] !== expected) throw new Error(`pinned source snapshot hash mismatch: ${relativePath}`);
  }
  const installScript = assertManagedPath(path.join(snapshotRoot, 'install.sh'), { root: snapshotRoot });
  if ((lstatSync(installScript).mode & 0o111) === 0) throw new Error('pinned source snapshot installer is not executable');
  atomicWrite(path.join(transaction.backupDir, 'pinned-source.json'), `${JSON.stringify({
    schemaVersion: 1,
    commit: source.commit,
    tree: source.tree,
    archiveSha256: sha256ManagedFile(archivePath, { root: transaction.backupDir }),
    hashes,
    snapshotRoot,
  }, null, 2)}\n`);
  return { ...source, source: snapshotRoot, originalSource: source.source };
}

function promoteStagedRuntime(config, transaction, lock, stage, source, python, environment) {
  const paths = runtimePaths(config);
  let parentGuard = transaction.parentGuard;
  assertParentIdentityGuard(paths, parentGuard);
  if (!entryExists(stage.stageDataRoot) || !lstatSync(stage.stageDataRoot).isDirectory()) throw new Error('staged VoxKey data root is missing');
  if (!entryExists(stage.stageCommand) || !lstatSync(stage.stageCommand).isSymbolicLink()) throw new Error('staged VoxKey command is missing or not a symlink');
  const stagedCommandTarget = assertManagedPath(path.resolve(path.dirname(stage.stageCommand), readlinkSync(stage.stageCommand)), { root: stage.stageDataRoot });
  if (!entryExists(stagedCommandTarget) || !lstatSync(stagedCommandTarget).isFile()) throw new Error('staged VoxKey command target is invalid');
  writeStagingOwnershipMarker(stage.stageDataRoot, transaction, 'promotion-prepared');
  fsyncManagedTree(stage.stageDataRoot);
  fsyncDirectory(stage.stageDataHome);
  fsyncDirectory(stage.stageRoot);
  updateTransaction(transaction, 'runtime-promotion-prepared');
  updateOperationLock(config, lock, 'runtime-promotion-prepared', { stageRoot: stage.stageRoot });
  if (entryExists(paths.dataRoot) || entryExists(paths.command)) throw new Error('live VoxKey runtime appeared during staged install');
  mkdirSync(paths.dataHome, { recursive: true, mode: 0o700 });
  assertManagedPath(paths.dataHome);
  assertManagedPath(paths.dataRoot);
  durableRename(stage.stageDataRoot, paths.dataRoot, { parentGuard, paths });
  transaction.parentGuard = extendParentIdentityGuard(paths, parentGuard, [
    paths.dataRoot,
    path.join(paths.dataRoot, 'venv'),
    path.join(paths.dataRoot, 'models'),
  ]);
  parentGuard = transaction.parentGuard;
  updateOperationLock(config, lock, 'runtime-promoted-parent-bound', { parentGuard: transaction.parentGuard });
  updateTransaction(transaction, 'runtime-promoted-parent-bound');
  writeStagingOwnershipMarker(paths.dataRoot, transaction, 'promoted-repairing', { parentGuard, paths });
  updateTransaction(transaction, 'runtime-promoted-repairing');

  const venvRoot = assertManagedPath(path.join(paths.dataRoot, 'venv'), { root: paths.dataRoot });
  const finalPython = assertManagedPath(path.join(venvRoot, 'bin/python'), { root: venvRoot, allowLeafSymlink: true });
  if (!entryExists(finalPython) || realpathSync(finalPython) !== realpathSync(python)) {
    throw new Error('promoted virtualenv Python does not resolve to the approved Python 3.10 runtime');
  }
  const finalEnvironment = buildTransactionEnvironment(stage, python, {
    dataHome: paths.dataHome,
    transactionId: transaction.transactionId,
  });
  runTrackedChecked(finalPython, ['-m', 'venv', '--upgrade', venvRoot], {
    env: finalEnvironment, stdio: 'inherit',
  }, 'virtualenv relocation repair', { config, lock, transaction });
  runTrackedChecked(finalPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-build-isolation', '--no-deps', '--upgrade', source.source], {
    env: finalEnvironment,
    stdio: 'inherit',
  }, 'VoxKey entrypoint relocation repair', { config, lock, transaction });

  const modelRoot = assertManagedPath(expandHome(config.runtime.modelRoot), { root: paths.dataRoot, allowLeafSymlink: true });
  const modelTarget = assertManagedPath(path.join(path.dirname(modelRoot), config.model.name), { root: paths.dataRoot });
  if (!entryExists(modelTarget) || !lstatSync(modelTarget).isDirectory()) throw new Error('promoted VoxKey model target is missing');
  if (!entryExists(modelRoot) || !lstatSync(modelRoot).isSymbolicLink()) throw new Error('promoted VoxKey model alias is not a symlink');
  const stagedModelLink = assertManagedPath(path.join(transaction.backupDir, 'staged-model-link'), { root: transaction.backupDir, allowLeafSymlink: true });
  durableRename(modelRoot, stagedModelLink, { parentGuard, paths });
  assertParentIdentityGuard(paths, parentGuard);
  symlinkSync(modelTarget, modelRoot);
  assertParentIdentityGuard(paths, parentGuard);
  if (realpathSync(modelRoot) !== realpathSync(modelTarget)) throw new Error('promoted VoxKey model alias repair failed');

  const finalVoxKey = assertManagedPath(path.join(venvRoot, 'bin/voxkey'), { root: venvRoot });
  if (!entryExists(finalVoxKey) || !lstatSync(finalVoxKey).isFile()) throw new Error('repaired VoxKey entrypoint is missing');
  mkdirSync(path.dirname(paths.command), { recursive: true, mode: 0o700 });
  assertManagedPath(path.dirname(paths.command));
  const stagedLiveCommand = assertManagedPath(path.join(path.dirname(paths.command), `.voxkey-${transaction.transactionId}.tmp`), { allowLeafSymlink: true });
  if (entryExists(stagedLiveCommand)) throw new Error('live command promotion candidate already exists');
  assertParentIdentityGuard(paths, parentGuard);
  symlinkSync(finalVoxKey, stagedLiveCommand);
  assertParentIdentityGuard(paths, parentGuard);
  durableRename(stagedLiveCommand, paths.command, { parentGuard, paths });
  runTrackedChecked(paths.command, ['doctor'], {
    env: finalEnvironment, encoding: 'utf8', stdio: 'inherit',
  }, 'promoted VoxKey runtime doctor', { config, lock, transaction });
  writeStagingOwnershipMarker(paths.dataRoot, transaction, 'promoted-verified', { parentGuard, paths });
  fsyncManagedTree(paths.dataRoot);
  fsyncDirectory(paths.dataHome);
  updateTransaction(transaction, 'runtime-promoted-verified');
  return inspectRuntimeFingerprint(config, transaction.transactionId, { createMarker: true, parentGuard });
}

export function installRuntime(sourcePath, config, { capacityCleared = false } = {}) {
  if (!capacityCleared) throw new Error('capacity clearance is required before runtime installation');
  const paths = runtimePaths(config);
  const transaction = createTransaction(config);
  let lock;
  try { lock = acquireOperationLock(config, 'install', transaction.transactionId); }
  catch (error) {
    updateTransaction(transaction, 'lock-not-acquired', error.message);
    throw error;
  }
  let projection;
  try {
    transaction.parentGuard = captureParentIdentityGuard(paths);
    transaction.stableParentGuard = transaction.parentGuard;
    updateOperationLock(config, lock, 'mutation-parents-bound', { parentGuard: transaction.parentGuard });
    updateTransaction(transaction, 'mutation-parents-bound');
    if (entryExists(paths.receiptPath)) throw new Error(`install receipt already exists: ${paths.receiptPath}`);
    if (entryExists(paths.command) || entryExists(paths.dataRoot)) {
      throw new Error('an unowned VoxKey runtime already exists; quarantine or adopt it through a separate reviewed operation');
    }
    const source = verifyPinnedSource(sourcePath, config);
    if (!source.ok) throw new Error(`pinned source verification failed: ${source.errors.join('; ')}`);
    const doctor = inspectVoxKeyRuntime({ config, preinstall: true, sourcePath });
    if (!doctor.ok) throw new Error(`preinstall doctor failed: ${doctor.checks.filter((item) => item.status === 'fail').map((item) => item.id).join(', ')}`);
    const python = pythonCandidate();
    const stage = prepareStaging(transaction);
    const environment = buildTransactionEnvironment(stage, python, {
      dataHome: stage.stageDataHome,
      transactionId: transaction.transactionId,
    });
    const installSource = createPinnedSourceSnapshot(source, config, transaction, lock, environment);
    updateTransaction(transaction, 'runtime-installing-staged');
    updateOperationLock(config, lock, 'runtime-installing-staged', { stageRoot: stage.stageRoot, sourceRoot: installSource.source });
    runTrackedChecked(path.join(installSource.source, 'install.sh'), ['--no-hammerspoon'], {
      cwd: installSource.source,
      env: environment,
      stdio: 'inherit',
    }, 'staged upstream installer', { config, lock, transaction });
    if (entryExists(paths.command) || entryExists(paths.dataRoot)) throw new Error('staged installer mutated a canonical live runtime path');
    const runtimeFingerprint = promoteStagedRuntime(config, transaction, lock, stage, installSource, python, environment);
    projection = installHammerspoonProjection(config, transaction);
    const receipt = {
      schemaVersion: 2,
      runtimeBindingSha256: runtimeBindingSha256(config),
      installedAt: new Date().toISOString(),
      transactionId: transaction.transactionId,
      upstream: { commit: source.commit, tree: source.tree },
      privacy: { formatter: 'disabled', autoSubmit: false, history: 'disabled', contextCapture: 'disabled' },
      command: paths.command,
      dataRoot: paths.dataRoot,
      module: projection.moduleTarget,
      moduleSha256: projection.moduleSha256,
      moduleBeforeSha256: projection.moduleBeforeSha256,
      init: projection.initTarget,
      initAfterSha256: projection.initAfterSha256,
      initBeforeSha256: projection.initBeforeSha256,
      managedAppendSha256: projection.managedAppendSha256,
      backupDir: projection.backupDir,
      previous: projection.previous,
      previousMetadata: projection.previousMetadata,
      parentGuard: transaction.stableParentGuard,
      requireAdded: projection.requireAdded,
      runtimeCreated: true,
      runtimeFingerprint,
      systemHotkeyRollback: config.hotkey.observedBeforeIntegration,
      activation: 'pending-hammerspoon-reload-tcc-and-assignability-proof',
    };
    validateInstallReceipt(config, receipt);
    atomicWrite(paths.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o600, {
      parentGuard: projection.parentGuard,
      paths,
    });
    updateTransaction(transaction, 'installed-pending-activation');
    releaseOperationLock(config, lock, 'installed');
    return { receiptPath: paths.receiptPath, receipt };
  } catch (error) {
    const cleanupErrors = [];
    try { restoreProjectionAfterInstallFailure(projection); } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    try {
      if (entryExists(paths.command) || entryExists(paths.dataRoot)) {
        assertInterruptedRuntimeOwnership(config, transaction.transactionId);
        quarantineRuntime(config, transaction.backupDir, 'failed-install', { parentGuard: transaction.parentGuard });
      }
    } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    try {
      if (entryExists(paths.receiptPath)) {
        const failedReceipt = path.join(transaction.backupDir, 'failed-install-receipt.json');
        if (entryExists(failedReceipt)) throw new Error('failed-install receipt quarantine already exists');
        durableRename(paths.receiptPath, failedReceipt);
      }
    } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    try { updateTransaction(transaction, 'failed-quarantined', error.message); } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    if (!cleanupErrors.length) {
      try { releaseOperationLock(config, lock, 'failed-clean'); } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    }
    const suffix = cleanupErrors.length ? `; cleanup warnings: ${cleanupErrors.join('; ')}` : '';
    throw new Error(`${error.message}${suffix}`);
  }
}

function rollbackProjection(config, { hammerspoonUnbound = false } = {}) {
  const { receiptPath } = runtimePaths(config);
  if (!entryExists(receiptPath)) throw new Error(`no install receipt: ${receiptPath}`);
  const receipt = readManagedJson(receiptPath);
  validateInstallReceipt(config, receipt);
  const lock = acquireOperationLock(config, 'rollback', receipt.transactionId);
  const rolledBack = assertManagedPath(`${receiptPath}.rolled-back-${timestamp()}`);
  updateOperationLock(config, lock, 'rollback-prepared', { rolledBackReceipt: rolledBack, parentGuard: receipt.parentGuard });
  try {
    assertRollbackQuiescent(config, { hammerspoonUnbound });
    const result = rollbackInstalledProjection(config, receipt, { quiescenceProved: true });
    const transaction = {
      transactionId: receipt.transactionId,
      backupDir: result.targets.backupDir,
      paths: runtimePaths(config),
      runtimeBindingSha256: runtimeBindingSha256(config),
      parentGuard: receipt.parentGuard,
    };
    updateTransaction(transaction, 'rolled-back-runtime-quarantined');
    durableRename(receiptPath, rolledBack, { parentGuard: receipt.parentGuard, paths: runtimePaths(config) });
    releaseOperationLock(config, lock, `rolled-back-${lock.token.slice(0, 8)}`);
    return {
      rolledBack,
      runtimeQuarantined: true,
      quarantineDirectory: result.targets.backupDir,
      initDisposition: result.initDisposition,
      systemHotkeyRollback: receipt.systemHotkeyRollback,
    };
  } catch (error) {
    let safeToRelease = false;
    try {
      const journal = readRollbackJournal(config, receipt.transactionId);
      safeToRelease = !journal || journal.status === 'recovered-live-state';
    } catch {
      safeToRelease = false;
    }
    if (safeToRelease) {
      try { releaseOperationLock(config, lock, `rollback-failed-${lock.token.slice(0, 8)}`); }
      catch (releaseError) { throw new Error(`${error.message}; operation-lock release failed: ${releaseError.message}`); }
    }
    throw error;
  }
}

function assertInterruptedRuntimeOwnership(config, transactionId) {
  const paths = runtimePaths(config);
  if (entryExists(paths.dataRoot) && !stageMarkerMatches(paths.dataRoot, transactionId)) {
    throw new Error('interrupted live data root lacks the matching transaction marker');
  }
  if (entryExists(paths.command)) {
    if (!lstatSync(paths.command).isSymbolicLink()) throw new Error('interrupted live command is not the controller-owned symlink type');
    const target = path.resolve(path.dirname(paths.command), readlinkSync(paths.command));
    const relative = path.relative(paths.dataRoot, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('interrupted live command does not target the transaction data root');
    }
  }
  return true;
}

function verifyCompletedInstallForRecovery(config, lock, receipt) {
  const paths = runtimePaths(config);
  validateInstallReceipt(config, receipt);
  if (receipt.transactionId !== lock.transactionId) throw new Error('install receipt does not belong to the interrupted transaction');
  verifyRuntimeFingerprint(config, receipt.transactionId, receipt.runtimeFingerprint);
  if (sha256ManagedFile(paths.moduleTarget) !== receipt.moduleSha256) throw new Error('completed install module changed before recovery');
  if (sha256ManagedFile(paths.initTarget) !== receipt.initAfterSha256) throw new Error('completed install init changed before recovery');
  return true;
}

function assertOperationOwnerStopped(config, lock, { testProcessTable = null, testProcessStartTokens = null } = {}) {
  if (!lock.owner?.startToken || !Number.isInteger(lock.owner?.pid)) throw new Error('operation lock owner identity is invalid');
  const ownerStartToken = processStartToken(lock.owner.pid, testProcessStartTokens);
  if (ownerStartToken === null) throw new Error('cannot prove the interrupted controller process identity');
  if (processStartTokensMatch(lock.owner.startToken, ownerStartToken)) {
    throw new Error(`operation-lock owner PID ${lock.owner.pid} with matching start identity is still live`);
  }
  stopTrackedDescendants(lock, { testProcessTable, testProcessStartTokens });
  const paths = [lock.backupDir, lock.sourceRoot, lock.stageRoot, runtimePaths(config).dataRoot]
    .filter(Boolean)
    .map((item) => String(item).replaceAll('\\', '/'));
  const conflicts = readProcessTable(testProcessTable).filter((row) => row.pid !== process.pid
    && paths.some((managedPath) => row.command.replaceAll('\\', '/').includes(managedPath)));
  if (conflicts.length) throw new Error('untracked transaction descendant remains live; refusing recovery');
  return true;
}

export function recoverInterruptedOperation(config, {
  hammerspoonUnbound = false,
  _testProcessTable = null,
  _testOwnerProcessTable = null,
  _testProcessStartTokens = null,
} = {}) {
  const observedLock = readOperationLock(config);
  const claim = acquireRecoveryClaim(config, observedLock);
  const lock = claim.lock;
  let claimReleased = false;
  try {
    assertOperationOwnerStopped(config, lock, {
      testProcessTable: _testOwnerProcessTable,
      testProcessStartTokens: _testProcessStartTokens,
    });
    assertRollbackQuiescent(config, { hammerspoonUnbound, _testProcessTable });
    const transactionPath = assertManagedPath(path.join(lock.backupDir, 'transaction.json'), { root: lock.backupDir });
    if (!entryExists(transactionPath)) throw new Error('interrupted operation transaction record is missing');
    const transactionRecord = readManagedJson(transactionPath, { root: lock.backupDir });
    if (transactionRecord.schemaVersion !== 2 || transactionRecord.transactionId !== lock.transactionId) {
      throw new Error('interrupted transaction record identity mismatch');
    }
    if (transactionRecord.runtimeBindingSha256 !== runtimeBindingSha256(config)) {
      throw new Error('interrupted transaction runtime binding mismatch');
    }
    const paths = runtimePaths(config);
    let parentGuard = lock.parentGuard || transactionRecord.parentGuard;
    if (!parentGuard) {
      const projectionPath = path.join(lock.backupDir, 'projection-plan.json');
      if (entryExists(paths.receiptPath) || entryExists(paths.command) || entryExists(paths.dataRoot) || entryExists(projectionPath)) {
        throw new Error('interrupted mutation lacks its parent identity guard');
      }
      parentGuard = captureParentIdentityGuard(paths);
    }
    assertParentIdentityGuard(paths, parentGuard);
    if (lock.parentGuard && transactionRecord.parentGuard
      && JSON.stringify(lock.parentGuard) !== JSON.stringify(transactionRecord.parentGuard)) {
      throw new Error('interrupted parent identity guards disagree');
    }
    const transaction = {
      transactionId: lock.transactionId,
      backupDir: lock.backupDir,
      paths,
      runtimeBindingSha256: runtimeBindingSha256(config),
      parentGuard,
    };
    const finalize = (status, result) => {
      assertRecoveryClaimCurrent(config, claim);
      const archivedLock = releaseOperationLock(config, lock, status);
      const archivedClaim = releaseRecoveryClaim(claim, status);
      claimReleased = true;
      return { ...result, archivedLock, archivedClaim };
    };

    if (lock.operation === 'install') {
      if (entryExists(paths.receiptPath)) {
        const receipt = readManagedJson(paths.receiptPath);
        verifyCompletedInstallForRecovery(config, lock, receipt);
        assertRecoveryClaimCurrent(config, claim);
        updateTransaction(transaction, 'installed-recovered-lock');
        return finalize(`install-recovered-${lock.token.slice(0, 8)}`, {
          operation: 'install', disposition: 'completed-install-finalized',
        });
      }
      const projection = projectionStateFromJournal(config, lock.transactionId);
      assertRecoveryClaimCurrent(config, claim);
      if (projection) restoreProjectionAfterInstallFailure(projection);
      assertInterruptedRuntimeOwnership(config, lock.transactionId);
      const label = `recovered-install-${lock.token.slice(0, 8)}`;
      const runtimeMoves = quarantineRuntime(config, lock.backupDir, label, { parentGuard });
      updateTransaction(transaction, 'interrupted-install-recovered-quarantined');
      return finalize(`install-recovered-${lock.token.slice(0, 8)}`, {
        operation: 'install', disposition: 'partial-install-quarantined', runtimeMoves,
      });
    }

    const rolledBackReceipt = lock.rolledBackReceipt
      ? assertManagedPath(lock.rolledBackReceipt)
      : assertManagedPath(`${paths.receiptPath}.rolled-back-recovered-${lock.token.slice(0, 8)}`);
    const liveReceiptExists = entryExists(paths.receiptPath);
    const archivedReceiptExists = entryExists(rolledBackReceipt);
    if (liveReceiptExists && archivedReceiptExists) throw new Error('rollback recovery found both live and archived receipts');
    if (!liveReceiptExists && !archivedReceiptExists) throw new Error('rollback recovery cannot find its install receipt');
    const receiptPath = liveReceiptExists ? paths.receiptPath : rolledBackReceipt;
    const receipt = readManagedJson(receiptPath);
    validateInstallReceipt(config, receipt);
    if (receipt.transactionId !== lock.transactionId) throw new Error('rollback recovery receipt transaction mismatch');
    const resultPath = assertManagedPath(path.join(lock.backupDir, 'rollback-result.json'), { root: lock.backupDir });
    if (entryExists(resultPath)) {
      verifyCompletedRollback(config, receipt, validateInstallReceipt(config, receipt), readManagedJson(resultPath, { root: lock.backupDir }));
      assertRecoveryClaimCurrent(config, claim);
      if (liveReceiptExists) durableRename(paths.receiptPath, rolledBackReceipt, { parentGuard, paths });
      updateTransaction(transaction, 'rolled-back-recovered-lock');
      return finalize(`rollback-recovered-${lock.token.slice(0, 8)}`, {
        operation: 'rollback', disposition: 'completed-rollback-finalized', rolledBackReceipt,
      });
    }
    const journal = readRollbackJournal(config, lock.transactionId);
    assertRecoveryClaimCurrent(config, claim);
    if (journal) restoreRollbackFromJournal(config, receipt, journal);
    updateTransaction(transaction, 'interrupted-rollback-recovered-live-state');
    return finalize(`rollback-recovered-${lock.token.slice(0, 8)}`, {
      operation: 'rollback', disposition: journal ? 'live-state-restored' : 'no-live-mutation-observed',
    });
  } catch (error) {
    if (!claimReleased && entryExists(claim.claimPath)) {
      try { releaseRecoveryClaim(claim, 'failed'); }
      catch (claimError) { throw new Error(`${error.message}; recovery-claim release failed: ${claimError.message}`); }
    }
    throw error;
  }
}

function parseArgs(argv) {
  const values = { command: argv[0] || 'doctor', json: argv.includes('--json'), approved: argv.includes('--approve-runtime-mutation'), capacityCleared: argv.includes('--capacity-cleared'), hammerspoonUnbound: argv.includes('--confirm-hammerspoon-unbound'), preinstall: argv.includes('--preinstall'), source: '' };
  const sourceIndex = argv.indexOf('--source');
  if (sourceIndex >= 0) values.source = argv[sourceIndex + 1] || '';
  return values;
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '__run-tracked') {
    const specIndex = argv.indexOf('--child-spec');
    if (specIndex < 0 || !argv[specIndex + 1]) throw new Error('tracked child mode requires --child-spec');
    await runTrackedChild(argv[specIndex + 1]);
    return;
  }
  const args = parseArgs(argv);
  const config = loadVoxKeyConfig();
  let result;
  if (args.command === 'plan') result = buildVoxKeyPlan(config);
  else if (args.command === 'doctor') result = inspectVoxKeyRuntime({ config, preinstall: args.preinstall, sourcePath: args.source });
  else if (args.command === 'verify-source') {
    if (!args.source) throw new Error('verify-source requires --source PATH');
    result = verifyPinnedSource(args.source, config);
  } else if (args.command === 'install') {
    if (!args.approved) throw new Error('install requires --approve-runtime-mutation');
    if (!args.source) throw new Error('install requires --source PATH');
    result = installRuntime(args.source, config, { capacityCleared: args.capacityCleared });
  } else if (args.command === 'rollback') {
    if (!args.approved) throw new Error('rollback requires --approve-runtime-mutation');
    result = rollbackProjection(config, { hammerspoonUnbound: args.hammerspoonUnbound });
  } else if (args.command === 'recover') {
    if (!args.approved) throw new Error('recover requires --approve-runtime-mutation');
    result = recoverInterruptedOperation(config, { hammerspoonUnbound: args.hammerspoonUnbound });
  } else {
    throw new Error('usage: voxkey-control.mjs plan | doctor [--preinstall] [--source PATH] | verify-source --source PATH | install --source PATH --approve-runtime-mutation --capacity-cleared | rollback|recover --approve-runtime-mutation --confirm-hammerspoon-unbound');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.ok === false) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`voxkey-control: ${error.message}\n`);
    process.exitCode = 1;
  }
}
