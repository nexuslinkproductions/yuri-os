#!/usr/bin/env node
// kagami-cli.mjs — terminal CLI for Kagami HTTP + SSE

import * as kagamiFacade from './kagami-facade.mjs';
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SESSION_FILE = join(process.env.HOME ?? '/tmp', '.kagami-session');
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2h idle resets session

function getOrCreateSessionId() {
  try {
    const s = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    if (typeof s.id === 'string' && typeof s.ts === 'number' && Date.now() - s.ts < SESSION_TTL_MS) {
      writeFileSync(SESSION_FILE, JSON.stringify({ id: s.id, ts: Date.now() }));
      return s.id;
    }
  } catch { /* no file or parse error — create new */ }
  const id = randomUUID();
  writeFileSync(SESSION_FILE, JSON.stringify({ id, ts: Date.now() }));
  return id;
}

const KAGAMI_URL = process.env.KAGAMI_URL || 'http://localhost:3005';
const KAGAMI_AUTH_TOKEN = process.env.KAGAMI_AUTH_TOKEN || '';
const BOOT_HINT = 'boot: bash _SYSTEM/Scripts/kagami-start.sh';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function precisionPauseMs(token) {
  if (process.env.KAGAMI_PRECISION_PAUSE === '0') return 0;
  const t = String(token ?? '');
  if (/[.!?]["')\]]?\s*$/.test(t)) return Number(process.env.KAGAMI_SENTENCE_PAUSE_MS ?? 180);
  if (/[,;:]\s*$/.test(t)) return Number(process.env.KAGAMI_CLAUSE_PAUSE_MS ?? 60);
  return 0;
}

const httpGet = kagamiFacade.httpGet ?? httpGetImpl;
const httpPostJson = kagamiFacade.httpPostJson ?? httpPostJsonImpl;
const tailKagamiStream = tailKagamiStreamImpl;

function resolveKagamiUrl(target) {
  return new URL(String(target), KAGAMI_URL).toString();
}

function parseMaybeJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapPayload(body) {
  if (body && typeof body === 'object') {
    if (body.value !== undefined) return body.value;
    if (body.data !== undefined) return body.data;
  }
  return body;
}

function firstArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function toOneLine(value, limit = 96) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function extractUptimeSeconds(payload) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['uptimeSeconds', 'uptime_seconds', 'uptime']) {
    const value = Number(payload[key]);
    if (Number.isFinite(value)) return value;
  }
  const value = Number(payload.uptimeMs ?? payload.uptime_ms);
  return Number.isFinite(value) ? value / 1000 : null;
}

function formatFailure(label, response, fallback = null) {
  const body = unwrapPayload(response?.body);
  const detail = body && typeof body === 'object'
    ? body.reason || body.error || body.message || body.status || body.state || body.detail
    : typeof body === 'string'
      ? body.trim()
      : '';
  if (detail) return detail;
  if (fallback) return fallback;
  if (response?.status) return `${label} returned ${response.status}`;
  return `${label} failed`;
}

function laneName(lane) {
  if (typeof lane === 'string') return lane;
  if (!lane || typeof lane !== 'object') return String(lane ?? '');
  return String(lane.name ?? lane.id ?? lane.modelId ?? lane.lane ?? lane.slug ?? lane.label ?? '').trim() || 'unknown';
}

function laneStatus(lane) {
  if (typeof lane === 'string') return 'available';
  if (!lane || typeof lane !== 'object') return 'available';
  const explicit = lane.status ?? lane.state ?? lane.health ?? lane.availability;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if (lane.available === false || lane.enabled === false || lane.online === false || lane.healthy === false) return 'unavailable';
  if (lane.available === true || lane.enabled === true || lane.online === true || lane.healthy === true) return 'available';
  if (lane.active === true) return 'active';
  return 'available';
}

function printPrettyJson(value) {
  console.log(JSON.stringify(value ?? null, null, 2));
}

function printUsage() {
  console.log(`Usage:
  kagami "<prompt>"                    reflect + stream to stdout
  kagami "<prompt>" --hud              reflect + stream with HUD to stderr
  kagami --mode short "<prompt>"       ultra-terse: action + result only
  kagami --mode silent "<prompt>"      outcome only, no process narration
  kagami --mode zen "<prompt>"         sparse, one truth per response
  kagami --mode sharp "<prompt>"       max technical precision, no filler
  kagami --mode deep "<prompt>"        answers the underlying problem

  kagami --health                      server status
  kagami --lanes                       available lanes
  kagami --history [N]                 last N reflections (default 10)
  kagami --profile                     full memory profile
  kagami --rate <id> <1-5> [msg]       rate a reflection
  kagami --improvement                 prompt quality report`);
}

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';

