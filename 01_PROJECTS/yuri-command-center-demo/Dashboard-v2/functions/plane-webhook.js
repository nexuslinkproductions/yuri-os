/**
 * plane-webhook.js — Plane.so webhook receiver
 *
 * Receives webhook events from Plane.so and forwards them to event-dispatch
 * for notification routing.
 *
 * Supported events:
 *   issue.created  → forward as ticket.created
 *   issue.updated  → check for priority/state changes, forward if significant
 *   issue.deleted  → audit log only
 *
 * Setup: Configure webhook in Plane.so → Settings → Webhooks
 *   URL: https://ops.c2moviez.com/.netlify/functions/plane-webhook
 *   Secret: Set PLANE_WEBHOOK_SECRET env var
 *
 * POST /.netlify/functions/plane-webhook
 */

const https = require('https');
const crypto = require('crypto');
const { WORKSPACE, PROJECTS, syncTeamIds } = require('./shared-config');

const WEBHOOK_SECRET = process.env.PLANE_WEBHOOK_SECRET || '';

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
      const req = require('https').request(opts, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.write(payload); req.end();
    });
    return result === true;
  } catch { return false; }
}

// ── Signature Verification ──
function verifySignature(body, signature) {
  if (!WEBHOOK_SECRET) { console.warn('[Webhook] PLANE_WEBHOOK_SECRET not set — rejecting request'); return false; }
  if (!signature) return false;
  const computed = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// ── Forward to event-dispatch ──
async function dispatchEvent(eventType, data) {
  const serviceKey = process.env.INTERNAL_SERVICE_KEY || '';
  const payload = JSON.stringify({ event: eventType, data });

  return new Promise((resolve) => {
    // Call event-dispatch directly (same Netlify site)
    const opts = {
      hostname: process.env.URL?.replace('https://', '') || 'ops.c2moviez.com',
      path: '/.netlify/functions/event-dispatch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': serviceKey,
        'Content-Length': Buffer.byteLength(payload),
      }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve({ status: 500 }));
    req.write(payload); req.end();
  });
}

// ── Priority number → name ──
const PRIORITY_NAMES = { 0: 'none', 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };

