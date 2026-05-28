/**
 * decision-outcome.js — NEX Decision Outcome Learning Loop
 *
 * Scheduled: hourly at :15 (see netlify.toml)
 *
 * For each `decisions` row with NULL outcome and age > 2h, probe current
 * state to classify what happened:
 *   - followed    → the recommended action appears to have taken effect
 *                   (default after 2h with no reversal)
 *   - ignored     → nothing changed, > 24h old, no reply, no later sibling
 *   - reversed    → CEO replied with a reversal keyword within 2h, OR a
 *                   later decision on the same group key has an opposing
 *                   chosen_action.
 *   - superseded  → a newer decision on the same group key replaced this one
 *
 * Group key (since the active `decisions` table has no `signal_hash`):
 *   `${recommended_by}::${client_code || ''}::${target_entity_id || ''}`
 * This is a pragmatic approximation that works for the existing
 * recommender agents (ops-guardian, sales-coach, commitment-keeper, etc.).
 *
 * On Sunday 23:00 UTC also rolls last-week rows into `exeo_decisions_rollup`.
 *
 * 2026-05-08 cto-nightly: rewritten to target `decisions` table (was
 * pointing at the empty legacy `exeo_decisions`, hence 0/21 harvested).
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// ── tiny fetch helper ──
function request(method, path, body) {
  return new Promise(resolve => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return resolve({ status: 0, data: null });
    const url = new URL(`${SUPABASE_URL}${path}`);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation',
      },
    };
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let data = null;
        try { data = d ? JSON.parse(d) : null; } catch { data = d; }
        resolve({ status: res.statusCode || 0, data });
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    if (payload) req.write(payload);
    req.end();
  });
}

const supaGet   = (path)        => request('GET',   path, null);
const supaPatch = (path, body)  => request('PATCH', path, body);
const supaPost  = (path, body)  => request('POST',  path, body);

// ── outcome classification ──
const REVERSE_KEYWORDS = /\b(stop|don'?t|undo|wrong|revert|cancel that|nope|no, ?that|take back)\b/i;
const OPPOSING_ACTION  = /\b(cancel|reverse|undo|close|abandon|rollback)\b/i;

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

// Group key approximating signal_hash for the new `decisions` schema.
function groupKey(d) {
  return [
    d.recommended_by || 'unknown',
    d.client_code || '',
    d.target_entity_id || '',
  ].join('::');
}

async function classifyOne(decision, laterByGroup, recentCeoReplies) {
  const { id, recommended_by, recommendation, chosen_action, created_at } = decision;
  const ageHours = (Date.now() - new Date(created_at).getTime()) / 3600_000;
  const key = groupKey(decision);

  // SUPERSEDED — later decision on same group key
  const later = (laterByGroup[key] || []).filter(d => d.id !== id && new Date(d.created_at) > new Date(created_at));
  if (later.length > 0) {
    const newest = later.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const newestText = `${newest.chosen_action || ''} ${newest.recommendation || ''}`;
    const thisText = `${chosen_action || ''} ${recommendation || ''}`;
    const opposing = OPPOSING_ACTION.test(newestText) && !OPPOSING_ACTION.test(thisText);
    return {
      outcome: opposing ? 'reversed' : 'superseded',
      evidence: { superseded_by: newest.id, later_recommendation: (newest.recommendation || '').slice(0, 200) },
    };
  }

  // REVERSED — CEO replied with reversal keyword within 2h after decision
  const reversalReply = recentCeoReplies.find(r => {
    const rTime = new Date(r.created_at || r.at || 0).getTime();
    const dTime = new Date(created_at).getTime();
    if (!(rTime > dTime && rTime - dTime < 2 * 3600_000)) return false;
    const text = (r.payload?.text || r.payload?.reply || '').toString();
    if (!REVERSE_KEYWORDS.test(text)) return false;
    // soft agent match — either the agent name appears in the reply or it's a short reply
    const agentMatch = !recommended_by || JSON.stringify(r.payload || {}).toLowerCase().includes(String(recommended_by).toLowerCase());
    return agentMatch || text.length < 120;
  });
  if (reversalReply) {
    return {
      outcome: 'reversed',
      evidence: { ceo_reply_id: reversalReply.id, text_fragment: (reversalReply.payload?.text || '').slice(0, 160) },
    };
  }

  // IGNORED — > 24h old, no later decision, no reversal
  if (ageHours >= 24) {
    return { outcome: 'ignored', evidence: { reason: 'stale_no_followup', age_hours: Math.round(ageHours) } };
  }

  // FOLLOWED — > 2h old, no reversal signal, assume action took effect
  if (ageHours >= 2) {
    return { outcome: 'followed', evidence: { reason: 'no_reversal_signal', age_hours: Math.round(ageHours) } };
  }

  // Too fresh — leave NULL
  return null;
}

async function runOutcomeSweep() {
  // Pull open decisions older than 2h, newer than 7d
  const since = isoHoursAgo(24 * 7);
  const until = isoHoursAgo(2);
  const select = 'id,recommendation,chosen_action,recommended_by,client_code,target_entity_id,created_at,outcome,confidence_pre,confidence_post';
  const openRes = await supaGet(
    `/rest/v1/decisions?outcome=is.null&created_at=gte.${since}&created_at=lte.${until}&order=created_at.asc&limit=500&select=${select}`
  );
  if (openRes.status !== 200 || !Array.isArray(openRes.data)) {
    return { ok: false, reason: 'decisions table unreachable', http: openRes.status };
  }
  const open = openRes.data;
  if (open.length === 0) return { ok: true, processed: 0, note: 'no open decisions' };

  // Pull recent siblings (same window, all rows for these group keys) so we can spot supersession
  // Strategy: fetch all decisions in window once, then bucket by groupKey in memory.
  // 7-day window keeps payload bounded (typical < 500 rows).
  const windowRes = await supaGet(
    `/rest/v1/decisions?created_at=gte.${since}&order=created_at.asc&limit=2000&select=id,recommendation,chosen_action,recommended_by,client_code,target_entity_id,created_at,outcome`
  );
  const laterByGroup = {};
  if (windowRes.status === 200 && Array.isArray(windowRes.data)) {
    for (const d of windowRes.data) {
      const k = groupKey(d);
      if (!laterByGroup[k]) laterByGroup[k] = [];
      laterByGroup[k].push(d);
    }
  }

  // Pull CEO replies from audit_log in the window (for reversal detection)
  const replyRes = await supaGet(
    `/rest/v1/audit_log?action=eq.telegram.ceo_reply&created_at=gte.${since}&order=created_at.desc&limit=200`
  );
  const recentCeoReplies = (replyRes.status === 200 && Array.isArray(replyRes.data)) ? replyRes.data : [];

  let processed = 0;
  const summary = { followed: 0, ignored: 0, reversed: 0, superseded: 0 };

  for (const d of open) {
    const result = await classifyOne(d, laterByGroup, recentCeoReplies);
    if (!result) continue;
    const nowIso = new Date().toISOString();
    const upd = await supaPatch(`/rest/v1/decisions?id=eq.${d.id}`, {
      outcome: result.outcome,
      outcome_at: nowIso,
      outcome_observed_at: nowIso,
    });
    if (upd.status === 204 || upd.status === 200) {
      processed++;
      summary[result.outcome] = (summary[result.outcome] || 0) + 1;
    }
  }

  return { ok: true, processed, summary, candidates: open.length };
}

// ── Weekly rollup (Sunday 23:00 UTC) ──
function isSundayLateUTC() {
  const d = new Date();
  return d.getUTCDay() === 0 && d.getUTCHours() === 23;
}

function weekStartISO(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  // Roll back to previous Monday 00:00 UTC
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function runWeeklyRollup() {
  const weekStart = weekStartISO(new Date(Date.now() - 24 * 3600_000));
  const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 24 * 3600_000).toISOString();
  const r = await supaGet(
    `/rest/v1/decisions?created_at=gte.${weekStart}T00:00:00Z&created_at=lt.${weekEnd}&select=recommended_by,outcome&limit=5000`
  );
  if (r.status !== 200 || !Array.isArray(r.data)) return { ok: false, reason: 'rollup fetch failed', http: r.status };

  const byAgent = {};
  const totals = { total: 0, followed: 0, ignored: 0, reversed: 0, superseded: 0 };
  for (const row of r.data) {
    totals.total++;
    if (row.outcome && totals[row.outcome] !== undefined) totals[row.outcome]++;
    const a = row.recommended_by || 'unknown';
    if (!byAgent[a]) byAgent[a] = { total: 0, followed: 0, ignored: 0, reversed: 0, superseded: 0 };
    byAgent[a].total++;
    if (row.outcome && byAgent[a][row.outcome] !== undefined) byAgent[a][row.outcome]++;
  }

  const up = await supaPost(`/rest/v1/exeo_decisions_rollup?on_conflict=week_start`, {
    week_start: weekStart,
    total: totals.total,
    followed: totals.followed,
    ignored: totals.ignored,
    reversed: totals.reversed,
    by_agent: byAgent,
  });
  return { ok: up.status < 400, week_start: weekStart, totals, http: up.status };
}

exports.handler = async (event) => {
  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  if (internalKey) {
    const provided = (event.headers || {})['x-internal-key'] || '';
    const crypto = require('crypto');
    const valid = provided.length > 0 &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(internalKey));
    if (!valid) return { statusCode: 401, body: 'Unauthorized' };
  }

  const result = { sweep: null, rollup: null };
  try {
    result.sweep = await runOutcomeSweep();
  } catch (e) {
    result.sweep = { ok: false, error: e.message };
  }
  try {
    if (isSundayLateUTC()) result.rollup = await runWeeklyRollup();
  } catch (e) {
    result.rollup = { ok: false, error: e.message };
  }
  console.log(`[decision-outcome] sweep=${JSON.stringify(result.sweep)} rollup=${JSON.stringify(result.rollup)}`);
  return { statusCode: 200, body: JSON.stringify(result) };
};
