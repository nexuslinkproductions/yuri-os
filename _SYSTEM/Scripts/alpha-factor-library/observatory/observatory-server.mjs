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
  DEFAULT_CONFIG,
} from './orchestrator.mjs';
import { applyAuth } from './observatory-auth.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const PORT = Number(process.env.OBSERVATORY_PORT) || 4242;
const INTERVAL_MS = Number(process.env.OBSERVATORY_INTERVAL_MS) || DEFAULT_CONFIG.intervalMs;
const HOST = '127.0.0.1'; // localhost only

// CORS allowed origins — localhost only
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:4242',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4242',
  'http://127.0.0.1:5173',
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

  // Interval loop
  const interval = setInterval(async () => {
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
    }
  }, INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    console.log('[observatory-server] shutting down...');
    clearInterval(interval);
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

// ── --test mode (delegates to orchestrator --test via its own argv check) ──
// The orchestrator's --test self-test runs when `process.argv.includes('--test')`,
// which is already set when we reach here. We import the module which triggers it.
// We just need to NOT start the server or loop.

// ── CLI entry point ───────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--test')) {
  // orchestrator.mjs self-test already fires (it checks process.argv.includes('--test')).
  // This module just needs to not interfere — the orchestrator's test exits 0/1.
  // However, since orchestrator uses top-level await for the test, we need to let it run.
  // The import at the top already triggered the orchestrator module; if --test is set,
  // orchestrator.mjs runs runSelfTest() and process.exit(0/1). We just wait.
} else if (args.includes('--once')) {
  runOnce().catch((err) => { console.error(err); process.exit(1); });
} else if (args.includes('--serve')) {
  startServe().catch((err) => { console.error(err); process.exit(1); });
} else {
  // Default: --serve
  startServe().catch((err) => { console.error(err); process.exit(1); });
}
