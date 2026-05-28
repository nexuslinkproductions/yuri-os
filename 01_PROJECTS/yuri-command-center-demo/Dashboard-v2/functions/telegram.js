const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PLANE_KEY = process.env.PLANE_API_KEY;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
const WORKSPACE = process.env.WORKSPACE_SLUG || 'c2moviez';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── Telegram API helpers ──
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

function sendWithButtons(chatId, text, buttons) {
  return tg('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ── Plane.so API (direct, no proxy needed — server-side) ──
function planeGet(path, _retries = 2) {
  return new Promise((resolve, reject) => {
    if (!PLANE_KEY) { resolve({ error: 'PLANE_API_KEY not set' }); return; }
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'GET',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
    };
    let data = '';
    const req = https.request(opts, res => {
      data = '';
      res.on('data', d => data += d);
      res.on('end', async () => {
        // Retry on transient server errors (500/502/503/504)
        if (res.statusCode >= 500 && _retries > 0) {
          console.warn(`[Telegram planeGet] HTTP ${res.statusCode} for ${path}, retrying (${_retries} left)...`);
          await new Promise(r => setTimeout(r, 800));
          resolve(planeGet(path, _retries - 1));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ error: `HTTP ${res.statusCode} — JSON parse failed`, raw: data.slice(0, 200) });
        }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.end();
  });
}

// ── Plane.so PATCH (update issues) ──
// Meeting ticket proposals — in-memory store for callback handling
let _meetingProposals = {};

function planePOST(path, body) {
  return new Promise((resolve, reject) => {
    if (!PLANE_KEY) { reject(new Error('PLANE_API_KEY not set')); return; }
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'POST',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => {
        try { const p = JSON.parse(data); if (p.error || p.detail) reject(new Error(String(p.error || p.detail))); else resolve(p); }
        catch { reject(new Error('Parse error: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function planePatch(path, body) {
  return new Promise((resolve) => {
    if (!PLANE_KEY) { resolve({ error: 'PLANE_API_KEY not set' }); return; }
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'PATCH',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ error: 'parse failed' }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(payload); req.end();
  });
}

// ── Business Hub data (from Supabase Storage via production-hub) ──
async function getBizData(entity) {
  const { storageGet } = require('./shared-storage');
  const data = await storageGet('production-hub', `${entity}--_index`);
  return Array.isArray(data) ? data : [];
}

// ── Direct blob fetch (single key, not index pattern) ──
async function getBlobDirect(key) {
  const { storageGet } = require('./shared-storage');
  return storageGet('production-hub', key);
}

// ── Simple Claude call (system + user message → text) ──
async function _anthropic(systemPrompt, userMessage) {
  const res = await askClaude(systemPrompt, [{ role: 'user', content: userMessage }]);
  return res?.content?.[0]?.text || 'Could not generate response.';
}

// ── Whisper transcription ──
async function transcribeVoice(fileUrl) {
  // Download file from Telegram
  const fileData = await new Promise((resolve, reject) => {
    https.get(fileUrl, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });

  // Send to OpenAI Whisper
  const boundary = 'B' + Date.now();
  const form = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`)
  ]);

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.openai.com', path: '/v1/audio/transcriptions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': form.length
      }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(form); req.end();
  });
}

// ── Persistent Conversation Memory (blob-backed, survives cold starts) ──
// Hot cache for current invocation, Supabase Storage as persistent backing
const _convCache = {};
const _convTimestamps = {};
const _CONV_TTL = 86400000; // 24 hours (was 4h)
const _CONV_MAX = 40;       // 40 messages (was 20)

const { storageGet: _blobGet, storagePut: _blobPut, storageDelete: _blobDel } = require('./shared-storage');

// Thin shim: shared-storage uses (bucket, key) — same signature as old _blob* fns
// _blobDel returns a promise like the old DELETE; ignore return value at call sites

async function _getConv(userId) {
  // Check hot cache first
  if (_convCache[userId] && _convTimestamps[userId] && Date.now() - _convTimestamps[userId] < _CONV_TTL) {
    return _convCache[userId];
  }
  // Cold start: try loading from blob
  try {
    const stored = await _blobGet('telegram-state', `conv--${userId}`);
    if (stored && stored.messages && stored.ts && Date.now() - stored.ts < _CONV_TTL) {
      _convCache[userId] = stored.messages;
      _convTimestamps[userId] = stored.ts;
      return stored.messages;
    }
  } catch {}
  _convCache[userId] = [];
  _convTimestamps[userId] = Date.now();
  return [];
}

async function _addConv(userId, role, text) {
  const conv = await _getConv(userId);
  conv.push({ role, content: text.slice(0, 1500) });
  if (conv.length > _CONV_MAX) conv.splice(0, conv.length - _CONV_MAX);
  _convTimestamps[userId] = Date.now();
  _convCache[userId] = conv;
  // Async write-through to blob (fire and forget)
  _blobPut('telegram-state', `conv--${userId}`, { messages: conv, ts: Date.now() }).catch(() => {});
}

// ── Persistent Meeting Proposals (blob-backed) ──
async function _saveMeetingProposal(key, data) {
  _meetingProposals[key] = data;
  await _blobPut('telegram-state', `proposal--${key}`, { ...data, ts: Date.now() }).catch(() => {});
}

async function _getMeetingProposal(key) {
  if (_meetingProposals[key]) return _meetingProposals[key];
  // Cold start fallback: try blob
  const stored = await _blobGet('telegram-state', `proposal--${key}`);
  if (stored && stored.ts && Date.now() - stored.ts < 86400000) { // 24h TTL
    _meetingProposals[key] = stored;
    return stored;
  }
  return null;
}

async function _deleteMeetingProposal(key) {
  delete _meetingProposals[key];
  _blobDel('telegram-state', `proposal--${key}`).catch(() => {});
}

// ── Obsidian Write Queue (blob-based — local script polls and writes files) ──
async function _queueObsidianWrite(type, data) {
  const key = `obsidian-queue--${Date.now()}--${type}`;
  await _blobPut('telegram-state', key, { type, data, ts: Date.now() }).catch(() => {});
}

// ── Multi-Step Wizard System (blob-backed, survives cold starts) ──
const _wizardCache = {};

async function _getWizard(userId) {
  if (_wizardCache[userId]) return _wizardCache[userId];
  const stored = await _blobGet('telegram-state', `wizard--${userId}`);
  if (stored && stored.ts && Date.now() - stored.ts < 3600000) { // 1h TTL
    _wizardCache[userId] = stored;
    return stored;
  }
  return null;
}

async function _setWizard(userId, wizard) {
  _wizardCache[userId] = { ...wizard, ts: Date.now() };
  await _blobPut('telegram-state', `wizard--${userId}`, _wizardCache[userId]).catch(() => {});
}

async function _clearWizard(userId) {
  delete _wizardCache[userId];
  await _blobDel('telegram-state', `wizard--${userId}`).catch(() => {});
}

async function _handleWizardStep(chatId, userId, text) {
  const wiz = await _getWizard(userId);
  if (!wiz) return false; // no active wizard

  const low = text.toLowerCase().trim();
  if (low === '/cancel' || low === 'cancel' || low === 'exit') {
    await _clearWizard(userId);
    await send(chatId, '❌ Wizard cancelled.');
    return true;
  }

  // ── TICKET WIZARD ──
  if (wiz.type === 'ticket') {
    if (wiz.step === 'priority') {
      const pri = { '1': 'urgent', '2': 'high', '3': 'medium', '4': 'low', 'urgent': 'urgent', 'high': 'high', 'medium': 'medium', 'low': 'low' }[low] || 'medium';
      wiz.data.priority = pri;
      wiz.step = 'assignee';
      await _setWizard(userId, wiz);
      return sendWithButtons(chatId,
        `🏷 Priority: <b>${pri}</b>\n\n👤 Who should work on this?`,
        [[{ text: 'CTI (Claudio)', callback_data: 'wiz:assignee:CTI' }, { text: 'FK (Fanny)', callback_data: 'wiz:assignee:FK' }]]
      ), true;
    }
    if (wiz.step === 'assignee') {
      const assignee = text.toUpperCase().includes('FK') ? 'FK' : 'CTI';
      wiz.data.assignee = assignee;
      wiz.step = 'due';
      await _setWizard(userId, wiz);
      return sendWithButtons(chatId,
        `👤 Assigned: <b>${assignee}</b>\n\n📅 When is this due?`,
        [
          [{ text: 'This Friday', callback_data: 'wiz:due:friday' }, { text: 'Next Monday', callback_data: 'wiz:due:monday' }],
          [{ text: '+7 days', callback_data: 'wiz:due:+7' }, { text: '+14 days', callback_data: 'wiz:due:+14' }]
        ]
      ), true;
    }
    if (wiz.step === 'due') {
      const now = new Date();
      let dueDate;
      if (low.includes('friday') || low === 'fri') { const dt = new Date(); dt.setDate(dt.getDate() + (5 - dt.getDay() + 7) % 7 || 7); dueDate = dt.toISOString().slice(0, 10); }
      else if (low.includes('monday') || low === 'mon') { const dt = new Date(); dt.setDate(dt.getDate() + (8 - dt.getDay()) % 7 || 7); dueDate = dt.toISOString().slice(0, 10); }
      else if (low.startsWith('+')) { const days = parseInt(low.slice(1)) || 14; const dt = new Date(); dt.setDate(dt.getDate() + days); dueDate = dt.toISOString().slice(0, 10); }
      else if (low.match(/^\d{4}-\d{2}-\d{2}$/)) dueDate = low;
      else { const dt = new Date(); dt.setDate(dt.getDate() + 14); dueDate = dt.toISOString().slice(0, 10); }

      wiz.data.due = dueDate;
      wiz.step = 'confirm';
      await _setWizard(userId, wiz);
      const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[wiz.data.priority] || '🔵';
      return sendWithButtons(chatId,
        `📋 <b>Confirm ticket creation:</b>\n\n📝 ${wiz.data.title}\n${emo} ${wiz.data.priority} · 👤 ${wiz.data.assignee} · 📅 ${dueDate}\n📁 ${wiz.data.project}`,
        [[{ text: '✅ Create', callback_data: 'wiz:confirm:yes' }, { text: '❌ Cancel', callback_data: 'wiz:confirm:no' }]]
      ), true;
    }
    if (wiz.step === 'confirm') {
      if (low === 'yes' || low === 'y') {
        // Execute creation via /create command
        const cmd = `/create ${wiz.data.title} priority:${wiz.data.priority} assign:${wiz.data.assignee} due:+${Math.ceil((new Date(wiz.data.due) - new Date()) / 86400000)}`;
        await _clearWizard(userId);
        return handleCommand(chatId, cmd), true;
      }
      await _clearWizard(userId);
      await send(chatId, '❌ Cancelled.');
      return true;
    }
  }

  // ── LEAD WIZARD ──
  if (wiz.type === 'lead') {
    if (wiz.step === 'services') {
      wiz.data.services = text;
      wiz.step = 'value';
      await _setWizard(userId, wiz);
      return sendWithButtons(chatId,
        `🎯 Services: <b>${text}</b>\n\n💰 Estimated deal value?`,
        [
          [{ text: '< CHF 5K', callback_data: 'wiz:value:small' }, { text: 'CHF 5-20K', callback_data: 'wiz:value:medium' }],
          [{ text: '> CHF 20K', callback_data: 'wiz:value:large' }, { text: 'Unknown', callback_data: 'wiz:value:unknown' }]
        ]
      ), true;
    }
    if (wiz.step === 'value') {
      const valueMap = { small: 3000, medium: 12000, large: 30000, unknown: 0 };
      wiz.data.value = valueMap[low] || parseInt(low) || 0;
      // Create the lead directly via production-hub
      try {
        const leadData = {
          id: 'lead_' + Date.now(),
          client_name: wiz.data.client,
          contact_name: '',
          stage: 'lead',
          offer_value: wiz.data.value,
          services_interested: wiz.data.services ? wiz.data.services.split(',').map(s => s.trim()) : [],
          notes: `Created via Telegram wizard`,
          created_at: new Date().toISOString(),
        };
        await new Promise(resolve => {
          const payload = JSON.stringify({ action: 'pipeline.save', data: leadData });
          const dashUrl = process.env.URL || 'https://ops.c2moviez.com';
          const opts = {
            hostname: new URL(dashUrl).hostname, path: '/.netlify/functions/production-hub', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Cookie': `auth_token=${process.env.INTERNAL_SERVICE_KEY || ''}` }
          };
          const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
          req.on('error', () => resolve());
          req.write(payload); req.end();
        });
        await _clearWizard(userId);
        await send(chatId, `✅ <b>Lead created:</b> ${wiz.data.client}\n💰 Value: CHF ${wiz.data.value || '?'}\n🎯 ${wiz.data.services || 'TBD'}\n\nVisible in Dashboard → Business → Pipeline`);
      } catch (e) {
        await _clearWizard(userId);
        await send(chatId, `⚠️ Lead creation failed: ${e.message}`);
      }
      return true;
    }
  }

  return false; // wizard didn't handle this input
}

// ── Review Session (AI-guided ticket triage with bulk update) ──
const _reviewSessions = {}; // userId → {tickets:[], idx:0, changes:[], filter:'overdue'}
function _startReview(userId, tickets, filter) {
  _reviewSessions[userId] = { tickets, idx: 0, changes: [], filter };
}
function _getReview(userId) { return _reviewSessions[userId] || null; }
function _endReview(userId) { delete _reviewSessions[userId]; }

async function _handleReviewResponse(chatId, userId, text, d) {
  const session = _getReview(userId);
  if (!session) return false;
  const low = text.toLowerCase().trim();

  // Cancel/exit review
  if (low === '/cancel' || low === 'stop' || low === 'exit' || low === 'done') {
    if (session.changes.length) return _showReviewSummary(chatId, userId);
    _endReview(userId);
    await send(chatId, '✅ Review ended. No changes to apply.');
    return true;
  }

  // "Apply" / "confirm" → execute all collected changes
  if (low === 'apply' || low === 'confirm' || low === 'yes' || low === 'go') {
    return _executeReviewChanges(chatId, userId, d);
  }

  // Process response for current ticket — supports multi-action: "+6 / note: test / urgent"
  const ticket = session.tickets[session.idx];
  if (!ticket) { _endReview(userId); return false; }

  // Split by / for multi-action commands
  const parts = text.split('/').map(p => p.trim()).filter(Boolean);
  let matched = false;

  for (const part of parts) {
    const p = part.toLowerCase();

    // Note — prepend to description (uses original text case)
    const noteMatch = part.match(/^note:\s*(.+)/i);
    if (noteMatch) {
      session.changes.push({ ticket: ticket.ticket, action: 'note', text: noteMatch[1].trim(), proj: ticket.proj, id: ticket.id });
      matched = true; continue;
    }
    if (p.includes('skip') || p.includes('next') || p === 'n') { matched = true; continue; }
    if (p.includes('done') || p.includes('complete') || p.includes('erledigt')) {
      session.changes.push({ ticket: ticket.ticket, action: 'done', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.includes('fanny') || p === 'fk') {
      session.changes.push({ ticket: ticket.ticket, action: 'assign', to: 'FK', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.includes('claudio') || p === 'cti' || p === 'me' || p === 'mir') {
      session.changes.push({ ticket: ticket.ticket, action: 'assign', to: 'CTI', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^monday$|^montag$|^mon$/)) {
      session.changes.push({ ticket: ticket.ticket, action: 'due', date: _nextDay(1), proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^friday$|^freitag$|^fri$/)) {
      session.changes.push({ ticket: ticket.ticket, action: 'due', date: _nextDay(5), proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^tomorrow$|^morgen$/)) {
      const tom = new Date(); tom.setDate(tom.getDate() + 1);
      session.changes.push({ ticket: ticket.ticket, action: 'due', date: tom.toISOString().slice(0,10), proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/\+(\d+)/)) {
      const days = parseInt(p.match(/\+(\d+)/)[1]); const dt = new Date(); dt.setDate(dt.getDate() + days);
      session.changes.push({ ticket: ticket.ticket, action: 'due', date: dt.toISOString().slice(0,10), proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^urgent$|^dringend$/)) {
      session.changes.push({ ticket: ticket.ticket, action: 'priority', level: 'urgent', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^high$|^hoch$/)) {
      session.changes.push({ ticket: ticket.ticket, action: 'priority', level: 'high', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
    if (p.match(/^low$|^niedrig$/)) {
      session.changes.push({ ticket: ticket.ticket, action: 'priority', level: 'low', proj: ticket.proj, id: ticket.id }); matched = true; continue;
    }
  }

  if (!matched) {
    await send(chatId, `❓ Didn't catch that. Options:\n• <b>skip</b> — leave as is\n• <b>done</b> — mark completed\n• <b>friday / monday / +3</b> — reschedule\n• <b>fanny / claudio</b> — reassign\n• <b>urgent / high / low</b> — reprioritize\n• <b>note: your text</b> — add note\n\nCombine with <b>/</b> : <code>+6 / note: needs review / urgent</code>`);
    return true;
  }

  // Advance to next ticket
  session.idx++;
  if (session.idx >= session.tickets.length) {
    return _showReviewSummary(chatId, userId);
  }
  await _showReviewTicket(chatId, session);
  return true;
}

async function _showReviewTicket(chatId, session) {
  const t = session.tickets[session.idx];
  const num = session.idx + 1;
  const total = session.tickets.length;
  const daysOv = t.target_date ? Math.floor((Date.now() - new Date(t.target_date).getTime()) / 86400000) : 0;
  const pri = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[t.priority] || '⚪';
  await send(chatId,
    `📋 <b>${num}/${total}</b> — ${session.filter} review\n\n` +
    `${pri} <code>${t.ticket}</code> <b>${t.name.slice(0, 40)}</b>\n` +
    `👤 ${t.assignee} · 📊 ${t.state}` +
    (t.target_date ? ` · 📅 ${t.target_date}` + (daysOv > 0 ? ` (${daysOv}d overdue)` : '') : ' · no due date') +
    `\n\n💡 What should we do? <i>(skip / done / friday / +3 / fanny / urgent)</i>`
  );
}

async function _showReviewSummary(chatId, userId) {
  const session = _getReview(userId);
  if (!session) return true;
  if (!session.changes.length) {
    _endReview(userId);
    await send(chatId, '✅ Review complete — no changes to apply.');
    return true;
  }
  const summary = session.changes.map(c => {
    if (c.action === 'done') return `  ✅ ${c.ticket} → mark completed`;
    if (c.action === 'assign') return `  👤 ${c.ticket} → assign to ${c.to}`;
    if (c.action === 'due') return `  📅 ${c.ticket} → due ${c.date}`;
    if (c.action === 'priority') return `  ${c.level === 'urgent' ? '🔴' : '🟡'} ${c.ticket} → ${c.level}`;
    if (c.action === 'note') return `  📝 ${c.ticket} → note: "${c.text.slice(0,30)}"`;
    return `  ${c.ticket} → ${c.action}`;
  }).join('\n');
  await sendWithButtons(chatId,
    `📋 <b>Review Summary — ${session.changes.length} changes</b>\n\n${summary}\n\n<b>Apply all changes?</b>`,
    [[{ text: '✅ Apply All', callback_data: 'apply' }, { text: '❌ Cancel', callback_data: '/cancel' }]]
  );
  return true;
}

async function _executeReviewChanges(chatId, userId, d) {
  const session = _getReview(userId);
  if (!session || !session.changes.length) { _endReview(userId); return true; }
  _dashCache = null; // invalidate cache before bulk write
  await send(chatId, `⟳ Applying ${session.changes.length} changes…`);
  // uses module-level PROJ_IDS
  let ok = 0, fail = 0;
  for (const c of session.changes) {
    try {
      const pid = PROJ_IDS[c.proj];
      if (!pid) { fail++; continue; }
      const path = `/workspaces/${WORKSPACE}/projects/${pid}/issues/${c.id}/`;
      if (c.action === 'due') {
        await planePatch(path, { target_date: c.date });
      } else if (c.action === 'assign') {
        const aid = Object.entries(TEAM_IDS).find(([, v]) => v === c.to)?.[0];
        if (aid) await planePatch(path, { assignees: [aid] });
      } else if (c.action === 'priority') {
        await planePatch(path, { priority: c.level });
      } else if (c.action === 'done') {
        // Find completed state
        const stRes = await planeGet(`/workspaces/${WORKSPACE}/projects/${pid}/states/`);
        const states = stRes.results || stRes.data || (Array.isArray(stRes) ? stRes : []);
        const doneState = states.find(s => s.group === 'completed');
        if (doneState) await planePatch(path, { state: doneState.id });
      } else if (c.action === 'note') {
        // Prepend note to description
        const issueR = await planeGet(path);
        const issue = issueR.results || issueR.data || issueR;
        const existing = issue?.description_html || issue?.description || '';
        const timestamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const noteHtml = `<p><strong>[${timestamp} · ${telegramMember(userId)}]</strong> ${c.text}</p>`;
        await planePatch(path, { description_html: noteHtml + existing });
      }
      ok++;
    } catch { fail++; }
  }
  // Check if any changes were assigned to FK (Fanny)
  const fkChanges = session.changes.filter(c => c.action === 'assign' && c.to === 'FK');
  const fkTickets = session.changes.filter(c => {
    const t = session.tickets.find(t => t.id === c.id);
    return t && t.assignee.includes('FK');
  });
  const allFkRelated = [...new Set([...fkChanges, ...fkTickets])];

  _endReview(userId);

  let emailStatus = '';
  if (allFkRelated.length > 0) {
    // Build email summary for Fanny
    const lines = allFkRelated.map(c => {
      const t = session.tickets.find(x => x.id === c.id);
      const name = t ? t.name.slice(0, 40) : c.ticket;
      if (c.action === 'assign') return `• <b>${c.ticket}</b> — ${name} → <b>assigned to you</b>`;
      if (c.action === 'due') return `• <b>${c.ticket}</b> — ${name} → due date changed to <b>${c.date}</b>`;
      if (c.action === 'priority') return `• <b>${c.ticket}</b> — ${name} → priority: <b>${c.level}</b>`;
      if (c.action === 'done') return `• <b>${c.ticket}</b> — ${name} → <b>completed</b>`;
      if (c.action === 'note') return `• <b>${c.ticket}</b> — ${name} → note: <i>"${(c.text||'').slice(0,50)}"</i>`;
      return `• <b>${c.ticket}</b> — ${name} → updated`;
    }).join('<br>');
    const subject = `EXEO Update: ${allFkRelated.length} ticket${allFkRelated.length > 1 ? 's' : ''} updated`;
    const bodyHtml = `<p>Hi Fanny,</p><p>The following tickets were updated during a review:</p><p>${lines}</p><p>Check the <a href="https://ops.c2moviez.com">Dashboard</a> or <a href="https://app.plane.so/c2moviez">Plane.so</a> for details.</p><p>— EXEO COO Assistant</p>`;
    // Store pending email for preview — don't send yet
    _pendingEmails[userId] = { to: process.env.M365_EMAIL_FK || 'fanny@c2moviez.com', subject, bodyHtml, preview: lines };
    emailStatus = '\n\n📧 <b>Email ready for Fanny</b> — type <b>send</b> to send or <b>edit</b> to modify';
  }

  let msg = `✅ <b>${ok}/${session.changes.length} changes applied</b>${fail ? `\n⚠️ ${fail} failed` : ''}${emailStatus}`;
  // Show email preview if pending
  if (_pendingEmails[userId]) {
    const pe = _pendingEmails[userId];
    msg += `\n\n📧 <b>Preview:</b>\n${pe.preview}\n\n💡 <b>send</b> = send · <b>preview</b> = full · <b>edit [text]</b> = rewrite · <b>skip</b> = cancel`;
  }
  await send(chatId, msg);
  return true;
}

// ── Pending email storage (preview before send) ──
const _pendingEmails = {}; // userId → {to, subject, bodyHtml, preview}

// ── Direct mail sender via Microsoft Graph API (no HTTP proxy needed) ──
async function _sendInternalMail(to, subject, bodyHtml) {
  try {
    const tenantId = process.env.M365_TENANT_ID;
    const clientId = process.env.M365_CLIENT_ID;
    const clientSecret = process.env.M365_CLIENT_SECRET;
    const senderEmail = process.env.M365_EMAIL_CTI || 'claudio@c2moviez.com';
    if (!tenantId || !clientId || !clientSecret) return '\n\n⚠️ M365 not configured';

    // Get OAuth token
    const tokenBody = new URLSearchParams({ grant_type:'client_credentials', client_id:clientId, client_secret:clientSecret, scope:'https://graph.microsoft.com/.default' }).toString();
    const tokenR = await new Promise(resolve => {
      const opts = { hostname:'login.microsoftonline.com', path:`/${tenantId}/oauth2/v2.0/token`, method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(tokenBody)} };
      let d=''; const req=https.request(opts,res=>{res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve({});}});}); req.on('error',()=>resolve({})); req.write(tokenBody); req.end();
    });
    const token = tokenR.access_token;
    if (!token) return '\n\n⚠️ M365 auth failed';

    // Send mail
    const mailPayload = JSON.stringify({ message:{ subject, body:{contentType:'HTML',content:bodyHtml}, toRecipients:[{emailAddress:{address:to}}] }, saveToSentItems:true });
    const mailR = await new Promise(resolve => {
      const opts = { hostname:'graph.microsoft.com', path:`/v1.0/users/${senderEmail}/sendMail`, method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(mailPayload)} };
      const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode}));}); req.on('error',()=>resolve({status:500})); req.write(mailPayload); req.end();
    });
    return mailR.status === 202 || mailR.status === 200 ? '\n\n📧 Email sent' : `\n\n⚠️ Email failed (${mailR.status})`;
  } catch(e) { return `\n\n⚠️ Email error: ${e.message}`; }
}

