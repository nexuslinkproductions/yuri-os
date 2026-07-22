---
name: commit-scope-and-fix-verification
description: Verifying commit scope and distinguishing real fixes from test-narrowing/suppression. Use when auditing a commit, judging whether a green test reflects a genuine fix, classifying whitelist/allowlist exceptions, or navigating protected-path guards. Covers omnibus-commit hazards, verify-against-committed-state, live-vs-stale exception classification, and claim-by-claim adjudication of independent audits.
triggers: ["commit scope audit", "fix vs narrowing", "test narrowing", "allowlist exception", "verify against committed state", "protected path guard", "claim by claim adjudication"]
scope: harness
invocation: workflow
---

# Commit Scope & Fix Verification

## Use When
Auditing a commit's scope, judging whether a passing test is a real fix or suppression, classifying allowlist exceptions, adjudicating conflicting audit verdicts, or working around a protected-path guard.

## Commit scope: the message is not evidence
- A commit's MESSAGE claiming narrow scope proves nothing. Verify with `git show --name-status <sha>` and `git show --stat <sha>`.
- Observed hazard (YURI 2026-07-21): commit `5e03a728` said "No commit beyond this WO-3 scope … out-of-scope NOT staged" but carried 42 paths (36 unrelated concurrent-lane files) — a mislabeled, pushed omnibus.
- Discipline: ALWAYS explicit pathspec — `git add <paths>` + `git commit -- <paths>`, never `git add .` or bare `git commit -a` in a shared/dirty tree. State the mechanism as UNKNOWN unless you have staged-index/author evidence.

## Verify against COMMITTED state, not the worktree
- When auditing what a commit contains, read `git show <sha>:path` and compute blob OIDs from the commit — NOT the working tree. Concurrent-lane edits contaminate the worktree and will mislead the audit.
- A worktree pass can hide a committed RED (and vice-versa).

## Fix vs narrowing (the core discriminator)
A test that goes green after being modified may be a real fix OR suppression:
1. Diff the test across the change: `git diff <parent> <sha> -- <test>`.
2. If an allowlist/`allowedMatches`/skip-list GREW, treat it as suppression until proven otherwise.
3. Classify EACH exception by running the test's actual matcher against the current file:
   - **LIVE** — the flagged pattern still matches → the exception is load-bearing. Judge: intentional fixture/guard (keep + document) vs lazy whitelist of a real bug (fix at source).
   - **STALE** — the pattern no longer matches (source already fixed) → dead weight; remove it to tighten the gate (no source change, stays green).
4. Intentional single-install fixtures (tests pinning a canonical absolute production path to assert recovery/APFS/launchd behavior) are legitimate — deriving them dynamically would make the assertion tautological. Keep + document; optionally de-scatter the literal to ONE shared constant.

## Protected-path guards
- The `.env` protected-path guard is a COMMAND-TOKEN scanner: a literal `.env` anywhere in a bash command (`test -e .env`, `--exclude=.env`, `find -name .env`) trips it BEFORE any file op. Single git ops (`git cat-file`, `git init`) work. If blocked "mutation of protected target: .env," check your OWN command for the literal token — use positive allowlists and in-process `node:fs` checks.
- The destructive-`rm` guard blocks `rm -rf` AND multi-arg `rm -f`. Do NOT route around it (unlink/individual). Respect standing no-deletion instructions: preserve the file, prepare a reversible removal PROPOSAL with path/hash evidence, await direct owner approval.

## Adjudicating independent audits (claim-by-claim, not by author)
- When two co-equal outputs disagree (your analysis vs an independent auditor's), resolve one claim at a time, never by author or confidence tone.
- Accept the auditor's correct sub-claims (e.g. "the literal survives at line 275" — factually true) while rejecting its framing where evidence supports otherwise (e.g. "narrowing" when the entry is an intentional fixture). Name the specific reason each side is right/wrong.
- A higher-authority or independent correction is a HYPOTHESIS — re-verify against evidence before adopting.
