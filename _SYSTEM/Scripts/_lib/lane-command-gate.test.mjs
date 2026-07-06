#!/usr/bin/env node
// Bypass-focused tests for the hardened llm-lane bash gate: git mutation detection robust to global
// options + quote evasion, and protected-surface detection by realpath + secret basename. The cases
// marked "BYPASS the old regex" are the ones the previous /git\s+(commit|...)/ + substring rule missed.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gitMutationHit, protectedPathHit, tokenizeCommand } from './lane-command-gate.mjs';

// ── git mutation detection ──────────────────────────────────────────────────────────────────────
test('git: baseline mutations are caught', () => {
  for (const c of ['git commit -m x', 'git push origin main', 'git reset --hard', 'git checkout .',
    'git rebase main', 'git merge feat', 'git clean -fd', 'git restore .', 'git cherry-pick abc', 'git revert HEAD']) {
    assert.equal(gitMutationHit(c), true, c);
  }
});

test('git: option-prefix forms that BYPASS the old regex are now caught', () => {
  for (const c of [
    'git -C /some/repo commit -m x',     // -C dir value
    'git -c user.name=bot push',          // -c k=v value
    'git --git-dir=.git --work-tree=. commit',
    'git --no-pager push',                // standalone global flag
    'git -C . -c k=v reset --hard',
  ]) assert.equal(gitMutationHit(c), true, c);
});

test('git: quote/backslash evasion collapses to the real token', () => {
  for (const c of ['gi""t commit', "gi''t push", 'g\\it commit', 'git com""mit', '"git" reset --hard']) {
    assert.equal(gitMutationHit(c), true, c);
  }
});

test('git: read-only subcommands stay ALLOWED (not over-blocked)', () => {
  for (const c of ['git status', 'git log --oneline', 'git diff HEAD', 'git show abc', 'git stash list',
    'git branch', 'git branch -a', 'git config user.email x', 'git rev-parse HEAD']) {
    assert.equal(gitMutationHit(c), false, c);
  }
});

test('git: destructive stash/branch subops are caught, read-only ones are not', () => {
  assert.equal(gitMutationHit('git stash drop'), true);
  assert.equal(gitMutationHit('git stash clear'), true);
  assert.equal(gitMutationHit('git branch -D feature'), true);
  assert.equal(gitMutationHit('git branch --delete x'), true);
  assert.equal(gitMutationHit('git stash list'), false);
});

test('git: absolute binary path + segmented commands', () => {
  assert.equal(gitMutationHit('/usr/bin/git push'), true);
  assert.equal(gitMutationHit('ls && git commit -m x'), true);
  assert.equal(gitMutationHit('git status | grep modified'), false);
  assert.equal(gitMutationHit('echo hi; git reset --hard'), true);
});

// ── protected-surface detection ─────────────────────────────────────────────────────────────────
const REPO = '/repo';
// mirror llm-lane's isProtectedPath protected-prefix logic for in-repo rels (the realpath target check)
const fakeProtected = (abs) => {
  const rel = path.relative(REPO, abs);
  if (rel.startsWith('..')) return true;
  return /^(backend\/data|secrets|\.claude\/(state|history|file-history))(\/|$)/.test(rel) || /(^|\/)\.env($|\.)/.test(rel);
};
const hit = (c) => protectedPathHit(c, { repoRoot: REPO, isProtectedPath: fakeProtected });

test('protected: secret BASENAME caught anywhere (no slash, home, abs)', () => {
  for (const c of ['cat .env', 'cat ./.env', 'cat ~/.env', 'cat /tmp/x/.env',
    'cat .env.local', 'cat id_rsa.pem', 'cat server.key', 'cat cert.p12']) {
    assert.equal(hit(c), true, c);
  }
});

test('protected: in-repo protected prefixes caught via resolved path', () => {
  for (const c of ['cat backend/data/app.db', 'sqlite3 ./backend/data/x', 'cat secrets/token.txt',
    'cat .claude/state/cortex.json']) {
    assert.equal(hit(c), true, c);
  }
});

