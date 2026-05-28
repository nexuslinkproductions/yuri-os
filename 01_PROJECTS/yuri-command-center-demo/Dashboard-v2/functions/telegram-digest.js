const https = require('https');
const { storageGet } = require('./shared-storage');

// Scheduled function — runs Mon-Fri at 06:00 UTC (see netlify.toml)
// Sends morning digest + change alerts to Telegram

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLANE_KEY = process.env.PLANE_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
const WORKSPACE = process.env.WORKSPACE_SLUG || 'c2moviez';

const { TEAM_FALLBACK, PROJECTS: _PROJ_CFG, syncTeamIds: _sharedSyncTeam } = require('./shared-config');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');
const { getKnownFacts, formatFacts } = require('./shared-facts');
let TEAM_IDS = { ...TEAM_FALLBACK };
async function syncTeamIds() {
  try { TEAM_IDS = await _sharedSyncTeam(); } catch {}
}

function tg(method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function send(chatId, text, opts = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...opts });
}

// Paginated Plane.so GET — fetches all pages
async function planeGetAll(path) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    let data = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      data = await new Promise((resolve) => {
        if (!PLANE_KEY) { resolve({}); return; }
        const opts = {
          hostname: 'api.plane.so', path: `/api/v1${path}${sep}per_page=100&page=${page}`, method: 'GET',
          headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
        };
        let d = '';
        const req = https.request(opts, res => {
          d = '';
          res.on('data', chunk => d += chunk);
          res.on('end', () => {
            if (res.statusCode >= 500 && attempt < 2) { resolve({ _retry: true }); return; }
            try { resolve(JSON.parse(d)); } catch { resolve({}); }
          });
        });
        req.on('error', () => resolve({}));
        req.end();
      });
      if (!data._retry) break;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
    const items = data.results || data.data || (Array.isArray(data) ? data : []);
    all.push(...items);
    if (data.next_page_results) page++;
    else break;
    if (page > 20) break; // safety
  }
  return all;
}

function mapAssignee(uuids) {
  if (!Array.isArray(uuids) || !uuids.length) return 'unassigned';
  return uuids.map(u => TEAM_IDS[u] || '?').join('+');
}

async function getDashboardData() {
  const PIDS = _PROJ_CFG;
  const issues = [];
  const stateCache = {};

  // Load states (parallel)
  await Promise.all(Object.entries(PIDS).map(async ([, id]) => {
    const states = await planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/states/`);
    states.forEach(s => { stateCache[s.id] = { name: s.name, group: s.group }; });
  }));

  // Load ALL issues with pagination (parallel)
  await Promise.all(Object.entries(PIDS).map(async ([key, id]) => {
    const list = await planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/issues/`);
    list.forEach(i => {
      const st = stateCache[i.state] || {};
      const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };
      const pri = typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none');
      issues.push({
        id: i.id, ticket: `${key}-${i.sequence_id}`, proj: key, name: i.name || 'Untitled',
        state: st.name || '?', group: st.group || 'backlog',
        priority: pri, assignee: mapAssignee(i.assignees),
        target_date: i.target_date || null,
        updated_at: i.updated_at || null,
        parent: i.parent || null,
        sub_issues_count: i.sub_issues_count || 0
      });
    });
  }));

  // String-based date comparisons (timezone-safe)
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay() || 7));
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const done = issues.filter(i => ['completed', 'cancelled'].includes(i.group));
  const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
  const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
  const urgent = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
  const dueThisWeek = active.filter(i => i.target_date && i.target_date >= todayStr && i.target_date <= weekEndStr);
  const unassigned = active.filter(i => i.assignee === 'unassigned' && (i.priority === 'urgent' || i.priority === 'high'));
  const noPrio = active.filter(i => !i.priority || i.priority === 'none');
  const noDue = active.filter(i => !i.target_date);

  // Recently changed (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentlyChanged = issues.filter(i => i.updated_at && i.updated_at > yesterday)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  // Per-member workload
  const teamLoad = {};
  Object.values(TEAM_IDS).forEach(k => { teamLoad[k] = { active: 0, overdue: 0, thisWeek: 0 }; });
  active.forEach(i => {
    const members = i.assignee.split('+');
    members.forEach(m => {
      if (teamLoad[m]) {
        teamLoad[m].active++;
        if (i.target_date && i.target_date < todayStr) teamLoad[m].overdue++;
        if (i.target_date && i.target_date >= todayStr && i.target_date <= weekEndStr) teamLoad[m].thisWeek++;
      }
    });
  });

  // Hygiene score
  const clean = active.filter(i => i.priority && i.priority !== 'none' && i.assignee !== 'unassigned' && i.target_date && !(i.target_date < todayStr));
  const hygiene = active.length ? Math.round(clean.length / active.length * 100) : 100;

  return {
    total: issues.length, active: active.length, done: done.length,
    overdue, urgent, dueThisWeek, unassigned, noPrio: noPrio.length, noDue: noDue.length,
    recentlyChanged, teamLoad, hygiene, issues
  };
}

