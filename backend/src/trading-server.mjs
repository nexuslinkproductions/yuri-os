/**
 * ⬡ YURI_TRADING :: trading-server.mjs
 * Standalone trading API — no Obsidian, no vault, no swarm.
 * Start: node backend/src/trading-server.mjs
 */
import http from 'node:http';

const FEED = 'http://127.0.0.1:4201';
const PORT = parseInt(process.env.PORT || '3004', 10);

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sendJSON(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

async function proxyFeed(path) {
  return fetchJSON(`${FEED}${path}`);
}

async function handleTradingRoute(path, res) {
  try {
    if (path.startsWith('/api/trading/feeds/')) {
      const feed = path.replace('/api/trading/feeds/', '');
      const valid = ['dex','funding','whale','jupiter','birdeye','feargreed','news','all','health'];
      if (!valid.includes(feed)) { sendJSON(res, 404, { error: 'unknown feed' }); return; }
      if (feed === 'all') {
        const [dex,funding,whale,health] = await Promise.all([
          proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'), proxyFeed('/health'),
        ]);
        sendJSON(res, 200, { dex, funding, whale, health, ts: new Date().toISOString() });
      } else if (feed === 'health') {
        sendJSON(res, 200, await proxyFeed('/health'));
      } else {
        sendJSON(res, 200, await proxyFeed(`/feeds/${feed}`));
      }
      return;
    }

    // Scored signals — use dynamic import for scoring service
    if (path === '/api/trading/signals' || path === '/api/trading/signals/merged' || path === '/api/trading/executive') {
      try {
        const { computeSignals } = await import('./services/tradingScoreService.mjs');
        const [dex,funding,whale,feargreed,news] = await Promise.all([
          proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'),
          proxyFeed('/feeds/feargreed').catch(()=>({data:[]})),
          proxyFeed('/feeds/news').catch(()=>({articles:[]})),
        ]);
        const scored = computeSignals({ dex, funding, whale, feargreed, news });

        if (path === '/api/trading/signals') {
          sendJSON(res, 200, scored);
        } else if (path === '/api/trading/signals/merged') {
          sendJSON(res, 200, { ts: scored.ts, summary: scored.summary, signals: scored.topMerged });
        } else {
          const fg = feargreed.data?.[0] || null;
          const health = await proxyFeed('/health').catch(()=>({uptime:0,feeds:{}}));
          const top3 = scored.topMerged.slice(0,3).map(m => ({
            token: m.token, score: m.aggregateScore, urgency: m.urgency,
            confidence: m.maxConfidence, sources: m.sources.length, rationale: m.evidence.slice(0,3),
          }));
          sendJSON(res, 200, {
            ts: scored.ts,
            system: { aggregatorUptime: health.uptime||0, feedsActive: Object.values(health.feeds||{}).filter(v=>v==='active').length, feedsTotal: Object.keys(health.feeds||{}).length },
            market: { fearGreed: fg ? { value:fg.value, sentiment:fg.sentiment, emoji:fg.emoji, signal:fg.signal } : null, newsCount: news.articles?.length||0 },
            signals: { critical: scored.summary.criticalCount, elevated: scored.summary.elevatedCount, watch: scored.summary.mergedTokens - scored.summary.criticalCount - scored.summary.elevatedCount, total: scored.summary.mergedTokens },
            topAlerts: top3,
          });
        }
        return;
      } catch (e) {
        sendJSON(res, 200, { notice: 'scoring engine not available', feeds: 'use /api/trading/feeds/* for raw data' });
        return;
      }
    }

    if (path === '/api/ping-test') {
      sendJSON(res, 200, { status: 'API_ROUTER_ALIVE', timestamp: new Date().toISOString() });
      return;
    }

    sendJSON(res, 404, { error: 'not found', available: ['/api/ping-test','/api/trading/feeds/*','/api/trading/signals','/api/trading/signals/merged','/api/trading/executive'] });
  } catch (e) {
    sendJSON(res, 502, { error: 'proxy error', detail: e.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' });
    res.end(); return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  handleTradingRoute(url.pathname, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`⬡ TRADING-SERVER :: online :${PORT}`);
  console.log(`  /api/ping-test`);
  console.log(`  /api/trading/feeds/{dex,funding,whale,jupiter,birdeye,feargreed,news,all,health}`);
  console.log(`  /api/trading/signals`);
  console.log(`  /api/trading/signals/merged`);
  console.log(`  /api/trading/executive`);
});
