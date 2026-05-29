#!/usr/bin/env node
'use strict';
// DEPRECATED SHIM (2026-05-29) — the protocol-guard logic moved to claude-protocol-guard.mjs
// (ESM, with the control-file list single-sourced from _SYSTEM/Scripts/lane-kernel.mjs).
// settings.json now points at the .mjs. This shim only exists so a not-yet-reloaded session
// that still references the .js path keeps enforcing instead of silently no-op'ing. It holds
// ZERO policy logic (no drift possible) and simply delegates. Safe to archive after reload.
const { spawnSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const r = spawnSync('node', [path.join(__dirname, 'claude-protocol-guard.mjs')], {
      input: raw,
      encoding: 'utf8',
    });
    if (r.stdout) process.stdout.write(r.stdout);
  } catch (_) {
    // Fail open like the original hook on unexpected error — never block the tool call.
  }
  process.exit(0);
});
