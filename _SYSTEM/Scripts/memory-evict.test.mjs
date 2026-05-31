import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTtlDays } from './memory-evict.mjs';

// resolveTtlDays(env, cfg) — precedence: env override > canonical file > 90 default.
// Both inputs are injected so these tests never touch the real env or config file.

test('env override wins over the canonical file (ops escape hatch)', () => {
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: '30' }, { evict: { ttlDays: 60 } }), 30);
});

test('canonical file value used when env is absent', () => {
  assert.equal(resolveTtlDays({}, { evict: { ttlDays: 60 } }), 60);
});

test('falls back to 90 when neither env nor file provides a TTL', () => {
  assert.equal(resolveTtlDays({}, {}), 90);
  assert.equal(resolveTtlDays({}, { evict: {} }), 90);
  assert.equal(resolveTtlDays({}, null), 90);
});

test('invalid env falls through to the file (fail-safe, not fail-to-zero)', () => {
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: 'nope' }, { evict: { ttlDays: 45 } }), 45);
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: '0' }, { evict: { ttlDays: 45 } }), 45);
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: '-5' }, { evict: { ttlDays: 45 } }), 45);
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: '' }, { evict: { ttlDays: 45 } }), 45);
});

test('numeric env is truncated to an integer day count', () => {
  assert.equal(resolveTtlDays({ MEMORY_EVICT_TTL_DAYS: '14.7' }, {}), 14);
});
