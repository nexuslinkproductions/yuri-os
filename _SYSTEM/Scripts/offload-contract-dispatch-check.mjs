#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// PATCH 018 — Legacy dispatch tokens allowlist.
// These tokens stay in offload.sh dispatch for backward compatibility but are
// not in offload-contract.mjs lanes (deprecated aliases, retired model versions,
// or dispatch-only tokens). Reviewing: 2026-05-14. Annual review marker.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_FILE = join(SCRIPT_DIR, 'offload-contract.mjs');
const OFFLOAD_FILE = join(SCRIPT_DIR, 'offload.sh');

const usage = `Usage: node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs [--json] [--verbose] [--help]

Checks drift between _SYSTEM/Scripts/offload-contract.mjs lanes and _SYSTEM/Scripts/offload.sh dispatch surfaces.

Options:
  --json       Print structured JSON.
  --verbose    Show every lane. Default text mode shows NEW drift rows only.
  --help       Show this help.
`;

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  process.stdout.write(usage);
  process.exit(0);
}

const jsonMode = args.has('--json');
const verbose = args.has('--verbose');

for (const arg of args) {
  if (!['--json', '--verbose', '--help', '-h'].includes(arg)) {
    console.error(`Unknown option: ${arg}\n\n${usage}`);
    process.exit(2);
  }
}

function readText(file) {
  return readFileSync(file, 'utf8');
}

function requireSyntaxOk(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`${label} syntax check failed.`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(2);
  }
}

function balancedBlock(text, startPattern) {
  const match = startPattern.exec(text);
  if (!match) return '';
  const open = text.indexOf('{', match.index);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') depth -= 1;
    if (depth === 0) return text.slice(open + 1, i);
  }
  return '';
}

function extractContractLanes(text) {
  const body = balancedBlock(text, /\blanes\s*:/);
  const lanes = [];
  const entryRe = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/gm;
  let match;
  while ((match = entryRe.exec(body))) {
    const lane = match[1];
    const entry = balancedBlock(body.slice(match.index), new RegExp(`^\\s*${lane}\\s*:`));
    const aliases = [];
    const aliasMatch = /\balias\s*:\s*['"]([^'"]+)['"]/.exec(entry);
    if (aliasMatch) aliases.push(aliasMatch[1].replace(/^@/, ''));
    const aliasesMatch = /\baliases\s*:\s*\[([^\]]*)\]/.exec(entry);
    if (aliasesMatch) {
      for (const alias of aliasesMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
        aliases.push(alias[1].replace(/^@/, ''));
      }
    }
    const dispatchTokens = [];
    const dispatchTokensMatch = /\bdispatchTokens\s*:\s*\[([^\]]*)\]/.exec(entry);
    if (dispatchTokensMatch) {
      for (const token of dispatchTokensMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
        dispatchTokens.push(token[1].replace(/^@/, ''));
      }
    }
    lanes.push({ lane, tokens: [...new Set(dispatchTokens.length ? dispatchTokens : [lane, ...aliases])] });
  }
  return lanes;
}

function extractFunction(text, name) {
  return balancedBlock(text, new RegExp(`\\b${name}\\s*\\(\\)\\s*`));
}

function splitCaseTokens(pattern) {
  return pattern
    .split('|')
    .map((token) => token.trim().replace(/^@/, ''))
    .filter(Boolean)
    .filter((token) => !/[*$?[\]]/.test(token));
}

function extractCaseTokens(functionBody) {
  const tokens = new Set();
  const caseRe = /^\s*([^\n()]*?(?:\|[^\n()]*)*)\)\s*$/gm;
  let match;
  while ((match = caseRe.exec(functionBody))) {
    for (const token of splitCaseTokens(match[1])) tokens.add(token);
  }
  return tokens;
}

function extractListModelTokens(functionBody) {
  const tokens = new Set();
  for (const match of functionBody.matchAll(/printf\s+'[^']*'\s+"([^"]+)"/g)) {
    tokens.add(match[1].replace(/^@/, ''));
  }
  return tokens;
}

function hasAny(set, tokens) {
  return tokens.some((token) => set.has(token));
}

function mark(value) {
  return value ? '✓' : '✗';
}

