/**
 * predictive-intel.js — EXEO Weekly Intelligence Report
 *
 * Scheduled: Sunday 18:00 UTC (20:00 CEST)
 *
 * Comprehensive weekly intelligence:
 *   - Client churn risk scoring (0-100)
 *   - Revenue forecast (MRR + pipeline with conversion rates)
 *   - Team capacity analysis (per-assignee load, completion, overdue ratio)
 *   - Week-over-week velocity
 *   - Focus recommendations
 */

const https = require('https');
const { WORKSPACE, PROJECTS_LIST, syncTeamIds } = require('./shared-config');
const { planeGetAll } = require('./shared-plane');
const { storageGet } = require('./shared-storage');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLANE_KEY = process.env.PLANE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// ── CEST formatting ──
function cestNow() {
  return new Date(Date.now() + 2 * 3600000); // UTC+2
}
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
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

// ── Storage: fetch pipeline leads ──
async function fetchPipelineLeads() {
  const p = await storageGet('production-hub', 'pipeline');
  if (!p) return [];
  const leads = p?.leads || p || [];
  return Array.isArray(leads) ? leads : [];
}

// ── Fetch all issues across all projects ──
async function fetchAllIssues() {
  const TEAM_IDS = await syncTeamIds();
  const stateCache = {};
  const allIssues = [];

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
        completed_at: i.completed_at || null,
        updated_at: i.updated_at || null,
        created_at: i.created_at || null,
        customer: i.customer_detail?.name || '',
      });
    });
  });

  return { issues: allIssues, TEAM_IDS };
}

// ── Churn risk score (0-100, higher = more at risk) ──
function calculateChurnRisk(code, client, issues) {
  const todayMs = Date.now();

  // Days since last activity
  const clientIssues = issues.filter(i =>
    i.name.toLowerCase().includes(code.toLowerCase()) || i.customer.toLowerCase().includes(code.toLowerCase())
  );
  const lastActivity = client.last_work_item_activity
    ? new Date(client.last_work_item_activity).getTime()
    : clientIssues.reduce((latest, i) => {
        const t = i.updated_at ? new Date(i.updated_at).getTime() : 0;
        return t > latest ? t : latest;
      }, 0);

  const daysSince = lastActivity ? Math.floor((todayMs - lastActivity) / 86400000) : 90;

  // Base score: days since activity (capped at 90)
  let score = Math.min(daysSince, 90);

  // Contract multiplier: no contract = 1.0, has contract = 0.5
  const hasContract = client.contract_status === 'active' || client.contract_end;
  score *= hasContract ? 0.5 : 1.0;

  // Revenue multiplier: no revenue = 1.0, has revenue = 0.7
  const hasRevenue = client.monthly_revenue && parseFloat(client.monthly_revenue) > 0;
  score *= hasRevenue ? 0.7 : 1.0;

  // Bonus: contract expiring soon
  if (client.contract_end) {
    const daysUntilExpiry = Math.floor((new Date(client.contract_end).getTime() - todayMs) / 86400000);
    if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) score += 15;
    else if (daysUntilExpiry <= 0) score += 25;
  }

  // Cap at 100
  return Math.min(Math.round(score), 100);
}

