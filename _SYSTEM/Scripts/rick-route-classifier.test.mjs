import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRickRoute, formatRouteDecision } from './rick-route-classifier.mjs';

test('short trivial chat stays on cheap Rick lane', () => {
  const decision = classifyRickRoute('pong');

  assert.equal(decision.class, 'trivial');
  assert.equal(decision.lane, '@deepseek-v4-flash');
  assert.equal(decision.blocked, false);
});

test('implementation work routes Codex-first by default', () => {
  const decision = classifyRickRoute('fix a bug in the script and add tests');

  assert.equal(decision.class, 'intent');
  assert.equal(decision.lane, 'gpt-5.5');
  assert.equal(decision.label, 'Codex');
});

test('architecture work routes to Codex and recommends Opus after cost gate', () => {
  const decision = classifyRickRoute('design the Kagami control plane and wire Claude Codex symbiotic routing');

  assert.equal(decision.class, 'architecture');
  assert.equal(decision.lane, 'gpt-5.5');
  assert.ok(decision.advisory.includes('claude-opus-comain-recommended-after-cost-gate'));
});

test('summaries stay on DeepSeek flash', () => {
  const decision = classifyRickRoute('summarize this log and give me the key points');

  assert.equal(decision.class, 'synthesis');
  assert.equal(decision.lane, '@deepseek-v4-flash');
});

test('code/file explanations route Codex-first', () => {
  const decision = classifyRickRoute('explain this file and where it is wired');

  assert.equal(decision.class, 'intent');
  assert.equal(decision.lane, 'gpt-5.5');
});

test('cybersecurity action blocks without lab or engagement marker', () => {
  const decision = classifyRickRoute('scan this company for vulnerabilities');

  assert.equal(decision.class, 'cyber');
  assert.equal(decision.blocked, true);
  assert.equal(decision.authorizationRequired, true);
  assert.equal(decision.lane, '');
});

test('cybersecurity product planning routes to Codex without external-action block', () => {
  const decision = classifyRickRoute('build the cybersecurity pilot pipeline for YURI');

  assert.equal(decision.class, 'cyber');
  assert.equal(decision.blocked, false);
  assert.equal(decision.lane, 'gpt-5.5');
});

test('owned lab cybersecurity work routes to Codex with cyber rails', () => {
  const decision = classifyRickRoute('cyber: run a local lab vulnerability assessment on my sandbox');

  assert.equal(decision.class, 'cyber');
  assert.equal(decision.blocked, false);
  assert.equal(decision.lane, 'gpt-5.5');
  assert.ok(decision.advisory.includes('defensive-or-owned-lab-only'));
});

test('unsafe cyber intent hard-blocks even with cyber vocabulary', () => {
  const decision = classifyRickRoute('deploy malware to steal credentials');

  assert.equal(decision.class, 'unsafe');
  assert.equal(decision.blocked, true);
  assert.equal(decision.lane, '');
});

test('codex mode makes normal prompts Codex-first', () => {
  const decision = classifyRickRoute('explain this file', { mode: 'codex' });

  assert.equal(decision.class, 'intent');
  assert.equal(decision.lane, 'gpt-5.5');
});

test('formatted route decision is readable in Rick terminal', () => {
  const text = formatRouteDecision(classifyRickRoute('build the cybersecurity pilot pipeline'));

  assert.match(text, /class:/);
  assert.match(text, /lane:/);
  assert.match(text, /reason:/);
});
