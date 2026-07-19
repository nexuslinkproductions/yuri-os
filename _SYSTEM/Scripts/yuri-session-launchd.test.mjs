#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  BACKEND_SERVER_ARTIFACT_PATH,
  BACKEND_SERVER_ARTIFACT_SHA256,
  CANONICAL_HOME,
  CANONICAL_UID,
  CONFIG_PATH,
  GUARD_PATH,
  LABEL,
  LAUNCHCTL_TIMEOUT_MS,
  NODE_BINARY,
  RUNTIME_LOG_MAX_BYTES,
  RUNTIME_LOG_RETAIN_BYTES,
  RUNTIME_LOG_ROLLOVER_BYTES,
  buildRunSpec,
  capRuntimeLogs,
  createBoundedRuntimeLogSink,
  install,
  renderPlist,
  run,
} from './yuri-session-launchd.mjs';

const LAUNCHD_MODULE_URL = new URL('./yuri-session-launchd.mjs', import.meta.url);
const SERVER_BYTES = Buffer.from('export const enrolledFixture = true;\n');
const SERVER_SHA256 = crypto.createHash('sha256').update(SERVER_BYTES).digest('hex');
const SERVER_FD = 910_001;
const FIXTURE_ARTIFACT_OPTIONS = Object.freeze({
  fixtureBackendServerSha256: SERVER_SHA256,
  allowFixtureArtifactPin: true,
});

function virtualConfigAdapter(configPresent, options = {}) {
  const configStatus = {
    dev: 1,
    ino: 10,
    mode: 0o100600,
    nlink: 1,
    size: 2,
    mtimeMs: 1,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
  const serverStatus = {
    dev: 2,
    ino: 20,
    mode: options.serverMode ?? 0o100600,
    nlink: 1,
    size: SERVER_BYTES.length,
    mtimeMs: 2,
    isFile: () => options.serverRegular !== false,
    isSymbolicLink: () => options.serverSymlink === true,
  };
  const serverPresent = options.serverPresent ?? true;
  return {
    existsSync(candidate) {
      if (candidate === CONFIG_PATH) return configPresent;
      if (candidate === BACKEND_SERVER_ARTIFACT_PATH) return serverPresent;
      return fs.existsSync(candidate);
    },
    lstatSync(candidate) {
      if (candidate === CONFIG_PATH) return configStatus;
      if (candidate === BACKEND_SERVER_ARTIFACT_PATH) return serverStatus;
      return fs.lstatSync(candidate);
    },
    statSync(candidate) {
      if (candidate === CONFIG_PATH) return configStatus;
      if (candidate === BACKEND_SERVER_ARTIFACT_PATH) return serverStatus;
      return fs.statSync(candidate);
    },
    realpathSync(candidate) {
      if (candidate === CONFIG_PATH || candidate === BACKEND_SERVER_ARTIFACT_PATH) return candidate;
      return fs.realpathSync.native(candidate);
    },
    openSync(candidate, flags, mode) {
      if (candidate === BACKEND_SERVER_ARTIFACT_PATH) return SERVER_FD;
      return fs.openSync(candidate, flags, mode);
    },
    fstatSync(fd) {
      if (fd === SERVER_FD) return serverStatus;
      return fs.fstatSync(fd);
    },
    readFileSync(candidate, encoding) {
      if (candidate === SERVER_FD || candidate === BACKEND_SERVER_ARTIFACT_PATH) {
        return encoding ? SERVER_BYTES.toString(encoding) : Buffer.from(SERVER_BYTES);
      }
      return fs.readFileSync(candidate, encoding);
    },
    closeSync(fd) {
      if (fd !== SERVER_FD) fs.closeSync(fd);
    },
    accessSync(candidate, mode) {
      return fs.accessSync(candidate, mode);
    },
  };
}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }

  kill(signal) {
    this.kills.push(signal);
    return true;
  }

  exit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

test('plist uses the fixed log wrapper and sanitized environment without secret material', () => {
  const plist = renderPlist(virtualConfigAdapter(true), FIXTURE_ARTIFACT_OPTIONS);
  assert.match(plist, new RegExp(LABEL.replaceAll('.', '\\.')));
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /yuri-session-launchd\.mjs/);
  assert.match(plist, new RegExp(NODE_BINARY.replaceAll('/', '\\/')));
  assert.match(plist, /YURI_SESSION_RUNTIME_ENABLED/);
  assert.equal((plist.match(/<string>\/dev\/null<\/string>/g) ?? []).length, 2);
  assert.doesNotMatch(plist, /yuri-session-runtime\.(?:out|err)\.log/);
  assert.doesNotMatch(plist, /YURI_SESSION_RUNTIME_COMMAND/);
  assert.doesNotMatch(plist, /passphrase|password|secret|keychain/i);
});

