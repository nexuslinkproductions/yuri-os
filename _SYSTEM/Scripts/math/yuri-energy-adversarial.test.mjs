// _SYSTEM/Scripts/math/yuri-energy-adversarial.test.mjs
// Tests for the adversarial probe harness.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProbe, compareEvasion } from './yuri-energy-adversarial.mjs';
import { DEFAULT_WEIGHTS } from './energy-calibration-contract.mjs';
import { scenario, expectVeto } from './experiments/adversarial-probe.mjs';

describe('yuri-energy-adversarial', () => {

  // ── Baseline must be clean ────────────────────────────

  it('baseline: vetoEvasions === 0 at DEFAULT weights', () => {
    const result = runProbe();
    assert.equal(result.vetoEvasions.length, 0,
      `Expected 0 veto evasions at baseline, got ${result.vetoEvasions.length}`);
  });

  it('baseline: softEvasions === 0 at DEFAULT weights', () => {
    const result = runProbe();
    assert.equal(result.softEvasions.length, 0,
      `Expected 0 soft evasions at baseline, got ${result.softEvasions.length}`);
  });

  // ── Bounded masking budget ────────────────────────────

  it('stale-evidence at-cap (count>=50) is REJECTED at DEFAULT', () => {
    const result = runProbe();
    const atCapIdx = scenario.findIndex(t => t.label.includes('at-cap'));
    assert.ok(atCapIdx >= 0, 'at-cap transition not found in scenario');
    const evaded = result.evasions.some(e => e.index === atCapIdx);
    assert.equal(evaded, false,
      'at-cap transition must be rejected — bounded masking budget holds');
  });

  // ── Identity comparison ───────────────────────────────

  it('compareEvasion(DEFAULT, DEFAULT) → ok:true, both deltas 0', () => {
    const r = compareEvasion(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS);
    assert.equal(r.ok, true, 'Identity comparison should be ok');
    assert.equal(r.vetoEvasionDelta, 0);
    assert.equal(r.softEvasionDelta, 0);
    assert.equal(r.baseline.total, 0);
    assert.equal(r.candidate.total, 0);
  });

  // ── Evasion detection ─────────────────────────────────

  it('candidate with raised alpha causes soft evasion → ok:false', () => {
    // Masking budget for class1 (entropy-vs-kl):
    //   entropy credit ≈ 2.303·α;  KL penalty ≈ 3.516.
    //   Break-even α ≈ 1.527.  At α=1.6 the credit exceeds the penalty,
    //   causing the class1 transition to be accepted (evasion).
    const candidate = { ...DEFAULT_WEIGHTS, alpha: 1.6 };
    const r = compareEvasion(DEFAULT_WEIGHTS, candidate);
    assert.equal(r.ok, false, 'Candidate with α=1.6 should raise evasion');
    assert.ok(r.softEvasionDelta > 0,
      `Expected softEvasionDelta > 0, got ${r.softEvasionDelta}`);
    assert.equal(r.vetoEvasionDelta, 0,
      `Expected vetoEvasionDelta = 0, got ${r.vetoEvasionDelta}`);
  });

  // ── Determinism ───────────────────────────────────────

  it('determinism: runProbe({seed:5}) twice → deepStrictEqual', () => {
    const a = runProbe({ seed: 5 });
    const b = runProbe({ seed: 5 });
    assert.deepStrictEqual(a, b);
  });

  it('determinism: compareEvasion twice → deepStrictEqual', () => {
    const candidate = { ...DEFAULT_WEIGHTS, beta: 2.5 };
    const a = compareEvasion(DEFAULT_WEIGHTS, candidate, { seed: 7 });
    const b = compareEvasion(DEFAULT_WEIGHTS, candidate, { seed: 7 });
    assert.deepStrictEqual(a, b);
  });

  // ── Scenario shape (redundant with probe test but explicit) ──

  it('scenario shape: stateBefore/stateAfter on every transition; expectVeto covers all', () => {
    assert.ok(scenario.length > 0);
    assert.equal(expectVeto.length, scenario.length);
    for (let i = 0; i < scenario.length; i++) {
      assert.ok(scenario[i].stateBefore, `[${i}] ${scenario[i].label}: missing stateBefore`);
      assert.ok(scenario[i].stateAfter, `[${i}] ${scenario[i].label}: missing stateAfter`);
      assert.ok(expectVeto[i], `[${i}]: missing expectVeto entry`);
    }
  });
});
