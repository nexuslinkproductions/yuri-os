#!/usr/bin/env node
'use strict';
// SessionStart hook (OPTIONAL wiring) — registers this session's voice-overseer role so the
// inject CLI can resolve the worker without transcript-guessing.
//   overseer (VOICE_AGENT_ACTIVE===1) → _SYSTEM/state/lane-sessions/overseer.id
//   worker  (otherwise)               → _SYSTEM/state/lane-sessions/worker.id
// Reads the Claude session UUID from the hook payload (stdin JSON .session_id) — the SAME key
// claude-vscode.editor.open uses to reveal the panel. NOT token-session-init's Date.now() id.
// Fail-open: any error exits 0 so it can never break a session start.
//
// To enable, add to .claude/settings.json SessionStart hooks array:
//   {"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/hooks/lane-register.js\""}
// Until then the inject CLI falls back to newest-active-non-overseer transcript derivation.
const fs = require('node:fs');
const path = require('node:path');

try {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) {}
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch (_) {}

  const sid = (payload && payload.session_id) || process.env.CLAUDE_SESSION_ID || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) process.exit(0);

  const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dir = path.join(repo, '_SYSTEM', 'state', 'lane-sessions');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}

  const role = process.env.VOICE_AGENT_ACTIVE === '1' ? 'overseer' : 'worker';
  fs.writeFileSync(path.join(dir, role === 'overseer' ? 'overseer.id' : 'worker.id'), sid);
} catch (_) {}
process.exit(0);
