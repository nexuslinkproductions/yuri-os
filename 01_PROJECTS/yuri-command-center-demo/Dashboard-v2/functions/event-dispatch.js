/**
 * event-dispatch.js — Real-time event pipeline
 *
 * Receives structured events from the frontend, scripts, and other functions.
 * Writes to Supabase audit_log and evaluates notification rules to
 * send Telegram alerts for critical events.
 *
 * Events:
 *   ticket.created   — New ticket created (urgent → Telegram alert)
 *   ticket.overdue   — Ticket became overdue (3+ days → Telegram alert)
 *   client.risk      — Client status changed to at-risk (→ Telegram alert)
 *   meeting.analyzed — Meeting transcribed with action items (→ Telegram proposal)
 *   sync.completed   — Dashboard↔Obsidian sync finished (audit only)
 *
 * POST /.netlify/functions/event-dispatch
 * Body: { event: string, data: object }
 */

const https = require('https');
const { CORS, ALLOWED_ORIGIN, ok, err, options } = require('./shared');
const { storageGet, storagePut } = require('./shared-storage');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// In-memory burst dedup — catches 3x Plane webhook fires within 30s before any DB insert
const _burstCache = new Map();
function isBurstDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of _burstCache) if (now - t > 30000) _burstCache.delete(k);
  if (_burstCache.has(key)) return true;
  _burstCache.set(key, now);
  return false;
}

