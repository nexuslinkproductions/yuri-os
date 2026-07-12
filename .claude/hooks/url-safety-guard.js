#!/usr/bin/env node
'use strict';

// --- URL Safety Guard (PreToolUse hook, Bash-only) ---
// Thin stdin/JSON adapter. Policy lives in _SYSTEM/Scripts/url-policy.mjs.
// Deterministic: no external binary, no network call.
// Fail-closed: malformed, unparseable, or private-network URLs → ask.

const fs = require('fs');

function emitAsk(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  }) + '\n');
}

(async () => {
  const { scanCommand } = await import('../../_SYSTEM/Scripts/url-policy.mjs');

  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    emitAsk('URL guard error: failed to parse event JSON');
    process.exit(0);
  }

  if (event?.tool_name !== 'Bash') process.exit(0);

  const command = event?.tool_input?.command;
  if (typeof command !== 'string' || !command) process.exit(0);

  try {
    const blocked = scanCommand(command);
    if (blocked) {
      emitAsk(blocked.reason);
      process.exit(0);
    }
  } catch (err) {
    emitAsk(`URL guard error: ${(err && err.message) || err || 'unknown'}`);
    process.exit(0);
  }

  process.exit(0);
})().catch(err => {
  emitAsk(`URL guard error: ${(err && err.message) || err || 'unknown'}`);
  process.exit(0);
});
