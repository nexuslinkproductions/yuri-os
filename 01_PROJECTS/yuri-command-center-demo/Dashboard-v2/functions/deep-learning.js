/**
 * deep-learning.js — EXEO Nightly Intelligence Scan
 *
 * Scheduled: 00:00 UTC (02:00 CEST) daily
 *
 * Scans all Plane.so issues + Obsidian client KB to surface:
 *   - Client data gaps (missing fields)
 *   - Stale clients (14+ days no ticket activity)
 *   - Overdue ticket trends (vs yesterday's snapshot)
 *   - Revenue risk (expiring contracts, unverified revenue)
 *   - Unassigned tickets
 *
 * Generates targeted questions for CEO, sends via Telegram,
 * and stores findings in Supabase daily_metrics.intelligence_findings.
 */

const https = require('https');
const { WORKSPACE, PROJECTS_LIST, syncTeamIds } = require('./shared-config');
const { storageGet } = require('./shared-storage');
const { planeGetAll } = require('./shared-plane');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLANE_KEY = process.env.PLANE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// ── CEST date formatting ──
function cestNow() {
  return new Date(Date.now() + 2 * 3600000); // UTC+2
}
function formatDateCEST(date) {
  const d = date || cestNow();
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

// ── Telegram send ──
function send(chatId, text, opts = {}) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...opts });
    const reqOpts = {
      hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(reqOpts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.write(payload); req.end();
  });
}

// ── Storage: fetch client KB ──
function fetchClientKB() {
  return storageGet('production-hub', 'client-kb--data');
}

