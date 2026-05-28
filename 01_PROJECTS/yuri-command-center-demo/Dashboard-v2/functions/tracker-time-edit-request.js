/**
 * tracker-time-edit-request.js — Workstream T.7.3-F
 *
 * POST {
 *   entry_id,
 *   proposed: { started_at?, ended_at?, description?, is_billable?, plane_issue_id? },
 *   reason?
 * }
 *
 * Flow:
 *   - Bearer-verify session
 *   - Call public.tracker_time_edit_request RPC
 *   - RPC computes drift_minutes:
 *       ≤ 5 min → applies the diff immediately + inserts row status='auto_applied'
 *       > 5 min → inserts row status='pending'; this function then fires the
 *                 Telegram inline-button prompt to CEO.
 *   - Returns { ok, request }
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

async function fetchProfile(userId) {
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, `/rest/v1/user_profiles?id=eq.${userId}&select=id,display_name,email,role,telegram_chat_id`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  if (r.status >= 400) return null;
  return (Array.isArray(r.body) ? r.body[0] : r.body) || null;
}

async function fetchEntry(entryId) {
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host,
    `/rest/v1/time_entries?id=eq.${entryId}&select=id,started_at,ended_at,description,is_billable,client_code,plane_issue_seq,user_id`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  if (r.status >= 400) return null;
  return (Array.isArray(r.body) ? r.body[0] : r.body) || null;
}

function fmtDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return '—';
  const mins = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
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

  if (!body.entry_id || !body.proposed || typeof body.proposed !== 'object') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'entry_id + proposed required' }) };
  }

  try {
    const r = await rpc('tracker_time_edit_request', {
      p_entry_id: body.entry_id,
      p_proposed: body.proposed,
      p_reason:   body.reason ?? null,
      p_actor:    caller.id,
    });
    if (r.status >= 400) {
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
    }

    const request = r.body;
    const isPending = request?.status === 'pending';
    const drift = Number(request?.drift_minutes ?? 0);

    // Fire CEO Telegram only when pending (drift > 5 min)
    if (isPending && CEO_CHAT) {
      try {
        const [profile, entry] = await Promise.all([
          fetchProfile(caller.id),
          fetchEntry(body.entry_id),
        ]);
        const submitterName = profile?.display_name || profile?.email || 'team member';
        const ticketRef = entry?.plane_issue_seq || entry?.client_code || 'entry';
        const proposedStart = body.proposed.started_at || entry?.started_at;
        const proposedEnd   = body.proposed.ended_at   || entry?.ended_at;
        const oldDur = fmtDuration(entry?.started_at, entry?.ended_at);
        const newDur = fmtDuration(proposedStart, proposedEnd);

        const text = [
          `<b>Time edit request</b>`,
          `<i>${submitterName}</i> · <code>${ticketRef}</code>`,
          ``,
          `Drift: <b>${drift.toFixed(1)} min</b>`,
          `Duration: <code>${oldDur}</code> → <code>${newDur}</code>`,
          body.reason ? `\nReason: ${body.reason.slice(0, 200)}` : '',
        ].filter(Boolean).join('\n');

        await tg.sendWithButtons(CEO_CHAT, text, [[
          { text: '✅ Approve', callback_data: `tte_approve:${request.id}` },
          { text: '❌ Reject',  callback_data: `tte_reject:${request.id}` },
        ]]);
      } catch (e) {
        console.warn('[tracker-time-edit-request] telegram fan-out failed:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, request }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
