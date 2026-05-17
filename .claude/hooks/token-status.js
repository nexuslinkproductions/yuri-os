#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SESSION_STATE_FILE = '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/session-state.json';
const SESSION_FILE      = '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/token-session.json';
const WEEKLY_FILE       = '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/token-weekly.json';
const TOKEN_LEDGER      = '/Users/marcelspatz/YURI-OS-MUSUBI/Scripts/token-ledger.mjs';

// ANSI helpers
const C = {
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};

// Visual fill bar — colored based on fill level, dimmed empty portion
function bar(pct, width = 16) {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled  = Math.round((clamped / 100) * width);
  const empty   = width - filled;
  const color   = clamped < 50 ? C.green : clamped < 85 ? C.yellow : C.red;
  return `${color}${'█'.repeat(filled)}${C.reset}${C.dim}${'░'.repeat(empty)}${C.reset}`;
}

// Mini bar for cache hit — always blue/cyan (higher = better)
function miniBar(pct, width = 8) {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled  = Math.round((clamped / 100) * width);
  const empty   = width - filled;
  return `${C.cyan}${'▪'.repeat(filled)}${C.reset}${C.dim}${'·'.repeat(empty)}${C.reset}`;
}

// Compact model label: "claude-sonnet-4-6" → "s4.6"
function shortModel(id, display) {
  if (!id && !display) return 'claude';
  const src = id || display;
  if (src.includes('opus'))   return 'opus';
  if (src.includes('sonnet')) return 's4.6';
  if (src.includes('haiku'))  return 'haiku';
  return (display || id).slice(0, 8);
}

