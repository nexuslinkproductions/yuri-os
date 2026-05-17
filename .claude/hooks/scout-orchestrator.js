#!/usr/bin/env node
/**
 * scout-orchestrator.js — Unified scout hook (CONSOLIDATION 2026-05-16)
 *
 * Replaces: scout-session-start.js + scout-inject.js + scout-spawn.js
 * Kept separate: scout-runner.js (execution worker) + scout-bus.js (shared module)
 *
 * Event detection: reads stdin, dispatches based on payload shape:
 *   session_id && !tool_name   → SessionStart  (init bus + trim log)
 *   tool_name  && !tool_response → PreToolUse  (inject findings into context)
 *   tool_name  && tool_response  → PostToolUse (spawn background scouts)
 *
 * Fix: scout-inject.js was writing to stderr — findings never reached Claude.
 *       This file writes additionalContext to stdout.
 */

'use strict';

if (process.env.NUDIMMUD_DISABLE_SCOUTS === '1') {
  process.exit(0);
}

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const bus  = require('./scout-bus.js');

let cassandraLite;
try { cassandraLite = require('./cassandra-lite.js'); } catch (_) { cassandraLite = null; }

const REPO_ROOT     = path.resolve(__dirname, '..', '..');
const LOG_PATH      = path.join(REPO_ROOT, '.claude', 'state', 'scout-errors.log');
const SCOUT_RUNNER  = path.join(__dirname, 'scout-runner.js');
const ss_path       = path.join(__dirname, '..', 'state', 'session-state.json');