test('canonical launchd home ignores a hostile inherited HOME', () => {
  const attackerHome = '/private/tmp/yuri-hostile-home';
  const source = [
    `import { CANONICAL_HOME } from ${JSON.stringify(LAUNCHD_MODULE_URL.href)};`,
    'process.stdout.write(CANONICAL_HOME);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    env: {
      HOME: attackerHome,
      LANG: 'C',
      LC_ALL: 'C',
      LOGNAME: os.userInfo().username,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      USER: os.userInfo().username,
    },
    killSignal: 'SIGKILL',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, CANONICAL_HOME);
  assert.equal(result.stdout, os.userInfo().homedir);
  assert.notEqual(result.stdout, attackerHome);
});

test('missing fixed backend-volume config fails closed before any process can spawn', () => {
  let spawnCalls = 0;
  assert.throws(
    () => run({
      fsAdapter: virtualConfigAdapter(false),
      spawnImpl() {
        spawnCalls += 1;
        throw new Error('spawn must not be reached');
      },
      signalSource: new EventEmitter(),
      logger: { log() {}, error() {} },
      capLogsImpl: () => ({ capped: false }),
      logSinkFactory: () => ({ write() { return { droppedBytes: 0 }; }, close() {} }),
    }),
    (error) => error?.code === 'RUNTIME_CONFIG_MISSING' && error.message.includes(CONFIG_PATH),
  );
  assert.equal(spawnCalls, 0);
});

test('run spec is one exact guard-to-Node/server chain with no package or shell wrapper', () => {
  const spec = buildRunSpec(virtualConfigAdapter(true), FIXTURE_ARTIFACT_OPTIONS);
  assert.equal(spec.executable, NODE_BINARY);
  assert.deepEqual(spec.args, [
    GUARD_PATH,
    'supervise',
    '--config', CONFIG_PATH,
    '--',
    NODE_BINARY,
    BACKEND_SERVER_ARTIFACT_PATH,
  ]);
  assert.equal(spec.serverArtifact.path, BACKEND_SERVER_ARTIFACT_PATH);
  assert.equal(spec.serverArtifact.sha256, SERVER_SHA256);
  const rendered = spec.args.join(' ');
  assert.doesNotMatch(rendered, /(?:^|\s)(?:npm|npx|pm2|ts-node|sh|bash|zsh)(?:\s|$)/u);
  assert.equal(spec.args.length, 7);
});

test('prebuilt artifact absence, missing enrollment, digest drift, and identity drift are typed failures', () => {
  assert.equal(BACKEND_SERVER_ARTIFACT_SHA256, null);
  assert.throws(
    () => buildRunSpec(virtualConfigAdapter(true), {
      fixtureBackendServerSha256: SERVER_SHA256,
    }),
    (error) => error.code === 'FIXTURE_ARTIFACT_OVERRIDE_FORBIDDEN',
  );
  assert.throws(
    () => buildRunSpec(
      virtualConfigAdapter(true, { serverPresent: false }),
      FIXTURE_ARTIFACT_OPTIONS,
    ),
    (error) => error.code === 'BACKEND_BUILD_ARTIFACT_MISSING',
  );
  assert.throws(
    () => buildRunSpec(virtualConfigAdapter(true)),
    (error) => error.code === 'BACKEND_BUILD_ARTIFACT_PIN_MISSING',
  );
  assert.throws(
    () => buildRunSpec(virtualConfigAdapter(true), {
      fixtureBackendServerSha256: '0'.repeat(64),
      allowFixtureArtifactPin: true,
    }),
    (error) => error.code === 'BACKEND_BUILD_ARTIFACT_DIGEST_MISMATCH',
  );
  assert.throws(
    () => buildRunSpec(
      virtualConfigAdapter(true, { serverSymlink: true }),
      FIXTURE_ARTIFACT_OPTIONS,
    ),
    (error) => error.code === 'BACKEND_BUILD_ARTIFACT_INVALID',
  );

  const base = virtualConfigAdapter(true);
  let artifactFstats = 0;
  const drifting = {
    ...base,
    fstatSync(fd) {
      const result = base.fstatSync(fd);
      if (fd !== SERVER_FD) return result;
      artifactFstats += 1;
      return artifactFstats === 1 ? result : { ...result, mtimeMs: result.mtimeMs + 1 };
    },
  };
  assert.throws(
    () => buildRunSpec(drifting, FIXTURE_ARTIFACT_OPTIONS),
    (error) => error.code === 'BACKEND_BUILD_ARTIFACT_INVALID',
  );
});