test('protected: quote evasion of a secret name is caught', () => {
  assert.equal(hit('cat .e""nv'), true);
  assert.equal(hit('cat "secrets/k.txt"'), true);
  assert.equal(hit('cat backend/da""ta/x'), true); // collapses to backend/data/x
});

test('protected: legitimate commands stay ALLOWED', () => {
  for (const c of ['node --test foo.test.mjs', 'cat README.md', 'cat /usr/bin/node',
    'grep -r pattern src/', 'npm test', 'ls backend/src']) {
    assert.equal(hit(c), false, c);
  }
});

test('tokenizeCommand collapses quoting + command substitution boundaries', () => {
  assert.deepEqual(tokenizeCommand('gi""t commit'), ['git', 'commit']);
  assert.ok(tokenizeCommand('$(git push)').includes('git'));
  assert.ok(tokenizeCommand('`git tag v1`').includes('git'));
});

// ── RED-TEAM FIXES (glob expansion, redirection, stash push) ────────────────────────────────────
test('RED-TEAM: dotfile-glob aimed at a protected dotfile is blocked (even if absent)', () => {
  // segment starts with '.' + a wildcard -> blocked without needing the file to exist
  for (const c of ['cat .e*', 'cat .??v', 'cat .e?v', 'cat ./.??v', 'cat .en?.local', 'cat .claud?/state/foo']) {
    assert.equal(hit(c), true, c);
  }
});

test('RED-TEAM: glob expansion catches non-dot protected surfaces against a REAL repo', () => {
  // glob expansion needs real files (a non-matching glob leaks nothing) — plant them like the red-team did.
  const repo = path.join(os.tmpdir(), `gate-glob-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(path.join(repo, 'secrets'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'backend', 'data'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(repo, 'secrets', 'key.txt'), 'k');
  fs.writeFileSync(path.join(repo, 'backend', 'data', 'app.db'), 'd');
  fs.writeFileSync(path.join(repo, '.claude', 'state', 'foo'), 's');
  fs.writeFileSync(path.join(repo, 'README.md'), 'r');
  const realProtected = (abs) => {
    const rel = path.relative(repo, abs);
    if (rel.startsWith('..')) return true;
    return /^(backend\/data|secrets|\.claude\/(state|history|file-history))(\/|$)/.test(rel) || /(^|\/)\.env($|\.)/.test(rel);
  };
  const h = (c) => protectedPathHit(c, { repoRoot: repo, isProtectedPath: realProtected });
  try {
    for (const c of ['cat se?rets/key.txt', 'cat secret*/key.txt', 'cat backend/dat*/app.db',
      'cat backend/dat*/*', 'cat .claude/sta*/foo', 'tar czf /tmp/x.tgz secret*', 'cat .e*']) {
      assert.equal(h(c), true, `BLOCK ${c}`);
    }
    for (const c of ['cat *.md', 'cat READ*.md', 'node --test *.test.mjs']) {
      assert.equal(h(c), false, `ALLOW ${c}`);
    }
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('RED-TEAM: redirection-into-token is split + caught', () => {
  assert.equal(hit('cat <.env'), true);
  assert.equal(hit('cat 0<.env'), true);
  assert.equal(hit('cat<.env'), true);          // no space
  assert.equal(hit('cat > secrets/x'), true);   // write-to protected also caught
  assert.equal(hit('cat < README.md'), false);  // legit redirect stays allowed
});

test('RED-TEAM: git stash push/save/bare are mutations; list/show stay read-only', () => {
  assert.equal(gitMutationHit('git stash push -m x'), true);
  assert.equal(gitMutationHit('git stash save x'), true);
  assert.equal(gitMutationHit('git stash'), true);
  assert.equal(gitMutationHit('git stash list'), false);
  assert.equal(gitMutationHit('git stash show'), false);
});
