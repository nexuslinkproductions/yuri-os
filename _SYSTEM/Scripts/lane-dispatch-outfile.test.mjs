// lane-dispatch-outfile.test.mjs — the --out-file is the AUTHORITATIVE success signal.
// Regression lock for the owner-flagged cosmetic exit-1 + lost-output class (2026-07-03):
// a lane that writes a COMPLETE --out and THEN exits non-zero (transport cleanup after the last
// byte) must NOT be retried — the retry truncates the good --out and can clobber it with an
// empty-retry LANE_DISPATCH_FAIL record. Uses LANE_DISPATCH_LANE_SCRIPT to inject a fake lane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DISPATCH = path.join(HERE, 'lane-dispatch.mjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lane-dispatch-test-'));
}

// A fake lane script. Behavior is driven by env so each test shapes it:
//   FAKE_OUT           — the --out path (lane-dispatch passes it through argv; we also read it here)
//   FAKE_EXIT          — exit code to return
//   FAKE_WRITE         — 'labeled' | 'empty' | 'none'  (what to write to --out)
//   FAKE_RUNS_FILE     — append one line per invocation (retry counter)
function writeFakeLane(dir) {
  const p = path.join(dir, 'fake-lane.mjs');
  fs.writeFileSync(p, `
import fs from 'node:fs';
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : process.env.FAKE_OUT;
const runsFile = process.env.FAKE_RUNS_FILE;
if (runsFile) fs.appendFileSync(runsFile, 'run\\n');
const mode = process.env.FAKE_WRITE || 'labeled';
if (out) {
  if (mode === 'labeled') fs.writeFileSync(out, 'Design written.\\nRESULT_LABEL: 10GC_FAKE_LANE_X_PASS_COMMITTED\\n');
  else if (mode === 'empty') fs.writeFileSync(out, '');
  // mode 'none' => leave --out untouched
}
process.exit(Number(process.env.FAKE_EXIT || 0));
`, 'utf8');
  return p;
}

function runDispatch(fakeLane, outFile, env) {
  return spawnSync('node', [DISPATCH, 'glm-max', 'prompt', '--out', outFile], {
    env: { ...process.env, LANE_DISPATCH_LANE_SCRIPT: fakeLane, LANE_DISPATCH_ATTEMPTS: '4', LANE_DISPATCH_BACKOFF_MS: '1', LANE_DISPATCH_BACKOFF_CAP_MS: '2', ...env },
    encoding: 'utf8',
  });
}

test('REGRESSION: complete --out + non-zero exit → success, NO retry, --out preserved intact', () => {
  const dir = mkTmp();
  const fake = writeFakeLane(dir);
  const outFile = path.join(dir, 'CONNECTORS.out');
  const runsFile = path.join(dir, 'runs.log');
  const r = runDispatch(fake, outFile, { FAKE_WRITE: 'labeled', FAKE_EXIT: '1', FAKE_RUNS_FILE: runsFile });
  assert.equal(r.status, 0, 'lane-dispatch must exit 0 when --out holds complete output');
  const runs = fs.readFileSync(runsFile, 'utf8').trim().split('\n').filter(Boolean).length;
  assert.equal(runs, 1, 'must NOT retry a lane that already wrote a good --out (no clobber)');
  const text = fs.readFileSync(outFile, 'utf8');
  assert.match(text, /10GC_FAKE_LANE_X_PASS_COMMITTED/, '--out must survive intact, not clobbered by a failure record');
  assert.doesNotMatch(text, /LANE_DISPATCH_FAIL/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('clean exit + complete --out → success on first run', () => {
  const dir = mkTmp();
  const fake = writeFakeLane(dir);
  const outFile = path.join(dir, 'a.out');
  const runsFile = path.join(dir, 'runs.log');
  const r = runDispatch(fake, outFile, { FAKE_WRITE: 'labeled', FAKE_EXIT: '0', FAKE_RUNS_FILE: runsFile });
  assert.equal(r.status, 0);
  assert.equal(fs.readFileSync(runsFile, 'utf8').trim().split('\n').filter(Boolean).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('genuinely empty --out (exit 0) → retries, then writes LANE_DISPATCH_FAIL after exhaustion', () => {
  const dir = mkTmp();
  const fake = writeFakeLane(dir);
  const outFile = path.join(dir, 'b.out');
  const runsFile = path.join(dir, 'runs.log');
  const r = runDispatch(fake, outFile, { FAKE_WRITE: 'empty', FAKE_EXIT: '0', FAKE_RUNS_FILE: runsFile });
  assert.equal(r.status, 1, 'empty --out is a real failure after all attempts');
  assert.equal(fs.readFileSync(runsFile, 'utf8').trim().split('\n').filter(Boolean).length, 4, 'retries up to ATTEMPTS');
  assert.match(fs.readFileSync(outFile, 'utf8'), /LANE_DISPATCH_FAIL/, 'writes the structured failure record on total failure');
  fs.rmSync(dir, { recursive: true, force: true });
});
