import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectEnergyObservability, parseArgs } from './energy-observability-health.mjs';

const COMMAND = 'node "$CLAUDE_PROJECT_DIR/_SYSTEM/Scripts/energy-tick-adapter.mjs"';
const DEPENDENCIES = [
  '_SYSTEM/Scripts/energy-tick-adapter.mjs',
  '_SYSTEM/Scripts/energy-tick-core.mjs',
  '_SYSTEM/Scripts/math/yuri-energy-trace.mjs',
];
const FIXTURE_SOURCE = '// fixture\n';
const FIXTURE_SHA256 = crypto.createHash('sha256').update(FIXTURE_SOURCE).digest('hex');

function fixtureRoot({ omit = new Set() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-energy-health-'));
  for (const relative of DEPENDENCIES) {
    if (omit.has(relative)) continue;
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, FIXTURE_SOURCE);
  }
  return root;
}

function registry(overrides = {}) {
  return {
    contentHashes: Object.fromEntries(DEPENDENCIES.map((relative) => [relative, FIXTURE_SHA256])),
    hooks: [{
      hookId: 'yuri.energy.tick',
      logicalEvent: 'PostToolUse',
      owner: 'YURI',
      coreEntrypoint: '_SYSTEM/Scripts/energy-tick-adapter.mjs',
      enabled: true,
      required: false,
      optional: true,
      dependencyClosure: [...DEPENDENCIES],
      providerAdapters: [{
        provider: 'claude-code',
        projection: '.claude/settings.local.json',
        activation: 'registered-projection-not-applied',
        command: COMMAND,
        invokedPaths: ['_SYSTEM/Scripts/energy-tick-adapter.mjs'],
      }],
      ...overrides,
    }],
  };
}

test('canonical registration and materialized dependency closure are healthy without live activation', () => {
  const root = fixtureRoot();
  const result = inspectEnergyObservability({
    root,
    registry: registry(),
    settingsSources: [{ relative: '.claude/settings.local.json', source: '{}' }],
    env: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.hookRegistered, true);
  assert.equal(result.coreWired, true);
  assert.equal(result.providerActivated, false);
  assert.equal(result.activationRequired, false);
  assert.equal(result.adapterEnabledInProbeEnvironment, false);
  assert.deepEqual(result.missingDependencies, []);
});

test('safe no-runtime mode never inspects trace-directory metadata', () => {
  const root = fixtureRoot();
  let traceCounterCalls = 0;
  const result = inspectEnergyObservability({
    root,
    registry: registry(),
    settingsSources: [],
    env: {},
    includeRuntimeTraceMetadata: false,
    traceCounter: () => {
      traceCounterCalls += 1;
      return 99;
    },
  });

  assert.equal(traceCounterCalls, 0);
  assert.equal(result.traceMetadataObserved, false);
  assert.equal(result.traceFiles, null);
  assert.match(result.summary, /traceFiles=not-observed/);
  assert.deepEqual(parseArgs(['--no-runtime']), { includeRuntimeTraceMetadata: false });
  assert.deepEqual(parseArgs([]), { includeRuntimeTraceMetadata: true });
  assert.throws(() => parseArgs(['--unknown']), /unknown argument/i);
});

test('live provider activation is observed separately from registration truth', () => {
  const root = fixtureRoot();
  const source = JSON.stringify({ hooks: { PostToolUse: [{ matcher: '', hooks: [{
    type: 'command', command: COMMAND, timeout: 10,
  }] }] } });
  const result = inspectEnergyObservability({
    root,
    registry: registry(),
    settingsSources: [{ relative: '.claude/settings.local.json', source }],
    env: { YURI_ENERGY_OBSERVABILITY: '1' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.providerActivated, true);
  assert.equal(result.providerCommandCount, 1);
  assert.equal(result.adapterEnabledInProbeEnvironment, true);
});

test('a retired .claude/hooks file cannot satisfy canonical registration or core wiring', () => {
  const root = fixtureRoot({ omit: new Set(['_SYSTEM/Scripts/energy-tick-adapter.mjs']) });
  fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/hooks/energy-tick.mjs'), '// retired fixture\n');
  const result = inspectEnergyObservability({
    root,
    registry: { hooks: [] },
    settingsSources: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.hookRegistered, false);
  assert.equal(result.coreWired, false);
});

test('a missing declared dependency fails core wiring with an exact receipt', () => {
  const missing = '_SYSTEM/Scripts/math/yuri-energy-trace.mjs';
  const root = fixtureRoot({ omit: new Set([missing]) });
  const result = inspectEnergyObservability({ root, registry: registry(), settingsSources: [] });
  assert.equal(result.ok, false);
  assert.equal(result.hookRegistered, true);
  assert.equal(result.coreWired, false);
  assert.deepEqual(result.missingDependencies, [missing]);
});

test('a content-hash mismatch fails core wiring instead of false-greening on existence', () => {
  const drifted = '_SYSTEM/Scripts/energy-tick-core.mjs';
  const root = fixtureRoot();
  fs.appendFileSync(path.join(root, drifted), '// drift\n');
  const result = inspectEnergyObservability({ root, registry: registry(), settingsSources: [] });
  assert.equal(result.ok, false);
  assert.equal(result.hookRegistered, true);
  assert.equal(result.coreWired, false);
  assert.deepEqual(result.hashMismatches, [drifted]);
});
