#!/usr/bin/env node
// delegation-nudge — PreToolUse advisory: soft nudge when main lane stacks direct edits.
// Fails open: malformed stdin / counter errors → allow silently. Never blocks.
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
const COUNT_FILE = path.join(REPO_ROOT, '.claude', 'state', 'delegation-nudge-count.json');

const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes
const THRESHOLD = 3;
const MUTATION_TOOLS = new Set(['Edit', 'Write', 'ast_edit']);

// Conservative bash heuristic: commands that write files in-place or apply patches.
const BASH_MUTATION_RE = /(?:^|[\s;|&]|\$\()(?:sed\s+-i|gsed\s+-i|apply_patch|patch\s+(?:-p\d+\s+)?<|mktemp|tee\s+|cat\s+.*>\s*\S|cat\s+.*>>\s*\S|heredoc|<<EOF|<<\s*['"]?EOF)/i;

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function loadCount() {
  try {
    const raw = fs.readFileSync(COUNT_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data.count === 'number' && typeof data.lastTs === 'number') {
      return { count: data.count, lastTs: data.lastTs, lastTool: data.lastTool || '' };
    }
  } catch { /* missing/malformed → fresh */ }
  return { count: 0, lastTs: 0, lastTool: '' };
}

function saveCount(state) {
  try {
    fs.mkdirSync(path.dirname(COUNT_FILE), { recursive: true });
    const tmp = `${COUNT_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({
      count: state.count,
      lastTs: state.lastTs,
      lastTool: state.lastTool,
    }) + '\n');
    fs.renameSync(tmp, COUNT_FILE);
  } catch {
    // best-effort persistence
  }
}

function isDirectMutation(ev) {
  const toolName = ev?.tool_name || ev?.toolName || ev?.tool || '';
  if (MUTATION_TOOLS.has(toolName)) return true;
  if (toolName === 'Bash') {
    const cmd = String(
      ev?.tool_input?.command ?? ev?.input?.command ?? ev?.tool_input?.cmd ?? ev?.input?.cmd ?? ''
    );
    return BASH_MUTATION_RE.test(cmd);
  }
  return false;
}

function emitAdvisory() {
  const msg = 'delegation-nudge: 3rd direct main-lane edit in a row — this looks like work a mure-* / worker lane should own. Consider task(agent:...) for the rest (fan the same role across instances if it divides). persona.md → Delegate by default.';
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: msg,
      },
    }) + '\n');
  } catch {
    // advisory channel failed; do not block
  }
}

function isDelegationReset(ev) {
  const toolName = ev?.tool_name || ev?.toolName || ev?.tool || '';
  return toolName === 'task' || toolName === 'Task';
}

function run() {
  const raw = readStdin().trim();
  if (!raw) return;

  let ev;
  try { ev = JSON.parse(raw); } catch { return; } // malformed → fail-open silently

  const now = Date.now();
  let state = loadCount();

  // Reset on explicit delegation or session gap.
  if (isDelegationReset(ev) || (state.lastTs > 0 && now - state.lastTs > SESSION_GAP_MS)) {
    state = { count: 0, lastTs: now, lastTool: '' };
    saveCount(state);
    return;
  }

  if (isDirectMutation(ev)) {
    state.count += 1;
    state.lastTs = now;
    state.lastTool = ev?.tool_name || ev?.toolName || ev?.tool || '';

    if (state.count >= THRESHOLD) {
      emitAdvisory();
      state.count = 0; // reset so nudge fires only after another run of 3
    }
  }

  saveCount(state);
}

try { run(); } catch { /* never break the session */ }
process.exit(0);
