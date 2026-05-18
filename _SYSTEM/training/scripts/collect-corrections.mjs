#!/usr/bin/env node
// collect-corrections.mjs — pull rated reflections from kagami.db → training JSONL
// Output: _SYSTEM/training/data/corrections.jsonl
// Format: {"prompt": "<command>", "completion": "<tier>"}
// Only includes reflections with a rating AND a known complexity tier in the pulse-bus context.

import { createRequire } from 'node:module';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DB_PATH       = process.env.KAGAMI_DB_PATH ?? resolve(REPO_ROOT, '_SYSTEM/OS_KERNEL/kagami.db');
const OUT_PATH      = resolve(__dirname, '../data/corrections.jsonl');
const MIN_RATING    = parseInt(process.env.LORA_MIN_RATING ?? '4', 10); // only include 4-5 (positive) as correct examples
const TIER_OVERRIDE = process.env.LORA_TIER_OVERRIDE; // force a tier label for all collected (testing)

// ─── Dynamic import of better-sqlite3 (already in kagami's node_modules) ────
const require = createRequire(import.meta.url);
let db;
try {
  const Database = require(resolve(REPO_ROOT, '.codex-worktrees/kagami-rebuild/_SYSTEM/kagami/node_modules/better-sqlite3'));
  db = new Database(DB_PATH, { readonly: true });
} catch (e) {
  console.error('[collect] ✗ cannot open kagami.db:', e.message);
  console.error('  ensure kagami.db exists at:', DB_PATH);
  process.exit(1);
}

// Fetch rated reflections joined with their stored tier (from pulse-bus context JSON if available)
const rows = db.prepare(`
  SELECT
    r.id,
    r.command_preview  AS command,
    r.lane,
    r.created_at,
    rt.rating,
    rt.notes
  FROM reflections r
  JOIN ratings rt ON rt.reflection_id = r.id
  WHERE rt.rating IN ('positive')
  ORDER BY r.created_at DESC
`).all();

db.close();

if (!rows.length) {
  console.log('[collect] no rated reflections found — nothing to export');
  process.exit(0);
}

// Map rating + lane → tier heuristic (override with LORA_TIER_OVERRIDE if set)
function laneToTier(lane) {
  if (TIER_OVERRIDE) return TIER_OVERRIDE;
  if (!lane) return null;
  if (lane.includes('flash') || lane.includes('local') || lane.includes('triage')) return 'trivial';
  if (lane.includes('pro') || lane.includes('spark') || lane.includes('standard')) return 'standard';
  if (lane.includes('codex') || lane.includes('nemotron') || lane.includes('kimi')) return 'complex';
  return 'standard'; // safe default
}

mkdirSync(dirname(OUT_PATH), { recursive: true });

// Load existing corrections to deduplicate
const existing = new Set();
if (existsSync(OUT_PATH)) {
  readFileSync(OUT_PATH, 'utf8').split('\n').filter(Boolean).forEach(line => {
    try { existing.add(JSON.parse(line).prompt); } catch {}
  });
}

let added = 0;
const lines = [];
for (const row of rows) {
  const command = (row.command ?? '').trim();
  if (!command || existing.has(command)) continue;
  const tier = laneToTier(row.lane);
  if (!tier) continue;
  lines.push(JSON.stringify({ prompt: command, completion: tier }));
  added++;
}

if (lines.length) {
  writeFileSync(OUT_PATH, lines.join('\n') + '\n', { flag: 'a' });
}

console.log(`[collect] exported ${added} new corrections → ${OUT_PATH}`);
console.log(`[collect] total in corrections.jsonl: ${existing.size + added}`);
