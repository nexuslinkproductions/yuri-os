#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI';
export const LABEL = 'com.yuri-os-musubi.yuri-session-runtime';
export const GUARD_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/backend-storage-guard.mjs');
export const CONFIG_PATH = path.join(REPO_ROOT, '_SYSTEM/state/backend-volume/config.json');
export const BACKEND_PREFIX = path.join(REPO_ROOT, '_SYSTEM/backend');
export const NODE_BINARY = '/opt/homebrew/Cellar/node/26.4.0/bin/node';
export const NPM_CLI = '/opt/homebrew/Cellar/node/26.4.0/libexec/lib/node_modules/npm/bin/npm-cli.js';

const HOME = os.homedir();
const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library/LaunchAgents');
const LOG_DIR = path.join(HOME, 'Library/Logs/YURI-OS-MUSUBI');
export const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
export const OUT_LOG = path.join(LOG_DIR, 'yuri-session-runtime.out.log');
export const ERR_LOG = path.join(LOG_DIR, 'yuri-session-runtime.err.log');
export const RUNTIME_LOG_MAX_BYTES = 50 * 1024 ** 3;
export const RUNTIME_LOG_ROLLOVER_BYTES = 48 * 1024 ** 3;
export const RUNTIME_LOG_RETAIN_BYTES = 1024 ** 3;
const WRAPPER_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-session-launchd.mjs');
const FORWARDED_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const LOG_COPY_BUFFER_BYTES = 8 * 1024 ** 2;
const NULL_DEVICE = '/dev/null';

function runtimeLogStatus(adapter, candidate) {
  if (!adapter.existsSync(candidate)) return null;
  const linkStatus = adapter.lstatSync(candidate);
  if (linkStatus?.isSymbolicLink?.() === true) {
    throw new Error(`runtime log must not be a symlink: ${candidate}`);
  }
  const status = adapter.statSync(candidate);
  if (status?.isFile?.() !== true) throw new Error(`runtime log is not a regular file: ${candidate}`);
  return { path: candidate, size: Number(status.size), mode: Number(status.mode) & 0o777 };
}

function writeAll(adapter, fd, buffer, length) {
  let offset = 0;
  while (offset < length) {
    const written = adapter.writeSync(fd, buffer, offset, length - offset);
    if (!Number.isInteger(written) || written <= 0) throw new Error('runtime log tail write made no progress');
    offset += written;
  }
}

export function trimLogTailAtomic(candidate, keepBytes, adapter = fs) {
  if (!Number.isSafeInteger(keepBytes) || keepBytes < 0) throw new Error('keepBytes must be a non-negative safe integer');
  const status = runtimeLogStatus(adapter, candidate);
  if (!status || status.size <= keepBytes) {
    return { path: candidate, trimmed: false, beforeBytes: status?.size ?? 0, afterBytes: status?.size ?? 0 };
  }

  const tempPath = `${candidate}.trim-${process.pid}-${Date.now()}.tmp`;
  const buffer = Buffer.allocUnsafe(LOG_COPY_BUFFER_BYTES);
  let sourceFd = null;
  let tempFd = null;
  try {
    sourceFd = adapter.openSync(candidate, 'r');
    tempFd = adapter.openSync(tempPath, 'wx', status.mode);
    let position = status.size - keepBytes;
    let remaining = keepBytes;
    while (remaining > 0) {
      const requested = Math.min(buffer.length, remaining);
      const read = adapter.readSync(sourceFd, buffer, 0, requested, position);
      if (!Number.isInteger(read) || read <= 0) throw new Error('runtime log tail read ended before the requested retention boundary');
      writeAll(adapter, tempFd, buffer, read);
      position += read;
      remaining -= read;
    }
    adapter.fchmodSync?.(tempFd, status.mode);
    adapter.fsyncSync(tempFd);
    adapter.closeSync(tempFd);
    tempFd = null;
    adapter.closeSync(sourceFd);
    sourceFd = null;
    if (!adapter.fchmodSync) adapter.chmodSync(tempPath, status.mode);
    adapter.renameSync(tempPath, candidate);
  } catch (error) {
    if (tempFd !== null) {
      try { adapter.closeSync(tempFd); } catch {}
    }
    if (sourceFd !== null) {
      try { adapter.closeSync(sourceFd); } catch {}
    }
    try {
      if (adapter.existsSync(tempPath)) adapter.unlinkSync(tempPath);
    } catch {}
    throw error;
  }
  return { path: candidate, trimmed: true, beforeBytes: status.size, afterBytes: keepBytes };
}

