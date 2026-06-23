#!/usr/bin/env node
// @capability: usage-governor
// @serves: weekly usage tracking | claude max subscription usage | 5-hour burst usage | fan-out throttle signal | quota governor | per-pool token usage | how much usage left | pace the week
// @does: reads Claude Code transcripts READ-ONLY and aggregates TOKEN USAGE per Claude MAX quota POOL over BOTH the weekly and the 5-hour window, then emits an advisory throttle vs a configured budget. THE MAX 20x MODEL: ALL Anthropic models EXCEPT Sonnet share ONE 'main' pool (a weekly limit + a 5-hour limit); SONNET has its OWN separate weekly pool; 'other' = non-Anthropic lanes (GLM/deepseek), not Claude quota. USAGE-not-COST by design — MAX is flat usage, not pay-per-token; there is NO dollar figure. Self-contained.
// @use: import { weeklyUsage, scanTranscripts, tierOf, poolOf, paceSignal, loadBudget } for quota awareness before scaling fan-out. CLI: node usage-governor.mjs [--json]. Calibrate _SYSTEM/config/usage-budget.json {mainWeeklyTokens, main5hTokens, sonnetWeeklyTokens, sonnet5hTokens}.
// @exports: tierOf, poolOf, weightedTokens, scanTranscripts, aggregateRows, weeklyUsage, loadBudget, paceSignal, DEFAULT_BUDGET, POOLS

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');
const BUDGET_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'usage-budget.json');
const CLAUDE_PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIVE_H_MS = 5 * 60 * 60 * 1000;

// MAX 20x pools: 'main' = every Anthropic model EXCEPT Sonnet (Opus + Haiku + …), one shared weekly + 5-hour
// limit. 'sonnet' = Sonnet alone, its OWN separate weekly. 'other' = non-Anthropic (GLM/deepseek), not quota.
export const POOLS = ['main', 'sonnet', 'other'];

export function tierOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}
export function poolOf(tier) { return tier === 'sonnet' ? 'sonnet' : tier === 'other' ? 'other' : 'main'; }

// USAGE weighting (NOT dollars): cache-read is the heavily-discounted class → 0.1×; input/output/cache-create 1:1.
const CACHE_READ_WEIGHT = 0.1;
export function weightedTokens({ input = 0, output = 0, cacheCreate = 0, cacheRead = 0 } = {}) {
  return Math.round(input + output + cacheCreate + cacheRead * CACHE_READ_WEIGHT);
}

export const DEFAULT_BUDGET = { mainWeeklyTokens: null, main5hTokens: null, sonnetWeeklyTokens: null, sonnet5hTokens: null };

// ── transcript scan (READ-ONLY on ~/.claude) ─────────────────────────────────
function walkJsonl(dir, files = []) {
  let entries; try { entries = readdirSync(dir); } catch { return files; }
  for (const e of entries) {
    const full = path.join(dir, e);
    try { const st = statSync(full); if (st.isDirectory()) walkJsonl(full, files); else if (e.endsWith('.jsonl')) files.push(full); }
    catch { /* skip inaccessible */ }
  }
  return files;
}
export function scanTranscripts({ sinceMs = 0, root = CLAUDE_PROJECTS_ROOT } = {}) {
  const rows = [];
  for (const file of walkJsonl(root)) {
    let lines; try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (!Number.isFinite(ts) || ts < sinceMs) continue;
      const msg = obj.message; if (!msg) continue;
      const model = msg.model; if (!model || model === '<synthetic>') continue;
      const u = msg.usage; if (!u) continue;
      const input = Number(u.input_tokens) || 0, output = Number(u.output_tokens) || 0;
      const cacheRead = Number(u.cache_read_input_tokens) || 0, cacheCreate = Number(u.cache_creation_input_tokens) || 0;
      if (!input && !output && !cacheRead && !cacheCreate) continue;
      rows.push({ ts, tier: tierOf(model), model, input, output, cacheRead, cacheCreate });
    }
  }
  return rows;
}

