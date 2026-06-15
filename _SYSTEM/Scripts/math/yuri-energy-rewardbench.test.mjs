// yuri-energy-rewardbench.test.mjs
// Synthetic fixture ledger → test all rewardbench metrics.
// Tests: pairwiseAccuracy, bestOfN, ece, rewardbenchReport, resolveRows.
// Edge cases: empty ledger, all-ties, perfect calibration, inverted gate, missing outcomes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const _HERE = fileURLToPath(new URL('.', import.meta.url));
const TMP_DIR = join(_HERE, '..', '..', 'state', 'test-rewardbench');
const TMP_FILE = join(TMP_DIR, 'fixture-shadow.jsonl');

function sha16(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

// ── Helpers ──────────────────────────────────────────────────────────────────
function makePrediction(id, confidence, effect = 'survives', ts = '2026-06-15T00:00:00.000Z') {
  return {
    type: 'prediction',
    id,
    subject: `test-${id}`,
    change: { decision: 'accept', regime: 'action', event: 'Proposal Accepted' },
    predictedEffects: [{ target: 'proposal-survives', effect, confidence }],
    source: 'energy-gate',
    ts,
  };
}

function makeOutcome(predictionId, effect = 'survived', ts = '2026-06-15T01:00:00.000Z') {
  return {
    type: 'outcome',
    predictionId,
    observedEffects: [{ target: 'proposal-survives', effect }],
    ts,
  };
}

function writeFixture(rows) {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(TMP_FILE, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function cleanup() {
  try { unlinkSync(TMP_FILE); } catch {}
}

// ── Import the module under test ─────────────────────────────────────────────
// Dynamic import so we can use the TMP_FILE path
async function loadModule() {
  return await import('./yuri-energy-rewardbench.mjs');
}

// ── TESTS ────────────────────────────────────────────────────────────────────

describe('resolveRows', () => {
  it('pairs predictions with outcomes by id', async () => {
    const rows = [
      makePrediction('a', 0.7),
      makePrediction('b', 0.3),
      makeOutcome('a', 'survived'),
      makeOutcome('b', 'reverted'),
    ];
    writeFixture(rows);
    const { resolveRows, readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].id, 'a');
    assert.equal(resolved[0].confidence, 0.7);
    assert.equal(resolved[0].hit, true);
    assert.equal(resolved[1].id, 'b');
    assert.equal(resolved[1].confidence, 0.3);
    assert.equal(resolved[1].hit, false);
    cleanup();
  });

  it('skips predictions without matching outcomes', async () => {
    const rows = [
      makePrediction('a', 0.7),
      makePrediction('b', 0.3),
      makeOutcome('a', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'a');
    cleanup();
  });

  it('returns empty for empty ledger', async () => {
    writeFixture([]);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    assert.equal(resolved.length, 0);
    cleanup();
  });
});

describe('pairwiseAccuracy', () => {
  it('perfect: higher confidence always correct', async () => {
    const rows = [
      makePrediction('a', 0.9), makeOutcome('a', 'survived'),
      makePrediction('b', 0.8), makeOutcome('b', 'survived'),
      makePrediction('c', 0.3), makeOutcome('c', 'reverted'),
      makePrediction('d', 0.2), makeOutcome('d', 'reverted'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { pairwiseAccuracy } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = pairwiseAccuracy(ledger);
    assert.equal(result.n, 4);
    // Pairs with different confidence AND different outcomes:
    // (a,c): a(0.9,survived) vs c(0.3,reverted) → higher=a, hit=true → correct
    // (a,d): a(0.9,survived) vs d(0.2,reverted) → higher=a, hit=true → correct
    // (b,c): b(0.8,survived) vs c(0.3,reverted) → higher=b, hit=true → correct
    // (b,d): b(0.8,survived) vs d(0.2,reverted) → higher=b, hit=true → correct
    // (a,b): same outcome → tie
    // (c,d): same outcome → tie
    assert.equal(result.total, 4);
    assert.equal(result.correct, 4);
    assert.equal(result.pairwiseAccuracy, 1.0);
    cleanup();
  });

  it('inverted: higher confidence always wrong', async () => {
    const rows = [
      makePrediction('a', 0.9), makeOutcome('a', 'reverted'),
      makePrediction('b', 0.8), makeOutcome('b', 'reverted'),
      makePrediction('c', 0.3), makeOutcome('c', 'survived'),
      makePrediction('d', 0.2), makeOutcome('d', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { pairwiseAccuracy } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = pairwiseAccuracy(ledger);
    assert.equal(result.total, 4);
    assert.equal(result.correct, 0);
    assert.equal(result.pairwiseAccuracy, 0.0);
    cleanup();
  });

  it('chance: random outcomes', async () => {
    // 4 predictions, 2 survive, 2 revert, confidence uncorrelated
    const rows = [
      makePrediction('a', 0.9), makeOutcome('a', 'reverted'),
      makePrediction('b', 0.7), makeOutcome('b', 'survived'),
      makePrediction('c', 0.5), makeOutcome('c', 'reverted'),
      makePrediction('d', 0.3), makeOutcome('d', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { pairwiseAccuracy } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = pairwiseAccuracy(ledger);
    // Pairs with different confidence AND different outcomes:
    // (a,b): a(0.9,reverted) vs b(0.7,survived) → higher=a, hit=false → wrong
    // (a,d): a(0.9,reverted) vs d(0.3,survived) → higher=a, hit=false → wrong
    // (b,c): b(0.7,survived) vs c(0.5,reverted) → higher=b, hit=true → correct
    // (b,d): b(0.7,survived) vs d(0.3,survived) → same outcome → tie
    // (c,d): c(0.5,reverted) vs d(0.3,survived) → higher=c, hit=false → wrong
    assert.equal(result.total, 4);
    assert.equal(result.correct, 1);
    assert.equal(result.pairwiseAccuracy, 0.25);
    cleanup();
  });

  it('all same confidence → no pairs', async () => {
    const rows = [
      makePrediction('a', 0.5), makeOutcome('a', 'survived'),
      makePrediction('b', 0.5), makeOutcome('b', 'reverted'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { pairwiseAccuracy } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = pairwiseAccuracy(ledger);
    assert.equal(result.total, 0);
    assert.equal(result.pairwiseAccuracy, null);
    assert.equal(result.tiesSameConfidence, 1);
    cleanup();
  });

  it('all same outcome → no pairs', async () => {
    const rows = [
      makePrediction('a', 0.9), makeOutcome('a', 'survived'),
      makePrediction('b', 0.3), makeOutcome('b', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { pairwiseAccuracy } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = pairwiseAccuracy(ledger);
    assert.equal(result.total, 0);
    assert.equal(result.pairwiseAccuracy, null);
    assert.equal(result.tiesSameOutcome, 1);
    cleanup();
  });
});

describe('bestOfN', () => {
  it('picks correct winner from groups', async () => {
    // Two groups (different dates), each with 4 predictions
    const rows = [
      makePrediction('a1', 0.9, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a1', 'survived'),
      makePrediction('a2', 0.7, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a2', 'survived'),
      makePrediction('a3', 0.5, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a3', 'reverted'),
      makePrediction('a4', 0.3, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a4', 'reverted'),
      makePrediction('b1', 0.2, 'survives', '2026-06-15T00:00:00Z'), makeOutcome('b1', 'reverted'),
      makePrediction('b2', 0.4, 'survives', '2026-06-15T00:00:00Z'), makeOutcome('b2', 'reverted'),
      makePrediction('b3', 0.6, 'survives', '2026-06-15T00:00:00Z'), makeOutcome('b3', 'survived'),
      makePrediction('b4', 0.8, 'survives', '2026-06-15T00:00:00Z'), makeOutcome('b4', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { bestOfN } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = bestOfN(ledger, { n: 4 });
    // Group 2026-06-14: top by confidence = a1(0.9) → survived → correct
    // Group 2026-06-15: top by confidence = b4(0.8) → survived → correct
    assert.equal(result.total, 2);
    assert.equal(result.correct, 2);
    assert.equal(result.bestOfN, 1.0);
    cleanup();
  });

  it('skips groups with fewer than N predictions', async () => {
    const rows = [
      makePrediction('a1', 0.9, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a1', 'survived'),
      makePrediction('a2', 0.7, 'survives', '2026-06-14T00:00:00Z'), makeOutcome('a2', 'survived'),
      makePrediction('b1', 0.5, 'survives', '2026-06-15T00:00:00Z'), makeOutcome('b1', 'reverted'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { bestOfN } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = bestOfN(ledger, { n: 4 });
    assert.equal(result.total, 0);
    assert.equal(result.bestOfN, null);
    cleanup();
  });
});

describe('ece', () => {
  it('perfect calibration: confidence = hit rate in every bucket', async () => {
    // 0.4-0.6 bucket: 2 predictions at 0.5, 1 hit → hitRate=0.5, meanConf=0.5 → absError=0
    // 0.6-0.8 bucket: 2 predictions at 0.7, 1 hit → hitRate=0.5, meanConf=0.7 → absError=0.2
    // 0.8-1 bucket: 2 predictions at 0.9, 2 hits → hitRate=1.0, meanConf=0.9 → absError=0.1
    const rows = [
      makePrediction('a', 0.5), makeOutcome('a', 'survived'),
      makePrediction('b', 0.5), makeOutcome('b', 'reverted'),
      makePrediction('c', 0.7), makeOutcome('c', 'survived'),
      makePrediction('d', 0.7), makeOutcome('d', 'reverted'),
      makePrediction('e', 0.9), makeOutcome('e', 'survived'),
      makePrediction('f', 0.9), makeOutcome('f', 'survived'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { ece } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = ece(ledger);
    assert.equal(result.n, 6);
    // Bucket 0.4-0.6: n=2, weight=2/6, absError=|0.5-0.5|=0
    // Bucket 0.6-0.8: n=2, weight=2/6, absError=|0.7-0.5|=0.2
    // Bucket 0.8-1:   n=2, weight=2/6, absError=|0.9-1.0|=0.1
    // ECE = (2/6)*0 + (2/6)*0.2 + (2/6)*0.1 = 0 + 0.0667 + 0.0333 = 0.1
    assert.ok(Math.abs(result.ece - 0.1) < 0.001, `ECE should be ~0.1, got ${result.ece}`);
    cleanup();
  });

  it('empty ledger → null ECE', async () => {
    writeFixture([]);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { ece } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const result = ece(ledger);
    assert.equal(result.ece, null);
    assert.equal(result.n, 0);
    cleanup();
  });
});

describe('rewardbenchReport', () => {
  it('GATE_HAS_SIGNAL verdict with strong fixture', async () => {
    // Build 60 resolved predictions with strong monotonic signal:
    // 30 high-confidence (0.8-0.99) → ALL survive (hit=true at high conf)
    // 30 low-confidence (0.1-0.3) → ALL revert (hit=false at low conf)
    // Within-group conf differs (so same-outcome ties are absent for high-survive
    // and low-revert), and between-group is all diff-outcome: 30*30=900 pairs,
    // all higher=high (hit=true) → pairwise=1.0. The previous fixture interleaved
    // 5/30 wrong-direction rows in each group, which flipped 250/900 of the
    // pairs and capped pairwise at 0.694 — the SIGNAL is real, the fixture
    // shape was wrong.
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const conf = 0.8 + (i / 30) * 0.19;
      rows.push(makePrediction(`hi-${i}`, conf));
      rows.push(makeOutcome(`hi-${i}`, 'survived'));
    }
    for (let i = 0; i < 30; i++) {
      const conf = 0.1 + (i / 30) * 0.2;
      rows.push(makePrediction(`lo-${i}`, conf));
      rows.push(makeOutcome(`lo-${i}`, 'reverted'));
    }
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { rewardbenchReport } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const report = rewardbenchReport(ledger, { file: TMP_FILE });
    assert.equal(report.n, 60);
    assert.ok(report.pairwiseAccuracy > 0.8, `pairwise should be >0.8, got ${report.pairwiseAccuracy}`);
    assert.equal(report.verdict, 'GATE_HAS_SIGNAL');
    cleanup();
  });

  it('GATE_NEAR_CHANCE verdict with random fixture', async () => {
    // Deterministic seeded PRNG (mulberry32) so the test is reproducible and
    // does not depend on Math.random()'s non-deterministic state. N=500 chosen
    // so the sample-mean pairwise accuracy lands reliably in the
    // GATE_NEAR_CHANCE band; with N=60 the SE of pairwise is too wide and
    // GATE_INVERTED fires ~1-in-5 runs purely from sampling noise. The fixture
    // remains "uncorrelated random" — confidence uniform on [0.3, 0.9],
    // outcomes uniform on {survived, reverted} — so a chance-like verdict is
    // the honest answer.
    function mulberry32(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const N = 500;
    const SEED = 0x5EED1;
    const rng = mulberry32(SEED);
    const rows = [];
    for (let i = 0; i < N; i++) {
      const conf = 0.3 + rng() * 0.6;
      const survives = rng() < 0.5;
      rows.push(makePrediction(`rnd-${i}`, conf));
      rows.push(makeOutcome(`rnd-${i}`, survives ? 'survived' : 'reverted'));
    }
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { rewardbenchReport } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const report = rewardbenchReport(ledger, { file: TMP_FILE });
    assert.equal(report.n, N);
    // With random outcomes, pairwise should be near 0.5
    assert.ok(report.pairwiseAccuracy >= 0.3 && report.pairwiseAccuracy <= 0.7,
      `pairwise should be near 0.5, got ${report.pairwiseAccuracy}`);
    // Verdict should be GATE_NEAR_CHANCE or INCONCLUSIVE
    assert.ok(['GATE_NEAR_CHANCE', 'INCONCLUSIVE', 'GATE_HAS_SIGNAL_WITH_CAVEATS'].includes(report.verdict),
      `verdict should be chance-like, got ${report.verdict}`);
    cleanup();
  });

  it('GATE_INVERTED verdict with inverted fixture', async () => {
    // Build 60 resolved predictions that produce a TRULY INVERTED signal:
    // 30 high-confidence (0.8-0.99) → ALL revert (hit=false at high conf)
    // 30 low-confidence (0.1-0.3)  → ALL survive (hit=true at low conf)
    // Within-group same-outcome → no within-group pairs. Between-group is all
    // diff-outcome: 30*30=900 pairs, all higher=high (hit=false) → pairwise=0.0.
    // The previous fixture put 50/60 reverts at conf 0.8-0.98 and 10/60
    // survives at conf 0.98-0.99, which actually produced a CORRECT signal
    // (pairwise=1.0) — the gate was right, the fixture shape was wrong.
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const conf = 0.8 + (i / 30) * 0.19;
      rows.push(makePrediction(`inv-hi-${i}`, conf));
      rows.push(makeOutcome(`inv-hi-${i}`, 'reverted'));
    }
    for (let i = 0; i < 30; i++) {
      const conf = 0.1 + (i / 30) * 0.2;
      rows.push(makePrediction(`inv-lo-${i}`, conf));
      rows.push(makeOutcome(`inv-lo-${i}`, 'survived'));
    }
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { rewardbenchReport } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const report = rewardbenchReport(ledger, { file: TMP_FILE });
    assert.equal(report.n, 60);
    assert.ok(report.pairwiseAccuracy < 0.45, `pairwise should be <0.45, got ${report.pairwiseAccuracy}`);
    assert.equal(report.verdict, 'GATE_INVERTED');
    cleanup();
  });

  it('INSUFFICIENT_DATA verdict with <50 resolved', async () => {
    const rows = [];
    for (let i = 0; i < 10; i++) {
      rows.push(makePrediction(`few-${i}`, 0.5 + i * 0.05));
      rows.push(makeOutcome(`few-${i}`, i < 5 ? 'survived' : 'reverted'));
    }
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { rewardbenchReport } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const report = rewardbenchReport(ledger, { file: TMP_FILE });
    assert.equal(report.n, 10);
    assert.equal(report.verdict, 'INSUFFICIENT_DATA');
    cleanup();
  });
});

describe('edge cases', () => {
  it('handles corrupt lines gracefully', async () => {
    const rows = [
      makePrediction('a', 0.7), makeOutcome('a', 'survived'),
      'this is not json',
      makePrediction('b', 0.3), makeOutcome('b', 'reverted'),
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    assert.equal(resolved.length, 2);
    cleanup();
  });

  it('handles predictions with no predictedEffects', async () => {
    const rows = [
      { type: 'prediction', id: 'a', subject: 'test', change: {}, predictedEffects: [], source: 'energy-gate', ts: '2026-06-15T00:00:00Z' },
      { type: 'outcome', predictionId: 'a', observedEffects: [{ target: 'proposal-survives', effect: 'survived' }], ts: '2026-06-15T01:00:00Z' },
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    // No "proposal-survives" in predictedEffects → skipped by resolveRows
    assert.equal(resolved.length, 0);
    cleanup();
  });

  it('handles outcomes with no observedEffects', async () => {
    const rows = [
      makePrediction('a', 0.7),
      { type: 'outcome', predictionId: 'a', observedEffects: [], ts: '2026-06-15T01:00:00Z' },
    ];
    writeFixture(rows);
    const { readLedger } = await import('../prediction-ledger.mjs');
    const { resolveRows: resolve } = await loadModule();
    const ledger = readLedger({ file: TMP_FILE });
    const resolved = resolve(ledger);
    // scorePrediction will find no "proposal-survives" in observed → primary is null
    assert.equal(resolved.length, 0);
    cleanup();
  });
});
