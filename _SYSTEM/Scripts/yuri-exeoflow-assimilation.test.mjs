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
  '00_COMMAND-CENTER/MOCs',
  '02_AREAS/profile-marcel-en.md',
  '06_KNOWLEDGE-BASE/05_OPERATIONAL/partner_memory.md',
  '06_NETWORK-SYNC/MOC-Network.md',
  'RESEARCH/DESIGN-RADAR/README.md',
  '_SYSTEM/ADVERSARIAL_STABILITY_AUDIT_2026-04-22_v2.md',
  '_SYSTEM/EVONEXUS_INTEGRATION_MAP.md',
  '_SYSTEM/EVONEXUS_PROTOCOLS.md',
  '_SYSTEM/SELF-IMPROVEMENT/00_VESSEL/YURI_FLOW_FRONTEND_HANDOFF.md',
  '_SYSTEM/SELF-IMPROVEMENT/03_GAZE/capability-roadmap.md',
  '_SYSTEM/SELF-IMPROVEMENT/03_GAZE/skill-progression.md',
  '_SYSTEM/SELF-IMPROVEMENT/03_GAZE/time-allocation.md',
  'design-memory.json',
  'identity.md',
  'memory-core.md',
  'nisaba.md',
  'package.json',
  'README.md',
  'YURI_AUDIT_README.md',
];

const skippedPathReasons = new Map([
  ['_SYSTEM/Scripts/yuri-exeoflow-assimilation.test.mjs', 'guardrail implementation must name retired terms to detect regressions'],
  ['_SYSTEM/Scripts/generated-artifact-hygiene.test.mjs', 'generated artifact guardrail must prioritize retired source-path regressions'],
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
  ['graphify-out', 'generated graph export; regenerate rather than hand-edit stale nodes'],
]);

const allowedLineReasons = new Map([
  ['package.json', [
    {
      pattern: /Scripts\/yuri-exeoflow-assimilation\.test\.mjs/,
      reason: 'package scripts must invoke the requested guardrail filename',
    },
  ]],
  ['_SYSTEM/Scripts/backend-release-gate.mjs', [
    {
      pattern: /Scripts\/yuri-exeoflow-assimilation\.test\.mjs/,
      reason: 'release gate must execute the requested assimilation guardrail filename while redacting release output',
    },
    {
      pattern: /yuri-exeoflow-assimilation\.test\.mjs/,
      reason: 'release gate display redaction must identify the requested guardrail filename',
    },
  ]],
  ['_SYSTEM/Scripts/backend-release-gate.test.mjs', [
    {
      pattern: /yuri-exeoflow-assimilation.*test.*mjs/,
      reason: 'release gate test must prove the requested assimilation guardrail filename is wired',
    },
  ]],
  ['docs/GENERATED_ARTIFACT_HYGIENE.md', [
    {
      pattern: /Scripts\/yuri-exeoflow-assimilation\.test\.mjs/,
      reason: 'generated artifact lifecycle doc must list the retired-term guardrail command required before commit',
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

process.stdout.write('yuri-assimilation-guardrail: pass\n');

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
