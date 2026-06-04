import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marginalBits, redundancyVerdict, DEFAULT_QUALITY_FLOOR_CHARS } from './yuri-mdl.mjs';

// A long, lexically-varied "rest of store" so gzip has real context to predict against.
const REST = [
  'The subconscious memory loop demotes low-retrievability traces into the cold store.',
  'FSRS power-law retention scores how retrievable a memory is right now.',
  'Cross-domain transfer maps a mechanism from one sector into an unrelated sector.',
  'The energy gate records work-dynamics ΔU as progress versus regress to a trace.',
].join('\n').repeat(3);

test('identical body vs a rest that already contains it → ~0 marginal bits (redundant)', () => {
  // body is one of the rest's own sentences, repeated — fully predicted by the rest.
  const body = 'FSRS power-law retention scores how retrievable a memory is right now. '.repeat(3);
  const { bits } = marginalBits(body, REST);
  assert.ok(bits < 0.2, `near-duplicate restatement should be low marginal bits, got ${bits.toFixed(3)}`);
});

test('byte-identical body and rest → marginal bits near zero', () => {
  const body = REST;
  const { bits } = marginalBits(body, REST);
  // gzip's window makes a repeated block compress to a small (not literally zero) marginal —
  // ~0.046 in practice. The load-bearing property is redundant << irreducible floor (0.15)
  // and << a unique body (~0.67); 0.1 proves that cleanly without over-tightening to gzip noise.
  assert.ok(bits < 0.1, `byte-identical content should be near-zero marginal bits, got ${bits.toFixed(3)}`);
});

test('orthogonal unique body → high marginal bits (irreducible given rest)', () => {
  const body = 'Quantum tunneling in Josephson junctions enables flux qubits via macroscopic coherence over the barrier potential boundary conditions across the niobium oxide layer.';
  const { bits } = marginalBits(body, REST);
  assert.ok(bits > 0.5, `lexically novel body should be high marginal bits, got ${bits.toFixed(3)}`);
});

test('redundancyVerdict: near-duplicate flagged redundant; unique protected', () => {
  const dup = 'Cross-domain transfer maps a mechanism from one sector into an unrelated sector. '.repeat(3);
  const uniq = 'Persistent homology Betti numbers track topological holes across a filtration of simplicial complexes for clustering stability proofs here.';
  assert.equal(redundancyVerdict(dup, REST, { redundancyFloor: 0.15 }).redundant, true);
  const u = redundancyVerdict(uniq, REST, { redundancyFloor: 0.15 });
  assert.equal(u.redundant, false);
  assert.equal(u.irreducible, true);
});

test('GUARD: low-quality / near-empty body is NEVER protected as novel', () => {
  // A short body would compress poorly against rest and look "novel" by raw bits — the
  // quality floor must mark it lowQuality and the verdict must NOT protect it.
  const v = redundancyVerdict('xyz qqq', REST, { redundancyFloor: 0.15 });
  assert.equal(v.lowQuality, true);
  assert.equal(v.irreducible, false, 'low-quality body must not be protected as irreducible');
  assert.equal(v.redundant, false, 'low-quality body is neutral on the redundancy axis (relocator quality floor handles it)');
});

test('edge: empty body → bits 0, lowQuality true (nothing to protect)', () => {
  const v = marginalBits('', REST);
  assert.equal(v.bits, 0);
  assert.equal(v.lowQuality, true);
});

test('edge: empty rest → body is alone → irreducible (bits = 1)', () => {
  const body = 'A standalone unique insight with enough length to clear the quality floor comfortably here for the test to be meaningful.';
  const v = marginalBits(body, '');
  assert.equal(v.bits, 1);
});

test('edge: NaN / non-string inputs do not throw and never NaN/Inf', () => {
  for (const [b, r] of [[NaN, REST], [null, REST], [REST, NaN], [undefined, undefined], [{}, []]]) {
    const v = marginalBits(b, r);
    assert.ok(Number.isFinite(v.bits), `bits finite for body=${String(b)} rest=${String(r)}`);
    assert.ok(v.bits >= 0, 'bits non-negative');
  }
});

test('marginal bits never negative even when joint compresses below rest (noise clamp)', () => {
  // Pathological: body is whitespace that helps gzip pack rest tighter → raw could go < 0.
  const v = marginalBits('   \n   \n   '.padEnd(DEFAULT_QUALITY_FLOOR_CHARS + 10, ' \n'), REST);
  assert.ok(v.raw >= 0, 'raw clamped to >= 0');
  assert.ok(v.bits >= 0, 'bits clamped to >= 0');
});