const SIZE_THRESHOLD = 50 * 1024;   // 50 KB
const KEEP_LINES     = 200;
const SEV_ORDER      = { CRITICAL: 4, HIGH: 3, WARN: 2, INFO: 1 };
const SUBSTANTIVE    = new Set(['Write', 'Edit', 'MultiEdit', 'Bash', 'Agent']);
const FILE_TOOLS     = new Set(['Write', 'Edit', 'MultiEdit']);
const CASSANDRA_TOOLS= new Set(['Write', 'Edit', 'MultiEdit', 'Bash']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function readSessionState() {
  try { return JSON.parse(fs.readFileSync(ss_path, 'utf8')); }
  catch { return {}; }
}

function buildContext(toolName, toolInput, toolResult, peers, sessionState) {
  const inputSummary  = JSON.stringify(toolInput || {}).slice(0, 500);
  const resultSummary = (() => {
    const c = toolResult?.content;
    if (!c) return '(no result)';
    if (typeof c === 'string') return c.slice(0, 300);
    if (Array.isArray(c)) return JSON.stringify(c).slice(0, 300);
    return String(c).slice(0, 300);
  })();
  const isError = toolResult?.is_error ? 'YES' : 'NO';
  const peerBlock = peers.length > 0
    ? peers.map(p => `  ${p.scout} (${p.severity}) @${new Date(p.ts).toISOString().slice(11, 19)}: ${p.finding}`).join('\n')
    : '  None';
  const ss           = sessionState;
  const filesWritten = (ss.files_written || []).slice(-5).join(', ') || 'none';
  const toolsUsed    = (ss.tools_used || []).length;
  const lastError    = ss.errors?.length ? ss.errors[ss.errors.length - 1]?.snippet?.slice(0, 100) : 'none';
  return [
    `TOOL: ${toolName}`,
    `INPUT: ${inputSummary}`,
    `RESULT (error=${isError}): ${resultSummary}`,
    '',
    'SESSION CONTEXT:',
    `  branch: ${ss.git?.branch || 'unknown'}`,
    `  context_pct: ${ss.context?.pct?.toFixed(0) || '?'}%`,
    `  tools_used_count: ${toolsUsed}`,
    `  files_written_recent: ${filesWritten}`,
    `  last_error: ${lastError}`,
    '',
    'PEER FINDINGS (other scouts, last 3 min):',
    peerBlock,
  ].join('\n');
}

function spawnScout(scoutType, contextText) {
  const contextFile = path.join('/tmp', `scout-ctx-${scoutType}-${Date.now()}.txt`);
  fs.writeFileSync(contextFile, contextText);
  const child = spawn('node', [SCOUT_RUNNER, scoutType, contextFile], {
    detached: true, stdio: 'ignore', cwd: REPO_ROOT,
  });
  child.unref();
}

// ── Event handlers ────────────────────────────────────────────────────────────

function handleSessionStart() {
  // 1. Bus init + session reset
  try { bus.initIfMissing(); bus.resetForNewSession(); } catch (_) {}

  // 2. Log trim
  try {
    if (fs.existsSync(LOG_PATH)) {
      const stat = fs.statSync(LOG_PATH);
      if (stat.size > SIZE_THRESHOLD) {
        const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n');
        const trimmed = lines.slice(-KEEP_LINES).join('\n');
        const tmp = `${LOG_PATH}.trim.tmp`;
        fs.writeFileSync(tmp, trimmed);
        fs.renameSync(tmp, LOG_PATH);
      }
    }
  } catch (_) {}

  process.exit(0);
}

function handlePreToolUse() {
  // Inject pending scout findings into Claude's context (stdout — fixed from stderr)
  try {
    const b = bus.readBus();
    const pending = bus.getUnconsumed(b);
    if (pending.length === 0) { process.exit(0); return; }

    pending.sort((a, b) =>
      (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0) ||
      new Date(a.ts) - new Date(b.ts)
    );

    const toInject = pending.slice(0, 3);
    const icons = { CRITICAL: '🔴', HIGH: '🟠', WARN: '🟡', INFO: '🔵' };
    const lines = toInject.map(e => {
      const time = new Date(e.ts).toISOString().slice(11, 19);
      return `${icons[e.severity] || '⚪'} ${e.scout} [${e.severity}] @${time} — ${e.finding}`;
    });

    const block = [`<scout-findings count="${toInject.length}">`, ...lines, '</scout-findings>'].join('\n');
    bus.markConsumed(b, toInject.map(e => e.id));
    bus.writeBus(b);

    // stdout — not stderr (bug fix)
    emitJson({ continue: true, additionalContext: block });
  } catch (_) {}
  process.exit(0);
}

function handlePostToolUse(event) {
  try {
    const toolName  = event?.tool_name || '';
    const toolInput = event?.tool_input || {};
    const toolResult= event?.tool_response || {};

    if (!SUBSTANTIVE.has(toolName)) { process.exit(0); return; }

    // CASSANDRA-LITE: instant heuristic
    if (cassandraLite) {
      const liteResult = cassandraLite.check(toolName, toolInput);
      if (liteResult.hit) {
        bus.appendFinding(
          'CASSANDRA-LITE', liteResult.severity, toolName,
          `[INSTANT] ${liteResult.msg} — verify intent before proceeding.`, 'native_function'
        );
      }
    }

    const b = bus.readBus();
    if (bus.countUnconsumed(b) >= 5) { process.exit(0); return; }

    const sessionState = readSessionState();

    if (bus.canSpawn(b, 'ARGUS')) {
      const ctx = buildContext(toolName, toolInput, toolResult, bus.getPeerFindings(b, 'ARGUS'), sessionState);
      bus.recordSpawn(b, 'ARGUS');
      spawnScout('ARGUS', ctx);
    }
    if (CASSANDRA_TOOLS.has(toolName) && bus.canSpawn(b, 'CASSANDRA')) {
      const ctx = buildContext(toolName, toolInput, toolResult, bus.getPeerFindings(b, 'CASSANDRA'), sessionState);
      bus.recordSpawn(b, 'CASSANDRA');
      spawnScout('CASSANDRA', ctx);
    }
    if (FILE_TOOLS.has(toolName) && bus.canSpawn(b, 'HERMES')) {
      const ctx = buildContext(toolName, toolInput, toolResult, bus.getPeerFindings(b, 'HERMES'), sessionState);
      bus.recordSpawn(b, 'HERMES');
      spawnScout('HERMES', ctx);
    }
    bus.writeBus(b);
  } catch (_) {}
  process.exit(0);
}

// ── Main: detect event type from stdin ───────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(raw || '{}'); } catch (_) {}

  if (event.session_id && !event.tool_name) {
    handleSessionStart();
  } else if (event.tool_name && !event.tool_response) {
    handlePreToolUse();
  } else if (event.tool_name && event.tool_response !== undefined) {
    handlePostToolUse(event);
  } else {
    // Unknown event type — passthrough
    process.exit(0);
  }
});
