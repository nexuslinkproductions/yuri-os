#!/usr/bin/env node
/**
 * Neutral shared CORE for framework-disciplined external reasoning-lane dispatch.
 *
 * DEV-ONLY. Model-agnostic pure functions + a generic CLI driver. Concrete lanes
 * (nemotron-dispatch.mjs, deepseek-dispatch.mjs) are thin wrappers that supply a
 * laneConfig = { model, label, defaultReasoning } and re-export the pure functions.
 *
 * Each wrapper assembles a grounded advisory prompt and delegates the live call to
 * `ai offload --model <model> --reasoning <depth>`. Output is ADVISORY until YURI
 * verifies it against live code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// PC-1 dogfood: single-source the protected-path truth from the canonical
// lane-kernel surface instead of hardcoding a divergent copy.
import { PROTECTED_SURFACE_PREFIXES } from './lane-kernel.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_PATH = path.join(__dirname, 'ai');
const LARGE_PROMPT_THRESHOLD = 2000;

export const DISCIPLINE_PREAMBLE = `You are an external reasoning lane for YURI-OS (Nemotron-3-Ultra, DEV-ONLY). You operate BY the YURI framework: authority = owner intent > local evidence > yuri-origin contract. Your output is ADVISORY until YURI verifies it against live code. Fluency is not verification.

DISCIPLINE (mandatory, every finding + fix step):
1. SYMBOL GROUNDING — use ONLY symbols in the SYMBOL INVENTORY below or an organ's stated Mechanisms. Anything you'd add: tag [NEW] and name the file. Never reference an unverified symbol — inventing a plausible name is the worst failure and will be checked against live code.
2. NEW vs RESTATED — the briefing's Known-risks are KNOWN. Tag each finding [NEW] (cross-organ inference, in no risk list) or [RESTATED]; drop the restated.
3. TRACE BEFORE ASSERT — before claiming a contradiction/bug/bypass, trace BOTH sides to the exact mechanism; confirm they sit on the SAME control layer and actually interact; else downgrade to OPEN QUESTION.
4. PER-CLAIM TAG — end every finding/fix with: CONFIDENCE: high|medium|low · BASIS: direct-from-briefing | cross-organ-inference | speculative · FALSIFIER: <one observation that would disprove it>.
5. REASONING — reason step by step internally; spend output only on verified conclusions; no padding, no flattery, no restating the prompt.`;

function usage(label) {
  return `Usage: node _SYSTEM/Scripts/${label}-dispatch.mjs --task <string|@file> --files <comma,list> [--handles <string|@file>] [--briefing <@file>] [--dry-run] [--out <file>]`;
}

export function normalizeRelative(candidate) {
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(REPO_ROOT, candidate);
  if (absolute === REPO_ROOT || absolute.startsWith(`${REPO_ROOT}${path.sep}`)) {
    return path.relative(REPO_ROOT, absolute).split(path.sep).join('/');
  }
  return null;
}

export function isProtectedPath(candidate) {
  const rel = normalizeRelative(candidate);
  if (!rel) return false;
  // canonical entries are mixed: trailing-'/' = directory prefix, else exact file.
  return PROTECTED_SURFACE_PREFIXES.some((entry) =>
    entry.endsWith('/') ? rel === entry.slice(0, -1) || rel.startsWith(entry) : rel === entry,
  );
}

function assertReadablePath(candidate, label) {
  if (isProtectedPath(candidate)) {
    throw new Error(`${label} is protected and will not be read: ${candidate}`);
  }
}

function assertWritablePath(candidate, label) {
  if (isProtectedPath(candidate)) {
    throw new Error(`${label} is protected and will not be written: ${candidate}`);
  }
}

function readTextFile(candidate, label) {
  assertReadablePath(candidate, label);
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(REPO_ROOT, candidate);
  return fs.readFileSync(absolute, 'utf8');
}

export function readStringOrAtFile(value, label) {
  if (!value) return '';
  if (!value.startsWith('@')) return value;
  const filePath = value.slice(1);
  if (!filePath) throw new Error(`${label} @file path is empty`);
  return readTextFile(filePath, label);
}

export function parseArgs(argv) {
  const opts = {
    task: '',
    files: '',
    handles: '',
    briefing: '',
    dryRun: false,
    out: '',
    ts: '',
    // These reasoning lanes (Nemotron-3-Ultra 550B; DeepSeek V4 Pro) run on tools-
    // enabled lanes whose underlying transport may set no maxTokens, so they inherit
    // a small default that truncates a reasoning+tool-call run mid-output.
    // `--reasoning max` lifts the runner's depth->maxTokens budget to the top tier
    // (offload.sh forwards --reasoning; --max-output-tokens is NOT forwarded).
    // Owner policy 2026-06-05: every reasoning lane defaults to MAX. Default is
    // supplied per-lane (laneConfig.defaultReasoning) and applied below.
    reasoning: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--task':
        opts.task = argv[++i] || '';
        break;
      case '--files':
        opts.files = argv[++i] || '';
        break;
      case '--handles':
        opts.handles = argv[++i] || '';
        break;
      case '--briefing':
        opts.briefing = argv[++i] || '';
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--out':
        opts.out = argv[++i] || '';
        break;
      case '--reasoning':
        opts.reasoning = argv[++i] || '';
        break;
      case '--ts':
        opts.ts = argv[++i] || '';
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.help) return opts;
  if (!opts.task) throw new Error('--task is required');
  if (!opts.files) throw new Error('--files is required');
  return opts;
}

export function parseFilesList(rawFiles) {
  const files = rawFiles
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (files.length === 0) throw new Error('--files must contain at least one path');
  return files;
}

export function extractNamedExportsFromSource(source) {
  const names = new Set();
  const exportRegex = /^\s*export\s+(?:async\s+function|function|const|class)\s+([A-Za-z0-9_]+)/gm;
  let match;
  while ((match = exportRegex.exec(source)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names).sort();
}

export function buildSymbolInventory(files) {
  return files.map((file) => {
    assertReadablePath(file, 'symbol inventory file');
    const absolute = path.isAbsolute(file) ? file : path.resolve(REPO_ROOT, file);
    if (!fs.existsSync(absolute)) {
      throw new Error(`symbol inventory file not found: ${file}`);
    }
    const stats = fs.statSync(absolute);
    if (!stats.isFile()) {
      throw new Error(`symbol inventory path is not a file: ${file}`);
    }
    const source = fs.readFileSync(absolute, 'utf8');
    const symbols = extractNamedExportsFromSource(source);
    return {
      file,
      symbols,
      line: `${file} :: ${symbols.length ? symbols.join(', ') : '(no named exports)'}`,
    };
  });
}

export function composePrompt({ symbolInventoryLines, handlesText = '', briefingText = '', taskText }) {
  const parts = [
    DISCIPLINE_PREAMBLE,
    '',
    'SYMBOL INVENTORY:',
    symbolInventoryLines.join('\n'),
    '',
    'RELEVANT YURI CANONICAL TRUTH (Track-A handles):',
    handlesText.trim() || '(none provided)',
  ];

  if (briefingText.trim()) {
    parts.push('', 'BRIEFING:', briefingText.trim());
  }

  parts.push('', 'TASK:', taskText.trim());
  return parts.join('\n');
}

function defaultTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function resolveOutPath(out, ts, label = 'reasoning-lane') {
  const outPath = out || path.join('/tmp', `${label}-dispatch-${ts || defaultTimestamp()}.txt`);
  assertWritablePath(outPath, '--out');
  return outPath;
}

export function buildDispatchPlan(composedPrompt, outPath, reasoning = 'max', model) {
  if (!model) throw new Error('buildDispatchPlan requires a model');
  const large = composedPrompt.length > LARGE_PROMPT_THRESHOLD;
  const env = {
    ...process.env,
    LANE_FRESH: '1',
    OFFLOAD_PROMPT_TEXT: composedPrompt,
  };
  if (large) {
    return {
      large,
      promptMode: 'OFFLOAD_PROMPT_TEXT',
      reasoning,
      model,
      env,
      executable: 'bash',
      args: ['-lc', 'exec "$1" offload --model "$2" --reasoning "$3" "$OFFLOAD_PROMPT_TEXT"', 'reasoning-lane-dispatch', AI_PATH, model, reasoning],
      displayCommand: `LANE_FRESH=1 OFFLOAD_PROMPT_TEXT=<composed prompt> _SYSTEM/Scripts/ai offload --model ${model} --reasoning ${reasoning} "$OFFLOAD_PROMPT_TEXT"`,
      promptFile: outPath,
    };
  }
  return {
    large,
    promptMode: 'argv',
    reasoning,
    model,
    env,
    executable: AI_PATH,
    args: ['offload', '--model', model, '--reasoning', reasoning, composedPrompt],
    displayCommand: `LANE_FRESH=1 _SYSTEM/Scripts/ai offload --model ${model} --reasoning ${reasoning} "<composed prompt>"`,
    promptFile: outPath,
  };
}

export function extractFalsifiers(responseText) {
  const lines = String(responseText || '').split(/\r?\n/);
  const findings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!/FALSIFIER:/i.test(line)) continue;

    let context = '';
    for (let j = i - 1; j >= 0; j -= 1) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (/^(CONFIDENCE|BASIS|FALSIFIER):/i.test(candidate)) continue;
      context = candidate.replace(/^[-*\d.)\s]+/, '').trim();
      break;
    }

    findings.push({
      context,
      line,
      falsifier: line.replace(/^.*?FALSIFIER:\s*/i, '').trim(),
    });
  }
  return findings;
}

