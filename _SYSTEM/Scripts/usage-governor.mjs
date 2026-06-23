#!/usr/bin/env node
// @capability: usage-governor
// @serves: weekly usage tracking | claude max subscription usage | fan-out throttle signal | quota governor | per-tier token usage | how much usage left | pace the week
// @does: reads Claude Code transcripts READ-ONLY and aggregates weekly TOKEN USAGE per model tier + per quota POOL (Opus on its own / Standard = Sonnet+Haiku combined — how MAX weekly limits actually split), then emits a pace + throttle advisory vs a configured weekly USAGE budget. USAGE-not-COST by design: MAX is a flat 20x USAGE subscription, NOT pay-per-token — token usage is the quota signal, there is NO dollar figure. Self-contained (no cost-ledger dependency).
// @use: import { weeklyUsage, scanTranscripts, tierOf, poolOf, paceSignal, loadBudget } for quota awareness before scaling fan-out. CLI: node usage-governor.mjs [--json]. Calibrate _SYSTEM/config/usage-budget.json with the weekly token ceilings you observe.
// @exports: tierOf, poolOf, weightedTokens, scanTranscripts, aggregateRows, weeklyUsage, loadBudget, paceSignal, DEFAULT_BUDGET, POOLS

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');
const BUDGET_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'usage-budget.json');
const CLAUDE_PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');

// MAX weekly limits split into TWO Anthropic pools: Opus on its own, and "all other models" (Sonnet+Haiku)
// combined. 'other' = non-Anthropic lanes (GLM / deepseek) — NOT counted toward the Claude quota, shown for
// visibility only. (The true quota % is NOT locally readable — only token counts are; budget is calibrated.)
export const POOLS = ['opus', 'standard', 'other'];

export function tierOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}
export function poolOf(tier) { return tier === 'opus' ? 'opus' : tier === 'other' ? 'other' : 'standard'; }

// USAGE weighting (NOT dollars): cache-read is the heavily-discounted class, so weight it down; input + output +
// cache-creation count 1:1. A single "usage units" proxy for the opaque MAX weekly quota — calibrate against it.
const CACHE_READ_WEIGHT = 0.1;
export function weightedTokens({ input = 0, output = 0, cacheCreate = 0, cacheRead = 0 } = {}) {
  return Math.round(input + output + cacheCreate + cacheRead * CACHE_READ_WEIGHT);
}

export const DEFAULT_BUDGET = { opusWeeklyTokens: null, standardWeeklyTokens: null };

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

