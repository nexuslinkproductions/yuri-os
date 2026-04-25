#!/usr/bin/env node
// PostToolUse: log tool call and estimate token cost
const fs = require('fs');

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
  } catch(e) { /* silent */ }
});