function _nextDay(dayOfWeek) {
  const d = new Date(); const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10);
}

// ── Claude AI with conversation context ──
function askClaude(systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 2500,
      system: systemPrompt,
      messages
    });
    const opts = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload)
      }
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

// ── Claude AI with native tool_use (replaces ACTION: regex parsing) ──
const COO_TOOLS = [
  {
    name: 'search_tickets',
    description: 'Search for tickets by name, assignee, client, or any text. Returns matching tickets.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] }
  },
  {
    name: 'create_ticket',
    description: 'Create a new ticket in Plane.so with auto-assignment to module, cycle, and customer.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' }, priority: { type: 'string', enum: ['urgent','high','medium','low'], default: 'medium' },
      project: { type: 'string', enum: ['C2M','MFB','C2I','MACL'], default: 'C2M' },
      assignee: { type: 'string', enum: ['CTI','FK'], default: 'CTI' },
      due_days: { type: 'number', description: 'Days from now until due', default: 14 },
      description: { type: 'string', default: '' }
    }, required: ['title'] }
  },
  {
    name: 'update_ticket',
    description: 'Update a ticket field: state, priority, assignee, due date, or add a note.',
    input_schema: { type: 'object', properties: {
      ticket_ref: { type: 'string', description: 'e.g. C2M-110' },
      field: { type: 'string', enum: ['state','priority','assignee','due_date','note'] },
      value: { type: 'string', description: 'New value for the field' }
    }, required: ['ticket_ref','field','value'] }
  },
  {
    name: 'mark_done',
    description: 'Mark a ticket as completed.',
    input_schema: { type: 'object', properties: { ticket_ref: { type: 'string' } }, required: ['ticket_ref'] }
  },
  {
    name: 'get_client_context',
    description: 'Get full operational context for a client: tickets, revenue, health, pipeline, meetings.',
    input_schema: { type: 'object', properties: { client_name: { type: 'string' } }, required: ['client_name'] }
  },
  {
    name: 'get_dashboard_kpis',
    description: 'Get current operational KPIs: total tickets, overdue, velocity, team workload, hygiene.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'reschedule_overdue',
    description: 'Bulk reschedule all overdue tickets to a new date.',
    input_schema: { type: 'object', properties: { target_date: { type: 'string', description: 'YYYY-MM-DD or "friday" or "+7"' } }, required: ['target_date'] }
  },
  {
    name: 'send_email',
    description: 'Send an email via Outlook/Microsoft Graph.',
    input_schema: { type: 'object', properties: {
      to: { type: 'string', description: 'Recipient email' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Email body in HTML' }
    }, required: ['to','subject','body'] }
  },
  {
    name: 'read_obsidian_note',
    description: 'Read a note from the Obsidian vault. Use for client notes, work items, briefings.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Path like "02 - Clients/MFB - Med For Balance GmbH.md"' } }, required: ['path'] }
  },
  {
    name: 'create_pipeline_lead',
    description: 'Create a new lead in the sales pipeline.',
    input_schema: { type: 'object', properties: {
      client_name: { type: 'string' }, services: { type: 'string' }, value: { type: 'number', default: 0 }
    }, required: ['client_name'] }
  },
  {
    name: 'create_calendar_event',
    description: 'Create an Outlook calendar event. Use when user says "schedule meeting", "book a call", "add to calendar", or mentions a date+time for a meeting.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string', description: 'Meeting title' },
      date: { type: 'string', description: 'YYYY-MM-DD, or "tomorrow", "monday", "next tuesday", "+3"' },
      start_time: { type: 'string', description: 'HH:MM 24h format, e.g. "14:00"' },
      duration_min: { type: 'number', description: 'Duration in minutes', default: 60 },
      attendees: { type: 'string', description: 'Comma-separated emails (optional)' },
      client: { type: 'string', description: 'Client code like SHI, MFB (optional)' }
    }, required: ['title','date','start_time'] }
  },
  {
    name: 'save_commitment',
    description: 'Track a promise for follow-up. Use when user says "I need to", "I will", "remind me", "follow up on", "by Friday".',
    input_schema: { type: 'object', properties: {
      commitment: { type: 'string', description: 'What was promised' },
      deadline: { type: 'string', description: 'YYYY-MM-DD, or "friday", "tomorrow", "next week"' },
      client: { type: 'string', description: 'Client code if relevant (optional)' }
    }, required: ['commitment','deadline'] }
  },
  {
    name: 'update_client_note',
    description: 'Add feedback or notes to a client note in Obsidian. Use when user gives feedback about a client, meeting outcome, or deal progress.',
    input_schema: { type: 'object', properties: {
      client_code: { type: 'string', description: 'Client kuerzel like SHI, MFB, ALP' },
      note: { type: 'string', description: 'Feedback text to append' }
    }, required: ['client_code','note'] }
  },
  {
    name: 'plan_week',
    description: 'View or modify the weekly planner. Use for "show my week", "what is planned", "add ticket to Tuesday", "auto-fill".',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ['show','autofill'], description: 'What to do' }
    }, required: ['action'] }
  }
];

function askClaudeWithTools(systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: COO_TOOLS
    });
    const opts = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload)
      }
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

// ── Paginated Plane.so fetch — gets ALL pages ──
async function planeGetAll(path) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await planeGet(`${path}${sep}per_page=100&page=${page}`);
    const items = data?.results || data?.data || (Array.isArray(data) ? data : []);
    all.push(...items);
    if (data?.next_page_results) page++;
    else break;
    if (page > 20) break; // safety limit
  }
  return all;
}

// ── Team UUID mapping — centralized in shared-config.js ──
const { TEAM_FALLBACK, PROJECTS: _PROJ_MAP, PROJECTS_LIST: _PROJ_LIST, syncTeamIds: _sharedSyncTeam } = require('./shared-config');
let TEAM_IDS = { ...TEAM_FALLBACK };
async function syncTeamIds() {
  try {
    TEAM_IDS = await _sharedSyncTeam();
    console.log('[Telegram] Team synced via shared-config:', Object.values(TEAM_IDS).join(', '));
  } catch (e) { console.error('[Telegram] syncTeamIds failed:', e.message); }
}
// ── Map Telegram user ID → team member code ──
function telegramMember(userId) {
  const map = (process.env.TELEGRAM_USER_MAP || '').split(',').reduce((a, p) => {
    const [tid, m] = (p || '').split(':'); if (tid && m) a[tid.trim()] = m.trim(); return a;
  }, {});
  return map[String(userId)] || Object.values(TEAM_IDS)[0] || 'CTI';
}

// ── Project UUID mapping (from shared config) ──
const PROJ_IDS = _PROJ_MAP;
function mapAssignee(uuids) {
  if (!Array.isArray(uuids) || !uuids.length) return 'unassigned';
  return uuids.map(u => TEAM_IDS[u] || '?').join('+');
}

