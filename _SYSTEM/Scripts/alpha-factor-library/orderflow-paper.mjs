#!/usr/bin/env node
// @capability: orderflow-paper
// @serves: orderflow paper trading | live depth paper loop | OBI paper automation | order book imbalance paper | crypto orderflow automation | paper-trade from the book
// @does: The ORDERFLOW paper-automation loop (vs the candle-driven observatory loop). Composes LIVE Binance L2 depth (depth-book.mjs) + live trade tape (trades-stream.mjs), both free/keyless → CONFLUENCE signal (orderflow-signals.mjs: OBI+OFI+CVD must agree >=2, kills overtrading) → MAKER-FIRST skip-gate (orderflow-maker-fill.mjs: drop entries the spread can't pay for) → afl-paper simulated fills + P&L ledger → optional cost-aware EDGE verdict (orderflow-edge-audit.mjs). Entries AND exits flow through onSignal (confluence 'flat' -> close). PAPER-ONLY (INV-1): no real orders, no key reads, view-only. $0 to run. CVD lens neutral until mure-footprint.enabled is armed (owner-gated) → runs OBI+OFI (2-agree) today, OBI+OFI+CVD (3) when armed.
// @use: node orderflow-paper.mjs --symbol BTCUSDT --seconds 60 --audit    (bounded run + edge verdict)
//       node orderflow-paper.mjs --symbol ETHUSDT --serve                 (continuous automation)
//       node orderflow-edge-audit.mjs --symbol BTCUSDT                    (audit a prior run's ledger)
// @exports: runOrderflowPaper
//
// WHY THIS EXISTS: the observatory loop trades on CANDLES (bar factors). Orderflow trades on the BOOK.
// This is the minimal, honest orderflow loop: real live depth in, paper P&L out, $0, no databento.
// The identical afl-paper sink accepts a databento/nautilus feed later -> same loop for ES/equities.

import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import { startDepthBook } from './observatory/depth-book.mjs';
import { startTradesStream } from './observatory/trades-stream.mjs';
import { confluenceSignal } from './orderflow-signals.mjs';        // OFI+OBI+CVD >=2-agree gate (anti-overtrading)
import { makerFillDecision } from './orderflow-maker-fill.mjs';    // maker-first skip-gate (anti fee-bleed)
import { auditOrderflowEdge } from './orderflow-edge-audit.mjs';   // cost-aware EDGE/NO_EDGE verdict
import { createPaperEngine, binanceFeeModel } from './afl-paper.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(HERE, '..', '..', 'state');
const FAPI = 'fapi.binance.com';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

function httpGetJson(host, pathname) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path: pathname, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('klines timeout')); });
  });
}

// Seed real bars so afl-paper has sigma/ADV history (canonical field: timestamp unix-seconds).
async function seedBars(engine, symbol, instrument) {
  const kl = await httpGetJson(FAPI, `/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=50`);
  let lastVol = 0;
  for (const k of kl) {
    const bar = {
      timestamp: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    };
    lastVol = bar.volume;
    engine.ingestBar(bar, instrument);
  }
  return lastVol;
}

