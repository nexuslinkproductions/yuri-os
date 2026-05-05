# AGENT BLUEPRINTS — Operational Reference Card
*Canonical summary of orchestration, routing, quality, learning, cost, resilience, and handoff rules distilled from legacy NABU/NISABA operational documents.*

---

## #1 Orchestration Pattern

Every deployment follows the swarm shape: **Trigger → Orchestrator → Specialists → Gates → Output/Sleep**. The Trigger wakes the system (cron, webhook, or condition-driven). The Orchestrator reads state fresh every cycle, never relying on prior-cycle memory, and routes work to one or more Specialists — fanning out only when tasks have clean boundaries and separate worktrees. Specialists are narrow by design (Planner, Builder, Designer, Tester, Guard, Reviewer, Distributor, Archivist). Gates block, not advise — a gate that only warns is decoration. The system must have a sleep state; a system that cannot stop is broken. External proof always beats agent self-report.

## #2 Routing Decision Tree

Route tasks by type, complexity, and stakes: **one-off answers** (<5 min) → Model Selection blueprints; **quality validation** (code review, security) → GAN Loop + Routines; **continuous automation** (daily triage, scheduled reports) → Routines + Scheduled Tasks; **autonomous delegation** (multi-phase feature builds) → Swarm + Agent Teams; **context architecture** (workflow design, memory layout) → Context Management + Context Engineering; **knowledge persistence** (rules that survive sessions) → Auto Memory + Self-Evolving Hooks; **product build** (48-hour MVP) → Idea-to-SaaS + GAN Loop for QA. For model selection: Opus for expensive-to-fail, ambiguous, or novel work (confidence ≥90%); Sonnet for well-defined, high-volume, speed-critical tasks; human override when confidence drops below 70%.

## #3 Quality Gates

Five mandatory gates before any output ships: **Type check** (TypeScript strict mode, no `any`), **Lint** (style consistency, naming conventions), **Test** (unit, integration, coverage threshold met), **Security** (SAST scan, secrets detection, dependency audit), **Manual review** (human checkpoint for creative/client-facing work). Gaps from NISABA add a sixth **Semantic gate** (GAN Evaluator scores output ≥7.0 threshold) and a seventh **Integration gate** (downstream consumers verified unbroken). All gates fail hard — no warnings, no overrides without escalation. If the same gate fails 3 times on the same issue, escalate to human.

## #4 Learning Loop

Patterns graduate through four stages: **Observe** → sessions are watched for recurring corrections (same behavior 3+ times across sessions); **Extract** → the pattern is captured as a rule candidate; **Codify** → the rule is written to the learning layer and tested on the next execution; **Promote** → after 3 successful confirmations with no failures, the rule graduates to the always-loaded context (CLAUDE.md). Rules not triggered in 30 days are marked aging; rules that contradict newer patterns are flagged for conflict resolution. A Dream Worker runs periodically (minimum 3 new sessions since last run, minimum 4 hours gap) to scan corrections, detect patterns, check for conflicts, and propose promotions.

## #5 Cost Awareness

Every task class has a baseline token cost; model selection shifts it. Opus costs 1.5–5× Sonnet and is reserved for work where error cost exceeds time cost (security audits, novel domains, complex reasoning). Sonnet handles speed-critical, well-defined, high-volume work. Monthly budgeting allocates by domain (e.g., 30% daily triage + PR automation, 24% code reviews + security, 16% creative research, 16% scheduled routines, 14% learning). Track real spending versus budget weekly; calculate ROI per blueprint as automation value divided by agent cost. If scale doubles (clients, team, agents), re-forecast: most cost explosions come from context mismanagement, not compute — aggressive context scoping and prompt caching are the first levers.

## #6 Failure Recovery

Five failure types demand detection: **Silent failure** (no output 60+ min → check cron logs, API status); **Semantic error** (output passes gates but is wrong → GAN Evaluator rubric); **Constraint drift** (agent writes outside assigned files → file system audit); **Cost explosion** (2×+ baseline spend → token usage tracking); **Memory conflict** (rules contradict each other → conflict detection scan). Recovery follows: Detect → Isolate (quarantine failing component) → Identify (find last known-good state) → Restore (rollback) → Verify → Post-mortem (document root cause + preventive measure) → Promote (preventive measure becomes new rule). New rules deploy via canary testing: 5% → 25% → 100% over 3 days; abort if success drops >10%.

## #7 Handoff Protocol

Agents transfer context through a canonical kernel (`memory.db`), not through ad-hoc messages. Every handoff logs a `context_switch` record (from_agent, to_agent, task_id, reason). No agent writes durable knowledge directly; all writes pass through kernel syscalls (`task-create`, `task-update`, `mem-log`, `handoff`). Each agent's internal session store is treated as ephemeral cache — the kernel's `memory.db` is the single source of truth. Handoffs between lanes (e.g., Cline → OPENCLAW, OPENCLAW → ENKI) follow the same contract: create task for destination agent, log context switch, destination agent reads recent memories for that task/channel, proceeds. Attribution is mandatory: every memory record carries `agent_id`, `source`, and `channel` metadata.

---

**Status**: ACTIVE
**Sources**: NABU/ (Houses 02–07), NISABA/ (Houses 01, 04, 05, 06)
**Archived**: 07_ARCHIVE/nabu-legacy/, 07_ARCHIVE/nisaba-legacy/
**Live blueprints**: NABU/01_BLUEPRINTS/
