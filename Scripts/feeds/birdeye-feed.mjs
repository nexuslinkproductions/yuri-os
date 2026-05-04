#!/usr/bin/env node
/**
 * ⬡ YURI_TRADING :: birdeye-feed.mjs
 *
 * Birdeye cross-chain token discovery and trend detection.
 * - Polls Birdeye trending/gainers endpoint for multi-chain high-vol tokens
 * - Optional: API key enables higher rate limits (BIRDEYE_API_KEY in .env)
 * - No auth required for basic public endpoints
 *
 * Data source: https://public-api.birdeye.so/
 */

import https from 'node:https';

const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const POLL_INTERVAL_MS = 90_000; // 90s

// ── Helpers ──────────────────────────────────────────────────────────

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { ...headers }, timeout: 15_000 };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Poll Logic ───────────────────────────────────────────────────────

async function pollOnce() {
  const apiKey = process.env.BIRDEYE_API_KEY || '';
  const headers = {};
  if (apiKey) {
    headers['X-API-KEY'] = apiKey;
    headers['x-chain'] = 'solana';
  }

  const start = Date.now();
  try {
    // Try trending endpoint first, fall back to gainers
    let url = `${BIRDEYE_BASE}/defi/trending?limit=20`;
    if (!apiKey) {
      url = `${BIRDEYE_BASE}/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=20`;
    }

    const resp = await fetchJson(url, headers);
    const tokens = resp?.data?.tokens || resp?.data || [];

    if (!Array.isArray(tokens)) {
      console.warn('⬡ YURI_TRADING :: birdeye-feed unexpected response');
      return [];
    }

    const normalized = tokens.slice(0, 20).map(t => ({
      token: (t.symbol || t.name || '???').toUpperCase(),
      name: t.name || '',
      address: t.address || '',
      chainId: t.chain || t.network || 'unknown',
      price: t.price || t.priceUsd || 0,
      volume24h: t.volume24h || t.volume || t.v24hUSD || 0,
      priceChange24h: t.priceChange24h || t.priceChange || t.v24hChangePercent || 0,
      marketCap: t.marketCap || t.mcap || 0,
      liquidity: t.liquidity || 0,
      source: 'birdeye',
      rank: t.rank || 0,
    }));

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: birdeye-feed poll — ${normalized.length} tokens (${elapsed}ms)`);
    return normalized;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: birdeye-feed error: ${err.message}`);
    return [];
  }
}

// ── Exported API ─────────────────────────────────────────────────────

let pollTimer = null;
let latestTokens = [];

export function startBirdeyeFeed(callback) {
  if (pollTimer) { clearInterval(pollTimer); }

  pollOnce().then((tokens) => {
    latestTokens = tokens;
    if (typeof callback === 'function') callback(tokens);
  });

  pollTimer = setInterval(async () => {
    const tokens = await pollOnce();
    latestTokens = tokens;
    if (typeof callback === 'function') callback(tokens);
  }, POLL_INTERVAL_MS);

  console.log(`⬡ YURI_TRADING :: birdeye-feed started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  return () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

export function getLatestBirdeye() { return latestTokens; }

// ── Standalone ──────────────────────────────────────────────────────

function standalone() {
  console.log(`⬡ YURI_TRADING :: birdeye-feed standalone — ${new Date().toISOString()}`);
  pollOnce().then((tokens) => {
    console.log(`\n${tokens.length} tokens:`);
    console.table(tokens.slice(0, 10).map(t => ({
      symbol: t.token,
      chain: t.chainId,
      price: t.price,
      change24: t.priceChange24h + '%',
      volume: t.volume24h ? '$' + (t.volume24h / 1e6).toFixed(1) + 'M' : '-',
    })));
    process.exit(0);
  }).catch((err) => {
    console.error(`⬡ YURI_TRADING :: birdeye-feed fatal: ${err.message}`);
    process.exit(1);
  });
}

if (process.argv[1] && process.argv[1].includes('birdeye-feed.mjs')) standalone();
