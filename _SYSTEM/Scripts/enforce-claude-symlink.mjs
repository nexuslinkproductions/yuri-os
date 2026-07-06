#!/usr/bin/env node
// @capability: claude-symlink-enforce
// @serves: ~/.claude symlink | claude code home dir | symlink drift | repo detach | claude upgrade breaks config | mkdir ~/.claude
// @does: Idempotent fail-loud healer that keeps `~/.claude` a symlink pointing at this repo's `.claude/` dir; never deletes a real directory/file in its place.
// @use: Reach for this before building any "keep a dotfile symlink pointed at the repo" mechanism. Run standalone, via SessionStart hook, or a launchd beat.
// @exports: resolveRepoRoot, classify, heal, main
/**
 * enforce-claude-symlink.mjs — keep `~/.claude` symlinked to `<repoRoot>/.claude`.
 *
 * WHY: `~/.claude` is intentionally a symlink into this repo (owner directive, 2026-05-17)
 * so Claude Code's machine-wide config (CLAUDE.md, memory, skills, hooks) IS the repo's
 * `.claude/`. A Claude Code upgrade, a restore, or an accidental `mkdir ~/.claude` can
 * silently replace the symlink with a real directory or point it elsewhere, detaching the
 * whole config without any visible error. This script detects + heals that, safely.
 *
 * FOUR CASES (home = os.homedir() by default; overridable via --home for tests):
 *   1. CORRECT   — `<home>/.claude` is a symlink whose realpath === `<repoRoot>/.claude` -> no-op, OK.
 *   2. MISSING   — `<home>/.claude` does not exist -> create the symlink. HEALED.
 *   3. WRONG     — exists as a symlink but points elsewhere (or is broken) -> repoint it
 *                  (symlinks are trivially reversible). HEALED.
 *   4. REAL DIR/FILE — exists and is NOT a symlink (real directory or regular file) -> DANGER,
 *                  do NOT touch it (may hold real state). BLOCKED, exit non-zero, suggest
 *                  manual remediation.
 *
 * Flags:
 *   --dry-run        report the verdict + intended action, change nothing
 *   --home=<path>    override home dir (for tests); defaults to os.homedir()
 *   --repo-root=<p>  override repo root (for tests); defaults to derived from script location
 *
 * Every run appends a JSON line to `_SYSTEM/state/claude-symlink-enforce.log`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Derive the repo root from this script's own location: this file lives at
 * `<repoRoot>/_SYSTEM/Scripts/enforce-claude-symlink.mjs`, so repo root is two levels up.
 * Never hardcode an absolute user path — this must work for any clone location.
 */
export function resolveRepoRoot(scriptDir = __dirname) {
  return path.resolve(scriptDir, '..', '..');
}

/**
 * Classify the current state of `<home>/.claude` relative to the expected target.
 * Returns one of: 'correct' | 'missing' | 'wrong' | 'real'.
 * Never throws on a broken symlink (lstat succeeds, stat/realpath would throw) — that's 'wrong'.
 */
export function classify(homeClaudePath, expectedTarget) {
  let lst;
  try {
    lst = fs.lstatSync(homeClaudePath);
  } catch (err) {
    if (err.code === 'ENOENT') return { state: 'missing' };
    throw err;
  }

  if (!lst.isSymbolicLink()) {
    return { state: 'real', isDirectory: lst.isDirectory(), isFile: lst.isFile() };
  }

  // It's a symlink — resolve its realpath (may be broken).
  let realTarget;
  try {
    realTarget = fs.realpathSync(homeClaudePath);
  } catch {
    // Broken symlink (points at nothing) — treat as wrong, report raw link target.
    let rawTarget = null;
    try {
      rawTarget = fs.readlinkSync(homeClaudePath);
    } catch {
      /* ignore */
    }
    return { state: 'wrong', currentTarget: rawTarget, broken: true };
  }

  const expectedReal = fs.realpathSync(expectedTarget);
  if (realTarget === expectedReal) {
    return { state: 'correct', currentTarget: realTarget };
  }
  return { state: 'wrong', currentTarget: realTarget };
}