// ── aggregation (pure — tests drive it without touching ~/.claude) ───────────
export function aggregateRows(rows, { now = Date.now(), windowDays = 7, budget = DEFAULT_BUDGET } = {}) {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const TIERS = ['opus', 'sonnet', 'haiku', 'other'];
  const blank = () => ({ events: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
  const tierAcc = {}; for (const t of TIERS) tierAcc[t] = blank();
  for (const r of rows.filter((x) => x.ts >= now - windowMs)) {
    const a = tierAcc[r.tier] || (tierAcc[r.tier] = blank());
    a.events++; a.input += r.input; a.output += r.output; a.cacheRead += r.cacheRead; a.cacheCreate += r.cacheCreate;
  }
  const withUsage = (a) => ({ events: a.events, input: a.input, output: a.output, cacheRead: a.cacheRead, cacheCreate: a.cacheCreate, usage: weightedTokens(a) });
  const perTier = {}; for (const t of TIERS) perTier[t] = withUsage(tierAcc[t]);

  // roll the tiers into the two Anthropic quota pools (+ the non-quota 'other')
  const poolAcc = { opus: blank(), standard: blank(), other: blank() };
  for (const t of TIERS) { const p = poolOf(t), a = tierAcc[t], d = poolAcc[p];
    d.events += a.events; d.input += a.input; d.output += a.output; d.cacheRead += a.cacheRead; d.cacheCreate += a.cacheCreate; }
  const budgetMap = { opus: budget?.opusWeeklyTokens ?? null, standard: budget?.standardWeeklyTokens ?? null, other: null };
  const perPool = {};
  for (const p of POOLS) {
    const a = poolAcc[p], usage = weightedTokens(a), b = budgetMap[p];
    perPool[p] = { events: a.events, input: a.input, output: a.output, cacheRead: a.cacheRead, cacheCreate: a.cacheCreate,
      usage, budgetTokens: b, pctOfBudget: b ? Number(((usage / b) * 100).toFixed(1)) : null, pace: paceSignal(usage, b, windowDays) };
  }
  return { window: { start: new Date(now - windowMs).toISOString(), end: new Date(now).toISOString(), windowDays }, perPool, perTier };
}

export function weeklyUsage({ now = Date.now(), windowDays = 7, budget } = {}) {
  const b = budget ?? loadBudget();
  const rows = scanTranscripts({ sinceMs: now - windowDays * 24 * 60 * 60 * 1000 });
  return aggregateRows(rows, { now, windowDays, budget: b });
}

export function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return { ...DEFAULT_BUDGET };
  try { const raw = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
    return { opusWeeklyTokens: raw.opusWeeklyTokens ?? null, standardWeeklyTokens: raw.standardWeeklyTokens ?? null }; }
  catch { return { ...DEFAULT_BUDGET }; }
}

// ── pace + throttle (pure; trailing-window usage vs the weekly ceiling, NO dollars) ──
export function paceSignal(usage, budgetTokens) {
  if (!budgetTokens) return { throttle: 'hold', headroomPct: null, reason: 'no weekly budget set — calibrate _SYSTEM/config/usage-budget.json' };
  const pct = (usage / budgetTokens) * 100;
  const headroomPct = Number((100 - pct).toFixed(1));
  let throttle, reason;
  if (pct < 70) { throttle = 'up'; reason = `${pct.toFixed(0)}% of weekly cap used — ${headroomPct}% headroom, scale fan-out UP`; }
  else if (pct > 90) { throttle = 'down'; reason = `${pct.toFixed(0)}% of weekly cap used — near the ceiling, throttle DOWN`; }
  else { throttle = 'hold'; reason = `${pct.toFixed(0)}% of weekly cap used — on track, HOLD`; }
  return { throttle, headroomPct, reason };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString();
const POOL_LABEL = { opus: 'OPUS pool', standard: 'STANDARD pool (Sonnet + Haiku)', other: 'OTHER (GLM / non-Claude — not quota)' };

function printReport(report) {
  const { window: win, perPool, perTier } = report;
  console.log(`\n═══ YURI Weekly Usage — Claude MAX 20× (flat usage, not $) ════════════`);
  console.log(`  Window : ${win.start.slice(0, 10)} → ${win.end.slice(0, 10)}  (rolling ${win.windowDays}d)`);
  console.log(`  Source : ~/.claude/projects/**/*.jsonl  ·  usage = in+out+cacheWrite + 0.1×cacheRead`);
  console.log(`──────────────────────────────────────────────────────────────────────`);
  for (const p of POOLS) {
    const d = perPool[p]; if (!d.events) continue;
    console.log(`\n  ▸ ${POOL_LABEL[p]} — ${d.events} events`);
    console.log(`    usage:       ${fmt(d.usage).padStart(14)} tokens   (in ${fmt(d.input)} · out ${fmt(d.output)} · cacheW ${fmt(d.cacheCreate)} · cacheR ${fmt(d.cacheRead)})`);
    if (d.budgetTokens) console.log(`    budget:      ${fmt(d.budgetTokens).padStart(14)} tokens   → ${d.pctOfBudget}% used`);
    const sig = d.pace.throttle === 'up' ? '↑ UP  ' : d.pace.throttle === 'down' ? '↓ DOWN' : '→ HOLD';
    console.log(`    throttle:    ${sig}   ${d.pace.reason}`);
    if (p === 'standard') for (const t of ['sonnet', 'haiku']) { const s = perTier[t]; if (s.events) console.log(`      · ${t.padEnd(6)} ${fmt(s.usage).padStart(12)} usage (${s.events} ev)`); }
  }
  console.log(`\n──────────────────────────────────────────────────────────────────────`);
  console.log(`  Note: MAX is a flat USAGE subscription — token usage is the quota signal, not $.`);
  console.log(`  Anthropic's exact weekly % is not locally readable; set per-pool ceilings in`);
  console.log(`  _SYSTEM/config/usage-budget.json {opusWeeklyTokens, standardWeeklyTokens} to arm pacing.`);
  console.log(`═══════════════════════════════════════════════════════════════════════\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = weeklyUsage();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}
