/**
 * telegram-prebrief.js — Pre-Meeting Intelligence Briefs (09:30 Zurich, Mon-Fri)
 *
 * Checks today's Outlook calendar for meetings, loads client context,
 * generates AI brief with talking points, and sends to Telegram.
 */

const https = require('https');
const { getDashboardData, getBlobDirect } = require('./shared-data');
const { WORKSPACE, syncTeamIds } = require('./shared-config');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');
const { getKnownFacts, formatFacts } = require('./shared-facts');

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

function claudeCall(system, user) {
  return new Promise(resolve => {
    if (!ANTHROPIC_KEY) { resolve(null); return; }
    const payload = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, system, messages: [{ role: 'user', content: user }] });
    const opts = { hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    let data = '';
    const req = https.request(opts, res => { res.on('data', d => data += d); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } }); });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

exports.handler = async () => {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) return { statusCode: 200, body: 'Not configured' };

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Idempotency: if we already sent today, exit. Prevents 3-4 duplicate
    // sends if Netlify fires the scheduled function more than once.
    if (await alreadySentToday('prebrief', today)) {
      return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
    }

    // Mark FIRST to prevent race condition on simultaneous Netlify invocations
    await markSentToday('prebrief', today);

    const d = await getDashboardData();

    // Check for meetings today from blob store
    const mtgIndex = await getBlobDirect('meetings--_index') || [];
    const todayMeetings = [];
    for (const id of (Array.isArray(mtgIndex) ? mtgIndex : []).slice(-20)) {
      const mtg = await getBlobDirect(`meetings--${id}`);
      if (mtg?.date === today) todayMeetings.push(mtg);
    }

    if (!todayMeetings.length) {
      // No meetings — send a light morning intel instead
      const overdue = d.overdueList.slice(0, 3);
      const dueToday = d.dueThisWeek.filter(i => i.target_date === today);

      if (!overdue.length && !dueToday.length) return { statusCode: 200, body: 'No meetings or urgent items' };

      let msg = `🌅 <b>Morning Intel</b>\n\n`;
      if (dueToday.length) {
        msg += `📅 <b>${dueToday.length} due today:</b>\n`;
        dueToday.slice(0, 5).forEach(t => { msg += `  • <code>${t.ticket}</code> ${t.name.slice(0, 35)} [${t.assignee}]\n`; });
        msg += '\n';
      }
      if (overdue.length) {
        msg += `🔴 <b>Top overdue:</b>\n`;
        overdue.forEach(t => { msg += `  • <code>${t.ticket}</code> ${t.name.slice(0, 35)}\n`; });
      }

      for (const userId of ALLOWED_USERS) await send(userId, msg);
      return { statusCode: 200, body: 'Morning intel sent' };
    }

    // Generate pre-meeting brief for each meeting
    for (const mtg of todayMeetings) {
      const clientName = mtg.client_name || 'Unknown';
      const kuerzel = mtg.client_kuerzel || mtg.kuerzel || (clientName.split(' ')[0] || '').toUpperCase();

      // Find client tickets
      const clientTickets = d.issues.filter(i => {
        const name = (i.name || '').toLowerCase();
        const cn = clientName.toLowerCase().split(' ')[0];
        return name.includes(cn) && !['completed', 'cancelled'].includes(i.group);
      });

      const overdueClient = clientTickets.filter(i => i.target_date && i.target_date < today);
      const lastMeeting = mtg.ai_summary ? `Last meeting summary: ${mtg.ai_summary.slice(0, 200)}` : 'No previous meeting summary';

      // Phase L: query the fact ledger so the AI works from authoritative
      // claims, not whatever was in the prompt the last time someone wrote
      // it. Facts marked ceo-confirmed override anything else.
      const facts = await getKnownFacts('client', kuerzel);

      // Build AI brief
      let aiMsg = '';
      if (ANTHROPIC_KEY) {
        const context = `CLIENT: ${clientName} (${kuerzel})

${formatFacts(facts)}

OPEN TICKETS: ${clientTickets.length} (${overdueClient.length} overdue)
${clientTickets.slice(0, 8).map(t => `  ${t.ticket} "${t.name.slice(0,40)}" [${t.state}] ${t.priority} ${t.assignee}`).join('\n')}
${lastMeeting}
MEETING DATE: ${today}
ATTENDEES: ${(mtg.attendees || []).join(', ')}`;

        const result = await claudeCall(
          'You are a COO preparing a CEO for a client meeting. Be sharp, actionable, 150 words max. NEVER state revenue, billing, contact or contract details that contradict the KNOWN FACTS section — those come from the fact ledger and are authoritative.',
          `Pre-meeting brief for ${clientName}:\n\n${context}\n\nGive: 3 key talking points, 1 risk to address, 1 upsell opportunity. Use ticket refs.`
        );
        aiMsg = result?.content?.[0]?.text || '';
      }

      let msg = `📋 <b>Pre-Meeting Brief: ${clientName}</b>\n`;
      msg += `📅 Today · ${(mtg.attendees || []).join(', ') || 'No attendees listed'}\n\n`;

      if (clientTickets.length) {
        msg += `📊 <b>${clientTickets.length} open tickets</b>`;
        if (overdueClient.length) msg += ` (🔴 ${overdueClient.length} overdue)`;
        msg += '\n';
        clientTickets.slice(0, 5).forEach(t => {
          const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[t.priority] || '⚪';
          msg += `  ${emo} <code>${t.ticket}</code> ${t.name.slice(0, 30)} [${t.state}]\n`;
        });
        msg += '\n';
      }

      if (aiMsg) {
        let cleaned = aiMsg.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        cleaned = cleaned.replace(/\b([A-Z]{2,4}-\d+)\b/g, '<code>$1</code>');
        msg += `🧠 <b>AI Brief:</b>\n${cleaned}\n`;
      }

      const buttons = [
        [{ text: '📊 Client Details', callback_data: `/customer ${clientName.split(' ')[0]}` }],
        [{ text: '🌐 Dashboard', url: 'https://ops.c2moviez.com' }]
      ];

      for (const userId of ALLOWED_USERS) {
        await send(userId, msg, { reply_markup: { inline_keyboard: buttons } });
      }
    }

    return { statusCode: 200, body: `Pre-briefs sent for ${todayMeetings.length} meetings` };
  } catch (e) {
    console.error('[PreBrief] Error:', e.message);
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
