---
name: anime-dna-extensions
description: "Orchestrate the 5 Anime DNA superpower skills: Infinity Guard (risk), Pattern Mirror (observation), Clone Orchestrator (parallelism), Domain Core (scope), Failure Evolution (learning). Use when you need to apply any combination of the 5 powers, or when a task needs risk gates, pattern extraction, parallel agents, bounded scope, or failure analysis."
triggers:
  - "/yuri"
  - "anime dna"
  - "infinity guard"
  - "pattern mirror"
  - "clone"
  - "domain"
  - "failure evolution"
  - "sharingan"
---

# Anime DNA Extension Pack — Skill Orchestrator

This file is the **navigational hub** for the 5 Anime DNA superpower skills plus the Sharingan protocol. Each skill is a standalone file in `skills/`. Use this file to decide **which** power(s) to invoke, in **what order**, and **why**.

---

## The 5 Superpowers

| # | Power | Anime Inspiration | Trigger | Core Function |
|---|-------|-------------------|---------|---------------|
| 1 | **Non-Destructive Infinity Guard** | Limitless / Infinity (Jujutsu Kaisen) | `/yuri guard` | Risk classification, action boundary, mutation approval gate |
| 2 | **Pattern Mirror Core** | Sharingan — Copy Technique (Naruto) | `/yuri pattern-mirror` | Observe artifacts, extract patterns, detect weaknesses, rebuild |
| 3 | **Parallel Clone Orchestrator** | Shadow Clone Jutsu (Naruto) | `/yuri clone` | Budgeted multi-agent decomposition, parallel execution, synthesis |
| 4 | **Execution Domain Core** | Domain Expansion (Jujutsu Kaisen) | `/yuri domain` | Scoped task environment, policy enforcement, exit criteria |
| 5 | **Failure Evolution Loop** | Zenkai / Saiyan Power (Dragon Ball) | `/yuri zenkai` | Capture failures → root-cause analysis → regression → improve |

---

## When to Use Each Power

```
Is the task high-risk or could cause damage?
  ├─ YES → Invoke INFINITY GUARD first (/yuri guard)
  │        File: skills/non-destructive-infinity-guard/
  │
  └─ NO  → Is the task about understanding an existing artifact?
            ├─ YES → Is the artifact complex enough for parallel analysis?
            │        ├─ YES → PATTERN MIRROR + CLONE (/yuri pattern-mirror + /yuri clone)
            │        ├─ NO  → PATTERN MIRROR alone (/yuri pattern-mirror)
            │        │         File: skills/pattern-mirror-core/
            │        └─ If reverse-engineering an external artifact → SHARINGAN protocol
            │                 File: skills/sharingan/
            │
            └─ NO  → Does the task need bounded scope / constraints?
                      ├─ YES → EXECUTION DOMAIN (/yuri domain)
                      │        File: skills/execution-domain-core/
                      │
                      └─ NO  → Did something fail and you need to learn from it?
                               ├─ YES → FAILURE EVOLUTION (/yuri zenkai)
                               │        File: skills/failure-evolution-loop/
                               └─ NO  → Use CLONE for parallel multi-agent tasks
                                        File: skills/parallel-clone-orchestrator/
```

---

## Superpower Details

### 1. ∞ Non-Destructive Infinity Guard
**Anime:** Limitless / Infinity — Gojo Satoru (Jujutsu Kaisen)

**Trigger:** `/yuri guard` (aliases: `/guard`, `/ndig`)

**Core methodology:**
Always-on protective boundary between user intent, agent plans, tool calls, file operations, and core system state. Actions are intercepted, classified by risk (reversible vs. irreversible), scored, and either passed, slowed, or blocked. Every mutation requires a rollback plan.

**When to use this vs the others:**
Use first, before any other power, when the task involves file system changes, external tool calls, or any action that could cause damage. Infinity Guard is the **gate** — all other powers route high-risk operations through it.

**Full skill:** `skills/non-destructive-infinity-guard/SKILL.md`

---

