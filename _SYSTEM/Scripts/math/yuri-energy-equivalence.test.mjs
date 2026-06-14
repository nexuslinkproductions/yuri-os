// Tests for yuri-energy-equivalence.mjs — cross-era equivalence checker.
// GREEN: v2/v3 co-rank on drift-isolated states + zero-drift exact.
// RED: a sign-flipped era is caught. Plus: the barrier-confound is documented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genState } from './yuri-energy-invariants.mjs';
import {
  v2Scorer, v3Scorer, equivalenceCheck, brokenEraCheck, scrambledEraCheck, zeroDriftIdentical,
  genDriftState, CORANK_MIN, ANTI_MAX,
} from './yuri-energy-equivalence.mjs';

test('GREEN: v2 and v3 co-rank on drift-isolated states (ρ >= CORANK_MIN)', () => {
  const r = equivalenceCheck(v2Scorer, v3Scorer, { trials: 4000, generator: genDriftState });
  assert.equal(r.coRanks, true, `ρ=${r.rho}`);
  assert.ok(r.rho >= CORANK_MIN);
});

test('GREEN: zero drift => U bit-identical across eras', () => {
  const z = zeroDriftIdentical();
  assert.equal(z.identical, true, `v2=${z.v2} v3=${z.v3}`);
});

test('RED: sign-flipped-drift era is caught (anti-correlated <= ANTI_MAX vs both)', () => {
  const red = brokenEraCheck({ trials: 3000 });
  assert.equal(red.caught, true, `ρv2=${red.rho_v2} ρv3=${red.rho_v3}`);
  assert.ok(red.rho_v2 <= ANTI_MAX && red.rho_v3 <= ANTI_MAX);
});

test('RED (grey-zone): a scrambled era is rejected by the corank gate but is NOT a sign-flip', () => {
  // The non-tautological discrimination control. brokenEraCheck's sign-flip is ρ=−1 by construction
  // (algebraically inert vs v3); a scramble is the realistic DECORRELATED corruption between
  // "equivalent" (ρ≥CORANK_MIN) and "negated" (ρ≤ANTI_MAX) — the grey middle the gate must still reject.
  const s = scrambledEraCheck({ trials: 3000 });
  assert.ok(s.decorrelated, `scramble should be ~0, got ρ=${s.rhoFull}`);
  assert.ok(s.notAntiCorrelated, `scramble must NOT be the trivial sign-flip extreme (ρ=${s.rhoFull} > ${ANTI_MAX})`);
  assert.equal(s.caught, true, 'the corank gate must reject a scrambled era');
  assert.ok(s.rhoFull < CORANK_MIN);
  assert.ok(s.rhoPartial < 0.99, `a half-scrambled era must lose co-ranking, got ρ=${s.rhoPartial}`);
});

test('determinism: scrambledEraCheck is seed-stable', () => {
  assert.equal(scrambledEraCheck({ trials: 800, seed: 5 }).rhoFull, scrambledEraCheck({ trials: 800, seed: 5 }).rhoFull);
});

test('intended-divergence profile is reported and non-trivial on the high-drift tail', () => {
  const r = equivalenceCheck(v2Scorer, v3Scorer, { trials: 4000, generator: genDriftState });
  // top-tail agreement < 1 is the W₁-vs-KL reordering by design (not a failure)
  assert.ok(r.tailAgreement.top >= 0 && r.tailAgreement.top < 1);
  assert.ok(r.tailAgreement.bottom >= 0 && r.tailAgreement.bottom <= 1);
});

test('barrier-confound documented: full-state ρ is inflated vs drift-isolated ρ', () => {
  const iso = equivalenceCheck(v2Scorer, v3Scorer, { trials: 3000, generator: genDriftState });
  const full = equivalenceCheck(v2Scorer, v3Scorer, { trials: 3000, generator: genState });
  // barriers dominate full U → near-perfect correlation that hides the drift divergence
  assert.ok(full.rho > iso.rho, `full ρ=${full.rho} should exceed isolated ρ=${iso.rho}`);
  assert.ok(full.rho > 0.99);
});

test('determinism: same seed => same ρ', () => {
  const a = equivalenceCheck(v2Scorer, v3Scorer, { trials: 800, seed: 99, generator: genDriftState });
  const b = equivalenceCheck(v2Scorer, v3Scorer, { trials: 800, seed: 99, generator: genDriftState });
  assert.equal(a.rho, b.rho);
});
