// Hermetic node:test suite for orderflow-edge-audit.mjs — synthetic JSONL fixtures only, NO live
// network, NO real state ledgers (protected paths untouched). Fixtures live under a /tmp dir unique
// to this run (pid-suffixed) and are cleaned up in `after`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { auditOrderflowEdge, MIN_TRADES, DSR_CONFIDENCE } from './orderflow-edge-audit.mjs';

let dir;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'orderflow-edge-audit-test-'));
});

after(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
});

function writeLedgers(name, paperRows, predRows = []) {
  const paperPath = path.join(dir, `${name}-paper.jsonl`);
  const predPath = path.join(dir, `${name}-pred.jsonl`);
  writeFileSync(paperPath, paperRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(predPath, predRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { paperPath, predPath };
}

/** Build a `close` row matching afl-paper.mjs's real emitted shape. */
function closeRow({ inst = 'BTCUSDT-OF', fid = 'obi', side = 'long', qty = 1, entryPx, exitPx, eFees = 0, xFee = 0, ots, cts }) {
  const gross = (side === 'long' ? 1 : -1) * (exitPx - entryPx) * qty;
  const net = gross - eFees - xFee;
  return {
    type: 'close', inst, fid, side, qty,
    entryPx, exitPx, grossPnl: gross, netPnl: net,
    eFees, xFee, reason: 'signal', ots, cts, fills: 1, _seq: ots,
  };
}

function predRow({ inst = 'BTCUSDT-OF', fid = 'obi', ots, side = 'long', confidence = 0.7 }) {
  return {
    type: 'prediction', id: `pred_${inst}_${fid}_${ots}`,
    subject: `${inst}/${fid}`, change: `enter_${side}`,
    predictedEffects: [{ target: 'mark_price', effect: side === 'long' ? 'up' : 'down', confidence }],
    source: 'afl-paper', ts: ots,
  };
}

// ── (a) LOSING ledger — like the real -15.8bps baseline. Every trade net-negative after cost. ──
test('(a) losing ledger (net negative, ~baseline -15.8bps) -> verdict NO_EDGE', () => {
  const base = 1_700_000_000;
  const paperRows = [];
  const predRows = [];
  // 8 trades, entry 100, exit consistently BELOW entry for longs (real loss), small fees on top ->
  // net bps clusters near -15..-20bps, mirroring the reported -15.8bps baseline.
  for (let i = 0; i < 8; i++) {
    const ots = base + i * 3600;
    const cts = ots + 900;
    const entryPx = 100;
    const exitPx = 100 * (1 - 0.0012 - (i % 3) * 0.0002); // -12 to -16 bps gross move against the position
    paperRows.push(closeRow({ fid: 'obi', side: 'long', qty: 10, entryPx, exitPx, eFees: 0.02, xFee: 0.02, ots, cts }));
    predRows.push(predRow({ fid: 'obi', ots, side: 'long', confidence: 0.6 }));
  }
  const { paperPath, predPath } = writeLedgers('losing', paperRows, predRows);
  const result = auditOrderflowEdge({ symbol: 'BTCUSDT', paperLedgerPath: paperPath, predLedgerPath: predPath });

  assert.equal(result.trades, 8);
  assert.ok(result.netEdgeBps < 0, `expected negative netEdgeBps, got ${result.netEdgeBps}`);
  assert.equal(result.verdict, 'NO_EDGE');
  assert.ok(result.reasons.some((r) => r.includes('netEdgeBps')), 'reason cites netEdgeBps<=0');
});

// ── (b) WINNING ledger — clearly positive, enough trades, low variance -> should clear DSR too. ──
test('(b) clearly-winning synthetic ledger with enough trades -> verdict EDGE', () => {
  const base = 1_800_000_000;
  const paperRows = [];
  const predRows = [];
  // 30 trades, consistent +25bps gross move net of tiny fees -> strong, low-variance positive Sharpe,
  // easily clears DSR at nTrials=1 (mirrors factor-evaluator's own "genuine edge" smoke fixture).
  for (let i = 0; i < 30; i++) {
    const ots = base + i * 3600;
    const cts = ots + 900;
    const entryPx = 100;
    // small alternating jitter so the series isn't perfectly deterministic (still all net-positive)
    const jitter = (i % 5) * 0.0001;
    const exitPx = 100 * (1 + 0.0028 + jitter);
    paperRows.push(closeRow({ fid: 'obi', side: 'long', qty: 10, entryPx, exitPx, eFees: 0.02, xFee: 0.02, ots, cts }));
    predRows.push(predRow({ fid: 'obi', ots, side: 'long', confidence: 0.8 }));
  }
  const { paperPath, predPath } = writeLedgers('winning', paperRows, predRows);
  const result = auditOrderflowEdge({ symbol: 'ETHUSDT', paperLedgerPath: paperPath, predLedgerPath: predPath });

  assert.equal(result.trades, 30);
  assert.ok(result.netEdgeBps > 0, `expected positive netEdgeBps, got ${result.netEdgeBps}`);
  assert.ok(result.deflatedSharpe.passes, `expected DSR to pass, got dsr=${result.deflatedSharpe.dsr}`);
  assert.equal(result.verdict, 'EDGE');
});

// ── (c) 2-trade ledger -> INSUFFICIENT (below MIN_TRADES), regardless of sign. ──
test('(c) 2-trade ledger -> verdict INSUFFICIENT', () => {
  const base = 1_900_000_000;
  const paperRows = [
    closeRow({ fid: 'obi', side: 'long', qty: 5, entryPx: 100, exitPx: 100.5, eFees: 0.01, xFee: 0.01, ots: base, cts: base + 900 }),
    closeRow({ fid: 'obi', side: 'long', qty: 5, entryPx: 100, exitPx: 99.8, eFees: 0.01, xFee: 0.01, ots: base + 3600, cts: base + 4500 }),
  ];
  const predRows = [
    predRow({ fid: 'obi', ots: base, side: 'long', confidence: 0.65 }),
    predRow({ fid: 'obi', ots: base + 3600, side: 'long', confidence: 0.55 }),
  ];
  const { paperPath, predPath } = writeLedgers('sparse', paperRows, predRows);
  const result = auditOrderflowEdge({ symbol: 'SOLUSDT', paperLedgerPath: paperPath, predLedgerPath: predPath });

  assert.equal(result.trades, 2);
  assert.ok(result.trades < MIN_TRADES, 'sanity: 2 < MIN_TRADES');
  assert.equal(result.verdict, 'INSUFFICIENT');
});

// ── fail-soft: absent ledger files -> INSUFFICIENT, never a throw ──
test('absent ledger paths degrade to INSUFFICIENT (fail-soft, no throw)', () => {
  const result = auditOrderflowEdge({
    symbol: 'NOPEUSDT',
    paperLedgerPath: path.join(dir, 'does-not-exist-paper.jsonl'),
    predLedgerPath: path.join(dir, 'does-not-exist-pred.jsonl'),
  });
  assert.equal(result.trades, 0);
  assert.equal(result.verdict, 'INSUFFICIENT');
});

// ── sanity on exported constants ──
test('exported gate constants are sane', () => {
  assert.equal(typeof MIN_TRADES, 'number');
  assert.ok(MIN_TRADES >= 1);
  assert.equal(DSR_CONFIDENCE, 0.95);
});
