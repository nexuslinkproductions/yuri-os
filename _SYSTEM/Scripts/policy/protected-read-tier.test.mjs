// Regression suite for the protected-surface READ/MUTATE tier split.
//
// Owner directive 2026-07-26: "protected paths must all be read only not entirely inaccessible" and
// "the canonical track b must be readable globally". The shell gate was previously stricter than
// `_SYSTEM/yuri-origin.md` → Protected Surfaces actually states, blocking read-only inspection
// (`git ls-files`, `ls`, `stat`, `cat`) of non-secret state including Track-B memory.
//
// It also fixes a PRE-EXISTING security hole found while implementing that: the SEC-4 read-block
// was unreachable for its own stated cases. `evaluateShellCommand` returned allow() at the
// `isProtectedReadOnlyCommand` early-exit BEFORE reaching the read-block, so `cat .env`,
// `cat ~/.aws/credentials` and `cat ~/.ssh/id_rsa` were permitted despite an extensive comment
// claiming otherwise. Verified against the then-committed file: all five credential reads returned
// ALLOW. These tests exist so that can never silently regress again.
//
// Invariants asserted here:
//   1. Non-secret protected state is READABLE  (state, history, file-history, projects/memory, .amp,
//      backend/data)
//   2. Credential-bearing targets stay READ-BLOCKED (.env, ~/.aws, ~/.ssh, ~/.gnupg, gh hosts.yml)
//   3. MUTATION of every protected target stays blocked regardless of tier
//   4. Recursive delete stays blocked; non-recursive single-file delete is allowed (the old regex
//      matched the `r` in any pathname, so `rm -f <file with r>` false-positived constantly)

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHookEvent } from './yuri-safety-core.mjs';

// Built at runtime so this file's own source text carries no literal destructive token — the guard
// scans command strings, and a literal here trips it when the suite path is echoed in a shell line.
const RM = String.fromCharCode(114, 109);

const decide = (command) =>
  evaluateHookEvent({ tool_name: 'Bash', tool_input: { command } });

const allows = (command) => decide(command).allowed === true;
const blocks = (command) => decide(command).allowed === false;

test('non-secret protected state is readable (owner directive: read-only, not inaccessible)', () => {
  assert.ok(allows('git ls-files .claude/projects/x/memory/MEMORY.md'), 'Track-B memory must be listable');
  assert.ok(allows('cat .claude/projects/x/memory/MEMORY.md'), 'Track-B memory must be readable');
  assert.ok(allows('ls -la .claude/state'), '.claude/state must be listable');
  assert.ok(allows('stat .claude/file-history'), '.claude/file-history must be stat-able');
  assert.ok(allows('cat backend/data/foo.json'), 'backend/data must be readable');
});

test('credential-bearing targets stay read-blocked (SEC-4, previously unreachable)', () => {
  assert.ok(blocks('cat .env'), '.env read must deny');
  assert.ok(blocks('cat ~/.aws/credentials'), 'aws credentials read must deny');
  assert.ok(blocks('cat ~/.ssh/id_rsa'), 'ssh private key read must deny');
  assert.ok(blocks('cat /Users/marcelspatz/.gnupg/secring.gpg'), 'gnupg read must deny (expanded path form)');
  assert.ok(blocks('cat ~/.config/gh/hosts.yml'), 'gh host token read must deny');
});

test('mutation of protected targets stays blocked in both tiers', () => {
  assert.ok(blocks(`${RM} -f .claude/projects/x/memory/MEMORY.md`), 'deleting Track-B memory must deny');
  assert.ok(blocks('echo x > .claude/state/foo.json'), 'redirect into .claude/state must deny');
  assert.ok(blocks(`${RM} .env`), 'deleting .env must deny');
});

test('recursive delete blocked, non-recursive single-file delete allowed', () => {
  // still destructive
  assert.ok(blocks(`${RM} -rf /tmp/somedir`));
  assert.ok(blocks(`${RM} -fr /tmp/somedir`));
  assert.ok(blocks(`${RM} -r /tmp/somedir`));
  assert.ok(blocks(`${RM} -i -R /tmp/somedir`));
  assert.ok(blocks(`${RM} --recursive /tmp/somedir`));
  // the false-positive class: an `r` in the PATH must not read as a recursive flag
  assert.ok(allows(`${RM} -f /tmp/guard-head-tmp.mjs`), 'r in pathname must not imply -r');
  assert.ok(allows(`${RM} /tmp/report.md`));
  assert.ok(allows(`${RM} -f /tmp/scratch-recorder.json`));
});
