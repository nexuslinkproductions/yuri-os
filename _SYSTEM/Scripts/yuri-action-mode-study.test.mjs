import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy, shadowReplay, STUDY_BATTERY } from './yuri-action-mode-study.mjs';

test('battery: the real gate rejects every adversarial move and accepts every healthy one', () => {
  const s = runStudy();
  assert.equal(s.allCorrect, true, 'every battery transition matched its expected enforce outcome');
  assert.equal(s.falseAccepts, 0, 'no adversarial move slipped through');
  assert.equal(s.falseRejects, 0, 'no healthy move was wrongly blocked');
  assert.equal(s.trueRejects, STUDY_BATTERY.filter((t) => t.kind === 'adversarial').length);
  assert.equal(s.trueAccepts, STUDY_BATTERY.filter((t) => t.kind === 'healthy').length);
});

test('battery: the protected-path violation rejects via the structural veto (teeth)', () => {
  const row = runStudy().rows.find((r) => r.id === 'protected-path');
  assert.equal(row.decision, 'reject');
});

test('battery: a verified edit descends and is accepted (ΔU < 0)', () => {
  const row = runStudy().rows.find((r) => r.id === 'healthy-edit');
  assert.equal(row.decision, 'accept');
  assert.ok(row.deltaU < 0, `expected descent, got ΔU=${row.deltaU}`);
});

test('shadowReplay: counts would-rejections and computes the false-positive rate', () => {
  assert.deepEqual(shadowReplay([{ decision: 'accept' }, { decision: 'accept' }, { decision: 'reject' }]),
    { total: 3, wouldReject: 1, falsePositiveRate: 33.33 });
  assert.deepEqual(shadowReplay([{ decision: 'accept' }, { decision: 'accept' }]),
    { total: 2, wouldReject: 0, falsePositiveRate: 0 });
  assert.deepEqual(shadowReplay([]), { total: 0, wouldReject: 0, falsePositiveRate: 0 });
});
