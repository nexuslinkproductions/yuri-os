#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateMathAdapterManifest } from './math-adapters.mjs';

const LAB_MANIFEST = JSON.parse(readFileSync('_SYSTEM/labs/math/lab-manifest.json', 'utf8'));

test('validates governed polyglot adapter manifests', () => {
  const adapter = {
    schema: 'yuri.math.adapter.v0',
    id: 'python-networkx',
    engine: 'python',
    capabilities: ['dijkstra', 'astar', 'graph-visualization'],
    runMode: 'lab',
    promotionStatus: 'research',
    writesRuntimeTruth: false,
  };

  assert.deepEqual(validateMathAdapterManifest(adapter), {
    ok: true,
    errors: [],
    warnings: [],
  });
});

test('rejects adapters that can write runtime truth or omit capabilities', () => {
  const result = validateMathAdapterManifest({
    schema: 'yuri.math.adapter.v0',
    id: 'unsafe-python',
    engine: 'python',
    capabilities: [],
    runMode: 'runtime',
    promotionStatus: 'trusted',
    writesRuntimeTruth: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('capabilities must include at least one capability'));
  assert.ok(result.errors.includes('writesRuntimeTruth must be false unless promoted by a separate owner-approved gate'));
});

test('math lab manifest keeps external engines in research or lab mode', () => {
  assert.equal(LAB_MANIFEST.schema, 'yuri.math-lab-harness.v0');
  assert.ok(LAB_MANIFEST.adapters.length >= 2);

  for (const adapter of LAB_MANIFEST.adapters) {
    const result = validateMathAdapterManifest(adapter);
    assert.equal(result.ok, true, `${adapter.id}: ${result.errors.join(', ')}`);
    assert.notEqual(adapter.runMode, 'runtime');
    assert.equal(adapter.writesRuntimeTruth, false);
  }
});