export function capRuntimeLogs(options = {}) {
  const adapter = options.fsAdapter ?? fs;
  const logPaths = options.logPaths ?? [OUT_LOG, ERR_LOG];
  const maxBytes = options.maxBytes ?? RUNTIME_LOG_MAX_BYTES;
  const retainBytes = options.retainBytes ?? RUNTIME_LOG_RETAIN_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive safe integer');
  if (!Number.isSafeInteger(retainBytes) || retainBytes < 0) throw new Error('retainBytes must be a non-negative safe integer');

  const files = logPaths
    .map((candidate) => runtimeLogStatus(adapter, candidate))
    .filter(Boolean)
    .sort((left, right) => right.size - left.size);
  const beforeBytes = files.reduce((sum, file) => sum + file.size, 0);
  let totalBytes = beforeBytes;
  const results = [];
  for (const file of files) {
    if (totalBytes < maxBytes) break;
    const bytesWithoutFile = totalBytes - file.size;
    const allowedForFile = Math.max(0, maxBytes - bytesWithoutFile);
    const keepBytes = Math.min(file.size, retainBytes, allowedForFile);
    const result = trimLogTailAtomic(file.path, keepBytes, adapter);
    totalBytes -= result.beforeBytes - result.afterBytes;
    results.push(result);
  }
  const afterBytes = logPaths
    .map((candidate) => runtimeLogStatus(adapter, candidate))
    .filter(Boolean)
    .reduce((sum, file) => sum + file.size, 0);
  if (afterBytes > maxBytes) throw new Error(`runtime logs remain above cap: ${afterBytes} > ${maxBytes}`);
  return {
    capped: results.some((result) => result.trimmed),
    beforeBytes,
    afterBytes,
    maxBytes,
    retained: results,
  };
}

function closeQuietly(adapter, fd) {
  if (fd === null || fd === undefined) return;
  try { adapter.closeSync(fd); } catch {}
}

function openBoundedLog(adapter, candidate) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_APPEND
    | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = adapter.openSync(candidate, flags, 0o600);
  try {
    const status = adapter.fstatSync(fd);
    if (status?.isFile?.() !== true) throw new Error(`runtime log is not a regular file: ${candidate}`);
    if ((Number(status.mode) & 0o022) !== 0) {
      throw new Error(`runtime log is group/world writable and is refused: ${candidate}`);
    }
    return { fd, path: candidate, size: Number(status.size) };
  } catch (error) {
    closeQuietly(adapter, fd);
    throw error;
  }
}

export function createBoundedRuntimeLogSink(options = {}) {
  const adapter = options.fsAdapter ?? fs;
  const logPaths = options.logPaths ?? [OUT_LOG, ERR_LOG];
  const maxBytes = options.maxBytes ?? RUNTIME_LOG_ROLLOVER_BYTES;
  if (logPaths.length !== 2) throw new Error('runtime log sink requires stdout and stderr paths');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive safe integer');
  for (const candidate of logPaths) adapter.mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });

  const opened = [];
  try {
    for (const candidate of logPaths) opened.push(openBoundedLog(adapter, candidate));
  } catch (error) {
    for (const entry of opened) closeQuietly(adapter, entry.fd);
    throw error;
  }

  let totalBytes = opened.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes > maxBytes) {
    for (const entry of opened) closeQuietly(adapter, entry.fd);
    throw new Error(`runtime logs exceed sink ceiling before open: ${totalBytes} > ${maxBytes}`);
  }
  let closed = false;
  let droppedBytes = 0;

  const write = (stream, value) => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    if (closed) return { writtenBytes: 0, droppedBytes: buffer.length, totalBytes };
    const target = stream === 'stderr' ? opened[1] : opened[0];
    const allowedBytes = Math.min(buffer.length, Math.max(0, maxBytes - totalBytes));
    if (allowedBytes > 0) writeAll(adapter, target.fd, buffer, allowedBytes);
    const dropped = buffer.length - allowedBytes;
    totalBytes += allowedBytes;
    droppedBytes += dropped;
    return { writtenBytes: allowedBytes, droppedBytes: dropped, totalBytes };
  };
  const close = () => {
    if (closed) return;
    closed = true;
    for (const entry of opened) closeQuietly(adapter, entry.fd);
  };
  return {
    write,
    close,
    get totalBytes() { return totalBytes; },
    get droppedBytes() { return droppedBytes; },
    get closed() { return closed; },
  };
}

