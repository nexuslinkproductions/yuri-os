#!/usr/bin/env node
// Stop: finalize session, append to tracker, clean up stale sessions
const fs = require('fs');
const path = require('path');

const TRACKER = '/Users/marcelspatz/NUDIMMUD/_SYSTEM/token-tracker.md';
const STATE_DIR = '/Users/marcelspatz/NUDIMMUD/.claude/state';
const SESSION_FILE = `${STATE_DIR}/token-session.json`;
const WEEKLY_FILE = `${STATE_DIR}/token-weekly.json`;

try {
  const sessionPath = '/tmp/claude-current-session';
  if (!fs.existsSync(sessionPath)) process.exit(0);
  const sessionFile = fs.readFileSync(sessionPath, 'utf8').trim();
  if (!fs.existsSync(sessionFile)) process.exit(0);

  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const duration = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 60000);
  const toolCount = session.toolCalls.length;
  const topTools = Object.entries(
    session.toolCalls.reduce((acc, t) => { acc[t.tool] = (acc[t.tool] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t}×${c}`).join(', ') || 'none';

  // Flush session tokens into weekly accumulator first (to get real token count for tracker)
  let realTokens = 0, realCost = 0;
  try {
    const sessionState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    realTokens = sessionState.totalTokens || 0;
    realCost   = sessionState.cost || 0;
    let weekly = {};
    try { weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE, 'utf-8')); } catch(_) {}
    fs.writeFileSync(WEEKLY_FILE, JSON.stringify({
      ...weekly,
      inputTokens:  (weekly.inputTokens  || 0) + (sessionState.inputTokens  || 0),
      outputTokens: (weekly.outputTokens || 0) + (sessionState.outputTokens || 0),
      totalTokens:  (weekly.totalTokens  || 0) + (sessionState.totalTokens  || 0),
      cost: parseFloat(((weekly.cost || 0) + (sessionState.cost || 0)).toFixed(6)),
      sessionCount: (weekly.sessionCount || 0) + 1,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch(_) {}

  const tokDisplay = realTokens > 0 ? realTokens.toLocaleString() : `~${session.estimatedTokens.toLocaleString()}`;
  const costDisplay = realCost > 0 ? ` $${realCost.toFixed(3)}` : '';
  const entry = `| ${new Date(session.startTime).toISOString().slice(0, 16)} | ${duration}m | ${toolCount} | ${tokDisplay}${costDisplay} | ${topTools} |\n`;
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(TRACKER, entry);

  // Clean up stale session files (>8h)
  fs.readdirSync('/tmp').filter(f => f.startsWith('claude-session-')).forEach(f => {
    const p = path.join('/tmp', f);
    try { if (Date.now() - fs.statSync(p).mtimeMs > 28800000) fs.unlinkSync(p); } catch(e) {}
  });

  try { fs.unlinkSync(sessionPath); } catch(e) {}
} catch(e) { /* silent */ }
