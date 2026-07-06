#!/usr/bin/env node
// Tests for the external-nano adapter: routing enforcement (llm-lane only, never raw mimo.mjs), prompt
// composition, the work-fn contract with an injected fake runner, and integration into a real nano tick.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(os.tmpdir(), `nano-ext-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.KAGAMI_CONTROL_STATE_ROOT = ROOT;
const { externalNanoWork, buildExternalPrompt, assertLlmLaneRouted } = await import('./nano-external.mjs');
const { tick } = await import('./nano-tick.mjs');
const { readKagamiEventsSince } = await import('./kagami-event-bus.mjs');

const reset = () => fs.rmSync(ROOT, { recursive: true, force: true });

test('assertLlmLaneRouted: lane keys ok, paths/scripts refused (never raw mimo.mjs)', () => {
  for (const ok of ['deepseek-v4-pro', 'mimo-v2.5-pro[1m]', 'ds-flash', 'codex']) {
    assert.equal(assertLlmLaneRouted(ok), ok);
  }
  for (const bad of ['mimo.mjs', '../Scripts/mimo.mjs', 'foo/bar', 'x.sh', '/abs/mimo.mjs', '']) {
    assert.throws(() => assertLlmLaneRouted(bad), /lane (must|required)/i, bad);
  }
});

test('buildExternalPrompt embeds task + tick context; brain only when asked', () => {
  const p = buildExternalPrompt('Do the thing.', { nanoId: 'nano-x', goalId: 'g1', shard: 'file:src/a.ts', brain: 'BRAINDATA' });
  assert.match(p, /nano-x/);
  assert.match(p, /Goal: g1/);
  assert.match(p, /file:src\/a\.ts/);
  assert.match(p, /Do the thing\./);
  assert.equal(p.includes('BRAINDATA'), false, 'brain excluded by default');
  const p2 = buildExternalPrompt('t', { brain: 'BRAINDATA' }, true);
  assert.match(p2, /BRAINDATA/);
});

test('externalNanoWork: fake runner receives the routed lane + composed prompt; ok on output', async () => {
  let seen = null;
  const work = externalNanoWork({ lane: 'deepseek-v4-pro', task: 'Investigate X.', runLane: async (a) => { seen = a; return { exitCode: 0, output: 'FINDINGS: ok' }; } });
  const r = await work({ nanoId: 'nano-a', goalId: 'g7' });
  assert.equal(seen.lane, 'deepseek-v4-pro');
  assert.match(seen.prompt, /Investigate X\./);
  assert.match(seen.prompt, /g7/);
  assert.equal(r.ok, true);
  assert.equal(r.via, 'llm-lane');
  assert.equal(r.output, 'FINDINGS: ok');
});

test('externalNanoWork: empty output or nonzero exit -> ok:false with stderr', async () => {
  const empty = await externalNanoWork({ lane: 'mimo-v2.5-pro[1m]', task: 't', runLane: async () => ({ exitCode: 0, output: '   ', stderr: 'lane warn' }) })({});
  assert.equal(empty.ok, false);
  assert.equal(empty.stderr, 'lane warn');
  const failed = await externalNanoWork({ lane: 'codex', task: 't', runLane: async () => ({ exitCode: 3, output: '', stderr: 'missing_key' }) })({});
  assert.equal(failed.ok, false);
  assert.equal(failed.exitCode, 3);
});

test('externalNanoWork: a throwing runner is captured, never crashes the tick', async () => {
  const r = await externalNanoWork({ lane: 'deepseek-v4-pro', task: 't', runLane: async () => { throw new Error('egress blocked'); } })({});
  assert.equal(r.ok, false);
  assert.match(r.error, /egress blocked/);
});

test('externalNanoWork: construction refuses a non-llm-lane lane up front', () => {
  assert.throws(() => externalNanoWork({ lane: 'mimo.mjs', task: 't' }), /never raw mimo/i);
});

test('integration: an external nano plugs into a real tick; its llm-lane output lands in LANE_OUTPUT_DELTA', async () => {
  reset();
  const work = externalNanoWork({ lane: 'deepseek-v4-pro', task: 'Summarize.', runLane: async () => ({ exitCode: 0, output: 'EXTERNAL-RESULT-42' }) });
  const r = await tick('nano-ext', { root: ROOT, goalId: 'g1', work });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.via, 'llm-lane');
  const delta = readKagamiEventsSince({ lane: 'nano-ext' }, { root: ROOT }).find((e) => e.kind === 'LANE_OUTPUT_DELTA');
  assert.match(delta.payload.result, /EXTERNAL-RESULT-42/, 'external lane output streamed to the swarm bus');
});
