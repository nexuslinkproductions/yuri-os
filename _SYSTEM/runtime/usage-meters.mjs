#!/usr/bin/env node
// @capability: usage-meters
// @serves: per-provider usage tracking | z.ai usage meter | ollama usage meter | anthropic usage meter | pace signal | weekly quota pacing | usage snapshot | morning brief feed
// @does: Tracks per-provider (zai / ollama / anthropic) token USAGE from honest local telemetry sources — .claude/jobs result files (zai/ollama estimates) and usage-governor.mjs (anthropic). Records manual entries. Sweeps new job results idempotently via scan watermark. Renders per-pool status with real-vs-estimated split and a pace verdict (imports paceSignal from usage-governor where possible, else own linear consume-by-deadline curve). Writes a JSON snapshot for the morning brief. No provider API calls — local files only. Estimates are LABELLED as estimates (chars/4); never fakes precision.
// @use: CLI: `node usage-meters.mjs record --pool zai --tokens 5000 --label 'fleet dispatch'` · `node usage-meters.mjs record --pool ollama --chars 12000 --label 'scout'` · `node usage-meters.mjs scan` · `node usage-meters.mjs status [--json]`. Config: _SYSTEM/state/runtime/usage-config.json {pools:{zai:{period:'week',budget:null},ollama:{period:'week',budget:null},anthropic:{period:'week',budget:null}}}. Import: {record, scan, buildStatus, writeSnapshot, POOLS, laneIdToPool, DEFAULT_CONFIG}.
// @exports: record, scan, buildStatus, writeSnapshot, briefLines, POOLS, LANE_TO_POOL, laneIdToPool, DEFAULT_CONFIG, periodBounds, estimateTokens, linearPace

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'runtime');
const CONFIG_PATH = path.join(STATE_DIR, 'usage-config.json');
const LEDGER_PATH = path.join(STATE_DIR, 'usage-ledger.jsonl');
const SNAPSHOT_PATH = path.join(STATE_DIR, 'usage-meters.json');
const WATERMARK_PATH = path.join(STATE_DIR, 'usage-scan-watermark.json');
const EVENTS_PATH = path.join(STATE_DIR, 'events.jsonl');
const JOBS_DIR = path.join(REPO_ROOT, '.claude', 'jobs');

export const POOLS = ['zai', 'ollama', 'anthropic'];

// ── laneId → pool mapping (from real .claude/jobs inspection) ────────────────
// zai: glm, glm-max, glm-flash, glm-turbo, glm-4.7, zai-tmux:*, cline:*glm*
// ollama: ollama-cloud:*
// anthropic: sonnet, opus, haiku (but anthropic side primarily read via usage-governor)
const LANE_TO_POOL = [
  { match: /^ollama-cloud:/, pool: 'ollama' },
  { match: /^zai-tmux:/, pool: 'zai' },
  { match: /^cline:.*glm/, pool: 'zai' },
  { match: /^glm/, pool: 'zai' },
  { match: /^sonnet/, pool: 'anthropic' },
  { match: /^opus/, pool: 'anthropic' },
  { match: /^haiku/, pool: 'anthropic' },
];

export function laneIdToPool(laneId) {
  const id = String(laneId || '');
  for (const { match, pool } of LANE_TO_POOL) {
    if (match.test(id)) return pool;
  }
  return null; // unmapped lane (e.g. 'inline:calibrator') — skip
}

// ── config ───────────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  pools: {
    zai: { period: 'week', budget: null },      // budget in tokens; null = report without pace verdict
    ollama: { period: 'week', budget: null },
    anthropic: { period: 'week', budget: null },
  },
};

