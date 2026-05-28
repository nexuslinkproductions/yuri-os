/**
 * tracker-push-plane.js — Workstream T.3 cron (every 2 min).
 *
 * Picks up time_entries rows where plane_sync_state='pending' AND
 * plane_issue_id IS NOT NULL, creates a Plane worklog for each, and
 * calls tracker_mark_plane_synced(entry_id, plane_worklog_id) so the
 * row transitions to 'synced'.
 *
 * Idempotent: a row's state is only mutated to 'synced' on a confirmed
 * Plane POST. On any error we log + leave the row at 'pending' so the
 * next tick retries.
 *
 * Limits: caps at 25 entries per run so a backlog can't blow the 30
 * Plane rpm budget on one tick. Backlog drains across multiple ticks.
 */
const https = require('https');
const plane = require('./shared-plane-client');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const MAX_PER_TICK = 25;

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

async function listPending() {
  const q = `/rest/v1/time_entries?plane_sync_state=eq.pending&plane_issue_id=not.is.null&ended_at=not.is.null&order=started_at.asc&limit=${MAX_PER_TICK}`;
  const r = await sb('GET', q);
  if (r.status >= 400) throw new Error(`listPending ${r.status}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function markSynced(entry, worklogId) {
  // service_role bearer is set by sb() → auth.role()='service_role' inside
  // the SECURITY DEFINER RPC, which trusts p_actor (entry.user_id).
  const r = await sb('POST', '/rest/v1/rpc/tracker_mark_plane_synced', {
    p_actor: entry.user_id,
    p_entry_id: entry.id,
    p_plane_worklog_id: worklogId,
  });
  if (r.status >= 400) throw new Error(`markSynced ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`);
  return r.body;
}

async function markConflict(entry, reason) {
  // Set plane_sync_state='conflict' directly via REST + service_role.
  const r = await sb('PATCH', `/rest/v1/time_entries?id=eq.${entry.id}`, {
    plane_sync_state: 'conflict',
  });
  if (r.status >= 400) console.warn(`[push-plane] markConflict ${entry.id} → ${r.status}`);
  // Best-effort audit row
  await sb('POST', '/rest/v1/audit_log', {
    action: 'tracker_push_failed',
    entity_type: 'time_entry',
    entity_id: entry.id,
    entity_name: entry.plane_issue_seq || '—',
    actor: 'system',
    details: { reason: String(reason || '').slice(0, 400) },
  }).catch(() => {});
}

exports.handler = async () => {
  if (!SUPA_URL || !SUPA_KEY || !process.env.PLANE_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'env not configured' }) };
  }
  const t0 = Date.now();
  let pending = [];
  try {
    pending = await listPending();
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
  if (pending.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed: 0, ms: Date.now() - t0 }) };
  }

  // Cache project_id per Plane issue across this tick (saves duplicate GETs)
  const projectCache = new Map();
  let pushed = 0, failed = 0;

  for (const entry of pending) {
    try {
      let projectId = projectCache.get(entry.plane_issue_id);
      if (!projectId) {
        projectId = await plane.getProjectForIssue(entry.plane_issue_id);
        if (!projectId) {
          await markConflict(entry, 'no project_id resolved for issue');
          failed++;
          continue;
        }
        projectCache.set(entry.plane_issue_id, projectId);
      }
      const created = await plane.createWorklog(projectId, entry.plane_issue_id, {
        description: entry.description || '',
        durationSeconds: entry.duration_seconds,
      });
      if (!created?.id) {
        await markConflict(entry, 'plane returned no worklog id');
        failed++;
        continue;
      }
      await markSynced(entry, created.id);
      pushed++;
    } catch (e) {
      console.warn(`[push-plane] entry ${entry.id} failed:`, e.message);
      // Don't mark conflict on transient errors — leave 'pending' for next tick.
      // Only mark conflict on hard 4xx (which plane.call throws differently).
      if (String(e.message).match(/[ \[](4\d\d)[ \]]|status (4\d\d)/)) {
        await markConflict(entry, e.message);
      }
      failed++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, total: pending.length, pushed, failed, ms: Date.now() - t0 }),
  };
};

// Schedule: every 2 minutes
exports.config = {
  schedule: '*/2 * * * *',
};
