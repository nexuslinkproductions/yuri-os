import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateArchitectArchetypeCard,
  validateControlArchetypeCard,
  validateDelegatedOrchestratorArchetypeCard,
  validateStrategicPeerArchetypeCard,
  validateVerifierArchetypeCard,
  validateWorkerArchetypeCard,
  validateCard,
  detectArchetype,
} from './archetype-card-contract.mjs';

const CARD_URL = new URL('../../.openclaw/agents/mure-yuri.md', import.meta.url);
const ROLE_CARDS = Object.freeze([
  ['architect', new URL('../../.openclaw/agents/mure-architect.md', import.meta.url), validateArchitectArchetypeCard],
  ['strategic-peer', new URL('../../.openclaw/agents/mure-advisor.md', import.meta.url), validateStrategicPeerArchetypeCard],
  ['delegated-orchestrator', new URL('../../.openclaw/agents/mure-helmsman.md', import.meta.url), validateDelegatedOrchestratorArchetypeCard],
  ['worker', new URL('../../.openclaw/agents/mure-engineer.md', import.meta.url), validateWorkerArchetypeCard],
  ['verifier', new URL('../../.openclaw/agents/mure-adjudicator.md', import.meta.url), validateVerifierArchetypeCard],
]);
const LIVE_ROUTING_URLS = [
  new URL('./sol-moe-company.mjs', import.meta.url),
  new URL('./sol-moe-router.mjs', import.meta.url),
  new URL('./sol-moe-native-dispatch.mjs', import.meta.url),
  new URL('./sol-moe-run.mjs', import.meta.url),
];

test('main Yuri card validates as the documentation-only Control binding', async () => {
  const source = await readFile(CARD_URL, 'utf8');
  assert.deepEqual(validateControlArchetypeCard(source), {
    schemaVersion: 'mure-archetype-card-v1',
    archetype: 'control',
    ok: true,
    errors: [],
  });
});

test('validator rejects a stale result label and a missing Control boundary', async () => {
  const source = await readFile(CARD_URL, 'utf8');
  const stale = validateControlArchetypeCard(source.replace(
    'NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED',
    'XXNN_DESCRIPTION_(X|P|F)_PASS_<STATE>',
  ));
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.includes('contains legacy RESULT_LABEL grammar'));

  const missingBoundary = validateControlArchetypeCard(source.replace(
    'May not execute delegated worker work or verify its own producer output.',
    '',
  ));
  assert.equal(missingBoundary.ok, false);
  assert.ok(missingBoundary.errors.some((error) => error.startsWith('missing Control contract statement:')));
});

test('all five delegated archetype cards validate against provider-neutral contracts', async () => {
  for (const [archetype, url, validate] of ROLE_CARDS) {
    const source = await readFile(url, 'utf8');
    assert.deepEqual(validate(source), {
      schemaVersion: 'mure-archetype-card-v1',
      archetype,
      ok: true,
      errors: [],
    });
  }
});

test('role-card validators reject missing execution and independence boundaries', async () => {
  const workerSpec = ROLE_CARDS.find(([archetype]) => archetype === 'worker');
  const verifierSpec = ROLE_CARDS.find(([archetype]) => archetype === 'verifier');
  const worker = await readFile(workerSpec[1], 'utf8');
  const missingWorkerBoundary = validateWorkerArchetypeCard(worker.replace(
    'May not issue delegation tickets, spawn peers, expand scope, verify its own producer output, or accept the result.',
    '',
  ));
  assert.equal(missingWorkerBoundary.ok, false);
  assert.ok(missingWorkerBoundary.errors.some((error) => error.startsWith('missing Worker contract statement:')));

  const verifier = await readFile(verifierSpec[1], 'utf8');
  const missingVerifierBoundary = validateVerifierArchetypeCard(verifier.replace(
    'Must report both what was checked and what was not checked.',
    '',
  ));
  assert.equal(missingVerifierBoundary.ok, false);
  assert.ok(missingVerifierBoundary.errors.some((error) => error.startsWith('missing Verifier contract statement:')));
});

test('Strategic Peer and Delegated Orchestrator reject missing authority boundaries', async () => {
  const peer = await readFile(ROLE_CARDS[1][1], 'utf8');
  const missingPeerBoundary = validateStrategicPeerArchetypeCard(peer.replace(
    'May not issue delegation tickets, execute delegated worker work, spawn children, verify producer output, or accept the result.',
    '',
  ));
  assert.equal(missingPeerBoundary.ok, false);
  assert.ok(missingPeerBoundary.errors.some((error) => error.startsWith('missing Strategic Peer contract statement:')));

  const orchestrator = await readFile(ROLE_CARDS[2][1], 'utf8');
  const missingOrchestratorBoundary = validateDelegatedOrchestratorArchetypeCard(orchestrator.replace(
    'Must stop and return to Control when the delegated boundary is exhausted, ambiguous, owner-gated, or unavailable.',
    '',
  ));
  assert.equal(missingOrchestratorBoundary.ok, false);
  assert.ok(missingOrchestratorBoundary.errors.some((error) => error.startsWith('missing Delegated Orchestrator contract statement:')));
});

test('archetype card validation remains outside all live routing modules', async () => {
  const sources = await Promise.all(LIVE_ROUTING_URLS.map((url) => readFile(url, 'utf8')));
  for (const source of sources) assert.equal(source.includes('archetype-card-contract'), false);
});

const SECONDARY_CARDS = Object.freeze([
  ['worker', new URL('../../.openclaw/agents/mure-scout.md', import.meta.url)],
  ['verifier', new URL('../../.openclaw/agents/mure-calibrator.md', import.meta.url)],
  ['verifier', new URL('../../.openclaw/agents/mure-oracle.md', import.meta.url)],
]);

test('secondary worker and verifier cards pass generic card validation', async () => {
  for (const [expectedArchetype, url] of SECONDARY_CARDS) {
    const source = await readFile(url, 'utf8');
    const detected = detectArchetype(source);
    assert.equal(detected, expectedArchetype);
    const result = validateCard(source);
    assert.equal(result.ok, true, `${url.href}: ${result.errors.join('; ')}`);
  }
});