// ── COO BRAIN: Deep operational context engine ──
async function getDashboardData() {
  try {
    const PIDS = PROJ_IDS; // use module-level constant
    const issues = [];
    const stateCache = {};
    const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };

    // ── Load states + issues + customers with full pagination ──
    const projEntries = Object.entries(PIDS);
    const [stateResults, issueResults, customers] = await Promise.all([
      Promise.all(projEntries.map(([, id]) => planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/states/`).catch(e => { console.error('[Telegram] states fetch error:', e.message); return []; }))),
      Promise.all(projEntries.map(([, id]) => planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/issues/`).catch(e => { console.error('[Telegram] issues fetch error:', e.message); return []; }))),
      planeGetAll(`/workspaces/${WORKSPACE}/customers/`).catch(e => { console.error('[Telegram] customers fetch error:', e.message); return []; })
    ]);

    // Build state cache
    projEntries.forEach(([, ], pi) => {
      const states = Array.isArray(stateResults[pi]) ? stateResults[pi] : [];
      states.forEach(s => { if (s?.id) stateCache[s.id] = { name: s.name, group: s.group }; });
    });

    // Build issues list
    projEntries.forEach(([key, id], pi) => {
      const list = Array.isArray(issueResults[pi]) ? issueResults[pi] : [];
      list.forEach(i => {
        const st = stateCache[i.state] || {};
        issues.push({
          id: i.id, ticket: `${key}-${i.sequence_id}`, proj: key, pid: id, name: i.name || 'Untitled',
          state: st.name || '?', group: st.group || 'backlog',
          priority: typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none'),
          assignee: mapAssignee(i.assignees),
          start_date: i.start_date || null, target_date: i.target_date || null,
          updated_at: i.updated_at || null, created_at: i.created_at || null,
          description: (i.description_stripped || '').slice(0, 150)
        });
      });
    });

    console.log(`[Telegram] Loaded ${issues.length} issues, ${Object.keys(stateCache).length} states, ${customers.length} customers`);

    // ── Derived analytics ──
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,10);
    const done = issues.filter(i => ['completed', 'cancelled'].includes(i.group));
    const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
    const urgent = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + (7 - today.getDay() || 7));
    const weekEndStr = weekEnd.toISOString().slice(0,10);
    const dueThisWeek = active.filter(i => i.target_date && i.target_date >= todayStr && i.target_date <= weekEndStr);
    const unassigned = active.filter(i => i.assignee === 'unassigned');
    const noPrio = active.filter(i => !i.priority || i.priority === 'none');
    const noDue = active.filter(i => !i.target_date);
    const stale = active.filter(i => i.updated_at && (Date.now() - new Date(i.updated_at).getTime()) > 14 * 86400000);

    // ── Per-team member deep analysis ──
    const teamLoad = {};
    // Build team names dynamically from synced TEAM_IDS (UUID→short)
    const _teamShorts = [...new Set(Object.values(TEAM_IDS))];
    _teamShorts.forEach(k => { teamLoad[k] = { name: k, active: 0, overdue: 0, thisWeek: 0, urgent: 0, topFocus: [] }; });
    active.forEach(i => {
      i.assignee.split('+').forEach(m => {
        if (!teamLoad[m]) return;
        teamLoad[m].active++;
        if (overdue.includes(i)) teamLoad[m].overdue++;
        if (dueThisWeek.includes(i)) teamLoad[m].thisWeek++;
        if (i.priority === 'urgent' || i.priority === 'high') teamLoad[m].urgent++;
      });
    });
    // Top 3 focus items per member (overdue first, then urgent due soon)
    Object.keys(teamLoad).forEach(m => {
      const mine = active.filter(i => i.assignee.includes(m));
      teamLoad[m].topFocus = mine
        .sort((a, b) => {
          const aOv = overdue.includes(a) ? 0 : 1;
          const bOv = overdue.includes(b) ? 0 : 1;
          if (aOv !== bOv) return aOv - bOv;
          return (a.target_date || 'z').localeCompare(b.target_date || 'z');
        })
        .slice(0, 3)
        .map(i => `${i.ticket} "${i.name.slice(0,30)}" [${i.priority}${overdue.includes(i) ? ' OVERDUE' : ''}${i.target_date ? ' due:' + i.target_date : ''}]`);
    });

    // ── Per-client intelligence ──
    const clientSummaries = [];
    // Load customer-issue mappings with full pagination
    const custIssueResults = await Promise.all(
      customers.slice(0, 20).map(c => planeGetAll(`/workspaces/${WORKSPACE}/customers/${c.id}/issues/`).catch(() => []))
    );
    customers.slice(0, 20).forEach((c, idx) => {
      const custIssueIds = new Set();
      const ciList = Array.isArray(custIssueResults[idx]) ? custIssueResults[idx] : [];
      ciList.forEach(ci => { if (ci?.id) custIssueIds.add(ci.id); });
      const clientTickets = issues.filter(i => custIssueIds.has(i.id));
      const cActive = clientTickets.filter(i => !['completed', 'cancelled'].includes(i.group));
      const cOverdue = cActive.filter(i => i.target_date && i.target_date < todayStr);
      const cDone = clientTickets.filter(i => ['completed', 'cancelled'].includes(i.group));
      const lastUpdate = cActive.reduce((max, i) => (i.updated_at || '') > max ? (i.updated_at || '') : max, '');
      const daysSinceUpdate = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 86400000) : 999;
      const health = cOverdue.length >= 2 ? 'RED' : cOverdue.length === 1 ? 'YELLOW' : cActive.length === 0 ? 'INACTIVE' : 'GREEN';
      if (cActive.length > 0 || cDone.length > 0) {
        clientSummaries.push({
          name: c.name, active: cActive.length, overdue: cOverdue.length, done: cDone.length,
          health, daysSinceUpdate, lastUpdate: lastUpdate ? lastUpdate.slice(0, 10) : 'never'
        });
      }
    });
    clientSummaries.sort((a, b) => b.overdue - a.overdue || b.active - a.active);

    // ── Risk detection ──
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const in3days = new Date(today); in3days.setDate(today.getDate() + 3);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const in3daysStr = in3days.toISOString().slice(0, 10);
    const riskTickets = active.filter(i =>
      (i.target_date && i.target_date <= in3daysStr && i.target_date >= todayStr && i.group !== 'started') ||
      (i.updated_at && (Date.now() - new Date(i.updated_at).getTime()) > 7 * 86400000 && (i.priority === 'urgent' || i.priority === 'high')) ||
      (i.assignee === 'unassigned' && (i.priority === 'urgent' || i.priority === 'high'))
    ).slice(0, 8);

    // ── Velocity (7-day windows) ──
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    const completedThisWeek = done.filter(i => i.updated_at && new Date(i.updated_at) >= weekAgo).length;
    const completedLastWeek = done.filter(i => i.updated_at && new Date(i.updated_at) >= twoWeeksAgo && new Date(i.updated_at) < weekAgo).length;
    const createdThisWeek = issues.filter(i => i.created_at && new Date(i.created_at) >= weekAgo).length;
    const velocityTrend = completedLastWeek > 0 ? Math.round((completedThisWeek / completedLastWeek - 1) * 100) : 0;

    // ── Meetings (from Blobs) ──
    let meetings = [];
    try { meetings = await getBizData('meetings'); } catch {}
    const recentMeetings = meetings.filter(m => m.date && (Date.now() - new Date(m.date).getTime()) < 14 * 86400000)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5)
      .map(m => ({ client: m.client_name, date: m.date, hasTickets: (m.tickets_created || []).length > 0, researched: m.research_status === 'complete' }));

    // ── Client Status Board (from Blobs) ──
    let clientBoard = {};
    try {
      const boardData = await getBizData('client-board');
      if (boardData && typeof boardData === 'object' && !Array.isArray(boardData)) clientBoard = boardData;
    } catch {}

    return {
      total: issues.length, active: active.length, done: done.length,
      overdue: overdue.length, urgent: urgent.length,
      unassigned: unassigned.length, noPrio: noPrio.length, noDue: noDue.length, stale: stale.length,
      dueThisWeek, teamLoad, clientSummaries, riskTickets,
      completedThisWeek, completedLastWeek, createdThisWeek, velocityTrend,
      recentMeetings, clientBoard,
      overdueList: overdue.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')).slice(0, 10),
      issues
    };
  } catch (e) {
    console.error('[Telegram] getDashboardData FAILED:', e.message, e.stack?.split('\n').slice(0, 3).join(' '));
    return { total: 0, active: 0, done: 0, overdue: 0, urgent: 0, unassigned: 0, noPrio: 0, noDue: 0, stale: 0, dueThisWeek: [], teamLoad: {}, clientSummaries: [], riskTickets: [], completedThisWeek: 0, completedLastWeek: 0, createdThisWeek: 0, velocityTrend: 0, recentMeetings: [], clientBoard: {}, overdueList: [], issues: [] };
  }
}

// ── getDashboardData — 60s in-memory cache (prevents Plane.so rate limits on rapid commands) ──
let _dashCache = null;
let _dashCacheAt = 0;
async function getCachedData(force = false) {
  if (!force && _dashCache && (Date.now() - _dashCacheAt) < 60000) return _dashCache;
  _dashCache = await getDashboardData();
  _dashCacheAt = Date.now();
  return _dashCache;
}