test('artifact hashing uses the no-follow opened descriptor, never a second pathname read', () => {
  const base = virtualConfigAdapter(true);
  const reads = [];
  const adapter = {
    ...base,
    readFileSync(candidate, encoding) {
      reads.push(candidate);
      return base.readFileSync(candidate, encoding);
    },
  };
  const spec = buildRunSpec(adapter, FIXTURE_ARTIFACT_OPTIONS);
  assert.equal(spec.serverArtifact.sha256, SERVER_SHA256);
  assert.deepEqual(reads, [SERVER_FD]);
});

test('launchd source contains no package-manager, shell, cleanup, or PATH-lookup writer hop', () => {
  const source = fs.readFileSync(new URL('./yuri-session-launchd.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "'npm'",
    'npm-cli.js',
    'ts-node',
    'pm2',
    'start-clean',
    'YURI_SESSION_RUNTIME_COMMAND',
    'YURI_SESSION_RUNTIME_NPM',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /CANONICAL_NODE_BINARY/u);
  assert.match(source, /CANONICAL_BACKEND_SERVER_ARTIFACT/u);
});

test('install validates the complete run spec before any directory, plist, or launchctl mutation', () => {
  let directoryWrites = 0;
  let plistWrites = 0;
  let launchctlCalls = 0;
  const adapter = {
    ...virtualConfigAdapter(false),
    mkdirSync() { directoryWrites += 1; },
    writeFileSync() { plistWrites += 1; },
  };
  assert.throws(
    () => install({
      fsAdapter: adapter,
      platform: 'darwin',
      spawnSyncImpl() {
        launchctlCalls += 1;
        return { status: 0 };
      },
      logger: { log() {}, error() {} },
    }),
    (error) => error?.code === 'RUNTIME_CONFIG_MISSING',
  );
  assert.equal(directoryWrites, 0);
  assert.equal(plistWrites, 0);
  assert.equal(launchctlCalls, 0);
});

test('launchctl administrative calls use bounded execution and a closed account environment', () => {
  const calls = [];
  const adapter = {
    ...virtualConfigAdapter(true),
    mkdirSync() {},
    writeFileSync() {},
  };
  install({
    fsAdapter: adapter,
    platform: 'darwin',
    ...FIXTURE_ARTIFACT_OPTIONS,
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    logger: { log() {}, error() {} },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ args }) => args[0]), ['enable', 'bootstrap']);
  for (const { command, args, options } of calls) {
    assert.equal(command, '/bin/launchctl');
    assert.equal(args.join(' ').includes(`gui/${CANONICAL_UID}`), true);
    assert.equal(options.timeout, LAUNCHCTL_TIMEOUT_MS);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.stdio, 'inherit');
    assert.deepEqual(Object.keys(options.env).sort(), [
      'HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'USER',
    ]);
    assert.equal(options.env.HOME, CANONICAL_HOME);
    assert.equal(options.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
    assert.equal('NODE_OPTIONS' in options.env, false);
    assert.equal('NODE_PATH' in options.env, false);
  }
});

test('launchctl execution errors fail closed without retrying an administrative mutation', () => {
  let calls = 0;
  const adapter = {
    ...virtualConfigAdapter(true),
    mkdirSync() {},
    writeFileSync() {},
  };
  assert.throws(
    () => install({
      fsAdapter: adapter,
      platform: 'darwin',
      ...FIXTURE_ARTIFACT_OPTIONS,
      spawnSyncImpl() {
        calls += 1;
        return { error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), status: null };
      },
      logger: { log() {}, error() {} },
    }),
    (error) => error?.code === 'LAUNCHCTL_EXEC_FAILED',
  );
  assert.equal(calls, 1);
});

