#!/usr/bin/env node
// @capability: yuri-git-hooks-path
// @serves: freeze C3 fix | absolute core.hooksPath | one-shot bind all worktrees
// @does: Sets core.hooksPath once to the ABSOLUTE path of the primary checkout's _SYSTEM/git-hooks (resolved via git-common-dir). Worktrees share .git/config so one setting binds the fleet. No sync, no hash daemon, no installer copy. Owner ruling 2026-07-28: two commands only.
// @use: node _SYSTEM/Scripts/yuri-git-hooks-path.mjs --apply | --status
// @exports: resolveHooksAbs, apply, status, main
// @tier: freeze-repair

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Primary checkout root = parent of git-common-dir (.git). */
export function primaryRoot(cwd = REPO) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  return common.endsWith('/.git') || common.endsWith('.git')
    ? resolve(common, '..')
    : resolve(common);
}

export function resolveHooksAbs(cwd = REPO) {
  return join(primaryRoot(cwd), '_SYSTEM', 'git-hooks');
}

export function apply(cwd = REPO) {
  const abs = resolveHooksAbs(cwd);
  if (!existsSync(join(abs, 'pre-commit'))) {
    throw new Error(`canonical pre-commit missing at ${abs}`);
  }
  git(['config', 'core.hooksPath', abs], cwd);
  const mode = (statSync(join(abs, 'pre-commit')).mode & 0o777).toString(8);
  return {
    core_hooksPath: abs,
    pre_commit_mode: mode,
    note: 'Absolute hooksPath via primary checkout. All worktrees sharing this .git/config are bound. No sync machinery.',
  };
}

export function status(cwd = REPO) {
  let current = null;
  try {
    current = git(['config', '--get', 'core.hooksPath'], cwd);
  } catch {
    current = null;
  }
  const target = resolveHooksAbs(cwd);
  return {
    current,
    target,
    is_absolute: !!(current && current.startsWith('/')),
    matches_target: current === target,
    relative_escape_class: !!(current && !current.startsWith('/')),
  };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--apply')) {
    console.log(JSON.stringify(apply(), null, 2));
    return 0;
  }
  if (argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return 0;
  }
  console.error('usage: yuri-git-hooks-path.mjs --apply | --status');
  return 2;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
