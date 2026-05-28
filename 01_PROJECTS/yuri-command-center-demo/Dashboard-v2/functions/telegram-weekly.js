/**
 * telegram-weekly.js — Sunday Weekly Planning (20:00 Zurich)
 *
 * Week review: velocity, client health changes, revenue.
 * Next week: key deadlines, meetings, capacity forecast.
 * Offers auto-fill plan and review actions.
 */

const https = require('https');
const { getDashboardData, getBlobDirect } = require('./shared-data');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

function send(chatId, text, opts = {}) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...opts });
    const reqOpts = { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    const req = https.request(reqOpts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.write(payload); req.end();
  });
}

exports.handler = async () => {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) return { statusCode: 200, body: 'Not configured' };

  const todayKey = new Date().toISOString().slice(0, 10);
  if (await alreadySentToday('weekly', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }
  await markSentToday('weekly', todayKey);

  try {
    const d = await getDashboardData();
    const today = new Date();

    // Next week range
    const nextMon = new Date(today); nextMon.setDate(today.getDate() + (8 - today.getDay()) % 7 || 7);
    const nextFri = new Date(nextMon); nextFri.setDate(nextMon.getDate() + 4);
    const nextMonStr = nextMon.toISOString().slice(0, 10);
    const nextFriStr = nextFri.toISOString().slice(0, 10);

    const dueNextWeek = d.issues.filter(i =>
      i.target_date && i.target_date >= nextMonStr && i.target_date <= nextFriStr &&
      !['completed', 'cancelled'].includes(i.group)
    );

    const urgentNextWeek = dueNextWeek.filter(i => i.priority === 'urgent' || i.priority === 'high');

    let msg = `📅 <b>Weekly Planning — ${today.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</b>\n\n`;

    // ── This week recap ──
    msg += `📊 <b>This Week Recap</b>\n`;
    msg += `  ✅ Completed: ${d.completedThisWeek}\n`;
    msg += `  📝 Created: ${d.createdThisWeek}\n`;
    msg += `  📈 Velocity: ${d.velocityTrend > 0 ? '↑' : d.velocityTrend < 0 ? '↓' : '→'}${Math.abs(d.velocityTrend)}% vs last week\n`;
    msg += `  🧹 Hygiene: ${d.hygiene}%\n\n`;

    // ── Overdue carried forward ──
    if (d.overdue.length) {
      msg += `🔴 <b>${d.overdue.length} overdue carrying into next week</b>\n`;
      d.overdueList.slice(0, 5).forEach(t => {
        const days = Math.ceil((today - new Date(t.target_date)) / 86400000);
        msg += `  🔴 <code>${t.ticket}</code> ${t.name.slice(0, 28)} (${days}d) [${t.assignee}]\n`;
      });
      msg += '\n';
    }

    // ── Next week forecast ──
    msg += `📅 <b>Next Week: ${dueNextWeek.length} due</b>`;
    if (urgentNextWeek.length) msg += ` (🔥 ${urgentNextWeek.length} urgent/high)`;
    msg += '\n';

    // Group by team member
    const teamNext = {};
    dueNextWeek.forEach(t => {
      const m = t.assignee || 'Unassigned';
      if (!teamNext[m]) teamNext[m] = [];
      teamNext[m].push(t);
    });
    Object.entries(teamNext).forEach(([member, tickets]) => {
      msg += `  👤 <b>${member}</b>: ${tickets.length} tickets\n`;
      tickets.slice(0, 3).forEach(t => {
        const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[t.priority] || '⚪';
        msg += `    ${emo} <code>${t.ticket}</code> ${t.name.slice(0, 25)} (${t.target_date?.slice(5)})\n`;
      });
      if (tickets.length > 3) msg += `    <i>+ ${tickets.length - 3} more</i>\n`;
    });
    msg += '\n';

    // ── Capacity (sprint = overdue + due within 30d + urgent/high) ──
    msg += `⚡ <b>Capacity</b>\n`;
    Object.entries(d.teamLoad).forEach(([member, load]) => {
      if (load.active === 0 && load.sprint === 0) return;
      const cap = Math.min(100, Math.round(load.sprint / 15 * 100));
      const icon = cap >= 80 ? '🔴' : cap >= 50 ? '🟡' : '🟢';
      msg += `  ${icon} ${member}: ${load.sprint} in sprint / ${load.active} total (${cap}% loaded)\n`;
    });
    msg += '\n';

    // ── Client health check ──
    const atRisk = d.clientSummaries.filter(c => c.health < 50);
    if (atRisk.length) {
      msg += `⚠️ <b>Clients needing attention:</b>\n`;
      atRisk.slice(0, 4).forEach(c => { msg += `  🔴 ${c.code} — ${c.name.slice(0, 20)} (health: ${c.health})\n`; });
      msg += '\n';
    }

    // ── Proactive questions ──
    msg += `💬 <i>Any new leads or opportunities to track this week?</i>`;

    const buttons = [
      [{ text: '🔴 Review Overdue', callback_data: '/review overdue' }, { text: '📊 Status', callback_data: '/status' }],
      [{ text: '📅 Due This Week', callback_data: '/week' }, { text: '🌐 Dashboard', url: 'https://ops.c2moviez.com' }]
    ];

    for (const userId of ALLOWED_USERS) {
      await send(userId, msg, { reply_markup: { inline_keyboard: buttons } });
    }

    return { statusCode: 200, body: `Weekly planning sent to ${ALLOWED_USERS.length} users` };
  } catch (e) {
    console.error('[Weekly] Error:', e.message);
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
