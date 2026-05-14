#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const TIRITH_BIN = process.env.HOME ? `${process.env.HOME}/.hermes/bin/tirith` : '';
const URL_RE = /https?:\/\/[^\s"'`<>]+/gi;
const FLAGGED = new Set(['MEDIUM', 'HIGH', 'CRITICAL']);
const SAFE = new Set(['LOW', 'SAFE']);

function quote(arg) {
  return `'${String(arg).replace(/'/g, `'\"'\"'`)}'`;
}

function cleanUrl(url) {
  return url.replace(/[)\],.;!?]+$/g, '');
}

function extractUrls(command) {
  const matches = command.match(URL_RE) || [];
  return [...new Set(matches.map(cleanUrl))];
}

function parseAssessment(output) {
  const text = String(output || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const candidate = parsed?.risk || parsed?.riskLevel || parsed?.level || parsed?.severity;
    const reason = parsed?.reason || parsed?.message || parsed?.details || '';
    if (candidate) return { level: String(candidate).toUpperCase(), reason: String(reason).trim() };
  } catch (_) {}

  const levelMatch = text.match(/\b(CRITICAL|HIGH|MEDIUM|LOW|SAFE)\b/i);
  if (!levelMatch) return null;
  const level = levelMatch[1].toUpperCase();
  const reasonMatch = text.match(/(?:reason|details?|message)\s*[:=-]\s*(.+)$/im);
  return { level, reason: reasonMatch ? reasonMatch[1].trim() : '' };
}

function runTirith(url) {
  const output = execSync(`${quote(TIRITH_BIN)} score ${quote(url)}`, {
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseAssessment(output.toString('utf8'));
}

try {
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) process.exit(0);
  if (process.env.TIRITH_BYPASS === '1') {
    process.stderr.write('tirith bypassed\n');
    process.exit(0);
  }

  const event = JSON.parse(raw);
  if (event?.tool_name !== 'Bash') process.exit(0);

  const command = event?.tool_input?.command;
  if (typeof command !== 'string' || !command) process.exit(0);

  const urls = extractUrls(command);
  if (!urls.length) process.exit(0);

  for (const url of urls) {
    if (!TIRITH_BIN || !fs.existsSync(TIRITH_BIN)) process.exit(0);
    const assessment = runTirith(url);
    if (!assessment) continue;
    if (FLAGGED.has(assessment.level)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `tirith flagged ${assessment.level}${assessment.reason ? `: ${assessment.reason}` : ''}`,
        },
      }) + '\n');
      process.exit(0);
    }
    if (!SAFE.has(assessment.level)) continue;
  }
  process.exit(0);
} catch (_) {
  process.exit(0);
}
