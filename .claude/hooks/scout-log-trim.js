#!/usr/bin/env node
// scout-log-trim.js — SessionStart hook: trim .claude/state/scout-errors.log if > 50KB
// Runs as separate Node process; bypasses Claude Code permission system on the file.
// Silent on miss / under-size; never blocks session.

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const LOG_PATH = path.join(REPO_ROOT, '.claude', 'state', 'scout-errors.log');
const SIZE_THRESHOLD = 50 * 1024;     // 50KB
const KEEP_LINES = 200;

try {
  if (!fs.existsSync(LOG_PATH)) process.exit(0);
  const stat = fs.statSync(LOG_PATH);
  const originalSize = stat.size;
  if (originalSize <= SIZE_THRESHOLD) process.exit(0);

  const content = fs.readFileSync(LOG_PATH, 'utf8');
  const lines = content.split('\n');
  const trimmed = lines.slice(-KEEP_LINES).join('\n');

  // Atomic-ish write: tmp + rename
  const tmpPath = `${LOG_PATH}.trim.tmp`;
  fs.writeFileSync(tmpPath, trimmed);
  fs.renameSync(tmpPath, LOG_PATH);

  const newSize = fs.statSync(LOG_PATH).size;
  process.stdout.write(JSON.stringify({
    hook: 'scout-log-trim',
    trimmed: true,
    originalSize,
    newSize,
    keptLines: KEEP_LINES,
    timestamp: new Date().toISOString(),
  }) + '\n');
  process.exit(0);
} catch (err) {
  // Never block session; report to stderr only
  process.stderr.write(`scout-log-trim error: ${err.message}\n`);
  process.exit(0);
}
