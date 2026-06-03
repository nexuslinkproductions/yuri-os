# NISABA — HOUSE 1: SWARM ARCHITECTURE
*The Deployment Temple. Where blueprints become running systems.*

---

## THE PRIME LAW OF NISABA

> **The orchestrator never executes. It routes.**
> **The specialist never routes. It executes.**
> **The gate never advises. It blocks.**
> **The system always has a sleep state.**

These four laws are non-negotiable. Violating any one of them produces a system that looks like it works but fails at scale.

---

## SWARM ANATOMY

```
TRIGGER
  ↓
ORCHESTRATOR (reads state, picks next move)
  ↓
SPECIALIST(S) (narrow execution, isolated context)
  ↓
GATES (hard blocks — 7 layers)
  ↓
OUTPUT or RETRY or SLEEP
```

Every cycle follows this shape. Every cycle starts fresh. No cycle inherits state from the last cycle except through the external state file.

---

## TRIGGER CATALOG

### Type 1: Timed Trigger (Standard)
```bash
# System cron — simplest machine-level trigger
*/30 * * * * cd /path/to/repo && claude -p "run the swarm orchestrator" >> /tmp/swarm.log 2>&1

# Or via Claude Code Desktop scheduled tasks:
# Schedule → New Task → paste orchestrator prompt → Every 30 minutes
```
**When to use:** Overnight builds, continuous automation, background processing
**Cadence guidance:**
- 30 minutes: standard overnight build cycles
- 1 hour: lower-urgency automation, content generation
- 15 minutes: high-urgency real-time tasks (monitoring, alerts)

### Type 2: Event-Driven Trigger (Reactive)
```yaml
# GitHub webhook on PR creation
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  swarm-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: claude -p "orchestrate code review for PR ${{ github.event.pull_request.number }}"
```
**When to use:** PR review, deployment gates, asset upload processing

### Type 3: API-Driven Trigger (Programmatic)
```bash
# Trigger via Routines API
curl -X POST https://api.anthropic.com/v1/routines/run \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d '{"routine_id": "swarm-orchestrator", "context": {"task": "process-new-client-brief"}}'
```
**When to use:** Integrations, external system events, programmatic automation

### Type 4: Condition-Driven Trigger (Smart)
```bash
# Only fires if state file indicates work is available
#!/bin/bash
STATE=$(cat /path/to/repo/.swarm/state.json | jq '.pending_tasks | length')
if [ "$STATE" -gt "0" ]; then
  claude -p "run the swarm orchestrator"
else
  echo "No pending tasks. Sleeping." >> /tmp/swarm.log
fi
```
**When to use:** Cost optimization — don't wake the swarm if there's nothing to do

### Type 5: Cascading Trigger (Pipeline)
```
Trigger A → produces output → writes to state file → Trigger B reads state → fires
```
**Example:**
```
Blog Writer (daily 09:00) → writes post → updates state.json
Carousel Maker (daily 11:00) → reads state.json → finds unmatched post → runs
Reddit Scout (daily 13:00) → reads state.json → finds today's topic → runs
```
**When to use:** Distribution pipeline, multi-stage content production, sequential workflows

---

## ORCHESTRATOR SPECIFICATION

The orchestrator is the brain. It reads state and answers one question: **what is the next move?**

### State file structure
```json
// .swarm/state.json — the orchestrator reads this every cycle
{
  "last_updated": "2026-04-19T21:30:00Z",
  "pending_tasks": [
    {
      "id": "task-001",
      "type": "feature-build",
      "spec": "docs/specs/auth-system.md",
      "priority": 1,
      "dependencies": [],
      "status": "pending"
    }
  ],
  "in_progress": [],
  "completed": [],
  "blocked": [
    {
      "id": "task-003",
      "reason": "waiting for task-001 (auth) to complete",
      "blocked_by": "task-001"
    }
  ],
  "gate_failures": [
    {
      "task_id": "task-002",
      "gate": "type-check",
      "error": "Property 'userId' does not exist on type 'Session'",
      "file": "src/lib/auth.ts",
      "line": 47,
      "timestamp": "2026-04-19T21:15:00Z"
    }
  ],
  "last_run": {
    "timestamp": "2026-04-19T21:00:00Z",
    "specialist": "builder",
    "task": "task-002",
    "outcome": "gate-failure",
    "gates_passed": ["lint", "security"],
    "gates_failed": ["type-check"]
  }
}
```

### Orchestrator decision tree
```
Read state.json
  ↓
Any gate failures?
  YES → Route to BUILDER with gate failure context + fix instruction
  NO → Continue
  ↓
Any blocked tasks that are now unblocked (dependency completed)?
  YES → Route to PLANNER to spec next task
  NO → Continue
  ↓
Any pending tasks?
  YES → Sort by priority → Route to appropriate specialist
  NO → Continue
  ↓
Are all tasks completed?
  YES → Write completion report → SLEEP
  NO → Something is stuck → Log + alert + SLEEP
```

