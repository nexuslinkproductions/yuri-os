import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KAGAMI_CANONICAL_STATE_ROOT,
  assertNoProtectedCanonicalState,
  buildClaudeControlPacket,
  buildKagamiControlDomain,
  classifyKagamiTask,
  summarizeDomainForPrompt,
} from './kagami-control-domain.mjs';

test('Kagami control domain keeps canonical state in YURI-owned runtime paths', () => {
  const domain = buildKagamiControlDomain();

  assert.equal(domain.stateRoot, KAGAMI_CANONICAL_STATE_ROOT);
  assert.ok(domain.stateFiles.every((file) => file.startsWith(`${KAGAMI_CANONICAL_STATE_ROOT}/`)));
  assert.deepEqual(assertNoProtectedCanonicalState(domain.stateFiles), { ok: true, blocked: [] });
});

test('Kagami control domain rejects protected canonical state paths', () => {
  assert.throws(
    () => assertNoProtectedCanonicalState(['.claude/state/pulse-bus.jsonl']),
    /protected runtime surfaces/,
  );
  assert.throws(
    () => assertNoProtectedCanonicalState(['backend/data/customer.json']),
    /protected runtime surfaces/,
  );
});

test('domain makes Claude Opus a verified co-main, not unchecked owner', () => {
  const domain = buildKagamiControlDomain();
  const claude = domain.roles.claudeOpusComain;

  assert.equal(claude.id, 'claude-opus-comain');
  assert.equal(claude.authority, 'co-main-architect-and-coder');
  assert.match(claude.verificationRule, /Codex\/main independently verifies/);
  assert.ok(claude.compatibilityAliases.includes('claude-opus-audit'));
});

test('critical cyber tasks require engagement scope before execution', () => {
  const classified = classifyKagamiTask('Run a client red team scan and prepare Upgreat proof.');

  assert.equal(classified.taskTier, 'critical');
  assert.equal(classified.requiresCyberEngagement, true);
  assert.equal(classified.authorizationState, 'engagement-required');
  assert.ok(classified.advisoryLanes.includes('claude-opus-comain'));
});

test('internal control-plane work can route to Opus co-main by complexity', () => {
  const classified = classifyKagamiTask('Expand Kagami Claude Codex symbiotic control plane architecture.');

  assert.equal(classified.taskTier, 'critical');
  assert.equal(classified.requiresCyberEngagement, false);
  assert.equal(classified.recommendedPrimary, 'claude-opus-comain');
});

test('Claude control packet carries protected path, commit, push, and verification rails', () => {
  const packet = buildClaudeControlPacket({
    objective: 'Design Kagami control domain',
    allowedFiles: ['_SYSTEM/docs/example.md'],
    acceptanceCriteria: ['Codex verifies output'],
  });

  assert.equal(packet.lane, 'claude-opus-comain');
  assert.equal(packet.rails.noProtectedReads, true);
  assert.equal(packet.rails.noCommit, true);
  assert.equal(packet.rails.noPush, true);
  assert.equal(packet.rails.codexDoubleCheckRequired, true);
  assert.ok(packet.forbiddenPaths.includes('.claude/state/'));
  assert.ok(packet.requiredOutput.includes('codex-verification-notes'));
});

test('prompt summary states authority and protected runtime rule', () => {
  const summary = summarizeDomainForPrompt();

  assert.match(summary, /Claude Opus may co-build/);
  assert.match(summary, /Codex\/main verifies/);
  assert.match(summary, /compatibility-only/);
  assert.doesNotMatch(summary, /ENKI/);
});
