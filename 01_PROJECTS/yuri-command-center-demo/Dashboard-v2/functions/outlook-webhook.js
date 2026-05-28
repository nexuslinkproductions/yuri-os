/**
 * outlook-webhook.js — MS Graph subscription notification handler
 *
 * Two roles:
 *   1. Validation handshake: when MS Graph creates/renews a subscription, it
 *      calls this endpoint with ?validationToken=xxx. We must echo it back as
 *      plain text within 10 seconds.
 *   2. Notifications: MS Graph POSTs change events here. Each notification
 *      includes only IDs — we fetch the full event from Graph then dispatch
 *      to event-dispatch as meeting.created / meeting.updated / meeting.deleted.
 *
 * Setup:
 *   - Set OUTLOOK_WEBHOOK_SECRET (any strong random string) in Netlify env vars.
 *   - Run outlook-subscribe.js (scheduled fn) once to create initial subscriptions.
 *
 * POST /.netlify/functions/outlook-webhook
 */

const https = require('https');

const CLIENT_STATE = process.env.OUTLOOK_WEBHOOK_SECRET || '';

// ── Webhook rate limiter (Supabase RPC, fail-open) ──
async function webhookRateLimited(ip) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY || !ip) return false;
  try {
    const payload = JSON.stringify({ _ip: ip });
    const result = await new Promise(resolve => {
      const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/auth_rate_check`);
      const opts = {
        hostname: url.hostname, path: url.pathname, method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      };
      const req = https.request(opts, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.write(payload); req.end();
    });
    return result === true;
  } catch { return false; }
}

// ── M365 token (client credentials) ─────────────────────────────────
async function getAppToken() {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error('M365 creds missing');

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }).toString();
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
        try { const p = JSON.parse(raw); p.access_token ? resolve(p.access_token) : reject(new Error(p.error_description || 'token fail')); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function graphGet(token, path) {
  return new Promise((resolve) => {
    https.request({
      hostname: 'graph.microsoft.com', path: `/v1.0${path}`, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); } catch { resolve({ status: res.statusCode, data: raw }); } });
    }).on('error', () => resolve({ status: 0, data: null })).end();
  });
}

// ── Forward to event-dispatch ───────────────────────────────────────
async function dispatchEvent(eventType, data) {
  const serviceKey = process.env.INTERNAL_SERVICE_KEY || '';
  const payload = JSON.stringify({ event: eventType, data });
  return new Promise((resolve) => {
    const opts = {
      hostname: (process.env.URL || 'https://ops.c2moviez.com').replace('https://', ''),
      path: '/.netlify/functions/event-dispatch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': serviceKey,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.write(payload); req.end();
  });
}

// ── Audit-log incoming notifications (observability, mirrors plane-webhook) ──
async function auditIncoming(outcome, extras) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const payload = JSON.stringify({
    action: 'webhook.outlook.' + outcome,
    entity_type: 'webhook-debug',
    entity_id: 'outlook',
    entity_name: extras?.summary || outcome,
    actor: 'outlook',
    details: extras || {},
    metadata: { source: 'outlook-webhook', timestamp: Date.now() },
  });
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/audit_log`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve()); req.write(payload); req.end();
  });
}

// ── Handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // 1. Validation handshake — echo validationToken only if it is safe (alphanumeric, UUID-shaped, max 512 chars)
  const params = event.queryStringParameters || {};
  if (params.validationToken) {
    const token = params.validationToken;
    // MS Graph validation tokens are typically base64/base64url + opaque opaque-id strings.
    // Allow the full safe set: alnum, base64 (+ / =), URL-safe (- _), separators (. : ,).
    // 2026-05-08: previous regex was too strict (rejected '+' '/'), causing every
    // subscribe attempt for fanny@/info@ to fail with HTTP 400 → 0 outlook events
    // for 7 days. cto-nightly fix.
    if (!/^[A-Za-z0-9+/=_\-.:,]+$/.test(token) || token.length > 1024) {
      console.warn('[OutlookWebhook] Rejected unsafe validationToken (length=%d, sample=%s)', token.length, token.slice(0, 20));
      return { statusCode: 400, body: 'Invalid validation token' };
    }
    console.log('[OutlookWebhook] Validation token accepted (length=%d)', token.length);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: token,
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const clientIp = (event.headers || {})['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (await webhookRateLimited(clientIp)) {
    return { statusCode: 429, body: 'Too many requests' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { await auditIncoming('bad-json', {}); return { statusCode: 400, body: 'Invalid JSON' }; }

  const notifications = body.value || [];
  if (notifications.length === 0) {
    return { statusCode: 200, body: '' }; // empty heartbeat
  }

  // Process each notification (Graph batches multiple events per delivery)
  let token = null;
  const results = [];

  for (const n of notifications) {
    // 2. Verify clientState matches our secret (prevents spoofing)
    if (CLIENT_STATE && n.clientState !== CLIENT_STATE) {
      console.warn('[OutlookWebhook] clientState mismatch — rejecting');
      await auditIncoming('bad-client-state', { resource: n.resource });
      continue;
    }

    const changeType = (n.changeType || '').toLowerCase();        // created / updated / deleted
    const resource = n.resource || '';                            // e.g. "Users/abc/Events/xyz"
    const eventId = n.resourceData?.id;
    const subId = n.subscriptionId;

    if (!eventId) {
      await auditIncoming('no-event-id', { resource, changeType });
      continue;
    }

    // 3. Resolve user email from resource path so we can fetch the event
    const userMatch = resource.match(/Users\/([^\/]+)/i);
    const userKey = userMatch?.[1] || '';

    let eventData = null;
    if (changeType !== 'deleted') {
      // Fetch the actual event from Graph (notification only contains IDs)
      try {
        if (!token) token = await getAppToken();
        const r = await graphGet(token, `/users/${userKey}/events/${eventId}`);
        if (r.status === 200) eventData = r.data;
      } catch (e) {
        console.warn(`[OutlookWebhook] Graph fetch failed: ${e.message}`);
      }
    }

    // 4. Dispatch as meeting.*
    const subject = eventData?.subject || '(deleted)';
    const start = eventData?.start?.dateTime || null;
    const end   = eventData?.end?.dateTime || null;
    const organizer = eventData?.organizer?.emailAddress?.address || userKey;
    const attendees = (eventData?.attendees || []).map(a => a?.emailAddress?.address).filter(Boolean);

    await dispatchEvent(`meeting.${changeType}`, {
      id: eventId,
      entity_type: 'meeting',
      name: subject,
      subject,
      start, end,
      organizer,
      attendees,
      user: userKey,
      url: eventData?.webLink || null,
      change_type: changeType,
      subscription_id: subId,
      actor: 'outlook-webhook',
      source: 'outlook',
    });

    await auditIncoming('processed', { changeType, eventId, subject: subject.slice(0, 80), user: userKey });
    results.push({ id: eventId, changeType });
  }

  return { statusCode: 200, body: JSON.stringify({ processed: results.length }) };
};
