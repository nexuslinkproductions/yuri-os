#!/usr/bin/env node
// session-checkpoint.js — PostToolUse hook: incremental session snapshot
// Writes .claude/state/session-checkpoint.json every 30+ minutes.
// Silent on any error; never blocks session.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = process.cwd();
const CHECKPOINT_PATH = path.join(REPO_ROOT, '.claude', 'state', 'session-checkpoint.json');
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

try {
  // ── Throttle: skip if last write was < 30 min ago ──────────────────────
  let lastWrite = 0;
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
      if (prev && prev.timestamp) {
        lastWrite = new Date(prev.timestamp).getTime();
        if (Date.now() - lastWrite < THROTTLE_MS) {
          // Within throttle window — skip
          process.exit(0);
        }
      }
    } catch (_) {
      // Corrupt or empty — proceed to write fresh
    }
  }

  // ── Gather snapshot data ───────────────────────────────────────────────
  const timestamp = new Date().toISOString();
  const cwd = process.cwd();

  // Git branch
  let branch = null;
  try {
    branch = execSync('git branch --show-current', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    if (!branch) {
      // Try reading .git/HEAD directly (detached HEAD fallback)
      const headPath = path.join(REPO_ROOT, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        branch = fs.readFileSync(headPath, 'utf8').trim().replace(/^ref: refs\/heads\//, '');
      }
    }
  } catch (_) {
    try {
      const headPath = path.join(REPO_ROOT, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        branch = fs.readFileSync(headPath, 'utf8').trim().replace(/^ref: refs\/heads\//, '');
      }
    } catch (__) {}
  }

  // Recent commits (last 10)
  let recentCommits = [];
  try {
    const log = execSync('git log --oneline -10', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    if (log) recentCommits = log.split('\n');
  } catch (_) {}

  // Scout state (last 5 entries)
  let scoutState = null;
  try {
    const scoutPath = path.join(REPO_ROOT, '.claude', 'state', 'scout-bus.json');
    if (fs.existsSync(scoutPath)) {
      const scoutData = JSON.parse(fs.readFileSync(scoutPath, 'utf8'));
      if (Array.isArray(scoutData)) {
        scoutState = scoutData.slice(-5);
      } else if (Array.isArray(scoutData.entries)) {
        scoutState = scoutData.entries.slice(-5);
      }
    }
  } catch (_) {}

  // ── Build payload ──────────────────────────────────────────────────────
  const payload = {
    timestamp,
    cwd,
    branch,
    recent_commits: recentCommits,
    scout_state: scoutState,
    pid: process.pid,
  };

  // ── Atomic write: tmp + rename ─────────────────────────────────────────
  const dir = path.dirname(CHECKPOINT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${CHECKPOINT_PATH}.ckpt.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, CHECKPOINT_PATH);

  process.exit(0);
} catch (err) {
  // Never block session
  process.stderr.write(`session-checkpoint error: ${err.message}\n`);
  process.exit(0);
}