// ── Supabase REST insert ──
function supabaseInsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise((resolve) => {
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
      }
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

// ── Supabase RPC: upsert entity_state (drives Dashboard real-time updates) ──
function supabaseUpsertEntityState(entityType, entityId, state, source) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !entityType || !entityId) return Promise.resolve(null);
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      p_entity_type: entityType,
      p_entity_id: String(entityId),
      p_state: state || {},
      p_source: source || 'event-dispatch',
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/upsert_entity_state`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }
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

// Map event type → (entity_type, id-extractor) for entity_state upserts.
// Add new event types here to make them push real-time updates to subscribers.
function deriveEntity(eventType, data) {
  if (!data) return null;
  const t = eventType.split('.')[0];
  const id = data.id || data.entity_id || data.kuerzel || data.client || null;
  if (!id) return null;
  const knownTypes = new Set(['ticket', 'client', 'meeting', 'pipeline', 'workflow', 'sync', 'health']);
  if (!knownTypes.has(t)) return null;
  return { entity_type: t, entity_id: String(id) };
}

// ── Telegram notification ──
function telegramSend(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_IDS.length) return Promise.resolve();
  return Promise.all(TELEGRAM_CHAT_IDS.map(chatId => {
    return new Promise((resolve) => {
      const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
      const opts = {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const req = https.request(opts, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve());
      });
      req.on('error', () => resolve());
      req.write(payload); req.end();
    });
  }));
}

// ── Notification Rules ──
const RULES = {
  'ticket.created': (data) => {
    if (data.priority === 'urgent' || data.priority === 'high') {
      return `🔴 <b>New ${data.priority} ticket</b>\n\n📋 ${data.name || 'Untitled'}\n👤 ${data.assignee || 'Unassigned'}\n📁 ${data.project || 'Unknown'}\n📅 Due: ${data.due_date || 'Not set'}\n\n${data.url ? `<a href="${data.url}">Open in Plane</a>` : ''}`;
    }
    return null; // Don't notify for medium/low
  },

  'ticket.overdue': (data) => {
    const days = data.days_overdue || 0;
    if (days >= 3) {
      return `⚠️ <b>Ticket overdue ${days} days</b>\n\n📋 ${data.name || 'Untitled'}\n👤 ${data.assignee || 'Unassigned'}\n📁 ${data.project || 'Unknown'}\n📅 Was due: ${data.due_date || 'Unknown'}\n\nUse /review overdue to triage`;
    }
    return null;
  },

  'client.risk': (data) => {
    return `🟡 <b>Client at risk</b>\n\n🏢 ${data.client || 'Unknown'}\n📊 ${data.reason || 'Status changed to at-risk'}\n📋 Open tickets: ${data.open_tickets || 0}\n📅 Last activity: ${data.last_activity || 'Unknown'}\n\nUse /client ${data.kuerzel || ''} for details`;
  },

  'meeting.analyzed': (data) => {
    const tickets = data.tickets_proposed || [];
    if (!tickets.length) return null;
    let msg = `📝 <b>Meeting analyzed — ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} proposed</b>\n\n`;
    msg += `🏢 ${data.client || 'Unknown'}\n📅 ${data.date || 'Today'}\n\n`;
    tickets.slice(0, 5).forEach((t, i) => {
      msg += `${i + 1}. <b>${t.title || t.name || 'Untitled'}</b>\n   Priority: ${t.priority || 'medium'} · ${t.reasoning || ''}\n\n`;
    });
    msg += `Reply with ticket numbers to create, or "skip" to dismiss.`;
    return msg;
  },

  'sync.completed': () => null, // Audit only, no notification

  'workflow.escalated': (data) => {
    return `⬆️ <b>Auto-escalated</b>\n\n📋 ${data.name || 'Untitled'}\n${data.from_priority || 'medium'} → ${data.to_priority || 'high'}\n📅 Overdue ${data.days_overdue || 0} days\n\nUse /review to check`;
  },

  'meeting.transcribed': (data) => {
    if (data.tickets_proposed > 0) return null; // proposals sent separately via meetingProposal flow
    return `🎙 <b>Meeting transcribed</b>\n\n🏢 ${data.client || 'Unknown'} · ${data.date || ''}\n📝 ${data.segments || 0} segments\n\nNo ticket proposals generated — review transcript in dashboard.`;
  },
};

// ── Handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body;
  try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }

  const { event: eventType, data } = body;
  if (!eventType) return err('Missing event type');

  // Burst dedup: reject duplicate events within 30s (catches 3x Plane webhook retries)
  const burstKey = `${eventType}--${data?.id || data?.entity_id || data?.kuerzel || 'global'}`;
  if (isBurstDuplicate(burstKey)) {
    console.log(`[EventDispatch] Burst dedup: ${burstKey}`);
    return ok({ dispatched: false, event: eventType, deduped: true });
  }

  // 1. Write to Supabase audit_log
  const auditEntry = {
    action: eventType,
    entity_type: data?.entity_type || eventType.split('.')[0],
    entity_id: data?.id || data?.entity_id || null,
    entity_name: data?.name || data?.client || data?.entity_name || '',
    actor: data?.actor || 'system',
    details: data || {},
    metadata: { source: 'event-dispatch', timestamp: Date.now() },
  };

  // ── Notification deduplication ──
  const dedupKey = `${eventType}--${data?.id || data?.kuerzel || data?.client || 'global'}`;
  const COOLDOWNS = {
    'ticket.created': 300000,        // 5 min — suppress Plane webhook retries
    'ticket.overdue': 259200000,    // 3 days
    'client.risk': 604800000,       // 7 days
    'workflow.escalated': 86400000, // 1 day
  };
  let isDuplicate = false;
  const cooldown = COOLDOWNS[eventType];
  if (cooldown) {
    try {
      const lastAlert = await supabaseInsert ? null : null; // placeholder — check blob
      const dedupStorageKey = `dedup--${dedupKey.replace(/[^a-zA-Z0-9-]/g, '_')}`;
      const stored = await storageGet('telegram-state', dedupStorageKey);
      if (stored?.ts && Date.now() - stored.ts < cooldown) {
        isDuplicate = true;
      } else {
        await storagePut('telegram-state', dedupStorageKey, { ts: Date.now() });
      }
    } catch {}
  }

  // Phase C: also upsert entity_state so Realtime subscribers (Dashboard,
  // supabase-sub LaunchAgent, EXEO) get instant per-entity updates.
  const entity = deriveEntity(eventType, data);

  const [auditResult, entityResult] = await Promise.all([
    supabaseInsert('audit_log', auditEntry),
    entity
      ? supabaseUpsertEntityState(entity.entity_type, entity.entity_id, data, data?.source || 'event-dispatch')
      : Promise.resolve(null),
    // Evaluate notification rules and send if applicable (with dedup check)
    (async () => {
      const rule = RULES[eventType];
      if (!rule) return;
      if (isDuplicate) { console.log(`[EventDispatch] Deduped: ${eventType} for ${dedupKey}`); return; }
      const message = rule(data);
      if (message) {
        await telegramSend(message);
        console.log(`[EventDispatch] Sent Telegram notification for ${eventType}`);
      }
    })(),
  ]);

  return ok({
    dispatched: true,
    event: eventType,
    notified: !!RULES[eventType]?.(data),
    audit_id: auditResult?.[0]?.id || null,
    entity_state_version: entityResult?.[0]?.version || entityResult?.version || null,
  });
};
