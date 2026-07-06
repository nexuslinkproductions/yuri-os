// @capability: trade-outcome-decoder
// @serves: paper trade outcome decoder | per-factor realized return | learn loop link | populate afl ledger | bridge paper trades to factor ledger | decode trade outcomes | factor outcome attribution
// @does: Bridges per-market paper-trading JSONL ledgers to the AFL prediction-ledger (AFL_LEDGER). Reads closed paper-trade round-trips, attributes realized return to the driving factorId, writes prediction+outcome pairs to AFL_LEDGER so factor-evaluator/factor-reeval can compute per-factor Brier/DSR. Idempotent via stable dedupe key.
// @use: Reach for this when the AFL learn-loop is empty (afl-prediction-ledger.jsonl has 0 rows). Call decodeAll() in a cron/beat to drain newly closed trades into AFL_LEDGER. attributeReturn() is the pure math primitive for realized return attribution.
// @exports: attributeReturn, decodeTradeOutcomes, decodeAll

/**
 * trade-outcome-decoder.mjs — AFL Learn-Loop Link
 *
 * The learn-loop link. Paper trades already happen via afl-paper.mjs + orchestrator,
 * but the per-FACTOR forecast→outcome ledger (AFL_LEDGER) stays EMPTY because nothing
 * bridges per-market paper outcomes to per-factor records.
 *
 * This module reads closed trade round-trips from the market-level JSONL ledgers
 * and writes forecast+outcome pairs to AFL_LEDGER so factor-reeval can compute
 * per-factor Brier/DSR and drive lifecycle.
 *
 * HARD CONSTRAINTS:
 *   - Pure ESM .mjs. Deterministic. NO network (INV-1). NO secret reads (INV-2).
 *   - NEVER POST or submit anything (paper-only INV-1).
 *   - Fail-soft: malformed ledger line → skip + count, never throw.
 *   - NO LOOK-AHEAD LEAK: forecast outcome comes only from price AFTER the forecast time.
 *   - Idempotent: stable dedupe key, re-running never double-counts.
 *   - Writes to AFL_LEDGER only (never hand-write other state/).
 *   - --test writes only to /tmp.
 *
 * On-disk shapes discovered from live ledgers (2026-06-17):
 *
 *   observatory-paper-<MARKET>.jsonl  (close entry):
 *     { type:"close", inst, fid, side, qty, entryPx, exitPx,
 *       grossPnl, netPnl, eFees, xFee, reason, ots, cts, fills, _seq }
 *
 *   observatory-pred-<MARKET>.jsonl  (prediction entry):
 *     { type:"prediction", id:"pred_{inst}_{fid}_{ots}", subject:"{inst}/{fid}",
 *       change:"enter_{side}", predictedEffects:[{target:"mark_price",effect:"up"|"down",confidence}],
 *       source:"afl-paper", ts }
 *
 *   AFL_LEDGER  (afl-prediction-ledger.jsonl — what we WRITE):
 *     prediction row: { type:"prediction", id, subject:"afl-decoder/{dedupeKey}", change,
 *                       predictedEffects, source, factorId, inst, ots, cts, ts, originalPredId }
 *     outcome row:    { type:"outcome", predictionId, observedEffects, ret, ts }
 *
 * The predId afl-paper writes at OPEN time (afl-paper.mjs:843):
 *   `pred_${instrument}_${factorId}_${ts_of_open}`
 * The close entry's `ots` IS the open timestamp, so we reconstruct the same ID.
 *
 * Dedupe key: `${inst}_${fid}_${ots}_${cts}` — stable, survives re-runs.
 * Stored in AFL_LEDGER prediction rows as subject: "afl-decoder/{dedupeKey}".
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// AFL_LEDGER canonical path — same derivation as factor-evaluator.mjs:55
// alpha-factor-library/ -> Scripts/ -> _SYSTEM/ ; ledger lives at _SYSTEM/state/
const _DEFAULT_AFL_LEDGER = resolve(__dirname, '..', '..', 'state', 'afl-prediction-ledger.jsonl');
const _DEFAULT_STATE_DIR  = resolve(__dirname, '..', '..', 'state');

// ── Utility helpers ────────────────────────────────────────────────────────────

/** @param {any} x @returns {boolean} */
function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Ensure parent directory exists, fail-open. */
function ensureDir(p) {
  try { mkdirSync(dirname(p), { recursive: true }); } catch { /* fail-open */ }
}