export function formatVerifyChecklist(falsifiers) {
  if (!falsifiers.length) {
    return 'VERIFY CHECKLIST:\n(no FALSIFIER lines found)';
  }
  const rows = falsifiers.map((item, index) => {
    const context = item.context ? `${item.context} :: ` : '';
    return `${index + 1}. ${context}${item.line}`;
  });
  return ['VERIFY CHECKLIST:', ...rows].join('\n');
}

function writePromptFile(outPath, composedPrompt) {
  const parent = path.dirname(outPath);
  if (!fs.existsSync(parent)) {
    throw new Error(`--out parent directory does not exist: ${parent}`);
  }
  fs.writeFileSync(outPath, composedPrompt, 'utf8');
}

export function assembleDispatch(opts, laneConfig) {
  const { model, label, defaultReasoning = 'max' } = laneConfig;
  const taskText = readStringOrAtFile(opts.task, '--task').trim();
  if (!taskText) throw new Error('--task resolved to empty text');

  const files = parseFilesList(opts.files);
  const inventory = buildSymbolInventory(files);
  const handlesText = readStringOrAtFile(opts.handles, '--handles');

  let briefingText = '';
  if (opts.briefing) {
    if (!opts.briefing.startsWith('@')) {
      throw new Error('--briefing must be an @file path');
    }
    briefingText = readStringOrAtFile(opts.briefing, '--briefing');
  }

  const composedPrompt = composePrompt({
    symbolInventoryLines: inventory.map((entry) => entry.line),
    handlesText,
    briefingText,
    taskText,
  });
  const reasoning = opts.reasoning || defaultReasoning;
  const outPath = resolveOutPath(opts.out, opts.ts, label);
  writePromptFile(outPath, composedPrompt);
  return {
    taskText,
    inventory,
    handlesText,
    briefingText,
    composedPrompt,
    outPath,
    dispatchPlan: buildDispatchPlan(composedPrompt, outPath, reasoning, model),
  };
}

