#!/usr/bin/env node
// Pure, fail-closed command classifier for operations capable of removing or
// detaching the canonical YURI repository. This is a shared hook layer, not an
// OS sandbox: the root-owned/password-gated enforcement layer remains separate.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenizeCommand } from '../_lib/lane-command-gate.mjs';

const POLICY_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_REPO_ROOT = path.resolve(POLICY_DIR, '../../..');
const CANONICAL_REPO_ROOT = path.resolve(
  process.env.YURI_REPO_ROOT || path.join(os.homedir(), 'YURI-OS-MUSUBI'),
);

const GIT_VALUE_OPTIONS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix',
]);

const INTERPRETER_NAMES = new Set([
  'node', 'bun', 'deno', 'python', 'python2', 'python3', 'ruby', 'perl', 'php',
]);

const RSYNC_VALUE_OPTIONS = new Set([
  '-e', '-f', '-B',
  '--address', '--backup-dir', '--bwlimit', '--checksum-seed', '--chmod',
  '--compare-dest', '--compress-level', '--contimeout', '--copy-dest',
  '--exclude', '--exclude-from', '--files-from', '--include', '--include-from',
  '--link-dest', '--max-delete', '--max-size', '--min-size', '--modify-window',
  '--out-format', '--partial-dir', '--password-file', '--port', '--protocol',
  '--read-batch', '--rsync-path', '--sockopts', '--suffix', '--timeout',
  '--only-write-batch', '--write-batch',
]);