// ── Supabase: read yesterday's metrics ──
function supabaseGet(date) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/daily_metrics?date=eq.${date}&select=*`);
    https.get(url.toString(), {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const arr = JSON.parse(d); resolve(Array.isArray(arr) && arr.length ? arr[0] : null); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// ── Supabase: upsert with intelligence_findings ──
function supabaseUpsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname + '?on_conflict=date', method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation',
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

// ── Fetch all issues across all projects (paginated) ──
async function fetchAllIssues() {
  const TEAM_IDS = await syncTeamIds();
  const stateCache = {};
  const allIssues = [];

  // Fetch states + issues in parallel per project
  const projEntries = PROJECTS_LIST;
  const [stateResults, issueResults] = await Promise.all([
    Promise.all(projEntries.map(({ id }) =>
      planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/states/`).catch(() => [])
    )),
    Promise.all(projEntries.map(({ id }) =>
      planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/issues/`).catch(() => [])
    )),
  ]);

  projEntries.forEach(({ code }, pi) => {
    const states = Array.isArray(stateResults[pi]) ? stateResults[pi] : [];
    states.forEach(s => { stateCache[s.id] = { name: s.name, group: s.group }; });
  });

  const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };
  const mapAssignee = (arr) => {
    if (!arr || !arr.length) return 'unassigned';
    return arr.map(uid => TEAM_IDS[uid] || uid.slice(0, 6)).join('+');
  };

  projEntries.forEach(({ code }, pi) => {
    const list = Array.isArray(issueResults[pi]) ? issueResults[pi] : [];
    list.forEach(i => {
      const st = stateCache[i.state] || {};
      allIssues.push({
        id: i.id, ticket: `${code}-${i.sequence_id}`, proj: code, name: i.name || 'Untitled',
        state: st.name || '?', group: st.group || 'backlog',
        priority: typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none'),
        assignee: mapAssignee(i.assignees),
        target_date: i.target_date || null,
        updated_at: i.updated_at || null,
        customer: i.customer_detail?.name || '',
      });
    });
  });

  return { issues: allIssues, TEAM_IDS };
}

// ── Analysis: Client data gaps ──
function analyzeClientGaps(clients) {
  const requiredFields = ['contact_email', 'contact_phone', 'monthly_revenue', 'billing_type', 'domain'];
  const gaps = [];
  for (const [code, client] of Object.entries(clients)) {
    const missing = requiredFields.filter(f => !client[f] || client[f] === 'unknown' || client[f] === '');
    if (missing.length > 0) {
      gaps.push({ code, name: client.name || code, missing, count: missing.length });
    }
  }
  gaps.sort((a, b) => b.count - a.count);
  return gaps;
}

// ── Analysis: Stale clients ──
function analyzeStaleClients(clients, issues) {
  const stale = [];
  const todayMs = Date.now();

  for (const [code, client] of Object.entries(clients)) {
    if (client.stage === 'pre_sales' || client.status === 'inactive' || client.status === 'archived') continue;

    // Check last ticket activity for this client
    const clientIssues = issues.filter(i =>
      i.name.toLowerCase().includes(code.toLowerCase()) || i.customer.toLowerCase().includes(code.toLowerCase())
    );
    const lastActivity = client.last_work_item_activity
      ? new Date(client.last_work_item_activity).getTime()
      : clientIssues.reduce((latest, i) => {
          const t = i.updated_at ? new Date(i.updated_at).getTime() : 0;
          return t > latest ? t : latest;
        }, 0);

    const daysSince = lastActivity ? Math.floor((todayMs - lastActivity) / 86400000) : 999;
    if (daysSince >= 14) {
      stale.push({ code, name: client.name || code, daysSince });
    }
  }
  stale.sort((a, b) => b.daysSince - a.daysSince);
  return stale;
}

// ── Analysis: Revenue risk ──
function analyzeRevenueRisk(clients) {
  const risks = [];
  const todayMs = Date.now();
  const sixtyDaysMs = 60 * 86400000;

  for (const [code, client] of Object.entries(clients)) {
    const reasons = [];

    // Expiring contract
    if (client.contract_end) {
      const endMs = new Date(client.contract_end).getTime();
      const daysUntil = Math.floor((endMs - todayMs) / 86400000);
      if (daysUntil <= 60 && daysUntil > 0) {
        reasons.push(`contract expires in ${daysUntil} days`);
      } else if (daysUntil <= 0) {
        reasons.push('contract expired');
      }
    }

    // Unverified revenue
    if (client.revenue_status !== 'verified' && client.monthly_revenue && parseFloat(client.monthly_revenue) > 0) {
      reasons.push('revenue unverified');
    }

    // No billing type set but has revenue
    if (!client.billing_type && client.monthly_revenue && parseFloat(client.monthly_revenue) > 0) {
      reasons.push('no billing type');
    }

    if (reasons.length > 0) {
      risks.push({
        code, name: client.name || code,
        revenue: parseFloat(client.monthly_revenue) || 0,
        reasons,
      });
    }
  }
  risks.sort((a, b) => b.revenue - a.revenue);
  return risks;
}

// ── Generate targeted questions ──
function generateQuestions(gaps, staleClients, revenueRisks, unassignedTickets, overdueCount) {
  const questions = [];

  // Priority 1: Revenue risk questions
  for (const r of revenueRisks.slice(0, 2)) {
    if (r.reasons.includes('contract expired') || r.reasons.some(x => x.includes('expires in'))) {
      questions.push(`What's the plan for ${r.code} (${r.name})? ${r.reasons.join(', ')}. CHF ${r.revenue.toLocaleString('de-CH')}/mo at risk.`);
    } else if (r.reasons.includes('revenue unverified')) {
      questions.push(`Can you confirm ${r.code}'s monthly revenue? Currently showing CHF ${r.revenue.toLocaleString('de-CH')}/mo (unverified).`);
    }
  }

  // Priority 2: Stale client questions
  for (const s of staleClients.slice(0, 2)) {
    questions.push(`No activity for ${s.code} (${s.name}) in ${s.daysSince} days. Should I create a follow-up task or schedule a check-in?`);
  }

  // Priority 3: Data gap questions
  for (const g of gaps.slice(0, 3)) {
    const fieldStr = g.missing.slice(0, 3).join(', ');
    questions.push(`${g.code} (${g.name}) is missing: ${fieldStr}. Can you provide these?`);
  }

  // Priority 4: Unassigned tickets
  if (unassignedTickets.length > 0) {
    const top = unassignedTickets.slice(0, 3).map(t => t.ticket).join(', ');
    questions.push(`${unassignedTickets.length} unassigned tickets — who should handle ${top}?`);
  }

  // Priority 5: Overdue trend
  if (overdueCount > 5) {
    questions.push(`${overdueCount} overdue tickets. Want me to propose a triage session to reschedule or close stale ones?`);
  }

  return questions.slice(0, 10);
}

// ── Generate insight ──
function generateInsight(gaps, staleClients, revenueRisks, overdueCount, overdueTrend) {
  if (revenueRisks.length > 0 && revenueRisks[0].reasons.some(r => r.includes('expires'))) {
    return `${revenueRisks[0].code} contract expiry is the highest revenue risk — proactive renewal conversation recommended this week.`;
  }
  if (staleClients.length >= 3) {
    return `${staleClients.length} clients are going cold. A batch outreach this week could prevent churn before it becomes visible.`;
  }
  if (overdueTrend === 'up') {
    return `Overdue count is trending up — consider a focused triage session to prevent backlog debt from compounding.`;
  }
  if (gaps.length > 5) {
    return `${gaps.length} clients have incomplete data — filling these gaps would improve forecasting accuracy significantly.`;
  }
  return `Operations are stable. Focus on proactive client engagement to maintain momentum.`;
}

