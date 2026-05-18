#!/usr/bin/env node
// kagami-facade.mjs — Branch-by-Abstraction facade for Kagami reflect router
// ESM. Node built-ins only. No external deps.

import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Config ───────────────────────────────────────────────────────────────────
const KAGAMI_URL        = process.env.KAGAMI_URL        || 'http://localhost:3005';
const KAGAMI_AUTH_TOKEN = process.env.KAGAMI_AUTH_TOKEN || '';
const PULSE_BUS_PATH    = process.env.PULSE_BUS_PATH    || '_SYSTEM/Logs/pulse-bus.jsonl';
const KAGAMI_TIMEOUT_MS = parseInt(process.env.KAGAMI_TIMEOUT_MS || '2000', 10);
const STREAM_TIMEOUT_MS = parseInt(process.env.KAGAMI_STREAM_TIMEOUT_MS || '120000', 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..', '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoNow() {
  return new Date().toISOString();
}

function idempotencyKey(prompt, ts = isoNow()) {
  const hash = createHash('sha256').update(prompt + ts).digest('hex');
  return hash.slice(0, 16);
}

function pulseEvent(eventType, payload) {
  try {
    const logPath = resolve(REPO_ROOT, PULSE_BUS_PATH);
    mkdirSync(dirname(logPath), { recursive: true });
    const line = JSON.stringify({
      source: 'kagami-facade',
      event: eventType,
      timestamp: isoNow(),
      ...payload,
    }) + '\n';
    writeFileSync(logPath, line, { flag: 'a' });
  } catch (_) {
    // pulse bus write failure must be silent — never break the facade
  }
}

/**
 * Simple HTTP GET with timeout. Returns {status, body}.
 */
function httpGet(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: 'GET', timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Simple HTTP POST with JSON body, bearer auth, timeout.
 */
function httpPostJson(urlStr, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(bodyObj);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (KAGAMI_AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${KAGAMI_AUTH_TOKEN}`;
    }
    const req = mod.request(u, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Probe Kagami health endpoint.
 * Returns {ok: false, reason} if unreachable; {ok: false, status} if non-200.
 * Returns {ok: true} if healthy.
 */
export async function checkKagamiHealth() {
  try {
    const { status, body } = await httpGet(`${KAGAMI_URL}/kagami/health`, KAGAMI_TIMEOUT_MS);
    if (status === 200) return { ok: true, status };
    return { ok: false, reason: `health returned ${status}`, status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Attempt Kagami reflect. Returns {ok: true, reflectId, streamUrl}
 * or {ok: false, reason}.
 */
export async function tryKagami(promptText, opts = {}) {
  const health = await checkKagamiHealth();
  if (!health.ok) return health;

  try {
    const lane = opts.lane && opts.lane !== 'default' ? opts.lane : undefined;
    const result = await httpPostJson(
      `${KAGAMI_URL}/kagami/reflect`,
      { command: promptText, ...(lane ? { modelId: lane } : {}) },
      KAGAMI_TIMEOUT_MS,
    );
    if (result.status === 200 || result.status === 201 || result.status === 202) {
      // Kagami wraps responses in {ok, value:{...}} — unwrap before reading fields
      const body = result.body?.value || result.body;
      const rawUrl = body?.streamUrl || body?.url || null;
      // Resolve relative stream URLs against KAGAMI_URL
      const streamUrl = rawUrl
        ? (rawUrl.startsWith('http') ? rawUrl : `${KAGAMI_URL}${rawUrl}`)
        : null;
      return {
        ok: true,
        reflectId: body?.reflectId || body?.id || null,
        streamUrl,
      };
    }
    return { ok: false, reason: `reflect returned ${result.status}`, status: result.status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Consume an SSE stream, write tokens to stdout, return full text.
 * Expects event:token data:{"token":"..."} and event:end data:{...}
 */
export async function tailKagamiStream(streamUrl, timeoutMs = STREAM_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const u = new URL(streamUrl);
    const mod = u.protocol === 'https:' ? https : http;

    const streamHeaders = { Accept: 'text/event-stream' };
    if (KAGAMI_AUTH_TOKEN) streamHeaders['Authorization'] = `Bearer ${KAGAMI_AUTH_TOKEN}`;
    const req = mod.request(u, {
      method: 'GET',
      headers: streamHeaders,
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Stream returned ${res.statusCode}`));
        return;
      }

      let fullText = '';
      let buffer   = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        // Split on double-newline which separates SSE events
        const parts = buffer.split(/\n\n/);
        buffer = parts.pop(); // keep incomplete event in buffer

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:'))  eventData  = line.slice(5).trim();
          }

          if (eventType === 'token' && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              const token  = parsed.token || '';
              process.stdout.write(token);
              fullText += token;
            } catch (_) { /* skip malformed */ }
          } else if (eventType === 'error') {
            try {
              const parsed = JSON.parse(eventData);
              reject(new Error(parsed.message || 'stream error'));
            } catch (_) { reject(new Error('stream error')); }
            return;
          } else if (eventType === 'end') {
            // stream complete
          }
        }
      });

      res.on('end', () => {
        resolve(fullText);
      });

      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Stream timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ─── CLI main ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args  = [];
  let lane    = 'default';
  let kagamiOnly = false;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--kagami-only') {
      kagamiOnly = true;
    } else if (argv[i] === '--lane' && argv[i + 1]) {
      lane = argv[i + 1];
      i++;
    } else {
      args.push(argv[i]);
    }
  }
  // Filter out the '--' separator if present
  const prompt = args.filter(a => a !== '--').join(' ').trim();
  return { lane, prompt, kagamiOnly };
}

