#!/usr/bin/env node
/**
 * cross-session-miner.mjs — All-time pattern analysis across synthesis log
 *
 * Neuron-loop Phase 7.
 *   - Reads ALL entries in nisaba/learning/synthesis.jsonl
 *   - Extracts: recurring flaw types, improvement trend, advisor patterns
 *   - Writes: nisaba/learning/meta-synthesis.json
 *   - Calls self-model.mjs to update behavioral fingerprint
 *
 * CLI:
 *   node _SYSTEM/Scripts/cross-session-miner.mjs           # full run
 *   node _SYSTEM/Scripts/cross-session-miner.mjs --dry-run
 *   node _SYSTEM/Scripts/cross-session-miner.mjs --status
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NISABA    = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');

const PATHS = {
  synthLog:       path.join(NISABA, 'learning', 'synthesis.jsonl'),
  metaSynthesis:  path.join(NISABA, 'learning', 'meta-synthesis.json'),
  selfModel:      path.join(__dirname, 'self-model.mjs'),
};

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS  = args.includes('--status');

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadSynthLog() {
  if (!existsSync(PATHS.synthLog)) return [];
  return readFileSync(PATHS.synthLog, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

if (STATUS) {
  const m = readJson(PATHS.metaSynthesis);
  if (!m) { console.log('No meta-synthesis yet.'); process.exit(0); }
  console.log(`Meta-synthesis (${m.ts?.slice(0,10)}): ${m.session_count} sessions analyzed`);
  console.log(`  Trend: ${m.improvement_trend}`);
  console.log(`  Avg score: ${m.avg_score}`);
  process.exit(0);
}

const sessions = loadSynthLog();

if (sessions.length === 0) {
  console.log('No synthesis history yet — skipping cross-session mining');
  process.exit(0);
}

// ── Score trend ───────────────────────────────────────────────────────────────

const scores = sessions.map(s => s.improvement_score).filter(n => n != null);
const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
const recentAvg = scores.slice(-3).length
  ? Math.round(scores.slice(-3).reduce((a, b) => a + b, 0) / scores.slice(-3).length)
  : null;
const trend = recentAvg != null && avgScore != null
  ? (recentAvg > avgScore + 3 ? 'improving' : recentAvg < avgScore - 3 ? 'declining' : 'stable')
  : 'insufficient_data';

// ── Flaw patterns ─────────────────────────────────────────────────────────────

const flawHistory = sessions.map(s => ({
  ts:       s.ts,
  total:    s.audit?.flaws_found ?? 0,
  criticals:s.audit?.criticals ?? 0,
  warns:    s.audit?.warns ?? 0,
  delta:    s.audit?.flaws_delta,
}));

const avgFlaws = flawHistory.length
  ? Math.round(flawHistory.reduce((a, b) => a + b.total, 0) / flawHistory.length)
  : 0;

// ── Rules promoted ────────────────────────────────────────────────────────────

const allRules = sessions.flatMap(s => s.promoter?.rules_added || []);
const ruleCounts = {};
allRules.forEach(r => { ruleCounts[r] = (ruleCounts[r] || 0) + 1; });
const frequentRules = Object.entries(ruleCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([rule, count]) => ({ rule, count }));

// ── Advisor patterns ──────────────────────────────────────────────────────────

const advisorDeprioritized = sessions.flatMap(s => s.calibration?.advisors_deprioritized || []);
const advisorCounts = {};
advisorDeprioritized.forEach(a => { advisorCounts[a] = (advisorCounts[a] || 0) + 1; });
const problematicAdvisors = Object.entries(advisorCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([advisor, count]) => ({ advisor, count }));

// ── Meta-synthesis ────────────────────────────────────────────────────────────

const metaSynthesis = {
  ts:                new Date().toISOString(),
  session_count:     sessions.length,
  avg_score:         avgScore,
  recent_avg_score:  recentAvg,
  improvement_trend: trend,
  flaw_history: {
    avg_total:     avgFlaws,
    all_sessions:  flawHistory,
  },
  rules: {
    total_promoted:  allRules.length,
    frequent_rules:  frequentRules,
  },
  advisors: {
    problematic:     problematicAdvisors,
  },
};

console.log(`Cross-session: ${sessions.length} sessions | trend=${trend} | avg_score=${avgScore}`);
console.log(`  Frequent rules: ${frequentRules.slice(0,3).map(r => r.rule).join(', ') || 'none'}`);

if (!DRY_RUN) {
  mkdirSync(path.dirname(PATHS.metaSynthesis), { recursive: true });
  writeFileSync(PATHS.metaSynthesis, JSON.stringify(metaSynthesis, null, 2));
  console.log('Wrote meta-synthesis.json');

  // Trigger self-model update
  const child = spawn('node', [PATHS.selfModel, '--update'], {
    cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => process.stdout.write(d));
  await new Promise(r => child.on('close', r));
}

export { metaSynthesis };
