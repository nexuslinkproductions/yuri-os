#!/usr/bin/env node
// @capability: whatsapp-query
// @serves: whatsapp thread | whatsapp contact resolve | whatsapp message search | lilly jid | fast whatsapp read
// @does: direct read-only queries against whatsapp-mcp bridge SQLite (bypasses MCP stdio); alias→JID resolution, thread pulls, peek, thread-card presentation, short TTL cache
// @use: node whatsapp-query.mjs resolve Lilly | thread --contact lilly --since today | peek --contact lilly | thread --jid <jid> --since 2026-07-06 --json
// @exports: resolveContact, threadSince, peekLast, formatThreadCard, DB_PATH, ALIASES_PATH

import Database from 'better-sqlite3';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const DB_PATH = process.env.WHATSAPP_DB
  || path.join(homedir(), 'whatsapp-mcp/whatsapp-bridge/store/messages.db');
export const ALIASES_PATH = path.join(REPO_ROOT, '_SYSTEM/state/whatsapp-aliases.json');
const CACHE_DIR = path.join(REPO_ROOT, '_SYSTEM/state/whatsapp-cache');
const CACHE_TTL_MS = 5 * 60 * 1000;

function loadAliases() {
  if (!existsSync(ALIASES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ALIASES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function openDb() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`WhatsApp DB not found: ${DB_PATH} (is the bridge running?)`);
  }
  return new Database(DB_PATH, { readonly: true });
}

export function resolveContact(query) {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;

  const aliases = loadAliases();
  if (aliases[key]) {
    return { jid: aliases[key].jid, name: aliases[key].label || key, source: 'alias' };
  }

  const db = openDb();
  const row = db.prepare(`
    SELECT jid, name FROM chats
    WHERE jid NOT LIKE '%@g.us'
      AND (LOWER(COALESCE(name, '')) LIKE ? OR jid LIKE ? OR REPLACE(jid, '@s.whatsapp.net', '') LIKE ?)
    ORDER BY last_message_time DESC
    LIMIT 1
  `).get(`%${key}%`, `%${key}%`, `%${key.replace(/\D/g, '')}%`);
  if (!row) return null;
  return { jid: row.jid, name: row.name || row.jid, source: 'db' };
}