async function main() {
  const { lane, prompt, kagamiOnly } = parseArgs(process.argv);

  if (!prompt) {
    console.error('kagami-facade: no prompt provided');
    process.exit(1);
  }

  const idKey = idempotencyKey(prompt);

  // Emit start pulse
  pulseEvent('facade.start', { idempotencyKey: idKey, lane, kagamiOnly });

  // Attempt Kagami
  const result = await tryKagami(prompt, { lane });

  if (result.ok && result.streamUrl) {
    // Stream mode
    try {
      const fullText = await tailKagamiStream(result.streamUrl);
      // Emit end pulse
      pulseEvent('facade.end', { idempotencyKey: idKey, source: 'kagami', ok: true, reflectId: result.reflectId });
      // Print final newline and exit
      if (!fullText.endsWith('\n')) process.stdout.write('\n');
      process.exit(0);
    } catch (e) {
      pulseEvent('facade.end', { idempotencyKey: idKey, source: 'kagami', ok: false, reason: `stream fail: ${e.message}` });
      if (kagamiOnly) {
        console.error(`kagami-facade: kagami-only mode, stream failed: ${e.message}`);
        process.exit(1);
      }
      // Fall through to fallback below
    }
  } else if (result.ok) {
    // Non-stream success (but normally we want streamUrl)
    pulseEvent('facade.end', { idempotencyKey: idKey, source: 'kagami', ok: true, reflectId: result.reflectId });
    process.exit(0);
  }

  // Kagami failed or wasn't available
  if (kagamiOnly) {
    console.error(`kagami-facade: kagami-only mode, Kagami unreachable: ${result.reason || 'unknown'}`);
    pulseEvent('facade.end', { idempotencyKey: idKey, source: 'kagami', ok: false, reason: result.reason });
    process.exit(1);
  }

  // Non-kagami-only: indicate fallback needed via exit code 2
  // The caller (ai script) should detect this and route to offload-runner
  pulseEvent('facade.end', { idempotencyKey: idKey, source: 'fallback', ok: false, reason: result.reason || 'kagami unavailable' });
  process.exit(2);
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && process.argv[1].endsWith('kagami-facade.mjs'));
if (invokedAsScript) {
  main().catch((e) => {
    console.error(`kagami-facade: fatal ${e.message}`);
    pulseEvent('facade.end', { ok: false, reason: e.message });
    process.exit(2);
  });
}
