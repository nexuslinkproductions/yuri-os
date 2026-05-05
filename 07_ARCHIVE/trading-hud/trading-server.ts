/**
 * ⬡ YURI_TRADING :: trading-server.ts
 * Lightweight Express server — trading endpoints only.
 * No Obsidian, no vault, no swarm. Just feeds → scoring → API.
 * Start: npx ts-node --transpile-only backend/src/trading-server.ts
 */
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const FEED = 'http://127.0.0.1:4201';
const PORT = parseInt(process.env.PORT || '3004', 10);

async function proxyFeed(path: string) {
  const res = await fetch(`${FEED}${path}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Feed ${path} ${res.status}`);
  return res.json();
}

function handleError(res: any, err: unknown, feed: string) {
  const msg = err instanceof Error ? err.message : 'Unknown';
  console.error(`⬡ TRADING :: proxy error — ${feed}: ${msg}`);
  res.status(502).json({ error: 'FEED_UNAVAILABLE', feed, message: msg });
}

// Phase 1: proxy routes
for (const feed of ['dex','funding','whale','jupiter','birdeye','feargreed','news']) {
  app.get(`/api/trading/feeds/${feed}`, async (_req, res) => {
    try { res.json(await proxyFeed(`/feeds/${feed}`)); }
    catch (e) { handleError(res, e, feed); }
  });
}

app.get('/api/trading/feeds/all', async (_req, res) => {
  try {
    const [dex,funding,whale,jupiter,birdeye,feargreed,news,health] = await Promise.all([
      proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'),
      proxyFeed('/feeds/jupiter').catch(()=>({tokens:[]})),
      proxyFeed('/feeds/birdeye').catch(()=>({tokens:[]})),
      proxyFeed('/feeds/feargreed').catch(()=>({data:[]})),
      proxyFeed('/feeds/news').catch(()=>({articles:[]})),
      proxyFeed('/health'),
    ]);
    res.json({ dex,funding,whale,jupiter,birdeye,feargreed,news,health,ts:new Date().toISOString() });
  } catch (e) { handleError(res, e, 'all'); }
});

app.get('/api/trading/health', async (_req, res) => {
  try { res.json(await proxyFeed('/health')); }
  catch (e) { handleError(res, e, 'health'); }
});

// Phase 2-3: scored signals
try {
  const { computeSignals } = require('./services/tradingScoreService');
  app.get('/api/trading/signals', async (_req, res) => {
    try {
      const [dex,funding,whale,feargreed,news] = await Promise.all([
        proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'),
        proxyFeed('/feeds/feargreed').catch(()=>({data:[]})),
        proxyFeed('/feeds/news').catch(()=>({articles:[]})),
      ]);
      res.json(computeSignals({ dex, funding, whale, feargreed, news }));
    } catch (e) { handleError(res, e, 'signals'); }
  });

  app.get('/api/trading/signals/merged', async (_req, res) => {
    try {
      const [dex,funding,whale,feargreed,news] = await Promise.all([
        proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'),
        proxyFeed('/feeds/feargreed').catch(()=>({data:[]})),
        proxyFeed('/feeds/news').catch(()=>({articles:[]})),
      ]);
      const scored = computeSignals({ dex, funding, whale, feargreed, news });
      res.json({ ts: scored.ts, summary: scored.summary, signals: scored.topMerged });
    } catch (e) { handleError(res, e, 'merged'); }
  });

  // Phase 7: executive summary
  app.get('/api/trading/executive', async (_req, res) => {
    try {
      const [dex,funding,whale,feargreed,news,health] = await Promise.all([
        proxyFeed('/feeds/dex'), proxyFeed('/feeds/funding'), proxyFeed('/feeds/whale'),
        proxyFeed('/feeds/feargreed').catch(()=>({data:[]})),
        proxyFeed('/feeds/news').catch(()=>({articles:[]})),
        proxyFeed('/health'),
      ]);
      const scored = computeSignals({ dex, funding, whale, feargreed, news });
      const fg = feargreed.data?.[0] || null;
      const top3 = scored.topMerged.slice(0,3).map(m => ({
        token: m.token, score: m.aggregateScore, urgency: m.urgency,
        confidence: m.maxConfidence, sources: m.sources.length, rationale: m.evidence.slice(0,3),
      }));
      res.json({
        ts: scored.ts,
        system: { aggregatorUptime: health?.uptime||0, feedsActive: Object.values(health?.feeds||{}).filter((v:any)=>v==='active').length, feedsTotal: Object.keys(health?.feeds||{}).length },
        market: { fearGreed: fg ? { value:fg.value, sentiment:fg.sentiment, emoji:fg.emoji, signal:fg.signal } : null, newsCount: news.articles?.length||0 },
        signals: { critical: scored.summary.criticalCount, elevated: scored.summary.elevatedCount, watch: scored.summary.mergedTokens - scored.summary.criticalCount - scored.summary.elevatedCount, total: scored.summary.mergedTokens },
        topAlerts: top3,
      });
    } catch (e) { res.status(502).json({ error: 'Executive summary unavailable', detail: String(e) }); }
  });
} catch (e) {
  console.warn('⬡ TRADING :: scoring engine not available — scored endpoints disabled');
}

// Health
app.get('/api/ping-test', (_, res) => res.json({ status: 'API_ROUTER_ALIVE', timestamp: new Date().toISOString() }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`⬡ YURI_TRADING :: trading-server online :${PORT}`);
  console.log(`  /api/trading/feeds/*  → proxy to :4201`);
  console.log(`  /api/trading/signals  → scored report`);
  console.log(`  /api/trading/executive → CEO summary`);
});