// ── Command handlers ──
async function handleCommand(chatId, text) {
  const lower = text.toLowerCase().trim();
  const userId = String(chatId);

  // Check for active wizard first
  const wizHandled = await _handleWizardStep(chatId, userId, text);
  if (wizHandled) return;

  // Handle wizard callback data from inline buttons
  if (lower.startsWith('wiz:')) {
    const [, field, value] = lower.split(':');
    const wiz = await _getWizard(userId);
    if (wiz) {
      if (field === 'assignee') return _handleWizardStep(chatId, userId, value.toUpperCase());
      if (field === 'due') return _handleWizardStep(chatId, userId, value);
      if (field === 'confirm') return _handleWizardStep(chatId, userId, value);
      if (field === 'value') return _handleWizardStep(chatId, userId, value);
    }
  }

  // ── Phase M (finance) slash commands ─────────────────────────────
  // All three queue an action to Supabase audit_log; the local
  // obsidian-queue-consumer (already realtime-subscribed) dispatches
  // to the local finance MCP and sends the formatted result back via
  // the bot directly. The cloud function just acknowledges + queues.
  async function queueFinanceAction(action, details, ackText) {
    try {
      const supaUrl = process.env.SUPABASE_URL;
      const supaKey = process.env.SUPABASE_ANON_KEY;
      const body = JSON.stringify({
        action,
        entity_type: 'finance',
        entity_id: details.quarter || details.invoice_id || details.subject || 'global',
        entity_name: ackText,
        actor: 'ceo',
        details: { ...details, source: 'telegram-slash' },
        metadata: { source: 'telegram-callback', timestamp: Date.now() },
      });
      const u = new URL(`${supaUrl}/rest/v1/audit_log`);
      await new Promise(resolve => {
        const r = require('https').request({
          hostname: u.hostname, path: u.pathname, method: 'POST',
          headers: {
            apikey: supaKey, Authorization: `Bearer ${supaKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            'Content-Length': Buffer.byteLength(body),
          },
        }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
        r.on('error', () => resolve());
        r.write(body); r.end();
      });
      await send(chatId, ackText);
    } catch (e) {
      await send(chatId, `⚠️ Queue write failed: ${(e.message || 'unknown').slice(0, 100)}`);
    }
  }

  // /topay [Q?] — show what still needs to be paid
  if (lower.startsWith('/topay') || lower.startsWith('/unpaid')) {
    const m = text.match(/(\d{4}-Q[1-4])/i);
    const quarter = m ? m[1].toUpperCase() : null;
    return queueFinanceAction(
      'finance.queue.show_pay_queue',
      { quarter },
      `💰 Pulling pay queue${quarter ? ' for ' + quarter : ''}…`
    );
  }

  // /run-quarter <Q> — backfill emails for the specified quarter
  if (lower.startsWith('/run-quarter') || lower.startsWith('/runquarter') || /^\/q[1-4]\b/.test(lower)) {
    const m = text.match(/(\d{4}-Q[1-4])/i) || text.match(/^\/q([1-4])\b/i);
    let quarter;
    if (m && m[0].includes('-')) quarter = m[1].toUpperCase();
    else if (m) {
      const yr = new Date().getUTCFullYear();
      quarter = `${yr}-Q${m[1]}`;
    }
    if (!quarter) return send(chatId, '⚠️ Usage: <code>/run-quarter 2026-Q1</code> or <code>/q1</code>');
    return queueFinanceAction(
      'finance.queue.run_ingest_quarter',
      { quarter },
      `▶ Backfilling ${quarter} from Outlook… (~5–10 min, you'll get a summary when done)`
    );
  }

  // /bundle <Q> — generate the accountant bundle
  if (lower.startsWith('/bundle') || lower.startsWith('/export')) {
    const m = text.match(/(\d{4}-Q[1-4])/i);
    if (!m) return send(chatId, '⚠️ Usage: <code>/bundle 2026-Q1</code>');
    const quarter = m[1].toUpperCase();
    return queueFinanceAction(
      'finance.queue.export_quarter',
      { quarter },
      `📦 Generating ${quarter} bundle…`
    );
  }

  // /finance — open the local control panel + status
  if (lower === '/finance' || lower === '/dashboard-finance') {
    return queueFinanceAction(
      'finance.queue.refresh_dashboard',
      {},
      `🌐 Refreshing finance dashboard…`
    );
  }

  // /newlead — start lead creation wizard
  if (lower.startsWith('/newlead')) {
    const clientName = text.slice(8).trim();
    if (!clientName) return send(chatId, '⚠️ Usage: <code>/newlead Company Name</code>');
    await _setWizard(userId, { type: 'lead', step: 'services', data: { client: clientName } });
    return send(chatId, `🏢 <b>New Lead: ${clientName}</b>\n\n🎯 What services are they interested in?\n<i>e.g., Video, Website, Marketing, Social Media</i>`);
  }

  // /ticket — start guided ticket creation wizard
  if (lower === '/ticket' || lower === '/newticket') {
    return send(chatId, '📝 <b>Guided Ticket Creation</b>\n\nTell me the title:\n<i>e.g., SHIPSTER Website Hero Section Redesign</i>\n\nOr use quick create: <code>/create [title] priority:high assign:FK</code>');
  }

  // /start
  if (lower === '/start') {
    return sendWithButtons(chatId,
      `🚀 <b>EXEO Command Bot</b>\n\nc2moviez COO Operations Assistant\n\n<b>Quick:</b> /briefing · /me · /status · /overdue\n<b>Actions:</b> /done · /due · /priority · /create\n<b>Intel:</b> /velocity · /blockers · /forecast\n<b>Team:</b> /capacity · /compare · /clients\n\n🎙 Voice — speak any command\n💬 Text — ask anything\n/help — Full command list`,
      [[{text:'📋 Briefing',callback_data:'/briefing'},{text:'👤 My Dashboard',callback_data:'/me'}],[{text:'📊 Status',callback_data:'/status'},{text:'🔮 Forecast',callback_data:'/forecast'}],[{text:'🌐 Dashboard',url:'https://ops.c2moviez.com'}]]
    );
  }

  // /help
  if (lower === '/help') {
    return send(chatId,
      `⚡ <b>EXEO COO Commands</b>\n\n` +
      `<b>📊 INTELLIGENCE</b>\n` +
      `/briefing — Full COO morning briefing\n` +
      `/me — Your personal dashboard\n` +
      `/status — KPI overview\n` +
      `/velocity — Weekly throughput + trend\n` +
      `/blockers — Stuck tickets (>7d no update)\n` +
      `/capacity — Team bandwidth + availability\n` +
      `/compare — This week vs last week\n` +
      `/forecast — 2-week workload prediction\n\n` +
      `<b>📋 TICKETS</b>\n` +
      `/overdue — Overdue list\n` +
      `/week — Due this week\n` +
      `/stale — Stale tickets (>14d inactive)\n` +
      `/staleclients — Stale clients (from Obsidian vault)\n` +
      `/search [text] — Find tickets\n` +
      `/hygiene — Data quality score\n\n` +
      `<b>⚡ QUICK ACTIONS</b>\n` +
      `/done C2M-87 — Mark completed\n` +
      `/due C2M-87 friday — Set due date\n` +
      `/priority C2M-87 urgent — Change priority\n` +
      `/note C2M-87 [text] — Add note\n` +
      `/assign C2M-87 FK — Reassign\n` +
      `/create [title] — New ticket (assign:FK priority:high due:+7)\n` +
      `/reschedule +7 — Bulk reschedule\n\n` +
      `<b>👥 BUSINESS</b>\n` +
      `/pipeline — Sales pipeline\n` +
      `/clients — All clients by health\n` +
      `/customer [name] — Client details\n` +
      `/followup CODE — Draft follow-up message\n` +
      `/ops — Full AI ops summary\n` +
      `/team — Team workload\n\n` +
      `<b>🎙 AI</b>\n` +
      `Voice message — speak any command\n` +
      `Text — ask anything (remembers context)\n` +
      `<code>/edit C2M-42 due:+3 priority:urgent</code>`
    );
  }

  // /status
  if (lower === '/status') {
    const d = await getCachedData();
    const pct = d.total ? Math.round(d.done / d.total * 100) : 0;
    return sendWithButtons(chatId,
      `📊 <b>Dashboard Status</b>\n\n` +
      `📌 Total: <b>${d.total}</b>\n` +
      `⚡ Active: <b>${d.active}</b>\n` +
      `✅ Done: <b>${d.done}</b> (${pct}%)\n` +
      `🔴 Overdue: <b>${d.overdue}</b>\n` +
      `🔥 Urgent/High: <b>${d.urgent}</b>\n\n` +
      `${d.overdue > 0 ? '⚠️ <b>' + d.overdue + ' overdue — type /overdue for details</b>' : '✅ All clear!'}`,
      [[{text:'🔴 Overdue',callback_data:'/overdue'},{text:'📅 This Week',callback_data:'/week'}],[{text:'👥 Team',callback_data:'/team'},{text:'🌐 Dashboard',url:'https://ops.c2moviez.com'}]]
    );
  }

  // /overdue
  if (lower === '/overdue') {
    const d = await getCachedData();
    if (!d.overdueList.length) return send(chatId, '✅ No overdue tickets!');
    const list = d.overdueList.map(t => `🔴 <code>${t.ticket}</code> ${t.name.slice(0, 40)}`).join('\n');
    return send(chatId, `🔴 <b>Overdue Tickets (${d.overdue})</b>\n\n${list}`);
  }

  // /week
  if (lower === '/week') {
    const d = await getCachedData();
    const today = new Date();
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + (7 - today.getDay() || 7));
    const thisWeek = d.issues.filter(i => !['completed', 'cancelled'].includes(i.group) && i.target_date && new Date(i.target_date) >= today && new Date(i.target_date) <= weekEnd);
    const list = thisWeek.slice(0, 10).map(t => `📌 <code>${t.ticket}</code> ${t.name.slice(0, 40)}`).join('\n');
    return send(chatId, `📅 <b>This Week (${thisWeek.length} tickets)</b>\n\n${list || 'Nothing scheduled this week.'}`);
  }

  // /team
  if (lower === '/team') {
    const d = await getCachedData();
    let msg = `👥 <b>Team Workload</b>\n\n`;
    Object.entries(d.teamLoad).forEach(([member, load]) => {
      const cap = Math.min(100, Math.round(load.active / 30 * 100));
      const bar = '█'.repeat(Math.round(cap / 10)) + '░'.repeat(10 - Math.round(cap / 10));
      const alert = cap >= 80 ? '🔴' : cap >= 50 ? '🟡' : '🟢';
      msg += `${alert} <b>${member}</b> — ${cap}%\n`;
      msg += `  <code>${bar}</code>\n`;
      msg += `  📌 ${load.active} active · 🔴 ${load.overdue} overdue · 📅 ${load.thisWeek} this week\n\n`;
    });
    msg += `⚠️ Unassigned: ${d.unassigned}`;
    return send(chatId, msg);
  }

  // /hygiene — data quality report
  if (lower === '/hygiene') {
    const d = await getCachedData();
    const clean = d.active - d.noPrio - d.unassigned - d.noDue;
    const pct = d.active ? Math.round(clean / d.active * 100) : 100;
    const icon = pct >= 90 ? '🟢' : pct >= 70 ? '🟡' : '🔴';
    return send(chatId,
      `🧹 <b>Data Hygiene — ${icon} ${pct}%</b>\n\n` +
      `📌 Active tickets: ${d.active}\n` +
      `${d.noPrio ? '⚠️' : '✅'} No priority: ${d.noPrio}\n` +
      `${d.unassigned ? '⚠️' : '✅'} Unassigned: ${d.unassigned}\n` +
      `${d.noDue ? '⚠️' : '✅'} No due date: ${d.noDue}\n` +
      `${d.stale ? '⚠️' : '✅'} Stale (>14d): ${d.stale}\n` +
      `${d.overdue ? '🔴' : '✅'} Overdue: ${d.overdue}\n\n` +
      `✅ Clean: ${clean}/${d.active}`
    );
  }

  // /stale — stale tickets
  if (lower === '/stale') {
    const d = await getCachedData();
    const staleList = d.issues.filter(i => !['completed', 'cancelled'].includes(i.group) && i.updated_at && (Date.now() - new Date(i.updated_at).getTime()) > 14 * 86400000).sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || '')).slice(0, 10);
    if (!staleList.length) return send(chatId, '✅ No stale tickets!');
    const list = staleList.map(t => {
      const days = Math.round((Date.now() - new Date(t.updated_at).getTime()) / 86400000);
      return `📋 <code>${t.ticket}</code> ${t.name.slice(0, 35)} <i>(${days}d · ${t.assignee})</i>`;
    }).join('\n');
    return send(chatId, `📋 <b>Stale Tickets (>14 days inactive)</b>\n\n${list}`);
  }

  // /assign C2M-123 FK — reassign ticket
  if (lower.startsWith('/assign ')) {
    const parts = text.slice(8).trim().split(/\s+/);
    const ticketRef = parts[0]?.toUpperCase();
    const newAssignee = parts[1]?.toUpperCase();
    if (!ticketRef || !newAssignee) return send(chatId, '⚠️ Usage: <code>/assign C2M-123 FK</code>');
    const assigneeId = Object.entries(TEAM_IDS).find(([, v]) => v === newAssignee)?.[0];
    if (!assigneeId) return send(chatId, `⚠️ Unknown assignee: ${newAssignee}. Use: ${Object.values(TEAM_IDS).join(', ')}`);
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // PATCH via Plane.so API
    const projId = PROJ_IDS[ticket.proj];
    if (!projId) return send(chatId, '⚠️ Unknown project.');
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { assignees: [assigneeId] });
    if (r.id) return send(chatId, `✅ <code>${ticketRef}</code> reassigned to <b>${newAssignee}</b>`);
    return send(chatId, `⚠️ Reassign failed: ${JSON.stringify(r).slice(0, 80)}`);
  }

  // /edit C2M-123 priority:high state:In Progress due:2026-04-15 name:New Title
  if (lower.startsWith('/edit ')) {
    const parts = text.slice(6).trim();
    const ticketRef = parts.split(/\s+/)[0]?.toUpperCase();
    const fieldStr = parts.slice(ticketRef.length).trim();
    if (!ticketRef || !fieldStr) return send(chatId,
      '⚠️ Usage: <code>/edit C2M-123 field:value</code>\n\n' +
      '<b>Fields:</b>\n' +
      '• <code>priority:high</code> (urgent/high/medium/low)\n' +
      '• <code>assignee:FK</code> (CTI/FK)\n' +
      '• <code>due:2026-04-15</code> or <code>due:+7</code> (add days)\n' +
      '• <code>start:2026-04-01</code>\n' +
      '• <code>name:New ticket title</code> (rest of text)\n\n' +
      'Example: <code>/edit C2M-42 priority:urgent due:+3</code>');
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // uses module-level PROJ_IDS
    const projId = PROJ_IDS[ticket.proj];
    const patch = {};
    const changes = [];
    // Parse field:value pairs (supports value with spaces for name:)
    const priMap = { urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' };
    // Handle name: specially — everything after "name:" is the new name
    const nameMatch = fieldStr.match(/name:(.+)/i);
    if (nameMatch) {
      patch.name = nameMatch[1].replace(/\s+\w+:\S+/g, '').trim(); // Strip other field:value pairs
      changes.push(`name → "${patch.name.slice(0,40)}"`);
    }
    // Parse structured field:value pairs
    (fieldStr.replace(/name:.+/i, '').match(/\w+:[^\s]+/g) || []).forEach(pair => {
      const [key, val] = pair.split(':');
      if (key === 'priority' && priMap[val]) { patch.priority = priMap[val]; changes.push(`priority → ${val}`); }
      if (key === 'assignee') { const aid = Object.entries(TEAM_IDS).find(([, v]) => v === val.toUpperCase())?.[0]; if (aid) { patch.assignees = [aid]; changes.push(`assignee → ${val.toUpperCase()}`); } }
      if (key === 'due' || key === 'target_date') {
        if (val.startsWith('+')) { const days = parseInt(val.slice(1)) || 7; const dt = new Date(); dt.setDate(dt.getDate() + days); patch.target_date = dt.toISOString().slice(0,10); changes.push(`due → ${patch.target_date} (+${days}d)`); }
        else if (val.match(/^\d{4}-\d{2}-\d{2}$/)) { patch.target_date = val; changes.push(`due → ${val}`); }
      }
      if (key === 'start' || key === 'start_date') {
        if (val.match(/^\d{4}-\d{2}-\d{2}$/)) { patch.start_date = val; changes.push(`start → ${val}`); }
      }
    });
    if (!Object.keys(patch).length) return send(chatId, '⚠️ No valid fields detected.\n\nUse: priority:high, assignee:FK, due:+7, due:2026-04-15, name:New title');
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, patch);
    if (r.id) return send(chatId, `✅ <code>${ticketRef}</code> updated:\n${changes.map(c => '  • ' + c).join('\n')}`);
    return send(chatId, `⚠️ Update failed: ${JSON.stringify(r).slice(0, 80)}`);
  }

  // /reschedule — bulk reschedule overdue tickets
  if (lower.startsWith('/reschedule')) {
    const arg = text.slice(11).trim();
    const d = await getCachedData();
    const overdue = d.issues.filter(i => !['completed','cancelled'].includes(i.group) && i.target_date && new Date(i.target_date) < new Date());
    if (!overdue.length) return send(chatId, '✅ No overdue tickets to reschedule!');
    // Parse days offset or specific date
    let newDate;
    if (arg.startsWith('+')) { const days = parseInt(arg.slice(1)) || 7; newDate = new Date(); newDate.setDate(newDate.getDate() + days); newDate = newDate.toISOString().slice(0,10); }
    else if (arg.match(/^\d{4}-\d{2}-\d{2}$/)) newDate = arg;
    else if (arg === 'friday' || arg === 'fri') { const dt = new Date(); dt.setDate(dt.getDate() + (5 - dt.getDay() + 7) % 7 || 7); newDate = dt.toISOString().slice(0,10); }
    else if (arg === 'monday' || arg === 'mon') { const dt = new Date(); dt.setDate(dt.getDate() + (8 - dt.getDay()) % 7 || 7); newDate = dt.toISOString().slice(0,10); }
    else { return send(chatId, `📅 <b>${overdue.length} overdue tickets</b>\n\nUsage:\n<code>/reschedule +7</code> (push 7 days)\n<code>/reschedule friday</code>\n<code>/reschedule monday</code>\n<code>/reschedule 2026-04-15</code>`); }
    await send(chatId, `⟳ Rescheduling ${overdue.length} tickets to ${newDate}…`);
    // uses module-level PROJ_IDS
    let ok = 0, fail = 0;
    for (const t of overdue) {
      try {
        const pid = PROJ_IDS[t.proj];
        if (!pid) { fail++; continue; }
        const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${pid}/issues/${t.id}/`, { target_date: newDate });
        if (r.id) ok++; else fail++;
      } catch { fail++; }
    }
    return send(chatId, `✅ Rescheduled <b>${ok}/${overdue.length}</b> tickets to ${newDate}${fail ? `\n⚠️ ${fail} failed` : ''}`);
  }

  // /customer [name] — view customer details + linked tickets
  if (lower.startsWith('/customer')) {
    const query = text.slice(9).trim().toLowerCase();
    if (!query || query === 'help') {
      // List all known customers
      try {
        const custRes = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=100`);
        const custs = custRes.results || custRes.data || (Array.isArray(custRes) ? custRes : []);
        if (custs.length) {
          const list = custs.slice(0, 15).map(c => `  • ${c.name}`).join('\n');
          return send(chatId, `👤 <b>Customers</b> (${custs.length})\n\n${list}${custs.length > 15 ? '\n  <i>+ ' + (custs.length - 15) + ' more</i>' : ''}\n\nUsage: <code>/customer shipster</code>`);
        }
      } catch {}
      return send(chatId, '⚠️ Usage: <code>/customer shipster</code> or <code>/customer MFB</code>');
    }
    // Search in Plane.so customers
    try {
      const custRes = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=100`);
      const custs = custRes.results || custRes.data || (Array.isArray(custRes) ? custRes : []);
      const matched = custs.find(c => {
        const cn = c.name.toLowerCase();
        return cn.includes(query) || query.includes(cn.split(' ')[0]) || cn.split(/\s+/)[0].slice(0,4).toLowerCase() === query;
      });
      if (!matched) return send(chatId, `🔍 No customer found for "${query}". Try a different name.`);
      // Get customer's issues
      const ciRes = await planeGet(`/workspaces/${WORKSPACE}/customers/${matched.id}/issues/?per_page=200`);
      const ciList = ciRes.results || ciRes.data || (Array.isArray(ciRes) ? ciRes : []);
      const d = await getCachedData();
      const custIssueIds = new Set(Array.isArray(ciList) ? ciList.map(i => i.id) : []);
      const custTickets = d.issues.filter(i => custIssueIds.has(i.id));
      const active = custTickets.filter(i => !['completed','cancelled'].includes(i.group));
      const done = custTickets.filter(i => ['completed','cancelled'].includes(i.group));
      const overdue = active.filter(i => i.target_date && new Date(i.target_date) < new Date());
      const urgent = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
      let msg = `👤 <b>${matched.name}</b>\n\n`;
      msg += `📌 ${active.length} active · ✅ ${done.length} done\n`;
      msg += `🔴 ${overdue.length} overdue · 🔥 ${urgent.length} urgent/high\n\n`;
      if (active.length) {
        msg += '<b>Active Tickets:</b>\n';
        active.sort((a,b) => {const p={urgent:0,high:1,medium:2,low:3};return(p[a.priority]||4)-(p[b.priority]||4);}).slice(0,8).forEach(t => {
          const pri = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟡' : '📌';
          const ov = t.target_date && new Date(t.target_date) < new Date() ? ' ⏰' : '';
          msg += `${pri} <code>${t.ticket}</code> ${t.name.slice(0,35)}${ov}\n`;
        });
        if (active.length > 8) msg += `<i>+ ${active.length - 8} more</i>\n`;
      }
      // Check pipeline for business data
      const pipeline = await getBizData('pipeline');
      const deal = pipeline.find(p => (p.client_name || '').toLowerCase().includes(query) || (p.client_name || '').toLowerCase() === matched.name.toLowerCase());
      if (deal) {
        msg += `\n🏢 <b>Pipeline:</b> ${deal.stage} · CHF ${(deal.estimated_value_chf||0).toLocaleString('de-CH')}\n`;
        msg += `👤 ${deal.contact_name||'—'} · ${deal.contact_email||'—'}\n`;
      }
      return sendWithButtons(chatId, msg, [[{text:'🌐 Dashboard',url:'https://ops.c2moviez.com'}]]);
    } catch(e) { return send(chatId, `⚠️ Error: ${e.message}`); }
  }

  // /digest
  if (lower === '/digest') {
    const d = await getCachedData();
    const today = new Date().toLocaleDateString('de-CH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return send(chatId, `📋 <b>Morning Digest — ${today}</b>\n\n📊 ${d.active} active tickets\n🔴 ${d.overdue} overdue\n🔥 ${d.urgent} urgent/high\n\n${d.overdue > 0 ? '⚠️ <b>Action needed:</b>\n' + d.overdueList.slice(0, 5).map(t => `  🔴 ${t.ticket} ${t.name.slice(0, 35)}`).join('\n') : '✅ All clear — no overdue tickets'}\n\n🌐 <a href="https://ops.c2moviez.com">Open Dashboard</a>`);
  }

  // /search
  if (lower.startsWith('/search ')) {
    const query = text.slice(8).trim().toLowerCase();
    const d = await getCachedData();

    // Load ALL customers from Plane.so + build kuerzel map
    let customerIssueIds = new Set();
    let matchedCustName = '';
    let matchedKuerzel = '';
    try {
      const custRes = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=100`);
      const custs = custRes.results || custRes.data || (Array.isArray(custRes) ? custRes : []);
      if (Array.isArray(custs)) {
        // Match by: full name, first word, or auto-kuerzel (first 3-4 chars)
        const matchedCust = custs.find(c => {
          const cn = c.name.toLowerCase();
          const kz = cn.split(/\s+/)[0].slice(0, 4); // auto-kuerzel: first 4 chars of first word
          return cn.includes(query) || query.includes(cn.split(' ')[0]) || kz === query || kz.startsWith(query);
        });
        if (matchedCust) {
          matchedCustName = matchedCust.name;
          matchedKuerzel = matchedCust.name.split(/\s+/)[0].toUpperCase().slice(0, 4);
          const ciRes = await planeGet(`/workspaces/${WORKSPACE}/customers/${matchedCust.id}/issues/?per_page=200`);
          const ciList = ciRes.results || ciRes.data || (Array.isArray(ciRes) ? ciRes : []);
          if (Array.isArray(ciList)) ciList.forEach(ci => customerIssueIds.add(ci.id));
        }
      }
    } catch {}

    // Search across: name, ticket ID, description, assignee, customer API match, kuerzel prefix
    const words = query.split(/\s+/).filter(w => w.length > 1);
    const matches = d.issues.filter(i => {
      const n = i.name.toLowerCase();
      const all = n + ' ' + i.ticket.toLowerCase() + ' ' + (i.description || '').toLowerCase() + ' ' + i.assignee.toLowerCase();
      if (all.includes(query)) return true;
      if (words.length > 1 && words.some(w => all.includes(w))) return true;
      if (customerIssueIds.has(i.id)) return true;
      // Match kuerzel prefix in ticket name (e.g., "CASA — Website" matches "casa")
      if (matchedKuerzel && n.startsWith(matchedKuerzel.toLowerCase())) return true;
      return false;
    }).slice(0, 10);

    if (!matches.length) return send(chatId, `🔍 No tickets found for "${query}"${matchedCustName ? ` (customer "${matchedCustName}" / ${matchedKuerzel} found but no tickets)` : ''}`);
    const hdr = matchedCustName ? `🔍 <b>${matchedCustName}</b> (${matchedKuerzel}) — ${matches.length} tickets` : `🔍 <b>Search: "${query}"</b> — ${matches.length} results`;
    const list = matches.map(t => `${t.group === 'completed' ? '✅' : '📌'} <code>${t.ticket}</code> ${t.name.slice(0, 40)} <i>(${t.state} · ${t.assignee})</i>`).join('\n');
    return send(chatId, `${hdr}\n\n${list}`);
  }

  // /me — personal dashboard
  if (lower === '/me') {
    const d = await getCachedData();
    const userId = String(chatId);
    // Map Telegram chat ID to team member (first allowed user = CTI, others = FK)
    const memberKey = (ALLOWED_USERS.length && ALLOWED_USERS[0] === userId) ? 'CTI' : (ALLOWED_USERS.length > 1 && ALLOWED_USERS[1] === userId) ? 'FK' : 'CTI';
    const mine = d.issues.filter(i => !['completed','cancelled'].includes(i.group) && i.assignee.includes(memberKey));
    const myOv = mine.filter(i => i.target_date && i.target_date < new Date().toISOString().slice(0,10));
    const myWk = d.dueThisWeek.filter(i => i.assignee.includes(memberKey));
    const myDone = d.issues.filter(i => ['completed','cancelled'].includes(i.group) && i.assignee.includes(memberKey));
    const cap = Math.min(100, Math.round(mine.length / 30 * 100));
    const icon = cap >= 80 ? '🔴' : cap >= 50 ? '🟡' : '🟢';
    let msg = `👤 <b>My Dashboard — ${memberKey}</b>\n\n`;
    msg += `${icon} Capacity: <b>${cap}%</b> (${mine.length} open)\n`;
    msg += `🔴 Overdue: <b>${myOv.length}</b>\n`;
    msg += `📅 Due this week: <b>${myWk.length}</b>\n`;
    msg += `✅ Completed: <b>${myDone.length}</b>\n\n`;
    if (myOv.length) {
      msg += '<b>⚠️ My Overdue:</b>\n';
      myOv.sort((a,b)=>(a.target_date||'').localeCompare(b.target_date||'')).slice(0,5).forEach(t => {
        const days = Math.ceil((Date.now() - new Date(t.target_date+'T00:00:00').getTime()) / 86400000);
        msg += `  🔴 <code>${t.ticket}</code> ${t.name.slice(0,35)} <i>(${days}d)</i>\n`;
      });
      msg += '\n';
    }
    if (myWk.length) {
      msg += '<b>📅 Due This Week:</b>\n';
      myWk.slice(0,5).forEach(t => {
        msg += `  📌 <code>${t.ticket}</code> ${t.name.slice(0,35)} <i>(${t.target_date?.slice(5,10)})</i>\n`;
      });
    }
    return send(chatId, msg);
  }

  // /done C2M-87 — mark ticket as completed
  if (lower.startsWith('/done ')) {
    const ticketRef = text.slice(6).trim().toUpperCase();
    if (!ticketRef) return send(chatId, '⚠️ Usage: <code>/done C2M-87</code>');
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // uses module-level PROJ_IDS
    const projId = PROJ_IDS[ticket.proj];
    // Find the "completed" state for this project
    const states = await planeGet(`/workspaces/${WORKSPACE}/projects/${projId}/states/`);
    const stateList = states.results || states.data || (Array.isArray(states) ? states : []);
    const doneState = stateList.find(s => s.group === 'completed');
    if (!doneState) return send(chatId, `⚠️ No "completed" state found for ${ticket.proj}`);
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { state: doneState.id });
    if (r.id) {
      _queueObsidianWrite('work-item-update', { ticket: ticketRef, field: 'state', value: 'Done' });
      return send(chatId, `✅ <code>${ticketRef}</code> marked as <b>completed</b>!`);
    }
    return send(chatId, `⚠️ Failed: ${JSON.stringify(r).slice(0,80)}`);
  }

  // /due C2M-87 friday — set due date with natural language
  if (lower.startsWith('/due ')) {
    const parts = text.slice(5).trim().split(/\s+/);
    const ticketRef = parts[0]?.toUpperCase();
    const dateArg = parts.slice(1).join(' ').toLowerCase();
    if (!ticketRef || !dateArg) return send(chatId, '⚠️ Usage: <code>/due C2M-87 friday</code> or <code>/due C2M-87 +3</code> or <code>/due C2M-87 2026-04-15</code>');
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // Parse natural language date
    let newDate;
    const now = new Date();
    if (dateArg.startsWith('+')) { const days = parseInt(dateArg.slice(1)) || 7; const dt = new Date(); dt.setDate(dt.getDate() + days); newDate = dt.toISOString().slice(0,10); }
    else if (dateArg.match(/^\d{4}-\d{2}-\d{2}$/)) newDate = dateArg;
    else if (dateArg === 'today') newDate = now.toISOString().slice(0,10);
    else if (dateArg === 'tomorrow') { const dt = new Date(); dt.setDate(dt.getDate()+1); newDate = dt.toISOString().slice(0,10); }
    else if (dateArg.match(/^(mon|monday)/)) { const dt = new Date(); dt.setDate(dt.getDate()+(8-dt.getDay())%7||7); newDate = dt.toISOString().slice(0,10); }
    else if (dateArg.match(/^(fri|friday)/)) { const dt = new Date(); dt.setDate(dt.getDate()+(5-dt.getDay()+7)%7||7); newDate = dt.toISOString().slice(0,10); }
    else if (dateArg.match(/^next week/)) { const dt = new Date(); dt.setDate(dt.getDate()+(8-dt.getDay())%7||7); newDate = dt.toISOString().slice(0,10); }
    else return send(chatId, `⚠️ Can't parse "${dateArg}". Use: friday, monday, tomorrow, +3, 2026-04-15`);
    // uses module-level PROJ_IDS
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${PROJ_IDS[ticket.proj]}/issues/${ticket.id}/`, { target_date: newDate });
    if (r.id) {
      _queueObsidianWrite('work-item-update', { ticket: ticketRef, field: 'due', value: newDate });
      return send(chatId, `📅 <code>${ticketRef}</code> due date → <b>${newDate}</b>`);
    }
    return send(chatId, `⚠️ Failed: ${JSON.stringify(r).slice(0,80)}`);
  }

  // /priority C2M-87 urgent — change priority
  if (lower.startsWith('/priority ')) {
    const parts = text.slice(10).trim().split(/\s+/);
    const ticketRef = parts[0]?.toUpperCase();
    const newPri = parts[1]?.toLowerCase();
    const priMap = { urgent:'urgent', high:'high', medium:'medium', low:'low', none:'none' };
    if (!ticketRef || !priMap[newPri]) return send(chatId, '⚠️ Usage: <code>/priority C2M-87 urgent</code>\nOptions: urgent, high, medium, low');
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // uses module-level PROJ_IDS
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${PROJ_IDS[ticket.proj]}/issues/${ticket.id}/`, { priority: priMap[newPri] });
    if (r.id) {
      _queueObsidianWrite('work-item-update', { ticket: ticketRef, field: 'priority', value: newPri });
      return send(chatId, `🏷 <code>${ticketRef}</code> priority → <b>${newPri}</b>`);
    }
    return send(chatId, `⚠️ Failed: ${JSON.stringify(r).slice(0,80)}`);
  }

  // /note C2M-87 [text] — add comment to ticket (via description append)
  if (lower.startsWith('/note ')) {
    const firstSpace = text.indexOf(' ', 6);
    const ticketRef = text.slice(6, firstSpace > 6 ? firstSpace : undefined).trim().toUpperCase();
    const noteText = firstSpace > 6 ? text.slice(firstSpace).trim() : '';
    if (!ticketRef || !noteText) return send(chatId, '⚠️ Usage: <code>/note C2M-87 Client feedback pending</code>');
    const d = await getCachedData();
    const ticket = d.issues.find(i => i.ticket === ticketRef);
    if (!ticket) return send(chatId, `⚠️ Ticket ${ticketRef} not found.`);
    // uses module-level PROJ_IDS
    // Append note to description
    const existing = ticket.description || '';
    const timestamp = new Date().toLocaleString('de-CH', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const updated = existing + `\n\n---\n📝 [${timestamp}] ${noteText}`;
    _dashCache = null; // invalidate after write
    const r = await planePatch(`/workspaces/${WORKSPACE}/projects/${PROJ_IDS[ticket.proj]}/issues/${ticket.id}/`, { description_html: `<p>${updated.replace(/\n/g,'<br>')}</p>` });
    if (r.id) {
      _queueObsidianWrite('work-item-note', { ticket: ticketRef, note: noteText, timestamp: timestamp });
      return send(chatId, `📝 Note added to <code>${ticketRef}</code>:\n<i>"${noteText.slice(0,100)}"</i>`);
    }
    return send(chatId, `⚠️ Failed: ${JSON.stringify(r).slice(0,80)}`);
  }

  // /briefing — full COO briefing
  if (lower === '/briefing') {
    const d = await getCachedData(true);
    const todayStr = new Date().toISOString().slice(0,10);
    const todayFmt = new Date().toLocaleDateString('de-CH', { weekday:'long', day:'numeric', month:'long' });
    const active = d.issues.filter(i => !['completed','cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
    const urgent = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+(7-weekEnd.getDay()||7));
    const dueWk = active.filter(i => i.target_date && i.target_date >= todayStr && i.target_date <= weekEnd.toISOString().slice(0,10));
    const unassigned = active.filter(i => i.assignee === 'unassigned');
    const noPrio = active.filter(i => !i.priority || i.priority === 'none');
    const noDue = active.filter(i => !i.target_date);
    const clean = active.filter(i => i.priority && i.priority !== 'none' && i.assignee !== 'unassigned' && i.target_date && !(i.target_date < todayStr));
    const hyg = active.length ? Math.round(clean.length / active.length * 100) : 100;

    let msg = `📋 <b>COO Briefing — ${todayFmt}</b>\n\n`;
    msg += `<b>STATUS</b>\n`;
    msg += `📌 ${active.length} open · ✅ ${d.done} done · 🧹 ${hyg}%\n\n`;
    msg += `<b>ATTENTION</b>\n`;
    msg += `🔴 ${overdue.length} overdue · 🔥 ${urgent.length} urgent/high\n`;
    msg += `📅 ${dueWk.length} due this week · ❓ ${unassigned.length} unassigned\n\n`;
    msg += `<b>TEAM</b>\n`;
    Object.entries(d.teamLoad).forEach(([m, l]) => {
      const c = Math.min(100, Math.round(l.active/30*100));
      msg += `${c>=80?'🔴':c>=50?'🟡':'🟢'} ${m}: ${l.active} active · ${l.overdue} overdue · ${l.thisWeek} this week\n`;
    });
    msg += `\n<b>HYGIENE</b>\n`;
    msg += `${noPrio.length?'⚠️':'✅'} No priority: ${noPrio.length}\n`;
    msg += `${unassigned.length?'⚠️':'✅'} Unassigned: ${unassigned.length}\n`;
    msg += `${noDue.length?'⚠️':'✅'} No due date: ${noDue.length}\n`;
    if (overdue.length) {
      msg += `\n<b>TOP OVERDUE</b>\n`;
      overdue.sort((a,b)=>(a.target_date||'').localeCompare(b.target_date||'')).slice(0,5).forEach(t => {
        const days = Math.ceil((Date.now()-new Date(t.target_date+'T00:00:00').getTime())/86400000);
        msg += `🔴 <code>${t.ticket}</code> ${t.name.slice(0,30)} · ${t.assignee} (${days}d)\n`;
      });
    }
    return sendWithButtons(chatId, msg, [[{text:'🚶 Walk Through',callback_data:'/overdue'},{text:'📅 Week',callback_data:'/week'}],[{text:'🌐 Dashboard',url:'https://ops.c2moviez.com'}]]);
  }

  // /velocity — weekly throughput
  if (lower === '/velocity') {
    const d = await getCachedData();
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const weekAgo = new Date(now - 7*86400000).toISOString();
    const twoWeeksAgo = new Date(now - 14*86400000).toISOString();
    const completedThisWeek = d.issues.filter(i => ['completed','cancelled'].includes(i.group) && i.updated_at && i.updated_at > weekAgo);
    const completedLastWeek = d.issues.filter(i => ['completed','cancelled'].includes(i.group) && i.updated_at && i.updated_at > twoWeeksAgo && i.updated_at <= weekAgo);
    const createdThisWeek = d.issues.filter(i => i.created_at && i.created_at > weekAgo);
    const trend = completedThisWeek.length > completedLastWeek.length ? '📈 Up' : completedThisWeek.length < completedLastWeek.length ? '📉 Down' : '➡️ Flat';
    let msg = `📊 <b>Velocity Report</b>\n\n`;
    msg += `<b>This Week</b>\n`;
    msg += `✅ Completed: <b>${completedThisWeek.length}</b>\n`;
    msg += `📝 Created: <b>${createdThisWeek.length}</b>\n`;
    msg += `📊 Net: <b>${completedThisWeek.length - createdThisWeek.length >= 0 ? '+' : ''}${completedThisWeek.length - createdThisWeek.length}</b>\n\n`;
    msg += `<b>Last Week</b>\n`;
    msg += `✅ Completed: ${completedLastWeek.length}\n\n`;
    msg += `${trend} trend vs last week`;
    return send(chatId, msg);
  }

  // /blockers — tickets stuck in same state >7 days
  if (lower === '/blockers') {
    const d = await getCachedData();
    const active = d.issues.filter(i => !['completed','cancelled'].includes(i.group));
    const weekAgo = new Date(Date.now() - 7*86400000).toISOString();
    const stuck = active.filter(i => i.updated_at && i.updated_at < weekAgo).sort((a,b) => (a.updated_at||'').localeCompare(b.updated_at||''));
    if (!stuck.length) return send(chatId, '✅ No blocked tickets — everything is moving!');
    let msg = `🚧 <b>Blockers — ${stuck.length} stuck tickets</b>\n<i>Not updated in 7+ days</i>\n\n`;
    stuck.slice(0,10).forEach(t => {
      const days = Math.round((Date.now() - new Date(t.updated_at).getTime())/86400000);
      msg += `🔒 <code>${t.ticket}</code> ${t.name.slice(0,30)} · ${t.state} · ${t.assignee} <i>(${days}d)</i>\n`;
    });
    if (stuck.length > 10) msg += `\n<i>+ ${stuck.length-10} more</i>`;
    return send(chatId, msg);
  }

  // /capacity — team bandwidth
  if (lower === '/capacity') {
    const d = await getCachedData();
    let msg = `⚡ <b>Team Capacity</b>\n\n`;
    Object.entries(d.teamLoad).forEach(([member, load]) => {
      const cap = Math.min(100, Math.round(load.active / 30 * 100));
      const bar = '█'.repeat(Math.round(cap / 10)) + '░'.repeat(10 - Math.round(cap / 10));
      const free = Math.max(0, 30 - load.active);
      const icon = cap >= 80 ? '🔴' : cap >= 50 ? '🟡' : '🟢';
      msg += `${icon} <b>${member}</b> — ${cap}%\n`;
      msg += `<code>${bar}</code>\n`;
      msg += `📌 ${load.active} active · 🔴 ${load.overdue} overdue · 📅 ${load.thisWeek} this week\n`;
      msg += `💡 ${free > 0 ? free + ' slots available' : 'At capacity!'}\n\n`;
    });
    return send(chatId, msg);
  }

  // /compare — this week vs last week
  if (lower === '/compare') {
    const d = await getCachedData();
    const now = new Date();
    const weekAgo = new Date(now - 7*86400000).toISOString();
    const twoWeeksAgo = new Date(now - 14*86400000).toISOString();
    const cTW = d.issues.filter(i => ['completed','cancelled'].includes(i.group) && i.updated_at && i.updated_at > weekAgo).length;
    const cLW = d.issues.filter(i => ['completed','cancelled'].includes(i.group) && i.updated_at && i.updated_at > twoWeeksAgo && i.updated_at <= weekAgo).length;
    const crTW = d.issues.filter(i => i.created_at && i.created_at > weekAgo).length;
    const crLW = d.issues.filter(i => i.created_at && i.created_at > twoWeeksAgo && i.created_at <= weekAgo).length;
    const arrow = v => v > 0 ? `📈 +${v}` : v < 0 ? `📉 ${v}` : '➡️ 0';
    let msg = `📊 <b>Weekly Comparison</b>\n\n`;
    msg += `<code>             This   Last   Δ</code>\n`;
    msg += `<code>Completed    ${String(cTW).padStart(4)}   ${String(cLW).padStart(4)}   ${arrow(cTW-cLW)}</code>\n`;
    msg += `<code>Created      ${String(crTW).padStart(4)}   ${String(crLW).padStart(4)}   ${arrow(crTW-crLW)}</code>\n`;
    msg += `<code>Net          ${String(cTW-crTW).padStart(4)}   ${String(cLW-crLW).padStart(4)}   ${arrow((cTW-crTW)-(cLW-crLW))}</code>\n\n`;
    msg += cTW > cLW ? '🎉 Better week than last!' : cTW < cLW ? '⚠️ Slower than last week.' : '➡️ Same pace.';
    return send(chatId, msg);
  }

  // /clients — all clients ranked by health
  if (lower === '/clients') {
    const d = await getCachedData();
    try {
      const custRes = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=100`);
      const custs = custRes.results || custRes.data || (Array.isArray(custRes) ? custRes : []);
      if (!custs.length) return send(chatId, '👤 No customers found in Plane.so');
      // Build customer issue map
      const active = d.issues.filter(i => !['completed','cancelled'].includes(i.group));
      const todayStr = new Date().toISOString().slice(0,10);
      let clientStats = [];
      for (const c of custs.slice(0,15)) {
        const ciRes = await planeGet(`/workspaces/${WORKSPACE}/customers/${c.id}/issues/?per_page=200`).catch(()=>({}));
        const ciList = ciRes.results || ciRes.data || (Array.isArray(ciRes) ? ciRes : []);
        const ids = new Set(ciList.map(i=>i.id));
        const mine = active.filter(i => ids.has(i.id));
        const ov = mine.filter(i => i.target_date && i.target_date < todayStr);
        const health = ov.length >= 2 ? '🔴' : ov.length === 1 ? '🟡' : mine.length === 0 ? '⚪' : '🟢';
        clientStats.push({ name: c.name, active: mine.length, overdue: ov.length, health });
      }
      clientStats.sort((a,b) => b.overdue - a.overdue || b.active - a.active);
      let msg = `👥 <b>Client Health (${clientStats.length})</b>\n\n`;
      clientStats.forEach(c => {
        msg += `${c.health} <b>${c.name}</b> — ${c.active} active${c.overdue ? ` · 🔴 ${c.overdue} overdue` : ''}\n`;
      });
      return send(chatId, msg);
    } catch(e) { return send(chatId, `⚠️ Error: ${e.message}`); }
  }

  // /forecast — next 2 weeks prediction
  if (lower === '/forecast') {
    const d = await getCachedData();
    const active = d.issues.filter(i => !['completed','cancelled'].includes(i.group));
    const todayStr = new Date().toISOString().slice(0,10);
    const weeks = [1,2].map(w => {
      const start = new Date(); start.setDate(start.getDate() + (w-1)*7);
      const end = new Date(); end.setDate(end.getDate() + w*7);
      const startStr = start.toISOString().slice(0,10);
      const endStr = end.toISOString().slice(0,10);
      const due = active.filter(i => i.target_date && i.target_date >= startStr && i.target_date <= endStr);
      const urg = due.filter(i => i.priority === 'urgent' || i.priority === 'high');
      return { label: w === 1 ? 'This Week' : 'Next Week', due: due.length, urgent: urg.length, start: startStr.slice(5,10), end: endStr.slice(5,10) };
    });
    const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
    let msg = `🔮 <b>2-Week Forecast</b>\n\n`;
    msg += `🔴 Carry-over overdue: <b>${overdue.length}</b>\n\n`;
    weeks.forEach(w => {
      const load = w.due + (w === weeks[0] ? overdue.length : 0);
      const icon = load > 20 ? '🔴' : load > 10 ? '🟡' : '🟢';
      msg += `${icon} <b>${w.label}</b> (${w.start} — ${w.end})\n`;
      msg += `  📌 ${w.due} due · 🔥 ${w.urgent} urgent/high\n`;
    });
    msg += `\n💡 Total load: ${weeks.reduce((s,w)=>s+w.due,0) + overdue.length} tickets in 2 weeks`;
    return send(chatId, msg);
  }

  // /cancel
  if (lower === '/cancel') {
    return send(chatId, '👍 Cancelled.');
  }

  // /staleclients — clients with no activity in 14+ days (from Obsidian KB blob)
  if (lower === '/staleclients' || lower === '/stale_clients') {
    try {
      const kb = await getBlobDirect('client-kb--data');
      if (kb && kb.clients) {
        const todayMs = Date.now();
        const stale = [];
        for (const [code, c] of Object.entries(kb.clients)) {
          if (c.status !== 'active') continue;
          const lastAct = c.last_work_item_activity;
          if (lastAct) {
            const daysSince = Math.floor((todayMs - new Date(lastAct).getTime()) / 86400000);
            if (daysSince >= 14) stale.push({ code, name: c.name, days: daysSince, email: c.contact_email });
          } else if (c.contract_status === 'active') {
            stale.push({ code, name: c.name, days: 999, email: c.contact_email });
          }
        }
        stale.sort((a, b) => b.days - a.days);
        if (!stale.length) return send(chatId, '✅ All active clients have recent activity!');
        const list = stale.map(s => `👤 <b>${s.code}</b> ${(s.name || '').slice(0, 25)} — ${s.days >= 999 ? 'no activity ever' : s.days + 'd inactive'}${s.email ? ' · ' + s.email : ''}`).join('\n');
        return send(chatId, `👤 <b>Stale Clients (>14d inactive)</b>\n\n${list}\n\n💡 Use /followup CODE to draft a follow-up`);
      }
    } catch (e) { /* fall through */ }
    return send(chatId, '⚠️ Client KB not available. Run the daily briefing to push data.');
  }

  // /dueweek — alias for /week
  if (lower === '/dueweek' || lower === '/due_week') {
    return handleCommand(chatId, '/week');
  }

  // /followup CODE — draft a follow-up message for a stale client
  if (lower.startsWith('/followup ')) {
    const code = text.slice(10).trim().toUpperCase();
    if (!code) return send(chatId, '⚠️ Usage: <code>/followup SHI</code>');
    try {
      const kb = await getBlobDirect('client-kb--data');
      const client = kb?.clients?.[code];
      if (!client) return send(chatId, `⚠️ Client ${code} not found in vault KB.`);
      await send(chatId, `✏️ Drafting follow-up for <b>${code} - ${client.name || ''}</b>...`);
      const context = `Client: ${code} - ${client.name}\nEmail: ${client.contact_email || 'unknown'}\nDomain: ${client.domain || 'unknown'}\nContract: ${client.contract_status || 'unknown'}\nOpen tickets: ${client.open_tickets || 0}\nBudget tier: ${client.budget_tier || 'unknown'}`;
      const draft = await _anthropic('You are a COO assistant for c2moviez GmbH (Swiss creative tech). Draft a short (3-5 sentences), warm, professional follow-up in German (Swiss business German). Reference the client domain. Mention open items to discuss. Suggest a quick call. Sign as Claudio Tinner, c2moviez GmbH.', context);
      return send(chatId, `✉️ <b>Follow-up Draft for ${code}</b>\n\n${draft}`);
    } catch (e) {
      return send(chatId, `⚠️ Error: ${e.message.slice(0, 100)}`);
    }
  }

  // /ops — full AI ops summary
  if (lower === '/ops') {
    const d = await getCachedData();
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const active = d.issues.filter(i => !['completed', 'cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && i.target_date < today);
    const dueWeek = active.filter(i => i.target_date && i.target_date >= today && i.target_date <= weekEndStr);
    let msg = `🧠 <b>AI Ops Summary</b>\n\n📊 <b>Portfolio:</b> ${active.length} open · ${overdue.length} overdue · ${dueWeek.length} due this week\n\n`;
    // Stale clients from blob
    try {
      const kb = await getBlobDirect('client-kb--data');
      if (kb?.clients) {
        const stale = Object.entries(kb.clients).filter(([, c]) => {
          if (c.status !== 'active') return false;
          const last = c.last_work_item_activity;
          return !last || (Date.now() - new Date(last).getTime()) > 14 * 86400000;
        });
        if (stale.length) msg += `👤 <b>Stale clients:</b> ${stale.map(([code]) => code).join(', ')}\n\n`;
      }
    } catch {}
    if (overdue.length) {
      msg += `🔴 <b>Top Overdue:</b>\n` + overdue.slice(0, 5).map(t => `  <code>${t.ticket}</code> ${t.name.slice(0, 30)} (${t.assignee})`).join('\n') + '\n\n';
    }
    if (dueWeek.length) {
      msg += `📅 <b>Due This Week:</b>\n` + dueWeek.slice(0, 5).map(t => `  <code>${t.ticket}</code> ${t.name.slice(0, 30)} — ${t.target_date.slice(5)}`).join('\n');
    }
    return send(chatId, msg);
  }

  // /pipeline
  if (lower === '/pipeline') {
    const pipeline = await getBizData('pipeline');
    if (!pipeline.length) return send(chatId, '🏢 Pipeline is empty.');
    const stages = {};
    pipeline.forEach(p => { const s = p.stage || 'lead'; if (!stages[s]) stages[s] = []; stages[s].push(p); });
    const icons = { lead: '🔵', 'pre-sales': '🟣', 'offer-sent': '🟡', active: '🟢', 'pre-active': '🔷' };
    let msg = '🏢 <b>Sales Pipeline</b>\n\n';
    Object.entries(stages).forEach(([stage, leads]) => {
      msg += `${icons[stage] || '⚪'} <b>${stage.toUpperCase()}</b> (${leads.length})\n`;
      leads.slice(0, 3).forEach(l => { msg += `  → ${l.client_name}${l.estimated_value_chf ? ' · CHF ' + Number(l.estimated_value_chf).toLocaleString('de-CH') : ''}\n`; });
      if (leads.length > 3) msg += `  <i>+ ${leads.length - 3} more</i>\n`;
      msg += '\n';
    });
    return send(chatId, msg);
  }

  // /offers — removed (feature deleted), redirect to pipeline
  if (lower === '/offers') {
    return handleCommand(chatId, '/pipeline');
  }

  // /create [title] — full ticket creation (guided wizard OR quick inline)
  if (lower.startsWith('/create ')) {
    let title = text.slice(8).trim();
    if (!title) return send(chatId, '⚠️ Usage: <code>/create Ticket title here</code>\nOptional: <code>assign:FK priority:high due:+7</code>');
    // Check for inline modifiers — if none, start guided wizard
    const hasModifiers = title.match(/\b(assign|priority|due):/i);
    if (!hasModifiers) {
      // Auto-detect project from title
      let project = 'C2M';
      if (title.match(/MFB|Med For Balance/i)) project = 'MFB';
      else if (title.match(/C2I|internal/i)) project = 'C2I';
      else if (title.match(/MACL/i)) project = 'MACL';

      await _setWizard(userId, { type: 'ticket', step: 'priority', data: { title, project } });
      return sendWithButtons(chatId,
        `📝 <b>Creating ticket:</b>\n<i>${title}</i>\n📁 ${project}\n\n🏷 What priority?`,
        [
          [{ text: '🔴 Urgent', callback_data: 'wiz:assignee:urgent' }, { text: '🟡 High', callback_data: 'wiz:assignee:high' }],
          [{ text: '🔵 Medium', callback_data: 'wiz:assignee:medium' }, { text: '⚪ Low', callback_data: 'wiz:assignee:low' }]
        ]
      );
    }
    // Parse inline modifiers: assign:FK priority:high due:+7
    let createAssignee = telegramMember(String(chatId)), createPriority = 'medium', createDueDays = 14;
    title = title.replace(/\bassign:(CTI|FK)\b/i, (_, a) => { createAssignee = a.toUpperCase(); return ''; })
                 .replace(/\bpriority:(urgent|high|medium|low)\b/i, (_, p) => { createPriority = p.toLowerCase(); return ''; })
                 .replace(/\bdue:\+(\d+)\b/i, (_, d) => { createDueDays = parseInt(d); return ''; })
                 .trim();
    await send(chatId, `⚡ Creating: <i>${title}</i>...`);
    try {
      // Use chat.js createTicket for full hygiene (module, cycle, customer auto-detection)
      const q = Math.ceil((new Date().getMonth() + 1) / 3);
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + createDueDays);
      const chatPayload = {
        createTicket: {
          name: title, project: 'C2M', priority: createPriority, assignee: createAssignee,
          start_date: new Date().toISOString().slice(0, 10),
          due_date: dueDate.toISOString().slice(0, 10),
          cycle: `Q${q} ${new Date().getFullYear()}`
        }
      };
      // Detect project/client from title
      if (title.match(/MFB|Med For Balance/i)) chatPayload.createTicket.project = 'MFB';
      if (title.match(/C2I|internal/i)) chatPayload.createTicket.project = 'C2I';
      if (title.match(/MACL/i)) chatPayload.createTicket.project = 'MACL';
      if (title.match(/ExeoFlow|Exeo|EXEO/i)) chatPayload.createTicket.project = 'C2I';
      // Detect module from keywords
      const tl = title.toLowerCase();
      if (tl.match(/video|film|shoot|dreh|fpv|drone/)) chatPayload.createTicket.module = 'Videography';
      else if (tl.match(/photo|foto/)) chatPayload.createTicket.module = 'Photography';
      else if (tl.match(/web|site|page/)) chatPayload.createTicket.module = 'Website Creation';
      else if (tl.match(/social|instagram|tiktok|reel/)) chatPayload.createTicket.module = 'Social Media';
      else if (tl.match(/ads|meta|google|kampagne|campaign/)) chatPayload.createTicket.module = 'Marketing';
      else if (tl.match(/design|brand|logo/)) chatPayload.createTicket.module = 'Sales';

      const r = await new Promise((resolve) => {
        const projId = PROJ_IDS[chatPayload.createTicket.project] || PROJ_IDS.C2M;
        // Plane.so API uses string priorities: "urgent","high","medium","low","none"
        const priStr = chatPayload.createTicket.priority || 'medium';
        const assigneeKey = chatPayload.createTicket.assignee || 'CTI';
        const assigneeId = Object.entries(TEAM_IDS).find(([,v]) => v === assigneeKey)?.[0];
        const issuePay = {
          name: title, priority: priStr,
          start_date: chatPayload.createTicket.start_date,
          target_date: chatPayload.createTicket.due_date,
          ...(assigneeId ? { assignees: [assigneeId] } : {})
        };
        const issOpts = {
          hostname: 'api.plane.so', path: `/api/v1/workspaces/${WORKSPACE}/projects/${projId}/issues/`, method: 'POST',
          headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(issuePay)) }
        };
        let data = '';
        const req = https.request(issOpts, res => {
          res.on('data', d => data += d);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
        });
        req.on('error', () => resolve({}));
        req.write(JSON.stringify(issuePay)); req.end();
      });
      if (r?.id) {
        const projId = PROJ_IDS[chatPayload.createTicket.project];
        const ticketRef = `${chatPayload.createTicket.project}-${r.sequence_id}`;
        // Queue Obsidian work item note
        _queueObsidianWrite('work-item', {
          ticket: ticketRef, name: title, client: chatPayload.createTicket.project,
          priority: chatPayload.createTicket.priority, state: 'Todo',
          assignee: chatPayload.createTicket.assignee, due: chatPayload.createTicket.due_date,
          start: chatPayload.createTicket.start_date, project: chatPayload.createTicket.project,
        });
        return sendWithButtons(chatId,
          `✅ <b>Ticket Created</b>\n\n📌 <code>${ticketRef}</code>\n📝 ${title}\n📅 Due: ${chatPayload.createTicket.due_date}\n🏷 ${chatPayload.createTicket.module || 'No module'}`,
          [[{ text: '↗ Open in Plane.so', url: `https://app.plane.so/${WORKSPACE}/projects/${projId}/issues/${r.id}/` }]]
        );
      }
      return send(chatId, `⚠️ Creation failed: ${JSON.stringify(r).slice(0, 100)}`);
    } catch (e) { return send(chatId, `⚠️ Error: ${e.message}`); }
  }

  // /review — start AI-guided ticket review
  if (lower.startsWith('/review')) {
    const arg = text.slice(7).trim().toLowerCase();
    const d = await getCachedData(true);
    const active = d.issues.filter(i => !['completed', 'cancelled'].includes(i.group));
    let tickets = [], filterName = 'all active';
    if (arg.includes('overdue') || !arg) {
      tickets = active.filter(i => i.target_date && i.target_date < new Date().toISOString().slice(0, 10)).sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''));
      filterName = 'overdue';
    } else if (arg.includes('urgent') || arg.includes('high')) {
      tickets = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
      filterName = 'urgent/high';
    } else if (arg.includes('stale')) {
      tickets = active.filter(i => i.updated_at && (Date.now() - new Date(i.updated_at).getTime()) > 14 * 86400000);
      filterName = 'stale';
    } else if (arg.includes('unassigned')) {
      tickets = active.filter(i => i.assignee === 'unassigned');
      filterName = 'unassigned';
    } else if (arg) {
      // Filter by client/project name
      tickets = active.filter(i => i.name.toLowerCase().includes(arg) || i.proj.toLowerCase() === arg || i.ticket.toLowerCase().includes(arg));
      filterName = arg;
    }
    if (!tickets.length) return send(chatId, `✅ No ${filterName} tickets to review!`);
    tickets = tickets.slice(0, 20); // max 20 per review
    _startReview(String(chatId), tickets, filterName);
    await send(chatId, `📋 <b>Starting ${filterName} review — ${tickets.length} tickets</b>\n\nFor each ticket, tell me what to do:\n• <b>skip</b> — leave as is\n• <b>done</b> — mark completed\n• <b>friday/monday/+3</b> — reschedule\n• <b>fanny/claudio</b> — reassign\n• <b>urgent/high/low</b> — reprioritize\n• Say <b>done</b> anytime to finish + apply\n\nLet's go! 👇`);
    const session = _getReview(String(chatId));
    await _showReviewTicket(chatId, session);
    return;
  }

  // Check for pending email actions
  if (_pendingEmails[userId]) {
    const pe = _pendingEmails[userId];
    if (lower === 'send' || lower === 'yes') {
      await send(chatId, '⟳ Sending email…');
      const result = await _sendInternalMail(pe.to, pe.subject, pe.bodyHtml);
      delete _pendingEmails[userId];
      return send(chatId, `✅ Done${result}`);
    }
    if (lower === 'preview') {
      return send(chatId, `📧 <b>Email Preview</b>\n\n<b>To:</b> ${pe.to}\n<b>Subject:</b> ${pe.subject}\n\n${pe.preview}\n\n💡 Type <b>send</b> to send, <b>skip</b> to cancel`);
    }
    if (lower === 'skip' || lower === 'cancel') {
      delete _pendingEmails[userId];
      return send(chatId, '📧 Email cancelled.');
    }
    if (lower.startsWith('edit ')) {
      // Replace email body with custom text
      const customText = text.slice(5).trim();
      pe.bodyHtml = `<p>Hi Fanny,</p><p>${customText.replace(/\n/g,'<br>')}</p><p>— EXEO COO Assistant</p>`;
      pe.preview = customText;
      return send(chatId, `📧 Email updated. Preview:\n\n<i>${customText.slice(0,200)}</i>\n\nType <b>send</b> to send or <b>skip</b> to cancel`);
    }
    // Show reminder about pending email
    await send(chatId, `📧 You have a pending email for ${pe.to}\nType: <b>preview</b> · <b>send</b> · <b>edit [new text]</b> · <b>skip</b>`);
  }

  // Check if user is in a review session
  if (_getReview(userId)) {
    const d = await getCachedData();
    const handled = await _handleReviewResponse(chatId, userId, text, d);
    if (handled) return;
  }

  // ── Proactive question generator — appended to AI responses when relevant ──
  function _generateProactiveQuestion(data) {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);

    // Stale clients (>18 days inactive)
    const stale = (data.clientSummaries || []).filter(c => c.status === 'active' && c.active === 0);
    if (stale.length) {
      const c = stale[0];
      return `💡 <i>By the way — ${c.code} (${c.name?.slice(0, 20)}) has no active tickets. Want me to draft a follow-up?</i>`;
    }

    // Tickets due tomorrow still in backlog
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dueTomBacklog = (data.issues || []).filter(i =>
      i.target_date === tomorrow && (i.group === 'backlog' || i.state === 'Backlog' || i.state === 'Todo') && !['completed', 'cancelled'].includes(i.group)
    );
    if (dueTomBacklog.length > 0) {
      return `💡 <i>${dueTomBacklog.length} ticket${dueTomBacklog.length > 1 ? 's' : ''} due tomorrow still in backlog — want to reschedule or start?</i>`;
    }

    // Workload imbalance
    const loads = Object.entries(data.teamLoad || {});
    if (loads.length >= 2) {
      const max = loads.reduce((a, b) => a[1].active > b[1].active ? a : b);
      const min = loads.reduce((a, b) => a[1].active < b[1].active ? a : b);
      if (max[1].active > 2 * min[1].active && max[1].active > 15) {
        return `💡 <i>${max[0]} has ${max[1].active} tickets vs ${min[0]} with ${min[1].active} — want to rebalance?</i>`;
      }
    }

    return null; // no proactive question this time
  }

  // ── TOOL EXECUTION — executes tool calls from Claude API tool_use ──
  async function _executeTool(toolName, input, dashData) {
    const d = dashData;
    switch (toolName) {
      case 'search_tickets': {
        const q = (input.query || '').toLowerCase();
        const matches = d.issues.filter(i => {
          const n = (i.name || '').toLowerCase();
          return n.includes(q) || i.ticket.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q) || (i.assignee || '').toLowerCase().includes(q);
        }).slice(0, 8);
        return matches.length
          ? matches.map(t => `${t.ticket}: "${t.name}" [${t.state}] ${t.priority} → ${t.assignee} due:${t.target_date || 'none'}`).join('\n')
          : `No tickets found for "${input.query}"`;
      }
      case 'create_ticket': {
        const q = Math.ceil((new Date().getMonth() + 1) / 3);
        const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + (input.due_days || 14));
        const proj = input.project || 'C2M';
        const projId = PROJ_IDS[proj] || PROJ_IDS.C2M;
        const assigneeKey = input.assignee || 'CTI';
        const assigneeId = Object.entries(TEAM_IDS).find(([, v]) => v === assigneeKey)?.[0] || Object.keys(TEAM_IDS)[0];
        try {
          const created = await planePOST(`/workspaces/${WORKSPACE}/projects/${projId}/issues/`, {
            name: input.title, priority: input.priority || 'medium',
            assignees: [assigneeId], start_date: new Date().toISOString().slice(0, 10),
            target_date: dueDate.toISOString().slice(0, 10),
            description_html: input.description ? `<p>${input.description}</p>` : '',
          });
          const ref = `${proj}-${created.sequence_id}`;
          _dashCache = null;
          _queueObsidianWrite('work-item', { ticket: ref, name: input.title, client: proj, priority: input.priority || 'medium', state: 'Todo', assignee: assigneeKey, due: dueDate.toISOString().slice(0, 10), start: new Date().toISOString().slice(0, 10), project: proj });
          return `✅ Created ${ref}: "${input.title}" [${input.priority || 'medium'}] → ${assigneeKey}, due ${dueDate.toISOString().slice(0, 10)}. URL: https://app.plane.so/${WORKSPACE}/projects/${projId}/issues/${created.id}/`;
        } catch (e) { return `❌ Failed: ${e.message}`; }
      }
      case 'update_ticket': {
        const ticket = d.issues.find(i => i.ticket === input.ticket_ref?.toUpperCase());
        if (!ticket) return `Ticket ${input.ticket_ref} not found`;
        const projId = PROJ_IDS[ticket.proj];
        _dashCache = null;
        if (input.field === 'priority') {
          await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { priority: input.value });
          _queueObsidianWrite('work-item-update', { ticket: input.ticket_ref, field: 'priority', value: input.value });
          return `Updated ${input.ticket_ref} priority → ${input.value}`;
        }
        if (input.field === 'due_date') {
          await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { target_date: input.value });
          _queueObsidianWrite('work-item-update', { ticket: input.ticket_ref, field: 'due', value: input.value });
          return `Updated ${input.ticket_ref} due date → ${input.value}`;
        }
        if (input.field === 'assignee') {
          const aid = Object.entries(TEAM_IDS).find(([, v]) => v === input.value.toUpperCase())?.[0];
          if (aid) await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { assignees: [aid] });
          return `Assigned ${input.ticket_ref} → ${input.value}`;
        }
        if (input.field === 'note') {
          const ts = new Date().toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          const existing = ticket.description || '';
          await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { description_html: `<p>${(existing + '\n\n---\n📝 [' + ts + '] ' + input.value).replace(/\n/g, '<br>')}</p>` });
          _queueObsidianWrite('work-item-note', { ticket: input.ticket_ref, note: input.value, timestamp: ts });
          return `Note added to ${input.ticket_ref}: "${input.value}"`;
        }
        return `Unknown field: ${input.field}`;
      }
      case 'mark_done': {
        const ticket = d.issues.find(i => i.ticket === input.ticket_ref?.toUpperCase());
        if (!ticket) return `Ticket ${input.ticket_ref} not found`;
        const projId = PROJ_IDS[ticket.proj];
        const states = await planeGet(`/workspaces/${WORKSPACE}/projects/${projId}/states/`);
        const stateList = states.results || states.data || (Array.isArray(states) ? states : []);
        const doneState = stateList.find(s => s.group === 'completed');
        if (!doneState) return `No completed state found for ${ticket.proj}`;
        await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { state: doneState.id });
        _dashCache = null;
        _queueObsidianWrite('work-item-update', { ticket: input.ticket_ref, field: 'state', value: 'Done' });
        return `✅ ${input.ticket_ref} marked as completed`;
      }
      case 'get_client_context': {
        const name = input.client_name;
        const clientTickets = d.issues.filter(i => {
          const n = (i.name || '').toLowerCase();
          return n.includes(name.toLowerCase().split(' ')[0]) && !['completed', 'cancelled'].includes(i.group);
        });
        const ov = clientTickets.filter(i => i.target_date && i.target_date < new Date().toISOString().slice(0, 10));
        const cs = (d.clientSummaries || []).find(c => c.name?.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
        let ctx = `Client: ${name}\nOpen tickets: ${clientTickets.length}, Overdue: ${ov.length}\n`;
        if (cs) ctx += `Health: ${cs.health}/100, Revenue: CHF ${cs.revenue || 0}/mo, Status: ${cs.status}\n`;
        ctx += `\nTop tickets:\n${clientTickets.slice(0, 8).map(t => `  ${t.ticket}: "${t.name.slice(0, 40)}" [${t.state}] ${t.priority} → ${t.assignee}`).join('\n')}`;
        return ctx;
      }
      case 'get_dashboard_kpis': {
        return `KPIs (${new Date().toISOString().slice(0, 10)}):\nTotal: ${d.total} | Active: ${d.active} | Done: ${d.done}\nOverdue: ${(d.overdue || []).length} | Urgent/High: ${(d.urgent || []).length}\nDue this week: ${(d.dueThisWeek || []).length}\nVelocity: ${d.completedThisWeek} this week (${d.velocityTrend > 0 ? '+' : ''}${d.velocityTrend}%)\nHygiene: ${d.hygiene}%\n\nTeam:\n${Object.entries(d.teamLoad || {}).map(([k, v]) => `  ${k}: ${v.active} active, ${v.overdue} overdue, ${v.thisWeek} this week`).join('\n')}`;
      }
      case 'reschedule_overdue': {
        let newDate = input.target_date;
        const now = new Date();
        if (newDate === 'friday') { const dt = new Date(); dt.setDate(dt.getDate() + (5 - dt.getDay() + 7) % 7 || 7); newDate = dt.toISOString().slice(0, 10); }
        else if (newDate === 'monday') { const dt = new Date(); dt.setDate(dt.getDate() + (8 - dt.getDay()) % 7 || 7); newDate = dt.toISOString().slice(0, 10); }
        else if (newDate.startsWith('+')) { const dt = new Date(); dt.setDate(dt.getDate() + parseInt(newDate.slice(1))); newDate = dt.toISOString().slice(0, 10); }
        const overdue = d.issues.filter(i => i.target_date && i.target_date < now.toISOString().slice(0, 10) && !['completed', 'cancelled'].includes(i.group));
        let count = 0;
        for (const t of overdue.slice(0, 15)) {
          try { await planePatch(`/workspaces/${WORKSPACE}/projects/${PROJ_IDS[t.proj]}/issues/${t.id}/`, { target_date: newDate }); count++; } catch {}
        }
        _dashCache = null;
        return `Rescheduled ${count}/${overdue.length} overdue tickets to ${newDate}`;
      }
      case 'send_email': {
        const result = await _sendInternalMail(input.to, input.subject, input.body);
        return result.includes('sent') ? `Email sent to ${input.to}: "${input.subject}"` : result;
      }
      case 'read_obsidian_note': {
        // Read via blob queue pattern — return a note about using Obsidian MCP in Claude Code
        return `Note path: ${input.path}\nTo read Obsidian notes directly, use the Obsidian MCP in Claude Code. From Telegram, I can search tickets and client data via Plane.so.`;
      }
      case 'create_pipeline_lead': {
        try {
          const leadData = { id: 'lead_' + Date.now(), client_name: input.client_name, stage: 'lead', offer_value: input.value || 0, services_interested: input.services ? input.services.split(',').map(s => s.trim()) : [], notes: 'Created via Telegram AI', created_at: new Date().toISOString() };
          const dashUrl = process.env.URL || 'https://ops.c2moviez.com';
          await new Promise(resolve => {
            const payload = JSON.stringify({ action: 'pipeline.save', data: leadData });
            const opts = { hostname: new URL(dashUrl).hostname, path: '/.netlify/functions/production-hub', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
            const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
            req.on('error', () => resolve()); req.write(payload); req.end();
          });
          return `Pipeline lead created: ${input.client_name} (${input.services || 'TBD'}) · CHF ${input.value || 0}`;
        } catch (e) { return `Failed: ${e.message}`; }
      }
      case 'create_calendar_event': {
        // Parse date
        let eventDate = input.date;
        const now = new Date();
        if (eventDate === 'tomorrow') { const dt = new Date(); dt.setDate(dt.getDate() + 1); eventDate = dt.toISOString().slice(0, 10); }
        else if (eventDate === 'today') eventDate = now.toISOString().slice(0, 10);
        else if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(eventDate)) {
          const days = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
          const target = days[eventDate.slice(0, 3).toLowerCase()];
          const dt = new Date(); const diff = (target - dt.getDay() + 7) % 7 || 7;
          dt.setDate(dt.getDate() + diff); eventDate = dt.toISOString().slice(0, 10);
        }
        else if (/^next\s+(mon|tue|wed|thu|fri|sat|sun)/i.test(eventDate)) {
          const dayName = eventDate.match(/next\s+(\w+)/i)[1];
          const days = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
          const target = days[dayName.slice(0, 3).toLowerCase()];
          const dt = new Date(); const diff = (target - dt.getDay() + 7) % 7 + 7;
          dt.setDate(dt.getDate() + diff); eventDate = dt.toISOString().slice(0, 10);
        }
        else if (/^\+\d+$/.test(eventDate)) { const dt = new Date(); dt.setDate(dt.getDate() + parseInt(eventDate.slice(1))); eventDate = dt.toISOString().slice(0, 10); }

        const dur = input.duration_min || 60;
        const [sh, sm] = (input.start_time || '09:00').split(':').map(Number);
        const endH = Math.floor((sh * 60 + sm + dur) / 60);
        const endM = (sh * 60 + sm + dur) % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

        try {
          // Get M365 token
          const tenantId = process.env.M365_TENANT_ID;
          const clientId = process.env.M365_CLIENT_ID;
          const clientSecret = process.env.M365_CLIENT_SECRET;
          const senderEmail = process.env.M365_EMAIL_CTI || 'claudio@c2moviez.com';
          const tokenBody = `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default`;
          const tokenR = await new Promise(resolve => {
            const opts = { hostname: 'login.microsoftonline.com', path: `/${tenantId}/oauth2/v2.0/token`, method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) } };
            let d = ''; const req = https.request(opts, res => { res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } }); });
            req.on('error', () => resolve({})); req.write(tokenBody); req.end();
          });
          if (!tokenR.access_token) return 'Failed to authenticate with Microsoft 365';

          // Create event
          const eventPayload = JSON.stringify({
            subject: input.title,
            start: { dateTime: `${eventDate}T${input.start_time || '09:00'}:00`, timeZone: 'Europe/Zurich' },
            end: { dateTime: `${eventDate}T${endTime}:00`, timeZone: 'Europe/Zurich' },
            isAllDay: false, showAs: 'busy',
            ...(input.attendees ? { attendees: input.attendees.split(',').map(e => ({ emailAddress: { address: e.trim() }, type: 'required' })) } : {}),
            ...(input.client ? { categories: [input.client] } : {})
          });
          const createR = await new Promise(resolve => {
            const opts = { hostname: 'graph.microsoft.com', path: `/v1.0/users/${senderEmail}/calendar/events`, method: 'POST',
              headers: { 'Authorization': `Bearer ${tokenR.access_token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(eventPayload) } };
            let d = ''; const req = https.request(opts, res => { res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } }); });
            req.on('error', () => resolve({})); req.write(eventPayload); req.end();
          });
          if (createR.id) {
            _queueObsidianWrite('meeting-note', { client: input.client || input.title, date: eventDate, attendees: input.attendees ? input.attendees.split(',') : [] });
            return `📅 Calendar event created: "${input.title}" on ${eventDate} at ${input.start_time} (${dur}min)`;
          }
          return `Failed to create event: ${JSON.stringify(createR.error || createR).slice(0, 100)}`;
        } catch (e) { return `Calendar error: ${e.message}`; }
      }
      case 'save_commitment': {
        let deadline = input.deadline;
        const now = new Date();
        if (deadline === 'tomorrow') { const dt = new Date(); dt.setDate(dt.getDate() + 1); deadline = dt.toISOString().slice(0, 10); }
        else if (deadline === 'today') deadline = now.toISOString().slice(0, 10);
        else if (/^(mon|tue|wed|thu|fri)/i.test(deadline)) {
          const days = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
          const target = days[deadline.slice(0, 3).toLowerCase()] || 5;
          const dt = new Date(); const diff = (target - dt.getDay() + 7) % 7 || 7;
          dt.setDate(dt.getDate() + diff); deadline = dt.toISOString().slice(0, 10);
        }
        else if (deadline === 'next week') { const dt = new Date(); dt.setDate(dt.getDate() + (8 - dt.getDay()) % 7 || 7); deadline = dt.toISOString().slice(0, 10); }
        else if (/^\+\d+$/.test(deadline)) { const dt = new Date(); dt.setDate(dt.getDate() + parseInt(deadline.slice(1))); deadline = dt.toISOString().slice(0, 10); }

        const existing = await _blobGet('telegram-state', `commitments--${deadline}`) || [];
        const list = Array.isArray(existing) ? existing : [];
        list.push({ commitment: input.commitment, deadline, client: input.client || null, created_at: now.toISOString(), fulfilled: false });
        await _blobPut('telegram-state', `commitments--${deadline}`, list);
        return `📌 Commitment tracked: "${input.commitment}" — due ${deadline}${input.client ? ` (${input.client})` : ''}. I'll remind you.`;
      }
      case 'update_client_note': {
        const ts = new Date().toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        _queueObsidianWrite('feedback-note', { kuerzel: input.client_code, note: input.note, timestamp: ts, source: 'telegram' });

        // Also sync structured data to Plane.so customer if it's a field update
        let planeSynced = '';
        try {
          const noteL = (input.note || '').toLowerCase();
          // Detect if this is a structured field update (email, website, etc.)
          const emailMatch = input.note.match(/[\w.-]+@[\w.-]+\.\w+/);
          const urlMatch = input.note.match(/https?:\/\/[\w.-]+\.\w+[^\s]*/);

          if (emailMatch || urlMatch) {
            // Find customer in Plane.so
            const custRes = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=100`);
            const custList = custRes?.results || custRes?.data || (Array.isArray(custRes) ? custRes : []);
            const matched = custList.find(c => (c.name || '').toLowerCase().includes(input.client_code.toLowerCase()));

            if (matched) {
              const patch = {};
              if (emailMatch) patch.email = emailMatch[0];
              if (urlMatch) patch.website = urlMatch[0];
              if (Object.keys(patch).length) {
                await planePatch(`/workspaces/${WORKSPACE}/customers/${matched.id}/`, patch);
                planeSynced = ` + synced to Plane.so customer (${Object.keys(patch).join(', ')})`;
              }
            }
          }
        } catch {}

        // Also queue frontmatter update for structured fields
        if (input.note.match(/[\w.-]+@[\w.-]+\.\w+/)) {
          _queueObsidianWrite('client-update', { kuerzel: input.client_code, field: 'contact_email', value: input.note.match(/[\w.-]+@[\w.-]+\.\w+/)[0] });
        }

        return `📝 Updated ${input.client_code} notes: "${input.note.slice(0, 80)}"${planeSynced}`;
      }
      case 'plan_week': {
        if (input.action === 'show') {
          try {
            const plan = await getBlobDirect('plan.json');
            if (!plan) return 'No weekly plan saved yet. Use the Dashboard Week Planner or ask me to autofill.';
            const member = 'CTI';
            let msg = `📅 This week's plan (${member}):\n`;
            const today = new Date();
            for (let i = 0; i < 5; i++) {
              const dt = new Date(today); dt.setDate(today.getDate() - today.getDay() + 1 + i);
              const dayStr = `day_${dt.toISOString().slice(0, 10)}`;
              const items = plan[member]?.[dayStr] || [];
              const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
              msg += `\n<b>${dayName} ${dt.toISOString().slice(5, 10)}</b>: ${items.length ? items.length + ' items' : '—'}`;
            }
            return msg;
          } catch { return 'Could not load plan.'; }
        }
        if (input.action === 'autofill') {
          return 'Auto-fill triggered. Open ops.c2moviez.com → Week Planner → click "⚡ Auto-fill" to populate, or ask me to schedule specific tickets to specific days.';
        }
        return `Plan action "${input.action}" not supported yet via Telegram. Use the Dashboard Week Planner for drag-drop scheduling.`;
      }
      default: return `Unknown tool: ${toolName}`;
    }
  }

  // Free text / voice — intelligent AI with native tool_use
  const d = await getCachedData();

  // Add user message to persistent conversation
  await _addConv(userId, 'user', text);

  // ── Build deep operational context for COO brain ──
  const overdueTop = d.overdueList.slice(0, 6).map(t => `  ${t.ticket} "${t.name.slice(0,35)}" [${t.assignee}] due:${t.target_date}`).join('\n');
  const clientCtx = (d.clientSummaries || []).slice(0, 10).map(c => `  ${c.name}: ${c.active} active, ${c.overdue} overdue, health=${c.health}`).join('\n');
  const teamCtx = Object.entries(d.teamLoad || {}).map(([k, v]) => {
    const cap = Math.round((v.active || 0) / 30 * 100);
    return `  ${k}: ${v.active} active, ${v.overdue} overdue, ${v.thisWeek} this week, ${cap}% capacity`;
  }).join('\n');
  const riskCtx = (d.riskTickets || []).slice(0, 5).map(t => `  ⚠ ${t.ticket} "${t.name.slice(0,30)}" [${t.priority}/${t.state}] ${t.target_date ? 'due:' + t.target_date : 'no date'} → ${t.assignee}`).join('\n');

  const systemPrompt = `You are NEX, the COO-level AI operations assistant for c2moviez, a Swiss creative agency. (NEX is the agent — formerly named EXEO; both refer to you. NEXBRAIN = the vault. NEXBOX = the productized stack.)
You think like a chief operating officer — priorities, client relationships, team capacity, business impact.
You have TOOLS to take real actions. Use them proactively when the user's intent is clear.

TEAM: Claudio Tinner (CEO, CTI) · Fanny Kecskes (Marketing Manager, FK)
TODAY: ${new Date().toLocaleDateString('de-CH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

═══ LIVE STATUS ═══
${d.active} open (${(d.overdue||[]).length} overdue, ${(d.urgent||[]).length} urgent) · Velocity: ${d.completedThisWeek} this week (${d.velocityTrend > 0 ? '+' : ''}${d.velocityTrend}%) · Hygiene: ${d.hygiene}%

═══ OVERDUE ═══
${overdueTop || '  ✓ None'}

═══ TEAM ═══
${teamCtx || '  No data'}

═══ CLIENTS ═══
${clientCtx || '  No data'}

═══ RISKS ═══
${riskCtx || '  ✓ None'}

RULES:
- Use tools to EXECUTE actions, not just describe them. If user says "create a ticket for X" → call create_ticket.
- If user asks about a client → call get_client_context for data, then respond with insights.
- Be proactive: suggest next steps, flag risks, recommend delegation.
- Use HTML: <b>bold</b>, <i>italic</i>, <code>ticket refs</code>
- Use emojis: 🔴 overdue, 🟡 urgent, 🟢 healthy, ⚠️ risk, ✅ done, 📊 stats
- Reply in ENGLISH unless user writes German.
- Be concise (200-600 chars) but specific — reference actual ticket IDs and dates.

FEEDBACK ROUTING (CRITICAL — do this automatically):
When the user provides feedback about a client or meeting:
1. Detect which client from context (name, code, or conversation history)
2. Call update_client_note to append feedback to their Obsidian note
   → This ALSO auto-syncs emails and URLs to the Plane.so customer record
   → And updates Obsidian frontmatter fields (contact_email, website)
3. If action items detected ("send proposal", "redesign page") → call create_ticket
4. If commitment detected ("I'll send by Friday", "need to follow up") → call save_commitment
5. Do ALL routing automatically. Confirm: "Updated {client} notes + Plane.so, created ticket X, tracking commitment for Friday."

CROSS-SYSTEM SYNC:
When user provides structured data (email, website, revenue, contract info):
- Obsidian client note gets updated (frontmatter + notes section)
- Plane.so customer record gets updated (email, website fields)
- Everything stays in sync across all systems automatically.

CALENDAR MANAGEMENT:
When user says "schedule meeting", "book a call", "add to calendar" → call create_calendar_event.
Parse natural language: "meeting with SHIPSTER tomorrow at 2pm" → title=SHIPSTER Meeting, date=tomorrow, start_time=14:00.

PROACTIVE INTELLIGENCE:
After answering, consider suggesting:
- Upcoming deadlines that need prep ("ALPHAVIVO due in 2 weeks — time for review?")
- Stale clients that need follow-up ("No activity on GANZ in 15 days")
- Meetings that need scheduling based on project timelines`;

  // Build conversation (persistent memory — limit to last 6 messages to stay under token limits)
  const conv = await _getConv(userId);
  const messages = conv.slice(-6).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content || '') }));

  // Call Claude with tools — wrapped in try/catch for resilience
  let reply = '';
  try {
    let result = await askClaudeWithTools(systemPrompt, messages);

    // Check for API errors
    if (result?.error || result?.type === 'error') {
      const errMsg = result?.error?.message || JSON.stringify(result?.error || result).slice(0, 150);
      console.error('[Telegram] Claude API error:', errMsg);
      // If token limit exceeded, fall back to simple askClaude without tools
      if (errMsg.includes('token') || errMsg.includes('length') || errMsg.includes('too long')) {
        const fallback = await askClaude(systemPrompt.slice(0, 2000), messages.slice(-4));
        reply = fallback?.content?.[0]?.text || 'Sorry, context too large. Use /status or /briefing.';
      } else {
        reply = `⚠️ AI error: ${errMsg.slice(0, 80)}. Try /status or a shorter question.`;
      }
    } else {
      // Process response — may contain text AND tool_use blocks
      for (let turn = 0; turn < 3; turn++) {
        const content = result?.content || [];
        const textBlocks = content.filter(b => b.type === 'text');
        const toolBlocks = content.filter(b => b.type === 'tool_use');

        if (textBlocks.length) reply += textBlocks.map(b => b.text).join('\n');
        if (!toolBlocks.length) break;

        // Execute tool calls
        const toolResults = [];
        for (const tool of toolBlocks) {
          console.log(`[Telegram] Tool: ${tool.name}(${JSON.stringify(tool.input).slice(0, 80)})`);
          let toolResult;
          try {
            toolResult = await _executeTool(tool.name, tool.input, d);
          } catch (e) {
            toolResult = `Error: ${e.message}`;
          }
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: resultStr });
        }

        // Send tool results back to Claude — fresh messages (not conversation history)
        result = await askClaudeWithTools(systemPrompt, [
          ...messages,
          { role: 'assistant', content },
          { role: 'user', content: toolResults }
        ]);
      }

      // Final text from Claude after tool execution
      const finalText = (result?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (finalText && !reply.includes(finalText)) reply = (reply ? reply + '\n\n' : '') + finalText;
    }
  } catch (e) {
    console.error('[Telegram] Tool-use loop error:', e.message);
    reply = `⚠️ Error: ${e.message?.slice(0, 100)}. Try a /command instead.`;
  }

  if (!reply) reply = 'No response — try asking again or use /status.';

  // Convert markdown bold to HTML and ticket refs to code
  reply = reply.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  reply = reply.replace(/\b([A-Z]{2,4}-\d+)\b/g, '<code>$1</code>');

  // Add AI response to persistent memory
  await _addConv(userId, 'assistant', reply.slice(0, 1500));

  // Append proactive follow-up
  const proQ = _generateProactiveQuestion(d);
  if (proQ) reply += '\n\n' + proQ;

  // Truncate for Telegram (4096 char limit)
  if (reply.length > 4000) reply = reply.slice(0, 3950) + '\n<i>…(truncated)</i>';

  return send(chatId, reply);
}


