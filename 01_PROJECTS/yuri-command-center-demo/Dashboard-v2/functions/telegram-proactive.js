/**
 * telegram-proactive.js — Afternoon COO Check-in (16:00 Zurich, Mon-Fri)
 *
 * Proactively messages the CEO with:
 * - What changed since morning
 * - Stale client alerts with one-tap follow-up
 * - Capacity warnings with reschedule buttons
 * - Contract renewal reminders
 * - Meeting follow-up checks
 * - Proactive questions about upcoming work
 */

const https = require('https');
const { getDashboardData, getBlobDirect } = require('./shared-data');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');
const { storageGet } = require('./shared-storage');

const EXEO_FALLBACK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

function tg(method, body) {
  return new Promise((resolve) => {
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
    req.on('error', () => resolve({}));
    req.write(payload); req.end();
  });
}

function send(chatId, text, opts = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...opts });
}

exports.handler = async () => {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) return { statusCode: 200, body: 'Not configured' };

  const todayKey = new Date().toISOString().slice(0, 10);
  if (await alreadySentToday('proactive', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }

  // Mark FIRST to prevent race condition on simultaneous Netlify invocations
  // (observed: two parallel invocations both pass the check before either marks)
  await markSentToday('proactive', todayKey);

  // ── EXEO fallback check — skip if Claude Code messaged recently ──
  try {
    const exeoState = await storageGet('telegram-state', 'exeo-last-active');
    if (exeoState?.timestamp && (Date.now() - exeoState.timestamp) < EXEO_FALLBACK_WINDOW_MS) {
      const agoMin = Math.round((Date.now() - exeoState.timestamp) / 60000);
      console.log(`[Proactive] EXEO active ${agoMin}m ago — skipping scheduled message`);
      return { statusCode: 200, body: `EXEO active (${agoMin}m ago), skipping proactive check-in` };
    }
  } catch (e) { console.log('[Proactive] EXEO check failed, proceeding:', e.message); }

  try {
    const d = await getDashboardData();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    let msg = `☕ <b>Afternoon Check-in — ${today.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}</b>\n\n`;

    // ── What changed since morning ──
    const changedToday = d.recentlyChanged.filter(i => i.updated_at?.slice(0, 10) === todayStr);
    if (changedToday.length) {
      msg += `🔄 <b>${changedToday.length} tickets updated today</b>\n`;
      changedToday.slice(0, 5).forEach(t => {
        msg += `  📝 <code>${t.ticket}</code> ${t.name.slice(0, 30)} → ${t.state}\n`;
      });
      msg += '\n';
    }

    // ── Still overdue ──
    if (d.overdue.length) {
      msg += `🔴 <b>${d.overdue.length} still overdue</b>`;
      const oldest = d.overdueList[0];
      if (oldest) {
        const days = Math.ceil((today - new Date(oldest.target_date)) / 86400000);
        msg += ` (oldest: <code>${oldest.ticket}</code> ${days}d)`;
      }
      msg += '\n\n';
    }

    // ── Stale clients (inactive >14d) ──
    const staleClients = d.clientSummaries.filter(c => c.status === 'active' && c.active === 0);
    if (staleClients.length) {
      msg += `👤 <b>Stale clients to check on:</b>\n`;
      staleClients.slice(0, 4).forEach(c => {
        msg += `  ⚠️ ${c.code} — ${c.name.slice(0, 25)}${c.revenue ? ' (CHF ' + c.revenue + '/mo)' : ''}\n`;
      });
      msg += '\n';
    }

    // ── Contract renewals within 30 days ──
    const expiring = d.clientSummaries.filter(c => c.contract_end && c.contract_end >= todayStr && c.contract_end <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    if (expiring.length) {
      msg += `📄 <b>Contracts expiring soon:</b>\n`;
      expiring.forEach(c => { msg += `  ⚠️ ${c.code} — expires ${c.contract_end}\n`; });
      msg += '\n';
    }

    // ── Capacity check ──
    const teamEntries = Object.entries(d.teamLoad);
    const overloaded = teamEntries.filter(([, l]) => l.active > 20);
    if (overloaded.length) {
      msg += `⚡ <b>Capacity alert:</b>\n`;
      overloaded.forEach(([m, l]) => { msg += `  🔴 ${m}: ${l.active} active (${l.overdue} overdue)\n`; });
      msg += '\n';
    }

    // ── Meetings without follow-up ──
    const noFollowUp = d.recentMeetings.filter(m => !m.hasTickets && m.date < todayStr);
    if (noFollowUp.length) {
      msg += `📝 <b>${noFollowUp.length} meeting${noFollowUp.length > 1 ? 's' : ''} without follow-up:</b>\n`;
      noFollowUp.forEach(m => { msg += `  ⚠️ ${m.client} (${m.date})\n`; });
      msg += '\n';
    }

    // ── Vault Brain Audit — find gaps in client data ──
    try {
      const kb = await getBlobDirect('client-kb--data');
      if (kb?.clients) {
        const gaps = [];
        const requiredFields = ['contact_email', 'website', 'domain', 'stage', 'contract_status'];
        const revenueFields = ['monthly_revenue', 'billing_type', 'revenue_status'];

        Object.entries(kb.clients).forEach(([code, c]) => {
          if (c.status !== 'active') return;
          const missing = requiredFields.filter(f => !c[f] || c[f] === '' || c[f] === 'null');
          const revMissing = revenueFields.filter(f => !c[f] || c[f] === 0 || c[f] === '' || c[f] === 'null');

          if (missing.length > 0) {
            gaps.push({ code, name: c.name, type: 'info', fields: missing });
          } else if (revMissing.length > 0) {
            gaps.push({ code, name: c.name, type: 'revenue', fields: revMissing });
          }
        });

        // Ask about ONE gap per check-in (rotate through, don't spam)
        if (gaps.length) {
          // Pick a different gap each day based on date
          const dayIdx = new Date().getDate() % gaps.length;
          const gap = gaps[dayIdx];
          const fieldLabels = { contact_email: 'contact email', website: 'website URL', domain: 'industry/domain', stage: 'sales stage', contract_status: 'contract status', monthly_revenue: 'monthly revenue', billing_type: 'billing type', revenue_status: 'revenue status' };
          const askFields = gap.fields.slice(0, 2).map(f => fieldLabels[f] || f).join(' and ');

          msg += `🧠 <b>Brain gap:</b> <b>${gap.code}</b> (${(gap.name || '').slice(0, 20)}) is missing <b>${askFields}</b>.\n`;
          msg += `<i>Reply with the info and I'll update it automatically.</i>\n\n`;
        }

        // Check for clients with no contact at all
        const noContact = Object.entries(kb.clients).filter(([, c]) => c.status === 'active' && !c.contact_name && !c.contact_email);
        if (noContact.length && !gaps.length) {
          const nc = noContact[0];
          msg += `🧠 <b>Brain gap:</b> <b>${nc[0]}</b> has no contact person at all. Who's the main contact?\n\n`;
        }
      }
    } catch {}

    // ── Proactive next-step proposals ──
    try {
      const todayDate = new Date();
      const twoWeeksOut = new Date(todayDate); twoWeeksOut.setDate(todayDate.getDate() + 14);
      const twoWeeksStr = twoWeeksOut.toISOString().slice(0, 10);

      // Tickets due in 14 days still in Backlog/Todo
      const atRisk = (d.issues || []).filter(i =>
        i.target_date && i.target_date <= twoWeeksStr && i.target_date >= todayStr &&
        (i.state === 'Backlog' || i.state === 'Todo') &&
        !['completed', 'cancelled'].includes(i.group)
      );
      if (atRisk.length > 2) {
        msg += `⚠️ <b>${atRisk.length} tickets due in 2 weeks still in Backlog/Todo</b>\n`;
        msg += `  Top: ${atRisk.slice(0, 3).map(t => `<code>${t.ticket}</code>`).join(', ')}\n`;
        msg += `  <i>Should I start scheduling these?</i>\n\n`;
      }
    } catch {}

    // ── Proactive question ──
    msg += `💬 <i>Anything I should handle before the day wraps up?</i>`;

    // Send with action buttons
    const buttons = [
      [{ text: '🔴 Review Overdue', callback_data: '/review overdue' }, { text: '📊 Full Status', callback_data: '/status' }],
      [{ text: '📅 Due This Week', callback_data: '/week' }, { text: '👥 Team Load', callback_data: '/team' }],
      [{ text: '🌐 Dashboard', url: 'https://ops.c2moviez.com' }]
    ];

    for (const userId of ALLOWED_USERS) {
      await send(userId, msg, { reply_markup: { inline_keyboard: buttons } });
    }

    return { statusCode: 200, body: `Proactive check-in sent to ${ALLOWED_USERS.length} users` };
  } catch (e) {
    console.error('[Proactive] Error:', e.message);
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
