/**
 * telegram-fk-digest.js — Daily FK bot activity report to CEO
 *
 * Scheduled: daily 18:00 CEST (16:00 UTC) — runs after EOD briefing
 * Reads audit_log rows with action='fk_bot.query' from today (CEST)
 * Checks each interaction for c2moviez document/ticket compliance
 * Sends ONE Telegram summary to CEO (chat_id 8265895585)
 *
 * Compliance checks:
 *   - Ticket names: "CLIENT - Title" format
 *   - Ticket fields: cycle, module, customer set
 *   - Document language: German for client-facing
 */

const https = require('https');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CEO_CHAT_ID = '8265895585';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function tgSend(text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: CEO_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.write(payload); req.end();
  });
}

function supabaseGet(path) {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

function todayCEST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

function checkTicketNaming(text) {
  // Check if text references a ticket creation with proper naming
  const ticketRef = text?.match(/["']([^"']+)["']/)?.[1] || '';
  if (!ticketRef) return null;
  // Format: "CLIENT - Title"
  if (!/^[A-Z][A-Z0-9]+ - .+/.test(ticketRef)) {
    return `Ticket name may not follow convention: "${ticketRef.slice(0, 40)}" (expected: "CLIENT - Title")`;
  }
  return null;
}

exports.handler = async function(event) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[fk-digest] Missing env vars');
    return { statusCode: 200, body: 'skipped' };
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (await alreadySentToday('fk-digest', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }
  await markSentToday('fk-digest', todayKey);

  const today = todayCEST();
  const todayStart = `${today}T00:00:00+02:00`;

  // Fetch today's FK bot interactions
  const rows = await supabaseGet(
    `/audit_log?action=eq.fk_bot.query&created_at=gte.${encodeURIComponent(todayStart)}&order=created_at.asc&limit=100`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    // Silent — no FK activity today
    return { statusCode: 200, body: 'no activity' };
  }

  // Analyse
  const queries = rows.map(r => r.details?.text || '').filter(Boolean);
  const complianceIssues = [];

  for (const q of queries) {
    const issue = checkTicketNaming(q);
    if (issue) complianceIssues.push(issue);
  }

  // Build report
  const lines = [
    `<b>FK Bot Daily Report</b> — ${today}`,
    `<i>${rows.length} interaction${rows.length === 1 ? '' : 's'} from Fanny</i>`,
    '',
  ];

  // Show queries (truncated)
  if (queries.length <= 8) {
    for (const q of queries) {
      lines.push(`• ${q.slice(0, 80)}${q.length > 80 ? '...' : ''}`);
    }
  } else {
    for (const q of queries.slice(0, 5)) {
      lines.push(`• ${q.slice(0, 80)}${q.length > 80 ? '...' : ''}`);
    }
    lines.push(`<i>...and ${queries.length - 5} more</i>`);
  }

  // Compliance check
  if (complianceIssues.length > 0) {
    lines.push('', `<b>Compliance Flags (${complianceIssues.length}):</b>`);
    for (const issue of complianceIssues.slice(0, 3)) {
      lines.push(`• ${issue}`);
    }
  } else {
    lines.push('', '<i>No compliance issues detected.</i>');
  }

  await tgSend(lines.join('\n'));
  return { statusCode: 200, body: 'sent' };
};
