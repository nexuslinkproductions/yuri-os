#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const sessionsDir = path.join(cwd, '.claude', 'nisaba', 'learning', 'sessions');
const reportMode = process.argv.includes('--report');

if (!fs.existsSync(sessionsDir)) {
  console.log('{ "score": 0, "reason": "no session data" }');
  process.exit(0);
}

const allFiles = fs.readdirSync(sessionsDir)
  .filter(f => f.endsWith('.jsonl'))
  .sort()
  .slice(-30); // last 30 days

const sessions = [];
for (const f of allFiles) {
  const day = f.replace('.jsonl', '');
  const lines = fs.readFileSync(path.join(sessionsDir, f), 'utf8').trim().split('\n').filter(Boolean);
  for (const l of lines) {
    try { sessions.push({ day, ...JSON.parse(l) }); } catch {}
  }
}

if (!sessions.length) {
  console.log('{ "score": 0, "reason": "no sessions parsed" }');
  process.exit(0);
}

// Split into two halves for trend comparison
const mid = Math.floor(sessions.length / 2);
const older = sessions.slice(0, mid);
const recent = sessions.slice(mid);

function correctionRate(set) {
  const total = set.length;
  if (!total) return 0;
  const withCorrections = set.filter(s => (s.corrections || []).length > 0).length;
  return withCorrections / total;
}

function errorRate(set) {
  const total = set.length;
  if (!total) return 0;
  const withErrors = set.filter(s => (s.error_snippets || []).some(Boolean)).length;
  return withErrors / total;
}

function skillReuse(set) {
  const counts = {};
  for (const s of set) for (const sk of (s.skills_read || [])) counts[sk] = (counts[sk] || 0) + 1;
  const vals = Object.values(counts);
  if (!vals.length) return 0;
  return vals.filter(v => v > 1).length / vals.length; // ratio of skills used >1 time
}

const oldCorrRate = correctionRate(older);
const newCorrRate = correctionRate(recent);
const corrTrend = oldCorrRate - newCorrRate; // positive = improving

const oldErrRate = errorRate(older);
const newErrRate = errorRate(recent);
const errTrend = oldErrRate - newErrRate; // positive = improving

const reuse = skillReuse(recent);

// Recurrence: same error snippet appearing in multiple recent sessions
const recentErrors = recent.flatMap(s => s.error_snippets || []).filter(Boolean);
const seen = new Set();
let recurrenceCount = 0;
for (const e of recentErrors) {
  const key = e.slice(0, 60);
  if (seen.has(key)) recurrenceCount++;
  else seen.add(key);
}
const recurrencePenalty = Math.min(recurrenceCount * 5, 30);

// Base score components (each 0-25)
const corrScore = Math.round(Math.max(0, Math.min(25, 12.5 + corrTrend * 50)));
const errScore = Math.round(Math.max(0, Math.min(25, 12.5 + errTrend * 50)));
const reuseScore = Math.round(reuse * 25);
const volumeScore = Math.round(Math.min(25, sessions.length / 2)); // 50 sessions = max

const raw = corrScore + errScore + reuseScore + volumeScore - recurrencePenalty;
const score = Math.max(0, Math.min(100, raw));

const result = {
  score,
  sessions_analyzed: sessions.length,
  correction_rate_trend: corrTrend > 0 ? 'improving' : corrTrend < 0 ? 'degrading' : 'stable',
  error_rate_trend: errTrend > 0 ? 'improving' : errTrend < 0 ? 'degrading' : 'stable',
  skill_reuse_ratio: Math.round(reuse * 100) + '%',
  recurrence_penalty: recurrencePenalty,
  breakdown: { corrScore, errScore, reuseScore, volumeScore },
  as_of: new Date().toISOString().slice(0, 10),
};

if (reportMode) {
  const scoreBar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
  console.log(`\n## Learning Score — ${result.as_of}`);
  console.log(`[${scoreBar}] ${score}/100`);
  console.log(`Sessions: ${sessions.length} | Corr trend: ${result.correction_rate_trend} | Err trend: ${result.error_rate_trend}`);
  console.log(`Skill reuse: ${result.skill_reuse_ratio} | Recurrence penalty: -${recurrencePenalty}`);
  console.log(`Breakdown: corr=${corrScore} err=${errScore} reuse=${reuseScore} volume=${volumeScore}\n`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
