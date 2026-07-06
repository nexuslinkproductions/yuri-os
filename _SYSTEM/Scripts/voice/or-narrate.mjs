#!/usr/bin/env node
// @capability: streamed-narration-summarizer
// @serves: summarize worker turn for voice | streamed narration summary | off-machine narrator | openrouter summary | event-driven narrate
// @does: turns a worker AI's last turn into ONE natural spoken sentence via OpenRouter free models (off-machine, zero local GPU). Tries a fallback chain (gpt-oss-20b -> gpt-oss-120b -> lfm-1.2b) so a 429 on one free model rolls to the next. Reads the OpenRouter key from the macOS keychain. Prints the summary to stdout (empty on total failure -> caller stays silent).
// @use: the worker-role Stop hook pipes the worker's last turn in; this prints a one-liner to speak. `echo "<turn text>" | node or-narrate.mjs` or `node or-narrate.mjs --text "..."`. Fail-open: any error -> empty stdout, exit 0 (never breaks the voice loop).
// @exports: summarize
import https from 'node:https';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// fallback chain — least-rate-limited free instruct models first (empirically: the popular
// llama/qwen :free variants 429 constantly; gpt-oss + lfm respond). Override via VOICE_OR_MODELS.
const MODELS = (process.env.VOICE_OR_MODELS ||
  'openai/gpt-oss-20b:free,openai/gpt-oss-120b:free,liquid/lfm-2.5-1.2b-instruct:free,meta-llama/llama-3.3-70b-instruct:free'
).split(',').map((s) => s.trim()).filter(Boolean);

function getKey() {
  try { return execFileSync('security', ['find-generic-password', '-s', 'YURI_OS_MUSUBI:OPENROUTER_API_KEY', '-w']).toString().trim(); }
  catch { return ''; }
}

function callModel(key, model, text) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'You give Marcel a quick spoken heads-up about what his background worker AI just did. Reply with ONE natural, conversational sentence (max 26 words) for text-to-speech. Be precise about what happened. No preamble, no markdown, no lists, no quotes — just the sentence. If the update is purely routine with nothing worth saying aloud, reply with exactly: SKIP' },
      { role: 'user', content: `Worker update:\n${text.slice(0, 6000)}` },
    ],
    max_tokens: 80, temperature: 0.4,
  });
  return new Promise((resolve) => {
    const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Title': 'YURI-narration' },
      timeout: Number(process.env.VOICE_OR_TIMEOUT_MS || 9000),
    }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return resolve({ ok: false, code: j.error.code });
          const msg = (j.choices?.[0]?.message?.content || '').trim();
          if (!msg || /^SKIP\.?$/i.test(msg)) return resolve({ ok: true, text: '' });
          resolve({ ok: true, text: msg.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ') });
        } catch { resolve({ ok: false, code: 'parse' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: 'timeout' }); });
    req.on('error', () => resolve({ ok: false, code: 'neterr' }));
    req.write(body); req.end();
  });
}

export async function summarize(text) {
  if (!text || !text.trim()) return '';
  const key = getKey();
  if (!key) return '';
  for (const model of MODELS) {
    const r = await callModel(key, model, text);
    if (r.ok) return r.text;       // includes intentional '' for SKIP
    // not ok (429/timeout/neterr) -> try next model in the chain
  }
  return '';
}

const invokedDirectly = (() => { try { return process.argv[1] && process.argv[1].endsWith('or-narrate.mjs'); } catch { return false; } })();
if (invokedDirectly) {
  (async () => {
    let text = '';
    const ti = process.argv.indexOf('--text');
    if (ti >= 0) text = process.argv[ti + 1] || '';
    else { try { text = fs.readFileSync(0, 'utf8'); } catch { text = ''; } }
    try { process.stdout.write(await summarize(text)); } catch {}
    process.exit(0);
  })();
}
