/**
 * context-engine.js — Operational Context Assembly Service
 *
 * Assembles unified context for any entity (client, meeting, ticket).
 * Used by: meeting auto-context, Telegram bot, COO Brain, analyzeMeeting.
 *
 * POST /.netlify/functions/context-engine
 * Body: { type: 'client'|'meeting'|'ticket', id: string, depth: 'light'|'full' }
 *
 * Returns: { client, tickets, meetings, pipeline, health, suggestions }
 */

const { CORS, ALLOWED_ORIGIN, ok, err, options } = require('./shared');
const { WORKSPACE, PROJECTS, PROJECTS_LIST, CLIENT_MATCH_RULES, syncTeamIds } = require('./shared-config');
const { planeGet } = require('./shared-plane');
const { getBlobDirect: blobGet } = require('./shared-data');

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.results)) return r.results;
  return [];
}

// ── Match client name to kuerzel ──
function matchClient(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const rule of CLIENT_MATCH_RULES) {
    for (const p of rule.patterns) {
      if (lower.includes(p)) return rule.code;
    }
  }
  return null;
}

// ── Build client context ──
async function buildClientContext(clientName, depth = 'light') {
  const teamIds = await syncTeamIds();
  const kuerzel = matchClient(clientName);

  // Parallel fetch: client-kb, issues, pipeline, meetings
  const [clientKB, pipelineIndex, meetingsIndex] = await Promise.all([
    blobGet('client-kb--data'),
    depth === 'full' ? blobGet('pipeline--_index') : null,
    depth === 'full' ? blobGet('meetings--_index') : null,
  ]);

  // Client data from KB
  const kb = clientKB?.clients || {};
  const clientData = kuerzel ? kb[kuerzel] : Object.values(kb).find(c =>
    c.name?.toLowerCase().includes(clientName.toLowerCase())
  ) || null;

  // Fetch issues for this client across all projects
  const issuePromises = PROJECTS_LIST.map(p =>
    planeGet(`/workspaces/${WORKSPACE}/projects/${p.id}/issues/?per_page=100`)
      .then(r => toArray(r).map(i => ({ ...i, proj: p.code, projId: p.id })))
      .catch(() => [])
  );
  const allIssues = (await Promise.all(issuePromises)).flat();

  // Filter to this client's issues
  const clientIssues = allIssues.filter(i => {
    const name = (i.name || '').toLowerCase();
    const k = kuerzel?.toLowerCase();
    if (k && name.includes(k)) return true;
    if (clientName && name.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])) return true;
    return false;
  });

  const today = new Date().toISOString().slice(0, 10);
  const openIssues = clientIssues.filter(i => {
    const group = i.state_detail?.group || '';
    return group !== 'completed' && group !== 'cancelled';
  });
  const overdueIssues = openIssues.filter(i => i.target_date && i.target_date < today);

  // Build context
  const context = {
    client: {
      name: clientData?.name || clientName,
      kuerzel: kuerzel || clientData?.code || null,
      status: clientData?.status || 'unknown',
      stage: clientData?.stage || null,
      contract_status: clientData?.contract_status || null,
      monthly_revenue: clientData?.monthly_revenue || 0,
      total_value: clientData?.total_value || 0,
      billing_type: clientData?.billing_type || null,
      revenue_status: clientData?.revenue_status || null,
      budget_tier: clientData?.budget_tier || null,
      contact_name: clientData?.contact_name || null,
      contact_email: clientData?.contact_email || null,
      domain: clientData?.domain || null,
      next_deadline: clientData?.next_deadline || null,
    },
    tickets: {
      open: openIssues.length,
      overdue: overdueIssues.length,
      total: clientIssues.length,
      items: openIssues.slice(0, 15).map(i => ({
        id: `${i.proj}-${i.sequence_id}`,
        name: i.name,
        state: i.state_detail?.name || 'Unknown',
        priority: { 0: 'none', 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' }[i.priority] || 'none',
        assignee: teamIds[i.assignees?.[0]] || 'Unassigned',
        due: i.target_date || null,
        project: i.proj,
      })),
    },
    health: {
      score: clientData ? _healthScore(clientData, openIssues, overdueIssues) : 50,
      risks: [],
    },
  };

  // Add risks
  if (overdueIssues.length > 0) context.health.risks.push(`${overdueIssues.length} overdue tickets`);
  if (clientData?.revenue_status === 'churn-risk') context.health.risks.push('Revenue at churn risk');
  if (clientData?.contract_status === 'expiring') context.health.risks.push('Contract expiring soon');

  // Full depth: add pipeline + meeting history
  if (depth === 'full') {
    // Pipeline deals
    const pipeIds = Array.isArray(pipelineIndex) ? pipelineIndex : [];
    const pipeRecords = await Promise.all(pipeIds.slice(0, 30).map(id => blobGet(`pipeline--${id}`)));
    const clientDeals = pipeRecords.filter(p => p && p.client_name?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0]));
    context.pipeline = clientDeals.map(d => ({
      stage: d.stage, value: d.offer_value, services: d.services_interested, notes: d.notes?.slice(0, 200),
    }));

    // Recent meetings
    const mtgIds = Array.isArray(meetingsIndex) ? meetingsIndex : [];
    const mtgRecords = await Promise.all(mtgIds.slice(0, 20).map(id => blobGet(`meetings--${id}`)));
    const clientMeetings = mtgRecords.filter(m => m && m.client_name?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0]));
    context.meetings = clientMeetings.slice(0, 5).map(m => ({
      date: m.date, summary: m.ai_summary?.slice(0, 300), tickets_created: m.tickets_created?.length || 0,
    }));
  }

  return context;
}

function _healthScore(data, open, overdue) {
  let score = 70; // baseline
  if (overdue.length > 3) score -= 20;
  else if (overdue.length > 0) score -= 10;
  if (data.revenue_status === 'active') score += 15;
  if (data.revenue_status === 'churn-risk') score -= 20;
  if (data.contract_status === 'active') score += 10;
  if (open.length > 10) score -= 5;
  return Math.max(0, Math.min(100, score));
}

// ── Handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body;
  try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }

  const { type, id, depth = 'light', clientName } = body;

  if (type === 'client' || type === 'meeting') {
    const name = clientName || id;
    if (!name) return err('Missing clientName or id');
    const context = await buildClientContext(name, depth);
    return ok(context);
  }

  return err('Unknown context type. Supported: client, meeting');
};