/**
 * Apply the safe heal for a given classification. Only called for 'missing' or 'wrong'.
 * Never called for 'real' (that case is BLOCKED, never auto-healed).
 */
function heal(homeClaudePath, expectedTarget, verdict) {
  if (verdict.state === 'wrong') {
    fs.unlinkSync(homeClaudePath); // removes the symlink itself, never the target contents
  }
  fs.symlinkSync(expectedTarget, homeClaudePath, 'dir');
}

function appendLog(logPath, entry) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Logging failure must never block the primary heal/report path.
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, home: null, repoRoot: null };
  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--home=')) args.home = raw.slice('--home='.length);
    else if (raw.startsWith('--repo-root=')) args.repoRoot = raw.slice('--repo-root='.length);
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const repoRoot = args.repoRoot ? path.resolve(args.repoRoot) : resolveRepoRoot();
  const expectedTarget = path.join(repoRoot, '.claude');
  const home = args.home ? path.resolve(args.home) : os.homedir();
  const homeClaudePath = path.join(home, '.claude');
  const logPath = path.join(repoRoot, '_SYSTEM', 'state', 'claude-symlink-enforce.log');

  if (!fs.existsSync(expectedTarget) || !fs.statSync(expectedTarget).isDirectory()) {
    const msg = `BLOCKED: expected target ${expectedTarget} does not exist or is not a directory — cannot enforce symlink.`;
    console.error(msg);
    appendLog(logPath, {
      ts: new Date().toISOString(),
      home: homeClaudePath,
      expectedTarget,
      state: 'target-missing',
      action: 'none',
      dryRun: args.dryRun,
    });
    console.log('00SL_CLAUDE_SYMLINK_ENFORCE_F_PASS_COMMITTED');
    return 1;
  }

  const verdict = classify(homeClaudePath, expectedTarget);
  let action = 'none';
  let exitCode = 0;
  let reportLine;

  switch (verdict.state) {
    case 'correct': {
      reportLine = `OK: ${homeClaudePath} -> ${expectedTarget} (correct)`;
      break;
    }
    case 'missing': {
      if (args.dryRun) {
        reportLine = `DRY-RUN: ${homeClaudePath} is missing; would create symlink -> ${expectedTarget}`;
        action = 'would-create';
      } else {
        heal(homeClaudePath, expectedTarget, verdict);
        reportLine = `HEALED: created ${homeClaudePath} -> ${expectedTarget}`;
        action = 'created';
      }
      break;
    }
    case 'wrong': {
      const old = verdict.currentTarget ?? '(broken link)';
      if (args.dryRun) {
        reportLine = `DRY-RUN: ${homeClaudePath} points to ${old}; would repoint -> ${expectedTarget}`;
        action = 'would-repoint';
      } else {
        heal(homeClaudePath, expectedTarget, verdict);
        reportLine = `HEALED: repointed ${homeClaudePath}: ${old} -> ${expectedTarget}`;
        action = 'repointed';
      }
      break;
    }
    case 'real': {
      const kind = verdict.isDirectory ? 'a real directory' : 'a regular file';
      reportLine =
        `BLOCKED: ${homeClaudePath} exists as ${kind} (NOT a symlink) — refusing to touch it, ` +
        `it may hold real state.\n` +
        `Manual remediation: back it up (e.g. \`mv ${homeClaudePath} ${homeClaudePath}.bak-$(date +%s)\`), ` +
        `then re-run this script to create the correct symlink -> ${expectedTarget}.`;
      action = 'none';
      exitCode = 1;
      break;
    }
    default:
      reportLine = `UNKNOWN STATE for ${homeClaudePath}`;
      exitCode = 1;
  }

  if (exitCode === 0) {
    console.log(reportLine);
  } else {
    console.error(reportLine);
  }

  appendLog(logPath, {
    ts: new Date().toISOString(),
    home: homeClaudePath,
    expectedTarget,
    state: verdict.state,
    action,
    dryRun: args.dryRun,
  });

  const passType = exitCode === 0 ? 'X' : 'F';
  console.log(`00SL_CLAUDE_SYMLINK_ENFORCE_${passType}_PASS_COMMITTED`);
  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
