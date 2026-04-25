#!/usr/bin/env node
// PreToolUse: warn when approaching token budget
const fs = require('fs');

const WARN = 80000;
const CRITICAL = 150000;

try {
  const sessionPath = '/tmp/claude-current-session';
  if (!fs.existsSync(sessionPath)) process.exit(0);
  const sessionFile = fs.readFileSync(sessionPath, 'utf8').trim();
  if (!fs.existsSync(sessionFile)) process.exit(0);

  const { estimatedTokens: t = 0 } = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

  if (t >= CRITICAL) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `🔴 TOKEN CRITICAL: ~${t.toLocaleString()} est. tokens used. Use palace-index.md over raw reads. Consider new session.`
      }
    }));
  } else if (t >= WARN) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `🟠 TOKEN WARNING: ~${t.toLocaleString()} est. tokens used. Prioritize high-value calls.`
      }
    }));
  }
} catch(e) { /* silent */ }
