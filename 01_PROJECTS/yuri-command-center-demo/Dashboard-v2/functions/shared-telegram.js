/**
 * shared-telegram.js — Telegram Bot API helpers (single source of truth)
 *
 * Extracted from telegram.js, telegram-digest.js, telegram-proactive.js,
 * telegram-eod.js, telegram-weekly.js, telegram-prebrief.js, telegram-calendar-watch.js,
 * event-dispatch.js, and mcp-server.js to eliminate ~80 lines of duplicated code.
 *
 * All functions read TELEGRAM_BOT_TOKEN from process.env at call time.
 *
 * Language drift guard: NEX↔CEO must be English. Detect on send, audit, surface.
 * Detection is sync (zero added latency); audit log is fire-and-forget.
 */

const https = require('https');

// CEO Telegram chat_id. Kept in sync with TELEGRAM_ALLOWED_USERS / daemon priming.
const CEO_CHAT_ID = '8265895585';

// German markers: umlauts, ß, common formal/everyday function words. Case-insensitive.
// Tuned for low false-positive: a single umlaut OR two+ German function words.
const GERMAN_UMLAUT_RE = /[äöüÄÖÜß]/;
const GERMAN_WORD_RE  = /\b(?:sehr geehrte?r?|guten tag|grüße|liebe[srn]?|freundliche|mit freundlichen|der|die|das|und|nicht|wird|werden|wurde|ich|wir|nicht|sind|haben|hatten|kann|werden|für|über|durch|jedoch)\b/gi;

function isCEOChat(chatId) { return String(chatId) === CEO_CHAT_ID; }

function detectDrift(text) {
  if (!text) return false;
  if (GERMAN_UMLAUT_RE.test(text)) return true;
  const words = (text.match(GERMAN_WORD_RE) || []).length;
  return words >= 2;
}

// Fire-and-forget audit row. Never blocks send.
function auditDrift(chatId, text, opts) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return;
  try {
    const payload = JSON.stringify({
      chat_id: String(chatId),
      original_text: String(text || '').slice(0, 4000),
      source: process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY_FUNCTION_NAME || 'unknown',
      caller_meta: opts && opts.__caller ? String(opts.__caller).slice(0, 200) : null,
    });
    const u = new URL(url + '/rest/v1/nex_language_drift');
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=minimal',
      },
    }, res => { res.on('data', () => {}); res.on('end', () => {}); });
    req.on('error', () => {});
    req.write(payload); req.end();
  } catch { /* never block send on audit failure */ }
}

// ── Low-level Telegram API call ──
function tg(method, body) {
  return new Promise((resolve) => {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) { resolve({}); return; }
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

// ── Send a text message with HTML parse mode ──
//
// CEO-bound messages are language-checked. German drift is tagged + audited
// (fire-and-forget) so the message still reaches the CEO but the incident is
// surfaced for the weekly review and for daemon re-priming.
function send(chatId, text, opts = {}) {
  if (isCEOChat(chatId) && detectDrift(text)) {
    auditDrift(chatId, text, opts);
    text = '<i>[lang-drift] CEO chat must be English — NEX prime needs refresh.</i>\n\n' + text;
  }
  // Strip internal-only opts before forwarding to Telegram
  const { __caller, ...clean } = opts || {};
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...clean });
}

// ── Send message with inline keyboard buttons ──
function sendWithButtons(chatId, text, buttons) {
  return send(chatId, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Broadcast to all allowed users ──
function broadcast(text, opts = {}) {
  const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  return Promise.all(ALLOWED_USERS.map(uid => send(uid, text, opts)));
}

module.exports = { tg, send, sendWithButtons, broadcast };
