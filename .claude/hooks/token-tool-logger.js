#!/usr/bin/env node
// PostToolUse: log tool call and estimate token cost
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const TOKEN_LEDGER = '/Users/marcelspatz/YURI-OS-MUSUBI/Scripts/token-ledger.mjs';

const ESTIMATES = {
  Read: 800, Write: 600, Edit: 400, Bash: 300,
  Glob: 100, Grep: 200, Agent: 8000, WebFetch: 1500,
  WebSearch: 1000, default: 400
};

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const base = (input.tool_name || '').split('__')[0];
    const estimate = ESTIMATES[base] || ESTIMATES.default;

    const sessionPath = '/tmp/claude-current-session';
    if (!fs.existsSync(sessionPath)) return;
    const sessionFile = fs.readFileSync(sessionPath, 'utf8').trim();
    if (!fs.existsSync(sessionFile)) return;

    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session.toolCalls.push({ tool: input.tool_name || 'unknown', estimate, time: new Date().toISOString() });
    session.estimatedTokens += estimate;
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    writeLedgerEvent({
      event_id: `claude-tool-${session.id || 'unknown'}-${session.toolCalls.length}`,
      trace_id: `claude-session-${session.id || 'unknown'}`,
      session_id: String(session.id || ''),
      source_path: '.claude/hooks/token-tool-logger.js',
      lane: 'yuri-cli',
      provider: 'claude-code-tooling',
      request_model: 'tool',
      response_model: 'tool',
      operation_type: 'claude_tool_use_estimate',
      status: 'ok',
      measurement_type: 'estimated_tokenizer',
      input_tokens: estimate,
      output_tokens: 0,
      accuracy_class: 'estimate_tool_heuristic',
      estimator_version: 'claude_tool_estimates_v1',
      payload_hash: hashString(`${input.tool_name || 'unknown'}:${session.toolCalls.length}`),
      metadata: {
        tool_name_hash: hashString(input.tool_name || 'unknown'),
        tool_family: base || 'unknown',
      }
    });
  } catch(e) { /* silent */ }
});

function writeLedgerEvent(event) {
  try {
    const child = spawn(process.execPath, [TOKEN_LEDGER, 'write'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin.end(JSON.stringify(event));
    child.unref();
  } catch (_) {}
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
