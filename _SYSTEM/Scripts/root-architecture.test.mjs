#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const ABSOLUTE_REPO_ROOT_LITERAL = ['', 'Users', 'marcelspatz', 'YURI-OS-MUSUBI'].join('/');

const activeScanRoots = [
  '_SYSTEM/Scripts',
  '_SYSTEM/backend/src',
  '_SYSTEM/git-hooks',
  '_SYSTEM/tools/chrome-design-assistant',
  '.codex/adapters',
  '.claude/mcp-servers',
];

const activeRootFiles = [
  'package.json',
  'ecosystem.config.js',
  '.codex/config.toml',
  '.claude/CLAUDE.md',
  '.claude/launch.json',
];

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
]);

const textExtensions = new Set([
  '.mjs',
  '.js',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.sh',
  '.zsh',
  '.bash',
  '.toml',
]);

const wrongRepoRootPatterns = [
  {
    name: 'hardcoded absolute repo root',
    re: new RegExp(escapeRegExp(ABSOLUTE_REPO_ROOT_LITERAL)),
  },
  {
    name: 'hardcoded shell cd to repo root',
    re: new RegExp(`\\bcd\\s+["']?${escapeRegExp(ABSOLUTE_REPO_ROOT_LITERAL)}`),
  },
  {
    name: 'repo root set to _SYSTEM',
    re: /\b(?:const|let|var)\s+(?:REPO_ROOT|repoRoot|PROJECT_ROOT|ROOT)\s*=\s*path\.resolve\((?:path\.dirname\(fileURLToPath\(import\.meta\.url\)\)|__dirname|SCRIPT_DIR),\s*['"`]\.\.['"`]\)/,
  },
  {
    name: 'repo root set to process.cwd',
    re: /\b(?:const|let|var)\s+(?:REPO_ROOT|repoRoot|PROJECT_ROOT|ROOT)\s*=\s*process\.cwd\(\)/,
  },
  {
    name: 'legacy root Scripts path',
    re: /path\.join\(\s*(?:REPO_ROOT|repoRoot|PROJECT_ROOT|ROOT|root)\s*,\s*['"`]Scripts['"`]/,
  },
  {
    name: 'root backend path without _SYSTEM',
    re: /path\.join\(\s*(?:REPO_ROOT|repoRoot|PROJECT_ROOT|ROOT|root)\s*,\s*['"`]backend['"`]/,
  },
  {
    name: 'chrome design assistant repo root too shallow',
    re: /\bconst\s+repoRoot\s*=\s*path\.resolve\(extensionRoot,\s*['"`]\.\.\/\.\.['"`]\)/,
  },
];

const allowedMatches = new Map([
  [
    '_SYSTEM/Scripts/root-architecture.test.mjs',
    new Set(['hardcoded absolute repo root']),
  ],
  [
    '_SYSTEM/Scripts/backend-db-check.mjs',
    new Set(['root backend path without _SYSTEM']),
  ],
  [
    '_SYSTEM/Scripts/backend-db-recovery.mjs',
    new Set(['root backend path without _SYSTEM']),
  ],
  [
    '_SYSTEM/Scripts/embed-backfill.mjs',
    new Set(['root backend path without _SYSTEM']),
  ],
]);

const files = [
  ...activeRootFiles.map((relPath) => path.join(REPO_ROOT, relPath)),
  ...activeScanRoots.flatMap((relPath) => listFiles(path.join(REPO_ROOT, relPath))),
].filter((filePath) => fs.existsSync(filePath) && isTextFile(filePath));

const violations = [];

for (const filePath of files) {
  const relPath = toRepoRelative(filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  for (const pattern of wrongRepoRootPatterns) {
    if (!pattern.re.test(source)) continue;
    if (allowedMatches.get(relPath)?.has(pattern.name)) continue;
    violations.push(`${relPath}: ${pattern.name}`);
  }
}

assert.deepEqual(violations, [], `root architecture violations:\n${violations.join('\n')}`);
assert.equal(path.basename(REPO_ROOT), 'YURI-OS-MUSUBI', 'test must resolve the canonical repo root');

process.stdout.write(`root-architecture: pass files=${files.length}\n`);

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];

  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      result.push(...listFiles(filePath));
      continue;
    }
    if (entry.isFile()) result.push(filePath);
  }
  return result;
}

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath)) || path.basename(filePath) === 'ecosystem.config.js';
}

function toRepoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
