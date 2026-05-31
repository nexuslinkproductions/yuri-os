#!/usr/bin/env node
// memory-evict.mjs — atime-based LRU evictor for the procedural memory tier (Tier 5).
// Spec: _SYSTEM/memory-layer-spec.md
//
// Behavior:
//   - Scans memory/patterns/*.md
//   - Any file whose access time (atime) is older than TTL_DAYS moves to memory/patterns-archive/
//   - Updates memory/patterns/index.json to reflect the move
//   - --dry-run prints planned moves without performing them
//   - Idempotent: re-running with no aged files is a no-op
//
// TTL is resolved from the canonical knob surface (see resolveTtlDays): an env
// override wins for ops, else the energy-weights.json `evict.ttlDays`, else 90.

import { readdirSync, statSync, renameSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnergyConfig } from './math/yuri-energy-config.mjs';

const SYSTEM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS_DIR = path.join(SYSTEM_ROOT, 'memory', 'patterns');
const ARCHIVE_DIR = path.join(SYSTEM_ROOT, 'memory', 'patterns-archive');
const INDEX_PATH = path.join(PATTERNS_DIR, 'index.json');

// TTL precedence: env override (ops escape hatch) > canonical surface
// (_SYSTEM/SELF/energy-weights.json `evict.ttlDays`) > 90-day default. The canonical
// loader is fail-closed, so a malformed file contributes nothing and we always land
// on a valid positive horizon. Pure + injectable so it is unit-testable.
export function resolveTtlDays(env = process.env, cfg = loadEnergyConfig()) {
  const envRaw = env.MEMORY_EVICT_TTL_DAYS;
  if (envRaw !== undefined && envRaw !== '') {
    const envNum = Number(envRaw);
    if (Number.isFinite(envNum) && envNum >= 1) return Math.trunc(envNum);
  }
  const fileTtl = cfg && cfg.evict ? cfg.evict.ttlDays : undefined;
  if (Number.isFinite(fileTtl) && fileTtl >= 1) return Math.trunc(fileTtl);
  return 90;
}

const TTL_DAYS = resolveTtlDays();
const DRY_RUN = process.argv.includes('--dry-run');

function loadIndex() {
  if (!existsSync(INDEX_PATH)) {
    return { schema_version: 1, description: 'Procedural memory tier — Tier 5.', patterns: {} };
  }
  try {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(`[memory-evict] WARN: index.json unreadable (${e.message}); starting fresh.\n`);
    return { schema_version: 1, description: 'Procedural memory tier — Tier 5.', patterns: {} };
  }
}

function saveIndex(idx) {
  writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2) + '\n');
}

function ageDays(atimeMs) {
  return (Date.now() - atimeMs) / (1000 * 60 * 60 * 24);
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function listPatterns() {
  if (!existsSync(PATTERNS_DIR)) return [];
  return readdirSync(PATTERNS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(PATTERNS_DIR, f));
}

function planEvictions() {
  return listPatterns()
    .map((p) => {
      const st = statSync(p);
      return { path: p, ageDays: ageDays(st.atimeMs) };
    })
    .filter((entry) => entry.ageDays > TTL_DAYS);
}

function main() {
  ensureDir(PATTERNS_DIR);
  ensureDir(ARCHIVE_DIR);

  const plan = planEvictions();
  const idx = loadIndex();

  if (plan.length === 0) {
    process.stdout.write('[memory-evict] no eviction needed\n');
    return 0;
  }

  for (const { path: src, ageDays: age } of plan) {
    const base = path.basename(src);
    const dst = path.join(ARCHIVE_DIR, base);
    const action = DRY_RUN ? 'WOULD MOVE' : 'MOVING';
    process.stdout.write(`[memory-evict] ${action} ${base} (atime age: ${age.toFixed(1)}d) -> patterns-archive/\n`);
    if (!DRY_RUN) {
      renameSync(src, dst);
      delete idx.patterns[base];
    }
  }

  if (!DRY_RUN) saveIndex(idx);
  process.stdout.write(`[memory-evict] ${DRY_RUN ? 'dry-run' : 'evicted'} ${plan.length} pattern(s)\n`);
  return 0;
}

// Run only when executed directly (node memory-evict.mjs ...), never on import —
// so tests can import resolveTtlDays without triggering an eviction pass.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
