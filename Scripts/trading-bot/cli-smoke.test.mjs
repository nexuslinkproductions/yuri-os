#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const scripts = Object.entries(pkg.scripts)
  .filter(([name]) => name.startsWith('trading-bot:'));

assert.ok(scripts.length > 0, 'expected trading-bot scripts');

for (const [name, command] of scripts) {
  const match = command.match(/^node\s+(\S+)/);
  assert.ok(match, `${name} should be a node script`);
  const file = match[1];
  assert.equal(existsSync(file), true, `${name} target exists: ${file}`);
  const result = spawnSync(process.execPath, [file, '--dry-run'], { encoding: 'utf-8' });
  assert.equal(result.status, 0, `${name} exits cleanly in dry-run: ${result.stderr || result.stdout}`);
}

console.log(`cli-smoke.test: ok (${scripts.length} scripts)`);
