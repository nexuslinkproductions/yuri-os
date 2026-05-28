/**
 * tracker-start.js — Start a new tracker entry (Workstream T.2).
 *
 * POST { plane_issue_id?, plane_issue_seq?, client_code?, project_code?,
 *        description?, is_billable? }
 *   → bearer-verify session
 *   → call public.tracker_start(p_actor, ...)
 *   → return { ok: true, entry }
 *
 * The RPC handles:
 *   - Auto-closing any prior running entry for the user (idempotent)
 *   - Permission check via has_permission(actor, 'tracker', 'start')
 *   - Audit log row 'tracker_started'
 *
 * Auth model: Bearer session only (no HMAC path — humans start timers, not crons).
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN (optional)
 */
const https = require('https');

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
      headers: {
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(raw); } catch { j = raw; }
        resolve({ status: res.statusCode, body: j });
      });
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

async function callRpc(name, params) {
  const u = new URL(SUPA_URL);
  return http('POST', u.host, `/rest/v1/rpc/${name}`,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' },
    params);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  }
  if (!SUPA_URL || !SUPA_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ ok: false, error: 'env not configured' }) };
  }

  const caller = await verifyBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!caller) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'not authenticated' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'bad json' }) }; }

  const params = {
    p_actor:          caller.id,
    p_plane_issue_id: body.plane_issue_id ?? null,
    p_issue_seq:      body.plane_issue_seq ?? null,
    p_client_code:    body.client_code ?? null,
    p_project_code:   body.project_code ?? null,
    p_description:    body.description ?? null,
    p_is_billable:    body.is_billable ?? null,
  };

  try {
    const r = await callRpc('tracker_start', params);
    if (r.status >= 400) {
      return {
        statusCode: r.status,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: r.body?.message || r.body?.error || `rpc ${r.status}`, detail: r.body }),
      };
    }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, entry: r.body }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: e.message || String(e) }),
    };
  }
};
