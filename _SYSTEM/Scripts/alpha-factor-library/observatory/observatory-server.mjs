#!/usr/bin/env node
/**
 * observatory-server.mjs — YURI AFL Observatory HTTP/SSE Server (W2 bridge)
 *
 * Pure node:http wrapper around orchestrator.mjs. Zero external server deps.
 *
 * MODES:
 *   --once    Run a single runCycle, print JSON snapshot, exit 0.
 *   --serve   Start the HTTP server + interval loop (default port 4242).
 *   --test    Run the orchestrator --test self-test (deterministic mock cycle, exit 0/1).
 *
 * REST endpoints:
 *   GET /api/observatory/markets   → current market snapshots (JSON)
 *   GET /api/observatory/factors   → latest factor signals (JSON)
 *   GET /api/observatory/paper     → paper positions + P&L (JSON)
 *   GET /api/observatory/regime    → regime detector outputs (JSON)
 *   GET /api/observatory/energy    → latest energy ΔU telemetry (JSON)
 *   GET /api/observatory/health    → health check (JSON)
 *   GET /api/observatory/stream    → SSE push stream (text/event-stream)
 *
 * SSE message types:
 *   market.tick   { type, market, venue, updatedAt, lastBar, qualityGate, error, ts }
 *   factor.signal { type, factorId, value, side, confidence, ts, market? }
 *   paper.fill    { type, market, positions, pnl, drawdown, ts }
 *   regime.shift  { type, market, recommendation, reasons, layers, ts }
 *   energy.state  { type, deltaU, accept, reason, ts }
 *   cycle.start   { type, cycleCount, ts }  — emitted before each cycle
 *   cycle.end     { type, cycleCount, ts }  — emitted after each cycle
 *
 * CONSTRAINTS:
 *   - CORS: localhost only (origin whitelist)
 *   - SSRF: adapters guard; orchestrator adds belt-and-suspenders
 *   - No real orders (INV-1) — paper engine never submits
 *   - No key reads (INV-2) — creds from env only
 *   - Ledgers under _SYSTEM/state/ (INV-3)
 *   - Energy ΔU is advisory telemetry, never blocks
 *
 * @module observatory/observatory-server
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  runCycle,
  getMarkets,
  getFactors,
  getPaper,
  getRegime,
  getEnergy,
  getHealth,
  getSnapshot,
  buildSSEEvents,
  setHttpGet,
  bootstrapPolymarkets,
  fastTick,
  fastRiskExit,
  applyTick,
  getTicks,
  refreshAccount,
  getAccount,
  getIndicators,
  listAvailableIndicators,
  fetchOrderBook,
  getCalibration,
  getGraduation,
  getQuantum,
  getRecentTrades,
  getEnsemble,
  DEFAULT_CONFIG,
} from './orchestrator.mjs';
import { applyAuth } from './observatory-auth.mjs';
import { getCandlesAtTimeframe, availableTimeframes } from './timeframes.mjs';
import { startTickStream } from './tick-stream.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const PORT = Number(process.env.OBSERVATORY_PORT) || 4243; // 4242 is the YURI health-aggregator
const INTERVAL_MS = Number(process.env.OBSERVATORY_INTERVAL_MS) || DEFAULT_CONFIG.intervalMs;
const TICK_MS = Number(process.env.OBSERVATORY_TICK_MS) || 1000; // per-second fast price tick
const TICK_STREAM_ARMED = process.env.OBSERVATORY_TICK_STREAM === '1'; // DISARMED by default — owner arms the real-time WS tick feed
const HOST = '127.0.0.1'; // localhost only

// CORS allowed origins — localhost only
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:4242',
  'http://localhost:5173',
  'http://localhost:4250',   // standalone observatory app (vite.observatory.config)
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4242',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4250',   // standalone observatory app (direct SSE/REST, no proxy)
]);

// ── SSE client registry ──────────────────────────────────────────────────
const _sseClients = new Set();

function addSseClient(res) {
  _sseClients.add(res);
  res.on('close', () => _sseClients.delete(res));
  res.on('error', () => _sseClients.delete(res));
}

/**
 * broadcastSSE(events) — push events to all connected SSE clients.
 * Each event is serialized as a `data:` line in the SSE wire format.
 *
 * SSE WIRE FORMAT NOTE: events are sent as `data: <json>\n\n` where the JSON
 * payload contains the `type` field (NOT the SSE `event:` field). Frontend must
 * use `source.onmessage = e => { const ev = JSON.parse(e.data); switch(ev.type) ... }`
 * rather than `addEventListener('market.tick', ...)` (which listens on the SSE event
 * name, not the payload type). The wire format is intentional and must not change.
 */