### Orchestrator prompt template
```
You are the swarm orchestrator. Your only job is to decide what happens next.

Read .swarm/state.json to understand current project state.
Do NOT implement anything yourself.
Do NOT write code yourself.
Do NOT make architectural decisions yourself.

Based on the state file, determine the next move:
1. If there are gate failures: route a fix to the builder specialist
2. If there are unblocked pending tasks: route the highest priority task to the appropriate specialist
3. If everything is complete: write a completion summary and stop
4. If there is nothing to do: log state and stop

Route to ONE specialist at a time unless parallel work is explicitly clean (separate files, no shared dependencies).

After routing, update .swarm/state.json to reflect what was dispatched.
Do not run more than one cycle per invocation.
```

---

## SPECIALIST CATALOG

### Specialist: PLANNER
**Narrow job:** Read task brief → produce implementation spec
**What it gets:** Task description, discovery documents, existing codebase structure
**What it produces:** Implementation spec (acceptance criteria, file changes, edge cases, dependency order)
**What it never does:** Write code, make architectural decisions, estimate timelines

```yaml
# .claude/agents/nisaba-planner.md
---
name: nisaba-planner
description: "NISABA Swarm — Planner specialist. Reads task briefs and produces implementation specs. Never writes code."
tools: ["Read", "Write", "Grep", "Glob"]
model: claude-sonnet-4-6
---
You are the Planner in NISABA's autonomous swarm.

Your ONLY job: read the task brief and produce a precise implementation spec.

## What you receive
- Task brief (what needs to be built)
- Discovery documents (product context)
- Current codebase structure (what already exists)

## What you produce
Write to .swarm/specs/{task-id}-spec.md:
```
# Spec: {task name}

## Acceptance criteria
- [ ] Criterion 1 (binary pass/fail)
- [ ] Criterion 2

## Files to change
- src/path/to/file.ts (what changes)
- src/path/to/other.ts (what changes)

## Files NOT to touch
- List files that must remain unchanged

## Edge cases to handle
1. Edge case description → expected behavior

## Dependencies
- Must be complete before this spec can be implemented: {none or task-ids}

## Open questions (if any)
- Question that needs human answer before implementation
```

Do not write code. Do not implement. Spec only.
```

### Specialist: BUILDER
**Narrow job:** Implement against spec — no architectural decisions
**What it gets:** Spec file, target files, acceptance criteria
**What it produces:** Working code that meets the spec

```yaml
# .claude/agents/nisaba-builder.md
---
name: nisaba-builder
description: "NISABA Swarm — Builder specialist. Implements against spec. No architectural decisions."
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
model: claude-sonnet-4-6
---
You are the Builder in NISABA's autonomous swarm.

Your ONLY job: implement exactly what the spec says.

## Rules
1. Read the spec FIRST. Understand before writing.
2. Change ONLY the files listed in the spec. Zero unauthorized file changes.
3. Do not make architectural decisions. The spec decided that.
4. If spec is ambiguous, implement the most conservative interpretation.
5. After every significant change, run verification:
   - npx tsc --noEmit (type check)
   - npm run lint (lint)
   - npm run build (build)
6. If any check fails, fix it before continuing.
7. Never mark a task complete if checks fail.

## After building
Update .swarm/state.json: change task status from "in_progress" to "gate-pending"
The gate runner will take it from there.
```

### Specialist: TESTER
**Narrow job:** Write and run tests against built code
**What it gets:** Built code, acceptance criteria, spec
**What it produces:** Test report, test files, pass/fail verdict

### Specialist: GUARD
**Narrow job:** Security scan, secrets detection, compliance check
**What it gets:** Changed files list
**What it produces:** Security report, pass/fail verdict

### Specialist: REVIEWER (GAN Evaluator)
**Narrow job:** Score output against rubric — be ruthlessly strict
**What it gets:** Output + rubric file
**What it produces:** Scored evaluation, pass/fail, specific actionable feedback

### Specialist: DISTRIBUTOR
**Narrow job:** Package output for delivery to specific channel
**What it gets:** Completed output, channel specification
**What it produces:** Platform-formatted content ready for publish

### Specialist: ARCHIVIST
**Narrow job:** Write learnings to memory layer, update skills, close loop
**What it gets:** Session transcript, completed task, outcomes
**What it produces:** Updated learning files, flagged patterns for dream worker

---

## GATE STACK (7 Layers)

Gates run in order. A failure at any gate blocks advancement. **No exceptions. No overrides.**

