#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPassiveProbePrompt,
  scoreClaudeArchitectureResponse,
} from './claude-architecture-probe.mjs';

test('Claude architecture probe prompt stays passive', () => {
  const prompt = buildPassiveProbePrompt();

  assert.match(prompt, /No tools\. Do not read files\./);
  assert.match(prompt, /active session defaults/);
  assert.match(prompt, /Max 9 terse lines/);
  assert.doesNotMatch(prompt, /read _SYSTEM|open SOUL|follow this architecture/i);
});

test('Claude architecture probe scores a YURI-native response as healthy', () => {
  const response = [
    'Default identity/tone: Rick/SOUL, warm, direct, structured, evidence-first adversarial ally.',
    'Codex/main is the final verifier, arbiter, and release gate before trust or commits.',
    'Claude runs as a continuous interactive CLI tmux PTY session, not automation prompts.',
    'Never use Claude SDK, claude -p, --print, one-shot prompt route, or no-session calls.',
    'Protected surfaces include backend/data/, .claude/state/, .claude/history/, .env, node_modules, .amp/.',
    'DeepSeek stays advisory synthesis/EOT review, useful for counterarguments and long-context checks.',
    'Long-session drift is managed with compact handoffs, checkpoints, fresh context, evidence, verification, and reset when needed.',
  ].join('\n');

  const score = scoreClaudeArchitectureResponse(response);

  assert.equal(score.ok, true);
  assert.equal(score.score, 1);
  assert.deepEqual(score.missing, []);
});

test('Claude architecture probe flags generic drift', () => {
  const response = [
    'I am a helpful assistant and can work on coding tasks.',
    'I will try to be careful and ask questions if needed.',
    'Long sessions can get confusing, so summaries may help.',
  ].join('\n');

  const score = scoreClaudeArchitectureResponse(response);

  assert.equal(score.ok, false);
  assert.ok(score.score < 0.72);
  assert.ok(score.missing.includes('codex-final-verifier'));
  assert.ok(score.missing.includes('claude-continuous-pty'));
  assert.ok(score.missing.includes('rick-soul-persona'));
});