function plistEscape(value) {
  // The wrapper is the sole runtime-log writer; launchd must never retain those descriptors.
  const renderedValue = value === OUT_LOG || value === ERR_LOG ? NULL_DEVICE : String(value);
  return renderedValue
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function realpath(adapter, candidate) {
  const resolver = adapter.realpathSync?.native ?? adapter.realpathSync;
  if (typeof resolver !== 'function') throw new Error('filesystem adapter has no realpath implementation');
  return resolver.call(adapter.realpathSync, candidate);
}

function validateExactFile(adapter, candidate, label, { executable = false, missingCode = null } = {}) {
  if (!adapter.existsSync(candidate)) {
    const error = new Error(`${label} is missing: ${candidate}`);
    if (missingCode) error.code = missingCode;
    throw error;
  }
  const linkStatus = adapter.lstatSync(candidate);
  if (linkStatus?.isSymbolicLink?.() === true) throw new Error(`${label} must not be a symlink`);
  const resolved = realpath(adapter, candidate);
  if (resolved !== candidate) throw new Error(`${label} must resolve to its exact enrolled path`);
  const status = adapter.statSync(resolved);
  if (status?.isFile?.() !== true) throw new Error(`${label} is not a regular file`);
  if ((Number(status.mode) & 0o022) !== 0) {
    throw new Error(`${label} is group/world writable and is refused`);
  }
  if (executable && (Number(status.mode) & 0o111) === 0) {
    throw new Error(`${label} is not executable`);
  }
  if (executable) adapter.accessSync(resolved, fs.constants.X_OK);
  return resolved;
}

export function validateEnrolledExecutable(candidate, label, adapter = fs) {
  return validateExactFile(adapter, candidate, label, { executable: true });
}

function requireFixedRuntimeFile(adapter, candidate, label) {
  return validateExactFile(adapter, candidate, label, {
    missingCode: label === 'backend volume config' ? 'RUNTIME_CONFIG_MISSING' : 'RUNTIME_FILE_MISSING',
  });
}

function sanitizedEnvironment(nodeBinary) {
  const safePath = Array.from(new Set([
    path.dirname(nodeBinary),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ])).join(path.delimiter);
  const username = os.userInfo().username;
  return {
    HOME,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    LOGNAME: username,
    PATH: safePath,
    USER: username,
    YURI_SESSION_RUNTIME_ENABLED: '1',
  };
}

export function buildRunSpec(adapter = fs) {
  requireFixedRuntimeFile(adapter, CONFIG_PATH, 'backend volume config');
  requireFixedRuntimeFile(adapter, GUARD_PATH, 'backend storage guard');
  const nodeBinary = validateEnrolledExecutable(NODE_BINARY, 'enrolled node', adapter);
  const npmCli = validateEnrolledExecutable(NPM_CLI, 'enrolled npm CLI', adapter);
  return Object.freeze({
    executable: nodeBinary,
    args: Object.freeze([
      GUARD_PATH,
      'supervise',
      '--config', CONFIG_PATH,
      '--',
      nodeBinary,
      npmCli,
      '--prefix', BACKEND_PREFIX,
      'run', 'dev',
    ]),
    cwd: REPO_ROOT,
    env: Object.freeze(sanitizedEnvironment(nodeBinary)),
    nodeBinary,
    npmCli,
  });
}

export function run(options = {}) {
  const adapter = options.fsAdapter ?? fs;
  const spawnImpl = options.spawnImpl ?? spawn;
  const signalSource = options.signalSource ?? process;
  const logger = options.logger ?? console;
  const capLogsImpl = options.capLogsImpl ?? capRuntimeLogs;
  capLogsImpl({ fsAdapter: adapter, maxBytes: RUNTIME_LOG_ROLLOVER_BYTES });
  const logSinkFactory = options.logSinkFactory ?? createBoundedRuntimeLogSink;
  const logSink = logSinkFactory({ fsAdapter: adapter, maxBytes: RUNTIME_LOG_ROLLOVER_BYTES });
  const log = (stream, message) => {
    const rendered = String(message);
    logSink.write(stream, `${rendered}\n`);
    if (stream === 'stderr') logger.error(rendered);
    else logger.log(rendered);
  };
  let spec;
  try {
    spec = buildRunSpec(adapter);
  } catch (error) {
    log('stderr', error instanceof Error ? error.stack || error.message : String(error));
    logSink.close();
    throw error;
  }
  log('stdout', `[yuri-session-launchd] launching guarded backend with ${spec.nodeBinary}`);
  let child = null;
  let settled = false;
  let firstSignal = null;
  let signalForwarded = false;
  let logLimitSignalSent = false;
  let logWriteFailed = false;
  const forwardLatchedSignal = () => {
    if (!child || !firstSignal || signalForwarded || settled) return;
    if (child.exitCode !== null || child.signalCode !== null) return;
    signalForwarded = true;
    try {
      child.kill(firstSignal);
    } catch (error) {
      log('stderr', `[yuri-session-launchd] failed to forward ${firstSignal}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const handlers = new Map(FORWARDED_SIGNALS.map((signal) => [signal, () => {
    if (settled || firstSignal) return;
    firstSignal = signal;
    forwardLatchedSignal();
  }]));
  const cleanup = () => {
    for (const [signal, handler] of handlers) signalSource.removeListener?.(signal, handler);
    child?.stdout?.removeAllListeners?.('data');
    child?.stderr?.removeAllListeners?.('data');
    logSink.close();
  };
  for (const [signal, handler] of handlers) signalSource.on?.(signal, handler);

  try {
    child = spawnImpl(spec.executable, spec.args, {
      cwd: spec.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spec.env,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
  const writeChildLog = (stream, chunk) => {
    if (logWriteFailed) return;
    let result;
    try {
      result = logSink.write(stream, chunk);
    } catch (error) {
      logWriteFailed = true;
      logSink.close();
      logger.error(`[yuri-session-launchd] runtime log write failed; stopping child: ${error instanceof Error ? error.message : String(error)}`);
      if (!logLimitSignalSent && !settled) {
        logLimitSignalSent = true;
        try { child.kill('SIGTERM'); } catch {}
      }
      return;
    }
    if (result.droppedBytes <= 0 || logLimitSignalSent || settled) return;
    logLimitSignalSent = true;
    logger.error(`[yuri-session-launchd] runtime log ceiling reached; stopping child for offline compaction`);
    try {
      child.kill('SIGTERM');
    } catch (error) {
      logger.error(`[yuri-session-launchd] failed to stop child at runtime log ceiling: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  child.stdout?.on?.('data', (chunk) => writeChildLog('stdout', chunk));
  child.stderr?.on?.('data', (chunk) => writeChildLog('stderr', chunk));
  forwardLatchedSignal();

  child.once('error', (error) => {
    if (settled) return;
    settled = true;
    log('stderr', `[yuri-session-launchd] guarded backend failed to start: ${error.message}`);
    cleanup();
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    if (settled) return;
    settled = true;
    if (signal) log('stderr', `[yuri-session-launchd] guarded backend stopped by signal ${signal}`);
    cleanup();
    process.exitCode = signal ? 1 : (code ?? 1);
  });
  return {
    child,
    cleanup,
    logSink,
    spec,
    get firstSignal() { return firstSignal; },
    get logWriteFailed() { return logWriteFailed; },
  };
}

export function renderPlist(adapter = fs) {
  const nodeBinary = validateEnrolledExecutable(NODE_BINARY, 'enrolled node', adapter);
  validateEnrolledExecutable(NPM_CLI, 'enrolled npm CLI', adapter);
  const env = sanitizedEnvironment(nodeBinary);
  const envXml = Object.entries(env)
    .map(([key, value]) => `\n    <key>${plistEscape(key)}</key>\n    <string>${plistEscape(value)}</string>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n  <dict>\n    <key>Label</key>\n    <string>${plistEscape(LABEL)}</string>\n    <key>RunAtLoad</key>\n    <true/>\n    <key>KeepAlive</key>\n    <true/>\n    <key>ThrottleInterval</key>\n    <integer>5</integer>\n    <key>Umask</key>\n    <integer>63</integer>\n    <key>ProgramArguments</key>\n    <array>\n      <string>${plistEscape(nodeBinary)}</string>\n      <string>${plistEscape(WRAPPER_PATH)}</string>\n      <string>run</string>\n    </array>\n    <key>WorkingDirectory</key>\n    <string>${plistEscape(REPO_ROOT)}</string>\n    <key>StandardOutPath</key>\n    <string>${plistEscape(OUT_LOG)}</string>\n    <key>StandardErrorPath</key>\n    <string>${plistEscape(ERR_LOG)}</string>\n    <key>EnvironmentVariables</key>\n    <dict>${envXml}\n    </dict>\n  </dict>\n</plist>\n`;
}

function launchctl(args, allowFailure = false, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('/bin/launchctl', args, { stdio: 'inherit' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`launchctl ${args.join(' ')} failed with code ${result.status ?? 1}`);
  }
  return result.status ?? 1;
}

function ensureDirs(adapter = fs) {
  adapter.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  adapter.mkdirSync(LOG_DIR, { recursive: true });
}

export function install(options = {}) {
  const adapter = options.fsAdapter ?? fs;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const logger = options.logger ?? console;
  if (platform !== 'darwin') throw new Error('launchd install is only supported on macOS');
  buildRunSpec(adapter);
  const plist = renderPlist(adapter);
  ensureDirs(adapter);
  adapter.writeFileSync(PLIST_PATH, plist, { encoding: 'utf8', mode: 0o600 });
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['enable', `gui/${uid}/${LABEL}`], true, spawnSyncImpl);
  try {
    launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH], false, spawnSyncImpl);
  } catch {
    launchctl(['remove', LABEL], true, spawnSyncImpl);
    launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH], false, spawnSyncImpl);
  }
  logger.log(`installed ${LABEL} -> ${PLIST_PATH}`);
}

