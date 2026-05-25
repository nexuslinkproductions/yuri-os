#!/usr/bin/env node
// EOT Phase 10 worker — promote pulse-bus findings to durable archive.
// Implements the spec at skills/end-of-transmission/SKILL.md Phase 10.
// Reads pulse-bus.json + hook telemetry + session-state, writes daily archive.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const BUS = path.join(REPO_ROOT, '.claude/state/pulse-bus.json');
const TEL = path.join(REPO_ROOT, '.claude/state/pulse-hook-telemetry.log');
const SESSION = path.join(REPO_ROOT, '.claude/state/session-state.json');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM/SELF-IMPROVEMENT/pulse-archive');

const RANKS = { INFO: 1, WARN: 2, HIGH: 3, CRITICAL: 4 };

function safeJSON(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

function readLines(p) {
  try { return readFileSync(p, 'utf8').split('\n').filter(Boolean); } catch { return []; }
}

function main() {
  const bus = safeJSON(BUS, { ring: [] });
  const tel = readLines(TEL);
  const session = safeJSON(SESSION, {});
  const now = Date.now();

  const kept = (bus.ring || []).filter((e) => {
    if (new Date(e.expires_at).getTime() < now) return false;
    if (e.source === 'CORTEX') return true;
    if (e.source === 'CASSANDRA') return true;
    return (RANKS[e.severity] || 0) >= RANKS.WARN;
  }).map((e) => ({ ...e, outcome_marker: null }));

  const date = new Date().toISOString().slice(0, 10);
  const archive = {
    date,
    session_id: session.session_id || 'unknown',
    commits: process.argv.slice(2),
    findings: kept,
    telemetry: {
      trivial_skip_count: tel.filter((l) => l.includes('trivial-skip')).length,
      pulse_spawn_count: tel.filter((l) => l.includes('pulse-spawn')).length,
      disagreement_count: kept.filter((e) => e.source === 'CORTEX' && /disagreement/i.test(e.finding)).length,
    },
  };

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const out = path.join(ARCHIVE_DIR, `${date}.json`);
  writeFileSync(out, JSON.stringify(archive, null, 2));
  console.log(`phase-10 archive: ${out}`);
  console.log(`  findings kept: ${kept.length} / ${(bus.ring || []).length}`);
  console.log(`  telemetry: ${JSON.stringify(archive.telemetry)}`);
}

main();
