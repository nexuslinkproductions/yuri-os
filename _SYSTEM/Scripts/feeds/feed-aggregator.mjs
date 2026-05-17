#!/usr/bin/env node

/**
 * ⬡ YURI_TRADING :: feed-aggregator.mjs
 *
 * Lightweight HTTP feed aggregator on port 4201.
 * - Imports the three feed modules and starts them with callbacks
 * - Maintains in-memory caches of latest data from each feed
 * - Serves cache via REST endpoints for the HTML dashboard
 * - No external dependencies — uses Node.js built-in http module only
 *
 * Endpoints:
 *   GET /feeds/dex       → latest DEX new pairs
 *   GET /feeds/funding   → top 20 perp funding rates
 *   GET /feeds/whale     → recent whale transactions
 *   GET /feeds/coinbase  → 501 Not Implemented (Lane T2 stub)
 *   GET /health          → { status: "ok", uptime: <seconds> }
 *
 * CORS: Access-Control-Allow-Origin: * on all responses
 */

import http from 'node:http';
import { startDexFeed, getLatestPairs } from './dex-feed.mjs';
import { startFundingFeed, getLatestFunding } from './hl-funding.mjs';
import { startWhaleFeed, getLatestWhale } from './whale-feed.mjs';
import { startJupiterFeed, getLatestJupiter } from './jupiter-feed.mjs';
import { startBirdeyeFeed, getLatestBirdeye } from './birdeye-feed.mjs';
import { startFearGreedFeed, getLatestFearGreed } from './fear-greed-feed.mjs';
import { startNewsFeed, getLatestNews } from './news-feed.mjs';

const PORT = 4201;
const HOST = '127.0.0.1';

const startTime = Date.now();

// ── In-Memory Cache ──────────────────────────────────────────────────

const cache = {
  dex: [],
  funding: [],
  whale: [],
  jupiter: [],
  birdeye: [],
  feargreed: [],
  news: [],
  lastUpdated: {
    dex: null,
    funding: null,
    whale: null,
    jupiter: null,
    birdeye: null,
    feargreed: null,
    news: null,
  },
};

// ── Start Feeds ──────────────────────────────────────────────────────

startDexFeed((pairs) => {
  cache.dex = pairs;
  cache.lastUpdated.dex = new Date().toISOString();
});

startFundingFeed((entries) => {
  cache.funding = entries;
  cache.lastUpdated.funding = new Date().toISOString();
});

startWhaleFeed((entries) => {
  cache.whale = entries;
  cache.lastUpdated.whale = new Date().toISOString();
});

startJupiterFeed((tokens) => {
  cache.jupiter = tokens;
  cache.lastUpdated.jupiter = new Date().toISOString();
});

startBirdeyeFeed((tokens) => {
  cache.birdeye = tokens;
  cache.lastUpdated.birdeye = new Date().toISOString();
});

startFearGreedFeed((data) => {
  cache.feargreed = data;
  cache.lastUpdated.feargreed = new Date().toISOString();
});

startNewsFeed((articles) => {
  cache.news = articles;
  cache.lastUpdated.news = new Date().toISOString();
});

// ── HTTP Server ──────────────────────────────────────────────────────

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function parsePath(req) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  return url.pathname;
}

const routes = {

  '/feeds/dex': (req, res) => {
    sendJson(res, 200, {
      feed: 'dex',
      status: 'ok',
      count: cache.dex.length,
      lastUpdated: cache.lastUpdated.dex,
      pairs: cache.dex,
    });
  },

  '/feeds/funding': (req, res) => {
    sendJson(res, 200, {
      feed: 'funding',
      status: 'ok',
      count: cache.funding.length,
      lastUpdated: cache.lastUpdated.funding,
      assets: cache.funding,
    });
  },

  '/feeds/whale': (req, res) => {
    sendJson(res, 200, {
      feed: 'whale',
      status: 'ok',
      count: cache.whale.length,
      lastUpdated: cache.lastUpdated.whale,
      transactions: cache.whale,
    });
  },

  '/feeds/jupiter': (req, res) => {
    sendJson(res, 200, {
      feed: 'jupiter',
      status: 'ok',
      count: cache.jupiter.length,
      lastUpdated: cache.lastUpdated.jupiter,
      tokens: cache.jupiter,
    });
  },

  '/feeds/birdeye': (req, res) => {
    sendJson(res, 200, {
      feed: 'birdeye',
      status: 'ok',
      count: cache.birdeye.length,
      lastUpdated: cache.lastUpdated.birdeye,
      tokens: cache.birdeye,
    });
  },

  '/feeds/feargreed': (req, res) => {
    sendJson(res, 200, { feed: 'feargreed', status: 'ok', count: cache.feargreed.length, lastUpdated: cache.lastUpdated.feargreed, data: cache.feargreed });
  },

  '/feeds/news': (req, res) => {
    sendJson(res, 200, { feed: 'news', status: 'ok', count: cache.news.length, lastUpdated: cache.lastUpdated.news, articles: cache.news });
  },

  // Lane T2: Coinbase Advanced Trade integration
  '/feeds/coinbase': (req, res) => {
    sendJson(res, 501, {
      feed: 'coinbase',
      status: 'not_implemented',
      message: 'Coinbase Advanced Trade API integration is reserved for Lane T2.',
      prerequisites: [
        'COINBASE_API_KEY and COINBASE_API_SECRET in .env',
        'Coinbase Advanced Trade API enabled on Coinbase account',
        'Lane T2 prerequisites reviewed in _SYSTEM/yuri-trading-hud.md',
      ],
    });
  },

  '/health': (req, res) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const feeds = {
      dex: cache.lastUpdated.dex ? 'active' : 'starting',
      funding: cache.lastUpdated.funding ? 'active' : 'starting',
      whale: cache.lastUpdated.whale ? 'active' : 'starting',
      jupiter: cache.lastUpdated.jupiter ? 'active' : 'starting',
      birdeye: cache.lastUpdated.birdeye ? 'active' : 'starting',
      feargreed: cache.lastUpdated.feargreed ? 'active' : 'starting',
      news: cache.lastUpdated.news ? 'active' : 'starting',
      coinbase: 'stub_501',
    };

    sendJson(res, 200, {
      status: 'ok',
      service: 'yuri-trading-feed-aggregator',
      uptime,
      feeds,
      coinbaseEnv: {
        keySet: Boolean(process.env.COINBASE_API_KEY),
        secretSet: Boolean(process.env.COINBASE_API_SECRET),
        ready: Boolean(process.env.COINBASE_API_KEY && process.env.COINBASE_API_SECRET),
      },
    });
  },
};

// ── Request Handler ──────────────────────────────────────────────────

function handleRequest(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const path = parsePath(req);
  const handler = routes[path];

  if (handler) {
    handler(req, res);
  } else {
    sendJson(res, 404, {
      status: 'error',
      message: `Route not found: ${path}`,
      available: Object.keys(routes),
    });
  }
}

// ── Start Server ─────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`⬡ YURI_TRADING :: feed-aggregator online :${PORT}`);
  console.log(`⬡ YURI_TRADING :: endpoints:`);
  for (const routePath of Object.keys(routes)) {
    console.log(`  GET http://${HOST}:${PORT}${routePath}`);
  }
});

server.on('error', (err) => {
  console.error(`⬡ YURI_TRADING :: feed-aggregator error: ${err.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('⬡ YURI_TRADING :: feed-aggregator shutting down (SIGTERM)');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('⬡ YURI_TRADING :: feed-aggregator shutting down (SIGINT)');
  server.close(() => process.exit(0));
});

