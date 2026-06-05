#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildDispatchPlan,
  buildSymbolInventory,
  composePrompt,
  extractNamedExportsFromSource,
} from './kimi-dispatch.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const script = path.join(repoRoot, '_SYSTEM', 'Scripts', 'kimi-dispatch.mjs');
const tmpOut = path.join(os.tmpdir(), `kimi-dispatch-test-${process.pid}.txt`);

function runCli(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, KIMI_DISPATCH_TEST: '1' },
  });
}

try {
  assert.deepEqual(extractNamedExportsFromSource('export const ZED = 1;\nexport function alpha() {}'), ['ZED', 'alpha']);
  const inventory = buildSymbolInventory(['_SYSTEM/Scripts/lane-kernel.mjs']);
  assert.ok(inventory[0].symbols.includes('PROTECTED_SURFACE_PREFIXES'));

  const dryRun = runCli([
    '--dry-run',
    '--task',
    'audit context continuity',
    '--files',
    '_SYSTEM/Scripts/lane-kernel.mjs',
    '--out',
    tmpOut,
  ]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /KIMI DISPATCH DRY RUN/);
  assert.match(dryRun.stdout, /ai offload --model moonshotai\/kimi-k2\.6/);
  assert.match(dryRun.stdout, /--reasoning max/);

  const prompt = composePrompt({
    symbolInventoryLines: ['fixture.mjs :: alpha'],
    taskText: 'x'.repeat(2500),
  });
  const plan = buildDispatchPlan(prompt, tmpOut);
  assert.equal(plan.model, 'moonshotai/kimi-k2.6');
  assert.equal(plan.reasoning, 'max');
  assert.ok(plan.args.includes('moonshotai/kimi-k2.6'));
} finally {
  try {
    fs.unlinkSync(tmpOut);
  } catch {}
}
