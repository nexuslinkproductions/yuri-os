#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'codex-offload-runner.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-offload-runner-test-'));

try {
  const workspace = path.join(tempRoot, 'workspace');
  const artifacts = path.join(tempRoot, 'artifacts');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), '# isolated workspace\n');

  execFileSync(
    process.execPath,
    [script, '--dry-run', '--cd', workspace, '--artifact-dir', artifacts, 'isolation smoke'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NUDIMMUD_DB_PATH: path.join(tempRoot, 'sandbox-learning.db'),
      },
    },
  );
  const preview = JSON.parse(fs.readFileSync(path.join(artifacts, 'dry-run.json'), 'utf8'));
  assert.equal(preview.workspaceRoot, workspace, 'workspace root missing from preview');
  assert(preview.command.includes('--cd'), 'codex command should include --cd');
  assert.equal(preview.command[preview.command.indexOf('--cd') + 1], workspace, 'codex --cd should target isolated workspace');
  assert.equal(preview.env_redirects.NUDIMMUD_DB_PATH, path.join(tempRoot, 'sandbox-learning.db'), 'sandbox DB redirect should be visible');

  process.stdout.write('codex-offload-runner: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
