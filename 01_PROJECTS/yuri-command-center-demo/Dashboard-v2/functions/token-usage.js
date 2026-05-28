/**
 * token-usage.js — Token consumption tracker
 *
 * GET  /.netlify/functions/token-usage          → aggregated stats (7d + 30d + all-time)
 * POST /.netlify/functions/token-usage          → log a usage entry (internal only)
 *
 * Auth: X-Internal-Key for POST; GET is public (behind dashboard auth).
 */

const https = require('https');
const { ok, err, options, CORS } = require('./shared');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY;

// Pricing per million tokens (claude-sonnet-4-6)
const PRICE = { input: 3.0, output: 15.0 };

function calcCost(tokensIn, tokensOut) {
  return (tokensIn * PRICE.input + tokensOut * PRICE.output) / 1_000_000;
}

function supabaseReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/${path}`,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=minimal' : 'return=representation',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function logUsage(source, model, tokensIn, tokensOut) {
  const cost_usd = calcCost(tokensIn, tokensOut);
  await supabaseReq('POST', 'token_usage', { source, model, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd });
}

async function getStats() {
  // Fetch last 30 days of raw rows (capped at 2000)
  const rows = await supabaseReq('GET',
    `token_usage?select=source,model,tokens_in,tokens_out,cost_usd,created_at&order=created_at.desc&limit=2000`
  );
  if (!Array.isArray(rows)) return { error: 'No data' };

  const now = Date.now();
  const d7  = now - 7  * 86400_000;
  const d30 = now - 30 * 86400_000;

  const agg = (filter) => {
    const subset = rows.filter(r => filter(new Date(r.created_at).getTime()));
    const bySource = {};
    let totalIn = 0, totalOut = 0, totalCost = 0;
    for (const r of subset) {
      totalIn   += r.tokens_in;
      totalOut  += r.tokens_out;
      totalCost += Number(r.cost_usd);
      if (!bySource[r.source]) bySource[r.source] = { tokens_in: 0, tokens_out: 0, cost_usd: 0, calls: 0 };
      bySource[r.source].tokens_in  += r.tokens_in;
      bySource[r.source].tokens_out += r.tokens_out;
      bySource[r.source].cost_usd   += Number(r.cost_usd);
      bySource[r.source].calls++;
    }
    return { tokens_in: totalIn, tokens_out: totalOut, cost_usd: totalCost, calls: subset.length, by_source: bySource };
  };

  // Daily breakdown for chart (last 14 days)
  const daily = {};
  for (const r of rows) {
    const ts = new Date(r.created_at).getTime();
    if (ts < now - 14 * 86400_000) continue;
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    if (!daily[day]) daily[day] = { tokens_in: 0, tokens_out: 0, cost_usd: 0, calls: 0 };
    daily[day].tokens_in  += r.tokens_in;
    daily[day].tokens_out += r.tokens_out;
    daily[day].cost_usd   += Number(r.cost_usd);
    daily[day].calls++;
  }

  return {
    last_7d:   agg(t => t >= d7),
    last_30d:  agg(t => t >= d30),
    all_time:  agg(() => true),
    daily:     Object.entries(daily).sort(([a],[b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    fetched_at: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (event.httpMethod === 'POST') {
    const provided = event.headers['x-internal-key'];
    if (!INTERNAL_KEY || provided !== INTERNAL_KEY) return err('Unauthorized', 401);
    let body;
    try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }
    const { source, model = 'claude-sonnet-4-6', tokens_in, tokens_out } = body;
    if (!source || tokens_in == null || tokens_out == null) return err('source, tokens_in, tokens_out required');
    await logUsage(source, model, Number(tokens_in), Number(tokens_out));
    return ok({ logged: true });
  }

  if (event.httpMethod === 'GET') {
    const stats = await getStats();
    return ok(stats);
  }

  return err('Method not allowed', 405);
};
