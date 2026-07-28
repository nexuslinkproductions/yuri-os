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

const gitNexusAdapterFiles = [
  'AGENTS.md',
  'CLAUDE.md',
];

const canonicalGitNexusSkillPaths = [
  'skills/gitnexus-exploring/SKILL.md',
  'skills/gitnexus-impact-analysis/SKILL.md',
  'skills/gitnexus-debugging/SKILL.md',
  'skills/gitnexus-refactoring/SKILL.md',
  'skills/gitnexus-guide/SKILL.md',
  'skills/gitnexus-cli/SKILL.md',
];

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  // .claude holds ephemeral runtime STATE (state/history/file-history/projects) whose JSON legitimately
  // carries absolute paths (e.g. a session-checkpoint's `cwd`) — it is runtime DATA, not architecture. A
  // stray nested .claude/ (e.g. _SYSTEM/Scripts/.claude/state/ written cwd-relative by a tool BEFORE the
  // session-checkpoint hook was anchored to CLAUDE_PROJECT_DIR, 2026-06-14) must never block the repo-wide
  // arch gate over and over. The .claude targets that ARE scanned (.claude/CLAUDE.md, .claude/launch.json,
  // .claude/mcp-servers) are listed explicitly in activeRootFiles/activeScanRoots and resolve directly, so
  // this recursion-skip does not lose any real coverage.
  '.claude',
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

// Intentional, narrowly-scoped exceptions — NOT unfixed violations. Each is a TEST fixture/guard
// that deliberately pins the canonical production path (recovery target, APFS volume binding,
// launchd cwd) to assert behavior against the real install; deriving it dynamically would make the
// assertion tautological and weaken the test. Production-code path bugs are fixed at SOURCE, never
// whitelisted here. Stale entries — root-architecture.test.mjs (its own literal is array-joined so
// the scanner never matches it), backend-db-check.mjs, backend-data-recovery.mjs, embed-backfill.mjs
// — were removed 2026-07-21 after confirming their patterns no longer match (source already clean).
const allowedMatches = new Map([
  [
    '_SYSTEM/Scripts/backend-data-recovery.test.mjs',
    new Set(['hardcoded absolute repo root']),
  ],
  [
    '_SYSTEM/Scripts/backend-storage-guard.test.mjs',
    new Set(['hardcoded absolute repo root', 'root backend path without _SYSTEM']),
  ],
  [
    '_SYSTEM/Scripts/backend-storage-guard-legacy-v1-fixture.test.mjs',
    new Set(['hardcoded absolute repo root']),
  ],
  [
    '_SYSTEM/Scripts/backend-volume-apfs.test.mjs',
    new Set(['root backend path without _SYSTEM']),
  ],
  [
    '_SYSTEM/Scripts/yuri-session-launchd.test.mjs',
    new Set(['hardcoded absolute repo root']),
  ],
  [
    '_SYSTEM/Scripts/backend-db-readiness-recovery-metadata.test.mjs',
    new Set(['root backend path without _SYSTEM']),
  ],
  // The two entries below are PRODUCTION scripts, not test fixtures — every other entry in this map
  // is a *.test.mjs. Flagged explicitly so the difference is not absorbed silently.
  //
  // Both export CANONICAL_MAIN_ABS = the absolute canonical main-repo path. That constant IS the
  // fail-closed discriminator between the main checkout and an October worktree (used at
  // yuri-worktree-bootstrap.mjs:104,299,533,579 and yuri-prelaunch-attest.mjs:574,825), so the
  // hardcode is load-bearing rather than lazy — the gate cannot ask "am I canonical?" without
  // knowing where canonical is. Both already fall back to `|| root === path.resolve(REPO_ROOT)`.
  //
  // BETTER FIX, deliberately NOT taken here: derive it from
  // `git rev-parse --path-format=absolute --git-common-dir` with the trailing `/.git` stripped —
  // the technique .codex/config.toml's PreToolUse hook already uses. Not done as part of arming the
  // pre-commit hook (2026-07-28): rewriting the root-detection logic of a fail-closed launch gate,
  // mid-session, with several worktree-backed lanes live, risks HOLD-ing every October terminal at
  // exit 78. Unblocking a commit hook does not justify that blast radius. Tracked for the owner.
  [
    '_SYSTEM/Scripts/yuri-prelaunch-attest.mjs',
    new Set(['hardcoded absolute repo root']),
  ],
  [
    '_SYSTEM/Scripts/yuri-worktree-bootstrap.mjs',
    new Set(['hardcoded absolute repo root']),
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

const gitNexusAdapterViolations = validateGitNexusAdapterSkillLinks();
assert.deepEqual(
  gitNexusAdapterViolations,
  [],
  `GitNexus adapter skill-link drift:\n${gitNexusAdapterViolations.join('\n')}`,
);

process.stdout.write(`root-architecture: pass files=${files.length}\n`);

function validateGitNexusAdapterSkillLinks() {
  const result = [];
  for (const relPath of gitNexusAdapterFiles) {
    const fullPath = path.join(REPO_ROOT, relPath);
    const source = fs.readFileSync(fullPath, 'utf8');
    const block = source.match(/<!-- gitnexus:start -->([\s\S]*?)<!-- gitnexus:end -->/)?.[1] || '';
    if (!block) {
      result.push(`${relPath}: missing GitNexus block`);
      continue;
    }
    if (block.includes('.claude/skills/gitnexus')) {
      result.push(`${relPath}: GitNexus block points at provider-local .claude skills`);
    }
    for (const skillPath of canonicalGitNexusSkillPaths) {
      if (!fs.existsSync(path.join(REPO_ROOT, skillPath))) {
        result.push(`${skillPath}: canonical root GitNexus skill file missing`);
      }
      if (!block.includes(`\`${skillPath}\``)) {
        result.push(`${relPath}: missing canonical root skill link ${skillPath}`);
      }
    }
  }
  return result;
}

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
