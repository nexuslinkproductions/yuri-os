/**
 * outlook-subscribe.js — MS Graph subscription lifecycle manager
 *
 * Runs daily (scheduled) AND on-demand (POST). Responsibilities:
 *   - Create subscriptions for each team member's calendar (if missing).
 *   - Renew subscriptions expiring within 24h (Graph caps lifetime at 4230min ≈ 70.5h).
 *   - Delete stale subscriptions to other notification URLs.
 *
 * Each subscription targets:
 *   resource     = users/{email}/events
 *   changeType   = created,updated,deleted
 *   notificationUrl = https://ops.c2moviez.com/.netlify/functions/outlook-webhook
 *   clientState  = OUTLOOK_WEBHOOK_SECRET
 *
 * Configuration (Netlify env vars):
 *   M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET — app-only OAuth
 *   M365_EMAIL_CTI, M365_EMAIL_FK, ...                — team member mailboxes
 *   OUTLOOK_WEBHOOK_SECRET                            — clientState
 *   DASHBOARD_URL (optional, defaults to ops.c2moviez.com)
 *
 * Schedule: daily at 02:00 UTC (configured in netlify.toml).
 */

const https = require('https');

const NOTIFY_URL = `${process.env.URL || process.env.DASHBOARD_URL || 'https://ops.c2moviez.com'}/.netlify/functions/outlook-webhook`;
const CLIENT_STATE = process.env.OUTLOOK_WEBHOOK_SECRET || '';
// Calendar/events subscriptions: max 4230 minutes (3 days minus 30 min safety).
const MAX_LIFETIME_MIN = 4230;
// Renew when remaining lifetime drops below this threshold.
const RENEW_THRESHOLD_MIN = 24 * 60;

function getAppToken() {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.M365_CLIENT_ID,
      client_secret: process.env.M365_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }).toString();
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: `/${process.env.M365_TENANT_ID}/oauth2/v2.0/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { const p = JSON.parse(raw); p.access_token ? resolve(p.access_token) : reject(new Error(p.error_description || raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function graph(token, method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'graph.microsoft.com', path: `/v1.0${path}`, method,
      headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); } catch { resolve({ status: res.statusCode, data: raw }); } });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    if (data) req.write(data); req.end();
  });
}

// Pull all configured team mailboxes from M365_EMAIL_* env vars
function teamEmails() {
  const map = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('M365_EMAIL_') && v) map[k.replace('M365_EMAIL_', '')] = v;
  }
  if (!map.CTI) map.CTI = 'claudio@c2moviez.com';
  return map;
}

function expiryIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

async function ensureSubscriptions() {
  const token = await getAppToken();
  const emails = teamEmails();
  const desiredResources = new Set(Object.values(emails).map(e => `users/${e}/events`));

  // 1. List current subscriptions
  const list = await graph(token, 'GET', '/subscriptions');
  const existing = list.data?.value || [];
  const summary = { created: [], renewed: [], deleted: [], kept: [] };

  // 2. Delete subscriptions pointing elsewhere or with wrong client state
  for (const sub of existing) {
    if (sub.notificationUrl !== NOTIFY_URL || (CLIENT_STATE && sub.clientState !== '<masked>')) {
      // Graph never echoes clientState back — only mismatched URL is a hard delete trigger.
      if (sub.notificationUrl !== NOTIFY_URL) {
        await graph(token, 'DELETE', `/subscriptions/${sub.id}`);
        summary.deleted.push(sub.id);
        continue;
      }
    }

    const minutesLeft = (new Date(sub.expirationDateTime).getTime() - Date.now()) / 60000;

    if (desiredResources.has(sub.resource)) {
      desiredResources.delete(sub.resource);
      if (minutesLeft < RENEW_THRESHOLD_MIN) {
        const r = await graph(token, 'PATCH', `/subscriptions/${sub.id}`, { expirationDateTime: expiryIso(MAX_LIFETIME_MIN) });
        if (r.status === 200) summary.renewed.push({ id: sub.id, resource: sub.resource });
      } else {
        summary.kept.push({ id: sub.id, resource: sub.resource, minutesLeft: Math.round(minutesLeft) });
      }
    } else {
      // Subscription on a resource we no longer want
      await graph(token, 'DELETE', `/subscriptions/${sub.id}`);
      summary.deleted.push(sub.id);
    }
  }

  // 3. Create missing subscriptions
  for (const resource of desiredResources) {
    const r = await graph(token, 'POST', '/subscriptions', {
      changeType: 'created,updated,deleted',
      notificationUrl: NOTIFY_URL,
      resource,
      expirationDateTime: expiryIso(MAX_LIFETIME_MIN),
      clientState: CLIENT_STATE,
    });
    if (r.status === 201) summary.created.push({ id: r.data.id, resource });
    else summary.created.push({ resource, error: r.data?.error?.message || `HTTP ${r.status}` });
  }

  return summary;
}

exports.handler = async (event) => {
  // Manual + scheduled both end up here
  try {
    const summary = await ensureSubscriptions();
    console.log('[OutlookSubscribe]', JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('[OutlookSubscribe] Failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
