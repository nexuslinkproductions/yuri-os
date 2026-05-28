import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  usage,
  VALID_MODELS,
  DEFAULT_ACK_WAIT_MS,
} from './rick-opus-dispatch.mjs';

test('parseArgs returns help flag', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('parseArgs extracts lane as positional argument', () => {
  const r = parseArgs(['quantum', '--prompt', 'hello']);
  assert.deepEqual(r._, ['quantum']);
  assert.equal(r.prompt, 'hello');
});

test('parseArgs defaults model to opus', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi']);
  assert.equal(r.model, 'opus');
});

test('parseArgs honors explicit --model', () => {
  const r = parseArgs(['prime', '--prompt', 'hi', '--model', 'sonnet']);
  assert.equal(r.model, 'sonnet');
});

test('parseArgs defaults ackWaitMs to 3000', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi']);
  assert.equal(r.ackWaitMs, DEFAULT_ACK_WAIT_MS);
});

test('parseArgs honors --ack-wait-ms', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi', '--ack-wait-ms', '5000']);
  assert.equal(r.ackWaitMs, 5000);
});

test('parseArgs ignores --ack-wait-ms with non-numeric value', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi', '--ack-wait-ms', 'abc']);
  assert.equal(r.ackWaitMs, DEFAULT_ACK_WAIT_MS);
});

test('parseArgs ignores --ack-wait-ms with negative value', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi', '--ack-wait-ms', '-100']);
  assert.equal(r.ackWaitMs, DEFAULT_ACK_WAIT_MS);
});

test('parseArgs --execute sets execute true', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi', '--execute']);
  assert.equal(r.execute, true);
});

test('parseArgs --execute defaults false', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi']);
  assert.equal(r.execute, false);
});

test('parseArgs --prompt-file captures path', () => {
  const r = parseArgs(['quantum', '--prompt-file', '/tmp/p.md']);
  assert.equal(r.promptFile, '/tmp/p.md');
});

test('parseArgs ignores unknown long flags silently', () => {
  const r = parseArgs(['quantum', '--prompt', 'hi', '--unknown-flag', 'val']);
  assert.equal(r._.length, 1);
  assert.equal(r._[0], 'quantum');
});

test('VALID_MODELS covers opus/sonnet/haiku/default', () => {
  assert.equal(VALID_MODELS.size, 4);
  for (const m of ['opus', 'sonnet', 'haiku', 'default']) {
    assert.ok(VALID_MODELS.has(m), `must include "${m}"`);
  }
});

test('usage string mentions the wrapped script and key flags', () => {
  const u = usage();
  assert.ok(u.includes('rick-opus-dispatch.mjs'));
  assert.ok(u.includes('--model'));
  assert.ok(u.includes('--ack-wait-ms'));
  assert.ok(u.includes('--execute'));
});
