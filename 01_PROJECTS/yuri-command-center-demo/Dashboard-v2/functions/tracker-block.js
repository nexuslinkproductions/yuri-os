/**
 * tracker-block.js — single endpoint for block add/delete/resize (T.7 part 2).
 *
 * POST { action: 'add' | 'delete' | 'resize', ...payload }
 *
 * add:    { action: 'add', ticket_id, ticket_name?, client_code?, priority?,
 *           day (YYYY-MM-DD), start_hour, duration_hours, assignee_code? }
 * delete: { action: 'delete', block_id }
 * resize: { action: 'resize', block_id, start_hour?, duration_hours?, day? }
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  if (!SUPA_URL || !SUPA_KEY) return { statusCode: 503, headers: CORS, body: JSON.stringify({ ok: false, error: 'env not configured' }) };

  const caller = await verifyBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!caller) return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'not authenticated' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'bad json' }) }; }

  const action = body.action;
  try {
    if (action === 'add') {
      if (!body.ticket_id || !body.day || !Number.isFinite(body.start_hour) || !Number.isFinite(body.duration_hours)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'ticket_id + day + start_hour + duration_hours required' }) };
      }
      const r = await rpc('tracker_block_add', {
        p_actor: caller.id,
        p_ticket_id: body.ticket_id,
        p_ticket_name: body.ticket_name || '',
        p_client_code: body.client_code || '',
        p_priority: body.priority || 'none',
        p_day: body.day,
        p_start_hour: body.start_hour,
        p_duration_hours: body.duration_hours,
        p_assignee_code: body.assignee_code || null,
      });
      if (r.status >= 400) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, block: r.body }) };
    }
    if (action === 'delete') {
      if (!body.block_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'block_id required' }) };
      const r = await rpc('tracker_block_delete', { p_actor: caller.id, p_block_id: body.block_id });
      if (r.status >= 400) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, deleted: r.body === true }) };
    }
    if (action === 'resize') {
      if (!body.block_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'block_id required' }) };
      const r = await rpc('tracker_block_resize', {
        p_actor: caller.id,
        p_block_id: body.block_id,
        p_start_hour: Number.isFinite(body.start_hour) ? body.start_hour : null,
        p_duration_hours: Number.isFinite(body.duration_hours) ? body.duration_hours : null,
        p_day: body.day || null,
      });
      if (r.status >= 400) return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: r.body?.message || `rpc ${r.status}`, detail: r.body }) };
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, block: r.body }) };
    }
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'action must be add/delete/resize' }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
