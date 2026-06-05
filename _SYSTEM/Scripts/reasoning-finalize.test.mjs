#!/usr/bin/env node
// Regression coverage for the capture-gap safety net (the deepseek empty-content fix).
import assert from 'node:assert/strict';
import { resolveFinalText } from './reasoning-finalize.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; };

// 1. Real content present -> returned as-is, reasoning ignored (the normal path; nemotron + happy deepseek).
t('content present -> content', () => {
  assert.equal(resolveFinalText('the answer', 'lots of thinking', 'stop'), 'the answer');
});

// 2. Content present even on length-truncation -> still returned (do not clobber a real partial answer).
t('content present + finish=length -> content', () => {
  assert.equal(resolveFinalText('partial answer', 'thinking', 'length'), 'partial answer');
});

// 3. The bug shape: empty content + reasoning + finish=length -> tagged budget-exhausted fallback (NOT empty).
t('empty content + reasoning + length -> budget tag + reasoning', () => {
  const out = resolveFinalText('', 'deep chain of thought', 'length');
  assert.match(out, /reasoning-only — model exhausted its token budget/);
  assert.match(out, /deep chain of thought$/);
  assert.notEqual(out.trim(), '');
});

// 4. Empty content + reasoning + finish=stop -> no-separate-answer tag (still non-empty).
t('empty content + reasoning + stop -> no-answer tag + reasoning', () => {
  const out = resolveFinalText('', 'some reasoning', 'stop');
  assert.match(out, /reasoning-only, no separate answer/);
  assert.match(out, /some reasoning$/);
});

// 5. Whitespace-only content is treated as empty -> falls back to reasoning.
t('whitespace content -> reasoning fallback', () => {
  assert.match(resolveFinalText('   \n  ', 'r', 'length'), /^\[reasoning-only/);
});

// 6. Both empty -> preserve the empty-string contract (no spurious tag).
t('both empty -> empty', () => {
  assert.equal(resolveFinalText('', '', 'stop'), '');
  assert.equal(resolveFinalText('', '   ', 'length'), '');
});

// 7. Non-string / nullish inputs -> safe (no throw, content wins when reasoning absent).
t('nullish inputs -> safe', () => {
  assert.equal(resolveFinalText(null, null, undefined), '');
  assert.equal(resolveFinalText('ok', null, null), 'ok');
  assert.equal(resolveFinalText(undefined, 'r', 'length').startsWith('[reasoning-only'), true);
});

console.log(`reasoning-finalize: ${n} cases passed`);
