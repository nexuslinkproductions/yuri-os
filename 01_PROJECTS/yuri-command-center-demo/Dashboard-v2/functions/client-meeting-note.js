/**
 * client-meeting-note.js — creates a full meeting note in Obsidian vault
 * linked to a pipeline client, with inline content and EXEO Telegram brief.
 *
 * Accepts:
 *   client_code, client_name, title, date,
 *   attendees?, agenda?, notes?, action_items?, telegram_brief?
 *
 * Writes:
 *   1. audit_log insert (obsidian.queue.meeting_note) — vault-watch picks this up
 *   2. Telegram brief to CEO (if telegram_brief=true and notes/agenda present)
 */

const https = require('https');
const { checkAuth } = require('./auth-check');
const { send } = require('./shared-telegram');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CEO_CHAT_ID  = process.env.TELEGRAM_CEO_CHAT_ID || '8265895585';

const { CORS } = require('./shared');

function supabaseInsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
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

// Strip characters that break YAML frontmatter (newlines, colons at start, ---)
function safeYaml(s, maxLen = 200) {
  return String(s || '').slice(0, maxLen).replace(/[\r\n]/g, ' ').replace(/^[:#-]/, '');
}

function slug(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-');
}

function buildMarkdown({ client_code, client_name, title, dateStamp, attendees, agenda, notes, action_items }) {
  const lines = [
    '---',
    `client_code: ${client_code}`,
    `client_name: ${client_name || client_code}`,
    `meeting_date: ${dateStamp}`,
    `created_by: dashboard-v2-pipeline-drawer`,
    `linked_note: "[[${client_code} - ${client_name || client_code}]]"`,
    'tags: [meeting, client]',
    '---',
    '',
    `# ${title}`,
    '',
    `**Client:** [[${client_code} - ${client_name || client_code}]]`,
    `**Date:** ${dateStamp}`,
  ];

  if (attendees) lines.push(`**Attendees:** ${attendees}`);
  lines.push('', `**Created:** ${new Date().toISOString()}`, '');

  lines.push('## Agenda');
  if (agenda && agenda.trim()) {
    agenda.trim().split('\n').forEach(l => lines.push(l));
  } else {
    lines.push('- ');
  }
  lines.push('');

  lines.push('## Notes', '');
  if (notes && notes.trim()) {
    notes.trim().split('\n').forEach(l => lines.push(l));
  } else {
    lines.push('');
  }
  lines.push('');

  lines.push('## Action items');
  if (action_items && action_items.trim()) {
    action_items.trim().split('\n').forEach(l => {
      lines.push(l.startsWith('[ ]') || l.startsWith('- [') ? l : `- [ ] ${l}`);
    });
  } else {
    lines.push('- [ ] ');
  }
  lines.push('');

  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { client_code, client_name, title, date, attendees, agenda, notes, action_items, telegram_brief } = payload;
  if (!client_code || !title) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'client_code and title required' }) };
  }

  const safeCode  = safeYaml(client_code, 20).replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  const safeName  = safeYaml(client_name, 120);
  const safeTitle = safeYaml(title, 160);
  if (!safeCode) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid client_code' }) };

  const meetingDate = date || new Date().toISOString();
  const dateStamp   = meetingDate.slice(0, 10);
  const filename    = `${dateStamp} — ${client_code} — ${slug(title)}.md`;
  const path        = `03 - Projects/Meetings/${filename}`;

  const content = buildMarkdown({ client_code: safeCode, client_name: safeName, title: safeTitle, dateStamp, attendees, agenda, notes, action_items });

  await supabaseInsert('audit_log', {
    action: 'obsidian.queue.meeting_note',
    entity_type: 'meeting',
    entity_id: filename.replace(/\.md$/, ''),
    entity_name: title,
    actor: 'dashboard-v2-pipeline-drawer',
    details: {
      target_path: path,
      content,
      client_code,
      client_name,
      title,
      meeting_date: dateStamp,
      attendees: attendees || null,
    },
    metadata: { source: 'client-meeting-note', timestamp: Date.now() },
  });

  // Telegram brief — only when the user logged real notes (not a blank placeholder)
  if (telegram_brief && (notes?.trim() || agenda?.trim())) {
    const snippet = (notes || agenda || '').trim().slice(0, 180);
    const actionCount = action_items
      ? action_items.split('\n').filter(l => l.trim()).length
      : 0;
    const tgText = [
      `📋 <b>Meeting logged</b> — ${client_name || client_code}`,
      `<b>Title:</b> ${title}`,
      dateStamp ? `<b>Date:</b> ${dateStamp}` : '',
      attendees ? `<b>Attendees:</b> ${attendees}` : '',
      snippet ? `\n<i>${snippet}${snippet.length >= 180 ? '…' : ''}</i>` : '',
      actionCount ? `\n<b>${actionCount} action item${actionCount > 1 ? 's' : ''}</b> captured.` : '',
      `\nSaved to Obsidian at <code>${path}</code>`,
    ].filter(Boolean).join('\n');

    await send(CEO_CHAT_ID, tgText, { parse_mode: 'HTML' });
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, path, filename }),
  };
};