// ── Webhook handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Not allowed' };

  // ── Webhook secret_token validation ──
  // Telegram includes X-Telegram-Bot-Api-Secret-Token in every webhook call
  // when a secret_token was set via setWebhook. This is the official anti-spoof
  // mechanism — gating only on `from.id` is insufficient because that field
  // can be forged in a fake POST. Guard is conditional so it degrades
  // gracefully when the env var is unset (no immediate prod break).
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
  if (secretToken) {
    const incoming = event.headers['x-telegram-bot-api-secret-token'] ||
                     event.headers['X-Telegram-Bot-Api-Secret-Token'] || '';
    if (incoming !== secretToken) {
      return { statusCode: 403, body: JSON.stringify({ error: 'invalid webhook token' }) };
    }
  }

  try {
    // Sync team members on first call
    await syncTeamIds();

    const update = JSON.parse(event.body || '{}');

    // Push notification from dashboard
    if (update.notify) {
      const n = update.notify;
      for (const userId of ALLOWED_USERS) {
        if (n.buttons) await sendWithButtons(userId, n.text, n.buttons);
        else await send(userId, n.text);
      }
      return { statusCode: 200, body: 'notified' };
    }

    // Meeting ticket proposals from analyzeMeeting
    if (update.meetingProposal) {
      const p = update.meetingProposal;
      const tickets = p.tickets || [];
      if (tickets.length) {
        let msg = `📝 <b>Meeting Analysis — ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} proposed</b>\n\n`;
        msg += `🏢 <b>${p.client || 'Unknown'}</b> · ${p.date || 'Today'}\n`;
        if (p.summary) msg += `\n📋 <i>${p.summary.slice(0, 200)}</i>\n`;
        msg += '\n';
        const buttons = [];
        for (let i = 0; i < tickets.length; i++) {
          const t = tickets[i];
          const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[t.priority] || '🔵';
          msg += `<b>${i + 1}.</b> ${emo} ${t.title || 'Untitled'}\n`;
          if (t.reasoning) msg += `   <i>${t.reasoning.slice(0, 80)}</i>\n`;
          if (t.duplicate_of) msg += `   ⚠️ Possible duplicate of ${t.duplicate_of}\n`;
          msg += '\n';
          // Store proposal persistently (survives cold starts)
          const key = `mp_${Date.now()}_${i}`;
          await _saveMeetingProposal(key, { ...t, client: p.client, project: t.project || 'C2M' });
          buttons.push([
            { text: `✅ Create #${i + 1}`, callback_data: `mtgcreate:${key}` },
            { text: `❌ Skip`, callback_data: `mtgskip:${key}` }
          ]);
        }
        for (const userId of ALLOWED_USERS) {
          await sendWithButtons(userId, msg, buttons);
        }
      }
      return { statusCode: 200, body: 'proposals_sent' };
    }

    // ── Incoming message handling DISABLED ──
    // Incoming messages (text, voice, etc.) are handled by Claude Code MCP via long-polling.
    // This webhook only processes callback queries from scheduled briefings.
    // To re-enable incoming message handling, remove or comment out this early return.
    if (update.message && !update.callback_query) {
      return { statusCode: 200, body: 'ok' };
    }

    // Text message (disabled — Claude Code MCP handles incoming messages via long-polling)
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const userId = String(update.message.from?.id || '');
      // Security: only allowed users (empty list = allow all)
      if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(userId)) {
        await send(chatId, `🔒 Access denied.\nYour ID: <code>${userId}</code>\nAllowed: ${ALLOWED_USERS.length} users`);
        return { statusCode: 200, body: 'ok' };
      }
      try { await handleCommand(chatId, update.message.text); }
      catch (e) { await send(chatId, `⚠️ Error: ${(e.message||'unknown').slice(0,100)}`); }
    }

    // Voice message (disabled — Claude Code MCP handles incoming messages via long-polling)
    if (update.message?.voice) {
      const chatId = update.message.chat.id;
      const userId = String(update.message.from?.id || '');
      if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(userId)) {
        await send(chatId, '🔒 Access denied.');
        return { statusCode: 200, body: 'ok' };
      }
      await send(chatId, '🎙 Transcribing...');
      // Get file URL
      const fileInfo = await tg('getFile', { file_id: update.message.voice.file_id });
      const filePath = fileInfo.result?.file_path;
      if (!filePath) { await send(chatId, '⚠️ Could not download voice.'); return { statusCode: 200, body: 'ok' }; }
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
      // Transcribe
      const whisper = await transcribeVoice(fileUrl);
      const transcript = whisper.text || '';
      if (!transcript) { await send(chatId, '⚠️ No speech detected.'); return { statusCode: 200, body: 'ok' }; }
      await send(chatId, `🎙 <i>"${transcript}"</i>`);
      try { await handleCommand(chatId, transcript); }
      catch (e) { await send(chatId, `⚠️ Error: ${(e.message||'unknown').slice(0,100)}`); }
    }

    // Callback query (inline button press)
    if (update.callback_query) {
      const cbData = update.callback_query.data;
      const chatId = update.callback_query.message?.chat?.id;
      const userId = String(update.callback_query.from?.id || '');
      // Security: only allowed users may trigger callbacks (mtgcreate creates
      // Plane tickets — must not be exploitable by anyone who knows the bot).
      if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(userId)) {
        await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: '🔒 Access denied' });
        return { statusCode: 200, body: 'ok' };
      }
      await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      if (cbData && chatId) {
        // Handle meeting ticket proposal callbacks
        if (cbData.startsWith('mtgcreate:')) {
          const key = cbData.replace('mtgcreate:', '');
          const proposal = await _getMeetingProposal(key);
          if (!proposal) { await send(chatId, '⚠️ Proposal expired — try analyzing the meeting again.'); }
          else {
            await send(chatId, `⟳ Creating ticket: <b>${proposal.title}</b>...`);
            try {
              const q = Math.ceil((new Date().getMonth() + 1) / 3);
              const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 14);
              const projId = _PROJ_MAP[proposal.project] || _PROJ_MAP.C2M;
              const payload = {
                name: `${proposal.client} — ${proposal.title}`,
                project: proposal.project || 'C2M',
                priority: proposal.priority || 'medium',
                customer: proposal.client,
                start_date: new Date().toISOString().slice(0, 10),
                due_date: dueDate.toISOString().slice(0, 10),
                cycle: `Q${q} ${new Date().getFullYear()}`,
                module: proposal.module || 'Marketing',
                assignee: proposal.assignee || 'CTI',
                description: proposal.description || '',
              };
              const statesR = await planeGetAll(`/workspaces/${WORKSPACE}/projects/${projId}/states/`);
              let stateId;
              const todoState = statesR.find(s => s.name.toLowerCase() === 'todo');
              if (todoState) stateId = todoState.id;

              const assigneeId = Object.entries(TEAM_IDS).find(([, s]) => s === payload.assignee)?.[0] || Object.keys(TEAM_IDS)[0];
              const issueBody = {
                name: payload.name, priority: payload.priority,
                assignees: [assigneeId],
                start_date: payload.start_date,
                target_date: payload.due_date,
                description_html: `<p>${payload.description}</p><p><em>Created from meeting analysis</em></p>`,
              };
              if (stateId) issueBody.state = stateId;
              const created = await planePOST(`/workspaces/${WORKSPACE}/projects/${projId}/issues/`, issueBody);
              const ref = `${payload.project}-${created.sequence_id}`;
              await send(chatId, `✅ <b>${ref}</b> created\n\n${payload.name}\n${payload.priority} · ${payload.assignee} · due ${payload.due_date}`);
              // Queue Obsidian work item note
              _queueObsidianWrite('work-item', { ticket: ref, name: payload.name, client: payload.customer, priority: payload.priority, state: 'Todo', assignee: payload.assignee, due: payload.due_date, start: payload.start_date, project: payload.project });
              await _deleteMeetingProposal(key);
            } catch (e) {
              await send(chatId, `⚠️ Failed to create: ${e.message?.slice(0, 100)}`);
            }
          }
        } else if (cbData.startsWith('mtgskip:')) {
          const key = cbData.replace('mtgskip:', '');
          await _deleteMeetingProposal(key);
          await send(chatId, '⏭ Skipped.');
        }
        // ── Phase L: fact-ledger inline button handlers ──
        else if (cbData.startsWith('fact_confirm:')) {
          // Bump the new fact's confidence to 1.0 by re-asserting with
          // source 'ceo-confirmed'. The original new fact stays in the
          // chain as a now-superseded predecessor.
          const factId = cbData.replace('fact_confirm:', '');
          try {
            const supaUrl = process.env.SUPABASE_URL;
            const supaKey = process.env.SUPABASE_ANON_KEY;
            const fetchRow = async () => new Promise(resolve => {
              const u = new URL(`${supaUrl}/rest/v1/facts?id=eq.${factId}&select=*&limit=1`);
              require('https').get({ hostname: u.hostname, path: u.pathname + u.search,
                headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }, res => {
                let raw = ''; res.on('data', c => raw += c);
                res.on('end', () => { try { resolve(JSON.parse(raw)[0]); } catch { resolve(null); } });
              }).on('error', () => resolve(null));
            });
            const row = await fetchRow();
            if (!row) { await send(chatId, '⚠️ Fact not found.'); return { statusCode: 200, body: 'ok' }; }
            const callRpc = (fnName, payload) => new Promise(resolve => {
              const u = new URL(`${supaUrl}/rest/v1/rpc/${fnName}`);
              const b = JSON.stringify(payload);
              const r = require('https').request({ hostname: u.hostname, path: u.pathname, method: 'POST',
                headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } },
                res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve(raw ? JSON.parse(raw) : null)); });
              r.on('error', () => resolve(null)); r.write(b); r.end();
            });
            await callRpc('assert_fact', {
              p_subject_type: row.subject_type,
              p_subject_id:   row.subject_id,
              p_predicate:    row.predicate,
              p_value:        row.value,
              p_source:       'ceo-confirmed',
              p_actor:        'ceo',
              p_confidence:   1.0,
              p_rationale:    'Confirmed via Telegram inline button',
            });
            await send(chatId, `✓ Confirmed: <code>${row.subject_id}</code>/<b>${row.predicate}</b>`);
          } catch (e) {
            await send(chatId, `⚠️ Confirm failed: ${(e.message || 'unknown').slice(0, 100)}`);
          }
        }
        else if (cbData.startsWith('fact_rollback:')) {
          // cbData = "fact_rollback:<new_fact_id>:<old_fact_id>"
          const parts = cbData.split(':');
          const newId = parts[1];
          const oldId = parts[2];
          try {
            const supaUrl = process.env.SUPABASE_URL;
            const supaKey = process.env.SUPABASE_ANON_KEY;
            const callRpc = (fnName, payload) => new Promise(resolve => {
              const u = new URL(`${supaUrl}/rest/v1/rpc/${fnName}`);
              const b = JSON.stringify(payload);
              const r = require('https').request({ hostname: u.hostname, path: u.pathname, method: 'POST',
                headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } },
                res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve(raw ? JSON.parse(raw) : null)); });
              r.on('error', () => resolve(null)); r.write(b); r.end();
            });
            // Retract the new fact and re-assert the old value as authoritative.
            await callRpc('retract_fact', { p_fact_id: newId, p_reason: 'CEO rollback via TG', p_actor: 'ceo' });
            // Fetch the old row to re-assert its value
            const fetchRow = async () => new Promise(resolve => {
              const u = new URL(`${supaUrl}/rest/v1/facts?id=eq.${oldId}&select=*&limit=1`);
              require('https').get({ hostname: u.hostname, path: u.pathname + u.search,
                headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }, res => {
                let raw = ''; res.on('data', c => raw += c);
                res.on('end', () => { try { resolve(JSON.parse(raw)[0]); } catch { resolve(null); } });
              }).on('error', () => resolve(null));
            });
            const oldRow = await fetchRow();
            if (oldRow) {
              await callRpc('assert_fact', {
                p_subject_type: oldRow.subject_type,
                p_subject_id:   oldRow.subject_id,
                p_predicate:    oldRow.predicate,
                p_value:        oldRow.value,
                p_source:       'ceo-confirmed',
                p_actor:        'ceo',
                p_confidence:   1.0,
                p_rationale:    'Rolled back to previous value via TG',
              });
              await send(chatId, `↩ Rolled back: <code>${oldRow.subject_id}</code>/<b>${oldRow.predicate}</b>`);
            } else {
              await send(chatId, `↩ Retracted new fact (couldn't find old row to restore — manual re-assert needed)`);
            }
          } catch (e) {
            await send(chatId, `⚠️ Rollback failed: ${(e.message || 'unknown').slice(0, 100)}`);
          }
        }
        // ── Phase M2/M3: invoice review buttons ──
        // The finance MCP runs locally on the Mac (stdio, never exposes HTTP).
        // The TG callback handler can't dial localhost from Netlify, so we
        // queue the action via Supabase audit_log — the local
        // obsidian-queue-consumer (already realtime-subscribed to audit_log)
        // dispatches it to the finance MCP within ~500ms.
        else if (cbData.startsWith('inv_confirm:') || cbData.startsWith('inv_reject:')) {
          const action = cbData.startsWith('inv_confirm:') ? 'confirm' : 'reject';
          const invoiceId = cbData.replace(/^inv_(confirm|reject):/, '');
          try {
            const supaUrl = process.env.SUPABASE_URL;
            const supaKey = process.env.SUPABASE_ANON_KEY;
            const body = JSON.stringify({
              action: 'finance.queue.invoice_match_action',
              entity_type: 'invoice',
              entity_id: invoiceId,
              entity_name: `${action} ${invoiceId}`,
              actor: 'ceo',
              details: { invoice_id: invoiceId, action, source: 'telegram-button' },
              metadata: { source: 'telegram-callback', timestamp: Date.now() },
            });
            await new Promise(resolve => {
              const u = new URL(`${supaUrl}/rest/v1/audit_log`);
              const r = require('https').request({
                hostname: u.hostname, path: u.pathname, method: 'POST',
                headers: {
                  apikey: supaKey, Authorization: `Bearer ${supaKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal',
                  'Content-Length': Buffer.byteLength(body),
                },
              }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
              r.on('error', () => resolve());
              r.write(body); r.end();
            });
            const verb = action === 'confirm' ? '✓ Accepted' : '✗ Rejected';
            await send(chatId, `${verb}: <code>${invoiceId}</code> — local finance MCP processing…`);
          } catch (e) {
            await send(chatId, `⚠️ Queue write failed: ${(e.message || 'unknown').slice(0, 100)}`);
          }
        }
        else {
          try { await handleCommand(chatId, cbData); }
          catch (e) { await send(chatId, `⚠️ Error: ${(e.message||'unknown').slice(0,100)}`); }
        }
      }
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 200, body: 'ok' }; // Always return 200 to Telegram
  }
};

// ── Push notification sender (called via HTTP from dashboard) ──
// Also handles direct POST with {notify: {text, buttons}} in body
exports.notify = async function(text, buttons) {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) return;
  for (const userId of ALLOWED_USERS) {
    if (buttons) await sendWithButtons(userId, text, buttons);
    else await send(userId, text);
  }
};