// ── Debug observability: log every incoming POST attempt to audit_log,
// regardless of signature validity. Lets us see whether Plane is delivering
// at all (no native delivery log in Plane.so admin UI).
async function logIncoming(event, outcome, extras = {}) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const headerKeys = Object.keys(event.headers || {}).filter(h => /plane|signature|webhook|x-/i.test(h));
  const headerSnap = {};
  for (const h of headerKeys) headerSnap[h] = (event.headers[h] || '').slice(0, 80);

  let bodyParsed = null;
  try { bodyParsed = JSON.parse(event.body || '{}'); } catch {}
  const eventType = bodyParsed?.event || bodyParsed?.action || bodyParsed?.event_type || '';
  const dataName  = bodyParsed?.data?.name || bodyParsed?.issue?.name || '';

  const payload = JSON.stringify({
    action: 'webhook.plane.' + outcome,
    entity_type: 'webhook-debug',
    entity_id: 'plane',
    entity_name: dataName.slice(0, 80) || eventType.slice(0, 60),
    actor: 'plane',
    details: { outcome, eventType, dataName, headerSnap, bodyKeys: bodyParsed ? Object.keys(bodyParsed) : null, bodyLen: (event.body || '').length, ...extras },
    metadata: { source: 'plane-webhook', timestamp: Date.now() },
  });

  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/audit_log`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(payload),
      }
    };
    const req = require('https').request(opts, res => { res.on('data',()=>{}); res.on('end',()=>resolve()); });
    req.on('error', () => resolve()); req.write(payload); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    await logIncoming(event, 'wrong-method', { method: event.httpMethod });
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const clientIp = (event.headers || {})['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (await webhookRateLimited(clientIp)) {
    return { statusCode: 429, body: 'Too many requests' };
  }

  // Verify webhook signature
  const signature = event.headers['x-plane-signature'] || event.headers['X-Plane-Signature'] || '';
  if (!verifySignature(event.body || '', signature)) {
    console.error('[Webhook] Invalid signature');
    await logIncoming(event, 'bad-signature', { sigPresent: !!signature, sigLen: signature.length, secretConfigured: !!WEBHOOK_SECRET });
    return { statusCode: 401, body: 'Invalid signature' };
  }
  await logIncoming(event, 'accepted');

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Plane sends `event` (entity, e.g. "issue") and `action` (verb, e.g. "updated") separately.
  // Normalize to a single key like "issue.updated" for routing while preserving the raw bits.
  const planeEntity = (body.event || '').toString().toLowerCase();        // "issue", "cycle", "module", ...
  const planeAction = (body.action || '').toString().toLowerCase();       // "created", "updated", "deleted"
  const webhookEvent = planeEntity && planeAction
    ? `${planeEntity}.${planeAction}`
    : (planeEntity || planeAction || '');
  const issue = body.data || body.issue || body;

  console.log(`[Webhook] Received: ${webhookEvent}, entity=${planeEntity}, action=${planeAction}, name=${issue?.name || 'unknown'}`);

  // Sync team for assignee resolution
  let teamIds = {};
  try { teamIds = await syncTeamIds(); } catch {}

  // Map Plane.so project UUID to code
  const projectCode = Object.entries(PROJECTS).find(([, id]) => id === issue?.project)?.[0] || 'Unknown';

  // Plane numeric priority (0..3 sometimes, 0..4 elsewhere). Normalize via PRIORITY_NAMES,
  // and fall back to the raw value if it's already a string ("low" / "medium" / ...).
  function priLabel(p) {
    if (typeof p === 'string' && p) return p.toLowerCase();
    return PRIORITY_NAMES[p] || 'medium';
  }
  const priority = priLabel(issue?.priority);
  const assignee = issue?.assignees?.[0] ? (teamIds[issue.assignees[0]] || 'Unassigned') : 'Unassigned';
  const issueUrl = issue?.id ? `https://app.plane.so/${WORKSPACE}/projects/${issue.project}/issues/${issue.id}` : undefined;
  // Build readable identifier "<PROJ>-<SEQ>" (e.g. "C2I-2"). Plane omits this from
  // webhook payloads — it only sends UUID + sequence_id — so we synthesize it.
  const seqId = issue?.sequence_id;
  const readableId = (projectCode && projectCode !== 'Unknown' && seqId)
    ? `${projectCode}-${seqId}`
    : null;
  const ticketId = readableId || issue?.identifier || issue?.id || '';

  // Common ticket payload (used by created + updated)
  const ticketPayload = {
    id: ticketId,
    entity_type: 'ticket',
    name: issue?.name,
    priority,
    assignee,
    project: projectCode,
    due_date: issue?.target_date || null,
    start_date: issue?.start_date || null,
    state_uuid: issue?.state || null,    // raw UUID — supabase-sub resolves to name via Plane API
    plane_uuid: issue?.id || null,
    sequence_id: seqId || null,
    url: issueUrl,
    actor: 'plane-webhook',
    source: 'plane',
  };

  if (planeEntity === 'issue' && planeAction === 'created') {
    await dispatchEvent('ticket.created', ticketPayload);
  }
  else if (planeEntity === 'issue' && planeAction === 'updated') {
    // Always dispatch a `ticket.updated` so the Dashboard / supabase-sub get
    // a real-time signal. Only escalate via `ticket.created` (which triggers
    // a Telegram alert) when priority increased.
    await dispatchEvent('ticket.updated', { ...ticketPayload, activity: body.activity || null });

    const oldPri = body.old_data?.priority;
    const newPri = issue?.priority;
    if (typeof oldPri === 'number' && typeof newPri === 'number' && newPri < oldPri) {
      await dispatchEvent('ticket.created', { ...ticketPayload, name: `[ESCALATED] ${issue?.name}` });
    }
  }
  else if (planeEntity === 'issue' && planeAction === 'deleted') {
    await dispatchEvent('ticket.deleted', {
      id: ticketId,
      entity_type: 'ticket',
      name: issue?.name || ticketId,
      project: projectCode,
      actor: 'plane-webhook',
      source: 'plane',
    });
  }

  return { statusCode: 200, body: JSON.stringify({ received: true, event: webhookEvent }) };
};
