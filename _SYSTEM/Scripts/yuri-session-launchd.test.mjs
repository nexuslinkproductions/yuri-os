#!/usr/bin/env node

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  BACKEND_PREFIX,
  CONFIG_PATH,
  GUARD_PATH,
  LABEL,
  NODE_BINARY,
  NPM_CLI,
  buildRunSpec,
  install,
  run,
} from './yuri-session-launchd.mjs';

function virtualConfigAdapter(configPresent) {
  const virtualStatus = {
    mode: 0o100600,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
  return {
    existsSync(candidate) {
      return candidate === CONFIG_PATH ? configPresent : fs.existsSync(candidate);
    },
    lstatSync(candidate) {
      return candidate === CONFIG_PATH ? virtualStatus : fs.lstatSync(candidate);
    },
    statSync(candidate) {
      return candidate === CONFIG_PATH ? virtualStatus : fs.statSync(candidate);
    },
    realpathSync(candidate) {
      return candidate === CONFIG_PATH ? CONFIG_PATH : fs.realpathSync.native(candidate);
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

test('plist uses the fixed wrapper and sanitized environment without secret material', () => {
  const result = spawnSync(process.execPath, [
    '_SYSTEM/Scripts/yuri-session-launchd.mjs',
    'print-plist',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `print-plist should succeed: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, new RegExp(LABEL.replaceAll('.', '\\.')));
  assert.match(result.stdout, /KeepAlive/);
  assert.match(result.stdout, /yuri-session-launchd\.mjs/);
  assert.match(result.stdout, new RegExp(NODE_BINARY.replaceAll('/', '\\/')));
  assert.match(result.stdout, /YURI_SESSION_RUNTIME_ENABLED/);
  assert.doesNotMatch(result.stdout, /YURI_SESSION_RUNTIME_COMMAND/);
  assert.doesNotMatch(result.stdout, /passphrase|password|secret|keychain|backend-volume\/config\.json/i);
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
    }),
    (error) => error?.code === 'RUNTIME_CONFIG_MISSING' && error.message.includes(CONFIG_PATH),
  );
  assert.equal(spawnCalls, 0);
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

test('run ignores environment command/config/npm overrides and forwards shutdown signals', () => {
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
      spawnImpl(executable, args, options) {
        captured = { executable, args, options };
        signalSource.emit('SIGHUP');
        return child;
      },
      signalSource,
      logger: { log() {}, error() {} },
    });
    assert.equal(captured.executable, NODE_BINARY);
    assert.deepEqual(captured.args, [
      GUARD_PATH,
      'supervise',
      '--config', CONFIG_PATH,
      '--',
      NODE_BINARY,
      NPM_CLI,
      '--prefix', BACKEND_PREFIX,
      'run', 'dev',
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

test('exact enrolled Node/npm targets reject symlink, nonregular, nonexec, and mode-022 identities', () => {
  const cases = [
    ['symlink', {
      lstatSync(candidate) {
        if (candidate === NODE_BINARY) return { isSymbolicLink: () => true };
        return virtualConfigAdapter(true).lstatSync(candidate);
      },
    }, /must not be a symlink/],
    ['nonregular', {
      statSync(candidate) {
        if (candidate === NPM_CLI) return { mode: 0o40755, isFile: () => false };
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /not a regular file/],
    ['nonexec', {
      statSync(candidate) {
        if (candidate === NODE_BINARY) return { mode: 0o100644, isFile: () => true };
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /not executable/],
    ['writable', {
      statSync(candidate) {
        if (candidate === NPM_CLI) return { mode: 0o100777, isFile: () => true };
        return virtualConfigAdapter(true).statSync(candidate);
      },
    }, /group\/world writable/],
  ];
  for (const [label, overrides, pattern] of cases) {
    const adapter = { ...virtualConfigAdapter(true), ...overrides };
    assert.throws(() => buildRunSpec(adapter), pattern, label);
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
  assert.throws(() => buildRunSpec(symlink), /must not be a symlink/);

  const writable = {
    ...base,
    statSync(candidate) {
      if (candidate === CONFIG_PATH) return { mode: 0o100622, isFile: () => true };
      return base.statSync(candidate);
    },
  };
  assert.throws(() => buildRunSpec(writable), /group\/world writable/);
});
