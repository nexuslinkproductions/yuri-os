#!/usr/bin/env node
// memory-evict.mjs — atime-based LRU evictor for the procedural memory tier (Tier 5).
// Spec: _SYSTEM/memory-layer-spec.md
//
// Behavior:
//   - Scans memory/patterns/*.md
//   - Any file whose access time (atime) is older than TTL_DAYS (default 90) moves to memory/patterns-archive/
//   - Updates memory/patterns/index.json to reflect the move
//   - --dry-run prints planned moves without performing them
//   - Idempotent: re-running with no aged files is a no-op

import { readdirSync, statSync, renameSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PATTERNS_DIR = path.join(REPO_ROOT, 'memory', 'patterns');
const ARCHIVE_DIR = path.join(REPO_ROOT, 'memory', 'patterns-archive');
const INDEX_PATH = path.join(PATTERNS_DIR, 'index.json');
const TTL_DAYS = Number(process.env.MEMORY_EVICT_TTL_DAYS) || 90;
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

process.exit(main());
