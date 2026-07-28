#!/usr/bin/env node
// @capability: yuri-eval-chmod-advisory
// @serves: freeze phase 4 | chmod 444 evaluator | per-checkout advisory layer
// @does: Sets _SYSTEM/eval/* to mode 444 in the current checkout. Records honestly that git cannot track modes beyond 100644/100755, so this does NOT survive clone/worktree and is NEVER a universal enforcement layer.
// @use: node _SYSTEM/Scripts/yuri-eval-chmod-advisory.mjs --apply | --status
// @exports: evalFiles, applyChmod444, status, main
// @tier: freeze-repair

import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

export function evalFiles(repoRoot = REPO) {
  const dir = join(repoRoot, '_SYSTEM', 'eval');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => join(dir, n));
}

export function applyChmod444(repoRoot = REPO) {
  const files = evalFiles(repoRoot);
  const results = [];
  for (const abs of files) {
    chmodSync(abs, 0o444);
    const mode = (statSync(abs).mode & 0o777).toString(8).padStart(3, '0');
    results.push({ path: abs.replace(repoRoot + '/', ''), mode });
  }
  return {
    applied: true,
    files: results,
    limit: 'PER-CHECKOUT AND ADVISORY. Git does not track 444 — evaporates on clone/new worktree. Never count as a universal layer. Does not close C5 for a determined writer with write access after chmod -u.',
  };
}

export function status(repoRoot = REPO) {
  return {
    files: evalFiles(repoRoot).map((abs) => ({
      path: abs.replace(repoRoot + '/', ''),
      mode: (statSync(abs).mode & 0o777).toString(8).padStart(3, '0'),
    })),
    limit: 'PER-CHECKOUT AND ADVISORY — not a universal freeze layer',
  };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--apply')) {
    console.log(JSON.stringify(applyChmod444(), null, 2));
    return 0;
  }
  if (argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return 0;
  }
  console.error('usage: yuri-eval-chmod-advisory.mjs --apply | --status');
  return 2;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
