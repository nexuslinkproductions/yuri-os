// Hermetic tests for runFleet.mjs P7 ollama sidecar self-spawn (D-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOllamaSidecar } from '../Scripts/runFleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const SCOUT_TASK = {
  summary: 'bulk census',
  subtasks: [{ id: 'scout-1', role: 'scout', need: ['census'], prompt: 'scan repo', blastRadius: 'LOW' }],
};

test('buildOllamaSidecar: bulk scout role is eligible', async () => {
  const { planCompany } = await import('./company.mjs');
  const plan = await planCompany(SCOUT_TASK, { quiet: true });
  const sidecar = buildOllamaSidecar(plan, SCOUT_TASK);
  assert.ok(sidecar.eligibleCount >= 1, 'scout should be ollama-eligible');
  assert.equal(sidecar.tasks[0].tier, 'flash');
});

test('dry-run command: apply mode omits --dry-run from ollama command', async () => {
  const { planCompany } = await import('./company.mjs');
  const { runFleet } = await import('../Scripts/runFleet.mjs');
  const plan = await planCompany(SCOUT_TASK, { quiet: true });
  if (!plan.glmLeaves?.length && !plan.nativeSpecs?.length) {
    // Force a scout into nativeSpecs path for sidecar eligibility
    plan.nativeSpecs = [{ id: 'scout-1', role: 'scout', prompt: 'scan' }];
  }
  const r = await runFleet({ ...SCOUT_TASK, runId: `fleet-test-${Date.now()}` }, {
    dryRun: true,
    ollamaSidecar: true,
  });
  if (r.ollamaSidecar?.tasks?.length) {
    assert.ok(r.ollamaSidecar.command.includes('ollama-fleet.mjs'));
    assert.ok(r.ollamaSidecar.command.includes('--dry-run'), 'disarmed dry-run plan includes --dry-run');
    assert.ok(r.ollamaSidecar.command.includes('--tasks-file'));
  }
});

test('disarmed apply: ollama sidecar records explicit skip when fleet disarmed', async () => {
  const prev = process.env.YURI_OLLAMA_FLEET;
  delete process.env.YURI_OLLAMA_FLEET;
  const flag = path.join(REPO_ROOT, '_SYSTEM/state/ollama-fleet.enabled');
  const hadFlag = fs.existsSync(flag);
  if (hadFlag) fs.renameSync(flag, `${flag}.bak-test`);
  try {
    const { runFleet } = await import('../Scripts/runFleet.mjs');
    const task = {
      ...SCOUT_TASK,
      runId: `fleet-skip-${Date.now()}`,
      subtasks: [{ id: 'art-1', role: 'artificer', need: ['fast-edits'], prompt: 'bulk edit', blastRadius: 'LOW' }],
    };
    const r = await runFleet(task, { dryRun: true, ollamaSidecar: true });
    if (r.ollamaSidecar?.tasks?.length) {
      assert.equal(r.ollamaSidecar.armed, false);
    }
  } finally {
    if (hadFlag) fs.renameSync(`${flag}.bak-test`, flag);
    if (prev !== undefined) process.env.YURI_OLLAMA_FLEET = prev;
  }
});
