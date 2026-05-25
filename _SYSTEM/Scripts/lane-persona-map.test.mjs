import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANE_PERSONAS,
  PRIVATE_PERSONA_ENV,
  buildRickLanePacket,
  lanePersonaForWorker,
  shippingPersonaAudit,
} from './lane-persona-map.mjs';

test('lane persona overlay defaults to neutral shipping labels', () => {
  const env = {};
  const sonnet = lanePersonaForWorker('claude', { model: 'sonnet', env });
  const opus = lanePersonaForWorker('claude', { model: 'opus', env });

  assert.equal(sonnet.displayName, 'Claude/Sonnet');
  assert.equal(opus.displayName, 'Claude/Opus');
  assert.equal(sonnet.privateOverlay, false);
  assert.notEqual(sonnet.displayName, LANE_PERSONAS['claude-sonnet'].privateAlias);
});

test('private persona overlay maps Claude model lanes to fitting Rick aliases', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };

  assert.equal(lanePersonaForWorker('codex', { env }).displayName, 'Rick C-137');
  assert.equal(lanePersonaForWorker('claude', { model: 'sonnet', env }).displayName, 'Memory Rick');
  assert.equal(lanePersonaForWorker('claude', { model: 'opus', env }).displayName, 'Rick Prime');
  assert.equal(lanePersonaForWorker('deepseek', { env }).displayName, 'Simple Rick');
  assert.equal(lanePersonaForWorker('kagami', { env }).displayName, 'Council of Ricks');
});

test('Rick lane packet is cache-friendly and shipping-safe by default', () => {
  const packet = buildRickLanePacket('claude', 'Task: review the bridge.', {
    model: 'sonnet',
    env: {},
  });

  assert.match(packet, /YURI live lane packet/);
  assert.match(packet, /Lane: Claude\/Sonnet/);
  assert.match(packet, /Cache rule: keep this header stable/);
  assert.match(packet, /Task: review the bridge/);
  assert.doesNotMatch(packet, /Memory Rick|Rick Prime|Council of Ricks/);
});

test('private persona overlay turns packet headers into Rick-to-Rick lane headers', () => {
  const packet = buildRickLanePacket('claude', 'Task: pressure-test the plan.', {
    model: 'sonnet',
    env: { [PRIVATE_PERSONA_ENV]: '1' },
  });

  assert.match(packet, /Rick-to-Rick live lane packet/);
  assert.match(packet, /Display: Memory Rick/);
  assert.match(packet, /Private overlay: enabled for local dev only/);
});

test('shipping persona audit marks copyrighted aliases private-only', () => {
  const audit = shippingPersonaAudit();

  assert.ok(audit.length >= 5);
  for (const entry of audit) {
    assert.equal(entry.privateUseOnly, true);
    assert.equal(entry.copyrightRisk, true);
    assert.notEqual(entry.shipLabel, entry.privateAlias);
  }
});