// ── aggregation over ONE window (pure — tests drive it without touching ~/.claude) ──
const blank = () => ({ events: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
const budgetKey = (pool, kind) => (pool === 'main' ? 'main' : pool === 'sonnet' ? 'sonnet' : null) && `${pool}${kind === '5h' ? '5h' : 'Weekly'}Tokens`;

export function aggregateRows(rows, { now = Date.now(), windowMs = WEEK_MS, budget = DEFAULT_BUDGET, windowKind = 'weekly' } = {}) {
  const TIERS = ['opus', 'sonnet', 'haiku', 'other'];
  const tierAcc = {}; for (const t of TIERS) tierAcc[t] = blank();
  for (const r of rows.filter((x) => x.ts >= now - windowMs)) {
    const a = tierAcc[r.tier] || (tierAcc[r.tier] = blank());
    a.events++; a.input += r.input; a.output += r.output; a.cacheRead += r.cacheRead; a.cacheCreate += r.cacheCreate;
  }
  const withUsage = (a) => ({ events: a.events, input: a.input, output: a.output, cacheRead: a.cacheRead, cacheCreate: a.cacheCreate, usage: weightedTokens(a) });
  const perTier = {}; for (const t of TIERS) perTier[t] = withUsage(tierAcc[t]);

  const poolAcc = { main: blank(), sonnet: blank(), other: blank() };
  for (const t of TIERS) { const p = poolOf(t), a = tierAcc[t], d = poolAcc[p];
    d.events += a.events; d.input += a.input; d.output += a.output; d.cacheRead += a.cacheRead; d.cacheCreate += a.cacheCreate; }

  const perPool = {};
  for (const p of POOLS) {
    const a = poolAcc[p], usage = weightedTokens(a);
    const bk = budgetKey(p, windowKind);
    const b = bk ? (budget?.[bk] ?? null) : null;
    perPool[p] = { ...withUsage(a), usage, budgetTokens: b, pctOfBudget: b ? Number(((usage / b) * 100).toFixed(1)) : null, pace: paceSignal(usage, b) };
  }
  return { window: { start: new Date(now - windowMs).toISOString(), end: new Date(now).toISOString(), windowMs }, perPool, perTier };
}

// ── public: BOTH windows (weekly + 5-hour) per pool ──────────────────────────
export function weeklyUsage({ now = Date.now(), budget } = {}) {
  const b = budget ?? loadBudget();
  const rows = scanTranscripts({ sinceMs: now - WEEK_MS });
  const weekly = aggregateRows(rows, { now, windowMs: WEEK_MS, budget: b, windowKind: 'weekly' });
  const fiveHour = aggregateRows(rows, { now, windowMs: FIVE_H_MS, budget: b, windowKind: '5h' });
  const perPool = {};
  for (const p of POOLS) perPool[p] = { weekly: weekly.perPool[p], fiveHour: fiveHour.perPool[p] };
  return { windows: { weekly: weekly.window, fiveHour: fiveHour.window }, perPool, perTier: weekly.perTier };
}

export function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return { ...DEFAULT_BUDGET };
  try { const raw = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
    return { mainWeeklyTokens: raw.mainWeeklyTokens ?? null, main5hTokens: raw.main5hTokens ?? null, sonnetWeeklyTokens: raw.sonnetWeeklyTokens ?? null, sonnet5hTokens: raw.sonnet5hTokens ?? null }; }
  catch { return { ...DEFAULT_BUDGET }; }
}

// ── pace + throttle (pure; usage vs the ceiling, NO dollars) ──────────────────
export function paceSignal(usage, budgetTokens) {
  if (!budgetTokens) return { throttle: 'hold', headroomPct: null, reason: 'no budget set — calibrate _SYSTEM/config/usage-budget.json' };
  const pct = (usage / budgetTokens) * 100;
  const headroomPct = Number((100 - pct).toFixed(1));
  let throttle, reason;
  if (pct < 70) { throttle = 'up'; reason = `${pct.toFixed(0)}% used — ${headroomPct}% headroom, scale UP`; }
  else if (pct > 90) { throttle = 'down'; reason = `${pct.toFixed(0)}% used — near the cap, throttle DOWN`; }
  else { throttle = 'hold'; reason = `${pct.toFixed(0)}% used — on track, HOLD`; }
  return { throttle, headroomPct, reason };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString();
const POOL_LABEL = { main: 'MAIN pool (all Claude except Sonnet — weekly + 5h)', sonnet: 'SONNET pool (separate weekly)', other: 'OTHER (GLM / non-Claude — not quota)' };

function line(d) {
  const sig = d.pace.throttle === 'up' ? '↑ UP  ' : d.pace.throttle === 'down' ? '↓ DOWN' : '→ HOLD';
  const bud = d.budgetTokens ? `${d.pctOfBudget}% of ${fmt(d.budgetTokens)}` : 'no budget';
  return `${fmt(d.usage).padStart(14)} usage · ${bud} · ${sig} ${d.pace.reason}`;
}
function printReport(report) {
  const { windows, perPool, perTier } = report;
  console.log(`\n═══ YURI Usage — Claude MAX 20× (flat usage, not $) ═══════════════════`);
  console.log(`  Weekly : ${windows.weekly.start.slice(0, 10)} → ${windows.weekly.end.slice(0, 10)} (rolling 7d)  ·  Burst: rolling 5h`);
  console.log(`  Source : ~/.claude/projects/**/*.jsonl  ·  usage = in+out+cacheWrite + 0.1×cacheRead`);
  console.log(`──────────────────────────────────────────────────────────────────────`);
  for (const p of POOLS) {
    const w = perPool[p].weekly, h = perPool[p].fiveHour;
    if (!w.events && !h.events) continue;
    console.log(`\n  ▸ ${POOL_LABEL[p]}`);
    console.log(`    weekly: ${line(w)}`);
    if (p !== 'other') console.log(`    5-hour: ${line(h)}`);
    if (p === 'main') for (const t of ['opus', 'haiku']) { const s = perTier[t]; if (s.events) console.log(`      · ${t.padEnd(6)} ${fmt(s.usage).padStart(12)} weekly (${s.events} ev)`); }
  }
  console.log(`\n──────────────────────────────────────────────────────────────────────`);
  console.log(`  MAX is flat USAGE — tokens are the quota signal, not $. Anthropic's exact % isn't`);
  console.log(`  locally readable; calibrate _SYSTEM/config/usage-budget.json`);
  console.log(`  {mainWeeklyTokens, main5hTokens, sonnetWeeklyTokens, sonnet5hTokens} to arm pacing.`);
  console.log(`═══════════════════════════════════════════════════════════════════════\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = weeklyUsage();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}
