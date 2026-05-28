/**
 * tracker-absence-request.js — anyone with tracker.request_absence can ask
 * for time off (Workstream T.5).
 *
 * POST { kind, start_date, end_date, hours_per_day?, reason? }
 *   kind ∈ 'vacation' | 'sick' | 'personal' | 'training' | 'unpaid'
 *   → tracker_absence_request RPC (CEO self-request auto-approves)
 *   → { ok: true, absence }
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
const CEO_CHAT = process.env.TELEGRAM_CTI_CHAT_ID || process.env.TELEGRAM_CEO_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

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

async function getDisplayName(userId) {
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, `/rest/v1/user_profiles?id=eq.${userId}&select=display_name,email`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  const row = Array.isArray(r.body) ? r.body[0] : null;
  return row?.display_name || row?.email || 'team member';
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

  const { kind, start_date, end_date, hours_per_day, reason } = body;
  if (!kind || !start_date || !end_date) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'kind + start_date + end_date required' }) };
  }

  try {
    const r = await rpc('tracker_absence_request', {
      p_actor: caller.id,
      p_kind: kind,
      p_start_date: start_date,
      p_end_date: end_date,
      p_hours_per_day: Number.isFinite(hours_per_day) ? hours_per_day : null,
      p_reason: reason || null,
    });
    if (r.status >= 400) {
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
    }

    // Telegram: if status='pending' (non-CEO submitter), notify CEO
    const absence = r.body;
    if (absence?.status === 'pending' && CEO_CHAT) {
      try {
        const submitterName = await getDisplayName(caller.id);
        const text =
          `<b>Absence requested</b>\n` +
          `<i>${submitterName}</i> · ${absence.kind} · <code>${absence.start_date}</code> → <code>${absence.end_date}</code>` +
          (reason ? `\n\nReason: ${reason}` : '');
        await tg.sendWithButtons(CEO_CHAT, text, [[
          { text: '✅ Approve', callback_data: `tabs_approve:${absence.id}` },
          { text: '❌ Reject',  callback_data: `tabs_reject:${absence.id}` },
        ]]);
      } catch (e) {
        console.warn('[absence-request] telegram fan-out failed:', e.message);
      }
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, absence }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
