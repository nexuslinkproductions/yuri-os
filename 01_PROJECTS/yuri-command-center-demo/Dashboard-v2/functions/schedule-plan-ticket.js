/**
 * schedule-plan-ticket.js — create or delete a scheduled block.
 *
 * POST  { action:'create', ticket_id, ticket_name, client_code, priority,
 *          day, start_hour, duration_hours, user_code, color?, notes? }
 * POST  { action:'delete', id }
 * POST  { action:'resolve', id, resolution:'done'|'rescheduled' }
 *
 * On 'create': inserts into scheduled_blocks, optionally creates M365 calendar event
 * for CTI.  Returns the new block.
 */

const https = require('https');
const { checkAuth } = require('./auth-check');
const { CORS } = require('./shared');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ── helpers ──────────────────────────────────────────────────────────

function sbReq(method, path, data) {
  return new Promise(resolve => {
    const payload = data ? JSON.stringify(data) : '';
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAppToken() {
  const tenantId    = process.env.M365_TENANT_ID;
  const clientId    = process.env.M365_CLIENT_ID;
  const clientSecret= process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;
  return new Promise(resolve => {
    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default`;
    const opts = {
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { const p = JSON.parse(raw); resolve(p.access_token || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

async function createM365Event(token, email, { ticket_name, client_code, day, start_hour, duration_hours }) {
  if (!token || !email) return null;
  const startDt = new Date(`${day}T${String(Math.floor(start_hour)).padStart(2,'0')}:${start_hour % 1 >= 0.5 ? '30' : '00'}:00`);
  const endDt   = new Date(startDt.getTime() + duration_hours * 3600_000);
  const payload = JSON.stringify({
    subject: `[NEX] ${client_code ? client_code + ' - ' : ''}${ticket_name}`,
    start:   { dateTime: startDt.toISOString(), timeZone: 'Europe/Zurich' },
    end:     { dateTime: endDt.toISOString(),   timeZone: 'Europe/Zurich' },
    categories: ['NEX Planned'],
    body: { contentType: 'text', content: `Scheduled via NEX ops dashboard.\nTicket: ${ticket_name}` },
  });
  return new Promise(resolve => {
    const opts = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0/users/${encodeURIComponent(email)}/events`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { const p = JSON.parse(d); resolve(p.id || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

// ── handler ──────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action } = body;

  // UUID format guard — prevents query-string injection via id param
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ── DELETE ───────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!body.id || !UUID_RE.test(body.id)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'valid id (UUID) required' }) };
    await sbReq('DELETE', `scheduled_blocks?id=eq.${body.id}`, null);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  // ── RESOLVE ──────────────────────────────────────────────────────
  if (action === 'resolve') {
    if (!body.id || !UUID_RE.test(body.id)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'valid id (UUID) required' }) };
    const res = await sbReq('PATCH', `scheduled_blocks?id=eq.${body.id}`, {
      completion_status: body.resolution === 'done' ? 'done' : 'rescheduled',
      updated_at: new Date().toISOString(),
    });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, row: res?.[0] }) };
  }

  // ── CREATE ───────────────────────────────────────────────────────
  const { ticket_id, ticket_name, client_code, priority, day, start_hour, duration_hours, user_code = 'CTI', color, notes } = body;
  if (!ticket_id || !day || start_hour == null || !duration_hours) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticket_id, day, start_hour, duration_hours required' }) };
  }
  // Validate date format to prevent injection
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'day must be YYYY-MM-DD' }) };
  }
  // Clamp numeric fields to safe ranges
  const safeStartHour = Math.max(0, Math.min(23.5, Number(start_hour)));
  const safeDuration  = Math.max(0.5, Math.min(24, Number(duration_hours)));
  if (!Number.isFinite(safeStartHour) || !Number.isFinite(safeDuration)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'start_hour and duration_hours must be numbers' }) };
  }

  // Optional: create M365 event for CTI
  let m365EventId = null;
  if (user_code === 'CTI') {
    const token = await getAppToken();
    const email = process.env.M365_CTI_EMAIL || 'info@c2moviez.com';
    m365EventId  = await createM365Event(token, email, { ticket_name, client_code, day, start_hour: safeStartHour, duration_hours: safeDuration });
  }

  const row = await sbReq('POST', 'scheduled_blocks', {
    ticket_id,
    ticket_name:    ticket_name || ticket_id,
    client_code:    client_code || '',
    priority:       priority || 'none',
    day,
    start_hour:     safeStartHour,
    duration_hours: safeDuration,
    assignee_code:  user_code,
    user_code,
    m365_event_id:  m365EventId,
    color:          color || null,
    notes:          notes || null,
    completion_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ ok: true, block: Array.isArray(row) ? row[0] : row }),
  };
};