### 2. 👁 Pattern Mirror Core
**Anime:** Sharingan — Copy Technique, Kakashi Hatake (Naruto)

**Trigger:** `/yuri pattern-mirror` (aliases: `/pattern-mirror`, `/pmc`)

**Core methodology:**
Observe any artifact (repo, doc, PDF, codebase, spec, workflow, memory log), decompose it into operating principles, extract patterns worth keeping, detect prerequisites and weaknesses, then reconstruct a safer, stronger, Yuri-native version without blind copying.

**When to use this vs the others:**
Use when the primary goal is **understanding an existing thing deeply** and optionally improving it. If the artifact is large or complex, combine with Clone for parallel analysis.

**Full skill:** `skills/pattern-mirror-core/SKILL.md`

---

### 3. 👥 Parallel Clone Orchestrator
**Anime:** Shadow Clone Jutsu — Naruto Uzumaki (Naruto)

**Trigger:** `/yuri clone` (aliases: `/clone`, `/pco`)

**Core methodology:**
Split complex work into specialized sub-agents with bounded budgets, clear output contracts, evidence requirements, and a merge protocol that reconciles contradictions before action. Each clone has a defined role, scope, and artifact to produce.

**When to use this vs the others:**
Use when a task has multiple independent dimensions (analyze 5 files, audit 3 systems, generate 4 options) that can be run in parallel. Never use for a trivial single-thread task.

**Full skill:** `skills/parallel-clone-orchestrator/SKILL.md`

---

### 4. ⬡ Execution Domain Core
**Anime:** Domain Expansion — various (Jujutsu Kaisen)

**Trigger:** `/yuri domain` (aliases: `/domain`, `/edc`)

**Core methodology:**
Create a bounded task environment with explicit rules, allowed tools, target files, risk limits, evidence requirements, and exit criteria before serious work begins. Everything inside the domain follows a defined policy; the domain closes when exit conditions are met.

**When to use this vs the others:**
Use when work needs a **contained sandbox** with clear scope, time budget, and completion criteria. Combine with Guard to ensure the sandbox cannot escape its bounds.

**Full skill:** `skills/execution-domain-core/SKILL.md`

---

### 5. 🔥 Failure Evolution Loop
**Anime:** Zenkai / Saiyan Power — Vegeta, Goku (Dragon Ball)

**Trigger:** `/yuri zenkai` (aliases: `/zenkai`, `/fel`)

**Core methodology:**
Capture real failures and weak outputs, classify impact, perform root-cause analysis, match against known patterns, design a regression test, create a safe improvement plan, and update memory. The system gets stronger from every failure — but only real ones, never self-induced damage.

**When to use this vs the others:**
Use after a failure, bug, regression, or user complaint. Do NOT use proactively — this power only activates on real evidence.

**Full skill:** `skills/failure-evolution-loop/SKILL.md`

---

## Combo Chains

Powers can be chained for greater effect. Here are the proven combinations:

### Combo 1: Guard + Domain = Safe Sandbox
```
/yuri guard --target <work-area> --mode audit     # Step 1: Assess risk
/yuri domain --target <work-area> --budget 100    # Step 2: Create bounded environment
# Work happens inside the domain, under guard's protection
```
**Use when:** You need to run potentially risky operations in a contained, auditable environment with rollback capability.

### Combo 2: Pattern Mirror + Clone = Parallel Analysis
```
/yuri clone --mode decompose --artifacts <list>   # Step 1: Split into clone agents
  # Each clone runs: /yuri pattern-mirror --target <subset>
/yuri clone --mode synthesize                      # Step 2: Merge findings
```
**Use when:** Analyzing multiple artifacts (files, repos, docs) in parallel, then synthesizing combined insights.

### Combo 3: Pattern Mirror + Guard = Safe Integration
```
/yuri pattern-mirror --target <source> --mode audit  # Step 1: Understand & plan
/yuri guard --target <implementation> --mode gate    # Step 2: Gate the integration
```
**Use when:** Integrating external code or patterns into the system — mirror first, then guard the injection.

