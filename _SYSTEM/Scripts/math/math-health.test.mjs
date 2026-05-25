#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { runMathHealth } from './math-health.mjs';

test('math health validates archive, adapters, formula banks, and core fixtures', () => {
  const result = runMathHealth();

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.archive.sourceCount, 86);
  assert.ok(result.formulaBanks.length >= 3);
  assert.equal(result.proofGate.ok, true);
  assert.ok(result.proofGate.executableTraceCount >= 10);
  assert.equal(result.adapterManifest.ok, true);
  assert.equal(result.coreProofs.astarMatchesDijkstra, true);
});
