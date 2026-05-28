/**
 * telegram-eod.js — End-of-Day Summary (19:00 Zurich, Mon-Fri)
 *
 * Sends: what was accomplished today, what's still open/overdue,
 * tomorrow's preview, and a proactive question.
 */

const https = require('https');
const { getDashboardData } = require('./shared-data');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');
const { storageGet } = require('./shared-storage');

const EXEO_FALLBACK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
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
  if (await alreadySentToday('eod', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }

  // Mark FIRST to prevent race condition on simultaneous Netlify invocations
  await markSentToday('eod', todayKey);

  // ── EXEO fallback check — skip if Claude Code messaged recently ──
  try {
    const exeoState = await storageGet('telegram-state', 'exeo-last-active');
    if (exeoState?.timestamp && (Date.now() - exeoState.timestamp) < EXEO_FALLBACK_WINDOW_MS) {
      const agoMin = Math.round((Date.now() - exeoState.timestamp) / 60000);
      console.log(`[EOD] EXEO active ${agoMin}m ago — skipping scheduled message`);
      return { statusCode: 200, body: `EXEO active (${agoMin}m ago), skipping EOD summary` };
    }
  } catch (e) { console.log('[EOD] EXEO check failed, proceeding:', e.message); }

  try {
    const d = await getDashboardData();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // What changed today
    const changedToday = d.recentlyChanged.filter(i => i.updated_at?.slice(0, 10) === todayStr);
    const completedToday = changedToday.filter(i => ['completed', 'cancelled'].includes(i.group));
    const createdToday = d.issues.filter(i => i.created_at?.slice(0, 10) === todayStr);

    // Tomorrow preview
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const dueTomorrow = d.issues.filter(i => i.target_date === tomorrowStr && !['completed', 'cancelled'].includes(i.group));

    let msg = `🌙 <b>End of Day — ${today.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</b>\n\n`;

    // Accomplishments
    msg += `✅ <b>Today's Progress</b>\n`;
    msg += `  Completed: ${completedToday.length} · Updated: ${changedToday.length} · Created: ${createdToday.length}\n`;
    if (completedToday.length) {
      completedToday.slice(0, 5).forEach(t => { msg += `  ✅ <code>${t.ticket}</code> ${t.name.slice(0, 30)}\n`; });
    }
    msg += '\n';

    // Still open
    if (d.overdue.length) {
      msg += `🔴 <b>${d.overdue.length} still overdue</b>\n`;
      d.overdueList.slice(0, 3).forEach(t => {
        const days = Math.ceil((today - new Date(t.target_date)) / 86400000);
        msg += `  🔴 <code>${t.ticket}</code> ${t.name.slice(0, 28)} (${days}d)\n`;
      });
      msg += '\n';
    }

    // Tomorrow preview
    if (dueTomorrow.length) {
      msg += `📅 <b>Tomorrow: ${dueTomorrow.length} due</b>\n`;
      dueTomorrow.slice(0, 5).forEach(t => {
        const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[t.priority] || '⚪';
        msg += `  ${emo} <code>${t.ticket}</code> ${t.name.slice(0, 30)} [${t.assignee}]\n`;
      });
      msg += '\n';
    }

    // Velocity
    msg += `📊 <b>Velocity:</b> ${d.completedThisWeek} closed this week`;
    if (d.velocityTrend > 0) msg += ` (↑${d.velocityTrend}%)`;
    else if (d.velocityTrend < 0) msg += ` (↓${Math.abs(d.velocityTrend)}%)`;
    msg += ` · Hygiene: ${d.hygiene}%\n\n`;

    msg += `💬 <i>Anything to wrap up, or should I handle something overnight?</i>`;

    const buttons = [
      [{ text: '🔴 Review Overdue', callback_data: '/review overdue' }, { text: '📊 Full Status', callback_data: '/status' }],
      [{ text: '🌐 Dashboard', url: 'https://ops.c2moviez.com' }]
    ];

    for (const userId of ALLOWED_USERS) {
      await send(userId, msg, { reply_markup: { inline_keyboard: buttons } });
    }

    return { statusCode: 200, body: `EOD summary sent to ${ALLOWED_USERS.length} users` };
  } catch (e) {
    console.error('[EOD] Error:', e.message);
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
