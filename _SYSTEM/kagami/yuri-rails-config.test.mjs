import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVE_NIM_LANES, DEAD_NIM_LANES } from '../Scripts/lane-kernel.mjs';
import { YURI_RAILS_CONFIG, YURI_RAILS_CONFIG_VERSION, getRailConfig } from './yuri-rails-config.mjs';

test('YURI rails config maps NeMo phases without adding the dependency', () => {
  assert.equal(YURI_RAILS_CONFIG_VERSION, 'yuri.rails.v1');
  assert.equal(YURI_RAILS_CONFIG.source.dependencyPolicy, 'taxonomy-and-schema-reference-only');
  assert.equal(YURI_RAILS_CONFIG.input.userShellBlocks, 'text-only');
  assert.equal(YURI_RAILS_CONFIG.input.assistantShellBlocks, 'guarded-auto-exec-when-enabled');
  assert.equal(YURI_RAILS_CONFIG.output.maxChars, 64 * 1024);
  assert.equal(getRailConfig('execution').transientHttpRetry.attempts, 3);
});

test('YURI rails config reflects live lane kernel state', () => {
  assert.deepEqual([...YURI_RAILS_CONFIG.health.activeNimLanes], [...ACTIVE_NIM_LANES]);
  assert.deepEqual([...YURI_RAILS_CONFIG.health.deadNimLanes], [...DEAD_NIM_LANES]);
  assert.ok(YURI_RAILS_CONFIG.input.laneMentions.includes('@nvidia-nemotron-120b'));
  assert.ok(YURI_RAILS_CONFIG.dialog.tierMemberCaps.critical >= 9);
});

test('YURI rails config is frozen', () => {
  assert.equal(Object.isFrozen(YURI_RAILS_CONFIG), true);
  assert.equal(Object.isFrozen(YURI_RAILS_CONFIG.output), true);
});
