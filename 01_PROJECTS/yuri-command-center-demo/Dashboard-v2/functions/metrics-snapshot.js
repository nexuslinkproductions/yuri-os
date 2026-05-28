/**
 * metrics-snapshot.js — Nightly KPI snapshot
 *
 * Scheduled: 23:00 UTC (01:00 CEST) daily
 *
 * Captures operational metrics and stores them in Supabase `daily_metrics` table
 * for historical trending (sparklines, velocity charts, etc.).
 *
 * Metrics captured:
 *   - Active tickets per project (C2M, C2I, MFB, MACL)
 *   - Overdue ticket count
 *   - Tickets completed today
 *   - Active client count (clients with open tickets)
 *   - Pipeline value total (from Netlify Blobs)
 *   - MRR total (from Plane.so customers or client KB)
 *
 * Supabase table schema (for reference — do not execute):
 *   daily_metrics: date (date, PK), project_stats (jsonb), overdue_count (int),
 *     completed_today (int), active_clients (int), pipeline_value (decimal), mrr (decimal)
 */

const https = require('https');
const { WORKSPACE, PROJECTS, PROJECTS_LIST } = require('./shared-config');

const PLANE_KEY = process.env.PLANE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ── Plane.so API helper ──
function planeGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.plane.so',
      path: `/api/v1/workspaces/${WORKSPACE}${path}`,
      method: 'GET',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Fetch all issues for a project (paginated) ──
async function fetchProjectIssues(projectId) {
  const issues = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await planeGet(`/projects/${projectId}/issues/?per_page=100&page=${page}`);
    const results = res?.results || (Array.isArray(res) ? res : []);
    issues.push(...results);
    hasMore = results.length === 100;
    page++;
  }
  return issues;
}

// ── Supabase REST upsert ──
function supabaseUpsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[MetricsSnapshot] Supabase not configured, skipping write');
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname + '?on_conflict=date', method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
        'Content-Length': Buffer.byteLength(payload),
      }
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', (e) => { console.error(`[MetricsSnapshot] Supabase error: ${e.message}`); resolve(null); });
    req.write(payload); req.end();
  });
}

// ── Fetch pipeline value from Supabase Storage ──
async function fetchPipelineValue() {
  const { storageGet } = require('./shared-storage');
  const pipeline = await storageGet('production-hub', 'pipeline');
  if (!pipeline) return 0;
  const leads = pipeline?.leads || pipeline || [];
  if (!Array.isArray(leads)) return 0;
  return leads.reduce((sum, lead) => sum + (parseFloat(lead.value) || 0), 0);
}

// ── Fetch MRR from Plane.so customers ──
async function fetchMRR() {
  try {
    const res = await planeGet('/customers/?per_page=100');
    const customers = res?.results || (Array.isArray(res) ? res : []);
    let mrr = 0;
    customers.forEach(c => {
      // Check for monthly_revenue in custom properties or metadata
      const rev = c.monthly_revenue || c.metadata?.monthly_revenue || 0;
      mrr += parseFloat(rev) || 0;
    });
    return mrr;
  } catch {
    return 0;
  }
}

// ── Fetch client KB from Supabase Storage for MRR fallback ──
async function fetchClientKBMRR() {
  const { storageGet } = require('./shared-storage');
  const kb = await storageGet('production-hub', 'client-kb');
  if (!kb) return 0;
  const clients = kb?.clients || kb || {};
  let mrr = 0;
  Object.values(clients).forEach(c => {
    if (c.revenue_status === 'active' && c.billing_type === 'monthly') {
      mrr += parseFloat(c.monthly_revenue) || 0;
    }
  });
  return mrr;
}

// ── Main handler ──
exports.handler = async (event) => {
  console.log('[MetricsSnapshot] Starting nightly KPI snapshot');

  if (!PLANE_KEY) {
    console.error('[MetricsSnapshot] PLANE_API_KEY not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'PLANE_API_KEY not configured' }) };
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // Fetch all project issues in parallel
    const projectIssueResults = await Promise.all(
      PROJECTS_LIST.map(async ({ code, id }) => {
        const issues = await fetchProjectIssues(id);
        return { code, issues };
      })
    );

    // Fetch pipeline value and MRR in parallel
    const [pipelineValue, planeMRR, clientKBMRR] = await Promise.all([
      fetchPipelineValue(),
      fetchMRR(),
      fetchClientKBMRR(),
    ]);

    // Use Plane.so MRR if available, fall back to client KB
    const mrr = planeMRR > 0 ? planeMRR : clientKBMRR;

    // Active states (not cancelled/done)
    const DONE_STATES = ['done', 'cancelled'];

    // Build project stats
    const projectStats = {};
    let totalOverdue = 0;
    let completedToday = 0;
    const activeClientSet = new Set();

    projectIssueResults.forEach(({ code, issues }) => {
      const active = issues.filter(i => {
        const stateName = (i.state_detail?.name || i.state?.name || '').toLowerCase();
        return !DONE_STATES.includes(stateName);
      });

      const done = issues.filter(i => {
        const stateName = (i.state_detail?.name || i.state?.name || '').toLowerCase();
        return stateName === 'done';
      });

      // Overdue = active tickets with due_date in the past
      const overdue = active.filter(i => {
        if (!i.target_date) return false;
        return i.target_date < today;
      });

      // Completed today = done tickets whose updated_at is today
      const doneToday = done.filter(i => {
        const updated = (i.updated_at || '').slice(0, 10);
        return updated === today;
      });

      // Track active clients (from labels or customer)
      active.forEach(i => {
        const customer = i.customer_detail?.name || i.customer?.name || '';
        if (customer) activeClientSet.add(customer);
        // Also check label-based clients
        (i.label_detail || []).forEach(l => {
          if (l.name) activeClientSet.add(l.name);
        });
      });

      projectStats[code] = {
        active: active.length,
        total: issues.length,
        overdue: overdue.length,
        completed_today: doneToday.length,
      };

      totalOverdue += overdue.length;
      completedToday += doneToday.length;
    });

    const metricsRow = {
      date: today,
      project_stats: projectStats,
      overdue_count: totalOverdue,
      completed_today: completedToday,
      active_clients: activeClientSet.size,
      pipeline_value: pipelineValue,
      mrr: mrr,
    };

    console.log(`[MetricsSnapshot] Metrics: overdue=${totalOverdue}, completed=${completedToday}, clients=${activeClientSet.size}, pipeline=${pipelineValue}, mrr=${mrr}`);

    // Upsert to Supabase
    const result = await supabaseUpsert('daily_metrics', metricsRow);
    console.log('[MetricsSnapshot] Snapshot saved to Supabase');

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date: today, metrics: metricsRow, supabase: result ? 'saved' : 'skipped' }),
    };
  } catch (e) {
    console.error(`[MetricsSnapshot] Error: ${e.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