function parseSince(value) {
  const v = String(value || 'today').trim().toLowerCase();
  const now = new Date();
  if (v === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (v === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00.000Z`;
  return new Date(v).toISOString();
}

function cacheKey(jid, afterIso, limit) {
  const day = afterIso.slice(0, 10);
  return path.join(CACHE_DIR, `${jid.replace(/[@.]/g, '_')}__${day}__${limit}.json`);
}

function readCache(jid, afterIso, limit) {
  try {
    const p = cacheKey(jid, afterIso, limit);
    const st = statSync(p);
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(jid, afterIso, limit, data) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheKey(jid, afterIso, limit), JSON.stringify(data));
  } catch { /* best-effort */ }
}

function normalizeMessage(row, contactLabel) {
  const from = row.is_from_me ? 'Me' : (contactLabel || 'Them');
  let content = row.content || '';
  if (!content && row.media_type) content = `[${row.media_type}]`;
  return {
    id: row.id,
    timestamp: row.timestamp,
    from,
    content,
    media_type: row.media_type || null,
  };
}

export function threadSince(jid, { after, limit = 50, useCache = true, contactLabel } = {}) {
  const afterIso = parseSince(after);
  if (useCache) {
    const cached = readCache(jid, afterIso, limit);
    if (cached) return cached;
  }

  const db = openDb();
  const rows = db.prepare(`
    SELECT id, chat_jid, sender, content, timestamp, is_from_me, media_type
    FROM messages
    WHERE chat_jid = ? AND timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(jid, afterIso, limit);

  const messages = rows.map((r) => normalizeMessage(r, contactLabel));
  const result = { jid, after: afterIso, limit, count: messages.length, messages };
  if (useCache) writeCache(jid, afterIso, limit, result);
  return result;
}

export function peekLast(jid) {
  const db = openDb();
  const row = db.prepare(`
    SELECT id, content, timestamp, is_from_me, media_type
    FROM messages WHERE chat_jid = ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(jid);
  if (!row) return null;
  return normalizeMessage(row);
}

function truncate(s, n = 120) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Vienna',
    });
  } catch {
    return String(ts);
  }
}

export function formatThreadCard({ contact, jid, after, thread }) {
  const msgs = thread.messages || [];
  const fromThem = msgs.filter((m) => m.from !== 'Me').length;
  const fromMe = msgs.length - fromThem;
  const first = msgs[0]?.timestamp;
  const last = msgs[msgs.length - 1]?.timestamp;
  const day = (after || '').slice(0, 10) || (first || '').slice(0, 10);

  const headline = msgs.length
    ? `${msgs.length} messages between you and ${contact}`
  : `No messages with ${contact} for ${day}`;

  const lines = [
    `## WhatsApp · ${contact} · ${day}`,
    `**Headline:** ${headline}`,
    `**Stats:** ${msgs.length} msgs · ${fmtTime(first)}–${fmtTime(last)} · ${fromThem} from ${contact}, ${fromMe} from you`,
    '',
    '| Time | From | Message |',
    '|------|------|---------|',
  ];

  for (const m of msgs) {
    lines.push(`| ${fmtTime(m.timestamp)} | ${m.from} | ${truncate(m.content)} |`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    cmd: args[0] || 'help',
    contact: null,
    jid: null,
    since: 'today',
    limit: 50,
    json: false,
    noCache: false,
  };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--contact') out.contact = args[++i];
    else if (a === '--jid') out.jid = args[++i];
    else if (a === '--since') out.since = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10) || 50;
    else if (a === '--json') out.json = true;
    else if (a === '--no-cache') out.noCache = true;
    else if (!a.startsWith('--') && out.cmd === 'resolve' && !out.contact) out.contact = a;
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.cmd === 'help' || opts.cmd === '--help') {
    console.log(`Usage:
  node whatsapp-query.mjs resolve <name>
  node whatsapp-query.mjs thread --contact <name> [--since today|yesterday|YYYY-MM-DD] [--limit N] [--json]
  node whatsapp-query.mjs thread --jid <jid> [--since today] [--json]
  node whatsapp-query.mjs peek --contact <name> | --jid <jid> [--json]`);
    return;
  }

  if (opts.cmd === 'resolve') {
    const hit = resolveContact(opts.contact);
    if (!hit) {
      console.error(`No contact match for: ${opts.contact}`);
      process.exit(1);
    }
    console.log(opts.json ? JSON.stringify(hit, null, 2) : `${hit.name}\t${hit.jid}\t(${hit.source})`);
    return;
  }

  let jid = opts.jid;
  let label = opts.contact || jid;
  if (!jid && opts.contact) {
    const hit = resolveContact(opts.contact);
    if (!hit) {
      console.error(`No contact match for: ${opts.contact}`);
      process.exit(1);
    }
    jid = hit.jid;
    label = hit.name || opts.contact;
  }
  if (!jid) {
    console.error('thread/peek requires --contact or --jid');
    process.exit(1);
  }

  if (opts.cmd === 'peek') {
    const msg = peekLast(jid);
    if (!msg) {
      console.error('No messages found');
      process.exit(1);
    }
    console.log(opts.json ? JSON.stringify(msg, null, 2) : `${fmtTime(msg.timestamp)} ${msg.from}: ${msg.content}`);
    return;
  }

  if (opts.cmd === 'thread') {
    const thread = threadSince(jid, {
      after: opts.since,
      limit: opts.limit,
      useCache: !opts.noCache,
      contactLabel: label,
    });
    if (opts.json) {
      console.log(JSON.stringify({ contact: label, ...thread }, null, 2));
      return;
    }
    console.log(formatThreadCard({ contact: label, jid, after: opts.since, thread }));
    return;
  }

  console.error(`Unknown command: ${opts.cmd}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
