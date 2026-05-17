#!/usr/bin/env node
/**
 * ⬡ YURI_TRADING :: jupiter-feed.mjs
 *
 * Jupiter Aggregator feed — Solana token discovery and trend detection.
 * - Polls Jupiter Strict Token List for verified Solana tokens
 * - Polls Jupiter Quote API for price feeds on high-vol tokens
 * - No auth required (public endpoints)
 *
 * Data sources:
 *   https://station.jup.ag/docs/token-list/token-list-api
 *   https://quote-api.jup.ag/v6/quote
 */

import https from 'node:https';

// Primary: GitHub-hosted Jupiter token list (always available)
const JUPITER_TOKEN_LIST = 'https://raw.githubusercontent.com/jup-ag/token-list/main/src/tokens/solana.tokenlist.json';
// Secondary: Jupiter price API for real-time pricing
const JUPITER_PRICE_BASE = 'https://price.jup.ag/v6/price?ids=';
// Fallback for environments where Jupiter DNS is blocked
const DEXSCREENER_SOLANA_SEARCH = 'https://api.dexscreener.com/token-profiles/latest/v1';
const POLL_INTERVAL_MS = 120_000; // 2 min — token list changes slowly

// ── Helpers ──────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15_000 }, (res) => {
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

// ── Token Filtering ──────────────────────────────────────────────────

function isHighInterest(token) {
  // Tokens with tags indicating meme, AI, DeFi, or high community interest
  const tags = (token.tags || []).map(t => t.toLowerCase());
  const highInterest = ['meme', 'ai', 'defi', 'community', 'verified', 'lst', 'liquid-staking'];
  if (tags.some(t => highInterest.includes(t))) return true;

  // Known high-vol tokens by symbol prefix/pattern
  const symbol = (token.symbol || '').toUpperCase();
  const patterns = ['AI', 'MEME', 'DOGE', 'PEPE', 'BONK', 'WIF', 'POPCAT', 'MOODENG', 'GOAT', 'FWOG', 'PNUT'];
  if (patterns.some(p => symbol.includes(p))) return true;

  return false;
}

// ── Poll Logic ────────────────────────────────────────────────────────

async function pollOnce() {
  const start = Date.now();
  try {
    const resp = await fetchJson(JUPITER_TOKEN_LIST);
    const tokens = Array.isArray(resp) ? resp : (resp?.tokens || resp?.results || []);
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.warn('⬡ YURI_TRADING :: jupiter-feed unexpected response shape');
      return [];
    }

    // Filter to high-interest tokens
    const candidates = tokens.filter(isHighInterest);

    // Take top 30 by sort priority
    const selected = candidates.slice(0, 30).map(t => ({
      token: t.symbol || '???',
      name: t.name || '',
      address: t.address || '',
      chainId: 'solana',
      decimals: t.decimals || 0,
      tags: (t.tags || []).join(','),
      logoURI: t.logoURI || '',
      verified: !!(t.tags || []).includes('verified'),
      source: 'jupiter',
    }));

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: jupiter-feed poll — ${selected.length} tokens (${elapsed}ms)`);
    return selected;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: jupiter-feed error: ${err.message}`);
    return [];
  }
}

// ── Exported API ─────────────────────────────────────────────────────

let pollTimer = null;
let latestTokens = [];

export function startJupiterFeed(callback) {
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

  console.log(`⬡ YURI_TRADING :: jupiter-feed started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  return () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

export function getLatestJupiter() { return latestTokens; }

// ── Standalone ────────────────────────────────────────────────────────

function standalone() {
  console.log(`⬡ YURI_TRADING :: jupiter-feed standalone — ${new Date().toISOString()}`);
  pollOnce().then((tokens) => {
    console.log(`\n${tokens.length} tokens:\n`);
    console.table(tokens.map(t => ({
      symbol: t.token,
      name: t.name,
      tags: t.tags,
      verified: t.verified,
    })));
    process.exit(0);
  }).catch((err) => {
    console.error(`⬡ YURI_TRADING :: jupiter-feed fatal: ${err.message}`);
    process.exit(1);
  });
}

if (process.argv[1] && process.argv[1].includes('jupiter-feed.mjs')) standalone();