const LEGACY_DISPATCH_TOKENS = new Set([
  'claude-3-5-sonnet',
  'claude-3-5-sonnet-liberated',
  'claude-3-opus',
  'code-cloud',
  'codex',
  'codex-full',
  'codex-high',
  'codex-mini',
  'deepseek-liberated:latest',
  'deepseek-r1:8b',
  'deepseek-r1:latest',
  'deepseek-v2:16b',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'fast-codex',
  'gemma',
  'gemma-cloud',
  'gemma-local',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-oss:120b',
  'gpt-oss:20b',
  'kimi-k2.5',
  'kimi-k2.5-liberated',
  'kimi-k2.6',
  'moonshot',
  'needle',
  'nvidia-deepseek',
  'openrouter-free',
  'openrouter/free',
  'perplexity-sonar',
  'reason-cloud',
  'self',
  'sonar-pro',
  'sonar-reasoning-pro',
  'spark',
  'triage-local',
]);

function printTable(rows) {
  const visible = verbose ? rows : rows.filter((row) => row.drift);
  const tableRows = visible.length ? visible : [];
  if (!verbose && tableRows.length === 0) {
    console.log('No NEW drift rows.');
    return;
  }
  const widths = {
    lane: Math.max('lane'.length, ...tableRows.map((row) => row.lane.length)),
    tokens: Math.max('tokens'.length, ...tableRows.map((row) => row.tokens.join(', ').length)),
  };
  console.log(`${'lane'.padEnd(widths.lane)}  ${'tokens'.padEnd(widths.tokens)}  contract  dispatch  direct-token  list-models  legacy  drift  note`);
  console.log(`${'-'.repeat(widths.lane)}  ${'-'.repeat(widths.tokens)}  --------  --------  ------------  -----------  ------  -----  ----`);
  for (const row of tableRows) {
    const note = row.legacy ? 'legacy-dispatch-token' : '';
    console.log(`${row.lane.padEnd(widths.lane)}  ${row.tokens.join(', ').padEnd(widths.tokens)}  ${mark(row.in_contract).padEnd(8)}  ${mark(row.in_dispatch).padEnd(8)}  ${mark(row.in_direct_token).padEnd(12)}  ${mark(row.in_list_models).padEnd(11)}  ${mark(row.legacy).padEnd(6)}  ${mark(row.drift)}      ${note}`);
  }
}

requireSyntaxOk(process.execPath, ['--check', CONTRACT_FILE], 'offload-contract.mjs');
requireSyntaxOk('bash', ['-n', OFFLOAD_FILE], 'offload.sh');

const contractText = readText(CONTRACT_FILE);
const offloadText = readText(OFFLOAD_FILE);
const lanes = extractContractLanes(contractText);
const contractTokens = new Set(lanes.flatMap((entry) => entry.tokens));
const dispatchTokens = extractCaseTokens(extractFunction(offloadText, 'dispatch_model'));
const directTokens = extractCaseTokens(extractFunction(offloadText, 'is_direct_lane_token'));
const listTokens = extractListModelTokens(extractFunction(offloadText, 'list_models'));

const rows = lanes.map(({ lane, tokens }) => {
  const legacy = hasAny(LEGACY_DISPATCH_TOKENS, tokens);
  const row = {
    lane,
    tokens,
    in_contract: hasAny(contractTokens, tokens) || legacy,
    in_dispatch: hasAny(dispatchTokens, tokens),
    in_direct_token: hasAny(directTokens, tokens),
    in_list_models: hasAny(listTokens, tokens),
    legacy,
  };
  row.drift = row.in_dispatch && !row.in_contract && !row.legacy;
  return row;
});

for (const token of [...dispatchTokens].sort()) {
  const legacy = LEGACY_DISPATCH_TOKENS.has(token);
  if (!contractTokens.has(token)) {
    rows.push({
      lane: token,
      tokens: [token],
      in_contract: legacy,
      in_dispatch: true,
      in_direct_token: directTokens.has(token),
      in_list_models: listTokens.has(token),
      legacy,
      drift: !legacy,
    });
  }
}

if (jsonMode) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  printTable(rows);
}

process.exit(rows.some((row) => row.drift) ? 1 : 0);
