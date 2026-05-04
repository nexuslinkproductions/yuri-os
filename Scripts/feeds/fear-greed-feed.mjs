#!/usr/bin/env node
/**
 * ⬡ YURI_TRADING :: fear-greed-feed.mjs
 *
 * Crypto Fear & Greed Index — market psychology barometer.
 * Polls alternative.me API (free, no auth) every 5 minutes.
 *
 * Value 0-25: Extreme Fear   |  Sentiment: BEARISH
 * Value 26-45: Fear          |  Sentiment: GUARDED
 * Value 46-55: Neutral       |  Sentiment: NEUTRAL
 * Value 56-75: Greed         |  Sentiment: BULLISH
 * Value 76-100: Extreme Greed|  Sentiment: EUPHORIC
 *
 * Source: https://alternative.me/crypto/fear-and-greed-index/
 */

import https from 'node:https';

const FNG_URL = 'https://api.alternative.me/fng/?limit=3';
const POLL_INTERVAL_MS = 300_000; // 5 min

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15_000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function classifySentiment(value) {
  if (value <= 25) return { sentiment: 'EXTREME_FEAR', emoji: '😱', signal: 'BEARISH' };
  if (value <= 45) return { sentiment: 'FEAR', emoji: '😨', signal: 'GUARDED' };
  if (value <= 55) return { sentiment: 'NEUTRAL', emoji: '😐', signal: 'NEUTRAL' };
  if (value <= 75) return { sentiment: 'GREED', emoji: '😈', signal: 'BULLISH' };
  return { sentiment: 'EXTREME_GREED', emoji: '🤤', signal: 'EUPHORIC' };
}

async function pollOnce() {
  const start = Date.now();
  try {
    const resp = await fetchJson(FNG_URL);
    const entries = resp?.data || [];

    const normalized = entries.map(e => ({
      value: parseInt(e.value) || 50,
      classification: e.value_classification || 'Neutral',
      timestamp: new Date(parseInt(e.timestamp) * 1000).toISOString(),
      ...classifySentiment(parseInt(e.value) || 50),
    }));

    const elapsed = Date.now() - start;
    console.log(`⬡ YURI_TRADING :: fear-greed poll — ${normalized[0]?.sentiment} (${normalized[0]?.value}) (${elapsed}ms)`);
    return normalized;
  } catch (err) {
    console.error(`⬡ YURI_TRADING :: fear-greed error: ${err.message}`);
    return [];
  }
}

let pollTimer = null;
let latestData = [];

export function startFearGreedFeed(callback) {
  if (pollTimer) clearInterval(pollTimer);
  pollOnce().then(d => { latestData = d; if (callback) callback(d); });
  pollTimer = setInterval(async () => {
    const d = await pollOnce();
    latestData = d;
    if (callback) callback(d);
  }, POLL_INTERVAL_MS);
  console.log(`⬡ YURI_TRADING :: fear-greed started — ${POLL_INTERVAL_MS / 1000}s`);
  return () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

export function getLatestFearGreed() { return latestData; }

function standalone() {
  console.log(`⬡ YURI_TRADING :: fear-greed standalone — ${new Date().toISOString()}`);
  pollOnce().then(d => {
    console.log(`Current: ${d[0]?.sentiment} (${d[0]?.value}/100) ${d[0]?.emoji}`);
    console.log(`Signal: ${d[0]?.signal}`);
    process.exit(0);
  });
}

if (process.argv[1]?.includes('fear-greed-feed.mjs')) standalone();