exports.handler = async (event) => {
  // Disabled 2026-04-28 — superseded by EXEO night-digest (06:45 CEST).
  // Three overlapping senders caused duplicate morning briefs with different numbers.
  // Single source of truth: exeo-autonomous.js --agent=night-digest via LaunchAgent.
  return { statusCode: 200, body: 'disabled — see exeo-night-digest LaunchAgent' };

  if (!BOT_TOKEN || !ALLOWED_USERS.length) {
    return { statusCode: 200, body: 'Bot not configured' };
  }

  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (await alreadySentToday('digest', todayKey)) {
      return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
    }

    // Mark FIRST to prevent race condition on simultaneous Netlify invocations
    await markSentToday('digest', todayKey);

    await syncTeamIds();
    const d = await getDashboardData();
    const today = new Date();
    const dayName = today.toLocaleDateString('de-CH', { weekday: 'long' });
    const dateStr = today.toLocaleDateString('de-CH', { year: 'numeric', month: 'long', day: 'numeric' });
    const isMonday = today.getDay() === 1;

    // ── Build digest message ──
    let msg = `☀️ <b>Good Morning — ${dayName}, ${dateStr}</b>\n\n`;

    // KPIs
    msg += `📊 <b>Dashboard</b>\n`;
    msg += `  📌 ${d.active} open · ✅ ${d.done} done · 🔥 ${d.urgent.length} urgent/high\n`;
    msg += `  📅 ${d.dueThisWeek.length} due this week · 🧹 Hygiene: ${d.hygiene}%\n\n`;

    // Overdue alert
    if (d.overdue.length) {
      msg += `🔴 <b>${d.overdue.length} Overdue</b>\n`;
      d.overdue.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')).slice(0, 8).forEach(t => {
        const days = Math.ceil((today - new Date(t.target_date + 'T00:00:00')) / 86400000);
        msg += `  🔴 <code>${t.ticket}</code> ${t.name.slice(0, 35)} · ${t.assignee} <i>(${days}d)</i>\n`;
      });
      if (d.overdue.length > 8) msg += `  <i>+ ${d.overdue.length - 8} more</i>\n`;
      msg += '\n';
    } else {
      msg += '✅ <b>No overdue tickets!</b>\n\n';
    }

    // Unassigned urgents
    if (d.unassigned.length) {
      msg += `🔥 <b>${d.unassigned.length} Urgent/High Unassigned</b>\n`;
      d.unassigned.slice(0, 5).forEach(t => {
        msg += `  🔥 <code>${t.ticket}</code> ${t.name.slice(0, 35)}\n`;
      });
      msg += '\n';
    }

    // Team workload
    msg += `👥 <b>Team</b>\n`;
    Object.entries(d.teamLoad).forEach(([member, load]) => {
      const cap = Math.min(100, Math.round(load.active / 30 * 100));
      const icon = cap >= 80 ? '🔴' : cap >= 50 ? '🟡' : '🟢';
      msg += `  ${icon} <b>${member}</b> — ${load.active} active · ${load.overdue} overdue · ${load.thisWeek} this week\n`;
    });
    msg += '\n';

    // Recently changed (last 24h) — only on weekdays
    if (d.recentlyChanged.length) {
      const statusChanges = d.recentlyChanged.slice(0, 6);
      msg += `🔄 <b>Recently Updated (24h)</b>\n`;
      statusChanges.forEach(t => {
        const time = t.updated_at ? new Date(t.updated_at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '?';
        msg += `  📝 <code>${t.ticket}</code> ${t.name.slice(0, 30)} · ${t.state} <i>(${time})</i>\n`;
      });
      if (d.recentlyChanged.length > 6) msg += `  <i>+ ${d.recentlyChanged.length - 6} more changes</i>\n`;
      msg += '\n';
    }

    // Monday: week summary
    if (isMonday) {
      msg += `📅 <b>This Week's Focus (${d.dueThisWeek.length} due)</b>\n`;
      d.dueThisWeek.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')).slice(0, 5).forEach(t => {
        msg += `  📌 <code>${t.ticket}</code> ${t.name.slice(0, 35)} · ${t.assignee} <i>(${t.target_date?.slice(5, 10)})</i>\n`;
      });
      if (d.dueThisWeek.length > 5) msg += `  <i>+ ${d.dueThisWeek.length - 5} more</i>\n`;
      msg += '\n';
    }

    // Stale clients (from Obsidian vault)
    try {
      const kb = await storageGet('production-hub', 'client-kb--data');
      if (kb?.clients) {
        const stale = Object.entries(kb.clients).filter(([, c]) => {
          if (c.status !== 'active') return false;
          const last = c.last_work_item_activity;
          return !last || (Date.now() - new Date(last).getTime()) > 14 * 86400000;
        });
        if (stale.length) {
          msg += `👤 <b>Stale Clients (>14d)</b>\n`;
          stale.forEach(([code, c]) => { msg += `  ⚠️ ${code} — ${(c.name || '').slice(0, 25)}\n`; });
          msg += '\n';
        }
      }
    } catch {}

    // ── Proactive Alerts (Phase 6) ──
    try {
      // Capacity forecast: tickets due this week vs. team capacity
      const activePerMember = Object.entries(d.teamLoad);
      const overloaded = activePerMember.filter(([, l]) => l.active > 20);
      const imbalanced = activePerMember.length >= 2 && Math.max(...activePerMember.map(([,l]) => l.active)) > 2 * Math.min(...activePerMember.map(([,l]) => l.active));

      if (overloaded.length) {
        msg += `⚡ <b>Capacity Warning</b>\n`;
        overloaded.forEach(([m, l]) => {
          msg += `  🔴 <b>${m}</b> has ${l.active} active tickets (${l.overdue} overdue)\n`;
        });
        msg += '  → Consider delegation or timeline adjustment\n\n';
      }

      if (imbalanced && !overloaded.length) {
        const sorted = activePerMember.sort((a, b) => b[1].active - a[1].active);
        msg += `⚖️ <b>Workload Imbalance</b>\n`;
        msg += `  ${sorted[0][0]}: ${sorted[0][1].active} tickets vs ${sorted[sorted.length-1][0]}: ${sorted[sorted.length-1][1].active}\n`;
        msg += '  → Consider rebalancing assignments\n\n';
      }

      // Revenue risk: check for contracts expiring within 30 days
      const kbData = await storageGet('production-hub', 'client-kb--data');
      if (kbData?.clients) {
        const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);

        const expiring = Object.entries(kbData.clients).filter(([, c]) =>
          c.contract_end && c.contract_end >= todayStr && c.contract_end <= thirtyDays
        );
        if (expiring.length) {
          msg += `📄 <b>Contracts Expiring (30d)</b>\n`;
          expiring.forEach(([code, c]) => {
            msg += `  ⚠️ ${code} — ${(c.name || '').slice(0, 25)} · Ends: ${c.contract_end}\n`;
          });
          msg += '  → Start renewal discussions\n\n';
        }

        // Meeting follow-up: meetings >7 days old with no tickets
        try {
          const mtgIndex = await storageGet('production-hub', 'meetings--_index');
          if (Array.isArray(mtgIndex) && mtgIndex.length) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
            let staleCount = 0;
            for (const id of mtgIndex.slice(-10)) {
              const mtg = await storageGet('production-hub', `meetings--${id}`);
              if (mtg && mtg.date && mtg.date < sevenDaysAgo && (!mtg.tickets_created || mtg.tickets_created.length === 0) && mtg.transcript) {
                staleCount++;
              }
            }
            if (staleCount) {
              msg += `📝 <b>${staleCount} meeting${staleCount > 1 ? 's' : ''} without follow-up (>7d)</b>\n`;
              msg += '  → Review and create tickets or follow-up actions\n\n';
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[Digest] Proactive alerts error:', e.message);
    }

    // ── Vault Brain Audit — ask about ONE missing field per morning ──
    try {
      const kbData = await storageGet('production-hub', 'client-kb--data');
      if (kbData?.clients) {
        const activeClients = Object.entries(kbData.clients).filter(([, c]) => c.status === 'active');
        const gaps = [];
        activeClients.forEach(([code, c]) => {
          if (!c.contact_email) gaps.push({ code, field: 'contact email' });
          else if (!c.domain) gaps.push({ code, field: 'industry/domain' });
          else if (!c.monthly_revenue && c.contract_status === 'active') gaps.push({ code, field: 'monthly revenue' });
          else if (!c.contract_end && c.contract_status === 'active') gaps.push({ code, field: 'contract end date' });
        });
        if (gaps.length) {
          const pick = gaps[new Date().getDate() % gaps.length];
          msg += `\n🧠 <b>Quick question:</b> What's <b>${pick.code}</b>'s ${pick.field}? Reply and I'll update the brain.\n\n`;
        }
      }
    } catch {}

    // ── Commitment reminders ──
    try {
      const todayStr2 = new Date().toISOString().slice(0, 10);
      const commitments = await storageGet('telegram-state', `commitments--${todayStr2}`);
      if (Array.isArray(commitments) && commitments.filter(c => !c.fulfilled).length) {
        msg += `📌 <b>Commitments due today:</b>\n`;
        commitments.filter(c => !c.fulfilled).forEach(c => {
          msg += `  • ${c.commitment}${c.client ? ` (${c.client})` : ''}\n`;
        });
        msg += '\n';
      }
    } catch {}

    msg += `🌐 <a href="https://ops.c2moviez.com">Open Dashboard</a>`;

    // Send data digest with interactive action buttons
    const digestButtons = [];
    if (d.overdue.length > 0) {
      digestButtons.push([
        { text: `🔴 Walk Through ${d.overdue.length} Overdue`, callback_data: '/review overdue' },
        { text: '📅 Reschedule All → Fri', callback_data: '/reschedule friday' }
      ]);
    }
    if (d.unassigned.length > 0) {
      digestButtons.push([{ text: `🔥 Assign ${d.unassigned.length} Unassigned`, callback_data: '/review unassigned' }]);
    }
    digestButtons.push([
      { text: '👥 Team Load', callback_data: '/team' },
      { text: '📅 Due This Week', callback_data: '/week' }
    ]);
    digestButtons.push([{ text: '🌐 Dashboard', url: 'https://ops.c2moviez.com' }]);

    for (const userId of ALLOWED_USERS) {
      await send(userId, msg, { reply_markup: { inline_keyboard: digestButtons } });
    }

    // ── COO Intelligence Brief (Claude-powered) ──
    if (ANTHROPIC_KEY && d.active > 0) {
      try {
        const overdueList = d.overdue.slice(0, 15).map(t => `${t.ticket} "${t.name}" · ${t.assignee} · due ${t.target_date}`).join('\n');
        const urgentList = d.urgent.slice(0, 10).map(t => `${t.ticket} "${t.name}" · ${t.assignee} · ${t.state} · due ${t.target_date || 'none'}`).join('\n');
        const teamLoadStr = Object.entries(d.teamLoad).map(([m, l]) => `${m}: ${l.active} active, ${l.overdue} overdue, ${l.thisWeek} this week`).join('\n');

        // Deep ticket analysis — include ALL tickets for pattern detection
        const allActive = d.issues.filter(i => !['completed', 'cancelled'].includes(i.group));
        const noDueDate = allActive.filter(i => !i.target_date);
        const stuckTickets = allActive.filter(i => {
          if (!i.updated_at) return false;
          const daysSinceUpdate = (Date.now() - new Date(i.updated_at).getTime()) / 86400000;
          return daysSinceUpdate > 7 && i.group !== 'backlog';
        });
        const quickWins = allActive.filter(i => i.state === 'Editing' || i.state === 'In Progress')
          .filter(i => i.sub_issues_count === 0 && !i.target_date?.includes('2027'));

        const clientHealthStr = (d.clientSummaries || []).slice(0, 8).map(c =>
          `${c.code}: ${c.active} active, ${c.overdue} overdue, health ${c.health}${c.revenue ? ', CHF ' + c.revenue + '/mo' : ''}`
        ).join('\n');

        // Phase L: pull authoritative facts for the top 5 clients by active
        // ticket volume so the AI brief uses ledger truth instead of
        // re-deriving from getDashboardData. Failures fall back to "" so we
        // never block the brief on Supabase issues.
        const topClients = (d.clientSummaries || [])
          .filter(c => c.code && c.code !== 'Unknown')
          .slice(0, 5);
        const factsBlocks = await Promise.all(topClients.map(async c => {
          const facts = await getKnownFacts('client', c.code);
          return formatFacts(facts, { label: `KNOWN FACTS — ${c.code} (authoritative)` });
        }));
        const factsContext = factsBlocks.join('\n\n');

        const firstMember = Object.values(TEAM_IDS)[0] || 'CTI';
        const aiPrompt = `You are the autonomous COO of c2moviez (Swiss creative agency). Give ${firstMember} a sharp morning intelligence brief via Telegram.

FULL OPERATIONAL DATA:
- ${d.active} open, ${d.overdue.length} overdue, ${d.urgent.length} urgent/high, ${d.dueThisWeek.length} due this week
- Velocity: ${d.completedThisWeek} closed this week (${d.velocityTrend > 0 ? '+' : ''}${d.velocityTrend}% vs last)
- Hygiene: ${d.hygiene}% · ${noDueDate.length} tickets without due date · ${stuckTickets.length} stuck >7 days

OVERDUE (${d.overdue.length}):\n${overdueList || 'None'}

URGENT/HIGH (${d.urgent.length}):\n${urgentList || 'None'}

STUCK >7 DAYS (${stuckTickets.length}):\n${stuckTickets.slice(0, 6).map(t => `  ${t.ticket} "${t.name.slice(0,30)}" [${t.state}] ${t.assignee}`).join('\n') || 'None'}

NO DUE DATE (${noDueDate.length}):\n${noDueDate.slice(0, 5).map(t => `  ${t.ticket} "${t.name.slice(0,30)}" [${t.priority}] ${t.assignee}`).join('\n') || 'None'}

QUICK WINS (nearly done):\n${quickWins.slice(0, 5).map(t => `  ${t.ticket} "${t.name.slice(0,30)}" [${t.state}] ${t.assignee}`).join('\n') || 'None'}

TEAM:\n${teamLoadStr}

CLIENT HEALTH:\n${clientHealthStr}

${factsContext}

Write a CONCISE Telegram-style brief (max 1000 chars). Format:
🎯 PRIORITY STACK (top 3-5 things for today, one line each with ticket refs)
⚠️ DEEP ANALYSIS (2-3 insights: stuck tickets to unblock, priority mismatches, duplicate suspects, clients needing attention)
💬 QUICK WINS (2-3 tickets that can be closed TODAY)
📋 PROPOSE (1-2 specific actions: "Set due dates for X tickets", "Escalate Y", "Delegate Z to FK")

Rules: Be direct. Use actual ticket IDs. Every line must be actionable. Detect patterns — if 3 tickets for same client are all stuck, flag it. If a high-priority ticket has no due date, propose one. Sound like a sharp COO who sees the full picture.

Hard rule: NEVER state revenue, billing model, contact details, contract status, or any other client property that contradicts the KNOWN FACTS sections. Those come from the fact ledger and override any value you might infer from ticket names or notes. If a fact is missing, say "(not in ledger)" instead of inventing one.`;

        const aiRes = await new Promise((resolve) => {
          const payload = JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 600,
            messages: [{ role: 'user', content: aiPrompt }]
          });
          const opts = {
            hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          };
          let body = '';
          const req = https.request(opts, res => {
            res.on('data', chunk => body += chunk);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
          });
          req.on('error', () => resolve(null));
          req.write(payload); req.end();
        });

        const aiBrief = aiRes?.content?.[0]?.text;
        if (aiBrief) {
          // Send as second message
          let aiMsg = `🧠 <b>COO Intelligence</b>\n\n`;
          // Convert markdown bold and ticket refs to Telegram HTML
          let cleaned = aiBrief.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
          cleaned = cleaned.replace(/\b([A-Z]{2,4}-\d+)\b/g, '<code>$1</code>');
          aiMsg += cleaned;

          if (aiMsg.length > 4000) aiMsg = aiMsg.slice(0, 3950) + '\n<i>…</i>';

          for (const userId of ALLOWED_USERS) {
            await send(userId, aiMsg);
          }
        }
      } catch {} // AI is optional — don't break digest if it fails
    }

    return { statusCode: 200, body: `Digest sent to ${ALLOWED_USERS.length} users` };
  } catch (e) {
    // Send error notification
    for (const userId of ALLOWED_USERS) {
      await send(userId, `⚠️ <b>Digest Error</b>\n\n${e.message}`).catch(() => {});
    }
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
