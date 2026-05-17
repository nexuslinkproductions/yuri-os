#!/usr/bin/env node

/**
 * ⬡ YURI_TRADING :: whale-feed.mjs
 *
 * Whale Alert transaction monitor + Coinbase env var scaffold.
 * - Polls Whale Alert REST API every 60 seconds (requires WHALE_ALERT_API_KEY)
 * - If WHALE_ALERT_API_KEY missing: logs warning and exports no-op
 * - Checks COINBASE_API_KEY / COINBASE_API_SECRET presence for Lane T2 readiness
 * - Filters: min_value=500000 (transactions > $500k), limit=10
 * - Exports startWhaleFeed(callback) — calls callback(entries[]) on each poll
 * - Standalone: logs recent whale transactions to console
 *
 * Data source: Whale Alert API (free tier: 10 req/min, requires API key)
 * https://docs.whale-alert.io/
 */

import https from 'node:https';

const WHALE_ALERT_URL = 'https://api.whale-alert.io/v1/transactions';
const POLL_INTERVAL_MS = 60_000;
const MIN_VALUE = 500_000;
const LIMIT = 10;

// ── Coinbase Readiness Check ─────────────────────────────────────────

function checkCoinbaseEnv() {
  const hasKey = Boolean(process.env.COINBASE_API_KEY);
  const hasSecret = Boolean(process.env.COINBASE_API_SECRET);

  if (hasKey && hasSecret) {
    console.log('⬡ YURI_TRADING :: whale-feed — COINBASE_API_KEY and COINBASE_API_SECRET both set');
    console.log('⬡ YURI_TRADING :: whale-feed — Coinbase Advanced Trade API ready for Lane T2');
  } else if (hasKey || hasSecret) {
    console.log('⬡ YURI_TRADING :: whale-feed — ⚠ COINBASE_API_KEY or COINBASE_API_SECRET partially set (need both)');
  } else {
    console.log('⬡ YURI_TRADING :: whale-feed — COINBASE_API_KEY not set — Coinbase integration disabled until Lane T2');
  }

  return { hasKey, hasSecret };
}

// ── Helpers ──────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15_000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}


// ── Poll Logic ───────────────────────────────────────────────────────

async function pollOnce(apiKey) {
  const start = Date.now();
  try {
    const url = `${WHALE_ALERT_URL}?api_key=${apiKey}&min_value=${MIN_VALUE}&limit=${LIMIT}`;
    const response = await fetchJson(url);

    if (!response || !response.transactions || !Array.isArray(response.transactions)) {
      console.warn(`⬡ YURI_TRADING :: whale-feed unexpected response shape`);
      return [];
    }

    const entries = response.transactions.map((tx) => ({
      id: tx.id || '',
      timestamp: tx.timestamp || null,
      blockchain: tx.blockchain || 'unknown',
      symbol: tx.symbol || '???',
      amount: parseFloat(tx.amount) || 0,
      amountUsd: parseFloat(tx.amount_usd) || 0,
      fromAddress: tx.from?.address || 'unknown',
      fromOwner: tx.from?.owner || '',
      toAddress: tx.to?.address || 'unknown',
      toOwner: tx.to?.owner || '',
      hash: tx.hash || '',
      type: classifyTransaction(tx),
    }));

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: whale-feed poll completed — ${entries.length} transactions (${elapsed}ms)`);
    return entries;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: whale-feed poll error: ${err.message}`);
    return [];
  }
}

// ── Exported API ─────────────────────────────────────────────────────

let pollTimer = null;
let latestEntries = [];

/**
 * Start the Whale Alert feed poller.
 * If WHALE_ALERT_API_KEY is not set, logs a warning and exports a no-op.
 * @param {function} callback - Called with (entries[]) on each successful poll
 * @returns {function|null} stop function, or null if feed is disabled
 */
export function startWhaleFeed(callback) {
  const apiKey = process.env.WHALE_ALERT_API_KEY;
  if (!apiKey) {
    console.log('⬡ YURI_TRADING :: whale-feed — WHALE_ALERT_API_KEY not set — feed disabled');
    checkCoinbaseEnv();
    return null;
  }

  if (pollTimer) {
    console.warn('⬡ YURI_TRADING :: whale-feed already running — restarting');
    clearInterval(pollTimer);
  }

  checkCoinbaseEnv();

  // Immediate first poll
  pollOnce(apiKey).then((entries) => {
    latestEntries = entries;
    if (typeof callback === 'function') callback(entries);
  });

  pollTimer = setInterval(async () => {
    const entries = await pollOnce(apiKey);
    latestEntries = entries;
    if (typeof callback === 'function') callback(entries);
  }, POLL_INTERVAL_MS);

  console.log(`⬡ YURI_TRADING :: whale-feed started — polling every ${POLL_INTERVAL_MS / 1000}s`);

  return function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log('⬡ YURI_TRADING :: whale-feed stopped');
    }
  };
}

/**
 * Get the latest cached whale transactions (for aggregator use).
 */
export function getLatestWhale() {
  return latestEntries;
}

// ── Standalone Runner ────────────────────────────────────────────────

function standalone() {
  const apiKey = process.env.WHALE_ALERT_API_KEY;
  console.log(`⬡ YURI_TRADING :: whale-feed standalone run — ${new Date().toISOString()}`);

  if (!apiKey) {
    console.log('⬡ YURI_TRADING :: whale-feed — WHALE_ALERT_API_KEY is not set');
    console.log('Set it via: WHALE_ALERT_API_KEY=your_key node Scripts/feeds/whale-feed.mjs');
    checkCoinbaseEnv();
    process.exit(1);
  }

  checkCoinbaseEnv();

  pollOnce(apiKey).then((entries) => {
    if (entries.length === 0) {
      console.log('⬡ YURI_TRADING :: whale-feed — 0 transactions returned');
    } else {
      console.log(`\n${entries.length} recent whale transactions:\n`);
      console.table(entries.map((e) => ({
        time: e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '-',
        asset: e.symbol,
        amount: `${(e.amountUsd / 1e6).toFixed(2)}M`,
        from: e.fromOwner || e.fromAddress.slice(0, 10),
        to: e.toOwner || e.toAddress.slice(0, 10),
        type: e.type,
      })));
    }
    process.exit(0);
  }).catch((err) => {
    console.error(`⬡ YURI_TRADING :: whale-feed fatal: ${err.message}`);
    process.exit(1);
  });
}

// Run standalone if executed directly
if (process.argv[1] && (process.argv[1].endsWith('whale-feed.mjs') || process.argv[1].endsWith('/whale-feed.mjs'))) {
  standalone();
}
