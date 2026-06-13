// lane-core-hooks.test.mjs — locks the input-genome RE-ROUTE onto the live lane seam (2026-06-13).
// All best-effort sinks redirected to /tmp so the test never writes real state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';

const SOAK = '/tmp/lch-soak-test.jsonl';
process.env.YURI_CONFORMANCE_SOAK_PATH = SOAK;
process.env.YURI_MEMORY_LEDGER_PATH = '/tmp/lch-ledger-test.jsonl';
process.env.YURI_LANE_PULSE_PATH = '/tmp/lch-pulse-test.jsonl';

const { coreOnDispatch, coreOnResult } = await import('./lane-core-hooks.mjs');
const readSoak = () => (existsSync(SOAK) ? readFileSync(SOAK, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

test('re-route: coreOnDispatch compiles+stashes the genome contract; coreOnResult soaks output against it, DISARMED', async () => {
  rmSync(SOAK, { force: true });
  const d = await coreOnDispatch({ lane: 'unit', prompt: 'build a parser and verify it with tests', runId: 'lch-1' });
  assert.equal(d.runId, 'lch-1');
  coreOnResult({ lane: 'unit', prompt: 'build a parser', output: 'did the thing', exitCode: 0, runId: 'lch-1' });
  const entry = readSoak().find((e) => String(e.label || '').startsWith('lane:unit'));
  assert.ok(entry, `lane soak entry present: ${JSON.stringify(readSoak())}`);
  assert.ok(entry.label.includes('input-genome-'), 'soaked against the per-task GENOME contract (provenance closed)');
  assert.equal(entry.enforceBlock, false, 'lane path is DISARMED — never blocks live lanes even if the global flag is armed');
  assert.equal(entry.enforcing, false);
  rmSync(SOAK, { force: true });
});

test('re-route: coreOnResult is graceful with no stashed contract (unknown runId) — no lane entry, no throw', () => {
  rmSync(SOAK, { force: true });
  assert.doesNotThrow(() => coreOnResult({ lane: 'unit', prompt: 'x', output: 'y', exitCode: 0, runId: 'never-dispatched' }));
  assert.ok(!readSoak().some((e) => String(e.label || '').startsWith('lane:')), 'no lane soak entry without a stashed contract');
  rmSync(SOAK, { force: true });
});

test('re-route: dispatch returns a recall block shape and never throws on empty prompt', async () => {
  const d = await coreOnDispatch({ lane: 'unit', prompt: '', runId: 'lch-2' });
  assert.equal(typeof d.recallBlock, 'string');
  assert.equal(d.runId, 'lch-2');
  assert.doesNotThrow(() => coreOnResult({ lane: 'unit', prompt: '', output: '', exitCode: 0, runId: 'lch-2' }));
  rmSync(SOAK, { force: true });
});