const RICK_KW = ['listen', 'morty', 'obviously', 'portal', 'genius', 'science', 'rick', 'multiverse', 'interdimensional', 'szechuan'];
const LANE_RATES = {
  'deepseek-v4-flash': 0.0028,
  'deepseek-v4-pro': 0.014,
  'codex-spark': 0.003,
  'nvidia-gpt-oss-120b': 0.004,
  'nvidia-dracarys': 0.003,
  'ollama-exec': 0,
  'rapid-mlx-exec': 0,
};

function fail(reason, code = 1) {
  process.stderr.write(`${RED}${reason}${RESET}\n${DIM}${BOOT_HINT}${RESET}\n`);
  process.exit(code);
}

function metaWrite(msg) {
  process.stderr.write(`${DIM}${msg}${RESET}\n`);
}

function rickScore(text) {
  const low = String(text ?? '').toLowerCase();
  return RICK_KW.filter((k) => low.includes(k)).length / RICK_KW.length;
}

function estimateCost(text, lane) {
  const rate = LANE_RATES[String(lane ?? '')] ?? LANE_RATES.default ?? 0;
  const tokens = String(text ?? '').length / 4;
  return (tokens / 1_000_000) * rate;
}

function firstFiniteNumber(...candidates) {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function reflectContext(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.context && typeof payload.context === 'object' ? payload.context : payload;
}

function writeHud({ lane, ttft, totalMs, ragHits, ragTopScore, rickScore: score, cacheRatio, costEst, tier }) {
  const rickColor = score < 0.5 ? RED : score < 0.65 ? AMBER : GREEN;
  const cacheColor = cacheRatio >= 0.75 ? GREEN : cacheRatio >= 0.4 ? AMBER : RED;
  const bar = (v, max = 1, width = 8) => {
    const filled = Math.max(0, Math.min(width, Math.round((v / max) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };
  const parts = [
    `lane=${lane}`,
    `ttft=${ttft}ms`,
    `total=${totalMs}ms`,
    ragHits != null ? `rag=${ragHits}hits·${ragTopScore?.toFixed(2)}` : null,
    `rick=${rickColor}${bar(score)}${score.toFixed(2)}${RESET}${DIM}`,
    cacheRatio != null ? `cache=${cacheColor}${bar(cacheRatio)}${cacheRatio.toFixed(2)}${RESET}${DIM}` : null,
    `cost=~$${costEst.toFixed(4)}`,
    tier ? `[${tier}]` : null,
  ].filter(Boolean).join(' · ');
  process.stderr.write(`${DIM}[hud] ${parts}${RESET}\n`);
}

function httpRequestJsonImpl(method, target, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(target, KAGAMI_URL);
    const client = url.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json' };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (KAGAMI_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${KAGAMI_AUTH_TOKEN}`;
    }

    const req = client.request(url, { method, headers, timeout: timeoutMs }, (res) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk.toString('utf8');
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: parseMaybeJson(text),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);

    if (payload !== null) req.write(payload);
    req.end();
  });
}

function httpGetImpl(target, timeoutMs = 10000) {
  return httpRequestJsonImpl('GET', target, undefined, timeoutMs);
}

function httpPostJsonImpl(target, body, timeoutMs = 10000) {
  return httpRequestJsonImpl('POST', target, body, timeoutMs);
}

function tailKagamiStreamImpl(streamUrl, timeoutMs = 120000, onFirstToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(streamUrl, KAGAMI_URL);
    const client = url.protocol === 'https:' ? https : http;
    const headers = { Accept: 'text/event-stream' };
    if (KAGAMI_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${KAGAMI_AUTH_TOKEN}`;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = client.request(url, {
      method: 'GET',
      headers,
      timeout: timeoutMs,
    }, async (res) => {
      if (res.statusCode !== 200) {
        fail(new Error(`Stream returned ${res.statusCode}`));
        return;
      }

      let fullText = '';
      let buffer = '';
      let sawFirstToken = false;
      let streamMetrics = null;

      res.on('data', async (chunk) => {
        buffer += chunk.toString('utf8');
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const lines = part.split(/\r?\n/);
          let eventType = '';
          const dataLines = [];

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }

          const eventData = dataLines.join('\n');
          if (eventType === 'token' && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              const token = String(parsed.token ?? '');
              if (token) {
                if (!sawFirstToken) {
                  sawFirstToken = true;
                  onFirstToken?.();
                }
                process.stdout.write(token);
                fullText += token;
                const pause = precisionPauseMs(token);
                if (pause > 0) await sleep(pause);
              }
            } catch {
              // Ignore malformed token events.
            }
          } else if (eventType === 'metrics' && eventData) {
            try {
              streamMetrics = JSON.parse(eventData);
            } catch {
              // Ignore malformed metrics events.
            }
          } else if (eventType === 'end') {
            req.destroy();
            finish({ text: fullText, metrics: streamMetrics });
            return;
          }
        }
      });

      res.on('end', () => finish({ text: fullText, metrics: streamMetrics }));
      res.on('error', fail);
    });

    req.on('timeout', () => {
      req.destroy();
      fail(new Error('Stream timeout'));
    });
    req.on('error', fail);
    req.end();
  });
}

async function cmdHealth() {
  const response = await httpGet('/kagami/health');
  const payload = unwrapPayload(response.body);
  const healthy = response.status >= 200 && response.status < 300 && payload?.healthy !== false;

  if (!healthy) {
    fail(formatFailure('health', response));
  }

  const uptimeSeconds = extractUptimeSeconds(payload);
  const uptimeText = uptimeSeconds === null ? 'uptime unavailable' : `uptime ${Math.round(uptimeSeconds)}s`;
  metaWrite(`healthy | ${uptimeText}`);
}

async function cmdReflect(prompt, lane = 'default', mode = null, debug = false, hud = false) {
  const text = String(prompt ?? '').trim();
  if (!text) fail('prompt required');

  const startedAt = Date.now();
  const sessionId = getOrCreateSessionId();
  const requestBody = { command: text, sessionId };
  if (lane && lane !== 'default') requestBody.modelId = lane;
  if (mode) requestBody.mode = mode;

  const response = await httpPostJson('/kagami/reflect', requestBody, 15000);
  if (response.status < 200 || response.status >= 300) {
    fail(formatFailure('reflect', response));
  }

  const payload = unwrapPayload(response.body) ?? {};
  const streamUrl = payload.streamUrl || payload.url || null;
  if (!streamUrl) fail('reflect response missing streamUrl');

  const reflectId = payload.reflectId || payload.id || '?';
  const laneId = payload.modelId || payload.lane || lane || 'default';
  const laneLabel = payload.lane || laneId;
  const absoluteStreamUrl = resolveKagamiUrl(streamUrl);
  const context = reflectContext(payload);
  const ragHits = firstFiniteNumber(
    context.ragHits,
    context.rag_hits,
    context.rag?.hits,
    context.rag?.count,
    context.memory?.ragHits,
  );
  const ragTopScore = firstFiniteNumber(
    context.ragTopScore,
    context.rag_top_score,
    context.rag?.topScore,
    context.rag?.top_score,
    context.memory?.ragTopScore,
  );
  const pulsePlanTier = context.pulsePlanTier ?? context.pulse_plan_tier ?? context.pulsePlan?.tier ?? context.tier ?? null;

  metaWrite(`${laneLabel} · ${reflectId}`);
  let ttftMs = null;
  const streamResult = await tailKagamiStream(absoluteStreamUrl, 120000, () => {
    if (ttftMs === null) ttftMs = Date.now() - startedAt;
  });
  const streamed = typeof streamResult === 'string' ? streamResult : streamResult?.text ?? '';
  const streamMetrics = typeof streamResult === 'object' && streamResult !== null ? streamResult.metrics : null;
  const cacheHitTokens = firstFiniteNumber(streamMetrics?.cacheHitTokens, streamMetrics?.cache_hit_tokens);
  const cacheMissTokens = firstFiniteNumber(streamMetrics?.cacheMissTokens, streamMetrics?.cache_miss_tokens);
  const cacheTotalTokens = cacheHitTokens !== null && cacheMissTokens !== null ? cacheHitTokens + cacheMissTokens : 0;
  const cacheRatio = cacheTotalTokens > 0 ? cacheHitTokens / cacheTotalTokens : null;
  if (streamed && !streamed.endsWith('\n')) process.stdout.write('\n');
  if (hud) {
    const totalMs = Date.now() - startedAt;
    writeHud({
      lane: laneLabel,
      ttft: ttftMs ?? totalMs,
      totalMs,
      ragHits,
      ragTopScore,
      rickScore: rickScore(streamed),
      cacheRatio,
      costEst: estimateCost(streamed, laneId),
      tier: pulsePlanTier,
    });
  }
  if (debug) metaWrite(`${Date.now() - startedAt}ms`);
}

async function cmdHistory(limitArg = '10') {
  const limit = Number.parseInt(String(limitArg ?? '10'), 10);
  const n = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const candidates = [
    `/kagami/improvement?limit=${encodeURIComponent(n)}`,
    '/kagami/memory/profile',
  ];
  let reflections = [];
  let lastResponse = null;

  for (const target of candidates) {
    const response = await httpGet(target);
    lastResponse = response;
    if (response.status < 200 || response.status >= 300) continue;

    const payload = unwrapPayload(response.body) ?? {};
    reflections = firstArray(
      payload,
      payload.recentReflections,
      payload.reflections,
      payload.history,
      payload.entries,
      payload.items,
    ).slice(0, n);
    if (reflections.length > 0) break;
  }

  if (!lastResponse || lastResponse.status < 200 || lastResponse.status >= 300) {
    fail(formatFailure('history', lastResponse));
  }

  if (reflections.length === 0) {
    console.log('[kagami] no history yet');
    return;
  }

  reflections.forEach((entry, index) => {
    const id = String(entry?.reflectId ?? entry?.id ?? entry?.sessionId ?? '?');
    const preview = toOneLine(
      entry?.content ?? entry?.commandPreview ?? entry?.prompt ?? entry?.command ?? entry?.summary ?? entry?.text ?? '',
      90,
    ) || '<empty>';
    console.log(`${String(index + 1).padStart(2, ' ')}. [${id}] ${preview}`);
  });
}

async function cmdProfile() {
  const response = await httpGet('/kagami/memory/profile');
  if (response.status < 200 || response.status >= 300) {
    fail(formatFailure('profile', response));
  }
  printPrettyJson(unwrapPayload(response.body));
}

async function cmdRate(id, score, msg) {
  const targetId = String(id ?? '').trim();
  const numericScore = Number.parseInt(String(score ?? ''), 10);
  if (!targetId) fail('rate requires <id> <1-5> [msg]');
  if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 5) {
    fail('score must be 1-5');
  }

  const rating = numericScore <= 2 ? 'negative' : numericScore === 3 ? 'neutral' : 'positive';
  const body = { rating, ...(msg ? { notes: String(msg) } : {}) };
  const response = await httpPostJson(`/kagami/memory/rate/${encodeURIComponent(targetId)}`, body);
  if (response.status < 200 || response.status >= 300) {
    fail(formatFailure('rate', response));
  }

  console.log(`[kagami] ✓ rated ${targetId} → ${rating}`);
}

async function cmdLanes() {
  const response = await httpGet('/kagami/lanes');
  if (response.status < 200 || response.status >= 300) {
    fail(formatFailure('lanes', response));
  }

  const payload = unwrapPayload(response.body);
  const lanes = firstArray(payload, payload?.lanes, payload?.items, payload?.rows, payload?.data);
  if (lanes.length === 0) {
    console.log('[kagami] no lanes configured');
    return;
  }

  const rows = lanes.map((lane) => ({
    name: laneName(lane),
    status: laneStatus(lane),
  }));
  const nameWidth = Math.max('NAME'.length, ...rows.map((row) => row.name.length));
  const statusWidth = Math.max('STATUS'.length, ...rows.map((row) => row.status.length));

  console.log(`${'NAME'.padEnd(nameWidth)} | ${'STATUS'.padEnd(statusWidth)}`);
  console.log(`${'-'.repeat(nameWidth)}-+-${'-'.repeat(statusWidth)}`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(nameWidth)} | ${row.status.padEnd(statusWidth)}`);
  }
}

