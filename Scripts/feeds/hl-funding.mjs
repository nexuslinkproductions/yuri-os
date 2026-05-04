#!/usr/bin/env node

/**
 * ⬡ YURI_TRADING :: hl-funding.mjs
 *
 * Hyperliquid funding rate monitor.
 * - Polls Hyperliquid REST /info endpoint every 15 seconds
 * - Extracts top 20 assets by abs(fundingRate)
 * - Annotates signal: SHORT_BIAS if rate > 0.001, LONG_BIAS if rate < -0.001
 * - Exports startFundingFeed(callback) — calls callback(entries[]) on each poll
 * - Standalone: logs top 20 to console
 *
 * Data source: Hyperliquid public API (no auth required)
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

import https from 'node:https';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const POLL_INTERVAL_MS = 15_000;

// ── Helpers ──────────────────────────────────────────────────────────

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10_000,
    };
    const req = https.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
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
    req.write(data);
    req.end();
  });
}

// ── Signal Logic ─────────────────────────────────────────────────────

const SIGNAL_THRESHOLD = 0.001; // 0.1%

function classifySignal(fundingRate) {
  if (fundingRate > SIGNAL_THRESHOLD) return 'SHORT_BIAS';
  if (fundingRate < -SIGNAL_THRESHOLD) return 'LONG_BIAS';
  return 'NEUTRAL';
}

function signalEmoji(signal) {
  switch (signal) {
    case 'SHORT_BIAS': return '🔴';
    case 'LONG_BIAS':  return '🟢';
    default:           return '⚪';
  }
}

// ── Poll Logic ───────────────────────────────────────────────────────

async function pollOnce() {
  const start = Date.now();
  try {
    const response = await postJson(HL_INFO_URL, { type: 'metaAndAssetCtxs' });

    if (!Array.isArray(response) || response.length < 2) {
      console.warn(`⬡ YURI_TRADING :: hl-funding unexpected response shape`);
      return [];
    }

    const meta = response[0];   // { universe: [{ name, ... }] }
    const ctxs = response[1];   // [{ funding, markPx, oi, ... }]

    if (!meta || !meta.universe || !Array.isArray(ctxs)) {
      console.warn(`⬡ YURI_TRADING :: hl-funding unexpected meta/ctxs shape`);
      return [];
    }

    const assets = meta.universe.map((u, i) => {
      const ctx = ctxs[i] || {};
      const fundingRate = parseFloat(ctx.funding) || 0;
      const funding8h = fundingRate * 8;
      const signal = classifySignal(fundingRate);

      return {
        asset: u.name,
        index: i,
        markPx: parseFloat(ctx.markPx) || 0,
        fundingRate: parseFloat(fundingRate.toFixed(6)),
        funding8h: parseFloat(funding8h.toFixed(6)),
        openInterest: parseFloat(ctx.oi) || 0,
        signal,
        signalEmoji: signalEmoji(signal),
      };
    });

    // Sort by abs(fundingRate) descending, take top 20
    const sorted = assets
      .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
      .slice(0, 20);

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: hl-funding poll completed — ${sorted.length} assets (${elapsed}ms)`);

    return sorted;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: hl-funding poll error: ${err.message}`);
    return [];
  }
}

// ── Exported API ─────────────────────────────────────────────────────

let pollTimer = null;
let latestEntries = [];

/**
 * Start the funding rate feed poller.
 * @param {function} callback - Called with (entries[]) on each successful poll
 * @returns {function} stop function to halt polling
 */
export function startFundingFeed(callback) {
  if (pollTimer) {
    console.warn('⬡ YURI_TRADING :: hl-funding already running — restarting');
    clearInterval(pollTimer);
  }

  // Immediate first poll
  pollOnce().then((entries) => {
    latestEntries = entries;
    if (typeof callback === 'function') callback(entries);
  });

  pollTimer = setInterval(async () => {
    const entries = await pollOnce();
    latestEntries = entries;
    if (typeof callback === 'function') callback(entries);
  }, POLL_INTERVAL_MS);

  console.log(`⬡ YURI_TRADING :: hl-funding started — polling every ${POLL_INTERVAL_MS / 1000}s`);

  return function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log('⬡ YURI_TRADING :: hl-funding stopped');
    }
  };
}

/**
 * Get the latest cached funding entries (for aggregator use).
 */
export function getLatestFunding() {
  return latestEntries;
}

// ── Standalone Runner ────────────────────────────────────────────────

function standalone() {
  console.log(`⬡ YURI_TRADING :: hl-funding standalone run — ${new Date().toISOString()}`);
  console.log(`Signal threshold: ${(SIGNAL_THRESHOLD * 100).toFixed(1)}%\n`);

  pollOnce().then((entries) => {
    if (entries.length === 0) {
      console.log('⬡ YURI_TRADING :: hl-funding — 0 entries returned');
      process.exit(1);
    }

    console.log(`Top ${entries.length} assets by |funding rate|:\n`);
    console.table(entries.map((e) => ({
      asset: e.asset,
      price: `$${e.markPx.toFixed(4)}`,
      funding1h: `${(e.fundingRate * 100).toFixed(4)}%`,
      funding8h: `${(e.funding8h * 100).toFixed(4)}%`,
      oi: e.openInterest > 0 ? `$${(e.openInterest / 1e6).toFixed(1)}M` : '-',
      signal: `${e.signalEmoji} ${e.signal}`,
    })));

    process.exit(0);
  }).catch((err) => {
    console.error(`⬡ YURI_TRADING :: hl-funding fatal: ${err.message}`);
    process.exit(1);
  });
}

// Run standalone if executed directly
if (process.argv[1] && (process.argv[1].endsWith('hl-funding.mjs') || process.argv[1].endsWith('/hl-funding.mjs'))) {
  standalone();
}

