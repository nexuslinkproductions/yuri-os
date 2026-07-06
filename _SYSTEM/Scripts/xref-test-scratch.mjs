// xref-test-scratch.mjs — git-scratch test harness for the xref staleness axis (test-only helper).
//
// WHY THIS EXISTS:
//   The staleness reconciliation in xref-drift-scan.mjs keys off `git diff --name-only
//   <indexedCommit>..HEAD` — which is meaningless against the LIVE working tree (it has ~220
//   dirty files, INCLUDING xref-drift-scan.mjs itself, which self-defeats any decisive assertion:
//   the file under test is always "stale" against itself). So every staleness test MUST run against
//   a CONTROLLED, throwaway git repo whose commit history and .gitnexus marker we author exactly.
//
//   This helper builds that controlled scratch repo: a real `git init` dir, deterministic identity,
//   a sequence of commits we control, and a hand-written `.gitnexus/meta.json` marker pinned to an
//   EARLIER commit so `indexedCommit..HEAD` produces a KNOWN set of changed files. Nothing here
//   touches the live repo, protected paths, or the network.
//
// NOT A MECHANISM — pure test scaffolding (no @capability tag; capability-scan ignores *.test.mjs
//   and this file is imported only by the two staleness test files, never by runtime code).
//
// Idiom borrowed from the in-repo git-scratch pattern (secret-leak-scan.test.mjs): execFileSync
//   git init + config user.email/name (so commits don't fail on a CI box with no global identity),
//   add, commit with stdio:'ignore'.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_ENV = {
  ...process.env,
  // Pin identity + dates so commit hashes/order are deterministic and never depend on the host's
  // global git config (a CI box may have none -> `git commit` would otherwise abort).
  GIT_AUTHOR_NAME: 'YURI Test',
  GIT_AUTHOR_EMAIL: 'test@yuri.local',
  GIT_COMMITTER_NAME: 'YURI Test',
  GIT_COMMITTER_EMAIL: 'test@yuri.local',
};

function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * makeScratchRepo — create a fresh, isolated git repo in a temp dir.
 * @returns {{root:string, cleanup:Function, git:Function, writeFile:Function, commit:Function, head:Function, writeMeta:Function, writeGraph:Function}}
 */
export function makeScratchRepo(prefix = 'yuri-xref-scratch-') {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@yuri.local']);
  git(root, ['config', 'user.name', 'YURI Test']);
  // Force a stable default branch name so `HEAD` resolution never depends on the host's init config.
  try { git(root, ['checkout', '-b', 'main']); } catch { /* already on a branch */ }

  const writeFile = (relPath, content) => {
    const abs = path.join(root, relPath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  };

  // Write a node into the circuitry-graph fixture (same path the live scanner reads).
  const writeGraph = (nodes, edges = []) => {
    const rel = path.join('02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
    writeFile(rel, JSON.stringify({ nodes, edges, generatedAt: 'scratch' }));
    return path.join(root, rel);
  };

  // Write the .gitnexus/meta.json marker pinning the indexed commit (what the scanner reconciles against).
  const writeMeta = (lastCommit) => {
    writeFile(path.join('.gitnexus', 'meta.json'), JSON.stringify({ lastCommit }));
  };

  // Stage everything currently in the tree and commit; return the new HEAD sha.
  const commit = (message, addPaths = ['.']) => {
    git(root, ['add', ...addPaths]);
    git(root, ['commit', '-m', message]);
    return git(root, ['rev-parse', 'HEAD']);
  };

  const head = () => git(root, ['rev-parse', 'HEAD']);

  const cleanup = () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } };

  return { root, cleanup, git: (args) => git(root, args), writeFile, commit, head, writeMeta, writeGraph };
}