// ── Revenue forecast ──
function calculateRevenueForecast(clients, pipelineLeads) {
  let confirmedMRR = 0;
  let pipelineForecast = 0;
  const concentrationRisks = [];
  const expiryWarnings = [];
  const todayMs = Date.now();

  // MRR from active clients
  for (const [code, client] of Object.entries(clients)) {
    if (client.billing_type === 'monthly' && (client.revenue_status === 'active' || client.revenue_status === 'verified')) {
      const rev = parseFloat(client.monthly_revenue) || 0;
      confirmedMRR += rev;

      // Concentration check: any single client > 30% of MRR
      if (rev > 0) concentrationRisks.push({ code, revenue: rev });

      // Expiry warning
      if (client.contract_end) {
        const daysUntil = Math.floor((new Date(client.contract_end).getTime() - todayMs) / 86400000);
        if (daysUntil <= 60 && daysUntil > 0) {
          expiryWarnings.push({ code, daysUntil, revenue: rev });
        }
      }
    }
    // Project-based revenue (estimate monthly equivalent)
    if (client.billing_type === 'project' && client.total_value) {
      const totalVal = parseFloat(client.total_value) || 0;
      // Rough monthly equivalent for active projects (assume 3 month span)
      if (client.revenue_status === 'active') {
        confirmedMRR += Math.round(totalVal / 3);
      }
    }
  }

  // Pipeline forecast with conversion rates by stage
  const conversionRates = {
    'pre_sales': 0.3, 'presales': 0.3, 'prospect': 0.3, 'lead': 0.3,
    'offer_sent': 0.6, 'proposal': 0.6, 'negotiation': 0.6,
    'active': 0.8, 'closed_won': 1.0, 'won': 1.0,
  };

  for (const lead of pipelineLeads) {
    const value = parseFloat(lead.value) || 0;
    const stage = (lead.stage || '').toLowerCase().replace(/\s+/g, '_');
    const rate = conversionRates[stage] || 0.2;
    pipelineForecast += value * rate;
  }

  // Concentration risk
  const warnings = [];
  if (confirmedMRR > 0) {
    const sorted = concentrationRisks.sort((a, b) => b.revenue - a.revenue);
    if (sorted.length > 0 && sorted[0].revenue / confirmedMRR > 0.3) {
      warnings.push(`${sorted[0].code} represents ${Math.round(sorted[0].revenue / confirmedMRR * 100)}% of MRR — concentration risk`);
    }
  }
  for (const e of expiryWarnings.slice(0, 2)) {
    warnings.push(`${e.code} contract expires in ${e.daysUntil} days (CHF ${e.revenue.toLocaleString('de-CH')}/mo)`);
  }

  return {
    confirmedMRR: Math.round(confirmedMRR),
    pipelineForecast: Math.round(pipelineForecast),
    thirtyDayProjection: Math.round(confirmedMRR + pipelineForecast * 0.5),
    warnings,
  };
}

// ── Team capacity analysis ──
function analyzeTeamCapacity(issues, TEAM_IDS) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
  const done = issues.filter(i => ['completed', 'cancelled'].includes(i.group));

  const team = {};
  for (const [uid, short] of Object.entries(TEAM_IDS)) {
    team[short] = { active: 0, overdue: 0, completedThisWeek: 0, total: 0 };
  }

  active.forEach(i => {
    const members = i.assignee.split('+');
    members.forEach(m => {
      if (team[m]) {
        team[m].active++;
        team[m].total++;
        if (i.target_date && i.target_date < todayStr) team[m].overdue++;
      }
    });
  });

  done.forEach(i => {
    const d = i.completed_at || i.updated_at;
    if (!d || d < weekAgo) return;
    const members = i.assignee.split('+');
    members.forEach(m => {
      if (team[m]) {
        team[m].completedThisWeek++;
        team[m].total++;
      }
    });
  });

  return team;
}

// ── Velocity: week-over-week ──
function calculateVelocity(issues) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const done = issues.filter(i => ['completed', 'cancelled'].includes(i.group));
  const completedThisWeek = done.filter(i => { const d = i.completed_at || i.updated_at; return d && d > weekAgo; }).length;
  const completedLastWeek = done.filter(i => { const d = i.completed_at || i.updated_at; return d && d > twoWeeksAgo && d <= weekAgo; }).length;

  const createdThisWeek = issues.filter(i => i.created_at && i.created_at > weekAgo).length;
  const createdLastWeek = issues.filter(i => i.created_at && i.created_at > twoWeeksAgo && i.created_at <= weekAgo).length;

  let velocityArrow = '\u2192';
  if (completedLastWeek > 0) {
    const pctChange = Math.round((completedThisWeek - completedLastWeek) / completedLastWeek * 100);
    if (pctChange > 10) velocityArrow = `\u2191${pctChange}%`;
    else if (pctChange < -10) velocityArrow = `\u2193${Math.abs(pctChange)}%`;
    else velocityArrow = `\u2192 stable`;
  }

  return { completedThisWeek, completedLastWeek, createdThisWeek, createdLastWeek, velocityArrow };
}