### Combo 4: Domain + Clone = Managed Multi-Agent Session
```
/yuri domain --budget 200 --exit-criteria <list>   # Step 1: Scope the whole task
/yuri clone --roles <specialists> --budget 50      # Step 2: Deploy clones within domain
```
**Use when:** A complex multi-phase project needs both overall boundaries (domain) and parallel workers (clones) inside those boundaries.

### Combo 5: All 5 = Full System Audit Cycle
```
/yuri domain --scope "full audit"                  # 1. Define boundaries
/yuri guard --mode inspect                          # 2. Assess all risk
/yuri clone --mode fan-out                          # 3. Deploy parallel inspectors
  # Each clone runs: pattern-mirror + failure-evolution on their slice
/yuri clone --mode merge                            # 4. Synthesize all findings
/yuri zenkai --input <failure-report>               # 5. Evolve from discovered failures
```
**Use when:** Running a comprehensive system-wide audit, security review, or health check.

---

## Sharingan Protocol

For **reverse-engineering external artifacts** (third-party repos, tools, designs, workflows) that are NOT already Yuri OS / Yuri-native, use the **Sharingan protocol** instead of Pattern Mirror.

Sharingan adds legal gates, license classification, clean-room reconstruction, and a full 9-phase pipeline (Observe → Decompose → Audit → Abstract → Enrich → Redesign → Implement → Validate → Handoff).

**Trigger:** `/sharingan` (alias: `/sr`)

**Full skill:** `skills/sharingan/SKILL.md`

### Sharingan vs Pattern Mirror Quick Compare

| Dimension | Pattern Mirror | Sharingan |
|-----------|---------------|-----------|
| Source type | Any Yuri-compatible artifact | External / third-party / restricted-license |
| Legal gate | No | Yes — license classification required |
| Depth | 9 steps | 9 phases (extensive) |
| Output | Implementation plan | Full pipeline: audit → blueprint → diamond design |
| Use when | Internal improvement | External reverse-engineering |

---

## Command Files

Each superpower has a corresponding command file at `.claude/commands/`:

| File | Power |
|------|-------|
| `.claude/commands/yuri-guard.md` | Non-Destructive Infinity Guard |
| `.claude/commands/yuri-pattern-mirror.md` | Pattern Mirror Core |
| `.claude/commands/yuri-clone.md` | Parallel Clone Orchestrator |
| `.claude/commands/yuri-domain.md` | Execution Domain Core |
| `.claude/commands/yuri-zenkai.md` | Failure Evolution Loop |
| `.claude/commands/yuri-dna-ingest.md` | Shared ingest pipeline for all powers |

These command files provide the CLI invocation syntax and flag options for each power. The skill files (`skills/`) contain the full methodology and execution steps.

---

## Quick Reference Card

```
╔══════════════════════════════════════════════════════════╗
║               ANIME DNA — QUICK REFERENCE               ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  HIGH RISK? → /yuri guard  (Infinity Gate)               ║
║  UNDERSTAND? → /yuri pattern-mirror  (Copy Technique)    ║
║  PARALLEL?   → /yuri clone  (Shadow Clones)              ║
║  SCOPE?      → /yuri domain  (Domain Expansion)          ║
║  FAILURE?    → /yuri zenkai  (Saiyan Evolution)          ║
║  EXTERNAL?   → /sharingan  (Reverse-Engineering)         ║
║                                                          ║
║  COMBOS:                                                  ║
║  Safe execution:  guard + domain                         ║
║  Parallel audit:  pattern-mirror + clone                 ║
║  Full system:     domain + guard + clone + zenkai        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## Session Notes

### 2026-05-06 — Restored as orchestrator hub
- **Correction:** File was accidentally overwritten with Japanese aesthetic design content. Restored to proper composite orchestrator referencing the 5 actual superpower skills.
- **Status:** All 5 skills intact at `skills/`. Sharingan protocol referenced at `skills/sharingan/`. Command files at `.claude/commands/yuri-*.md`.
