#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DISCIPLINE_PREAMBLE,
  buildDispatchPlan,
  buildSymbolInventory,
  composePrompt,
  extractFalsifiers,
  extractNamedExportsFromSource,
  formatVerifyChecklist,
} from './nemotron-dispatch.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const script = path.join(repoRoot, '_SYSTEM', 'Scripts', 'nemotron-dispatch.mjs');
const tmpOut = path.join(os.tmpdir(), `nemotron-dispatch-test-${process.pid}.txt`);

function runCli(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NEMOTRON_DISPATCH_TEST: '1',
    },
  });
}

try {
  const sourceSymbols = extractNamedExportsFromSource(`
export const ZED = 1;
export function alpha() {}
export async function beta() {}
export class Gamma {}
export default function ignored() {}
export { nope };
  `);
  assert.deepEqual(sourceSymbols, ['Gamma', 'ZED', 'alpha', 'beta']);

  const inventory = buildSymbolInventory(['_SYSTEM/Scripts/lane-kernel.mjs']);
  assert.ok(inventory[0].symbols.includes('PROTECTED_SURFACE_PREFIXES'));
  assert.ok(inventory[0].symbols.includes('ROLE_TRUST_SURFACES'));
  assert.ok(inventory[0].line.includes('_SYSTEM/Scripts/lane-kernel.mjs ::'));

  for (const scaffold of [
    'SYMBOL GROUNDING',
    'NEW vs RESTATED',
    'TRACE BEFORE ASSERT',
    'PER-CLAIM TAG',
    'REASONING',
  ]) {
    assert.match(DISCIPLINE_PREAMBLE, new RegExp(scaffold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const dryRun = runCli([
    '--dry-run',
    '--task',
    'audit the energy gate',
    '--files',
    '_SYSTEM/Scripts/lane-kernel.mjs',
    '--out',
    tmpOut,
  ]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /NEMOTRON DISPATCH DRY RUN/);
  assert.match(dryRun.stdout, /SYMBOL INVENTORY:/);
  assert.match(dryRun.stdout, /PROTECTED_SURFACE_PREFIXES/);
  assert.match(dryRun.stdout, /ROLE_TRUST_SURFACES/);
  assert.match(dryRun.stdout, /TASK:\naudit the energy gate/);
  assert.match(dryRun.stdout, /WOULD DISPATCH:/);
  assert.match(dryRun.stdout, /LANE_FRESH=1/);
  assert.match(dryRun.stdout, /ai offload --model nvidia\/nemotron-3-ultra-550b-a55b/);
  assert.doesNotMatch(dryRun.stdout, /NEMOTRON OUTPUT - ADVISORY ONLY/);

  const missingFiles = runCli(['--dry-run', '--task', 'x']);
  assert.equal(missingFiles.status, 1);
  assert.match(missingFiles.stderr, /--files is required/);
  assert.doesNotMatch(missingFiles.stdout, /WOULD DISPATCH:/);

  const missingFile = runCli([
    '--dry-run',
    '--task',
    'x',
    '--files',
    '_SYSTEM/Scripts/does-not-exist.mjs',
  ]);
  assert.equal(missingFile.status, 1);
  assert.match(missingFile.stderr, /not found/);
  assert.doesNotMatch(missingFile.stdout, /WOULD DISPATCH:/);

  const messyResponse = `
Finding A
CONFIDENCE: medium
BASIS: cross-organ-inference
FALSIFIER: gateProposal never reads the checked state.

Some paragraph.
- Finding B
  confidence: low
  basis: speculative
  falsifier: local test proves the route is unreachable.
`;
  const falsifiers = extractFalsifiers(messyResponse);
  assert.equal(falsifiers.length, 2);
  assert.equal(falsifiers[0].falsifier, 'gateProposal never reads the checked state.');
  assert.equal(falsifiers[1].falsifier, 'local test proves the route is unreachable.');
  assert.match(formatVerifyChecklist(falsifiers), /1\. Finding A :: FALSIFIER:/);

  const largePrompt = composePrompt({
    symbolInventoryLines: ['fixture.mjs :: alpha'],
    handlesText: '',
    briefingText: '',
    taskText: 'x'.repeat(2500),
  });
  const largePlan = buildDispatchPlan(largePrompt, tmpOut);
  assert.equal(largePlan.large, true);
  assert.equal(largePlan.promptMode, 'OFFLOAD_PROMPT_TEXT');
  assert.equal(largePlan.env.LANE_FRESH, '1');
  assert.equal(largePlan.env.OFFLOAD_PROMPT_TEXT, largePrompt);
  // reasoning=max (owner policy 2026-06-05) lifts the runner maxTokens budget so a
  // 550B reasoning+tools run does not truncate mid-output (the observed cutoff root cause).
  assert.equal(largePlan.reasoning, 'max');
  assert.deepEqual(largePlan.args.slice(0, 2), ['-lc', 'exec "$1" offload --model "$2" --reasoning "$3" "$OFFLOAD_PROMPT_TEXT"']);
  assert.ok(largePlan.args.includes('max'));
  // explicit override flows through
  const xhighPlan = buildDispatchPlan(largePrompt, tmpOut, 'xhigh');
  assert.equal(xhighPlan.reasoning, 'xhigh');
  assert.ok(xhighPlan.args.includes('xhigh'));

  const noHandlesPrompt = composePrompt({
    symbolInventoryLines: ['fixture.mjs :: alpha'],
    handlesText: '',
    briefingText: '',
    taskText: 'task',
  });
  assert.match(noHandlesPrompt, /RELEVANT YURI CANONICAL TRUTH \(Track-A handles\):\n\(none provided\)/);
  assert.doesNotMatch(noHandlesPrompt, /Track-B|claude-auto-memory/i);
} finally {
  try {
    fs.unlinkSync(tmpOut);
  } catch {
    // Best-effort test cleanup in /tmp.
  }
}
