// Tests for nano-dispatch.mjs (Move-1b INC-6 seam). Hermetic: tmp bus root, injected runLane (no real lane).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-dispatch-test-'));
process.env.YURI_NANO_LEASES_DIR = path.join(TMP, 'leases');
const nd = await import('./nano-dispatch.mjs');

test('nanoCtxFromEnv: present env → ctx; absent → null', () => {
  assert.equal(nd.nanoCtxFromEnv({}), null);
  const ctx = nd.nanoCtxFromEnv({
    YURI_NANO_ROOT_RUN_ID: 'run9', YURI_NANO_PATH: 'r.0.1', YURI_NANO_DEPTH: '2', YURI_NANO_RESERVATION_ID: 'res-7',
  });
  assert.deepEqual(ctx, { rootRunId: 'run9', myPath: 'r.0.1', depth: 2, reservationId: 'res-7' });
});

test('ctxEnv ↔ nanoCtxFromEnv round-trip', () => {
  const ctx = { rootRunId: 'run1', myPath: 'r.2', depth: 1, reservationId: 'res-1' };
  const env = nd.ctxEnv(ctx);
  assert.deepEqual(nd.nanoCtxFromEnv(env), ctx);
});

test('dispatchNano threads tree ctx env into the runner', async () => {
  let captured = null;
  const runLane = (params) => { captured = params; return { exitCode: 0, output: 'child did the work' }; };
  const childCtx = { rootRunId: 'e2e', myPath: 'r.0', depth: 1, reservationId: 'res-x' };
  const r = await nd.dispatchNano({ lane: 'deepseek-v4-pro', task: 'analyze X' }, childCtx, { runLane, root: path.join(TMP, 'bus') });
  assert.equal(r.ok, true);
  assert.equal(r.childNanoId, 'e2e/r.0');
  assert.equal(captured.env[nd.CTX_ENV.root], 'e2e');
  assert.equal(captured.env[nd.CTX_ENV.path], 'r.0');
  assert.equal(captured.env[nd.CTX_ENV.depth], '1');
  assert.equal(captured.env[nd.CTX_ENV.res], 'res-x');
  assert.match(captured.prompt, /analyze X/);            // task reached the lane prompt
});
