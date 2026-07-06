import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANE_PERSONAS,
  PRIVATE_PERSONA_ENV,
  buildRickLanePacket,
  lanePersonaForWorker,
  resolveRickRosterAlias,
  rickRoster,
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
  assert.equal(lanePersonaForWorker('quantum', { env }).displayName, 'Quantum Rick');
  assert.equal(lanePersonaForWorker('claude', { model: 'sonnet', env }).displayName, 'Memory Rick');
  assert.equal(lanePersonaForWorker('prime', { env }).displayName, 'Rick Prime');
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

test('canonical Rick roster includes every persona lane', () => {
  const roster = rickRoster({ env: {} });
  const aliases = roster.map((entry) => entry.privateAlias);

  assert.ok(aliases.includes('Rick C-137'));
  assert.ok(aliases.includes('Quantum Rick'));
  assert.ok(aliases.includes('Memory Rick'));
  assert.ok(aliases.includes('Rick Prime'));
  assert.ok(aliases.includes('Simple Rick'));
  assert.ok(aliases.includes('Council of Ricks'));
  assert.ok(aliases.includes('Robot Rick'));
});

test('Rick roster alias resolver accepts persona keys and private aliases', () => {
  assert.equal(resolveRickRosterAlias('quantum', { env: {} }).privateAlias, 'Quantum Rick');
  assert.equal(resolveRickRosterAlias('Quantum Rick', { env: {} }).key, 'quantum');
  assert.equal(resolveRickRosterAlias('rick prime', { env: {} }).privateAlias, 'Rick Prime');
  assert.equal(resolveRickRosterAlias('Rick C-137', { env: {} }).shipLabel, 'Claude/Opus');
});
