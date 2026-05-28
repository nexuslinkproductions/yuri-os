/**
 * tracker-pull-plane.js — Workstream T.3 reverse-sync cron (every 15 min).
 *
 * Plane has no worklog webhook (verified 2026-05-14). To keep our
 * time_entries in sync with worklogs created directly in Plane (mobile,
 * partner activity), we pull every issue with recent activity and check
 * each worklog against our local mirror.
 *
 * Rules:
 *   - plane_worklog_id already in time_entries → ignore
 *   - new worklog + logged_by email maps to user_profiles → INSERT
 *       (source='plane_pull', plane_sync_state='synced', plane_worklog_id set)
 *   - new worklog + unmapped email → INSERT under CEO with audit note
 *
 * Scope: only issues with state.updated_at within the last 7 days (from
 * the entity_state cache populated by Scripts/plane-sync.py).
 *
 * NOTE: This function only INSERTs. Updates to existing worklogs (e.g.
 * Plane-side edits) are picked up by the existing entity_state worklog
 * mirror that the TicketSheet renders; we don't reconcile durations here
 * v1. Drift detection happens hourly in tracker_reconcile_drift (T.3 v2).
 */
const https = require('https');
const plane = require('./shared-plane-client');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const ISSUE_LOOKBACK_DAYS = 7;
const MAX_ISSUES = 40;          // cap per tick — keeps GETs under the 30 rpm budget

function sb(method, path, body) {
  const u = new URL(SUPA_URL);
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname, port: 443, path, method,
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        Accept: 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : '',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(raw); } catch { j = raw; }
        resolve({ status: res.statusCode, body: j });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchRecentTickets() {
  const cutoff = new Date(Date.now() - ISSUE_LOOKBACK_DAYS * 86_400_000).toISOString();
  // entity_state for tickets with state.updated_at recent
  const q = `/rest/v1/entity_state?select=entity_id,entity_type,state&entity_type=eq.ticket&updated_at=gte.${encodeURIComponent(cutoff)}&order=updated_at.desc&limit=${MAX_ISSUES}`;
  const r = await sb('GET', q);
  if (r.status >= 400) throw new Error(`fetchRecentTickets ${r.status}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function fetchUserProfiles() {
  const r = await sb('GET', '/rest/v1/user_profiles?select=id,email&is_active=eq.true');
  if (r.status >= 400) throw new Error(`fetchUserProfiles ${r.status}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function fetchExistingWorklogIds() {
  // We need to know which Plane worklog_ids we've already mirrored locally.
  // Pull just the IDs (server-side dedup-cheap).
  const r = await sb('GET', '/rest/v1/time_entries?select=plane_worklog_id&plane_worklog_id=not.is.null');
  if (r.status >= 400) throw new Error(`fetchExistingWorklogIds ${r.status}`);
  return new Set((Array.isArray(r.body) ? r.body : []).map((x) => x.plane_worklog_id));
}

async function insertEntry(row) {
  const r = await sb('POST', '/rest/v1/time_entries', row);
  if (r.status >= 400) {
    console.warn(`[pull-plane] insert failed ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    return null;
  }
  return Array.isArray(r.body) ? r.body[0] : r.body;
}

async function ceoUserId() {
  const r = await sb('GET', "/rest/v1/user_profiles?select=id&role=eq.ceo&is_active=eq.true&limit=1");
  if (r.status >= 400) return null;
  const rows = Array.isArray(r.body) ? r.body : [];
  return rows[0]?.id || null;
}

exports.handler = async () => {
  if (!SUPA_URL || !SUPA_KEY || !process.env.PLANE_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'env not configured' }) };
  }
  const t0 = Date.now();
  let tickets = [];
  let profiles = [];
  let knownIds = new Set();
  let fallbackUser = null;
  try {
    [tickets, profiles, knownIds, fallbackUser] = await Promise.all([
      fetchRecentTickets(),
      fetchUserProfiles(),
      fetchExistingWorklogIds(),
      ceoUserId(),
    ]);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }

  // email → user_id (case-insensitive)
  const emailToUser = new Map();
  for (const p of profiles) {
    if (p.email) emailToUser.set(p.email.toLowerCase(), p.id);
  }

  let scanned = 0, inserted = 0, skipped = 0, errors = 0;

  for (const t of tickets) {
    const issueId = t.entity_id;
    const state = t.state || {};
    if (!issueId) continue;
    scanned++;
    try {
      // Plane needs (project, issue) to fetch worklogs. Use the project_id
      // we stored on entity_state.state if present; otherwise resolve.
      let projectId = state.project_id || state.project || null;
      if (!projectId) {
        try { projectId = await plane.getProjectForIssue(issueId); } catch { /* skip */ }
      }
      if (!projectId) { skipped++; continue; }

      const worklogs = await plane.listWorklogs(projectId, issueId);
      for (const w of worklogs) {
        if (!w?.id) continue;
        if (knownIds.has(w.id)) continue;

        // Plane worklogs include `logged_by` (user_id) and `description`,
        // and `duration` as `HH:MM:SS` (or seconds depending on API version).
        const loggedByEmail = (w.logged_by_email || w.logged_by?.email || '').toLowerCase();
        const userId = (loggedByEmail && emailToUser.get(loggedByEmail)) || fallbackUser;
        if (!userId) { skipped++; continue; }

        // Parse duration
        let seconds = 0;
        if (typeof w.duration === 'number') {
          seconds = w.duration;
        } else if (typeof w.duration === 'string') {
          const parts = w.duration.split(':').map((p) => parseInt(p, 10));
          if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
        }
        // Plane gives created_at but no started/ended explicitly for worklogs.
        // We anchor started_at to Plane's logged_at if present, else created_at.
        const startedAt = w.logged_at || w.created_at || new Date().toISOString();
        const endedAt = new Date(new Date(startedAt).getTime() + seconds * 1000).toISOString();

        await insertEntry({
          user_id: userId,
          plane_issue_id: issueId,
          plane_issue_seq: state.ticketId || state.sequence_id || null,
          client_code: state.client_code || state.customer_code || null,
          project_code: state.project_code || null,
          description: w.description || null,
          started_at: startedAt,
          ended_at: endedAt,
          is_billable: true,                         // default; CEO can edit
          source: 'plane_pull',
          plane_worklog_id: w.id,
          plane_sync_state: 'synced',
          plane_synced_at: new Date().toISOString(),
          notes: loggedByEmail ? `pulled from Plane (logged_by ${loggedByEmail})` : 'pulled from Plane',
        });
        knownIds.add(w.id);
        inserted++;
      }
    } catch (e) {
      errors++;
      console.warn(`[pull-plane] issue ${issueId} error:`, e.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, tickets: scanned, inserted, skipped, errors, ms: Date.now() - t0 }),
  };
};

// Schedule: every 15 minutes
exports.config = {
  schedule: '*/15 * * * *',
};
