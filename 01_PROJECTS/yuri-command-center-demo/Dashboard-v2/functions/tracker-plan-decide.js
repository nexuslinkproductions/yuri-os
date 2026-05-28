/**
 * tracker-plan-decide.js — CEO approves/rejects a submitted week plan (T.8).
 *
 * POST { target_user, week_start, status, reason? }
 *   status ∈ 'approved' | 'rejected'
 *   → bearer-verify session (CEO/CTO/tracker.approve_plan)
 *   → tracker_plan_decide RPC
 *   → notify the submitter via Telegram (best-effort; non-fatal if missing chat_id)
 *   → { ok: true, result }
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

async function fetchSubmitterChatId(userId) {
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, `/rest/v1/user_profiles?id=eq.${userId}&select=telegram_chat_id,display_name,email`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  if (r.status >= 400) return null;
  return (Array.isArray(r.body) ? r.body[0] : null) || null;
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

  const { target_user, week_start, status, reason } = body;
  if (!target_user || !week_start || !status) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'target_user, week_start, status required' }) };
  }
  if (status !== 'approved' && status !== 'rejected') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'status must be approved or rejected' }) };
  }

  try {
    const r = await rpc('tracker_plan_decide', {
      p_actor:       caller.id,
      p_target_user: target_user,
      p_week_start:  week_start,
      p_status:      status,
      p_reason:      reason || null,
    });
    if (r.status >= 400) {
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
    }

    // Notify submitter on Telegram (best-effort)
    try {
      const submitter = await fetchSubmitterChatId(target_user);
      if (submitter?.telegram_chat_id) {
        const head = status === 'approved' ? '✅' : '❌';
        const text =
          `${head} <b>Week plan ${status}</b>\n` +
          `Week <code>${week_start}</code> · ${r.body?.blocks_changed ?? 0} block${(r.body?.blocks_changed ?? 0) === 1 ? '' : 's'}` +
          (reason ? `\n\nReason: ${reason}` : '');
        await tg.send(submitter.telegram_chat_id, text);
      }
    } catch (e) {
      console.warn('[plan-decide] notify submitter failed:', e.message);
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, result: r.body }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