test('run ignores environment command/config overrides and forwards shutdown signals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-launchd-override-'));
  const fakeNpm = path.join(root, 'npm');
  const marker = path.join(root, 'fake-npm-ran');
  const prior = new Map([
    ['PATH', process.env.PATH],
    ['YURI_SESSION_RUNTIME_COMMAND', process.env.YURI_SESSION_RUNTIME_COMMAND],
    ['YURI_SESSION_RUNTIME_CONFIG', process.env.YURI_SESSION_RUNTIME_CONFIG],
    ['YURI_SESSION_RUNTIME_NPM', process.env.YURI_SESSION_RUNTIME_NPM],
  ]);
  try {
    fs.writeFileSync(fakeNpm, `#!/bin/sh\nprintf ran > '${marker}'\n`, { mode: 0o700 });
    process.env.PATH = root;
    process.env.YURI_SESSION_RUNTIME_COMMAND = fakeNpm;
    process.env.YURI_SESSION_RUNTIME_CONFIG = path.join(root, 'attacker-config.json');
    process.env.YURI_SESSION_RUNTIME_NPM = fakeNpm;

    const child = new FakeChild();
    const signalSource = new EventEmitter();
    let captured = null;
    const launched = run({
      fsAdapter: virtualConfigAdapter(true),
      ...FIXTURE_ARTIFACT_OPTIONS,
      spawnImpl(executable, args, options) {
        captured = { executable, args, options };
        signalSource.emit('SIGHUP');
        return child;
      },
      signalSource,
      logger: { log() {}, error() {} },
      capLogsImpl: () => ({ capped: false }),
      logSinkFactory: () => ({ write() { return { droppedBytes: 0 }; }, close() {} }),
    });
    assert.equal(captured.executable, NODE_BINARY);
    assert.deepEqual(captured.args, [
      GUARD_PATH,
      'supervise',
      '--config', CONFIG_PATH,
      '--',
      NODE_BINARY,
      BACKEND_SERVER_ARTIFACT_PATH,
    ]);
    assert.equal(captured.options.cwd, '/Users/marcelspatz/YURI-OS-MUSUBI');
    assert.equal(captured.options.env.PATH.includes(root), false);
    assert.equal(
      captured.options.env.PATH,
      `${path.dirname(NODE_BINARY)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    );
    assert.equal('YURI_SESSION_RUNTIME_COMMAND' in captured.options.env, false);
    assert.equal('YURI_SESSION_RUNTIME_CONFIG' in captured.options.env, false);
    assert.equal('YURI_SESSION_RUNTIME_NPM' in captured.options.env, false);
    assert.equal(fs.existsSync(marker), false, 'fake npm override must never execute');

    assert.equal(launched.firstSignal, 'SIGHUP');
    assert.deepEqual(child.kills, ['SIGHUP'], 'pre-spawn signal must be forwarded once after spawn');
    signalSource.emit('SIGTERM');
    assert.deepEqual(child.kills, ['SIGHUP'], 'only the first shutdown signal may be forwarded');
    child.exit(0, null);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      assert.equal(signalSource.listenerCount(signal), 0);
    }
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exact enrolled Node/server targets reject symlink, nonregular, nonexec, and mode-022 identities', () => {
  const cases = [
    ['symlink', {
      lstatSync(candidate) {
        if (candidate === NODE_BINARY) return { isSymbolicLink: () => true };
        return virtualConfigAdapter(true).lstatSync(candidate);
      },
    }, /must not be a symlink/],
    ['nonregular', {
      statSync(candidate) {
        if (candidate === BACKEND_SERVER_ARTIFACT_PATH) {
          return { mode: 0o40755, nlink: 1, isFile: () => false };
        }
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /not a regular file/],
    ['nonexec', {
      statSync(candidate) {
        if (candidate === NODE_BINARY) {
          return { mode: 0o100644, nlink: 1, isFile: () => true };
        }
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /not executable/],
    ['writable', {
      statSync(candidate) {
        if (candidate === BACKEND_SERVER_ARTIFACT_PATH) {
          return { mode: 0o100777, nlink: 1, isFile: () => true };
        }
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /group\/world writable/],
  ];
  for (const [label, overrides, pattern] of cases) {
    const adapter = { ...virtualConfigAdapter(true), ...overrides };
    assert.throws(
      () => buildRunSpec(adapter, FIXTURE_ARTIFACT_OPTIONS),
      pattern,
      label,
    );
  }
});

test('fixed config rejects symlink and mode-022 identities before spawn', () => {
  const base = virtualConfigAdapter(true);
  const symlink = {
    ...base,
    lstatSync(candidate) {
      if (candidate === CONFIG_PATH) return { isSymbolicLink: () => true };
      return base.lstatSync(candidate);
    },
  };
  assert.throws(
    () => buildRunSpec(symlink, FIXTURE_ARTIFACT_OPTIONS),
    /must not be a symlink/,
  );

  const writable = {
    ...base,
    statSync(candidate) {
      if (candidate === CONFIG_PATH) {
        return { mode: 0o100622, nlink: 1, isFile: () => true };
      }
      return base.statSync(candidate);
    },
  };
  assert.throws(
    () => buildRunSpec(writable, FIXTURE_ARTIFACT_OPTIONS),
    /group\/world writable/,
  );
});

test('runtime log cap atomically preserves the newest tail and the original mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-runtime-log-cap-'));
  const out = path.join(root, 'runtime.out.log');
  const err = path.join(root, 'runtime.err.log');
  try {
    fs.writeFileSync(out, 'abcdefghij', { mode: 0o600 });
    fs.writeFileSync(err, '12345', { mode: 0o600 });
    const result = capRuntimeLogs({ logPaths: [out, err], maxBytes: 10, retainBytes: 4 });
    assert.equal(result.capped, true);
    assert.equal(result.beforeBytes, 15);
    assert.equal(result.afterBytes, 9);
    assert.equal(fs.readFileSync(out, 'utf8'), 'ghij');
    assert.equal(fs.readFileSync(err, 'utf8'), '12345');
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(root).some((name) => name.includes('.trim-')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounded runtime sink shares one exact ceiling across stdout and stderr', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-runtime-log-sink-'));
  const out = path.join(root, 'runtime.out.log');
  const err = path.join(root, 'runtime.err.log');
  try {
    fs.writeFileSync(out, 'abcdef', { mode: 0o600 });
    fs.writeFileSync(err, '1234', { mode: 0o600 });
    const sink = createBoundedRuntimeLogSink({ logPaths: [out, err], maxBytes: 12 });
    assert.deepEqual(sink.write('stdout', 'XYZ'), { writtenBytes: 2, droppedBytes: 1, totalBytes: 12 });
    assert.deepEqual(sink.write('stderr', 'more'), { writtenBytes: 0, droppedBytes: 4, totalBytes: 12 });
    assert.equal(sink.totalBytes, 12);
    assert.equal(sink.droppedBytes, 5);
    sink.close();
    assert.equal(fs.readFileSync(out, 'utf8'), 'abcdefXY');
    assert.equal(fs.readFileSync(err, 'utf8'), '1234');
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    assert.equal(fs.statSync(err).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run compacts before spawn and stops a noisy child exactly once at the shared ceiling', () => {
  const events = [];
  const child = new FakeChild();
  let sinkWrites = 0;
  const launched = run({
    fsAdapter: virtualConfigAdapter(true),
    ...FIXTURE_ARTIFACT_OPTIONS,
    capLogsImpl(options) {
      events.push(`cap:${options.maxBytes}`);
      return { capped: true, beforeBytes: RUNTIME_LOG_MAX_BYTES, afterBytes: RUNTIME_LOG_RETAIN_BYTES };
    },
    logSinkFactory(options) {
      events.push(`sink:${options.maxBytes}`);
      return {
        write() {
          sinkWrites += 1;
          return { droppedBytes: sinkWrites > 1 ? 1 : 0 };
        },
        close() { events.push('close'); },
      };
    },
    spawnImpl() {
      events.push('spawn');
      return child;
    },
    signalSource: new EventEmitter(),
    logger: { log() {}, error() {} },
  });
  assert.deepEqual(events.slice(0, 3), [
    `cap:${RUNTIME_LOG_ROLLOVER_BYTES}`,
    `sink:${RUNTIME_LOG_ROLLOVER_BYTES}`,
    'spawn',
  ]);
  child.stdout.write('first-overflow');
  child.stderr.write('second-overflow');
  assert.deepEqual(child.kills, ['SIGTERM']);
  child.exit(0, null);
  assert.equal(launched.child, child);
  assert.equal(events.includes('close'), true);
});

test('runtime log write failure is contained and stops the child exactly once', () => {
  const child = new FakeChild();
  let writes = 0;
  const launched = run({
    fsAdapter: virtualConfigAdapter(true),
    ...FIXTURE_ARTIFACT_OPTIONS,
    capLogsImpl: () => ({ capped: false }),
    logSinkFactory: () => ({
      write() {
        writes += 1;
        if (writes > 1) throw new Error('injected ENOSPC');
        return { droppedBytes: 0 };
      },
      close() {},
    }),
    spawnImpl: () => child,
    signalSource: new EventEmitter(),
    logger: { log() {}, error() {} },
  });
  assert.doesNotThrow(() => child.stdout.write('first-failing-write'));
  assert.doesNotThrow(() => child.stderr.write('drained-after-failure'));
  assert.equal(launched.logWriteFailed, true);
  assert.deepEqual(child.kills, ['SIGTERM']);
  child.exit(0, null);
});
