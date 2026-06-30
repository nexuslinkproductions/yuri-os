// glm-max timeout tier + dispatch failure diagnostics — WS-G audit 2026-06-30
// Run: node --test _SYSTEM/Scripts/glm-fleet-timeout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTimeoutMsForLane } from './glm-fleet.mjs';
import { buildLeaf } from '../mure/company.mjs';

test('defaultTimeoutMsForLane: glm-max >= 30min (1800000ms)', () => {
  assert.ok(defaultTimeoutMsForLane('glm-max') >= 1800000, 'glm-max outer timeout must allow heavy tool loops');
  assert.equal(defaultTimeoutMsForLane('glm-sub-orch'), defaultTimeoutMsForLane('glm-max'));
});

test('defaultTimeoutMsForLane: glm workhorse stays lower than glm-max', () => {
  assert.ok(defaultTimeoutMsForLane('glm') < defaultTimeoutMsForLane('glm-max'));
});

test('buildLeaf: glm-max roles inherit fleet heavy timeout when subtask omits timeoutMs', () => {
  const role = { id: 'architect', name: 'Architect', archetype: 'a', mission: 'm', capabilities: [] };
  const subtask = { id: 'WS-G-A1', prompt: 'map the integration surface' };
  const target = { lane: 'glm-max', dispatch: 'glm-lane' };
  const leaf = buildLeaf(role, subtask, target);
  assert.equal(leaf.timeoutMs, defaultTimeoutMsForLane('glm-max'));
});

test('buildLeaf: explicit subtask timeoutMs wins over default', () => {
  const role = { id: 'architect', name: 'Architect', archetype: 'a', mission: 'm', capabilities: [] };
  const subtask = { id: 'X', prompt: 'p', timeoutMs: 999000 };
  const leaf = buildLeaf(role, subtask, { lane: 'glm-max', dispatch: 'glm-lane' });
  assert.equal(leaf.timeoutMs, 999000);
});
