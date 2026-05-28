/**
 * tracker-plan-submit.js — submit a week plan for approval (Workstream T.8).
 *
 * POST { week_start }   (YYYY-MM-DD, must be a Monday)
 *   → bearer-verify session
 *   → tracker_plan_submit RPC → transitions caller's draft blocks → submitted
 *   → if non-CEO submitter, POST to CEO Telegram with Approve/Reject buttons
 *   → return { ok: true, result }
 *
 * The RPC returns { week_start, blocks_changed, status }. status='approved'
 * when CEO/CTO self-submits (auto-approval).
 */
const https = require('https');
const tg = require('./shared-telegram');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
};

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const CEO_CHAT  = process.env.TELEGRAM_CTI_CHAT_ID || process.env.TELEGRAM_CEO_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

function http(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: host, port: 443, path, method,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    };
    const req = https.request(opts, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j; try { j = JSON.parse(raw); } catch { j = raw; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function verifyBearer(authHeader) {
  if (!authHeader) return null;
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (!bearer) return null;
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, '/auth/v1/user',
    { apikey: SUPA_KEY, Authorization: `Bearer ${bearer}`, Accept: 'application/json' });
  return r.status === 200 && r.body?.id ? r.body : null;
}

async function rpc(name, params) {
  const u = new URL(SUPA_URL);
  return http('POST', u.host, `/rest/v1/rpc/${name}`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' },
    params);
}

async function fetchProfile(userId) {
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, `/rest/v1/user_profiles?id=eq.${userId}&select=id,display_name,email,role`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  if (r.status >= 400) return null;
  return (Array.isArray(r.body) ? r.body[0] : r.body) || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  if (!SUPA_URL || !SUPA_KEY) return { statusCode: 503, headers: CORS, body: JSON.stringify({ ok: false, error: 'env not configured' }) };

  const caller = await verifyBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!caller) return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'not authenticated' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'bad json' }) }; }

  if (!body.week_start) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'week_start required (YYYY-MM-DD Monday)' }) };
  }

  try {
    const r = await rpc('tracker_plan_submit', { p_actor: caller.id, p_week_start: body.week_start });
    if (r.status >= 400) {
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
    }

    const result = r.body;
    const status = result?.status;
    const blocks = result?.blocks_changed ?? 0;

    // Fire Telegram inline-button prompt to CEO unless this was a CEO self-auto-approve.
    if (status === 'submitted' && CEO_CHAT) {
      try {
        const profile = await fetchProfile(caller.id);
        const submitter = profile?.display_name || profile?.email || 'team member';
        const text =
          `<b>Week plan submitted</b>\n` +
          `<i>${submitter}</i> submitted week <code>${body.week_start}</code> for approval.\n` +
          `<b>${blocks}</b> block${blocks === 1 ? '' : 's'} planned.\n\n` +
          `Review on /tracker/team or approve here:`;
        await tg.sendWithButtons(CEO_CHAT, text, [[
          { text: '✅ Approve',  callback_data: `tplan_approve:${caller.id}:${body.week_start}` },
          { text: '❌ Reject',   callback_data: `tplan_reject:${caller.id}:${body.week_start}` },
        ], [
          { text: '👁  Open plan', url: `https://ops.c2moviez.com/tracker/team` },
        ]]);
      } catch (e) {
        console.warn('[plan-submit] telegram fan-out failed:', e.message);
        // Non-fatal — the RPC still committed; CEO can approve via UI.
      }
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, result }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
