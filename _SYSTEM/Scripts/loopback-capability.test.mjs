import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowOnlyIfBindable, canBindLocalhost } from './loopback-capability.mjs';

test('loopback capability reports a structured bind result', async () => {
  const result = await canBindLocalhost({ cache: false });

  assert.equal(typeof result.ok, 'boolean');
  assert.equal(result.host, '127.0.0.1');
  if (!result.ok) {
    assert.ok(result.code || result.error);
  }
});

test('allowOnlyIfBindable returns a boolean without throwing', async (t) => {
  const allowed = await allowOnlyIfBindable(t, { cache: false });

  assert.equal(typeof allowed, 'boolean');
});
