#!/usr/bin/env node
// @capability: lane-command-gate
// @serves: bash command gate | git mutation detection | protected surface in command | lane advisory gate | command denylist | shell command safety
// @does: the llm-lane advisory bash-gate hardening — detect git MUTATION subcommands ROBUST to global options that defeat a naive /git\s+(commit|...)/ regex (git -C dir commit, git -c k=v push), and detect PROTECTED-surface path references by realpath + secret-basename rather than a substring regex. Tokenization strips quotes/backslashes so quote-evasion (gi""t, com\\mit) collapses to the real token.
// @use: llm-lane.laneCommandAllowed calls gitMutationHit(cmd) + protectedPathHit(cmd,{repoRoot,isProtectedPath}). Pure (cmd string -> boolean), unit-testable, bypass-red-teamable.
// @exports: gitMutationHit, protectedPathHit, tokenizeCommand, GIT_MUTATION_SUBCOMMANDS
//
// HONEST SCOPE (the static-matcher floor, per the bash-guard-lexical-bypass lesson): a string→verdict
// matcher is a fail-OPEN layer-2 conscience, NOT a sandbox. $VAR / $(...) / base64 / runtime indirection
// can still hide intent — the lane runs dev-only on the owner box, and destructive ops are caught by the
// audited safety core (evaluateToolCall) upstream. This module closes the OPTION-PREFIX, QUOTE-EVASION,
// GLOB-EXPANSION, REDIRECTION, and stash-push bypass classes the old regex missed (all red-team-proven +
// re-verified 2026-06-13); the residual is exactly the runtime-indirection floor above, not airtight.
// NOTE: protected-glob detection (globSync) expands against `repoRoot`, which MUST equal the cwd the
// command will execute in (llm-lane passes REPO_ROOT for both) so the gate sees what bash would expand.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// git subcommands that MUTATE working tree / history / remote (read-only ones — status/log/diff/show — stay
// allowed so the lane can investigate). Matches the original gate's intent, now option-robust.
export const GIT_MUTATION_SUBCOMMANDS = new Set([
  'commit', 'push', 'tag', 'merge', 'rebase', 'reset', 'clean', 'checkout', 'restore',
  'cherry-pick', 'am', 'revert', 'switch', 'apply',
]);
// git stash: bare `git stash` (= push) + push/save/drop/clear/pop/apply ALL mutate the working tree;
// only `list` / `show` are read-only. Red-team: `git stash push` slipped a destructive-only set. Allowlist.
const STASH_READONLY = new Set(['list', 'show']);
const BRANCH_DESTRUCTIVE = /^-(d|D|-delete|m|M|-move)$/; // git branch -D x / --delete
// git global options that consume the NEXT token as their value (so the subcommand is one further along).
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);