export async function runOrderflowPaper(opts = {}) {
  const symbol = String(opts.symbol || arg('symbol', 'BTCUSDT')).toUpperCase();
  const instrument = `${symbol}-OF`;
  const seconds = Number(opts.seconds || arg('seconds', 0)) || 0;   // 0 = run until SIGINT
  const threshold = Number(opts.threshold || arg('threshold', 0.15));
  const actEveryMs = Number(opts.actEveryMs || arg('act-ms', 1000));  // throttle: act at most 1/sec
  const doAudit = !!(opts.audit || arg('audit', false));              // --audit → edge verdict on exit

  const engine = createPaperEngine({
    paperLedgerPath: path.join(STATE, `orderflow-paper-${symbol}.jsonl`),
    predictionLedgerPath: path.join(STATE, `orderflow-paper-pred-${symbol}.jsonl`),
    feeModel: binanceFeeModel('taker'),
    caps: { maxPositionPct: 0.10 },
  });

  process.stdout.write(`[orderflow-paper] seeding bars for ${symbol}...\n`);
  let lastVol = 0;
  try { lastVol = await seedBars(engine, symbol, instrument); }
  catch (e) { process.stdout.write(`[orderflow-paper] seed failed (${e.message}) — continuing with book-only pricing\n`); }

  let lastActTs = 0;
  let books = 0, acts = 0, skips = 0;
  let prevBook = null;
  const t0 = Date.now();

  // Live trade tape → the CVD/footprint confluence lens. computeCVD returns [] until
  // mure-footprint.enabled is armed (owner-gated), so this is neutral-but-wired today;
  // arming footprint upgrades confluence from OBI+OFI (2) to OBI+OFI+CVD (3) with zero code change.
  const TRADE_BUF = [];
  const TRADE_BUF_MAX = 5000;
  let stopTrades = () => {};
  try {
    stopTrades = startTradesStream({
      symbols: [symbol],
      onTrade: (t) => {
        if (!t) return;
        TRADE_BUF.push({ price: +t.price, qty: +(t.qty ?? t.size), side: t.side, ts: t.ts });
        if (TRADE_BUF.length > TRADE_BUF_MAX) TRADE_BUF.splice(0, TRADE_BUF.length - TRADE_BUF_MAX);
      },
    });
  } catch (e) { process.stdout.write(`[orderflow-paper] trades stream off (${e.message}) — CVD lens neutral\n`); }

  const stop = startDepthBook({
    symbols: [symbol],
    onBook: ({ bids, asks, mid, spreadBps, ts }) => {
      books++;
      if (!Number.isFinite(mid) || mid <= 0 || !bids?.length || !asks?.length) return;

      const sec = ts ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
      const book = { bids, asks, mid, spreadBps, ts: sec };
      // Keep the paper engine's price current (unrealized P&L + mark) with a synthetic 1s bar off the live mid.
      engine.ingestBar({ timestamp: sec, open: mid, high: mid, low: mid, close: mid, volume: lastVol / 60 }, instrument);

      const now = Date.now();
      if (now - lastActTs < actEveryMs) { prevBook = book; return; }   // throttle decision cadence
      lastActTs = now;

      // ── CONFLUENCE SIGNAL: OBI + OFI + CVD must AGREE (>=2) — the anti-overtrading gate ──
      const sig = confluenceSignal({ book, prevBook, trades: TRADE_BUF }, { market: symbol, threshold });
      prevBook = book;
      if (!sig) return;

      // ── MAKER-FIRST EXECUTION GATE: skip entries the spread can't pay for (anti fee-bleed) ──
      // Directional entries pass the maker-fill decision; 'flat' (close) always flows through.
      if (sig.side === 'long' || sig.side === 'short') {
        const fill = makerFillDecision({ side: sig.side, book, urgency: sig.confidence, queueState: {} }, {});
        if (fill.mode === 'skip') { skips++; return; }
      }
      const r = engine.onSignal(sig, { instrument, book });
      if (r && r.action && r.action !== 'NO_TRADE') acts++;
    },
  });

  const report = () => {
    const p = engine.pnl();
    process.stdout.write(
      `[orderflow-paper] ${symbol} | books=${books} acts=${acts} skips=${skips} trades=${TRADE_BUF.length} | ` +
      `eq=$${p.equity} pnl=$${p.grossRealizedPnl}(real)+$${p.unrealizedPnl}(unreal) ` +
      `ret=${p.totalReturnBps}bps trades=${p.completedTrades} open=${p.openPositions} ` +
      `noTrade=${p.noTrades} dd=${p.maxDrawdownBps}bps cb=${p.circuitBreaker}\n`);
  };
  const ticker = setInterval(report, 10_000);

  const shutdown = () => {
    clearInterval(ticker);
    try { stop && stop(); } catch { /* noop */ }
    try { stopTrades && stopTrades(); } catch { /* noop */ }
    process.stdout.write(`\n[orderflow-paper] FINAL (${((Date.now() - t0) / 1000).toFixed(0)}s):\n`);
    report();
    if (doAudit) {
      try {
        const a = auditOrderflowEdge({
          symbol,
          paperLedgerPath: path.join(STATE, `orderflow-paper-${symbol}.jsonl`),
          predLedgerPath: path.join(STATE, `orderflow-paper-pred-${symbol}.jsonl`),
        });
        process.stdout.write(`[orderflow-paper] EDGE AUDIT → ${JSON.stringify(a)}\n`);
      } catch (e) { process.stdout.write(`[orderflow-paper] edge audit failed: ${e.message}\n`); }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  if (seconds > 0) setTimeout(shutdown, seconds * 1000);

  return { engine, stop: shutdown };
}

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main) {
  runOrderflowPaper().catch((e) => { console.error('[orderflow-paper] fatal:', e.message); process.exit(1); });
}
