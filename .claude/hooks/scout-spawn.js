#!/usr/bin/env node
// PostToolUse — spawn background scout agents to review the tool call
'use strict';
if (process.env.NUDIMMUD_DISABLE_SCOUTS === '1') {
  process.exit(0);
}
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const bus = require('./scout-bus.js');
const cassandraLite = require('./cassandra-lite.js');

// Tools that warrant scout analysis
const SUBSTANTIVE = new Set(['Write', 'Edit', 'MultiEdit', 'Bash', 'Agent']);
// Tools that trigger HERMES (file-level context drift)
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const SCOUT_RUNNER = path.join(__dirname, 'scout-runner.js');
const ss_path = path.join(__dirname, '..', 'state', 'session-state.json');

function readSessionState() {
  try { return JSON.parse(fs.readFileSync(ss_path, 'utf8')); }
  catch { return {}; }
}

function buildContext(toolName, toolInput, toolResult, peers, sessionState) {
  const inputSummary = JSON.stringify(toolInput || {}).slice(0, 500);
  const resultSummary = (() => {
    const c = toolResult?.content;
    if (!c) return '(no result)';
    if (typeof c === 'string') return c.slice(0, 300);
    if (Array.isArray(c)) return JSON.stringify(c).slice(0, 300);
    return String(c).slice(0, 300);
  })();
  const isError = toolResult?.is_error ? 'YES' : 'NO';

  const peerBlock = peers.length > 0
    ? peers.map(p =>
        `  ${p.scout} (${p.severity}) @${new Date(p.ts).toISOString().slice(11, 19)}: ${p.finding}`
      ).join('\n')
    : '  None';

  const ss = sessionState;
  const filesWritten = (ss.files_written || []).slice(-5).join(', ') || 'none';
  const toolsUsed = (ss.tools_used || []).length;
  const lastError = ss.errors?.length
    ? ss.errors[ss.errors.length - 1]?.snippet?.slice(0, 100)
    : 'none';
  const branch = ss.git?.branch || 'unknown';
  const contextPct = ss.context?.pct?.toFixed(0) || '?';

  return [
    `TOOL: ${toolName}`,
    `INPUT: ${inputSummary}`,
    `RESULT (error=${isError}): ${resultSummary}`,
    ``,
    `SESSION CONTEXT:`,
    `  branch: ${branch}`,
    `  context_pct: ${contextPct}%`,
    `  tools_used_count: ${toolsUsed}`,
    `  files_written_recent: ${filesWritten}`,
    `  last_error: ${lastError}`,
    ``,
    `PEER FINDINGS (other scouts, last 3 min):`,
    peerBlock,
  ].join('\n');
}

function spawnScout(scoutType, contextText) {
  const contextFile = path.join('/tmp', `scout-ctx-${scoutType}-${Date.now()}.txt`);
  fs.writeFileSync(contextFile, contextText);

  const child = spawn('node', [SCOUT_RUNNER, scoutType, contextFile], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();
}

// ── Main ─────────────────────────────────────────────────────────────────────
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw || '{}');
    const toolName = event?.tool_name || '';
    const toolInput = event?.tool_input || {};
    const toolResult = event?.tool_response || {};

    if (!SUBSTANTIVE.has(toolName)) {
      process.exit(0);
    }

    // ── CASSANDRA-LITE: instant heuristic, no subprocess ──────────────────
    const liteResult = cassandraLite.check(toolName, toolInput);
    if (liteResult.hit) {
      bus.appendFinding(
        'CASSANDRA-LITE',
        liteResult.severity,
        toolName,
        `[INSTANT] ${liteResult.msg} — verify intent before proceeding.`,
        'native_function'
      );
    }

    // ── Read bus state for throttle + peer context ─────────────────────────
    const b = bus.readBus();

    // If too many unconsumed entries, back off (scouts are backed up)
    if (bus.countUnconsumed(b) >= 5) {
      process.exit(0);
    }

    const sessionState = readSessionState();

    // ── ARGUS: logic scout — Write, Edit, Bash, Agent ─────────────────────
    if (bus.canSpawn(b, 'ARGUS')) {
      const peers = bus.getPeerFindings(b, 'ARGUS');
      const ctx = buildContext(toolName, toolInput, toolResult, peers, sessionState);
      bus.recordSpawn(b, 'ARGUS');
      spawnScout('ARGUS', ctx);
    }

    // ── CASSANDRA: risk scout — Write, Edit, Bash ─────────────────────────
    const CASSANDRA_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Bash']);
    if (CASSANDRA_TOOLS.has(toolName) && bus.canSpawn(b, 'CASSANDRA')) {
      const peers = bus.getPeerFindings(b, 'CASSANDRA');
      const ctx = buildContext(toolName, toolInput, toolResult, peers, sessionState);
      bus.recordSpawn(b, 'CASSANDRA');
      spawnScout('CASSANDRA', ctx);
    }

    // ── HERMES: context scout — Write, Edit only ──────────────────────────
    if (FILE_TOOLS.has(toolName) && bus.canSpawn(b, 'HERMES')) {
      const peers = bus.getPeerFindings(b, 'HERMES');
      const ctx = buildContext(toolName, toolInput, toolResult, peers, sessionState);
      bus.recordSpawn(b, 'HERMES');
      spawnScout('HERMES', ctx);
    }

    // Persist updated throttle timestamps
    bus.writeBus(b);

  } catch (_) {}
  process.exit(0);
});
