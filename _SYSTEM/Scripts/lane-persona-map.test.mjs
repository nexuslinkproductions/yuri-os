import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANE_PERSONAS,
  PRIVATE_PERSONA_ENV,
  PRIVATE_PERSONA_ENV_ALIAS,
  buildRickLanePacket,
  lanePersonaForWorker,
  operatorOverlayName,
  privatePersonaOverlayEnabled,
  resolveRickRosterAlias,
  rickRoster,
  shippingPersonaAudit,
} from './lane-persona-map.mjs';

// Every existing call is hermetic: operatorReader: () => null pins the read to "no
// operator.json", so these tests never see René's real .claude/operator.json (which
// would resolve to 'Jeffrey' and break assertions expecting 'Memory Rick' etc.).
const NO_OPERATOR = { operatorReader: () => null };

test('lane persona overlay defaults to neutral shipping labels', () => {
  const env = {};
  const sonnet = lanePersonaForWorker('claude', { model: 'sonnet', env, ...NO_OPERATOR });
  const opus = lanePersonaForWorker('claude', { model: 'opus', env, ...NO_OPERATOR });

  assert.equal(sonnet.displayName, 'Claude/Sonnet');
  assert.equal(opus.displayName, 'Claude/Opus');
  assert.equal(sonnet.privateOverlay, false);
  assert.notEqual(sonnet.displayName, LANE_PERSONAS['claude-sonnet'].privateAlias);
});

test('private persona overlay maps Claude model lanes to fitting Rick aliases', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };

  assert.equal(lanePersonaForWorker('codex', { env, ...NO_OPERATOR }).displayName, 'Rick C-137');
  assert.equal(lanePersonaForWorker('quantum', { env, ...NO_OPERATOR }).displayName, 'Quantum Rick');
  assert.equal(lanePersonaForWorker('claude', { model: 'sonnet', env, ...NO_OPERATOR }).displayName, 'Memory Rick');
  assert.equal(lanePersonaForWorker('prime', { env, ...NO_OPERATOR }).displayName, 'Rick Prime');
  assert.equal(lanePersonaForWorker('claude', { model: 'opus', env, ...NO_OPERATOR }).displayName, 'Rick Prime');
  assert.equal(lanePersonaForWorker('deepseek', { env, ...NO_OPERATOR }).displayName, 'Simple Rick');
  assert.equal(lanePersonaForWorker('kagami', { env, ...NO_OPERATOR }).displayName, 'Council of Ricks');
});

test('Rick lane packet is cache-friendly and shipping-safe by default', () => {
  const packet = buildRickLanePacket('claude', 'Task: review the bridge.', {
    model: 'sonnet',
    env: {},
    ...NO_OPERATOR,
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
    ...NO_OPERATOR,
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

// ── Operator-driven overlay (operator.json persona.overlay) ─────────────────

test('operator overlay present + flag on -> Claude/Sonnet displayName is the operator name', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };
  const operatorReader = () => ({ persona: { overlay: 'Jeffrey' } });

  const persona = lanePersonaForWorker('claude', { model: 'sonnet', env, operatorReader });

  assert.equal(persona.displayName, 'Jeffrey');
  assert.equal(persona.operatorOverlay, 'Jeffrey');
  assert.equal(persona.privateAlias, 'Memory Rick');
});

test('operator overlay present + flag on -> Claude/Opus displayName is "<name> · Opus"', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };
  const operatorReader = () => ({ persona: { overlay: 'Jeffrey' } });

  const persona = lanePersonaForWorker('claude', { model: 'opus', env, operatorReader });

  assert.equal(persona.displayName, 'Jeffrey · Opus');
  assert.equal(persona.operatorOverlay, 'Jeffrey · Opus');
  assert.equal(persona.privateAlias, 'Rick Prime');
});

test('operator overlay present + flag OFF -> env gate wins, operator.json cannot activate it', () => {
  const env = {};
  const operatorReader = () => ({ persona: { overlay: 'Jeffrey' } });

  const persona = lanePersonaForWorker('claude', { model: 'sonnet', env, operatorReader });

  assert.equal(persona.displayName, 'Claude/Sonnet');
  assert.equal(persona.privateOverlay, false);
});

test('operator overlay present + flag on + non-Claude lane -> committed Rick default persists', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };
  const operatorReader = () => ({ persona: { overlay: 'Jeffrey' } });

  const persona = lanePersonaForWorker('deepseek', { env, operatorReader });

  assert.equal(persona.displayName, 'Simple Rick');
  assert.equal(persona.operatorOverlay, null);
});

test('operator overlay empty or missing -> falls back to committed Rick default', () => {
  const env = { [PRIVATE_PERSONA_ENV]: '1' };
  const cases = [
    () => ({ persona: { overlay: '' } }),
    () => ({ persona: {} }),
    () => ({}),
    () => null,
  ];

  for (const operatorReader of cases) {
    const persona = lanePersonaForWorker('claude', { model: 'sonnet', env, operatorReader });
    assert.equal(persona.displayName, 'Memory Rick');
    assert.equal(persona.operatorOverlay, null);
  }
});

test('operatorOverlayName returns null for a non-Claude key even with a valid overlay', () => {
  const operatorReader = () => ({ persona: { overlay: 'Jeffrey' } });
  assert.equal(operatorOverlayName('deepseek', { operatorReader }), null);
  assert.equal(operatorOverlayName('kagami', { operatorReader }), null);
});

test('new neutral env alias activates the private overlay gate on its own', () => {
  assert.equal(privatePersonaOverlayEnabled({ [PRIVATE_PERSONA_ENV_ALIAS]: '1' }), true);
  assert.equal(privatePersonaOverlayEnabled({ [PRIVATE_PERSONA_ENV_ALIAS]: '0' }), false);
  assert.equal(privatePersonaOverlayEnabled({}), false);
});
