/**
 * calendar-schedule-event.js — queue an Outlook calendar event creation from the
 * Calendar drawer "Schedule event" button.
 *
 * MVP: writes to audit_log with action=outlook.queue.event_create so the local
 * outlook-sync agent picks it up on next pass. Once m365 Calendars.ReadWrite
 * scope is granted, the agent actually creates the draft event.
 */

const https = require('https');
const { checkAuth } = require('./auth-check');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const { CORS } = require('./shared');

function supabaseInsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { subject, start, end, attendees, location, client_code, source } = payload;
  if (!subject || !start) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'subject and start required' }) };
  }

  const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  if (!ISO_RE.test(start) || (end && !ISO_RE.test(end))) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'start/end must be ISO-8601' }) };
  }
  const safeSubject     = String(subject).slice(0, 256).replace(/[\r\n]/g, ' ');
  const safeClientCode  = client_code ? String(client_code).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) : null;
  const safeLocation    = location ? String(location).slice(0, 256) : undefined;
  const safeSource      = source ? String(source).slice(0, 64) : undefined;
  const safeAttendees   = Array.isArray(attendees)
    ? attendees.slice(0, 20).map(a => String(a).slice(0, 200))
    : (attendees ? String(attendees).slice(0, 500) : undefined);

  await supabaseInsert('audit_log', {
    action: 'outlook.queue.event_create',
    entity_type: 'meeting',
    entity_id: `draft-${Date.now()}`,
    entity_name: subject,
    actor: source || 'dashboard-v2-calendar-drawer',
    details: { subject: safeSubject, start, end, attendees: safeAttendees, location: safeLocation, client_code: safeClientCode },
    metadata: { source: safeSource || 'dashboard-v2-calendar-drawer', timestamp: Date.now() },
  });

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, queued: true, note: 'Event draft queued — creates on next outlook-sync pass.' }),
  };
};
