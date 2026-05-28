/**
 * fanny-ai.js — Claude AI proxy for the Fanny bot
 *
 * Called by Scripts/team-bots/fanny-bot.js (running locally as a LaunchAgent).
 * Uses ANTHROPIC_API_KEY from Netlify env — same Claude Sonnet 4.6 as EXEO.
 *
 * Auth: X-Internal-Key header (same pattern as event-dispatch, context-engine)
 * Method: POST
 * Body: { system: string, messages: [{role, content}], max_tokens?: number }
 * Returns: { text: string }
 */

const https = require('https');
const { anthropicPost, ok, err, options } = require('./shared');

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function logTokens(source, tokensIn, tokensOut) {
  if (!SUPABASE_URL || !SUPABASE_KEY || (!tokensIn && !tokensOut)) return;
  const cost = (tokensIn * 3.0 + tokensOut * 15.0) / 1_000_000;
  const payload = JSON.stringify({ source, model: 'claude-sonnet-4-6', tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost });
  const req = https.request({
    hostname: new URL(SUPABASE_URL).hostname,
    path: '/rest/v1/token_usage',
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal', 'Content-Length': Buffer.byteLength(payload) },
  });
  req.on('error', () => {});
  req.write(payload); req.end();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const provided = event.headers['x-internal-key'];
  if (!INTERNAL_KEY || !provided || provided !== INTERNAL_KEY) {
    return err('Unauthorized', 401);
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }

  const { system, messages, max_tokens = 1024 } = body;
  if (!messages || !Array.isArray(messages) || !messages.length) return err('messages required');

  try {
    const response = await anthropicPost({
      model: 'claude-sonnet-4-6',
      max_tokens,
      system: system || '',
      messages,
    });

    const text = response?.content?.[0]?.text;
    if (!text) {
      const detail = response?.error?.message || JSON.stringify(response).slice(0, 200);
      return err('AI error: ' + detail, 502);
    }
    const tokensIn  = response?.usage?.input_tokens  || 0;
    const tokensOut = response?.usage?.output_tokens || 0;
    return ok({ text, usage: { tokens_in: tokensIn, tokens_out: tokensOut } });
  } catch (e) {
    return err('AI request failed: ' + (e.message || 'unknown'), 500);
  }
};
