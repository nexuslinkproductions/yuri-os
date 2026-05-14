---
name: spec-analyze
description: Risk + complexity scoring of a generated plan.md using probabilistic-decision-core skill. Optional pass between Scripts/spec-pipeline.mjs and Codex implementation.
triggers:
  - "/spec-analyze"
---

# /spec-analyze — Plan Risk + Complexity Scoring

When invoked with a plan.md path (default: most recent in `specs/active/<slug>/plan.md`), execute:

## Phase — Probabilistic Decision Core

Apply the `probabilistic-decision-core` skill (already loaded in NUDIMMUD) to:

1. Read plan.md + sibling tasks.md
2. For each task in tasks.md:
   - Extract goal, target files, constraints, acceptance criteria
   - Score COMPLEXITY (1-5):
     - 1: 1 file, <50 lines, single-function change
     - 2: 1 file, <200 lines, multi-function or 2-3 files small
     - 3: 3-6 files, cross-cutting OR new module
     - 4: 6+ files, architectural OR protected-surface adjacent
     - 5: protected surface, control-plane, or auth-touching
   - Score RISK (1-5) via blast radius:
     - 1: read-only, additive, dry-run-default
     - 2: bounded mutation, reversible
     - 3: cross-cutting mutation with tests
     - 4: shared infrastructure, multi-consumer impact
     - 5: protected surface, irreversible, or no rollback path
   - Compute EXPECTED VALUE score:
     - EV = (probability_success × value_delivered) - (probability_failure × cost_of_failure)
     - Use base-rates from prior similar tasks in `memory/` and recent commits
3. Cross-reference with GitNexus impact (already inlined per C5):
   - If GITNEXUS IMPACT shows direct dependents > 10: bump RISK +1
   - If affected processes > 3: bump RISK +1

## Phase — Output

Stdout table:

```
TASK | COMPLEXITY | RISK | EV | RECOMMENDED LANE | RECOMMENDED ORDER
-----|------------|------|-----|-------------------|------------------
1    | 2          | 1    | +0.85 | gpt-5.4-mini    | first (low risk)
2    | 4          | 3    | +0.40 | gpt-5.5         | after task 1 verified
3    | 5          | 5    | -0.10 | DEFER + SPLIT   | break into smaller subtasks
```

Plus written summary:
- Top-3 lowest-risk tasks (do first)
- Top-3 highest-risk tasks (verify rollback path before dispatch)
- Tasks with EV < 0 (should be re-scoped or split)

## Phase — User Decision

Present table + summary. User decides:
- Accept ordering and dispatch via Codex/DeepSeek per recommended lane
- Re-scope high-risk tasks (split, sequence, add tests)
- Defer EV<0 tasks until requirements firmer

## Authority Boundaries

- Scoring uses probabilistic-decision-core skill (NUDIMMUD-native)
- Lane recommendations follow Scripts/offload-contract.mjs routingPriority (Codex first)
- Read-only — no mutations from this command
- All anime DNA gates apply when actual implementation begins

## When to Use

- Plan generated from a spec with > 5 tasks
- Plan touches >3 modules
- Plan has any RISK 4+ task
- Before committing to a multi-day implementation campaign

## When to Skip

- Plan with 1-2 tasks of obvious low risk
- Bug fix plans with single-task scope
- Plans for purely additive features (new file, no edits)
