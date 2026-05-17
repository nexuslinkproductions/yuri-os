#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['_SYSTEM/Scripts/yuri-session-launchd.mjs', 'print-plist'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.equal(result.status, 0, `print-plist should succeed: ${result.stderr || result.stdout}`);
assert.match(result.stdout, /com\.yuri\.yuri-session-runtime/, 'plist should use Yuri runtime launchd label');
assert.match(result.stdout, /KeepAlive/, 'plist should keep the backend runtime alive');
assert.match(result.stdout, /backend/, 'plist should launch the backend runtime');
assert.match(result.stdout, /YURI_SESSION_RUNTIME_ENABLED/, 'plist should enable the local session runtime');

process.stdout.write('yuri-session-launchd: pass\n');
