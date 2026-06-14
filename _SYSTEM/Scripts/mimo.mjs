#!/usr/bin/env node
// mimo.mjs — THE canonical way to fire the Mimo v2.5 pro lane (Marcel's direct order, 2026-06-13).
// Bypasses llm-lane.mjs (whose mimo path returns empty output + a detached AggregateError).
// Direct Anthropic-Messages streaming call. Never sandboxed. Strips thinking, prints final text only.
//
// Usage:
//   node _SYSTEM/Scripts/mimo.mjs "prompt text"
//   echo "prompt" | node _SYSTEM/Scripts/mimo.mjs
//   node _SYSTEM/Scripts/mimo.mjs --system "you are X" "prompt"   (system prompt)
//   node _SYSTEM/Scripts/mimo.mjs --max 4096 "prompt"            (max_tokens, default 131072 = mimo-v2.5-pro full output ceiling; lower ONLY to bound a trivial call, never to throttle real work)
//   node _SYSTEM/Scripts/mimo.mjs --think "prompt"               (also print thinking to stderr)
//
// Key resolution order: $MIMO_API_KEY → keychain `yuri-mimo-api-key` → ~/.config/yuri/env.sh.
// Exit 0 = text printed to stdout. Non-zero = error to stderr (categorized).

import https from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import dns from 'node:dns';
// Node happy-eyeballs (autoSelectFamily) intermittently throws a bare "AggregateError" on outbound
// https when IPv6 is flaky — survives Node 24/25, curl-immune. Prefer IPv4 (keeps the v6 fallback,
// can't regress a healthy window). Mirrors the same root-cause hardening in llm-lane.mjs. See
// ref-llm-lane-aggregateerror-ipv4. 2026-06-14.
dns.setDefaultResultOrder('ipv4first');

const HOST = 'token-plan-ams.xiaomimimo.com';
const PATH = '/anthropic/v1/messages';
const MODEL = 'mimo-v2.5-pro';

function resolveKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY.trim();
  try {
    const k = execFileSync('security', ['find-generic-password', '-s', 'yuri-mimo-api-key', '-w'], { encoding: 'utf8' }).trim();
    if (k) return k;
  } catch { /* fall through */ }
  try {
    const envFile = `${os.homedir()}/.config/yuri/env.sh`;
    const m = fs.readFileSync(envFile, 'utf8').match(/MIMO_API_KEY=["']?([^"'\n]+)/);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return '';
}

function parseArgs(argv) {
  const out = { system: '', max: 131072, think: false, prompt: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--system' || a === '-s') out.system = argv[++i] || '';
    else if (a === '--max' || a === '-m') out.max = parseInt(argv[++i], 10) || 131072;
    else if (a === '--think') out.think = true;
    else rest.push(a);
  }
  out.prompt = rest.join(' ');
  return out;
}

function fire({ prompt, system, max, think }) {
  return new Promise((resolve) => {
    const key = resolveKey();
    if (!key) { resolve({ code: 3, err: 'missing_key: set MIMO_API_KEY, keychain yuri-mimo-api-key, or ~/.config/yuri/env.sh' }); return; }
    const body = JSON.stringify({ model: MODEL, max_tokens: max, stream: true, messages: [{ role: 'user', content: prompt }], ...(system ? { system } : {}) });
    const req = https.request({
      hostname: HOST, port: 443, path: PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-api-key': key, 'anthropic-version': '2023-06-01', Accept: 'text/event-stream' },
    }, (res) => {
      if (res.statusCode >= 400) {
        let eb = ''; res.setEncoding('utf8');
        res.on('data', (c) => { eb += c; });
        res.on('end', () => resolve({ code: res.statusCode >= 500 ? 1 : 3, err: `http_${res.statusCode}:${eb.slice(0, 200)}` }));
        return;
      }
      let buf = '', text = '', thinking = '', stop = '';
      const blocks = new Map();
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          let j; try { j = JSON.parse(d); } catch { continue; }
          if (j.type === 'content_block_start') blocks.set(j.index, j.content_block?.type || 'text');
          else if (j.type === 'content_block_delta') {
            const t = blocks.get(j.index);
            if (j.delta?.type === 'text_delta') text += j.delta.text || '';
            else if (j.delta?.type === 'thinking_delta' && t === 'thinking') thinking += j.delta.thinking || '';
          } else if (j.type === 'message_delta') stop = j.delta?.stop_reason || stop;
        }
      });
      res.on('end', () => resolve({ code: 0, text, thinking, stop }));
    });
    req.setTimeout(0);
    req.on('socket', (s) => s.setTimeout(0));
    // Detached pooled-socket errors after resolve must not crash the process bare.
    req.on('error', (err) => resolve({ code: 1, err: `transport:${err?.code || err?.name || 'https_failed'}` }));
    req.write(body); req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt && !process.stdin.isTTY) args.prompt = fs.readFileSync(0, 'utf8').trim();
  if (!args.prompt) { process.stderr.write('Usage: mimo.mjs "prompt"  (or pipe via stdin)\n'); process.exit(2); }
  const r = await fire(args);
  if (r.code !== 0) { process.stderr.write(`MIMO_FAIL ${r.err}\n`); process.exit(r.code); }
  if (args.think && r.thinking) process.stderr.write(`[thinking]\n${r.thinking}\n[/thinking]\n`);
  process.stdout.write(r.text);
  if (r.text && !r.text.endsWith('\n')) process.stdout.write('\n');
  if (r.stop === 'max_tokens') process.stderr.write('\n[truncated: max_tokens — raise --max]\n');
}

process.on('unhandledRejection', (e) => { process.stderr.write(`MIMO_FAIL unhandled:${e?.cause?.code || e?.name || 'rejection'}\n`); process.exit(1); });
main();
