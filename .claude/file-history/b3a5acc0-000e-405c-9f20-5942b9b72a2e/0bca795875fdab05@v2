#!/usr/bin/env node
// PreToolUse — inject pending scout findings into Claude's context
'use strict';
const fs = require('fs');
const bus = require('./scout-bus.js');

const SEV_ORDER = { CRITICAL: 4, HIGH: 3, WARN: 2, INFO: 1 };

function emitContext(msg) {
  process.stderr.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg }
  }) + '\n');
}

function severityIcon(sev) {
  return { CRITICAL: '🔴', HIGH: '🟠', WARN: '🟡', INFO: '🔵' }[sev] || '⚪';
}

try {
  const b = bus.readBus();
  const pending = bus.getUnconsumed(b);

  if (pending.length === 0) {
    process.exit(0);
  }

  // Sort: severity desc, then oldest first (most urgent first)
  pending.sort((a, b) =>
    (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0) ||
    new Date(a.ts) - new Date(b.ts)
  );

  // Cap at 3 per injection to avoid flooding context
  const toInject = pending.slice(0, 3);

  const lines = toInject.map(e => {
    const time = new Date(e.ts).toISOString().slice(11, 19);
    return `${severityIcon(e.severity)} ${e.scout} [${e.severity}] @${time} — ${e.finding}`;
  });

  const block = [
    `<scout-findings count="${toInject.length}">`,
    ...lines,
    '</scout-findings>',
  ].join('\n');

  // Mark consumed and persist
  bus.markConsumed(b, toInject.map(e => e.id));
  bus.writeBus(b);

  emitContext(block);
} catch (_) {
  // Never block PreToolUse
}

process.exit(0);
