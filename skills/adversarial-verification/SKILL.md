---
name: adversarial-verification
description: Use when verifying completed work, reviewing Claude or Codex output, wiring routes or adapters, relaunching lanes, committing, pushing, or avoiding first-run confidence.
---

# Adversarial Verification

First-run success is a hypothesis, not proof. The job is not done until the work survives a skeptical pass.

## Use When

- about to claim work is complete, fixed, wired, safe, or ready
- reviewing Claude, Codex, DeepSeek, or other agent output
- changing skills, routing, registries, permissions, launch packets, adapters, or parsers
- preparing a commit, push, relaunch, demo, or handoff
- the user asks to attack, stress test, double-check, verify, or stop trusting first output

## Attack Loop

1. State the claim being tested and the blast radius.
2. List likely failure modes: cosmetic-only change, wrong path, stale lane, missing registry entry, bad permissions, protected-path leak, live-service risk, unrelated staged changes, false-positive test.
3. Run positive checks that prove the intended path works.
4. Run negative or mismatch checks when the change has routing, parsing, permission, adapter, or policy behavior.
5. Independently verify collaborator output from local evidence; agent success reports are proposals.
6. Inspect changed/staged scope and protected surfaces before commit, push, or relaunch.
7. Report what failed first, what was fixed, the exact checks run, and residual risk.

## Minimum Evidence

- code/config change: syntax or targeted test plus diff scope
- route/skill/registry change: validation plus recommender/activation check
- permission/output-lane change: one accepted packet and one rejected mismatch
- moved/imported tree: source absence, destination presence, file count, protected-surface scan
- Claude output: local file/diff/test evidence, not Claude's wording
- commit/push: staged scope, protected-path scan, GitNexus change detection when applicable

## Stop Conditions

Stop and say so when no deterministic check exists, when the negative case unexpectedly passes, when staged scope includes unrelated work, or when a required check needs credentials/live services that are out of scope.

No "looks good" shortcut. Evidence first, then the claim.
