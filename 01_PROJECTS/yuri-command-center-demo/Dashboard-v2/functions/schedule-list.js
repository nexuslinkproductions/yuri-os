/**
 * schedule-list.js — returns scheduled_blocks + M365 calendar events for a given week.
 *
 * GET ?week_start=2026-05-11  (Monday ISO date)
 * Returns:
 *   { blocks: ScheduledBlock[], events: { CTI: CalEvent[]|null, FK: null, SW: null, MS: null } }
 *
 * M365 events: fetched via service principal (Calendars.Read app permission).
 * FK/SW/MS return null until admin consent is granted for those mailboxes.
 */

const https = require('https');
const { checkAuth } = require('./auth-check');
const { CORS } = require('./shared');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const TEAM_EMAILS = {
  CTI: process.env.M365_CTI_EMAIL || 'info@c2moviez.com',
  FK:  process.env.M365_FK_EMAIL  || null,
  SW:  process.env.M365_SW_EMAIL  || null,
  MS:  process.env.M365_MS_EMAIL  || null,
};

// ── helpers ──────────────────────────────────────────────────────────

function supabaseGet(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve([]);
  return new Promise(resolve => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json',
      },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([]));
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
      res.on('end', () => {
        try { const p = JSON.parse(raw); resolve(p.access_token || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

function graphGet(token, path) {
  return new Promise(resolve => {
    const opts = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0${path}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function fetchCalendarEvents(token, email, startISO, endISO) {
  if (!token || !email) return null;
  const path = `/users/${encodeURIComponent(email)}/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$select=id,subject,start,end,isAllDay,categories,bodyPreview&$top=50&$orderby=start/dateTime`;
  const res = await graphGet(token, path);
  if (!res || res.error) return null;
  return (res.value || []).map(e => ({
    id:       e.id,
    subject:  e.subject || '',
    start:    e.start?.dateTime,
    end:      e.end?.dateTime,
    allDay:   e.isAllDay,
    preview:  e.bodyPreview?.slice(0, 100) || '',
  }));
}

// ── handler ──────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'GET only' }) };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  const weekStart = event.queryStringParameters?.week_start;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'week_start required (YYYY-MM-DD)' }) };
  }

  // Week end = 7 days later
  const start = new Date(weekStart + 'T00:00:00Z');
  const end   = new Date(start.getTime() + 7 * 86400_000);
  const endDate = end.toISOString().slice(0, 10);

  // Fetch scheduled blocks for the week
  const blockPath = `scheduled_blocks?day=gte.${weekStart}&day=lt.${endDate}&order=day.asc,start_hour.asc&limit=200`;
  const blocks = await supabaseGet(blockPath);

  // Fetch M365 events
  const token = await getAppToken();
  const startISO = start.toISOString();
  const endISO   = end.toISOString();

  const [ctiEvents, fkEvents, swEvents, msEvents] = await Promise.all([
    fetchCalendarEvents(token, TEAM_EMAILS.CTI, startISO, endISO),
    TEAM_EMAILS.FK ? fetchCalendarEvents(token, TEAM_EMAILS.FK,  startISO, endISO) : Promise.resolve(null),
    TEAM_EMAILS.SW ? fetchCalendarEvents(token, TEAM_EMAILS.SW,  startISO, endISO) : Promise.resolve(null),
    TEAM_EMAILS.MS ? fetchCalendarEvents(token, TEAM_EMAILS.MS,  startISO, endISO) : Promise.resolve(null),
  ]);

  return {
    statusCode: 200,
    headers: { ...CORS, 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      week_start: weekStart,
      blocks:     Array.isArray(blocks) ? blocks : [],
      events: { CTI: ctiEvents, FK: fkEvents, SW: swEvents, MS: msEvents },
    }),
  };
};
