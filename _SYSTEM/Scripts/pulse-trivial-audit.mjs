#!/usr/bin/env node
// PATCH 042 — Soak audit script for pulse-hook-telemetry.log
// Usage: node Scripts/pulse-trivial-audit.mjs [--json]
//        Scripts/ai soak
//
// Reads .claude/state/pulse-hook-telemetry.log and reports:
//   - trivial-skip count, pulse-spawn count, skip rate
//   - unique skip hashes (repeated = same prompt hitting filter repeatedly)
//   - spawn turn IDs
//   - false-positive candidates (prompts skipped that had len > threshold)

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LOG_PATH = path.join(REPO_ROOT, '.claude', 'state', 'pulse-hook-telemetry.log');
const JSON_MODE = process.argv.includes('--json');

// --- Parse log ---
const skips = [];   // { ts, turn, len, hash }
const spawns = [];  // { ts, turn, len }

if (!existsSync(LOG_PATH)) {
  if (JSON_MODE) { console.log(JSON.stringify({ error: 'log not found', path: LOG_PATH })); }
  else { console.log(`No telemetry log found at ${LOG_PATH}`); }
  process.exit(0);
}

const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);

for (const line of lines) {
  const ts = line.match(/^(\S+)/)?.[1] || '';
  if (line.includes('trivial-skip')) {
    const turn = line.match(/turn=(\S+)/)?.[1] || '?';
    const len  = parseInt(line.match(/len=(\d+)/)?.[1] || '0', 10);
    const hash = line.match(/hash=(\S+)/)?.[1] || '?';
    skips.push({ ts, turn, len, hash });
  } else if (line.includes('pulse-spawn')) {
    const turn = line.match(/turn=(\S+)/)?.[1] || '?';
    const len  = parseInt(line.match(/len=(\d+)/)?.[1] || '0', 10);
    spawns.push({ ts, turn, len });
  }
}

// --- Compute metrics ---
const total = skips.length + spawns.length;
const skipRate = total > 0 ? ((skips.length / total) * 100).toFixed(1) : '0.0';

const hashCount = {};
for (const s of skips) hashCount[s.hash] = (hashCount[s.hash] || 0) + 1;
const uniqueHashes = Object.keys(hashCount);
const repeatedHashes = Object.entries(hashCount).filter(([, c]) => c > 1);

// False-positive candidates: skipped prompts with len > 10 (might be non-trivial)
const fpCandidates = skips.filter(s => s.len > 10);

const spawnTurns = spawns.map(s => s.turn);

// --- Output ---
if (JSON_MODE) {
  console.log(JSON.stringify({
    skip_count: skips.length,
    spawn_count: spawns.length,
    total_turns: total,
    skip_rate_pct: parseFloat(skipRate),
    unique_skip_hashes: uniqueHashes.length,
    repeated_hashes: repeatedHashes.map(([h, c]) => ({ hash: h, count: c })),
    spawn_turns: spawnTurns,
    fp_candidates: fpCandidates.length,
    fp_candidate_turns: fpCandidates.map(s => s.turn),
  }, null, 2));
} else {
  const pad = (label, val) => `${label.padEnd(25)}: ${val}`;
  console.log('\nPulse Soak Audit');
  console.log('─'.repeat(45));
  console.log(pad('Trivial-skip count', skips.length));
  console.log(pad('Pulse-spawn count', spawns.length));
  console.log(pad('Total turns observed', total));
  console.log(pad('Skip rate', `${skipRate}%`));
  console.log(pad('Unique skip hashes', uniqueHashes.length));
  if (repeatedHashes.length > 0) {
    for (const [h, c] of repeatedHashes) {
      console.log(pad(`  hash ${h}`, `${c}× (same prompt hitting filter)`));
    }
  }
  console.log(pad('Spawn turns', spawnTurns.length > 0 ? spawnTurns.join(', ') : '(none)'));
  console.log(pad('FP candidates (len>10)', fpCandidates.length > 0
    ? fpCandidates.map(s => `${s.turn}(len=${s.len})`).join(', ')
    : '0'));
  console.log('─'.repeat(45));
  if (total < 20) {
    console.log('\n⚠ Sample too small (<20 turns) — soak longer before tuning classifier.');
  } else if (parseFloat(skipRate) > 80) {
    console.log('\n⚠ High skip rate — consider loosening trivial-skip heuristic.');
  } else if (parseFloat(skipRate) < 20) {
    console.log('\n⚠ Low skip rate — cortex firing on many prompts; check for false-spawns.');
  } else {
    console.log('\n✓ Skip rate in healthy range (20–80%).');
  }
}