// ── Focus recommendations ──
function generateRecommendations(churnRisks, revenue, teamCapacity, velocity, overdueCount, unassignedCount) {
  const recs = [];

  // Revenue risk
  if (revenue.warnings.length > 0) {
    recs.push(`Address revenue risk: ${revenue.warnings[0]}`);
  }

  // Top churn risk
  if (churnRisks.length > 0 && churnRisks[0].score >= 50) {
    recs.push(`Re-engage ${churnRisks[0].code} (churn risk ${churnRisks[0].score}/100) \u2014 schedule a touchpoint this week`);
  }

  // Overdue triage
  if (overdueCount > 5) {
    recs.push(`Triage ${overdueCount} overdue tickets \u2014 reschedule or close to improve data hygiene`);
  }

  // Unassigned
  if (unassignedCount > 3) {
    recs.push(`Assign ${unassignedCount} unassigned tickets to balance team workload`);
  }

  // Team balance
  const members = Object.entries(teamCapacity);
  const maxLoad = Math.max(...members.map(([, m]) => m.active));
  const minLoad = Math.min(...members.filter(([, m]) => m.active > 0).map(([, m]) => m.active));
  if (maxLoad > 0 && maxLoad > minLoad * 2.5) {
    const overloaded = members.find(([, m]) => m.active === maxLoad);
    if (overloaded) recs.push(`Rebalance workload \u2014 ${overloaded[0]} has ${maxLoad} active tickets`);
  }

  // Velocity decline
  if (velocity.completedThisWeek < velocity.completedLastWeek * 0.7 && velocity.completedLastWeek > 2) {
    recs.push(`Velocity dropped ${velocity.velocityArrow} \u2014 check for blockers or context-switching overhead`);
  }

  // Pipeline
  if (revenue.pipelineForecast > 0) {
    recs.push(`Pipeline worth CHF ${revenue.pipelineForecast.toLocaleString('de-CH')} weighted \u2014 advance highest-value leads`);
  }

  return recs.slice(0, 5);
}

// ── Supabase: upsert weekly intel ──
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

// ── Format CHF amounts ──
function fmtCHF(amount) {
  return `CHF ${amount.toLocaleString('de-CH')}`;
}

