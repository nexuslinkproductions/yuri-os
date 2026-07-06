// Hermetic tests for the morning-brief "what's next" ranker (pure function, no sources).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankNextActions } from './morning-brief.mjs';

test('rankNextActions: critical doctor issue ranks top (high/100)', () => {
  const r = rankNextActions({ sections: { doctor: { verdict: 'unhealthy', critical: 2, high: 1 } } });
  assert.equal(r[0].severity, 'high');
  assert.equal(r[0].score, 100);
  assert.equal(r[0].source, 'doctor');
  assert.match(r[0].action, /Fix 2 critical/);
});

test('rankNextActions: overnight failures (80) outrank uncommitted files (30)', () => {
  const r = rankNextActions({ sections: { overnight: { fail: 3, ok: 5 }, git: { statusCount: 10 } } });
  assert.equal(r[0].source, 'overnight');
  assert.equal(r[0].score, 80);
  assert.equal(r[r.length - 1].source, 'git');
  assert.equal(r[r.length - 1].score, 30);
});

test('rankNextActions: empty or unavailable sections → no actions', () => {
  assert.deepEqual(rankNextActions({ sections: {} }), []);
  assert.deepEqual(rankNextActions({ sections: { doctor: { unavailable: true, reason: 'x' } } }), []);
  assert.deepEqual(rankNextActions({}), []);
});

test('rankNextActions: high doctor finding de-dupes critical (else-if branch, score 60)', () => {
  const r = rankNextActions({ sections: { doctor: { verdict: 'degraded', critical: 0, high: 4 } } });
  assert.equal(r.length, 1);
  assert.equal(r[0].score, 60);
  assert.match(r[0].action, /Review 4 high-severity/);
});

test('rankNextActions: result is sorted descending by score', () => {
  const r = rankNextActions({ sections: { doctor: { critical: 1, verdict: 'bad' }, git: { statusCount: 5 }, overnight: { fail: 2, ok: 1 } } });
  const scores = r.map((a) => a.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});