// ── Main handler ──
exports.handler = async () => {
  console.log('[DeepLearning] Starting nightly intelligence scan');

  if (!BOT_TOKEN || !ALLOWED_USERS.length) {
    console.warn('[DeepLearning] Telegram not configured');
    return { statusCode: 200, body: 'Not configured' };
  }
  if (!PLANE_KEY) {
    console.error('[DeepLearning] PLANE_API_KEY not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'PLANE_API_KEY not configured' }) };
  }

  try {
    // Fetch all data in parallel
    const [{ issues, TEAM_IDS }, clientKB] = await Promise.all([
      fetchAllIssues(),
      fetchClientKB(),
    ]);

    const clients = clientKB?.clients || {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Active / overdue / unassigned
    const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
    const unassigned = active.filter(i => i.assignee === 'unassigned');

    // Fetch yesterday's metrics for trend
    const yesterdayMetrics = await supabaseGet(yesterdayDate);
    const yesterdayOverdue = yesterdayMetrics?.overdue_count ?? null;
    let overdueTrend = '-';
    let overdueTrendArrow = '→';
    if (yesterdayOverdue !== null) {
      const diff = overdue.length - yesterdayOverdue;
      if (diff > 0) { overdueTrend = 'up'; overdueTrendArrow = `↑${diff}`; }
      else if (diff < 0) { overdueTrend = 'down'; overdueTrendArrow = `↓${Math.abs(diff)}`; }
      else { overdueTrend = 'flat'; overdueTrendArrow = '→ same'; }
    }

    // Run analyses
    const gaps = analyzeClientGaps(clients);
    const staleClients = analyzeStaleClients(clients, issues);
    const revenueRisks = analyzeRevenueRisk(clients);
    const totalGaps = gaps.reduce((sum, g) => sum + g.count, 0);

    // Generate questions and insight
    const questions = generateQuestions(gaps, staleClients, revenueRisks, unassigned, overdue.length);
    const insight = generateInsight(gaps, staleClients, revenueRisks, overdue.length, overdueTrend);

    // Format Telegram message
    const dateFmt = formatDateCEST();
    let msg = `\u{1F9E0} <b>EXEO Nightly Intelligence \u2014 ${dateFmt}</b>\n\n`;

    msg += `\u{1F4CA} <b>System Health:</b>\n`;
    msg += `\u2022 ${totalGaps} client data gaps found (${gaps.length} clients)\n`;
    msg += `\u2022 ${staleClients.length} stale client${staleClients.length !== 1 ? 's' : ''} (14+ days no activity)`;
    if (staleClients.length > 0) msg += `: ${staleClients.slice(0, 3).map(s => s.code).join(', ')}`;
    msg += `\n`;
    msg += `\u2022 ${overdue.length} overdue tickets (trend: ${overdueTrendArrow} vs yesterday)\n`;
    msg += `\u2022 ${unassigned.length} unassigned tickets\n`;

    if (revenueRisks.length > 0) {
      msg += `\u2022 ${revenueRisks.length} revenue risk${revenueRisks.length !== 1 ? 's' : ''}: ${revenueRisks.slice(0, 3).map(r => `${r.code} (${r.reasons[0]})`).join(', ')}\n`;
    }

    msg += `\n\u2753 <b>Questions for you (top ${Math.min(questions.length, 5)}):</b>\n`;
    questions.slice(0, 5).forEach((q, i) => {
      msg += `${i + 1}. ${q}\n`;
    });

    msg += `\n\u{1F4A1} <b>Insight:</b> ${insight}`;

    // Send to all allowed users
    for (const chatId of ALLOWED_USERS) {
      await send(chatId, msg);
    }

    // Store findings in Supabase
    const findings = {
      scanned_at: new Date().toISOString(),
      total_issues: issues.length,
      active_issues: active.length,
      overdue_count: overdue.length,
      overdue_trend: overdueTrend,
      unassigned_count: unassigned.length,
      client_gaps: gaps.map(g => ({ code: g.code, missing: g.missing })),
      stale_clients: staleClients.map(s => ({ code: s.code, days: s.daysSince })),
      revenue_risks: revenueRisks.map(r => ({ code: r.code, revenue: r.revenue, reasons: r.reasons })),
      questions_generated: questions.length,
    };

    await supabaseUpsert('daily_metrics', {
      date: todayStr,
      overdue_count: overdue.length,
      intelligence_findings: findings,
    });

    console.log(`[DeepLearning] Done — gaps=${totalGaps}, stale=${staleClients.length}, overdue=${overdue.length}, risks=${revenueRisks.length}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, findings }),
    };
  } catch (e) {
    console.error(`[DeepLearning] Error: ${e.message}`);
    // Attempt error notification
    for (const chatId of ALLOWED_USERS) {
      await send(chatId, `\u26A0\uFE0F <b>EXEO Intelligence scan failed:</b> ${e.message}`).catch(() => {});
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
