#!/usr/bin/env node

/**
 * ⬡ YURI_TRADING :: dex-feed.mjs
 *
 * DEX Screener new pairs poller.
 * - Polls token-profiles/latest/v1 every 30 seconds
 * - Filters: age < 24h, liquidity > $10k USD, 1h volume spike > 200%
 * - Exports startDexFeed(callback) — calls callback(pairs) on each poll
 * - Standalone: logs output to console
 *
 * Data source: DEX Screener API (no authentication required)
 * https://docs.dexscreener.com/api/reference
 */

import https from 'node:https';

const DEX_PROFILES_URL = 'https://api.dexscreener.com/token-profiles/latest/v1';
const DEX_SEARCH_BASE = 'https://api.dexscreener.com/latest/dex/search?q=';
const POLL_INTERVAL_MS = 30_000;

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

function now() {
  return Date.now();
}

function ageInSeconds(token) {
  if (!token.createdAt) return Infinity;
  return (now() - new Date(token.createdAt).getTime()) / 1000;
}

// ── Filtering ────────────────────────────────────────────────────────

const FILTERS = {
  maxAgeSeconds: 86400,       // 24 hours
  minLiquidityUsd: 10_000,    // $10k minimum liquidity
  minVolumeSpikePct: 200,     // 200% 1h volume spike
};

/**
 * Apply filters to a raw profile from DEX Screener token-profiles endpoint.
 * We then fetch pair details via search for richer data.
 */
async function enrichAndFilter(profile) {
  try {
    const searchUrl = `${DEX_SEARCH_BASE}${encodeURIComponent(profile.tokenAddress || '')}`;
    const searchResult = await fetchJson(searchUrl);

    const pairs = searchResult.pairs || [];
    if (pairs.length === 0) return null;

    // Take the first pair with highest liquidity
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    const age = ageInSeconds(profile);
    const liquidity = best.liquidity?.usd || 0;
    const volume1h = best.volume?.h1 || 0;
    const volume24h = best.volume?.h24 || 0;
    const volumeSpikePct = volume24h > 0 ? ((volume1h / (volume24h / 24)) * 100) - 100 : 0;

    if (age > FILTERS.maxAgeSeconds) return null;
    if (liquidity < FILTERS.minLiquidityUsd) return null;
    if (volumeSpikePct < FILTERS.minVolumeSpikePct) return null;

    return {
      chainId: best.chainId || profile.chainId || 'unknown',
      pairAddress: best.pairAddress || profile.pairAddress || '',
      baseToken: best.baseToken?.symbol || profile.symbol || '???',
      quoteToken: best.quoteToken?.symbol || 'USD',
      priceUsd: parseFloat(best.priceUsd || '0'),
      liquidity: Math.round(liquidity),
      volume1h: Math.round(volume1h),
      volumeSpikePct: Math.round(volumeSpikePct),
      age: Math.round(age),
      dex: best.dexId || profile.dexId || 'unknown',
      url: best.url || '',
    };
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: dex-feed enrich error: ${err.message}`);
    return null;
  }
}

// ── Main Poll Logic ──────────────────────────────────────────────────

async function pollOnce() {
  const start = Date.now();
  try {
    const profiles = await fetchJson(DEX_PROFILES_URL);
    if (!Array.isArray(profiles)) {
      console.warn(`⬡ YURI_TRADING :: dex-feed unexpected response shape`);
      return [];
    }

    const results = [];
    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < Math.min(profiles.length, 50); i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      const enriched = await Promise.all(batch.map(enrichAndFilter));
      for (const item of enriched) {
        if (item !== null) results.push(item);
      }
    }

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: dex-feed poll completed — ${results.length} pairs matched filters (${elapsed}ms)`);
    return results;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: dex-feed poll error: ${err.message}`);
    return [];
  }
}

// ── Exported API ─────────────────────────────────────────────────────

let pollTimer = null;
let latestPairs = [];

/**
 * Start the DEX feed poller.
 * @param {function} callback - Called with (pairs[]) on each successful poll
 * @returns {function} stop function to halt polling
 */
export function startDexFeed(callback) {
  if (pollTimer) {
    console.warn('⬡ YURI_TRADING :: dex-feed already running — restarting');
    clearInterval(pollTimer);
  }

  // Immediate first poll
  pollOnce().then((pairs) => {
    latestPairs = pairs;
    if (typeof callback === 'function') callback(pairs);
  });

  pollTimer = setInterval(async () => {
    const pairs = await pollOnce();
    latestPairs = pairs;
    if (typeof callback === 'function') callback(pairs);
  }, POLL_INTERVAL_MS);

  console.log(`⬡ YURI_TRADING :: dex-feed started — polling every ${POLL_INTERVAL_MS / 1000}s`);

  return function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log('⬡ YURI_TRADING :: dex-feed stopped');
    }
  };
}

/**
 * Get the latest cached pairs (for aggregator use).
 */
export function getLatestPairs() {
  return latestPairs;
}

// ── Standalone Runner ────────────────────────────────────────────────

function standalone() {
  console.log(`⬡ YURI_TRADING :: dex-feed standalone run — ${new Date().toISOString()}`);
  console.log(`Filters: maxAge=${FILTERS.maxAgeSeconds}s, minLiquidity=$${FILTERS.minLiquidityUsd}, minVolumeSpike=${FILTERS.minVolumeSpikePct}%`);

  pollOnce().then((pairs) => {
    if (pairs.length === 0) {
      console.log('⬡ YURI_TRADING :: dex-feed — 0 pairs matched filters');
      console.log('(This is normal — filters are strict. Try relaxing min liquidity or max age.)');
    } else {
      console.log(`\nMatched ${pairs.length} pairs:\n`);
      console.table(pairs.map((p) => ({
        chain: p.chainId,
        pair: `${p.baseToken}/${p.quoteToken}`,
        age: `${Math.round(p.age / 60)}m`,
        liquidity: `$${(p.liquidity / 1000).toFixed(1)}k`,
        vol1h: `$${(p.volume1h / 1000).toFixed(1)}k`,
        spike: `${p.volumeSpikePct}%`,
        price: `$${p.priceUsd.toFixed(8)}`,
        dex: p.dex,
      })));
    }
    process.exit(0);
  }).catch((err) => {
    console.error(`⬡ YURI_TRADING :: dex-feed fatal: ${err.message}`);
    process.exit(1);
  });
}

// Run standalone if executed directly
if (process.argv[1] && (process.argv[1].endsWith('dex-feed.mjs') || process.argv[1].endsWith('/dex-feed.mjs'))) {
  standalone();
}