async function cmdImprovement() {
  const response = await httpGet('/kagami/improvement');
  if (response.status < 200 || response.status >= 300) {
    fail(formatFailure('improvement', response));
  }
  printPrettyJson(unwrapPayload(response.body));
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printUsage();
    return;
  }

  const debug = argv.includes('--debug') || process.env.KAGAMI_DEBUG === '1';
  const hud = argv.includes('--hud');
  argv = argv.filter((a) => a !== '--debug' && a !== '--hud');

  // Extract --mode <alias> from anywhere in argv before dispatch
  let mode = null;
  const modeIdx = argv.indexOf('--mode');
  if (modeIdx !== -1 && argv[modeIdx + 1]) {
    mode = argv[modeIdx + 1];
    argv = [...argv.slice(0, modeIdx), ...argv.slice(modeIdx + 2)];
  }

  const [command, ...rest] = argv;
  switch (command) {
    case '--health':
      await cmdHealth();
      return;
    case '--history':
      await cmdHistory(rest[0]);
      return;
    case '--profile':
      await cmdProfile();
      return;
    case '--rate':
      await cmdRate(rest[0], rest[1], rest.slice(2).join(' '));
      return;
    case '--lanes':
      await cmdLanes();
      return;
    case '--improvement':
      await cmdImprovement();
      return;
    default:
      if (String(command ?? '').startsWith('--')) {
        fail(`unknown command: ${command}`);
      }
      await cmdReflect(argv.join(' '), 'default', mode, debug, hud);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
