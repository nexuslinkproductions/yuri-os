import assert from 'node:assert/strict';
import test from 'node:test';

import { rankCapabilities } from './capability-recall.mjs';
import { scanCapabilities } from './capability-scan.mjs';

test('active VoxKey outranks its legacy Right-Option predecessor for Ctrl+Space recall', () => {
  const capabilities = scanCapabilities();
  const ranked = rankCapabilities('ctrl space push to talk voxkey', capabilities, 10);
  const ids = ranked.map(({ c }) => c.id);

  assert.equal(ids[0], 'voice-voxkey-control');
  assert.ok(ids.includes('voice-ptt-control'), 'legacy mechanism should remain recall-visible');
  assert.ok(ids.indexOf('voice-voxkey-control') < ids.indexOf('voice-ptt-control'));

  const legacy = capabilities.find((capability) => capability.id === 'voice-ptt-control');
  const active = capabilities.find((capability) => capability.id === 'voice-voxkey-control');
  assert.equal(legacy.status, 'legacy');
  assert.equal(legacy.supersededBy, 'voice-voxkey-control');
  assert.equal(active.status, 'active');
  assert.deepEqual(active.supersedes, ['voice-ptt-control']);
});

test('explicit legacy Right Option lookup still surfaces the predecessor', () => {
  const capabilities = scanCapabilities();
  const ranked = rankCapabilities('legacy right option push to talk', capabilities, 10);
  assert.ok(ranked.some(({ c }) => c.id === 'voice-ptt-control'));
});
