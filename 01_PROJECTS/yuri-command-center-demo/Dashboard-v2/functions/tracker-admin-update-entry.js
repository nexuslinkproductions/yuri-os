/**
 * tracker-admin-update-entry.js — CEO-only direct edit on a time_entry,
 * no drift threshold, no approval round-trip (that flow is for non-admins).
 *
 * POST { entry_id, fields: { started_at?, ended_at?, description?, is_billable?,
 *                            plane_issue_id?, plane_issue_seq?, client_code?,
 *                            project_code?, rate_chf_per_hour? } }
 *   → bearer-verify
 *   → tracker_admin_update_entry(entry_id, fields, actor)  [CEO/CTO only]
 *   → { ok: true, entry }
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

const ALLOWED = new Set([
  'started_at','ended_at','description','is_billable',
  'plane_issue_id','plane_issue_seq','client_code','project_code',
  'rate_chf_per_hour',
]);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  if (!SUPA_URL || !SUPA_KEY) return { statusCode: 503, headers: CORS, body: JSON.stringify({ ok: false, error: 'env not configured' }) };

  const caller = await verifyBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!caller) return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'not authenticated' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'bad json' }) }; }

  if (!body.entry_id || typeof body.entry_id !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'entry_id required' }) };
  }
  if (!body.fields || typeof body.fields !== 'object') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'fields object required' }) };
  }

  const fields = {};
  for (const [k, v] of Object.entries(body.fields)) {
    if (ALLOWED.has(k)) fields[k] = v;
  }
  if (Object.keys(fields).length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'no editable fields in request' }) };
  }

  try {
    const r = await rpc('tracker_admin_update_entry', {
      p_entry_id: body.entry_id,
      p_fields: fields,
      p_actor: caller.id,
    });
    if (r.status >= 400) {
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
    }
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, entry: r.body }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
