#!/usr/bin/env node
// @capability: orderflow-paper
// @serves: orderflow paper trading | live depth paper loop | OBI paper automation | order book imbalance paper | crypto orderflow automation | paper-trade from the book
// @does: The ORDERFLOW paper-automation loop (vs the candle-driven observatory loop). Composes the LIVE Binance L2 order book (depth-book.mjs, free/keyless) → order-book-imbalance signals (computeOBI + microprice, obiToSignals) → afl-paper simulated fills + P&L ledger. Entries AND exits both flow through onSignal (OBI reverts to flat -> position closes). PAPER-ONLY (INV-1): no real orders, no key reads, view-only market data. $0 to run. This is the seam every other orderflow signal (OFI/footprint/CVD/GEX) plugs into next.
// @use: node orderflow-paper.mjs --symbol BTCUSDT --seconds 60           (bounded smoke run)
//       node orderflow-paper.mjs --symbol ETHUSDT --serve                (continuous automation)
//       Swap the SIGNAL block to add OFI (ofi.mjs) / footprint (footprint-amt.mjs) — same onSignal sink.
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
import { computeOBI, computeMicroprice, obiToSignals } from './orderbook-imbalance.mjs';
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
  let books = 0, acts = 0;
  const t0 = Date.now();

  const stop = startDepthBook({
    symbols: [symbol],
    onBook: ({ bids, asks, mid, spreadBps, ts }) => {
      books++;
      if (!Number.isFinite(mid) || mid <= 0 || !bids?.length || !asks?.length) return;

      // Keep the paper engine's price current (unrealized P&L + mark) with a synthetic 1s bar off the live mid.
      const sec = ts ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
      engine.ingestBar({ timestamp: sec, open: mid, high: mid, low: mid, close: mid, volume: lastVol / 60 }, instrument);

      const now = Date.now();
      if (now - lastActTs < actEveryMs) return;   // throttle decision cadence
      lastActTs = now;

      // ── ORDERFLOW SIGNAL: order-book imbalance + microprice (the book, not candles) ──
      const obi = computeOBI(bids, asks);
      const micro = computeMicroprice(bids, asks);
      const signals = obiToSignals(obi, micro, { mid, spreadBps }, { market: symbol, ts: sec, threshold });

      for (const sig of signals) {
        const r = engine.onSignal(sig, { instrument, book: { bids, asks, mid, spreadBps } });
        if (r && r.action && r.action !== 'NO_TRADE') acts++;
      }
    },
  });

  const report = () => {
    const p = engine.pnl();
    process.stdout.write(
      `[orderflow-paper] ${symbol} | books=${books} acts=${acts} | ` +
      `eq=$${p.equity} pnl=$${p.grossRealizedPnl}(real)+$${p.unrealizedPnl}(unreal) ` +
      `ret=${p.totalReturnBps}bps trades=${p.completedTrades} open=${p.openPositions} ` +
      `noTrade=${p.noTrades} dd=${p.maxDrawdownBps}bps cb=${p.circuitBreaker}\n`);
  };
  const ticker = setInterval(report, 10_000);

  const shutdown = () => {
    clearInterval(ticker);
    try { stop && stop(); } catch { /* noop */ }
    process.stdout.write(`\n[orderflow-paper] FINAL (${((Date.now() - t0) / 1000).toFixed(0)}s):\n`);
    report();
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
