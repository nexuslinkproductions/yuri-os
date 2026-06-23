#!/usr/bin/env node
// @capability: usage-governor
// @serves: weekly token budget | claude usage reporting | fan-out throttle signal | quota governor | per-tier usage
// @does: reads Claude Code transcripts, aggregates per-tier weekly token usage, computes cost via token-ledger, emits pace+throttle advisory
// @use: import { weeklyUsage, scanTranscripts, tierOf, paceSignal, loadBudget } when you need weekly quota awareness before spawning agents
// @exports: tierOf, scanTranscripts, weeklyUsage, loadBudget, paceSignal, aggregateRows, DEFAULT_BUDGET

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateCostUsd,
  calculateEffectiveTokens,
  getPricingPolicy,
} from './token-ledger.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');
const BUDGET_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'usage-budget.json');
const CLAUDE_PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');

export const DEFAULT_BUDGET = {
  opusWeeklyTokens: null,
  sonnetWeeklyTokens: null,
  haikuWeeklyTokens: null,
};

// ── tier classification ──────────────────────────────────────────────────────

export function tierOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

// ── transcript scanning ──────────────────────────────────────────────────────

function walkJsonl(dir, files = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const e of entries) {
    const full = path.join(dir, e);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walkJsonl(full, files);
      else if (e.endsWith('.jsonl')) files.push(full);
    } catch { /* skip inaccessible */ }
  }
  return files;
}

export function scanTranscripts({ sinceMs = 0, root = CLAUDE_PROJECTS_ROOT } = {}) {
  const rows = [];
  const files = walkJsonl(root);
  const policy = getPricingPolicy();

  for (const file of files) {
    let lines;
    try { lines = readFileSync(file, 'utf8').split('\n'); }
    catch { continue; }

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      // filter: must have timestamp + message with model + non-zero usage
      const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (!Number.isFinite(ts) || ts < sinceMs) continue;

      const msg = obj.message;
      if (!msg) continue;

      const model = msg.model;
      if (!model || model === '<synthetic>') continue;

      const usage = msg.usage;
      if (!usage) continue;

      const input = Number(usage.input_tokens) || 0;
      const output = Number(usage.output_tokens) || 0;
      const cacheRead = Number(usage.cache_read_input_tokens) || 0;
      const cacheCreate = Number(usage.cache_creation_input_tokens) || 0;

      if (input === 0 && output === 0 && cacheRead === 0 && cacheCreate === 0) continue;

      rows.push({
        ts,
        tier: tierOf(model),
        model,
        input,
        output,
        cacheRead,
        cacheCreate,
      });
    }
  }

  return rows;
}

// ── aggregation (separated so tests can drive it without touching ~/.claude) ─

export function aggregateRows(rows, { now = Date.now(), windowDays = 7, budget = DEFAULT_BUDGET } = {}) {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const start = new Date(now - windowMs).toISOString();
  const end = new Date(now).toISOString();
  const daysElapsed = Math.min(windowDays, (now - (now - windowMs)) / (24 * 60 * 60 * 1000));

  const policy = getPricingPolicy();

  const TIERS = ['opus', 'sonnet', 'haiku', 'other'];
  const acc = {};
  for (const t of TIERS) {
    acc[t] = { events: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, costUsd: 0, effectiveTokens: 0 };
  }

  const inWindow = rows.filter(r => r.ts >= now - windowMs);
  for (const r of inWindow) {
    const t = r.tier;
    if (!acc[t]) continue;
    acc[t].events++;
    acc[t].input += r.input;
    acc[t].output += r.output;
    acc[t].cacheRead += r.cacheRead;
    acc[t].cacheCreate += r.cacheCreate;

    // Build the event shape calculateCostUsd expects
    const evt = {
      request_model: r.model,
      input_tokens: r.input,
      output_tokens: r.output,
      cache_read_tokens: r.cacheRead,
      cache_write_tokens: r.cacheCreate,
      reasoning_tokens: 0,
    };
    acc[t].costUsd += calculateCostUsd(evt, policy);
    acc[t].effectiveTokens += calculateEffectiveTokens(evt, policy);
  }

  const budgetMap = {
    opus: budget?.opusWeeklyTokens ?? null,
    sonnet: budget?.sonnetWeeklyTokens ?? null,
    haiku: budget?.haikuWeeklyTokens ?? null,
    other: null,
  };

  const perTier = {};
  for (const t of TIERS) {
    const a = acc[t];
    const budgetTokens = budgetMap[t];
    const pctOfBudget = budgetTokens ? (a.effectiveTokens / budgetTokens) * 100 : null;
    perTier[t] = {
      events: a.events,
      input: a.input,
      output: a.output,
      cacheRead: a.cacheRead,
      cacheCreate: a.cacheCreate,
      effectiveTokens: Math.round(a.effectiveTokens),
      costUsd: Number(a.costUsd.toFixed(6)),
      budgetTokens,
      pctOfBudget: pctOfBudget !== null ? Number(pctOfBudget.toFixed(1)) : null,
      pace: budgetTokens ? paceSignal(a.effectiveTokens, budgetTokens, daysElapsed, windowDays) : null,
    };
  }

  const totals = {
    events: TIERS.reduce((s, t) => s + acc[t].events, 0),
    input: TIERS.reduce((s, t) => s + acc[t].input, 0),
    output: TIERS.reduce((s, t) => s + acc[t].output, 0),
    cacheRead: TIERS.reduce((s, t) => s + acc[t].cacheRead, 0),
    cacheCreate: TIERS.reduce((s, t) => s + acc[t].cacheCreate, 0),
    effectiveTokens: Math.round(TIERS.reduce((s, t) => s + acc[t].effectiveTokens, 0)),
    costUsd: Number(TIERS.reduce((s, t) => s + acc[t].costUsd, 0).toFixed(6)),
  };

  return {
    window: { start, end, daysElapsed: Number(daysElapsed.toFixed(2)) },
    perTier,
    totals,
  };
}

