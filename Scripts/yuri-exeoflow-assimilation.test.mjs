#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FORBIDDEN = /\b(?:exeoflow|exeo-flow|exeo flow)\b/i;
const SCANNED_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
]);

const scanRoots = [
  'backend/src',
  'src',
  'Scripts',
  'docs',
  'package.json',
  'README.md',
  'NUDIMMUD_AUDIT_README.md',
];

const skippedPathReasons = new Map([
  ['Scripts/yuri-exeoflow-assimilation.test.mjs', 'guardrail implementation must name retired terms to detect regressions'],
  ['backend/data', 'protected live database surface'],
  ['.claude/state', 'protected agent state surface'],
  ['.claude/history', 'protected agent history surface'],
  ['node_modules', 'dependency tree'],
  ['backend/node_modules', 'backend dependency tree'],
  ['NEURAL-NETWORK/GitNexus/gitnexus/node_modules', 'nested dependency tree'],
  ['.git', 'git internals'],
  ['07_ARCHIVE', 'historical archive, not active Yuri product surface'],
  ['_SYSTEM/yuri-history-archive', 'historical session archive, not active Yuri product surface'],
  ['_SYSTEM/session-outputs', 'historical session outputs, not active Yuri product surface'],
  ['03_RESOURCES/References/design-packs/exeoflow-yuri-sitrep-baseline', 'historical design-source pack retained as reference material'],
]);

const allowedLineReasons = new Map([
  ['package.json', [
    {
      pattern: /Scripts\/yuri-exeoflow-assimilation\.test\.mjs/,
      reason: 'package scripts must invoke the requested guardrail filename',
    },
  ]],
]);

for (const [skipPath, reason] of skippedPathReasons) {
  assert.equal(typeof reason, 'string', `${skipPath} allowlist entry must have a reason`);
  assert.ok(reason.trim().length > 0, `${skipPath} allowlist entry must have a reason`);
}

for (const [filePath, entries] of allowedLineReasons) {
  assert.ok(Array.isArray(entries), `${filePath} line allowlist must be an array`);
  for (const entry of entries) {
    assert.ok(entry.pattern instanceof RegExp, `${filePath} line allowlist entry must have a pattern`);
    assert.equal(typeof entry.reason, 'string', `${filePath} line allowlist entry must have a reason`);
    assert.ok(entry.reason.trim().length > 0, `${filePath} line allowlist entry must have a reason`);
  }
}

const violations = [];

for (const root of scanRoots) {
  const absolute = path.join(REPO_ROOT, root);
  if (!fs.existsSync(absolute)) continue;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) scanDirectory(absolute);
  else scanFile(absolute);
}

if (violations.length > 0) {
  const details = violations
    .map((violation) => `${violation.relative}:${violation.line}: ${violation.excerpt}`)
    .join('\n');
  throw new Error(`Active ExeoFlow references must be assimilated into Yuri OS:\n${details}`);
}

process.stdout.write('yuri-exeoflow-assimilation: pass\n');

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (shouldSkip(absolute)) continue;
    if (entry.isDirectory()) {
      scanDirectory(absolute);
      continue;
    }
    if (entry.isFile()) scanFile(absolute);
  }
}

function scanFile(absolute) {
  if (shouldSkip(absolute)) return;
  if (!SCANNED_EXTENSIONS.has(path.extname(absolute))) return;

  const relative = toRelative(absolute);
  const text = fs.readFileSync(absolute, 'utf8');
  text.split(/\r?\n/).forEach((line, index) => {
    if (!FORBIDDEN.test(line)) return;
    if (isAllowedLine(relative, line)) return;
    violations.push({
      relative,
      line: index + 1,
      excerpt: line.trim().slice(0, 180),
    });
  });
}

function isAllowedLine(relative, line) {
  const entries = allowedLineReasons.get(relative) || [];
  return entries.some((entry) => entry.pattern.test(line));
}

function shouldSkip(absolute) {
  const relative = toRelative(absolute);
  for (const skipPath of skippedPathReasons.keys()) {
    if (relative === skipPath || relative.startsWith(`${skipPath}/`)) return true;
  }
  return false;
}

function toRelative(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join('/');
}
