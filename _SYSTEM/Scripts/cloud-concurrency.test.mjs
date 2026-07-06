// Hermetic tests for cloud-concurrency.mjs — cross-process cloud lane admission (D-4 / P8).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const SLOTS = path.join(os.tmpdir(), `cc-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.YURI_CLOUD_SLOTS_DIR = SLOTS;

const { maxCloudConcurrency, cloudConcurrency, tryAcquireCloudSlot, releaseCloudSlot, poolForLane } =
  await import('./cloud-concurrency.mjs');

function reset(pool = 'glm') {
  fs.rmSync(path.join(SLOTS, pool), { recursive: true, force: true });
}

test('poolForLane: glm vs ollama-cloud routing', () => {
  assert.equal(poolForLane('glm-max', 'anthropic-compatible'), 'glm');
  assert.equal(poolForLane('ollama-cloud', 'ollama-cloud'), 'ollama-cloud');
});

test('tryAcquireCloudSlot: two concurrent dispatches respect ceiling', () => {
  reset('glm');
  process.env.YURI_CLOUD_MAX_GLM = '2';
  const a = tryAcquireCloudSlot({ lane: 'glm-max', model: 'glm-5.2' });
  const b = tryAcquireCloudSlot({ lane: 'glm', model: 'glm-4.7' });
  assert.ok(a.ok && b.ok, 'two acquires under max=2 succeed');
  const full = tryAcquireCloudSlot({ lane: 'glm-flash' });
  assert.equal(full.ok, false, 'third acquire refused at ceiling');
  assert.equal(full.max, 2);
  delete process.env.YURI_CLOUD_MAX_GLM;
});

test('releaseCloudSlot: frees capacity for re-acquire', () => {
  reset('ollama-cloud');
  process.env.YURI_CLOUD_MAX_OLLAMA_CLOUD = '1';
  const a = tryAcquireCloudSlot({ lane: 'ollama-cloud', provider: 'ollama-cloud' });
  assert.ok(a.ok);
  assert.equal(tryAcquireCloudSlot({ lane: 'ollama-cloud', provider: 'ollama-cloud' }).ok, false);
  assert.equal(releaseCloudSlot(a.slotId), true);
  const re = tryAcquireCloudSlot({ lane: 'ollama-cloud', provider: 'ollama-cloud' });
  assert.ok(re.ok, 'slot freed and re-acquired');
  delete process.env.YURI_CLOUD_MAX_OLLAMA_CLOUD;
});

test('cloudConcurrency: reports active/max honestly', () => {
  reset('glm');
  process.env.YURI_CLOUD_MAX_GLM = '3';
  tryAcquireCloudSlot({ lane: 'glm-max' });
  const c = cloudConcurrency('glm');
  assert.equal(c.active, 1);
  assert.equal(c.max, 3);
  delete process.env.YURI_CLOUD_MAX_GLM;
});
