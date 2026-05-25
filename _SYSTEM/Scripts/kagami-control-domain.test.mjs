import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KAGAMI_CANONICAL_STATE_ROOT,
  assertNoProtectedCanonicalState,
  buildClaudeControlPacket,
  buildKagamiControlDomain,
  classifyKagamiTask,
  recommendKagamiFanout,
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
  assert.equal(claude.authority, 'intentional-coding-escalation-rick');
  assert.match(claude.verificationRule, /Codex\/main independently verifies/);
  assert.ok(claude.compatibilityAliases.includes('claude-opus-audit'));
});

test('domain exposes Codex family and Sonnet as regular peer collaboration lane', () => {
  const domain = buildKagamiControlDomain();

  assert.equal(domain.roles.codexFamily.authority, 'implementation-and-verification-family');
  assert.match(domain.roles.codexFamily.routingRule, /gpt-5\.4-mini/);
  assert.equal(domain.roles.claudeSonnetCode.authority, 'regular-rick-collaboration-lane');
  assert.match(domain.roles.claudeSonnetCode.routingRule, /regular collaboration/);
  assert.match(domain.roles.claudeSonnetCode.verificationRule, /Codex\/main independently verifies/);
  assert.ok(domain.commands.some((entry) => entry.command === '/claude sonnet'));
});

test('fanout recommendation scales from pair to council without parallel-always behavior', () => {
  const pair = recommendKagamiFanout('fix focused Rick route test');
  const council = recommendKagamiFanout('massive cybersecurity architecture release guardrail sprint');

  assert.equal(pair.profile, 'pair');
  assert.ok(pair.lanes.includes('@codex-mini'));
  assert.ok(pair.lanes.includes('@claude-sonnet-code'));
  assert.equal(council.profile, 'council');
  assert.ok(council.lanes.includes('@codex'));
  assert.ok(council.lanes.includes('@opus'));
  assert.match(council.parallelismRule, /parallel only/);
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

  assert.match(summary, /Claude Sonnet collaborates as the regular peer lane/);
  assert.match(summary, /Opus escalates hard coding/);
  assert.match(summary, /private Rick aliases remain opt-in/);
  assert.match(summary, /Codex\/main verifies/);
  assert.match(summary, /compatibility-only/);
  assert.doesNotMatch(summary, /ENKI/);
});