function broadcastSSE(events) {
  if (_sseClients.size === 0) return;
  for (const event of events) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of _sseClients) {
      try {
        client.write(data);
      } catch (_e) {
        _sseClients.delete(client);
      }
    }
  }
}

// ── CORS helper ───────────────────────────────────────────────────────────
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

// ── JSON response helper ──────────────────────────────────────────────────
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

// ── SSE response setup ────────────────────────────────────────────────────
function initSseResponse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering in dev
  });
  // Send initial comment to confirm connection
  res.write(': YURI Observatory SSE connected\n\n');
}

// ── Request router ────────────────────────────────────────────────────────
function routeRequest(req, res) {
  setCorsHeaders(req, res);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth gate — DISARMED unless OBSERVATORY_AUTH_TOKEN is set; loopback always open.
  // (Lets Mike reach the dashboard remotely with a bearer token; localhost dev stays open.)
  if (!applyAuth(req, res)) return;

  // Only GET is supported
  if (req.method !== 'GET') {
    jsonResponse(res, { error: 'Method Not Allowed' }, 405);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  switch (pathname) {
    case '/api/observatory/markets':
      jsonResponse(res, getMarkets());
      break;

    case '/api/observatory/factors':
      jsonResponse(res, getFactors());
      break;

    case '/api/observatory/paper':
      jsonResponse(res, getPaper());
      break;

    case '/api/observatory/regime':
      jsonResponse(res, getRegime());
      break;

    case '/api/observatory/energy':
      jsonResponse(res, getEnergy());
      break;

    case '/api/observatory/health':
      jsonResponse(res, getHealth());
      break;

    case '/api/observatory/ticks':
      jsonResponse(res, getTicks());
      break;

    case '/api/observatory/account':
      // Real VIEW-ONLY Coinbase account state (no key → connected:false). No secret ever echoed.
      jsonResponse(res, getAccount() ?? { connected: false, advisory: 'no-cycle-yet' });
      break;

    case '/api/observatory/indicators': {
      // Technical indicators (Hybrid registry) for a market's current bars. ?market=BTC-USD&ids=rsi,macd,adx (ids optional).
      const mkt = url.searchParams.get('market');
      if (!mkt) { jsonResponse(res, { error: 'market required', available: listAvailableIndicators() }, 400); break; }
      const idsParam = url.searchParams.get('ids');
      const ids = idsParam ? idsParam.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
      jsonResponse(res, getIndicators(mkt, ids));
      break;
    }

    case '/api/observatory/orderbook': {
      // Live L2 order book for a market (TTL-coalesced). ?market=BTC-USD&limit=25
      const market = url.searchParams.get('market');
      if (!market) { jsonResponse(res, { error: 'market required' }, 400); break; }
      const lim = Number(url.searchParams.get('limit')) || 25;
      fetchOrderBook(market, { limit: lim })
        .then((r) => jsonResponse(res, r))
        .catch((e) => jsonResponse(res, { market, book: null, advisory: e.message }));
      break;
    }

    case '/api/observatory/calibration':
      // Per-factor reliability scorecard (DSR/Brier/promotion verdict) from the accrued outcome ledger.
      getCalibration()
        .then((r) => jsonResponse(res, r))
        .catch((e) => jsonResponse(res, { evaluated: 0, factors: [], advisory: e.message }));
      break;

    case '/api/observatory/graduation':
      // R0→R3 reliability verdict — the computed "do we genuinely know it works" gate.
      getGraduation()
        .then((r) => jsonResponse(res, r))
        .catch((e) => jsonResponse(res, { portfolio: { rung: 'R0' }, factors: [], advisory: e.message }));
      break;

    case '/api/observatory/quantum':
      // Quantum A/B shadow verdict — DISARMED measurement of whether order-optimal factor
      // sequencing would lift outcomes vs the classical blend (never drives live sizing).
      getQuantum()
        .then((r) => jsonResponse(res, r))
        .catch((e) => jsonResponse(res, { verdict: null, advisory: e.message }));
      break;

    case '/api/observatory/trades': {
      // Live trade tape — newest-first closed paper trades across all factor books.
      const lim = Number(url.searchParams.get('limit')) || 40;
      jsonResponse(res, getRecentTrades(lim));
      break;
    }

    case '/api/observatory/ensemble':
      // The fused combined decision per market (all strategies voting together).
      jsonResponse(res, getEnsemble());
      break;

    case '/api/observatory/timeframes':
      jsonResponse(res, availableTimeframes(url.searchParams.get('venue') || 'coinbase'));
      break;

    case '/api/observatory/candles': {
      const market = url.searchParams.get('market');
      const tf = url.searchParams.get('tf') || '5m';
      const venue = url.searchParams.get('venue') || undefined;
      if (!market) { jsonResponse(res, { error: 'market required' }, 400); break; }
      getCandlesAtTimeframe(market, tf, { venue })
        .then((r) => jsonResponse(res, r))
        .catch((e) => jsonResponse(res, { market, tf, supported: false, candles: [], error: e.message }));
      break;
    }

    case '/api/observatory/stream': {
      // SSE push stream — client uses EventSource
      initSseResponse(res);
      addSseClient(res);
      // Push current snapshot immediately on connect
      const snap = getSnapshot();
      const initialEvents = buildSSEEvents(snap);
      const data = `data: ${JSON.stringify({ type: 'connected', ...getHealth() })}\n\n`;
      res.write(data);
      for (const event of initialEvents) {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (_e) {
          // Client disconnected mid-flush
        }
      }
      break;
    }

    case '/':
    case '/api/observatory':
      jsonResponse(res, {
        name: 'YURI Observatory Server',
        version: '1.0.0',
        endpoints: [
          'GET /api/observatory/markets',
          'GET /api/observatory/factors',
          'GET /api/observatory/paper',
          'GET /api/observatory/regime',
          'GET /api/observatory/energy',
          'GET /api/observatory/health',
          'GET /api/observatory/account',
          'GET /api/observatory/indicators?market=&ids=',
          'GET /api/observatory/orderbook?market=&limit=',
          'GET /api/observatory/calibration',
          'GET /api/observatory/graduation',
          'GET /api/observatory/quantum',
          'GET /api/observatory/trades?limit=',
          'GET /api/observatory/ensemble',
          'GET /api/observatory/ticks',
          'GET /api/observatory/timeframes',
          'GET /api/observatory/candles?market=&tf=&venue=',
          'GET /api/observatory/stream (SSE)',
        ],
      });
      break;

    default:
      jsonResponse(res, { error: 'Not Found', path: pathname }, 404);
  }
}

// ── Server loop ───────────────────────────────────────────────────────────
function createServer() {
  const server = http.createServer(routeRequest);
  server.on('error', (err) => {
    console.error('[observatory-server] HTTP error:', err.message);
  });
  return server;
}

/**
 * startServe(config?) — start the HTTP server and the cycle interval loop.
 * @param {object} [config] — overrides for orchestrator DEFAULT_CONFIG
 */
async function startServe(config = {}) {
  const server = createServer();

  // Resolve effective config from env toggles (overlays are advisory + fail-open):
  //   OBSERVATORY_AUTO_POLYMARKET=1  → live Gamma auto-discovery of liquid markets
  //   OBSERVATORY_PERP=0             → disable the perp funding/basis overlay
  //   OBSERVATORY_SOCIAL=0           → disable the social-sentiment overlay
  let cfg = {
    ...config,
    autoDiscoverPolymarkets: config.autoDiscoverPolymarkets ?? (process.env.OBSERVATORY_AUTO_POLYMARKET === '1'),
    enablePerp: config.enablePerp ?? (process.env.OBSERVATORY_PERP !== '0'),
    enableSocial: config.enableSocial ?? (process.env.OBSERVATORY_SOCIAL !== '0'),
  };

  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, () => {
      console.log(`[observatory-server] listening on http://${HOST}:${PORT}`);
      resolve();
    });
    server.once('error', reject);
  });

  // Resolve the live Polymarket watch-list (auto-discovery when enabled; fail-open).
  try {
    const polymarkets = await bootstrapPolymarkets(cfg);
    if (polymarkets && polymarkets.length) {
      cfg = { ...cfg, polymarkets };
      console.log(`[observatory-server] tracking ${polymarkets.length} Polymarket market(s)`);
    }
  } catch (e) {
    console.error('[observatory-server] polymarket bootstrap failed (continuing):', e.message);
  }

  // Fast price-tick loop — START IMMEDIATELY (before/independent of the heavy cycle) so the
  // per-SECOND live pulse flows from second one, even while the first cycle is still running.
  let tickBusy = false;
  const doTick = async () => {
    if (tickBusy) return;
    tickBusy = true;
    try {
      const ticks = await fastTick(cfg);
      if (ticks.length) broadcastSSE(ticks.map((t) => ({ type: 'price.tick', ...t })));
      // FAST RISK EXIT: with fresh ticks in hand, close any position breaching stop-loss/take-profit/
      // max-hold AT THE LIVE TICK — every second, not on the slow signal cycle. This is what makes the
      // stop actually bite (caps losses near -0.15% instead of letting them overshoot to -0.4%).
      const exits = fastRiskExit();
      if (exits.length) {
        broadcastSSE(exits.map((e) => ({ type: 'risk.exit', ...e })));
        console.log('[observatory-server] fast risk-exit:', exits.map((e) => `${e.market} ${e.reason} ${e.pnlFrac}%`).join(', '));
      }
    } catch (err) {
      console.error('[observatory-server] tick error:', err.message);
    } finally {
      tickBusy = false;
    }
  };
  doTick(); // immediate first tick (don't wait the interval)
  const tickInterval = setInterval(doTick, TICK_MS);
  console.log(`[observatory-server] fast price-tick @ ${TICK_MS}ms`);

  // ── DISARMED real-time tick stream (owner-armed via OBSERVATORY_TICK_STREAM=1) ──
  // When armed, a Coinbase PUBLIC websocket feeds _state.ticks in REAL TIME (event-driven, sub-second)
  // and fires fastRiskExit at the actual touch — capping the overshoot losers the 1s REST poll lets slip.
  // The REST doTick loop above stays running as the fallback floor (a dropped socket degrades to 1s).
  let tickStream = null;
  if (TICK_STREAM_ARMED) {
    const tsMarkets = (cfg.cryptoMarkets || []).filter(Boolean);
    let lastRiskMs = 0;
    const RISK_THROTTLE_MS = 100; // fire the (sync, cheap) risk check at most ~10x/s during tick bursts
    tickStream = startTickStream({
      markets: tsMarkets,
      onTick: (t) => {
        applyTick(t.market, t.price, { bid: t.bid, ask: t.ask, venue: 'coinbase' });
        broadcastSSE([{ type: 'price.tick', market: t.market, venue: 'coinbase', price: t.price, bid: t.bid, ask: t.ask, ts: Math.floor(Date.now() / 1000) }]);
        const nowMs = Date.now();
        if (nowMs - lastRiskMs >= RISK_THROTTLE_MS) {
          lastRiskMs = nowMs;
          try {
            const exits = fastRiskExit();
            if (exits.length) {
              broadcastSSE(exits.map((e) => ({ type: 'risk.exit', ...e })));
              console.log('[observatory-server] WS risk-exit:', exits.map((e) => `${e.market} ${e.reason} ${e.pnlFrac}%`).join(', '));
            }
          } catch (_e) { /* fail-open — risk exit never kills the stream */ }
        }
      },
      onStatus: (s) => console.log(`[observatory-server] tick-stream: ${s}`),
    });
    console.log(`[observatory-server] REAL-TIME tick-stream ARMED (Coinbase WS) for ${tsMarkets.join(',')}`);
  }

  // Run first cycle immediately
  // emit cycle.start before INITIAL cycle too (BUG-5: was only emitted on interval cycles)
  broadcastSSE([{ type: 'cycle.start', cycleCount: 1, ts: Math.floor(Date.now() / 1000) }]);
  console.log('[observatory-server] running initial cycle...');
  try {
    const snap = await runCycle(cfg);
    broadcastSSE([{ type: 'cycle.end', cycleCount: snap.cycleCount, ts: snap.lastCycle }]);
    console.log(`[observatory-server] cycle 1 done. markets: ${Object.keys(snap.markets).join(', ')}`);
  } catch (err) {
    console.error('[observatory-server] initial cycle error:', err.message);
  }

  // Interval loop — OVERLAP-GUARDED. With dozens of factors + 6 candle fetches a cycle can run
  // longer than INTERVAL_MS; without a guard setInterval would stack concurrent runCycles (double
  // API calls + paper-engine races). _cycleRunning skips a tick while the previous cycle is in flight.
  let _cycleRunning = false;
  const interval = setInterval(async () => {
    if (_cycleRunning) return; // previous cycle still running — skip this tick
    _cycleRunning = true;
    const cycleCount = (getHealth().cycleCount || 0) + 1;
    broadcastSSE([{ type: 'cycle.start', cycleCount, ts: Math.floor(Date.now() / 1000) }]);

    try {
      const snap = await runCycle(cfg);
      const events = buildSSEEvents(snap);
      broadcastSSE(events);
      broadcastSSE([{ type: 'cycle.end', cycleCount: snap.cycleCount, ts: snap.lastCycle }]);
    } catch (err) {
      console.error('[observatory-server] cycle error:', err.message);
      broadcastSSE([{ type: 'cycle.end', error: err.message, ts: Math.floor(Date.now() / 1000) }]);
    } finally {
      _cycleRunning = false;
    }
  }, INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    console.log('[observatory-server] shutting down...');
    clearInterval(interval);
    clearInterval(tickInterval);
    if (tickStream) try { tickStream.stop(); } catch (_e) { /* noop */ }
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ── --once mode ────────────────────────────────────────────────────────────
async function runOnce(config = {}) {
  const snap = await runCycle(config);
  console.log(JSON.stringify(snap, null, 2));
}

// ── --gather mode (headless data accumulation; NO HTTP server) ──────────────
// Runs the live cycle on an interval, writing paper + prediction ledgers (the
// orchestrator handles those) plus a heartbeat status file, so the energy/circuit
// learn loops accumulate real outcomes over time. All overlays + Polymarket
// auto-discovery default ON. Paper-only, read-only venues, fail-open per cycle.
const GATHER_STATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', 'state');
const GATHER_STATUS = path.join(GATHER_STATE_DIR, 'observatory-gather-status.json');
const GATHER_INTERVAL_MS = Number(process.env.OBSERVATORY_GATHER_INTERVAL_MS) || 30_000;

function writeGatherStatus(snap, errMsg) {
  try {
    if (!existsSync(GATHER_STATE_DIR)) mkdirSync(GATHER_STATE_DIR, { recursive: true });
    const markets = Object.entries(snap?.markets || {}).map(([m, s]) => ({
      market: m, venue: s.venue, bars: s.bars?.length || 0,
      signals: (s.signals || []).length, equity: s.pnl?.equity ?? null,
      positions: (s.paperPositions || []).length, drawdown: s.drawdown ?? null,
      circuitRatio: s.circuit?.ratio ?? null, regime: s.regime?.recommendation ?? null,
      error: s.error ?? null,
    }));
    writeFileSync(GATHER_STATUS, JSON.stringify({
      pid: process.pid, mode: 'gather', cycleCount: snap?.cycleCount ?? null,
      lastCycle: snap?.lastCycle ?? null, factors: snap?.factors?.length ?? 0,
      markets, lastError: errMsg ?? null, updatedAt: Math.floor(Date.now() / 1000),
    }, null, 2));
  } catch (_) { /* status file is best-effort */ }
}

async function runGather() {
  let cfg = {
    autoDiscoverPolymarkets: process.env.OBSERVATORY_AUTO_POLYMARKET !== '0', // default ON for gather
    enablePerp: process.env.OBSERVATORY_PERP !== '0',
    enableSocial: process.env.OBSERVATORY_SOCIAL !== '0',
    polymarketLimit: Number(process.env.OBSERVATORY_POLY_LIMIT) || 3,
  };
  console.log(`[gather] headless data-gather starting (pid ${process.pid}, interval ${GATHER_INTERVAL_MS}ms, paper-only)`);
  try {
    const pm = await bootstrapPolymarkets(cfg);
    if (pm.length) { cfg = { ...cfg, polymarkets: pm }; console.log(`[gather] tracking ${pm.length} Polymarket market(s)`); }
  } catch (e) { console.error('[gather] polymarket bootstrap failed (continuing):', e.message); }

  const cycle = async () => {
    try {
      const snap = await runCycle(cfg);
      const eqs = Object.values(snap.markets).map((s) => s.pnl?.equity).filter(Number.isFinite);
      const totalEq = eqs.length ? eqs.reduce((a, b) => a + b, 0) : 0;
      console.log(`[gather] cycle ${snap.cycleCount} @ ${snap.lastCycle} — markets=${Object.keys(snap.markets).length} factors=${snap.factors.length} totalEquity=${totalEq.toFixed(0)}`);
      writeGatherStatus(snap, null);
    } catch (err) {
      console.error('[gather] cycle error (continuing):', err.message);
      writeGatherStatus(null, err.message);
    }
  };

  await cycle(); // initial cycle immediately
  const interval = setInterval(cycle, GATHER_INTERVAL_MS);
  const shutdown = () => { console.log('[gather] shutting down'); clearInterval(interval); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ── --test mode (delegates to orchestrator --test via its own argv check) ──
// The orchestrator's --test self-test runs when `process.argv.includes('--test')`,
// which is already set when we reach here. We import the module which triggers it.
// We just need to NOT start the server or loop.

// ── --verify mode (connect a real VIEW-ONLY Coinbase account) ───────────────
// Confirms the authed read works + prints a balances summary. NEVER echoes key
// material; creds read from env only (COINBASE_KEY_NAME + COINBASE_API_SECRET).
async function runVerifyAccount() {
  console.log('[connect] verifying VIEW-ONLY Coinbase account (creds from env only, never disk)...');
  try { await fastTick({}); } catch (_) { /* price tracked holdings if possible; ignore */ }
  const acct = await refreshAccount({ enableAccount: true });
  if (!acct || acct.advisory === 'no-key') {
    console.log('[connect] NO KEY SET — export COINBASE_KEY_NAME + COINBASE_API_SECRET (PEM) to connect a view-only account.');
    console.log('[connect] (the engine runs fine without it; account telemetry just stays disconnected)');
    process.exit(0);
  }
  if (acct.connected === false || acct.advisory === 'error') {
    console.error('[connect] FAILED:', acct.error || 'unknown error');
    process.exit(1);
  }
  console.log(`[connect] VIEW-ONLY OK — ${acct.accountCount} accounts · realEquity ≈ $${(acct.realEquityUsd || 0).toFixed(2)} · ${acct.unpricedCount} unpriced`);
  for (const h of (acct.holdings || []).slice(0, 15)) {
    const v = h.priced ? `$${(h.usdValue || 0).toFixed(2)}` : '(unpriced)';
    console.log(`  ${String(h.currency).padEnd(8)} ${String(h.total).padEnd(22)} ${v}`);
  }
  process.exit(0);
}

// ── Credential hydration (Keychain → env, INV-2-safe) ───────────────────────
// The daemon launches `node` directly under launchd, and a multi-line PEM secret
// can't live cleanly in the plist. So if COINBASE_* aren't already in the
// environment, load them from the macOS Keychain — the SAME secure store as the
// OLLAMA key (service `YURI_OS_MUSUBI:<KEY>`, account = $USER). ENV ALWAYS WINS;
// never reads .env/disk secrets, never logs key material; fail-soft (no entry →
// keyless, INV-4). Store with: `node _SYSTEM/Scripts/yuri-keychain.mjs set <KEY> <VALUE>`.
function hydrateCoinbaseCredsFromKeychain() {
  let acct = process.env.USER || '';
  if (!acct) { try { acct = execFileSync('id', ['-un'], { encoding: 'utf8' }).trim(); } catch { /* no user */ } }
  if (!acct) return;
  for (const key of ['COINBASE_KEY_NAME', 'COINBASE_API_SECRET']) {
    if (process.env[key]) continue; // env wins — never override an explicit env var
    try {
      const v = execFileSync('security',
        ['find-generic-password', '-a', acct, '-s', `YURI_OS_MUSUBI:${key}`, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const val = v.replace(/\n$/, ''); // strip the trailing newline `security` appends; keep internal PEM newlines
      if (val) process.env[key] = val;
    } catch { /* no keychain entry → stay keyless (fail-soft) */ }
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────
hydrateCoinbaseCredsFromKeychain();
const args = process.argv.slice(2);

if (args.includes('--test')) {
  // orchestrator.mjs self-test already fires (it checks process.argv.includes('--test')).
  // This module just needs to not interfere — the orchestrator's test exits 0/1.
  // However, since orchestrator uses top-level await for the test, we need to let it run.
  // The import at the top already triggered the orchestrator module; if --test is set,
  // orchestrator.mjs runs runSelfTest() and process.exit(0/1). We just wait.
} else if (args.includes('--verify') || args.includes('--verify-account')) {
  runVerifyAccount().catch((err) => { console.error('[connect] error:', err.message); process.exit(1); });
} else if (args.includes('--once')) {
  runOnce().catch((err) => { console.error(err); process.exit(1); });
} else if (args.includes('--gather')) {
  runGather().catch((err) => { console.error(err); process.exit(1); });
} else if (args.includes('--serve')) {
  startServe().catch((err) => { console.error(err); process.exit(1); });
} else {
  // Default: --serve
  startServe().catch((err) => { console.error(err); process.exit(1); });
}
