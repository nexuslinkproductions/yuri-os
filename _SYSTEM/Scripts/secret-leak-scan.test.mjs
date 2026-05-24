import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCANNER = path.join(REPO_ROOT, '_SYSTEM/Scripts/secret-leak-scan.mjs');

test('history mode flags masked secrets from removed non-protected files', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'yuri-secret-history-'));
  try {
    execFileSync('git', ['init'], { cwd: tmp, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@yuri.local'], { cwd: tmp });
    execFileSync('git', ['config', 'user.name', 'YURI Test'], { cwd: tmp });

    const secret = `sk-${'A'.repeat(32)}`;
    writeFileSync(path.join(tmp, 'notes.md'), `token=${secret}\n`);
    execFileSync('git', ['add', 'notes.md'], { cwd: tmp });
    execFileSync('git', ['commit', '-m', 'add historical secret'], { cwd: tmp, stdio: 'ignore' });

    writeFileSync(path.join(tmp, 'notes.md'), 'token removed\n');
    execFileSync('git', ['add', 'notes.md'], { cwd: tmp });
    execFileSync('git', ['commit', '-m', 'remove secret'], { cwd: tmp, stdio: 'ignore' });

    const result = spawnSync(process.execPath, [SCANNER, '--history'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.history.findings.length >= 1);
    assert.equal(parsed.history.findings[0].file, 'notes.md');
    assert.match(parsed.history.findings[0].value, /^sk-A\.\.\.AAAA \(\d+\)$/);
    assert.equal(parsed.history.findings[0].value.includes(secret), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
