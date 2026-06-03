#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const generatedGraphArtifacts = [
  {
    relative: 'graphify-out/graph.json',
    reason: 'root graphify GraphRAG export',
  },
  {
    relative: 'graphify-out/v2_graph.json',
    reason: 'tracked graphify export retained on the active generated-artifact surface',
  },
  {
    relative: 'graphify-out/v3_graph.json',
    reason: 'tracked graphify export retained on the active generated-artifact surface',
  },
  {
    relative: 'graphify-out/ruflo_core_graph.json',
    reason: 'tracked graphify export retained on the active generated-artifact surface',
  },
];

const generatedArtifactRoots = ['graphify-out/'];
const protectedRoots = ['backend/data/', '.claude/state/', '.claude/history/', '.env'];
// Graphify can emit package-local src/tools paths for nested corpora; keep this
// guardrail to repo-root paths that are unambiguous in this repository.
const activeSourceRoots = ['_SYSTEM/backend/src/', '_SYSTEM/Scripts/'];
const historicalPathAllowlist = new Map([
  ['04_ARCHIVE/', 'historical archive paths are not active Yuri OS source truth'],
  ['_SYSTEM/yuri-history-archive/', 'historical session archive paths are not active Yuri OS source truth'],
  ['_SYSTEM/session-outputs/', 'historical session output paths are not active Yuri OS source truth'],
]);

const pathPattern = /\b(?:backend\/src|src|Scripts|tools|04_ARCHIVE|_SYSTEM\/yuri-history-archive|_SYSTEM\/session-outputs)\/[A-Za-z0-9._~+@/()-]+\.(?:cjs|css|html|js|jsx|json|md|mjs|py|sh|ts|tsx|txt)\b/g;

for (const artifact of generatedGraphArtifacts) {
  assert.equal(typeof artifact.reason, 'string', `${artifact.relative} must document why it is scanned`);
  assert.ok(artifact.reason.trim().length > 0, `${artifact.relative} must document why it is scanned`);
  assert.ok(isGeneratedArtifact(artifact.relative), `${artifact.relative} must be a generated artifact path`);
  assert.ok(!isProtectedPath(artifact.relative), `${artifact.relative} must not be protected`);
}

for (const [allowPath, reason] of historicalPathAllowlist) {
  assert.equal(typeof reason, 'string', `${allowPath} allowlist entry must have a reason`);
  assert.ok(reason.trim().length > 0, `${allowPath} allowlist entry must have a reason`);
}

const violations = [];

for (const artifact of generatedGraphArtifacts) {
  const absolute = path.join(REPO_ROOT, artifact.relative);
  if (!fs.existsSync(absolute)) continue;
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  scanGeneratedValue(parsed, artifact.relative, '$');
}

if (violations.length > 0) {
  const details = violations
    .toSorted(compareViolationPriority)
    .slice(0, 30)
    .map((violation) => `${violation.artifact}:${violation.pointer} -> ${violation.sourcePath}`)
    .join('\n');
  const suffix = violations.length > 30 ? `\n... ${violations.length - 30} more stale references` : '';
  throw new Error(`Generated graph artifacts reference deleted active source files:\n${details}${suffix}`);
}

process.stdout.write('generated-artifact-hygiene: pass\n');

function scanGeneratedValue(value, artifact, pointer) {
  if (typeof value === 'string') {
    scanGeneratedString(value, artifact, pointer);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanGeneratedValue(entry, artifact, `${pointer}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      scanGeneratedValue(entry, artifact, `${pointer}.${key}`);
    }
  }
}

function scanGeneratedString(value, artifact, pointer) {
  for (const match of value.matchAll(pathPattern)) {
    const sourcePath = normalizeRelativePath(match[0]);
    if (isProtectedPath(sourcePath)) continue;
    if (isHistoricalPath(sourcePath)) continue;
    if (!isActiveSourcePath(sourcePath)) continue;

    const absolute = path.join(REPO_ROOT, sourcePath);
    if (!fs.existsSync(absolute)) {
      violations.push({ artifact, pointer, sourcePath });
    }
  }
}

function isGeneratedArtifact(relative) {
  return generatedArtifactRoots.some((root) => relative.startsWith(root));
}

function isProtectedPath(relative) {
  return protectedRoots.some((root) => relative === root || relative.startsWith(root));
}

function isHistoricalPath(relative) {
  return [...historicalPathAllowlist.keys()].some((root) => relative.startsWith(root));
}

function isActiveSourcePath(relative) {
  return activeSourceRoots.some((root) => relative.startsWith(root));
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function compareViolationPriority(left, right) {
  return violationPriority(right) - violationPriority(left);
}

function violationPriority(violation) {
  if (violation.sourcePath.startsWith('_SYSTEM/backend/src/')) return 1;
  return 0;
}