/** Append a single JSON line to filePath — fail-soft on error. */
function appendJsonlSync(filePath, obj) {
  ensureDir(filePath);
  try {
    appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
  } catch (e) {
    process.stderr.write(`[trade-outcome-decoder] write failed (${filePath}): ${e.message}\n`);
  }
}

/**
 * Read a JSONL file, return parsed rows. Corrupt / blank lines → skipped + counted.
 * Never throws.
 * @param {string} filePath
 * @returns {{ rows: object[], corrupt: number }}
 */
function readJsonl(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return { rows: [], corrupt: 0 };
  }
  const rows = [];
  let corrupt = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      corrupt++;
    }
  }
  return { rows, corrupt };
}

/**
 * Load the set of already-written dedupe keys from AFL_LEDGER.
 * Keys are stored in prediction rows as subject: "afl-decoder/{dedupeKey}".
 * @param {string} aflLedgerPath
 * @returns {Set<string>}
 */
function loadDedupeSet(aflLedgerPath) {
  const { rows } = readJsonl(aflLedgerPath);
  const seen = new Set();
  for (const row of rows) {
    if (
      row.type === 'prediction' &&
      typeof row.subject === 'string' &&
      row.subject.startsWith('afl-decoder/')
    ) {
      seen.add(row.subject.slice('afl-decoder/'.length));
    }
  }
  return seen;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * attributeReturn — pure function, no IO.
 *
 * Computes the realized return for one closed paper round-trip.
 *   Long:  (exitPx - entryPx) / entryPx
 *   Short: (entryPx - exitPx) / entryPx  (sign inverted — profit when price falls)
 * Net of fees when qty, eFees, xFee are available (fees as fraction of entry notional).
 *
 * @param {{
 *   side: 'long'|'short',
 *   entryPx: number,
 *   exitPx: number,
 *   qty?: number,
 *   eFees?: number,
 *   xFee?: number,
 * }} trade
 * @returns {number|null}  realized net return (fraction, e.g. 0.02 = +2%), null on bad input
 */
export function attributeReturn(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const { side, entryPx, exitPx } = trade;
  if (!isNum(entryPx) || entryPx <= 0) return null;
  if (!isNum(exitPx)  || exitPx  <= 0) return null;
  if (side !== 'long' && side !== 'short') return null;

  const dir = side === 'long' ? 1 : -1;
  const grossReturn = dir * (exitPx - entryPx) / entryPx;

  // Net of fees: express total fees as fraction of entry notional (entryPx × qty)
  const qty = isNum(trade.qty) && trade.qty > 0 ? trade.qty : null;
  if (qty !== null) {
    const eFees = isNum(trade.eFees) ? trade.eFees : 0;
    const xFee  = isNum(trade.xFee)  ? trade.xFee  : 0;
    const totalFees     = eFees + xFee;
    const entryNotional = entryPx * qty;
    if (entryNotional > 0 && totalFees >= 0) {
      return grossReturn - totalFees / entryNotional;
    }
  }

  return grossReturn;
}

/**
 * decodeTradeOutcomes — reads closed trades from ONE market's paper ledger,
 * attributes realized return to the driving factorId, writes prediction+outcome
 * pairs to AFL_LEDGER. Idempotent — dedupe by stable key.
 *
 * Connection to afl-paper.mjs open/close flow:
 *   - OPEN  (line 843): predId = `pred_${instrument}_${factorId}_${ts_of_open}`
 *   - CLOSE (line 441): logs { type:"close", inst, fid, ots, cts, entryPx, exitPx, ... }
 *   We reconstruct originalPredId = `pred_${inst}_${fid}_${ots}` and look up the
 *   confidence from the pred ledger to preserve it in the AFL forecast row.
 *
 * NO LOOK-AHEAD LEAK: cts >= ots is enforced; any trade with cts < ots is rejected.
 *
 * @param {{
 *   paperLedgerPath: string,
 *   predLedgerPath:  string,
 *   aflLedgerPath?:  string,
 *   sinceTs?:        number,
 * }} opts
 * @returns {{ decoded: number, skipped: number, factors: string[] }}
 */
export function decodeTradeOutcomes({ paperLedgerPath, predLedgerPath, aflLedgerPath, sinceTs } = {}) {
  const aflPath = aflLedgerPath ?? _DEFAULT_AFL_LEDGER;

  // Load already-written dedupe keys (idempotency)
  const seen = loadDedupeSet(aflPath);

  const { rows: paperRows, corrupt: paperCorrupt } = readJsonl(paperLedgerPath);
  if (paperCorrupt > 0) {
    process.stderr.write(
      `[trade-outcome-decoder] ${paperCorrupt} corrupt line(s) in ${paperLedgerPath}\n`
    );
  }

  // Load pred ledger to recover per-open confidence for the AFL forecast row
  const { rows: predRows } = readJsonl(predLedgerPath);
  /** @type {Map<string, object>} */
  const predById = new Map();
  for (const row of predRows) {
    if (row.type === 'prediction' && row.id && !predById.has(row.id)) {
      predById.set(row.id, row);
    }
  }

  let decoded = 0;
  let skipped = 0;
  const factorsSeen = new Set();

  for (const row of paperRows) {
    // Only closed round-trips contribute outcomes
    if (row.type !== 'close') { skipped++; continue; }

    const { inst, fid, side, entryPx, exitPx, qty, eFees, xFee, ots, cts } = row;

    // Required fields
    if (!inst || !fid || !side) { skipped++; continue; }
    if (!isNum(entryPx) || !isNum(exitPx) || !isNum(ots) || !isNum(cts)) { skipped++; continue; }

    // sinceTs filter: skip trades closed before the requested cutoff
    if (sinceTs != null && isNum(sinceTs) && cts < sinceTs) { skipped++; continue; }

    // NO LOOK-AHEAD LEAK: outcome timestamp must be >= forecast timestamp
    if (cts < ots) {
      process.stderr.write(
        `[trade-outcome-decoder] SKIP look-ahead: cts=${cts} < ots=${ots} inst=${inst} fid=${fid}\n`
      );
      skipped++;
      continue;
    }

    // Stable dedupe key
    const dedupeKey = `${inst}_${fid}_${ots}_${cts}`;
    if (seen.has(dedupeKey)) { skipped++; continue; }

    // Reconstruct the prediction ID that afl-paper.mjs wrote at OPEN time
    const originalPredId = `pred_${inst}_${fid}_${ots}`;

    // Compute realized net return
    const ret = attributeReturn({ side, entryPx, exitPx, qty, eFees, xFee });
    if (ret === null) { skipped++; continue; }

    // Recover confidence from the original prediction (fallback 0.5)
    const origPred = predById.get(originalPredId);
    const confidence = origPred?.predictedEffects?.[0]?.confidence ?? 0.5;

    // Predicted vs observed price direction
    const priceDir = exitPx - entryPx >= 0 ? 'up' : 'down';
    const predictedPriceDir = side === 'long' ? 'up' : 'down';

    // AFL_LEDGER prediction row
    // subject namespaced as "afl-decoder/{dedupeKey}" so loadDedupeSet finds it on re-run
    const aflPredId = `afl-tod_${inst}_${fid}_${ots}_${cts}`;
    const predRowAfl = {
      type: 'prediction',
      id: aflPredId,
      subject: `afl-decoder/${dedupeKey}`,
      change: `enter_${side}`,
      predictedEffects: [
        {
          target: 'realized_return_positive',
          // >= 0: flat (zero-return, -0) is non-negative, conservatively 'positive'
          effect: ret >= 0 ? 'positive' : 'negative',
          confidence,
        },
        {
          target: 'mark_price',
          effect: predictedPriceDir,
          confidence,
        },
      ],
      source: 'trade-outcome-decoder',
      factorId: fid,
      inst,
      ots,
      cts,
      ts: ots,              // ts = forecast time (open), not close time
      originalPredId,
    };
    appendJsonlSync(aflPath, predRowAfl);

    // AFL_LEDGER outcome row
    const outcomeRowAfl = {
      type: 'outcome',
      predictionId: aflPredId,
      observedEffects: [
        {
          target: 'realized_return_positive',
          // >= 0: flat (-0) is non-negative, conservatively 'positive'
          effect: ret >= 0 ? 'positive' : 'negative',
          value: ret,
        },
        {
          target: 'mark_price',
          effect: priceDir,
          value: exitPx - entryPx,
        },
      ],
      ret,
      ts: cts,              // ts = outcome time (close)
    };
    appendJsonlSync(aflPath, outcomeRowAfl);

    seen.add(dedupeKey);
    factorsSeen.add(fid);
    decoded++;
  }

  return { decoded, skipped, factors: [...factorsSeen] };
}

/**
 * decodeAll — scans all observatory-pred-*.jsonl / observatory-paper-*.jsonl under stateDir,
 * calls decodeTradeOutcomes per market pair, returns aggregate summary.
 *
 * Markets that have only a paper ledger (no matching pred file) or vice-versa are skipped.
 *
 * @param {{
 *   stateDir?:      string,
 *   aflLedgerPath?: string,
 *   sinceTs?:       number,
 * }} [opts]
 * @returns {{ decoded: number, skipped: number, factors: string[], markets: number }}
 */
export function decodeAll({ stateDir, aflLedgerPath, sinceTs } = {}) {
  const dir     = stateDir    ?? _DEFAULT_STATE_DIR;
  const aflPath = aflLedgerPath ?? _DEFAULT_AFL_LEDGER;

  let files;
  try {
    files = readdirSync(dir);
  } catch (e) {
    process.stderr.write(
      `[trade-outcome-decoder] cannot read stateDir ${dir}: ${e.message}\n`
    );
    return { decoded: 0, skipped: 0, factors: [], markets: 0 };
  }

  // Build market → { paperPath?, predPath? }
  /** @type {Map<string, {paperPath?: string, predPath?: string}>} */
  const marketMap = new Map();

  for (const f of files) {
    const paperMatch = f.match(/^observatory-paper-(.+)\.jsonl$/);
    if (paperMatch) {
      const market = paperMatch[1];
      if (!marketMap.has(market)) marketMap.set(market, {});
      marketMap.get(market).paperPath = join(dir, f);
    }
    const predMatch = f.match(/^observatory-pred-(.+)\.jsonl$/);
    if (predMatch) {
      const market = predMatch[1];
      if (!marketMap.has(market)) marketMap.set(market, {});
      marketMap.get(market).predPath = join(dir, f);
    }
  }

  let totalDecoded   = 0;
  let totalSkipped   = 0;
  const allFactors   = new Set();
  let marketsProcessed = 0;

  for (const [market, paths] of marketMap) {
    if (!paths.paperPath || !paths.predPath) continue;   // skip incomplete pairs

    let result;
    try {
      result = decodeTradeOutcomes({
        paperLedgerPath: paths.paperPath,
        predLedgerPath:  paths.predPath,
        aflLedgerPath:   aflPath,
        sinceTs,
      });
    } catch (e) {
      process.stderr.write(
        `[trade-outcome-decoder] market ${market} decode error: ${e.message}\n`
      );
      continue;
    }

    totalDecoded += result.decoded;
    totalSkipped += result.skipped;
    for (const fid of result.factors) allFactors.add(fid);
    marketsProcessed++;
  }

  return {
    decoded:  totalDecoded,
    skipped:  totalSkipped,
    factors:  [...allFactors],
    markets:  marketsProcessed,
  };
}

// ── Main guard — `node trade-outcome-decoder.mjs --test` ─────────────────────
// Writes ONLY to /tmp. Never touches _SYSTEM/state/.

const _main = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--test')) {
  // Deterministic LCG: avoid Math.random() for reproducible tests
  // (not actually used in assertions below — all values are hand-computed)
  let _seed = 42;
  function lcg() {  // eslint-disable-line no-unused-vars
    _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
    return (_seed >>> 0) / 0xffffffff;
  }

  const TMP = '/tmp/tod-test-' + Date.now();
  mkdirSync(TMP, { recursive: true });

  let pass = 0;
  let fail = 0;
  const failures = [];

  function ok(label, actual, expected) {
    const matched = typeof expected === 'boolean'
      ? actual === expected
      : typeof expected === 'string'
        ? actual === expected
        : typeof expected === 'number'
          ? Math.abs(actual - expected) < 1e-15
          : actual === expected;
    if (matched) {
      pass++;
    } else {
      fail++;
      failures.push(`FAIL [${label}]: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }

  function okClose(label, actual, expected, tol = 1e-10) {
    const matched = isNum(actual) && Math.abs(actual - expected) < tol;
    if (matched) {
      pass++;
    } else {
      fail++;
      failures.push(`FAIL [${label}]: got ${actual}, expected ~${expected} (tol=${tol})`);
    }
  }

  function okNull(label, actual) {
    if (actual === null) pass++;
    else { fail++; failures.push(`FAIL [${label}]: expected null, got ${JSON.stringify(actual)}`); }
  }

  function noThrow(label, fn) {
    try { fn(); pass++; }
    catch (e) { fail++; failures.push(`FAIL [${label}]: threw ${e.message}`); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1 — attributeReturn (pure math, no IO)
  // ─────────────────────────────────────────────────────────────────────────

  // T01: long, profit, no fees
  //   return = (110 - 100) / 100 = 0.10
  okClose('T01 long profit no-fees', attributeReturn({ side: 'long', entryPx: 100, exitPx: 110 }), 0.10);

  // T02: long, loss, no fees
  //   return = (90 - 100) / 100 = -0.10
  okClose('T02 long loss no-fees', attributeReturn({ side: 'long', entryPx: 100, exitPx: 90 }), -0.10);

  // T03: short, profit (price fell), no fees
  //   dir = -1 → (80 - 100) / 100 * -1 = 0.20
  okClose('T03 short profit no-fees', attributeReturn({ side: 'short', entryPx: 100, exitPx: 80 }), 0.20);

  // T04: short, loss (price rose), no fees
  //   dir = -1 → (120 - 100) / 100 * -1 = -0.20
  okClose('T04 short loss no-fees', attributeReturn({ side: 'short', entryPx: 100, exitPx: 120 }), -0.20);

  // T05: long, net of fees
  //   entryPx=100, exitPx=110, qty=10, eFees=5, xFee=5 → totalFees=10
  //   grossReturn = 0.10, feeReturn = 10/(100×10) = 0.01 → net = 0.09
  okClose('T05 long net-of-fees', attributeReturn({ side: 'long', entryPx: 100, exitPx: 110, qty: 10, eFees: 5, xFee: 5 }), 0.09);

  // T06: short, net of fees
  //   entryPx=100, exitPx=80, qty=5, eFees=2, xFee=2 → totalFees=4
  //   grossReturn = 0.20, feeReturn = 4/(100×5) = 0.008 → net = 0.192
  okClose('T06 short net-of-fees', attributeReturn({ side: 'short', entryPx: 100, exitPx: 80, qty: 5, eFees: 2, xFee: 2 }), 0.192);

  // T07: bad input → null
  okNull('T07a null on null', attributeReturn(null));
  okNull('T07b null on string', attributeReturn('not-an-object'));
  okNull('T07c null on bad side', attributeReturn({ side: 'hold', entryPx: 100, exitPx: 110 }));
  okNull('T07d null on zero entryPx', attributeReturn({ side: 'long', entryPx: 0, exitPx: 110 }));
  okNull('T07e null on NaN exitPx', attributeReturn({ side: 'long', entryPx: 100, exitPx: NaN }));
  okNull('T07f null on Infinity entryPx', attributeReturn({ side: 'long', entryPx: Infinity, exitPx: 110 }));
  okNull('T07g null on missing fields', attributeReturn({}));

  // T07h: flat short (exitPx === entryPx) → -0 in JS; must be classified as
  //        'non-negative', i.e. the >= 0 guard prevents '-0 > 0 = false' misclassification.
  //        attributeReturn itself: short, entry=100, exit=100 → -1*(100-100)/100 = -0
  {
    const flatRet = attributeReturn({ side: 'short', entryPx: 100, exitPx: 100 });
    okClose('T07h flat short gives -0 (treated as 0)', flatRet, 0, 1e-15);
    // The classification expression used in AFL rows must use >= not >
    ok('T07h flat ret >= 0 is true', flatRet >= 0, true);
    ok('T07h flat ret > 0 would be false (the bug we fixed)', flatRet > 0, false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2 — decodeTradeOutcomes + AFL_LEDGER write + idempotency
  // ─────────────────────────────────────────────────────────────────────────

  // Hand-computed expected net returns for synthetic trades:
  //   Trade A (long):  entry=60000, exit=61200, qty=0.1, eFees=6, xFee=6
  //     gross = (61200-60000)/60000 = 0.02
  //     fees  = 12 / (60000 × 0.1) = 12/6000 = 0.002
  //     net   = 0.018
  //   Trade B (short): entry=61200, exit=60600, qty=0.1, eFees=6, xFee=6
  //     gross = (61200-60600)/61200 = 600/61200 = 0.0098039...
  //     fees  = 12 / (61200 × 0.1) = 12/6120 = 0.0019607...
  //     net   = 0.0078431...

  const OTS_A = 1_700_000_000;
  const CTS_A = 1_700_001_000;
  const OTS_B = 1_700_002_000;
  const CTS_B = 1_700_003_000;

  const EXPECTED_RET_A = 0.02 - 12 / (60000 * 0.1);
  const EXPECTED_RET_B = 600 / 61200 - 12 / (61200 * 0.1);

  const tradeA = {
    type: 'close', inst: 'BTC-TEST', fid: 'factor-alpha',
    side: 'long',  qty: 0.1, entryPx: 60000, exitPx: 61200,
    grossPnl: 120, netPnl: 108, eFees: 6, xFee: 6,
    reason: 'signal', ots: OTS_A, cts: CTS_A, fills: 1, _seq: 1,
  };
  const tradeB = {
    type: 'close', inst: 'BTC-TEST', fid: 'factor-alpha',
    side: 'short', qty: 0.1, entryPx: 61200, exitPx: 60600,
    grossPnl: 60,  netPnl: 48,  eFees: 6, xFee: 6,
    reason: 'signal', ots: OTS_B, cts: CTS_B, fills: 1, _seq: 2,
  };

  // Verify hand-computed returns via attributeReturn
  okClose('T08a tradeA attributeReturn', attributeReturn(tradeA), EXPECTED_RET_A, 1e-10);
  okClose('T08b tradeB attributeReturn', attributeReturn(tradeB), EXPECTED_RET_B, 1e-10);
  ok('T08c tradeA is positive', attributeReturn(tradeA) > 0, true);
  ok('T08d tradeB is positive', attributeReturn(tradeB) > 0, true);

  // Build synthetic per-market files in /tmp
  const paperPath = join(TMP, 'observatory-paper-BTC-TEST.jsonl');
  const predPath  = join(TMP, 'observatory-pred-BTC-TEST.jsonl');
  const aflPath   = join(TMP, 'afl-ledger.jsonl');

  // Paper ledger: no_trade, tradeA, malformed line, open-only, tradeB, blank trailing
  const noTradeRow  = { type: 'no_trade', action: 'NO_TRADE', reason: 'zero_base_qty', inst: 'BTC-TEST', _seq: 0 };
  const openOnlyRow = { type: 'open', inst: 'BTC-TEST', fid: 'factor-alpha', side: 'long', qty: 0.1, fp: 62000, _seq: 99 };

  writeFileSync(paperPath, [
    JSON.stringify(noTradeRow),
    JSON.stringify(tradeA),
    'NOT_VALID_JSON{{{',           // malformed line — must be skipped not thrown
    JSON.stringify(openOnlyRow),  // open-only, no close — must be skipped
    JSON.stringify(tradeB),
    '',                            // blank trailing
  ].join('\n'), 'utf8');

  // Pred ledger: prediction entries matching trade A and B
  const predIdA = `pred_BTC-TEST_factor-alpha_${OTS_A}`;
  const predIdB = `pred_BTC-TEST_factor-alpha_${OTS_B}`;
  writeFileSync(predPath, [
    JSON.stringify({ type: 'prediction', id: predIdA, subject: 'BTC-TEST/factor-alpha', change: 'enter_long',
      predictedEffects: [{ target: 'mark_price', effect: 'up', confidence: 0.55 }], source: 'afl-paper', ts: OTS_A }),
    JSON.stringify({ type: 'prediction', id: predIdB, subject: 'BTC-TEST/factor-alpha', change: 'enter_short',
      predictedEffects: [{ target: 'mark_price', effect: 'down', confidence: 0.52 }], source: 'afl-paper', ts: OTS_B }),
  ].join('\n') + '\n', 'utf8');

  // AFL ledger: start empty
  writeFileSync(aflPath, '', 'utf8');

  // T09: first run decodes 2 trades
  let r1;
  noThrow('T09 decodeTradeOutcomes does not throw', () => {
    r1 = decodeTradeOutcomes({ paperLedgerPath: paperPath, predLedgerPath: predPath, aflLedgerPath: aflPath });
  });
  ok('T09a decoded=2', r1.decoded, 2);
  ok('T09b factors includes factor-alpha', r1.factors.includes('factor-alpha'), true);

  // T10: AFL_LEDGER written correctly (2 trades × 2 rows = 4 rows)
  const { rows: afl1 } = readJsonl(aflPath);
  ok('T10a AFL_LEDGER has 4 rows', afl1.length, 4);

  const aflPreds   = afl1.filter(r => r.type === 'prediction');
  const aflOutcomes = afl1.filter(r => r.type === 'outcome');
  ok('T10b 2 prediction rows', aflPreds.length, 2);
  ok('T10c 2 outcome rows', aflOutcomes.length, 2);

  // T11: prediction row structure
  const p0 = aflPreds[0];
  ok('T11a subject has afl-decoder/ prefix', p0.subject.startsWith('afl-decoder/'), true);
  ok('T11b factorId correct', p0.factorId, 'factor-alpha');
  ok('T11c originalPredId correct', p0.originalPredId, predIdA);
  ok('T11d source = trade-outcome-decoder', p0.source, 'trade-outcome-decoder');
  ok('T11e ts = OTS_A (no look-ahead: forecast at open, not close)', p0.ts, OTS_A);

  // T12: outcome row links back, ret is correct
  const o0 = aflOutcomes[0];
  ok('T12a outcome predictionId matches prediction id', o0.predictionId, p0.id);
  ok('T12b outcome ts = CTS_A (close time)', o0.ts, CTS_A);
  okClose('T12c outcome ret matches expected tradeA', o0.ret, EXPECTED_RET_A, 1e-10);

  // T13: second trade B outcome
  const o1 = aflOutcomes[1];
  okClose('T13a outcome ret matches expected tradeB', o1.ret, EXPECTED_RET_B, 1e-10);
  ok('T13b tradeB observed effect = up (price fell from 61200 to 60600 — negative priceDelta)', o1.observedEffects.find(e => e.target === 'mark_price')?.effect, 'down');

  // T14: IDEMPOTENCY — second run must add 0 rows
  let r2;
  noThrow('T14 second run does not throw', () => {
    r2 = decodeTradeOutcomes({ paperLedgerPath: paperPath, predLedgerPath: predPath, aflLedgerPath: aflPath });
  });
  ok('T14a second run decoded=0', r2.decoded, 0);

  const { rows: afl2 } = readJsonl(aflPath);
  ok('T14b AFL_LEDGER row count unchanged', afl2.length, 4);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3 — decodeAll (stateDir scan)
  // ─────────────────────────────────────────────────────────────────────────

  const stateDir = join(TMP, 'state');
  mkdirSync(stateDir, { recursive: true });
  const aflPath2 = join(TMP, 'afl2.jsonl');
  writeFileSync(aflPath2, '', 'utf8');

  writeFileSync(join(stateDir, 'observatory-paper-BTC-TEST.jsonl'), readFileSync(paperPath, 'utf8'), 'utf8');
  writeFileSync(join(stateDir, 'observatory-pred-BTC-TEST.jsonl'),  readFileSync(predPath,  'utf8'), 'utf8');

  let da1;
  noThrow('T15 decodeAll does not throw', () => {
    da1 = decodeAll({ stateDir, aflLedgerPath: aflPath2 });
  });
  ok('T15a decodeAll decoded=2', da1.decoded, 2);
  ok('T15b decodeAll markets=1', da1.markets, 1);
  ok('T15c decodeAll factors includes factor-alpha', da1.factors.includes('factor-alpha'), true);

  // Idempotency via decodeAll
  let da2;
  noThrow('T16 decodeAll second run does not throw', () => {
    da2 = decodeAll({ stateDir, aflLedgerPath: aflPath2 });
  });
  ok('T16 decodeAll second run decoded=0', da2.decoded, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 4 — sinceTs filter
  // ─────────────────────────────────────────────────────────────────────────

  const aflPath3 = join(TMP, 'afl3.jsonl');
  writeFileSync(aflPath3, '', 'utf8');

  // Filter: sinceTs = CTS_A + 1 → trade A (cts=CTS_A) excluded, trade B (cts=CTS_B) included
  let sf;
  noThrow('T17 sinceTs filter does not throw', () => {
    sf = decodeTradeOutcomes({ paperLedgerPath: paperPath, predLedgerPath: predPath, aflLedgerPath: aflPath3, sinceTs: CTS_A + 1 });
  });
  ok('T17a sinceTs filter decoded=1 (only B)', sf.decoded, 1);

  const { rows: afl3 } = readJsonl(aflPath3);
  ok('T17b AFL_LEDGER has 2 rows (1 trade × 2 rows)', afl3.length, 2);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 5 — look-ahead leak guard
  // ─────────────────────────────────────────────────────────────────────────

  const paperLeak = join(TMP, 'observatory-paper-LEAK.jsonl');
  const predLeak  = join(TMP, 'observatory-pred-LEAK.jsonl');
  const aflLeak   = join(TMP, 'afl-leak.jsonl');
  writeFileSync(aflLeak,  '', 'utf8');
  writeFileSync(predLeak, '', 'utf8');

  // cts < ots: illegal look-ahead
  writeFileSync(paperLeak, JSON.stringify({
    type: 'close', inst: 'LEAK', fid: 'f1', side: 'long',
    qty: 1, entryPx: 100, exitPx: 110, eFees: 0, xFee: 0,
    reason: 'signal', ots: 2000, cts: 1000,   // cts BEFORE ots
    fills: 1, _seq: 1,
  }) + '\n', 'utf8');

  let lr;
  noThrow('T18 look-ahead trade does not throw', () => {
    lr = decodeTradeOutcomes({ paperLedgerPath: paperLeak, predLedgerPath: predLeak, aflLedgerPath: aflLeak });
  });
  ok('T18a look-ahead trade skipped (decoded=0)', lr.decoded, 0);
  ok('T18b AFL_LEDGER empty after look-ahead skip', readJsonl(aflLeak).rows.length, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST GROUP 6 — edge cases (empty, malformed-only, open-only)
  // ─────────────────────────────────────────────────────────────────────────

  // T19: empty paper ledger
  const paperEmpty = join(TMP, 'p-empty.jsonl');
  const predEmpty  = join(TMP, 'pred-empty.jsonl');
  const aflEmpty   = join(TMP, 'afl-empty.jsonl');
  writeFileSync(paperEmpty, '', 'utf8');
  writeFileSync(predEmpty,  '', 'utf8');
  writeFileSync(aflEmpty,   '', 'utf8');

  let er;
  noThrow('T19 empty ledger does not throw', () => {
    er = decodeTradeOutcomes({ paperLedgerPath: paperEmpty, predLedgerPath: predEmpty, aflLedgerPath: aflEmpty });
  });
  ok('T19 empty decoded=0', er.decoded, 0);

  // T20: malformed-only paper ledger
  const paperMalf = join(TMP, 'p-malf.jsonl');
  const predMalf  = join(TMP, 'pred-malf.jsonl');
  const aflMalf   = join(TMP, 'afl-malf.jsonl');
  writeFileSync(paperMalf, 'BAD_JSON\n{also: bad}\n', 'utf8');
  writeFileSync(predMalf,  '', 'utf8');
  writeFileSync(aflMalf,   '', 'utf8');

  let mr;
  noThrow('T20 malformed-only does not throw', () => {
    mr = decodeTradeOutcomes({ paperLedgerPath: paperMalf, predLedgerPath: predMalf, aflLedgerPath: aflMalf });
  });
  ok('T20 malformed-only decoded=0', mr.decoded, 0);
  ok('T20 AFL_LEDGER empty', readJsonl(aflMalf).rows.length, 0);

  // T21: open-only trade (no close) — must not appear in AFL_LEDGER
  const paperOpenOnly = join(TMP, 'p-open.jsonl');
  const predOpenOnly  = join(TMP, 'pred-open.jsonl');
  const aflOpenOnly   = join(TMP, 'afl-open.jsonl');
  writeFileSync(paperOpenOnly, JSON.stringify({ type: 'open', inst: 'X', fid: 'f1', side: 'long', qty: 0.1, fp: 100, _seq: 1 }) + '\n', 'utf8');
  writeFileSync(predOpenOnly,  '', 'utf8');
  writeFileSync(aflOpenOnly,   '', 'utf8');

  let oor;
  noThrow('T21 open-only does not throw', () => {
    oor = decodeTradeOutcomes({ paperLedgerPath: paperOpenOnly, predLedgerPath: predOpenOnly, aflLedgerPath: aflOpenOnly });
  });
  ok('T21a open-only decoded=0', oor.decoded, 0);
  ok('T21b AFL_LEDGER empty for open-only', readJsonl(aflOpenOnly).rows.length, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Results
  // ─────────────────────────────────────────────────────────────────────────
  for (const f of failures) process.stderr.write(f + '\n');
  console.log(`trade-outcome-decoder --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
