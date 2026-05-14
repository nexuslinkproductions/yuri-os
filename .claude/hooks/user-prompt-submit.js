#!/usr/bin/env node
/**
 * UserPromptSubmit hook (Pulse Cortex sensory layer)
 *
 * Responsibilities:
 *   1. Existing EOT keyword detection ("done" / "finished" / "end")
 *   2. PATCH 032: trivial-skip filter + detached pulse-orchestrator spawn
 *
 * Stays non-blocking: heavy work runs in a detached child via spawn(unref).
 * The hook exits in <50ms regardless of orchestrator state.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ORCHESTRATOR = path.join(REPO_ROOT, 'Scripts', 'pulse-orchestrator.mjs');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const TELEMETRY_LOG = path.join(STATE_DIR, 'pulse-hook-telemetry.log');

const EOT_KEYWORDS = ['done', 'finished', 'end'];

// PATCH 032: trivial-skip heuristics — mirror classifyComplexity trivial branch
const MUTATE_VERBS = /(implement|fix|patch|refactor|debug|rename|delete|migrate|audit|review|deploy|create|add|remove|build|wire|extend|promote)/i;
const FILE_PATH    = /[/][\w-]+\.[a-z]+/i;
const LANE_MENTION = /@\w+/;

function isTrivial(text) {
  if (!text) return true;
  if (text.length >= 60) return false;
  if (MUTATE_VERBS.test(text)) return false;
  if (FILE_PATH.test(text)) return false;
  if (LANE_MENTION.test(text)) return false;
  return true;
}

function logTelemetry(line) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(TELEMETRY_LOG, `${new Date().toISOString()} ${line}\n`);
  } catch (_) { /* never throw */ }
}

function spawnOrchestrator(text, turnId) {
  try {
    const child = spawn('node', [ORCHESTRATOR, text], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PULSE_TURN_ID: turnId },
    });
    child.unref();
    return true;
  } catch (e) {
    logTelemetry(`spawn-failed turn=${turnId} reason=${e.message}`);
    return false;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const messages = event.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      process.exit(0);
    }

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      process.exit(0);
    }

    const content = lastMsg.content || [];
    const text = (Array.isArray(content)
      ? content.filter(b => b.type === 'text').map(b => b.text).join(' ')
      : String(content)
    ).trim();

    // 1. EOT keyword check (unchanged behavior)
    const lower = text.toLowerCase();
    if (EOT_KEYWORDS.includes(lower)) {
      console.log(JSON.stringify({
        continue: false,
        systemMessage: '⏹ EOT triggered. Finishing session reflection...'
      }));
      process.exit(0);
    }

    // 2. PATCH 032 trivial-skip + orchestrator dispatch
    const trivial = isTrivial(text);
    const turnId = crypto.randomBytes(4).toString('hex');

    if (trivial) {
      // Innovation C — log trivial-skip telemetry for calibration audit
      logTelemetry(`trivial-skip turn=${turnId} len=${text.length} hash=${crypto.createHash('sha1').update(text).digest('hex').slice(0,8)}`);
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }

    const spawned = spawnOrchestrator(text, turnId);
    logTelemetry(`pulse-spawn turn=${turnId} spawned=${spawned} len=${text.length}`);

    // Inject a 1-line hint so the main thread knows the cortex is spinning up
    console.log(JSON.stringify({
      continue: true,
      additionalContext: spawned
        ? `⬢ pulse-cortex turn=${turnId} spawned — findings will populate .claude/state/pulse-bus.json within 30-60s`
        : `⬢ pulse-cortex turn=${turnId} spawn failed (see pulse-hook-telemetry.log); proceeding without cortex`,
    }));
    process.exit(0);
  } catch (e) {
    logTelemetry(`hook-error: ${e.message}`);
    // Never block the user — fall through to continue:true
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
});
