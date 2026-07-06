// Tests for the Move-1b INC-5 mechanism-layer bypass guard in nano-external.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { governedFireDecision } from './nano-external.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(HERE, 'nano-external.mjs');

test('governedFireDecision: --dry always allowed', () => {
  const r = governedFireDecision({ dry: true, env: {} });
  assert.equal(r.allow, true);
  assert.equal(r.mode, 'dry');
});

test('governedFireDecision: ungoverned fire refused', () => {
  const r = governedFireDecision({ dry: false, env: {} });
  assert.equal(r.allow, false);
  assert.equal(r.reason, 'ungoverned-cli-fire-refused');
  assert.match(r.message, /spawn_nano/);
});

test('governedFireDecision: operator escape hatch allows fire', () => {
  const r = governedFireDecision({ dry: false, env: { YURI_NANO_CLI_FIRE: '1' } });
  assert.equal(r.allow, true);
  assert.equal(r.mode, 'operator-cli-fire');
});

test('CLI integration: ungoverned fire exits 3 + refusal on stderr; --dry exits 0', () => {
  // a lane's bash bypass attempt: node nano-external.mjs <lane> "<task>"  (no --dry, no escape hatch)
  const fire = spawnSync('node', [MOD, 'deepseek-v4-pro', 'spawn ungoverned work'],
    { encoding: 'utf8', env: { ...process.env, YURI_NANO_CLI_FIRE: '' }, timeout: 20000 });
  assert.equal(fire.status, 3);
  assert.match(fire.stderr, /ungoverned-cli-fire-refused/);
  // --dry (routing proof, no fire) is allowed
  const dry = spawnSync('node', [MOD, 'deepseek-v4-pro', 'x', '--dry'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /llm-lane/);
});
