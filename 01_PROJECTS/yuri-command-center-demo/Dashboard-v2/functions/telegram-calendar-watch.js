/**
 * telegram-calendar-watch.js — Outlook Calendar Monitor
 *
 * Runs every 30 min (08:00-18:00 Zurich, Mon-Fri).
 * Detects: meetings just ended → follow-up prompt, upcoming meetings → prep brief,
 * new meetings → notification. Also checks commitments due today.
 */

const https = require('https');
const { getDashboardData, getBlobDirect } = require('./shared-data');
const { WORKSPACE, CLIENT_MATCH_RULES } = require('./shared-config');
const { storageGet, storagePut } = require('./shared-storage');

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

// ── Storage helpers (Supabase Storage, replaces Netlify Blobs) ──
const blobGet = (key) => storageGet('telegram-state', key);
const blobPut = (key, data) => storagePut('telegram-state', key, data);

// ── Graph API auth ──
async function getGraphToken() {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  return new Promise(resolve => {
    const body = `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default`;
    const opts = { hostname: 'login.microsoftonline.com', path: `/${tenantId}/oauth2/v2.0/token`, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } };
    let data = '';
    const req = https.request(opts, res => { res.on('data', d => data += d); res.on('end', () => { try { resolve(JSON.parse(data).access_token); } catch { resolve(null); } }); });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

async function getTodayEvents(token) {
  const email = process.env.M365_EMAIL_CTI || 'claudio@c2moviez.com';
  const today = new Date().toISOString().slice(0, 10);
  const url = `/v1.0/users/${email}/calendarView?startDateTime=${today}T00:00:00&endDateTime=${today}T23:59:59&$top=30&$select=id,subject,start,end,attendees,isAllDay,isCancelled&$orderby=start/dateTime`;

  return new Promise(resolve => {
    const opts = { hostname: 'graph.microsoft.com', path: url, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'outlook.timezone="Europe/Zurich"' } };
    let data = '';
    const req = https.request(opts, res => { res.on('data', d => data += d);
      res.on('end', () => { try { const r = JSON.parse(data); resolve(r.value || []); } catch { resolve([]); } }); });
    req.on('error', () => resolve([]));
    req.end();
  });
}

// ── Client detection from event ──
function detectClient(event) {
  const subject = (event.subject || '').toLowerCase();
  for (const rule of CLIENT_MATCH_RULES) {
    for (const p of rule.patterns) {
      if (subject.includes(p)) return rule.code;
    }
  }
  return null;
}

exports.handler = async () => {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) return { statusCode: 200, body: 'Not configured' };

  const token = await getGraphToken();
  if (!token) return { statusCode: 200, body: 'No M365 credentials' };

  try {
    const now = new Date();
    // Convert to Zurich time — events come back in Europe/Zurich via Prefer header
    const zurichNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
    const nowMin = zurichNow.getHours() * 60 + zurichNow.getMinutes();
    const todayStr = now.toLocaleString('sv-SE', { timeZone: 'Europe/Zurich' }).slice(0, 10);

    const events = await getTodayEvents(token);
    const state = await blobGet(`calwatch--${todayStr}`) || { events: {}, last_run: null };

    let messages = [];

    for (const ev of events) {
      if (ev.isAllDay || ev.isCancelled) continue;
      const evId = ev.id;
      const subject = ev.subject || 'Untitled';
      const startTime = ev.start?.dateTime?.slice(11, 16) || '00:00';
      const endTime = ev.end?.dateTime?.slice(11, 16) || '00:00';
      const startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
      const endMin = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
      const clientCode = detectClient(ev);
      const evState = state.events[evId] || {};

      // Meeting just ended (end_time was in last 35 min)
      if (endMin <= nowMin && endMin > nowMin - 35 && !evState.followed_up) {
        const duration = endMin - startMin;
        let msg = `📋 <b>Meeting ended:</b> ${subject}\n⏱ ${startTime}–${endTime} (${duration}min)\n\nHow did it go? Any action items or commitments?`;
        if (clientCode) msg += `\n\n🏢 Client: <b>${clientCode}</b>`;

        const buttons = [[
          { text: '📝 Quick Notes', callback_data: `calwatch_notes:${clientCode || 'unknown'}` },
          { text: '✅ No Actions', callback_data: 'calwatch_ok' },
          { text: '🎫 Create Ticket', callback_data: `/create ${clientCode || ''} follow-up from meeting` }
        ]];

        messages.push({ text: msg, buttons });
        state.events[evId] = { ...evState, subject, start: startTime, end: endTime, client_code: clientCode, followed_up: true };
      }

      // Meeting upcoming (start_time in next 35 min)
      else if (startMin > nowMin && startMin <= nowMin + 35 && !evState.briefed) {
        let msg = `⏰ <b>Meeting in ${startMin - nowMin} min:</b> ${subject}\n📅 ${startTime}–${endTime}`;

        if (clientCode) {
          try {
            const d = await getDashboardData();
            const clientTickets = d.issues.filter(i => (i.name || '').toLowerCase().includes(clientCode.toLowerCase()) && !['completed', 'cancelled'].includes(i.group));
            const overdue = clientTickets.filter(i => i.target_date && i.target_date < todayStr);
            msg += `\n\n🏢 <b>${clientCode}</b>: ${clientTickets.length} open tickets`;
            if (overdue.length) msg += ` (🔴 ${overdue.length} overdue)`;
            if (clientTickets.length) {
              msg += '\n' + clientTickets.slice(0, 3).map(t => `  • <code>${t.ticket}</code> ${t.name.slice(0, 30)}`).join('\n');
            }
          } catch {}
        }

        messages.push({ text: msg });
        state.events[evId] = { ...evState, subject, start: startTime, end: endTime, client_code: clientCode, briefed: true };
      }

      // Track new events (not yet in state)
      else if (!evState.subject) {
        state.events[evId] = { subject, start: startTime, end: endTime, client_code: clientCode, briefed: false, followed_up: false };
      }
    }

    // Check commitments due today
    const commitments = await blobGet(`commitments--${todayStr}`);
    if (Array.isArray(commitments)) {
      const pending = commitments.filter(c => !c.fulfilled);
      if (pending.length) {
        let msg = `📌 <b>Commitments due today:</b>\n`;
        pending.forEach(c => { msg += `  • ${c.commitment}${c.client ? ` (${c.client})` : ''}\n`; });
        messages.push({ text: msg, buttons: [[{ text: '✅ All Done', callback_data: 'commitments_done' }, { text: '⏰ Reschedule', callback_data: 'commitments_reschedule' }]] });
      }
    }

    // Send all messages
    for (const m of messages) {
      for (const userId of ALLOWED_USERS) {
        await send(userId, m.text, m.buttons ? { reply_markup: { inline_keyboard: m.buttons } } : {});
      }
    }

    state.last_run = now.toISOString();
    await blobPut(`calwatch--${todayStr}`, state);

    return { statusCode: 200, body: `Calendar watch: ${events.length} events, ${messages.length} messages sent` };
  } catch (e) {
    console.error('[CalWatch] Error:', e.message);
    return { statusCode: 200, body: `Error: ${e.message}` };
  }
};
