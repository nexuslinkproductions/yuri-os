#!/usr/bin/env node
// Background scout runner — called by scout-spawn.js as a detached subprocess
// argv[2] = scoutType (ARGUS|CASSANDRA|HERMES)
// argv[3] = contextFile path (temp file with tool + session context)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bus = require('./scout-bus.js');

const ERROR_LOG = path.join(__dirname, '..', 'state', 'scout-errors.log');

function logError(msg) {
  try {
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} [scout-runner] ${msg}\n`);
  } catch (_) {}
}

function parseScoutOutput(raw, scoutType) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^PASS\s*$/i.test(trimmed)) return null;

  const severityMatch = trimmed.match(/SEVERITY:\s*(INFO|WARN|HIGH|CRITICAL)/i);
  const findingMatch = trimmed.match(/FINDING:\s*(.+)/i);

  if (!severityMatch || !findingMatch) {
    // Malformed — store raw as INFO
    const snippet = trimmed.replace(/\n/g, ' ').slice(0, 120);
    if (snippet.length > 10) return { severity: 'INFO', finding: snippet };
    return null;
  }

  return {
    severity: severityMatch[1].toUpperCase(),
    finding: findingMatch[1].trim().slice(0, 200),
  };
}

const scoutType = process.argv[2];
const contextFile = process.argv[3];

if (!scoutType || !contextFile) {
  logError('Missing args: scoutType or contextFile');
  process.exit(1);
}

const agentMdPath = path.join(__dirname, '..', 'agents', `${scoutType.toLowerCase()}.md`);

if (!fs.existsSync(agentMdPath)) {
  logError(`Agent definition not found: ${agentMdPath}`);
  process.exit(1);
}

let contextText = '';
try {
  contextText = fs.readFileSync(contextFile, 'utf8');
  fs.unlinkSync(contextFile); // clean up immediately
} catch (e) {
  logError(`Failed to read context file ${contextFile}: ${e.message}`);
  process.exit(1);
}

const agentDef = fs.readFileSync(agentMdPath, 'utf8');
const fullPrompt = agentDef + '\n\n---\n\n' + contextText;

const promptFile = path.join('/tmp', `scout-${scoutType}-${Date.now()}.txt`);
fs.writeFileSync(promptFile, fullPrompt);

let rawOutput = '';
try {
  rawOutput = execSync(
    `claude -p --model claude-haiku-4-5-20251001 "$(cat '${promptFile}')" 2>/dev/null`,
    { encoding: 'utf8', timeout: 60_000, cwd: process.cwd() }
  );
} catch (e) {
  logError(`claude -p failed for ${scoutType}: ${e.message?.slice(0, 200)}`);
} finally {
  try { fs.unlinkSync(promptFile); } catch (_) {}
}

if (!rawOutput) process.exit(0);

// Extract trigger_tool from context (first line is "TOOL: <name>")
const toolMatch = contextText.match(/^TOOL:\s*(\w+)/m);
const triggerTool = toolMatch ? toolMatch[1] : '';

const result = parseScoutOutput(rawOutput, scoutType);
if (result) {
  try {
    bus.appendFinding(scoutType, result.severity, triggerTool, result.finding);
  } catch (e) {
    logError(`Bus write failed for ${scoutType}: ${e.message}`);
  }
}

process.exit(0);