export function loadConfig(configPath) {
  const p = configPath || CONFIG_PATH;
  if (!existsSync(p)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    // merge with defaults so missing pools/keys don't crash
    const merged = structuredClone(DEFAULT_CONFIG);
    for (const pool of POOLS) {
      if (raw.pools && raw.pools[pool]) {
        merged.pools[pool].period = raw.pools[pool].period || merged.pools[pool].period;
        merged.pools[pool].budget = raw.pools[pool].budget ?? null;
      }
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

// ── period window ────────────────────────────────────────────────────────────
const PERIOD_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export function periodBounds(period, now = Date.now()) {
  const ms = PERIOD_MS[period] || PERIOD_MS.week;
  // week aligns to Monday 00:00 local (ISO week start) for a stable window
  if (period === 'week') {
    const d = new Date(now);
    const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const mondayMidnight = new Date(d);
    mondayMidnight.setHours(0, 0, 0, 0);
    mondayMidnight.setDate(d.getDate() - dayOfWeek);
    const start = mondayMidnight.getTime();
    return { start, end: start + ms, ms };
  }
  return { start: now - ms, end: now, ms };
}

// ── token estimation ─────────────────────────────────────────────────────────
const CHARS_PER_TOKEN = 4;
export function estimateTokens(chars) {
  return Math.max(0, Math.ceil(Number(chars) / CHARS_PER_TOKEN));
}

// ── ledger ───────────────────────────────────────────────────────────────────
// Each ledger line: {t, pool, tokens, estimated:bool, label, source}
export function readLedger(ledgerPath) {
  const p = ledgerPath || LEDGER_PATH;
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return entries;
}

function appendLedger(entry, ledgerPath) {
  const p = ledgerPath || LEDGER_PATH;
  appendFileSync(p, JSON.stringify(entry) + '\n', 'utf8');
}

// ── event bus ────────────────────────────────────────────────────────────────
function emitEvent(event, data, eventsPath) {
  const p = eventsPath || EVENTS_PATH;
  try {
    appendFileSync(p, JSON.stringify({ t: new Date().toISOString(), comp: 'meters', event, data }) + '\n', 'utf8');
  } catch { /* non-critical */ }
}

// ── record ───────────────────────────────────────────────────────────────────
export function record({ pool, tokens, chars, label, source }, opts = {}) {
  if (!POOLS.includes(pool)) throw new Error(`Invalid pool '${pool}'. Must be one of: ${POOLS.join(', ')}`);
  let tokenCount = null;
  let estimated = false;
  if (tokens != null) {
    tokenCount = Math.max(0, Math.round(Number(tokens)));
  } else if (chars != null) {
    tokenCount = estimateTokens(Number(chars));
    estimated = true;
  } else {
    throw new Error('Must provide --tokens N or --chars N');
  }
  const entry = {
    t: new Date().toISOString(),
    pool,
    tokens: tokenCount,
    estimated,
    label: label || '',
    source: source || 'manual',
  };
  appendLedger(entry, opts.ledgerPath);
  emitEvent('record', { pool, tokens: tokenCount, estimated, label: entry.label }, opts.eventsPath);
  return entry;
}

// ── scan: sweep .claude/jobs result files newer than watermark ───────────────
export function scan(opts = {}) {
  const jobsDir = opts.jobsDir || JOBS_DIR;
  const watermarkPath = opts.watermarkPath || WATERMARK_PATH;
  const ledgerPath = opts.ledgerPath || LEDGER_PATH;

  // read watermark (last scan time)
  let watermark = 0;
  if (existsSync(watermarkPath)) {
    try { watermark = JSON.parse(readFileSync(watermarkPath, 'utf8')).lastScanMs || 0; } catch { /* ignore */ }
  }
  const scanStart = Date.now();

  // walk job dirs → results/*.json
  let jobDirs = [];
  try { jobDirs = readdirSync(jobsDir).filter(e => statSync(path.join(jobsDir, e)).isDirectory()); } catch { jobDirs = []; }

  const newEntries = [];
  const scannedFiles = [];
  let maxMtimeSeen = 0;

  for (const jobDir of jobDirs) {
    const resultsDir = path.join(jobsDir, jobDir, 'results');
    let resultFiles = [];
    try { resultFiles = readdirSync(resultsDir).filter(f => f.endsWith('.json')); } catch { continue; }

    for (const rf of resultFiles) {
      const fullPath = path.join(resultsDir, rf);
      let st;
      try { st = statSync(fullPath); } catch { continue; }
      if (st.mtimeMs <= watermark) continue;
      if (st.mtimeMs > maxMtimeSeen) maxMtimeSeen = st.mtimeMs;

      let data;
      try { data = JSON.parse(readFileSync(fullPath, 'utf8')); } catch { continue; }

      const pool = laneIdToPool(data.laneId);
      // skip anthropic (usage-governor handles it) and unmapped lanes
      if (!pool || pool === 'anthropic') { scannedFiles.push(fullPath); continue; }

      const textLen = (data.text || '').length;
      const taskLen = (data.task || '').length;
      const totalChars = textLen + taskLen;
      if (totalChars === 0) { scannedFiles.push(fullPath); continue; }

      const estimatedTokens = estimateTokens(totalChars);

      const entry = {
        t: new Date(st.mtimeMs).toISOString(),
        pool,
        tokens: estimatedTokens,
        estimated: true,
        label: `${jobDir}/${rf} (${data.laneId})`,
        source: `scan:${fullPath}`,
      };
      appendLedger(entry, ledgerPath);
      newEntries.push(entry);
      scannedFiles.push(fullPath);
    }
  }

  // write new watermark — use max of scanStart and highest mtime seen
  // (filesystem mtimeMs has sub-ms precision that can exceed Date.now() integer ms;
  //  taking the max prevents re-scanning the same files on the next pass)
  const watermarkNow = Math.ceil(Math.max(maxMtimeSeen, scanStart));
  mkdirSync(path.dirname(watermarkPath), { recursive: true });
  writeFileSync(watermarkPath, JSON.stringify({ lastScanMs: watermarkNow, scannedAt: new Date(scanStart).toISOString(), filesScanned: scannedFiles.length, entriesAdded: newEntries.length }, null, 2) + '\n', 'utf8');

  emitEvent('scan', { filesScanned: scannedFiles.length, entriesAdded: newEntries.length, watermark: watermarkNow });
  return { filesScanned: scannedFiles.length, entriesAdded: newEntries.length, newEntries, watermark: watermarkNow };
}

// ── pace math (fallback when usage-governor paceSignal not available) ─────────
// Linear consume-by-deadline: target = elapsed_fraction × budget.
// ahead/behind = (actual_usage - target) / target × 100
export function linearPace(usage, budget, { startMs, endMs, now = Date.now() } = {}) {
  if (budget == null || budget <= 0) {
    return { throttle: 'hold', headroomPct: null, aheadBehindPct: null, reason: 'no budget set — configure _SYSTEM/state/runtime/usage-config.json' };
  }
  const totalMs = endMs - startMs;
  if (totalMs <= 0) {
    return { throttle: 'hold', headroomPct: Number((100 - (usage / budget) * 100).toFixed(1)), aheadBehindPct: null, reason: 'period has zero or negative duration' };
  }
  const elapsedMs = Math.max(0, Math.min(totalMs, now - startMs));
  const elapsedFraction = elapsedMs / totalMs;
  const targetUsage = elapsedFraction * budget;
  const usagePct = (usage / budget) * 100;
  const headroomPct = Number((100 - usagePct).toFixed(1));

  let aheadBehindPct = null;
  let throttle, reason;
  if (targetUsage > 0) {
    aheadBehindPct = Number(((usage - targetUsage) / targetUsage * 100).toFixed(1));
  }

  // throttle decision: are we behind (under-spending) or ahead (over-spending)?
  // 'up' = behind pace, consume more; 'down' = way ahead, throttle; 'hold' = on track
  if (aheadBehindPct != null) {
    if (aheadBehindPct < -30) {
      throttle = 'up';
      reason = `${usagePct.toFixed(0)}% used vs ${Math.round(elapsedFraction * 100)}% elapsed — ${Math.abs(aheadBehindPct)}% BEHIND pace, scale UP`;
    } else if (aheadBehindPct > 30) {
      throttle = 'down';
      reason = `${usagePct.toFixed(0)}% used vs ${Math.round(elapsedFraction * 100)}% elapsed — ${aheadBehindPct}% AHEAD of pace, throttle DOWN`;
    } else {
      throttle = 'hold';
      reason = `${usagePct.toFixed(0)}% used vs ${Math.round(elapsedFraction * 100)}% elapsed — ${aheadBehindPct > 0 ? '+' : ''}${aheadBehindPct}% vs target, on track HOLD`;
    }
  } else {
    throttle = 'hold';
    reason = `${usagePct.toFixed(0)}% used, unable to compute elapsed fraction`;
  }

  return { throttle, headroomPct, aheadBehindPct, reason, elapsedFraction: Number(elapsedFraction.toFixed(4)), targetUsage: Math.round(targetUsage) };
}

// ── build status ─────────────────────────────────────────────────────────────
export async function buildStatus(opts = {}) {
  const config = opts.config || loadConfig(opts.configPath);
  const ledger = readLedger(opts.ledgerPath);
  const now = opts.now || Date.now();

  // try importing paceSignal from usage-governor
  let govPaceSignal = null;
  if (opts.useGovernor !== false) {
    try {
      const govPath = opts.governorPath || pathToFileURL(path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'usage-governor.mjs')).href;
      const gov = await import(govPath);
      if (typeof gov.paceSignal === 'function') govPaceSignal = gov.paceSignal;
    } catch { /* fall back to linearPace */ }
  }

  const perPool = {};
  for (const pool of POOLS) {
    const poolCfg = config.pools[pool] || { period: 'week', budget: null };
    const period = poolCfg.period || 'week';
    const bounds = periodBounds(period, now);

    // filter ledger entries for this pool within the period window
    const inWindow = ledger.filter(e => {
      if (e.pool !== pool) return false;
      const ts = Date.parse(e.t);
      return Number.isFinite(ts) && ts >= bounds.start && ts <= bounds.end;
    });

    // aggregate
    let realTokens = 0, estimatedTokens = 0, events = 0;
    for (const e of inWindow) {
      events++;
      if (e.estimated) estimatedTokens += e.tokens;
      else realTokens += e.tokens;
    }
    const totalTokens = realTokens + estimatedTokens;
    const budget = poolCfg.budget ?? null;

    // pace verdict
    let pace;
    if (govPaceSignal && budget != null) {
      // use governor's paceSignal (threshold-based: <70% up, 70-90% hold, >90% down)
      const sig = govPaceSignal(totalTokens, budget);
      pace = { method: 'governor-paceSignal', ...sig };
    } else {
      // own linear consume-by-deadline
      const lp = linearPace(totalTokens, budget, { startMs: bounds.start, endMs: bounds.end, now });
      pace = { method: 'linear-consume-by-deadline', ...lp };
    }

    perPool[pool] = {
      period,
      window: { start: new Date(bounds.start).toISOString(), end: new Date(bounds.end).toISOString() },
      usage: {
        total: totalTokens,
        real: realTokens,
        estimated: estimatedTokens,
        estimatedFraction: totalTokens > 0 ? Number((estimatedTokens / totalTokens * 100).toFixed(1)) : 0,
        events,
      },
      budget,
      budgetPct: budget ? Number(((totalTokens / budget) * 100).toFixed(1)) : null,
      pace,
    };
  }

  return {
    generatedAt: new Date(now).toISOString(),
    config,
    perPool,
  };
}

// ── write snapshot ───────────────────────────────────────────────────────────
export async function writeSnapshot(opts = {}) {
  const status = await buildStatus(opts);
  const snapPath = opts.snapshotPath || SNAPSHOT_PATH;
  mkdirSync(path.dirname(snapPath), { recursive: true });
  writeFileSync(snapPath, JSON.stringify(status, null, 2) + '\n', 'utf8');
  emitEvent('snapshot', { snapshotPath: snapPath, pools: POOLS }, opts.eventsPath);
  return { snapshotPath: snapPath, status };
}

// ── brief feed: compact per-pool one-liners for the morning brief ────────────
//
// SEAM CONTRACT (usage-meters → morning-brief):
//   briefLines(snapshot) is the STABLE contract that morning-brief.mjs consumes.
//   It takes a snapshot object (as produced by buildStatus/writeSnapshot) and
//   returns { lines: string[] } — one compact line per pool, ordered by POOLS.
//   The morning brief's usage() source calls this; it NEVER parses the snapshot
//   shape itself. If snapshot is null/missing, returns { unavailable: true }.
//
//   Line format: `pool: N,NNN tok (est|real) · week YYYY-MM-DD→MM-DD · pace VERB (detail)`
//   Example:     `zai: 108,627 tok (est) · week 2026-06-28→07-05 · pace HOLD (no budget)`
//
export function briefLines(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { unavailable: true, reason: 'no usage snapshot' };
  }
  const perPool = snapshot.perPool;
  if (!perPool || typeof perPool !== 'object') {
    return { unavailable: true, reason: 'snapshot has no perPool' };
  }
  const lines = [];
  for (const pool of POOLS) {
    const p = perPool[pool];
    if (!p) continue;
    const u = p.usage || {};
    const total = fmt(u.total || 0);

    // est/real label
    const estLabel = u.estimatedFraction != null && u.estimatedFraction > 0
      ? '(est)'
      : u.real > 0 ? '(real)' : '(est)';

    // week window: 2026-06-28→07-05 (strip year from end if same year as start)
    const ws = p.window?.start ? p.window.start.slice(0, 10) : '?';
    const weRaw = p.window?.end ? p.window.end.slice(0, 10) : '?';
    const we = (ws !== '?' && weRaw !== '?' && ws.slice(0, 4) === weRaw.slice(0, 4))
      ? weRaw.slice(5)  // MM-DD when same year
      : weRaw;
    const windowStr = `${p.period || 'week'} ${ws}→${we}`;

    // pace verb
    const pace = p.pace || {};
    const verb = (pace.throttle || 'hold').toUpperCase();
    const detail = p.budget != null
      ? `${pace.headroomPct != null ? pace.headroomPct + '%' : '?'} headroom`
      : 'no budget';

    lines.push(`  ${pool}: ${total} tok ${estLabel} · ${windowStr} · pace ${verb} (${detail})`);
  }
  if (lines.length === 0) {
    return { unavailable: true, reason: 'snapshot has no pools' };
  }
  return { lines };
}

// ── CLI rendering ────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const POOL_DESC = {
  zai: 'z.ai (GLM / glm-max / glm-flash / zai-tmux / cline:glm)',
  ollama: 'ollama-cloud (deepseek / kimi / minimax / etc)',
  anthropic: 'Anthropic (Sonnet / Opus / Haiku)',
};

