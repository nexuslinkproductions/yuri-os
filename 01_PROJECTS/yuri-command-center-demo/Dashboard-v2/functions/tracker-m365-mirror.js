/**
 * tracker-m365-mirror.js — Workstream T.7.3-E
 *
 * Scheduled every 1 min. Picks up time_entries that are:
 *   - ended_at IS NOT NULL
 *   - ended_at < now() - 5 minutes  (5-min debounce — lets users edit before
 *                                    Outlook sees the entry)
 *   - m365_event_id IS NULL
 *   - m365_event_owner_email IS NOT NULL  (stamped by tracker-stop / log)
 *
 * For each, POSTs a calendar event to MS Graph via the app-only token
 * (same getAppToken flow used by schedule-plan-ticket.js), then PATCHes
 * the row with the returned event id.
 *
 * On failure (Graph 5xx, transient network), leaves m365_event_id NULL so
 * the next run retries automatically.
 *
 * Caller: Netlify scheduled, * /1 * * * * (set in netlify.toml)
 */
const https = require('https');

const SUPA_URL  = process.env.SUPABASE_URL;
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const TENANT    = process.env.M365_TENANT_ID;
const CLIENT_ID = process.env.M365_CLIENT_ID;
const SECRET    = process.env.M365_CLIENT_SECRET;

// Cap per run so a backlog doesn't run into the function timeout
const MAX_PER_RUN = 30;

function http(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const opts = {
      hostname: host, port: 443, path, method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
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

async function getAppToken() {
  if (!TENANT || !CLIENT_ID || !SECRET) return null;
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(SECRET)}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default`;
  const r = await http('POST', 'login.microsoftonline.com', `/${TENANT}/oauth2/v2.0/token`,
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  return r.body?.access_token || null;
}

function eventSubject(entry) {
  const code = entry.client_code || '';
  const seq  = entry.plane_issue_seq || '';
  const desc = (entry.description || '').slice(0, 60);
  return `[NEX] ${code ? code + ' - ' : ''}${seq ? seq + ' - ' : ''}${desc || 'time entry'}`;
}

async function createM365Event(token, email, entry) {
  if (!token || !email) return null;
  const subject = eventSubject(entry);
  const body = {
    subject,
    start: { dateTime: new Date(entry.started_at).toISOString(), timeZone: 'Europe/Zurich' },
    end:   { dateTime: new Date(entry.ended_at).toISOString(),   timeZone: 'Europe/Zurich' },
    categories: ['NEX Tracked'],
    body: {
      contentType: 'text',
      content: [
        'Auto-synced from NEX time tracker.',
        entry.plane_issue_seq ? `Ticket: ${entry.plane_issue_seq}` : null,
        entry.is_billable ? 'Billable' : 'Non-billable',
      ].filter(Boolean).join('\n'),
    },
  };
  const r = await http('POST', 'graph.microsoft.com',
    `/v1.0/users/${encodeURIComponent(email)}/events`,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body);
  if (r.status >= 200 && r.status < 300 && r.body?.id) return r.body.id;
  return null;
}

async function loadPending() {
  const u = new URL(SUPA_URL);
  // Order by ended_at ASC so oldest pending entries get pushed first
  const path = `/rest/v1/time_entries?ended_at=not.is.null&m365_event_id=is.null&m365_event_owner_email=not.is.null&ended_at=lt.${encodeURIComponent(new Date(Date.now() - 5 * 60_000).toISOString())}&order=ended_at.asc&limit=${MAX_PER_RUN}`;
  const r = await http('GET', u.host, path,
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' });
  return Array.isArray(r.body) ? r.body : [];
}

async function patchEntry(entryId, m365EventId) {
  const u = new URL(SUPA_URL);
  return http('PATCH', u.host, `/rest/v1/time_entries?id=eq.${entryId}`,
    {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    { m365_event_id: m365EventId });
}

exports.handler = async () => {
  if (!SUPA_URL || !SUPA_KEY) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'env not configured' }) };
  }
  const t0 = Date.now();
  const stats = { picked: 0, pushed: 0, failed: 0, skipped_no_email: 0 };
  try {
    const pending = await loadPending();
    stats.picked = pending.length;
    if (pending.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, ...stats, ms: Date.now() - t0 }) };
    }
    const token = await getAppToken();
    if (!token) {
      console.warn('[tracker-m365-mirror] no Graph token');
      return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'no graph token', ...stats }) };
    }
    for (const entry of pending) {
      const email = entry.m365_event_owner_email;
      if (!email) { stats.skipped_no_email++; continue; }
      try {
        const eventId = await createM365Event(token, email, entry);
        if (eventId) {
          await patchEntry(entry.id, eventId);
          stats.pushed++;
        } else {
          stats.failed++;
        }
      } catch (e) {
        console.warn(`[tracker-m365-mirror] entry ${entry.id} failed:`, e.message);
        stats.failed++;
      }
      // Small jitter between calls — keeps us well under Graph throttling
      await new Promise((r) => setTimeout(r, 120));
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...stats, ms: Date.now() - t0 }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message || String(e), ...stats }) };
  }
};

exports.config = {
  schedule: '*/1 * * * *',
};