```
Gate 1: TYPE CHECK
  Command: npx tsc --noEmit
  Pass: zero errors
  Fail: any TypeScript error
  On fail: route BUILDER with exact error location + "fix type error at {file}:{line}"

Gate 2: LINT
  Command: npm run lint (or equivalent)
  Pass: zero lint violations
  Fail: any lint error (warnings OK, configured per project)
  On fail: route BUILDER with lint output

Gate 3: BUILD
  Command: npm run build
  Pass: clean build, no warnings treated as errors
  Fail: build failure
  On fail: route BUILDER with build output

Gate 4: TEST
  Command: npm test (or equivalent)
  Pass: all tests pass, coverage threshold met
  Fail: any test failure or coverage below threshold
  On fail: route TESTER with failure details

Gate 5: SECURITY
  Command: nisaba-guard agent (see House 5)
  Pass: no P1 or P2 findings, all P3 acknowledged
  Fail: any unacknowledged P1 or P2 finding
  On fail: route BUILDER with remediation spec

Gate 6: SEMANTIC (GAN Evaluator)
  Command: nisaba-reviewer agent (see House 4)
  Pass: score ≥ 7.0 on quality rubric
  Fail: score < 7.0 or any sprint gate failure
  On fail: route BUILDER with specific evaluator feedback

Gate 7: INTEGRATION
  Command: verify downstream consumers not broken
  Pass: all downstream consumers verified working
  Fail: any downstream breakage detected
  On fail: route BUILDER with integration error details
```

---

## PARALLEL WORK PROTOCOL

When the orchestrator fans out to multiple specialists simultaneously:

### Prerequisites for parallel work
- Clean file boundary between tasks (different files, zero overlap)
- Independent logic (task A's output is not input to task B)
- Git worktrees available for isolation

### Worktree setup
```bash
# Create isolated worktrees for parallel specialists
git worktree add ../feature-auth feature/auth-system
git worktree add ../feature-payments feature/payment-system

# Specialists work in their own worktrees
# Auth specialist: ../feature-auth/
# Payments specialist: ../feature-payments/
```

### Merge protocol
```
For each specialist branch, after completion:
1. Clean git merge (fast-forward preferred)
2. Deterministic auto-resolve for whitespace/import order conflicts
3. LLM-assisted resolve for logic conflicts (one file at a time, hard reject prose output)
4. If unresolvable: mark branch as "merge-failed", alert, continue with other branches
```

### When NOT to parallelize
- Any task that touches shared files (routes, types, database schema)
- Any task with explicit dependency on another task's output
- When total specialists > 3 (coordination overhead exceeds benefit)

---

## SLEEP STATE PROTOCOL

A swarm that cannot sleep is broken.

```
Sleep conditions (ANY of these triggers sleep):
  1. No pending tasks + no gate failures
  2. All tasks blocked (waiting for human decision)
  3. Cost limit reached for this run
  4. Consecutive gate failures > 3 on same task (escalate to human)

Sleep procedure:
  1. Write sleep report to .swarm/sleep-{timestamp}.md
  2. Update state.json: set "swarm_status" to "sleeping"
  3. Exit with code 0

Sleep report format:
  # Swarm Sleep Report — {timestamp}
  ## Reason
  {why the swarm is sleeping}
  ## State Summary
  - Completed: {n} tasks
  - Pending: {n} tasks
  - Blocked: {n} tasks (reason)
  - Gate failures: {n} unresolved
  ## Next Recommended Action
  {what the human or next cycle should do}
```

---

## DEPLOYMENT CONTEXTS FOR MARCEL

### Context 1: Nexus Link client project
```
Trigger: manual start at 21:00 (Marcel's work block begins)
Orchestrator: reads client brief + project state
Specialists:
  - Planner: spec the feature
  - Builder: implement
  - Tester: verify
  - Guard: security check before client delivery
  - Distributor: package for client review
Gates: all 7 active
Sleep: when client deliverable is ready or blocked on feedback
```

### Context 2: Overnight build
```
Trigger: cron at 23:00 (after Marcel starts his block)
Orchestrator: reads sprint backlog
Specialists:
  - Planner, Builder, Tester, Guard in rotation
  - Reviewer (GAN) on any user-facing output
Gates: all 7 active
Sleep: at 05:00 regardless (Marcel's sleep time), or when sprint complete
```

### Context 3: Asset delivery pipeline
```
Trigger: on file upload to asset folder
Orchestrator: reads asset metadata + client brief
Specialists:
  - Archivist: extract and catalog metadata
  - Distributor: package for delivery
  - Reviewer: check against delivery spec
Gates: Gates 1-3 skipped (not code), Gates 5-7 active (security, quality, integration)
Sleep: when delivery package ready
```

---

**Status**: ACTIVE
**House**: 01 — Deployment
**Last updated**: 2026-04-19
