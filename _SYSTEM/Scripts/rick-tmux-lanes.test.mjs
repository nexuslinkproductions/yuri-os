#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, '_SYSTEM/Scripts/rick-tmux-lanes.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-tmux-lanes-'));
const binDir = path.join(tempRoot, 'bin');
const logPath = path.join(tempRoot, 'tmux.log');

try {
  fs.mkdirSync(binDir, { recursive: true });
  const tmuxStub = path.join(binDir, 'tmux');
  fs.writeFileSync(tmuxStub, `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${logPath}"
case "$1" in
  -V) echo "tmux 3.4";;
  has-session) exit 0;;
  display-message)
    printf '2.1.153\\n${REPO_ROOT}\\nQuantum Rick\\n'
    ;;
  capture-pane)
    printf 'captured pane text\\n'
    ;;
  set-buffer|paste-buffer|send-keys)
    exit 0
    ;;
  *)
    echo "unexpected tmux args: $*" >&2
    exit 2
    ;;
esac
`);
  fs.chmodSync(tmuxStub, 0o755);

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ''}` };

  const status = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'status'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  }));
  assert.equal(status.ok, true);
  assert.equal(status.session, 'yuri-ricks');
  assert.equal(status.lanes.quantum.target, 'yuri-ricks:0.0');
  assert.equal(status.lanes.prime.target, 'yuri-ricks:0.1');

  const capture = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'capture', 'qtrk', '--lines', '80'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  }));
  assert.equal(capture.ok, true);
  assert.equal(capture.lane, 'quantum');
  assert.equal(capture.text, 'captured pane text\n');

  const primeCapture = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'capture', 'Rick Prime', '--lines', '80'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  }));
  assert.equal(primeCapture.ok, true);
  assert.equal(primeCapture.lane, 'prime');
  assert.equal(primeCapture.target, 'yuri-ricks:0.1');

  const dryRun = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'feed', 'prime', '--prompt', 'bounded packet'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  }));
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.dryRun, true);

  const executed = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'feed', 'prime', '--prompt', 'bounded packet', '--execute'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  }));
  assert.equal(executed.ok, true);
  assert.equal(executed.dryRun, false);

  const log = fs.readFileSync(logPath, 'utf8');
  assert.match(log, /paste-buffer -t yuri-ricks:0\.1/);
  assert.match(log, /send-keys -t yuri-ricks:0\.1 Enter/);

  process.stdout.write('rick-tmux-lanes: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
