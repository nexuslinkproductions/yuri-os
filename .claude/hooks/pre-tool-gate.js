#!/usr/bin/env node
/**
 * pre-tool-gate.js — Sprint 3 PreToolUse hook
 *
 * Intercepts Read and Bash tool calls before execution.
 * Injects routing advisory when Claude is about to do work that should be delegated.
 * NEVER blocks — always continue:true. Advisory only, < 20ms exit.
 *
 * Routing recommendations injected as additionalContext:
 *   - Large file reads  → route to deepseek-flash summarizer first
 *   - Broad bash search → route to deepseek-flash
 *   - Multi-file grep   → route to deepseek-flash
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Bash patterns that indicate Claude is doing research/analysis it should delegate
const BROAD_BASH_PATTERNS = [
  /grep\s+-r/i,           // recursive grep
  /find\s+\.\s/i,         // broad find from root
  /find\s+\/\w/i,         // find from system paths
  /cat\s+\S+\s*\|\s*grep/i, // cat + grep pipeline
  /wc\s+-l/i,             // line count (often prelim to full read)
  /head\s+-\d{3,}/i,      // head with 100+ lines
  /ls\s+-la?\s*\|/i,      // ls piped for analysis
  /git\s+log\s+(?!--oneline).*-\d{2,}/i, // long git log
];

// File extensions that are typically large / need summarization before full read
const LARGE_FILE_SIGNALS = [
  /\.(mjs|js)$/, // JS files can be 500-1000+ lines
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.log$/,
  /memory\.db$/,
];

// Small/safe files always allowed without advisory
const SAFE_FILE_PATTERNS = [
  /\.(md|json|yaml|yml|env|txt)$/,
  /settings\.json$/,
  /CLAUDE\.md$/,
  /SOUL\.md$/,
  /MEMORY\.md$/,
];

function isSafeFile(filePath) {
  return SAFE_FILE_PATTERNS.some(p => p.test(filePath));
}

function isLikelyLargeFile(filePath) {
  if (isSafeFile(filePath)) return false;
  return LARGE_FILE_SIGNALS.some(p => p.test(filePath));
}

function isBroadBash(cmd) {
  return BROAD_BASH_PATTERNS.some(p => p.test(cmd));
}

function buildReadAdvisory(filePath) {
  return [
    `⬢ pre-tool-gate: Large file read — ${path.basename(filePath)}`,
    `  → Delegation option: bash Scripts/offload.sh @deepseek-flash "summarize key points from ${filePath}"`,
    `  → Or: bash Scripts/offload.sh @deepseek-flash "extract <specific section> from ${filePath}"`,
    `  Proceeding with direct read — route to deepseek-flash if output is noisy.`,
  ].join('\n');
}

function buildBashAdvisory(cmd) {
  const snippet = cmd.slice(0, 80).replace(/\n/g, ' ');
  return [
    `⬢ pre-tool-gate: Broad search detected — "${snippet}..."`,
    `  → Delegation option: bash Scripts/offload.sh @deepseek-flash "run: ${snippet} and summarize findings"`,
    `  Proceeding — consider routing result analysis to deepseek-flash if output is large.`,
  ].join('\n');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const toolName = event.tool_name || event.toolName || '';
    const input = event.tool_input || event.input || {};

    let advisory = null;

    if (toolName === 'Read') {
      const filePath = String(input.file_path || input.path || '');
      if (filePath && isLikelyLargeFile(filePath)) {
        advisory = buildReadAdvisory(filePath);
      }
    } else if (toolName === 'Bash') {
      const cmd = String(input.command || input.cmd || '');
      if (cmd && isBroadBash(cmd)) {
        advisory = buildBashAdvisory(cmd);
      }
    }

    if (advisory) {
      process.stdout.write(JSON.stringify({ continue: true, additionalContext: advisory }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ continue: true }) + '\n');
    }
  } catch (_) {
    // Never block on parse error
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  }
  process.exit(0);
});