// ── Main handler ──
exports.handler = async () => {
  console.log('[PredictiveIntel] Starting weekly intelligence report');

  if (!BOT_TOKEN || !ALLOWED_USERS.length) {
    console.warn('[PredictiveIntel] Telegram not configured');
    return { statusCode: 200, body: 'Not configured' };
  }
  if (!PLANE_KEY) {
    console.error('[PredictiveIntel] PLANE_API_KEY not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'PLANE_API_KEY not configured' }) };
  }

  try {
    // Fetch all data in parallel
    const [{ issues, TEAM_IDS }, clientKB, pipelineLeads] = await Promise.all([
      fetchAllIssues(),
      fetchClientKB(),
      fetchPipelineLeads(),
    ]);

    const clients = clientKB?.clients || {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = cestNow();
    const weekNum = getWeekNumber(now);

    const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
    const unassigned = active.filter(i => i.assignee === 'unassigned');

    // ── Churn risk scoring ──
    const churnRisks = [];
    for (const [code, client] of Object.entries(clients)) {
      if (client.status === 'inactive' || client.status === 'archived') continue;
      const score = calculateChurnRisk(code, client, issues);
      if (score > 20) {
        // Determine reason
        const clientIssues = active.filter(i =>
          i.name.toLowerCase().includes(code.toLowerCase()) || i.customer.toLowerCase().includes(code.toLowerCase())
        );
        let reason = 'low activity';
        if (!client.contract_status && !client.contract_end) reason = 'no contract';
        else if (client.contract_end) {
          const daysUntil = Math.floor((new Date(client.contract_end).getTime() - Date.now()) / 86400000);
          if (daysUntil <= 0) reason = 'contract expired';
          else if (daysUntil <= 60) reason = `contract expires in ${daysUntil}d`;
        }
        if (clientIssues.length === 0) reason += ', no open tickets';
        churnRisks.push({ code, name: client.name || code, score, reason });
      }
    }
    churnRisks.sort((a, b) => b.score - a.score);

    // ── Revenue forecast ──
    const revenue = calculateRevenueForecast(clients, pipelineLeads);

    // ── Team capacity (sprint window: overdue + due in 30d + urgent/high) ──
    const teamCapacity = analyzeTeamCapacity(issues, TEAM_IDS);

    // ── Velocity ──
    const velocity = calculateVelocity(issues);

    // ── Recommendations ──
    const recommendations = generateRecommendations(churnRisks, revenue, teamCapacity, velocity, overdue.length, unassigned.length);

    // ── Format Telegram message ──
    let msg = `\u{1F4C8} <b>EXEO Weekly Intelligence \u2014 Week ${weekNum}, ${now.getUTCFullYear()}</b>\n\n`;

    // Revenue section
    msg += `\u{1F4B0} <b>Revenue:</b>\n`;
    msg += `\u2022 Confirmed MRR: ${fmtCHF(revenue.confirmedMRR)}\n`;
    msg += `\u2022 Pipeline forecast: ${fmtCHF(revenue.pipelineForecast)}\n`;
    msg += `\u2022 30-day projection: ${fmtCHF(revenue.thirtyDayProjection)}\n`;
    if (revenue.warnings.length > 0) {
      msg += `\u2022 Risk: ${revenue.warnings.slice(0, 2).join('; ')}\n`;
    }

    // Client health section
    msg += `\n\u{1F3E2} <b>Client Health (top risks):</b>\n`;
    if (churnRisks.length > 0) {
      churnRisks.slice(0, 5).forEach(r => {
        msg += `\u2022 ${r.code} (${r.name}) \u2014 risk ${r.score}/100 \u2014 ${r.reason}\n`;
      });
    } else {
      msg += `\u2022 All clients healthy \u2014 no significant churn risks detected\n`;
    }

    // Team section
    msg += `\n\u{1F465} <b>Team:</b>\n`;
    for (const [member, stats] of Object.entries(teamCapacity)) {
      if (stats.active === 0 && stats.completedThisWeek === 0) continue;
      let line = `\u2022 ${member}: ${stats.active} tickets`;
      if (stats.overdue > 0) line += ` (${stats.overdue} overdue)`;
      if (stats.completedThisWeek > 0) line += `, ${stats.completedThisWeek} done this week`;
      msg += line + '\n';
    }
    msg += `\u2022 Velocity: ${velocity.completedThisWeek} completed this week (${velocity.velocityArrow} vs last)\n`;
    msg += `\u2022 Created this week: ${velocity.createdThisWeek} (last: ${velocity.createdLastWeek})\n`;

    // Recommendations section
    msg += `\n\u{1F3AF} <b>Focus Recommendations:</b>\n`;
    recommendations.forEach((rec, i) => {
      msg += `${i + 1}. ${rec}\n`;
    });

    // Send to all allowed users
    for (const chatId of ALLOWED_USERS) {
      await send(chatId, msg);
    }

    // Store in Supabase
    const weeklyFindings = {
      type: 'weekly_intel',
      generated_at: new Date().toISOString(),
      week_number: weekNum,
      revenue,
      churn_risks: churnRisks.slice(0, 10).map(r => ({ code: r.code, score: r.score, reason: r.reason })),
      team_capacity: teamCapacity,
      velocity,
      recommendations,
    };

    await supabaseUpsert('daily_metrics', {
      date: todayStr,
      intelligence_findings: weeklyFindings,
    });

    console.log(`[PredictiveIntel] Done — MRR=${revenue.confirmedMRR}, risks=${churnRisks.length}, velocity=${velocity.completedThisWeek}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, findings: weeklyFindings }),
    };
  } catch (e) {
    console.error(`[PredictiveIntel] Error: ${e.message}`);
    for (const chatId of ALLOWED_USERS) {
      await send(chatId, `\u26A0\uFE0F <b>EXEO Weekly Intelligence failed:</b> ${e.message}`).catch(() => {});
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