const DYNAMIC_DELETE_API_RE = /(?:\b(?:rmSync|rmdirSync|unlinkSync|renameSync)\s*\(|\b(?:fs|fsp|promises)\s*\.\s*(?:rm|rmdir|unlink|rename)\s*\(|\bshutil\s*\.\s*rmtree\s*\(|\bos\s*\.\s*(?:remove|removedirs|rmdir|unlink|rename|replace)\s*\(|\bPath\s*\([^)]*\)\s*\.\s*(?:unlink|rmdir|rename|replace)\s*\(|\bFileUtils\s*\.\s*(?:rm_rf|remove_dir|mv)\s*\(|\bDeno\s*\.\s*(?:remove|rename)\s*\()/u;

function basename(token) {
  return String(token || '').split('/').pop().toLowerCase();
}

function commandRoots(opts = {}) {
  if (opts.repoRoot) return [path.resolve(opts.repoRoot)];
  return [...new Set([CANONICAL_REPO_ROOT, MODULE_REPO_ROOT].map((p) => path.resolve(p)))];
}

function expandCommandVariables(command, cwd) {
  return String(command || '')
    .replace(/\$\(\s*pwd\s*\)|`\s*pwd\s*`/gu, cwd)
    .replace(/\$\{PWD\}|\$PWD/gu, cwd)
    .replace(/\$\{HOME\}|\$HOME/gu, os.homedir());
}

function commandSegments(command) {
  const withoutRedirections = String(command || '')
    .replace(/(^|\s)\d*>\s*&\s*\d+/gu, ' ')
    .replace(/(^|\s)(?:\d*>>?|\d*<<?|&>>?)\s*(?:"[^"]*"|'[^']*'|[^\s;|&]+)/gu, ' ');
  return withoutRedirections
    .replace(/\\\n/gu, ' ')
    .replace(/[`]/gu, ' ')
    .replace(/\$\(/gu, ' ')
    .replace(/[(){}]/gu, ' ')
    .split(/&&|\|\||[;|&\n]+/gu)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolveCandidate(token, cwd) {
  let candidate = String(token || '').replace(/^[,;]+|[,;]+$/gu, '');
  if (!candidate || candidate === '--') return null;
  if (candidate === '~') candidate = os.homedir();
  else if (candidate.startsWith('~/')) candidate = path.join(os.homedir(), candidate.slice(2));
  if (candidate.includes('$')) return { unknown: true, raw: candidate };
  if (/[*?\[\]]/u.test(candidate)) return { glob: true, raw: candidate };

  const lexical = path.resolve(cwd, candidate);
  let real = lexical;
  try { real = fs.realpathSync.native(lexical); } catch { /* lexical fallback for absent targets */ }
  return { lexical, real, raw: candidate };
}

function criticalPathReason(token, cwd, roots) {
  const candidate = resolveCandidate(token, cwd);
  if (!candidate) return null;
  if (candidate.unknown) return `unresolved destructive target ${candidate.raw}`;

  if (candidate.glob) {
    if (['*', '.*', './*', './.*'].includes(candidate.raw) && roots.some((root) => path.resolve(cwd) === root)) {
      return 'root-wide glob target';
    }
    return null;
  }

  for (const root of roots) {
    const gitPath = path.join(root, '.git');
    for (const resolved of [candidate.lexical, candidate.real]) {
      if (resolved === root) return `canonical repository root ${root}`;
      if (resolved === gitPath || resolved.startsWith(`${gitPath}${path.sep}`)) return `Git control path ${gitPath}`;
      if (root.startsWith(`${resolved}${path.sep}`)) return `ancestor of canonical repository ${resolved}`;
    }
  }
  return null;
}

function pathsOverlap(left, right) {
  return left === right
    || left.startsWith(`${right}${path.sep}`)
    || right.startsWith(`${left}${path.sep}`);
}

function protectedReceiverReason(token, cwd, protectedPaths = []) {
  const candidate = resolveCandidate(token, cwd);
  if (!candidate || candidate.unknown || candidate.glob) return 'ambiguous rsync receiver';
  const candidatePaths = [candidate.lexical, candidate.real];

  for (const rawTarget of protectedPaths) {
    const lexicalTarget = path.resolve(String(rawTarget));
    let realTarget = lexicalTarget;
    try { realTarget = fs.realpathSync.native(lexicalTarget); } catch { /* lexical fallback */ }
    if (candidatePaths.some((candidatePath) =>
      [lexicalTarget, realTarget].some((targetPath) => pathsOverlap(candidatePath, targetPath)))) {
      return `protected rsync receiver ${lexicalTarget}`;
    }
  }
  return null;
}

function rsyncPositionals(tokens, start) {
  const positionals = [];
  let optionsEnded = false;
  for (let i = start + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!optionsEnded && token === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && token.startsWith('--')) {
      const option = token.split('=')[0];
      if (!token.includes('=') && RSYNC_VALUE_OPTIONS.has(option)) i += 1;
      continue;
    }
    if (!optionsEnded && token.startsWith('-') && token !== '-') {
      const option = token.slice(0, 2);
      if (token.length === 2 && RSYNC_VALUE_OPTIONS.has(option)) i += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

function rsyncDestructiveReason(command, cwd, roots, protectedPaths = []) {
  for (const segment of commandSegments(command)) {
    const tokens = tokenizeCommand(segment);
    for (let i = 0; i < tokens.length; i += 1) {
      if (basename(tokens[i]) !== 'rsync') continue;
      const tail = tokens.slice(i + 1);
      if (tail.some((token) => token === '--remove-source-files' || token === '--remove-sent-files')) {
        return 'rsync source-removal mode is blocked by repository integrity policy';
      }

      const positionals = rsyncPositionals(tokens, i);
      if (positionals.length < 2) {
        if (tail.some((token) => token === '--help' || token === '--version')) continue;
        return 'ambiguous rsync receiver is blocked by repository integrity policy';
      }

      const receiver = positionals.at(-1);
      const criticalReason = criticalPathReason(receiver, cwd, roots);
      if (criticalReason) return `rsync to ${criticalReason} is blocked`;
      const protectedReason = protectedReceiverReason(receiver, cwd, protectedPaths);
      if (protectedReason) return `${protectedReason} is blocked`;
    }
  }
  return null;
}

function gitDestructiveReason(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (basename(tokens[i]) !== 'git') continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith('-')) {
      const option = tokens[j].split('=')[0];
      if (GIT_VALUE_OPTIONS.has(option) && !tokens[j].includes('=')) j += 2;
      else j += 1;
    }
    const subcommand = (tokens[j] || '').toLowerCase();
    const tail = tokens.slice(j + 1).map((token) => token.toLowerCase());
    if (subcommand === 'reset' && tail.includes('--hard')) return 'git reset --hard is blocked';
    const cleanDryRun = tail.some((token) =>
      token === '--dry-run' || (/^-[^-]/u.test(token) && token.slice(1).includes('n')),
    );
    if (subcommand === 'clean' && !cleanDryRun) {
      return 'git clean without dry-run is blocked';
    }
    if (subcommand === 'worktree' && tail[0] === 'remove') return 'git worktree remove is blocked';
    if (subcommand === 'checkout' && tail.includes('--')) return 'git checkout path restore is blocked';
    if (subcommand === 'restore' && tail.some((token) => token === '--source' || token.startsWith('--source='))) {
      return 'git restore from source is blocked';
    }
  }
  return null;
}

function pathOperationReason(tokens, cwd, roots) {
  const operations = new Set(['mv', 'rmdir', 'unlink', 'trash']);
  for (let i = 0; i < tokens.length; i += 1) {
    const operation = basename(tokens[i]);
    if (!operations.has(operation)) continue;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token.startsWith('-')) continue;
      const reason = criticalPathReason(token, cwd, roots);
      if (reason) return `${operation} of ${reason} is blocked`;
    }
  }
  return null;
}

/**
 * Return null for an allowed command, or a deterministic block record.
 * No override token is accepted here: an agent-controlled environment is not
 * authentication. Destructive overrides belong to the privileged helper.
 */
export function repoIntegrityCommandHit(command, opts = {}) {
  const cwd = path.resolve(opts.cwd || MODULE_REPO_ROOT);
  const roots = commandRoots(opts);
  const expanded = expandCommandVariables(command, cwd);
  const tokens = tokenizeCommand(expanded);
  const normalized = tokens.join(' ');

  if (/\bfind\b[^;&|\n]*\s-delete(?:\s|$)/u.test(normalized)) {
    return { reason: 'find -delete is blocked by repository integrity policy' };
  }
  if (/\brsync\b[^;&|\n]*(?:--delete(?:-[a-z-]+)?)(?:\s|$)/u.test(normalized)) {
    return { reason: 'rsync destructive delete mode is blocked by repository integrity policy' };
  }

  const rsyncReason = rsyncDestructiveReason(expanded, cwd, roots, opts.protectedPaths);
  if (rsyncReason) return { reason: rsyncReason };

  const invokesInterpreter = tokens.some((token) => INTERPRETER_NAMES.has(basename(token)));
  if (invokesInterpreter && DYNAMIC_DELETE_API_RE.test(expanded)) {
    return { reason: 'dynamic interpreter filesystem deletion is blocked by repository integrity policy' };
  }

  const gitReason = gitDestructiveReason(tokens);
  if (gitReason) return { reason: gitReason };

  const pathReason = pathOperationReason(tokens, cwd, roots);
  if (pathReason) return { reason: pathReason };

  return null;
}

export const REPO_INTEGRITY_ROOTS = Object.freeze({
  canonical: CANONICAL_REPO_ROOT,
  module: MODULE_REPO_ROOT,
});