function uninstall() {
  if (process.platform !== 'darwin') throw new Error('launchd uninstall is only supported on macOS');
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['disable', `gui/${uid}/${LABEL}`], true);
  launchctl(['remove', LABEL], true);
  if (fs.existsSync(PLIST_PATH)) fs.rmSync(PLIST_PATH);
  console.log(`removed ${LABEL}`);
}

function status() {
  if (process.platform !== 'darwin') throw new Error('launchd status is only supported on macOS');
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  return launchctl(['print', `gui/${uid}/${LABEL}`], true);
}

function restart() {
  if (process.platform !== 'darwin') throw new Error('launchd restart is only supported on macOS');
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['kickstart', '-k', `gui/${uid}/${LABEL}`]);
  console.log(`restarted ${LABEL}`);
}

function help() {
  console.log([
    'Usage:',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs install',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs uninstall',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs status',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs restart',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs print-plist',
    '  node _SYSTEM/Scripts/yuri-session-launchd.mjs run',
  ].join('\n'));
}

export function main(argv = process.argv.slice(2)) {
  const mode = argv[0] ?? 'help';
  switch (mode) {
    case 'install': install(); return 0;
    case 'uninstall': uninstall(); return 0;
    case 'status': return status();
    case 'restart': restart(); return 0;
    case 'print-plist': process.stdout.write(renderPlist()); return 0;
    case 'run': run(); return undefined;
    default: help(); return mode === 'help' ? 0 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const code = main();
    if (Number.isInteger(code)) process.exitCode = code;
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}
