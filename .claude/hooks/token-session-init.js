#!/usr/bin/env node
// SessionStart: initialize token tracking + session-state + palace status check
const fs = require('fs');
const { execSync } = require('child_process');

const sessionId = Date.now();
const sessionFile = `/tmp/claude-session-${sessionId}.json`;
const STATE_DIR = '/Users/marcelspatz/NUDIMMUD/.claude/state';
const SESSION_FILE = `${STATE_DIR}/token-session.json`;
const WEEKLY_FILE = `${STATE_DIR}/token-weekly.json`;

try {
  fs.writeFileSync(sessionFile, JSON.stringify({
    id: sessionId,
    startTime: new Date().toISOString(),
    toolCalls: [],
    estimatedTokens: 0
  }, null, 2));
  fs.writeFileSync('/tmp/claude-current-session', sessionFile);

  // Reset session state for new session
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({
    model: 'Claude',
    context: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0,
    sessionId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, null, 2));

  // Initialize session-state.json (lifecycle tracking)
  // Guard: skip if an active state already exists from the root session (subagents must not wipe it)
  const stateFilePath = `${STATE_DIR}/session-state.json`;
  try {
    const existing = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    if (existing?.status === 'active' && (Date.now() - new Date(existing.start_time).getTime()) < 4 * 3600 * 1000) {
      // Active root session within 4h — skip re-init
      throw new Error('skip');
    }
  } catch (e) { if (e.message === 'skip') { /* fall through to console.log at bottom */ throw e; } }
  let branch = '';
  try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] }).trim(); } catch (_) {}
  fs.writeFileSync(stateFilePath, JSON.stringify({
    schema_version: '1',
    session_id: sessionId,
    start_time: new Date().toISOString(),
    status: 'active',
    tokenmaxxing: true,
    context: { pct: 0, tier: 0, last_updated: null, last_fired_pct: 0 },
    git: { branch, cwd: process.cwd() },
    skills_read: [],
    skills_written: [],
    tools_used: [],
    files_written: [],
    aversions: [],
    compact_history: [],
    errors: []
  }, null, 2));

  const tokenmaxxingStatePath = `${STATE_DIR}/tokenmaxxing-state.json`;
  fs.writeFileSync(tokenmaxxingStatePath, JSON.stringify({
    active: true,
    marker: 'TOKENMAXXING::ACTIVE',
    source: 'SessionStart',
    budgetSoft: '5k-15k',
    budgetHard: '40k',
    markerOnly: true,
    updatedAt: new Date().toISOString()
  }, null, 2));

  // Initialize weekly accumulator if missing or stale (>7d)
  let weekly = null;
  try { weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE, 'utf-8')); } catch(_) {}
  const weekStart = getWeekStart();
  if (!weekly || weekly.weekStart !== weekStart) {
    fs.writeFileSync(WEEKLY_FILE, JSON.stringify({
      weekStart,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      sessionCount: 0,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
} catch(e) { /* silent */ }

function getWeekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// Palace status
const palacePath = '/Volumes/T7/claude-palace-out/palace-index.md';
let palaceStatus;
try {
  if (fs.existsSync(palacePath)) {
    const age = Math.floor((Date.now() - fs.statSync(palacePath).mtimeMs) / 86400000);
    palaceStatus = age > 7
      ? `⚠️ STALE (${age}d) — call mcp__obsidian-vault__rebuild_index`
      : `✅ Current (${age}d old) — use palace-index.md before raw vault reads`;
  } else {
    palaceStatus = '❌ MISSING — call mcp__obsidian-vault__rebuild_index';
  }
} catch(e) {
  palaceStatus = '⚠️ Check failed';
}

// Inject full tokenmaxxing behavioral rules from SKILL.md into startup context
// Check project path first (most up-to-date), fallback to global
const TM_PATHS = [
  `${process.cwd()}/.claude/skills/tokenmaxxing/SKILL.md`,
  '/Users/marcelspatz/NUDIMMUD/.claude/skills/tokenmaxxing/SKILL.md',
  '/Users/marcelspatz/.claude/skills/tokenmaxxing/SKILL.md',
];
let tokenmaxxingRules = '';
for (const tmPath of TM_PATHS) {
  try {
    const skillContent = fs.readFileSync(tmPath, 'utf8');
    const rulesMatch = skillContent.match(/^## Rules[\s\S]*?(?=^## Deactivation|^## Session Notes)/m);
    if (rulesMatch) { tokenmaxxingRules = '\n\n' + rulesMatch[0].trim(); break; }
  } catch (_) {}
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: `SESSION: Token tracking active (id: ${sessionId}) | ⚡ TOKENMAXXING ACTIVE | PALACE: ${palaceStatus} | Reasoning: MAX effort active | Navigation: structure-first via palace-index.md${tokenmaxxingRules}`
  }
}));
