#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_FILE = join(SCRIPT_DIR, 'offload-contract.mjs');
const OFFLOAD_FILE = join(SCRIPT_DIR, 'offload.sh');

const usage = `Usage: node Scripts/offload-contract-dispatch-check.mjs [--json] [--verbose] [--help]

Checks drift between Scripts/offload-contract.mjs lanes and Scripts/offload.sh dispatch surfaces.

Options:
  --json       Print structured JSON.
  --verbose    Show every lane. Default text mode shows drift rows only, unless no drift.
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

function printTable(rows) {
  const visible = verbose ? rows : rows.filter((row) => row.drift);
  const tableRows = visible.length ? visible : rows;
  const widths = {
    lane: Math.max('lane'.length, ...tableRows.map((row) => row.lane.length)),
    tokens: Math.max('tokens'.length, ...tableRows.map((row) => row.tokens.join(', ').length)),
  };
  console.log(`${'lane'.padEnd(widths.lane)}  ${'tokens'.padEnd(widths.tokens)}  contract  dispatch  direct-token  list-models  drift  note`);
  console.log(`${'-'.repeat(widths.lane)}  ${'-'.repeat(widths.tokens)}  --------  --------  ------------  -----------  -----  ----`);
  for (const row of tableRows) {
    const note = row.acceptable_dispatch_only ? 'accepted-dispatch-only' : '';
    console.log(`${row.lane.padEnd(widths.lane)}  ${row.tokens.join(', ').padEnd(widths.tokens)}  ${mark(row.in_contract).padEnd(8)}  ${mark(row.in_dispatch).padEnd(8)}  ${mark(row.in_direct_token).padEnd(12)}  ${mark(row.in_list_models).padEnd(11)}  ${mark(row.drift)}      ${note}`);
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
const acceptableDispatchOnlyTokens = new Set([
  'deepseek-r1:8b',
  'deepseek-r1:latest',
  'deepseek-liberated:latest',
  'deepseek-v2:16b',
  'nvidia-deepseek',
  'openrouter-free',
  'openrouter/free',
  'self',
]);

const rows = lanes.map(({ lane, tokens }) => {
  const row = {
    lane,
    tokens,
    in_contract: true,
    in_dispatch: hasAny(dispatchTokens, tokens),
    in_direct_token: hasAny(directTokens, tokens),
    in_list_models: hasAny(listTokens, tokens),
  };
  row.drift = !row.in_dispatch;
  return row;
});

for (const token of [...dispatchTokens].sort()) {
  if (!contractTokens.has(token)) {
    const acceptable = acceptableDispatchOnlyTokens.has(token);
    rows.push({
      lane: token,
      tokens: [token],
      in_contract: false,
      in_dispatch: true,
      in_direct_token: directTokens.has(token),
      in_list_models: listTokens.has(token),
      acceptable_dispatch_only: acceptable,
      drift: !acceptable,
    });
  }
}

if (jsonMode) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  printTable(rows);
}

process.exit(rows.some((row) => row.drift) ? 1 : 0);