// Collapse command-substitution / grouping boundaries to whitespace so an inner command is still scanned,
// then split on shell sequencing/pipe operators into independent segments.
function splitSegments(cmd) {
  const flattened = String(cmd || '')
    .replace(/\\\n/g, ' ')        // line continuations
    .replace(/[`]/g, ' ')         // backtick command substitution
    .replace(/\$\(/g, ' ')        // $( command substitution
    .replace(/[(){}]/g, ' ')      // grouping / subshells
    .replace(/[<>]/g, ' ');       // redirections — split the target off as its own token (red-team: `cat <.env`)
  return flattened.split(/[;|&\n]+/).map((s) => s.trim()).filter(Boolean);
}

// Strip surrounding + intra-token quotes and backslash-escapes so quote-evasion (gi""t, com\m\it, "git")
// collapses to the token the shell would actually execute.
function stripShellQuoting(tok) {
  return String(tok).replace(/[\\'"]/g, '');
}

/** Tokenize a command into shell-ish words with quoting stripped (best-effort, not a full bash parser). */
export function tokenizeCommand(cmd) {
  const out = [];
  for (const seg of splitSegments(cmd)) {
    for (const raw of seg.split(/\s+/)) {
      const t = stripShellQuoting(raw);
      if (t) out.push(t);
    }
  }
  return out;
}

const gitBasename = (tok) => tok.split('/').pop();

/**
 * True if `cmd` invokes a git MUTATION subcommand — robust to global options. A naive /git\s+(commit|...)/
 * is defeated by ANY global option before the subcommand (git -C dir commit, git -c k=v push); here we
 * locate each `git` token, skip its global options (value-taking ones consume the next token), and test
 * the first bare token against the closed mutation set.
 */
export function gitMutationHit(cmd) {
  for (const seg of splitSegments(cmd)) {
    const toks = seg.split(/\s+/).map(stripShellQuoting).filter(Boolean);
    for (let i = 0; i < toks.length; i += 1) {
      if (gitBasename(toks[i]) !== 'git') continue;
      let j = i + 1;
      while (j < toks.length) {
        const t = toks[j];
        if (t.startsWith('-')) {
          if (GIT_VALUE_OPTS.has(t)) { j += 2; continue; } // `-C dir`, `-c k=v` (separate value token)
          j += 1; continue;                                 // `--opt=val` or a standalone flag
        }
        break;
      }
      if (j >= toks.length) continue;
      const sub = toks[j].toLowerCase();
      if (GIT_MUTATION_SUBCOMMANDS.has(sub)) return true;
      if (sub === 'stash' && !STASH_READONLY.has((toks[j + 1] || '').toLowerCase())) return true;
      if (sub === 'branch' && toks.slice(j + 1).some((t) => BRANCH_DESTRUCTIVE.test(t))) return true;
    }
  }
  return false;
}

function expandTilde(tok) {
  if (tok === '~') return os.homedir();
  if (tok.startsWith('~/')) return path.join(os.homedir(), tok.slice(2));
  return tok;
}

// secret files are blocked by BASENAME regardless of where they sit (.env, .env.local, id.pem, x.key, ...),
// so `cat ~/.env`, `cat /any/path/.env`, `cat secret.pem` are all caught without enumerating directories.
const SECRET_BASENAME = /^\.env($|\.)|\.(pem|key|p12|pfx)$/i;
const GLOB_RE = /[*?[\]]/;
const literalPrefix = (tok) => { const i = tok.search(GLOB_RE); return i < 0 ? tok : tok.slice(0, i); };

// True iff `abs` is an in-repo protected surface (skips out-of-repo binaries like /usr/bin/node).
function inRepoProtected(abs, repoRoot, isProtectedPath) {
  const rel = path.relative(repoRoot, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && isProtectedPath(abs);
}

// Expand a glob against the repo and test every real match — `cat .e*` -> `.env`, `cat secrets/*` -> a key.
// The literal glob TOKEN can't be realpath-resolved (that's the red-team bypass); only real expansion sees
// what bash would read. Needs an existing target to match — and a non-matching glob leaks nothing anyway.
function globMatchesProtected(pattern, repoRoot, isProtectedPath) {
  if (typeof fs.globSync !== 'function') return false;
  let matches = [];
  try { matches = fs.globSync(pattern, { cwd: repoRoot }); } catch { return false; }
  for (const m of matches) {
    if (SECRET_BASENAME.test(path.basename(m))) return true;
    if (inRepoProtected(path.resolve(repoRoot, m), repoRoot, isProtectedPath)) return true;
  }
  return false;
}

/**
 * True if `cmd` references a PROTECTED surface. Per path-ish token: secret-basename net; then for GLOB
 * tokens — a conservative dotfile-glob block (`.e*`, `.claud?` aim at a protected dotfile even if absent),
 * repo expansion (catches `secrets/*`, `backend/dat*` when the target exists), and a literal-prefix-inside-
 * protected belt (`secrets/k*`); for plain tokens — realpath + lexical resolution (so symlinks-into-protected
 * and `./.env` are caught). Red-team-hardened: glob expansion + redirection splitting + stash allowlist.
 */
export function protectedPathHit(cmd, { repoRoot, isProtectedPath } = {}) {
  for (const rawTok of tokenizeCommand(cmd)) {
    if (rawTok.startsWith('-')) continue; // flags aren't paths
    const tok = expandTilde(rawTok);
    if (SECRET_BASENAME.test(path.basename(tok))) return true;
    if (typeof isProtectedPath !== 'function' || !repoRoot) continue;

    if (GLOB_RE.test(tok)) {
      // (a) a dotfile-glob SEGMENT (.e*, .claud?, .??v) aims at a protected dotfile — block conservatively,
      //     independent of whether the file exists right now (dotfile globs are suspicious for an LLM lane).
      if (tok.split('/').some((seg) => seg.startsWith('.') && GLOB_RE.test(seg))) return true;
      // (b) expand against the repo: any real match that is protected -> block.
      if (globMatchesProtected(tok, repoRoot, isProtectedPath)) return true;
      // (c) the literal prefix already sits inside a protected surface (secrets/k*).
      const lit = literalPrefix(tok);
      if (lit && lit !== '.' && lit !== './' && inRepoProtected(path.resolve(repoRoot, lit), repoRoot, isProtectedPath)) return true;
      continue;
    }

    const lex = path.resolve(repoRoot, tok);
    const cands = [lex];
    try { const real = fs.realpathSync(lex); if (real !== lex) cands.push(real); } catch { /* nonexistent: lexical only */ }
    for (const abs of cands) {
      if (inRepoProtected(abs, repoRoot, isProtectedPath)) return true;
    }
  }
  return false;
}