// ── public weeklyUsage ───────────────────────────────────────────────────────

export function weeklyUsage({ now = Date.now(), windowDays = 7, budget } = {}) {
  const b = budget ?? loadBudget();
  const rows = scanTranscripts({ sinceMs: now - windowDays * 24 * 60 * 60 * 1000 });
  return aggregateRows(rows, { now, windowDays, budget: b });
}

// ── budget loader ────────────────────────────────────────────────────────────

export function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return { ...DEFAULT_BUDGET };
  try {
    const raw = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
    return {
      opusWeeklyTokens: raw.opusWeeklyTokens ?? null,
      sonnetWeeklyTokens: raw.sonnetWeeklyTokens ?? null,
      haikuWeeklyTokens: raw.haikuWeeklyTokens ?? null,
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

// ── pace signal ──────────────────────────────────────────────────────────────

export function paceSignal(consumed, budgetTokens, daysElapsed, windowDays = 7) {
  if (!budgetTokens) {
    return { onPace: true, projectedEndOfWeek: null, throttle: 'hold', reason: 'no budget configured' };
  }
  const expected = budgetTokens * (daysElapsed / windowDays);
  const projectedEndOfWeek = daysElapsed > 0
    ? Math.round((consumed / daysElapsed) * windowDays)
    : consumed;
  const onPace = consumed <= expected * 1.1;

  let throttle, reason;
  if (consumed < expected * 0.8) {
    throttle = 'up';
    reason = `using ${Math.round((consumed / (expected || 1)) * 100)}% of expected pace — headroom available`;
  } else if (consumed > expected * 1.1) {
    throttle = 'down';
    reason = `using ${Math.round((consumed / (expected || 1)) * 100)}% of expected pace — ahead of burn rate`;
  } else {
    throttle = 'hold';
    reason = `on pace (${Math.round((consumed / (expected || 1)) * 100)}% of expected)`;
  }

  return { onPace, projectedEndOfWeek, throttle, reason };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function fmt(n) { return n.toLocaleString(); }

function printReport(report) {
  const { window: win, perTier, totals } = report;
  const daysFmt = win.daysElapsed.toFixed(1);
  console.log(`\n═══ YURI Weekly Usage Report ════════════════════════════════`);
  console.log(`  Window : ${win.start.slice(0,10)} → ${win.end.slice(0,10)}  (${daysFmt}d elapsed)`);
  console.log(`  Scanned: ~/.claude/projects/**/*.jsonl`);
  console.log(`─────────────────────────────────────────────────────────────`);

  const TIERS = ['opus', 'sonnet', 'haiku', 'other'];
  for (const t of TIERS) {
    const d = perTier[t];
    if (d.events === 0) continue;
    console.log(`\n  ▸ ${t.toUpperCase().padEnd(8)} — ${d.events} events`);
    console.log(`    input:       ${fmt(d.input).padStart(12)} tokens`);
    console.log(`    output:      ${fmt(d.output).padStart(12)} tokens`);
    console.log(`    cache read:  ${fmt(d.cacheRead).padStart(12)} tokens`);
    console.log(`    cache write: ${fmt(d.cacheCreate).padStart(12)} tokens`);
    console.log(`    effective:   ${fmt(d.effectiveTokens).padStart(12)} tokens`);
    console.log(`    cost:        $${d.costUsd.toFixed(4).padStart(11)}`);
    if (d.budgetTokens) {
      console.log(`    budget:      ${fmt(d.budgetTokens).padStart(12)} tokens  (${d.pctOfBudget}% used)`);
    }
    if (d.pace) {
      const sig = d.pace.throttle === 'up' ? '↑ UP' : d.pace.throttle === 'down' ? '↓ DOWN' : '→ HOLD';
      const proj = d.pace.projectedEndOfWeek !== null ? ` | proj EoW: ${fmt(d.pace.projectedEndOfWeek)}` : '';
      console.log(`    pace:        ${sig}  — ${d.pace.reason}${proj}`);
    }
  }

  console.log(`\n─────────────────────────────────────────────────────────────`);
  console.log(`  TOTALS   — ${totals.events} events`);
  console.log(`    input:       ${fmt(totals.input).padStart(12)} tokens`);
  console.log(`    output:      ${fmt(totals.output).padStart(12)} tokens`);
  console.log(`    cache read:  ${fmt(totals.cacheRead).padStart(12)} tokens`);
  console.log(`    cache write: ${fmt(totals.cacheCreate).padStart(12)} tokens`);
  console.log(`    effective:   ${fmt(totals.effectiveTokens).padStart(12)} tokens`);
  console.log(`    cost:        $${totals.costUsd.toFixed(4).padStart(11)}`);
  console.log(`═════════════════════════════════════════════════════════════\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonMode = process.argv.includes('--json');
  const report = weeklyUsage();
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}