// Pricing per 1M tokens (USD) — Anthropic rows retained for opt-in tracking
const PRICING = {
  'claude-sonnet-4-6':  { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-opus-4-7':    { input: 15.0,  output: 75.0,  cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.0,   cacheWrite: 1.0,   cacheRead: 0.08 },
  'deepseek-v4-pro':    { input: 0.27,  output: 1.10,  cacheWrite: 0,     cacheRead: 0.07 },
  'deepseek-v4-flash':  { input: 0.07,  output: 0.28,  cacheWrite: 0,     cacheRead: 0.018 },
  'gpt-5.5':            { input: 5.0,   output: 20.0,  cacheWrite: 0,     cacheRead: 0 },
  'gpt-5.4-mini':       { input: 0.15,  output: 0.60,  cacheWrite: 0,     cacheRead: 0 },
  'nemotron-70b':       { input: 0.20,  output: 0.20,  cacheWrite: 0,     cacheRead: 0 },
  'qwen2.5':            { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0 },
};
const DEFAULT_PRICE = PRICING['deepseek-v4-pro'];

function getPrice(modelId) {
  const key = Object.keys(PRICING).find(k => (modelId || '').includes(k));
  return PRICING[key] || DEFAULT_PRICE;
}

let _lastWrittenPct = -1;

function writeContextPct(pct) {
  if (Math.abs(pct - _lastWrittenPct) < 1) return;
  _lastWrittenPct = pct;
  try {
    const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    state.context.pct = pct;
    state.context.last_updated = new Date().toISOString();
    const tmp = `${SESSION_STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, SESSION_STATE_FILE);
  } catch (_) {}
}

// Parse the transcript JSONL for real cumulative token counts.
// Claude CLI passes transcript_path in statusLine data — usage is NOT in the statusLine JSON itself.
function parseTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
    let inputTokens = 0, outputTokens = 0, cacheWrite = 0, cacheRead = 0;
    for (const line of lines) {
      try {
        const u = JSON.parse(line)?.message?.usage;
        if (!u) continue;
        inputTokens += u.input_tokens || 0;
        outputTokens += u.output_tokens || 0;
        cacheWrite  += u.cache_creation_input_tokens || 0;
        cacheRead   += u.cache_read_input_tokens || 0;
      } catch (_) {}
    }
    return { inputTokens, outputTokens, cacheWrite, cacheRead };
  } catch (_) { return null; }
}

function calcCost(t, modelId) {
  const p = getPrice(modelId);
  return (t.inputTokens / 1e6) * p.input
       + (t.outputTokens / 1e6) * p.output
       + (t.cacheWrite   / 1e6) * p.cacheWrite
       + (t.cacheRead    / 1e6) * p.cacheRead;
}

function saveSessionTokens(t, cost, modelId, transcriptPath) {
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const previousInput = session.ledgerInputTokens || 0;
    const previousOutput = session.ledgerOutputTokens || 0;
    const previousCacheWrite = session.ledgerCacheWrite || 0;
    const previousCacheRead = session.ledgerCacheRead || 0;
    const delta = {
      inputTokens: Math.max(0, t.inputTokens - previousInput),
      outputTokens: Math.max(0, t.outputTokens - previousOutput),
      cacheWrite: Math.max(0, t.cacheWrite - previousCacheWrite),
      cacheRead: Math.max(0, t.cacheRead - previousCacheRead),
    };
    if (
      t.inputTokens <= (session.inputTokens || 0)
      && t.outputTokens <= (session.outputTokens || 0)
      && delta.inputTokens + delta.outputTokens + delta.cacheWrite + delta.cacheRead === 0
    ) return;
    if (delta.inputTokens + delta.outputTokens + delta.cacheWrite + delta.cacheRead > 0) {
      writeLedgerEvent({
        event_id: `claude-status-${session.sessionId || 'unknown'}-${t.inputTokens}-${t.outputTokens}-${t.cacheWrite}-${t.cacheRead}`,
        trace_id: `claude-session-${session.sessionId || 'unknown'}`,
        session_id: String(session.sessionId || ''),
        source_path: '.claude/hooks/token-status.js',
        lane: 'yuri-cli',
        provider: 'anthropic-claude-code',
        request_model: modelId || 'claude',
        response_model: modelId || 'claude',
        operation_type: 'claude_transcript_delta',
        status: 'ok',
        measurement_type: 'observed_transcript',
        input_tokens: delta.inputTokens,
        output_tokens: delta.outputTokens,
        cache_write_tokens: delta.cacheWrite,
        cache_read_tokens: delta.cacheRead,
        cost_usd: parseFloat(calcCost(delta, modelId).toFixed(6)),
        accuracy_class: 'exact_transcript',
        payload_hash: hashString(transcriptPath || ''),
        metadata: {
          transcript_path_hash: hashString(transcriptPath || ''),
          cumulative_input_tokens: t.inputTokens,
          cumulative_output_tokens: t.outputTokens,
          cumulative_cache_write_tokens: t.cacheWrite,
          cumulative_cache_read_tokens: t.cacheRead,
        }
      });
    }
    session.inputTokens  = t.inputTokens;
    session.outputTokens = t.outputTokens;
    session.totalTokens  = t.inputTokens + t.outputTokens;
    session.cost         = parseFloat(cost.toFixed(6));
    session.ledgerInputTokens = t.inputTokens;
    session.ledgerOutputTokens = t.outputTokens;
    session.ledgerCacheWrite = t.cacheWrite;
    session.ledgerCacheRead = t.cacheRead;
    session.updatedAt    = new Date().toISOString();
    const tmp = `${SESSION_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
    fs.renameSync(tmp, SESSION_FILE);
  } catch (_) {}
}

function writeLedgerEvent(event) {
  try {
    const child = spawn(process.execPath, [TOKEN_LEDGER, 'write'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin.end(JSON.stringify(event));
    child.unref();
  } catch (_) {}
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

try {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (!input) { console.log('⚫ Idle'); process.exit(0); }

  const data         = JSON.parse(input);
  const modelId      = data?.model?.id || '';
  const modelDisplay = data?.model?.display_name || '';
  const ctx          = data?.context_window?.used_percentage || 0;
  const transcriptPath = data?.transcript_path;
  const elapsed      = data?.elapsed_time_seconds || 0;
  const branch       = data?.git?.branch || '';
  const gitDirty     = data?.git?.status === 'dirty' ? '●' : '○';

  writeContextPct(ctx);

  // Real token data from transcript
  const tokens = parseTranscript(transcriptPath) || { inputTokens: 0, outputTokens: 0, cacheWrite: 0, cacheRead: 0 };
  const cost   = calcCost(tokens, modelId);
  if (tokens.inputTokens > 0) saveSessionTokens(tokens, cost, modelId, transcriptPath);

  // Weekly totals (past sessions + current)
  let weekly = null;
  try { weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE, 'utf8')); } catch (_) {}
  const weeklyTok  = (weekly?.totalTokens || 0) + tokens.inputTokens + tokens.outputTokens;
  const weeklyCost = (weekly?.cost || 0) + cost;

  // TM flag
  let tmOn = false;
  try { tmOn = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'))?.tokenmaxxing === true; } catch (_) {}

  // ── Layout ─────────────────────────────────────────────────────────────────
  const model = shortModel(modelId, modelDisplay);
  const mins  = Math.floor(elapsed / 60);
  const secs  = Math.floor(elapsed % 60);

  // Context window visual bar
  const ctxBar     = bar(ctx, 16);
  const ctxPctStr  = `${C.bold}${ctx.toFixed(0)}%${C.reset}`;
  const ctxSegment = `CTX [${ctxBar}] ${ctxPctStr}`;

  // Token segment
  let tokenSegment = '';
  if (tokens.inputTokens > 0) {
    const inK  = (tokens.inputTokens  / 1000).toFixed(1);
    const outK = (tokens.outputTokens / 1000).toFixed(1);

    // Cache hit rate bar
    const totalInput = tokens.inputTokens + tokens.cacheRead + tokens.cacheWrite;
    const cacheHitPct = totalInput > 0 ? (tokens.cacheRead / totalInput) * 100 : 0;
    const cacheBar  = miniBar(cacheHitPct, 8);
    const cachePct  = `${C.cyan}${cacheHitPct.toFixed(0)}%${C.reset}`;

    const costStr = `${C.dim}$${C.reset}${cost < 1 ? cost.toFixed(3) : cost.toFixed(2)}`;
    tokenSegment = `↑${inK}k ↓${outK}k  ♻[${cacheBar}]${cachePct}  ${costStr}`;
  } else {
    tokenSegment = `${C.dim}no tokens yet${C.reset}`;
  }

  // Weekly segment
  let weeklySegment = '';
  if (weeklyTok > 500) {
    const wK   = (weeklyTok / 1000).toFixed(0);
    const wCost = `$${weeklyCost.toFixed(2)}`;
    weeklySegment = `${C.dim}W:${wK}k/${wCost}${C.reset}`;
  }

  // Git + time
  const branchStr = branch ? `${C.dim}${gitDirty}${branch}${C.reset}` : '';
  const timeStr   = elapsed > 0 ? `${C.dim}${mins}m${secs}s${C.reset}` : '';

  // TM indicator — bold cyan when ON, dim when OFF
  const tmStr = tmOn
    ? `${C.bold}${C.cyan}⚡TM${C.reset}`
    : `${C.dim}○TM${C.reset}`;

  const parts = [
    `${C.bold}🧠 ${model}${C.reset}`,
    ctxSegment,
    tokenSegment,
    weeklySegment,
    branchStr,
    timeStr,
    tmStr,
  ].filter(Boolean);

  console.log(parts.join('  '));
} catch (e) {
  console.log(`⚫ ${e.message?.slice(0, 60) || 'err'}`);
}