function renderStatus(status) {
  const lines = [];
  lines.push('');
  lines.push('═══ YURI Usage Meters — per-provider pools ══════════════════════════');
  lines.push(`  Generated: ${status.generatedAt}`);
  lines.push('──────────────────────────────────────────────────────────────────────');

  for (const pool of POOLS) {
    const p = status.perPool[pool];
    const u = p.usage;
    const estLabel = u.estimatedFraction > 0 ? ` (est: ${u.estimatedFraction}%)` : '';
    const budLabel = p.budget ? `${p.budgetPct}% of ${fmt(p.budget)}` : 'no budget';

    const arrow = p.pace.throttle === 'up' ? '↑ UP  ' : p.pace.throttle === 'down' ? '↓ DOWN' : '→ HOLD';

    lines.push('');
    lines.push(`  ▸ ${pool.toUpperCase()} — ${POOL_DESC[pool]}`);
    lines.push(`    period: ${p.period} | ${p.window.start.slice(0, 10)} → ${p.window.end.slice(0, 10)}`);
    lines.push(`    usage:  ${fmt(u.total)} tokens${estLabel} | ${u.events} events | real: ${fmt(u.real)} est: ${fmt(u.estimated)}`);
    lines.push(`    budget: ${budLabel}`);
    lines.push(`    pace:   ${arrow} ${p.pace.reason} [${p.pace.method}]`);
  }

  lines.push('');
  lines.push('──────────────────────────────────────────────────────────────────────');
  lines.push('  z.ai/ollama token counts are ESTIMATES (chars÷4) from .claude/jobs');
  lines.push('  result files — no provider API called. Anthropic side tracked via');
  lines.push('  usage-governor.mjs transcripts. Set budgets in:');
  lines.push('  _SYSTEM/state/runtime/usage-config.json to arm pacing.');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('');
  return lines.join('\n');
}

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    return { cmd: 'status' }; // default
  }
  const cmd = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--pool') { opts.pool = args[++i]; continue; }
    if (a === '--tokens') { opts.tokens = args[++i]; continue; }
    if (a === '--chars') { opts.chars = args[++i]; continue; }
    if (a === '--label') { opts.label = args[++i]; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--status') { opts.status = true; continue; }
  }
  return { cmd, ...opts };
}

// ── main CLI ─────────────────────────────────────────────────────────────────
async function main() {
  const { cmd, pool, tokens, chars, label, json } = parseArgs(process.argv);

  if (cmd === 'record') {
    if (!pool) { console.error('Error: --pool required (zai|ollama|anthropic)'); process.exit(1); }
    const entry = record({ pool, tokens: tokens != null ? Number(tokens) : undefined, chars: chars != null ? Number(chars) : undefined, label });
    if (json) console.log(JSON.stringify(entry));
    else console.log(`recorded: ${entry.pool} ${fmt(entry.tokens)} tokens${entry.estimated ? ' (estimated)' : ''} — ${entry.label}`);
    return;
  }

  if (cmd === 'scan') {
    const result = scan();
    if (json) console.log(JSON.stringify(result));
    else console.log(`scan: ${result.filesScanned} files, ${result.entriesAdded} entries added (watermark: ${new Date(result.watermark).toISOString()})`);
    return;
  }

  if (cmd === 'status' || cmd === '--status') {
    const status = await writeSnapshot();
    if (json) console.log(JSON.stringify(status.status, null, 2));
    else console.log(renderStatus(status.status));
    return;
  }

  console.error(`Unknown command '${cmd}'. Use: record | scan | status [--json]`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
