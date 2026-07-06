#!/usr/bin/env node
/**
 * RETIRED 2026-06-11 (wave-3 H.1, D-H1-A) — see wave3-session-boot-deep.md CRIT-2.
 * This hook was a dead organ: it spawned NOTHING, wrote a never-read marker file
 * (with a key collision on /tmp/claude-eot-unknown.marker), and injected a false
 * "🔄 EOT monitoring active" claim into every turn-1 context. Unregistered from
 * the settings.json SessionStart array; file kept on disk for the record.
 * Real EOT detection lives in user-prompt-submit.js + yuri-closeout.mjs.
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
