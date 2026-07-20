import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  ROOT,
  inventoryClaudeLifecycle,
  loadRegistry,
  renderProvider,
  validateRegistry,
} from './yuri-hook-registry.mjs';

const ENERGY_HOOK_ID = 'yuri.energy.tick';

function fixtureFileSystem() {
  return {
    existsSync() { return true; },
    statSync() { return { isFile: () => true }; },
    realpathSync(file) { return file; },
  };
}

test('registry owns one optional, fail-soft PostToolUse energy adapter outside retired paths', () => {
  const registry = loadRegistry();
  assert.doesNotThrow(() => validateRegistry(registry, { checkHashes: false }));
  const hook = registry.hooks.find((entry) => entry.hookId === ENERGY_HOOK_ID);
  assert.ok(hook, 'canonical energy hook is missing');
  assert.equal(hook.logicalEvent, 'PostToolUse');
  assert.equal(hook.owner, 'YURI');
  assert.equal(hook.enabled, true);
  assert.equal(hook.required, false);
  assert.equal(hook.optional, true);
  assert.equal(hook.coreEntrypoint, '_SYSTEM/Scripts/energy-tick-adapter.mjs');
  assert.ok(hook.dependencyClosure.includes('_SYSTEM/Scripts/energy-tick-core.mjs'));
  assert.ok(hook.dependencyClosure.includes('_SYSTEM/SELF/energy-weights.json'));
  assert.ok(hook.dependencyClosure.every((relative) => !relative.startsWith('.claude/hooks/')));
  assert.equal(registry.providerMergeContracts['claude-code'].eventOwners.PostToolUse, ENERGY_HOOK_ID);
  assert.deepEqual(
    registry.providerMergeContracts['claude-code'].lifecycleLiveness.canonicalEventContracts.PostToolUse,
    { hookType: 'command', matcher: '', maxTimeoutSeconds: 10 },
  );
});

test('Claude render exposes the registered PostToolUse adapter without claiming it is live', () => {
  const registry = loadRegistry();
  const hook = registry.hooks.find((entry) => entry.hookId === ENERGY_HOOK_ID);
  const adapter = hook.providerAdapters.find((entry) => entry.provider === 'claude-code');
  assert.doesNotMatch(adapter.activation, /(?:^|-)active(?:-|$)/u);
  const rendered = renderProvider('claude', registry);
  assert.equal(rendered.hooks.PostToolUse.length, 1);
  assert.equal(rendered.hooks.PostToolUse[0].matcher, '');
  assert.equal(rendered.hooks.PostToolUse[0].hooks[0].command, adapter.command);
  assert.equal(rendered.hooks.PostToolUse[0].hooks[0].timeout, 10);
});

test('lifecycle inventory recognizes the exact energy command and rejects a retired-path impostor', () => {
  const registry = loadRegistry();
  const hook = registry.hooks.find((entry) => entry.hookId === ENERGY_HOOK_ID);
  const command = hook.providerAdapters.find((entry) => entry.provider === 'claude-code').command;
  const local = JSON.stringify({ hooks: { PostToolUse: [{ matcher: '', hooks: [{
    type: 'command', command, timeout: 10,
  }] }] } });
  const inventory = inventoryClaudeLifecycle([
    { relative: '.claude/settings.json', source: '{}' },
    { relative: '.claude/settings.local.json', source: local },
  ], registry, { home: '/fixture-home', ...fixtureFileSystem() });
  const energy = inventory.entries.find((entry) => entry.event === 'PostToolUse');
  assert.equal(energy.classification, 'registered-repo-local');
  assert.deepEqual(energy.issues, []);

  const impostorSource = JSON.stringify({ hooks: { PostToolUse: [{ matcher: '', hooks: [{
    type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/energy-tick.mjs"', timeout: 10,
  }] }] } });
  const impostor = inventoryClaudeLifecycle([
    { relative: '.claude/settings.json', source: '{}' },
    { relative: '.claude/settings.local.json', source: impostorSource },
  ], registry, { root: ROOT, home: '/fixture-home', ...fixtureFileSystem() });
  const retired = impostor.entries.find((entry) => entry.event === 'PostToolUse');
  assert.equal(retired.repoRelativePath, '.claude/hooks/energy-tick.mjs');
  assert.ok(retired.issues.includes('retired-execution-path-forbidden'));
});

test('PostToolUse exit contract fails soft on normal, disabled, and runtime-error paths', () => {
  const registry = loadRegistry();
  const hook = registry.hooks.find((entry) => entry.hookId === ENERGY_HOOK_ID);
  assert.deepEqual(hook.exitContract, { normal: 0, disabled: 0, runtimeError: 0 });
  const broken = structuredClone(registry);
  broken.hooks.find((entry) => entry.hookId === ENERGY_HOOK_ID).exitContract.runtimeError = 1;
  assert.throws(
    () => validateRegistry(broken, { checkHashes: false }),
    /PostToolUse telemetry must fail soft/u,
  );
});
