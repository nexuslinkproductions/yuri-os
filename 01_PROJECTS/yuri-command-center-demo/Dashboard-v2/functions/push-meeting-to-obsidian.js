/**
 * push-meeting-to-obsidian.js
 * Writes a meeting note to Obsidian vault (via audit_log → vault-watch agent)
 * then sends a Telegram brief to the CEO.
 *
 * POST {
 *   meeting_id, title, client_code, client_name,
 *   transcript, summary, actions, proposals,
 *   audio_url?, duration_seconds?
 * }
 */

const https = require('https');
const { CORS, ok, err, options } = require('./shared');
const { send, sendWithButtons } = require('./shared-telegram');
const { checkAuth } = require('./auth-check');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CEO_CHAT_ID  = process.env.TELEGRAM_CEO_CHAT_ID || '8265895585';

function supabaseInsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
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

function slug(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
}

function formatActions(actions = []) {
  return actions.map(a => `- [ ] ${a}`).join('\n');
}

function formatTranscript(transcript = '') {
  return transcript.slice(0, 6000); // trim very long transcripts
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  // Auth gate: HMAC-signed internal call OR cookie/Bearer JWT.
  // Legacy bare X-Internal-Key still accepted for backward compat.
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON', 400); }

  const {
    meeting_id, title, client_code, client_name,
    transcript, summary, actions = [], proposals = [],
    audio_url, duration_seconds,
  } = body;

  if (!title || !transcript) return err('title and transcript required', 400);

  const dateStamp   = new Date().toISOString().slice(0, 10);
  const timeStamp   = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const clientRef   = client_code ? `${client_code} — ${client_name || client_code}` : 'Internal';
  const durationStr = duration_seconds ? `${Math.floor(duration_seconds / 60)}m ${duration_seconds % 60}s` : '';
  const filename    = `${dateStamp} — ${client_code || 'INT'} — ${slug(title)}.md`;
  const vaultPath   = `03 - Projects/Meetings/${filename}`;

  const noteContent = [
    '---',
    `title: "${title}"`,
    `client_code: ${client_code || ''}`,
    `client_name: ${client_name || ''}`,
    `meeting_date: ${dateStamp}`,
    `duration: "${durationStr}"`,
    `audio_url: "${audio_url || ''}"`,
    `supabase_id: "${meeting_id || ''}"`,
    `created_by: meeting-studio`,
    client_code ? `linked_note: "[[${client_code} - ${client_name || client_code}]]"` : '',
    'tags: [meeting, transcript]',
    '---',
    '',
    `# ${title}`,
    '',
    `**Client:** ${client_code ? `[[${client_code} - ${client_name || client_code}]]` : 'Internal'}`,
    `**Date:** ${dateStamp}${durationStr ? `  ·  Duration: ${durationStr}` : ''}`,
    audio_url ? `**Recording:** [Download](${audio_url})` : '',
    '',
    '## Summary',
    '',
    summary || '_No summary generated_',
    '',
    '## Action Items',
    '',
    actions.length ? formatActions(actions) : '- [ ] ',
    '',
    proposals.length ? [
      '## Ticket Proposals',
      '',
      ...proposals.map(p => `- **${p.priority?.toUpperCase() || 'MEDIUM'}** — ${p.title}${p.due ? ` _(due ${p.due})_` : ''}`),
      '',
    ].join('\n') : '',
    '## Transcript',
    '',
    '```',
    formatTranscript(transcript),
    '```',
    '',
  ].filter(l => l !== undefined).join('\n');

  // Write to vault via audit_log → vault-watch agent
  await supabaseInsert('audit_log', {
    action: 'obsidian.queue.meeting_note',
    entity_type: 'meeting',
    entity_id: meeting_id || filename.replace('.md', ''),
    entity_name: title,
    actor: 'meeting-studio',
    details: {
      target_path: vaultPath,
      content: noteContent,
      client_code,
      client_name,
      title,
      meeting_date: dateStamp,
    },
    metadata: { source: 'push-meeting-to-obsidian', timestamp: Date.now() },
  });

  // Telegram brief
  const tgText = [
    `📋 <b>Meeting note saved to Obsidian</b>`,
    `<b>${title}</b>${durationStr ? ` · ${durationStr}` : ''}`,
    client_code ? `Client: ${clientRef}` : '',
    '',
    summary ? summary.slice(0, 400) : '',
    '',
    actions.length ? `<b>Action items (${actions.length}):</b>\n${actions.slice(0, 4).map(a => `• ${a}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const buttons = proposals.length > 0
    ? [[{ text: `✦ Create ${proposals.length} ticket${proposals.length > 1 ? 's' : ''} in Plane`, callback_data: `meeting_create_tickets:${meeting_id}` }]]
    : [];

  if (buttons.length) {
    await sendWithButtons(CEO_CHAT_ID, tgText, buttons);
  } else {
    await send(CEO_CHAT_ID, tgText);
  }

  return ok({ ok: true, path: vaultPath, filename });
};
