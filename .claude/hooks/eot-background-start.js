#!/usr/bin/env node
/**
 * EOT Background Start Hook
 * Spawns end-of-transmission monitoring in background at session start
 * Monitors for user exit keywords (done/finished/end) to surface report
 */

const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
const eotMarkerFile = `/tmp/claude-eot-${sessionId}.marker`;

// Signal that EOT is active
try {
  require('fs').writeFileSync(eotMarkerFile, JSON.stringify({
    started: new Date().toISOString(),
    sessionId,
    monitoring: true
  }), 'utf8');
} catch (e) {
  // Silent fail, not critical
}

// Output JSON to register with hook system
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: '🔄 EOT monitoring active'
  }
}));
