#!/usr/bin/env node
// Background scout runner — called by scout-spawn.js as a detached subprocess
// argv[2] = scoutType (ARGUS|YURI-RISK)
// argv[3] = contextFile path (temp file with tool + session context)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const bus = require('./scout-bus.js');

const ERROR_LOG = path.join(__dirname, '..', 'state', 'scout-errors.log');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LLM_COMPAT_SH = process.env.SCOUT_LLM_COMPAT_SH || path.join(REPO_ROOT, 'Scripts', 'llm-compat.sh');
const MAX_LOG_BYTES = 1 * 1024 * 1024; // 1 MB ring cap
const MODEL_SCOUT = 'deepseek';
const NATIVE_SCOUTS = new Set(['ARGUS']);

function rotateErrorLogIfNeeded() {
  try {
    const st = fs.statSync(ERROR_LOG);
    if (st.size <= MAX_LOG_BYTES) return;
    const buf = fs.readFileSync(ERROR_LOG);
    const keep = buf.subarray(Math.max(0, buf.length - Math.floor(MAX_LOG_BYTES / 2)));
    const nlIdx = keep.indexOf(10);
    const trimmed = nlIdx >= 0 ? keep.subarray(nlIdx + 1) : keep;
    fs.writeFileSync(ERROR_LOG, trimmed);
  } catch (_) { /* no-op */ }
}

function logError(msg) {
  try {
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} [scout-runner] ${msg}\n`);
    rotateErrorLogIfNeeded();
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

function extractTool(contextText) {
  const toolMatch = contextText.match(/^TOOL:\s*(\w+)/m);
  return toolMatch ? toolMatch[1] : '';
}

function extractInput(contextText) {
  const inputMatch = contextText.match(/^INPUT:\s*(.*)$/m);
  if (!inputMatch) return {};
  try {
    return JSON.parse(inputMatch[1]);
  } catch (_) {
    return {};
  }
}

function extractContextPct(contextText) {
  const pctMatch = contextText.match(/^\s*context_pct:\s*(\d+)%/m);
  return pctMatch ? Number.parseInt(pctMatch[1], 10) : 0;
}

function extractRecentFiles(contextText) {
  const filesMatch = contextText.match(/^\s*files_written_recent:\s*(.*)$/m);
  if (!filesMatch || filesMatch[1].trim() === 'none') return [];
  return filesMatch[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function topLevelFor(filePath) {
  const normalized = String(filePath || '').replace(process.cwd(), '').replace(/^\/+/, '');
  return normalized.split('/')[0] || '';
}

function compactFinding(finding) {
  return String(finding || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function evaluateArgus(contextText) {
  const toolName = extractTool(contextText);
  const input = extractInput(contextText);
  const isError = /RESULT \(error=YES\):/m.test(contextText);
  const filePath = input.file_path || input.path || '';
  const command = input.command || '';

  if (isError && ['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
    return {
      severity: 'WARN',
      finding: 'File mutation errored; verify file state before reasoning from the attempted change.'
    };
  }

  if (/_SYSTEM\/OS_KERNEL\/memory\.db/.test(filePath) || /sqlite3\b.*_SYSTEM\/OS_KERNEL\/memory\.db/.test(command)) {
    return {
      severity: 'HIGH',
      finding: 'Canonical memory path touched directly; route through verified promotion instead.'
    };
  }

  if (toolName === 'Bash' && /\bgit\s+commit\b/.test(command) && !/\bgit\s+status\b/.test(contextText)) {
    return {
      severity: 'INFO',
      finding: 'Commit command seen without recent status evidence in context; verify staged scope first.'
    };
  }

  return null;
}

function runNativeScout(scoutType, contextText) {
  if (scoutType === 'ARGUS') return evaluateArgus(contextText);
  return null;
}

function runModelScout(scoutType, contextText) {
  const agentMdPath = path.join(__dirname, '..', 'agents', `${scoutType.toLowerCase()}.md`);

  if (!fs.existsSync(agentMdPath)) {
    logError(`Agent definition not found: ${agentMdPath}`);
    return null;
  }

  const agentDef = fs.readFileSync(agentMdPath, 'utf8');
  const fullPrompt = `${agentDef}\n\n---\n\n${contextText}`;

  let rawOutput = '';
  try {
    rawOutput = execFileSync(
      'bash',
      [LLM_COMPAT_SH, '-m', MODEL_SCOUT, '--no-tools', fullPrompt],
      { encoding: 'utf8', timeout: 90_000, cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr).trim().slice(0, 300) : '';
    const detail = stderr ? `${e.message?.slice(0, 200)} | stderr: ${stderr}` : e.message?.slice(0, 200);
    logError(`llm-compat.sh -m ${MODEL_SCOUT} failed for ${scoutType}: ${detail}`);
  }

  return parseScoutOutput(rawOutput, scoutType);
}

function runScout(scoutType, contextFile) {
  if (!scoutType || !contextFile) {
    logError('Missing args: scoutType or contextFile');
    return 1;
  }

  let contextText = '';
  try {
    contextText = fs.readFileSync(contextFile, 'utf8');
    fs.unlinkSync(contextFile);
  } catch (e) {
    logError(`Failed to read context file ${contextFile}: ${e.message}`);
    return 1;
  }

  const normalizedScout = scoutType.toUpperCase();
  const triggerTool = extractTool(contextText);
  const runtimeKind = NATIVE_SCOUTS.has(normalizedScout) ? 'native_function' : 'model_agent';
  const result = NATIVE_SCOUTS.has(normalizedScout)
    ? runNativeScout(normalizedScout, contextText)
    : runModelScout(normalizedScout, contextText);

  if (result) {
    try {
      bus.appendFinding(
        normalizedScout,
        result.severity,
        triggerTool,
        compactFinding(result.finding),
        runtimeKind
      );
    } catch (e) {
      logError(`Bus write failed for ${normalizedScout}: ${e.message}`);
    }
  }

  return 0;
}

if (require.main === module) {
  process.exit(runScout(process.argv[2], process.argv[3]));
}

module.exports = {
  MODEL_SCOUT,
  NATIVE_SCOUTS,
  parseScoutOutput,
  evaluateArgus,
  runNativeScout,
  runModelScout,
  runScout,
};