export function printDryRun(assembled, laneConfig) {
  const upper = laneConfig.label.toUpperCase();
  process.stdout.write([
    `${upper} DISPATCH DRY RUN`,
    'ADVISORY ONLY: no model call was made.',
    `PROMPT_FILE: ${assembled.outPath}`,
    '',
    assembled.composedPrompt,
    '',
    'WOULD DISPATCH:',
    assembled.dispatchPlan.displayCommand,
    '',
  ].join('\n'));
}

function titleCase(label) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dispatchLive(assembled, laneConfig) {
  const upper = laneConfig.label.toUpperCase();
  const title = titleCase(laneConfig.label);
  const result = spawnSync(assembled.dispatchPlan.executable, assembled.dispatchPlan.args, {
    cwd: REPO_ROOT,
    env: assembled.dispatchPlan.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (stderr) process.stderr.write(stderr);
  if (result.status !== 0) {
    const status = result.status === null ? 1 : result.status;
    throw new Error(`${title} dispatch failed with exit ${status}`);
  }

  const falsifiers = extractFalsifiers(stdout);
  const checklist = formatVerifyChecklist(falsifiers);
  const sidecarPath = `${assembled.outPath}.falsifiers.txt`;
  assertWritablePath(sidecarPath, 'falsifier sidecar');
  fs.writeFileSync(sidecarPath, `${checklist}\n`, 'utf8');

  process.stdout.write([
    `${upper} OUTPUT - ADVISORY ONLY`,
    'Every concrete claim remains untrusted until checked against live local evidence.',
    '',
    stdout.trimEnd(),
    '',
    checklist,
    `FALSIFIER_SIDECAR: ${sidecarPath}`,
    '',
  ].join('\n'));
}

export function runCli(laneConfig, argv = process.argv.slice(2)) {
  if (!laneConfig || !laneConfig.model || !laneConfig.label) {
    throw new Error('runCli requires laneConfig { model, label, defaultReasoning }');
  }
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      process.stdout.write(`${usage(laneConfig.label)}\n`);
      return 0;
    }
    const assembled = assembleDispatch(opts, laneConfig);
    if (opts.dryRun) {
      printDryRun(assembled, laneConfig);
      return 0;
    }
    dispatchLive(assembled, laneConfig);
    return 0;
  } catch (err) {
    process.stderr.write(`${laneConfig.label}-dispatch: ${err.message}\n${usage(laneConfig.label)}\n`);
    return 1;
  }
}
