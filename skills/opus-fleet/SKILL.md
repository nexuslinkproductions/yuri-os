---
name: opus-fleet
description: "Standing operating model — Opus orchestrates while spawned Sonnet and Haiku Agents do the work in three lanes (Research, Code-generation, Testing), ALWAYS at max reasoning, then Opus reviews, corrects, and finalizes. Ships copy-paste dispatch templates + model routing (Sonnet=judgment, Haiku=mechanical) + Agent-not-Workflow discipline. Use to start or run this model on any non-trivial build, research, multi-file edit, audit, refactor, or fan-out task."
invocation: user
version: 1.0.0
status: active
triggers:
  - /opus-fleet
  - opus orchestrates
  - spawn agents
  - fan out agents
  - three lane execution
  - research code testing lanes
  - max reasoning agents
  - agent fleet
---

# opus-fleet — Opus orchestrates, Sonnet/Haiku agents execute

The default way to run any non-trivial task. The main **Opus** session never grinds parallelizable work itself — it **orchestrates**: decompose → dispatch a fleet of **Sonnet + Haiku Agents** (always max reasoning) across three lanes → **review and correct every result** → finalize. Greater quality, and cheaper — Sonnet bills a separate weekly pool, so the fan-out barely touches the Opus quota.

Canonical rule: [`.claude/memory/feedback-opus-orchestrates-sonnet-haiku-agents.md`](../../.claude/memory/feedback-opus-orchestrates-sonnet-haiku-agents.md). This skill is the **quick-start + discipline** for it.

## When this fires

Every substantial task — build, research, multi-file edit, audit, verification, refactor. Skip only trivial single reads and pure conversation. Self-size the fleet to the task; never max-deploy by reflex.

## The model at a glance

```
                 ┌───────────────────────────┐
                 │   OPUS  (this session)     │
                 │  decompose · judge · plan  │
                 │  synthesize · review · ship│
                 └───────────────────────────┘
                  ↑            ↑            ↑
        ┌─────────┘            │            └─────────┐
  ┌───────────┐         ┌─────────────┐         ┌───────────┐
  │ RESEARCH  │         │  CODE-GEN   │         │  TESTING  │
  │ scan code │         │ new files,  │         │ scripts,  │
  │ docs, APIs│         │ patches,    │         │ browser,  │
  │           │         │ refactors   │         │ logs      │
  └───────────┘         └─────────────┘         └───────────┘
        Sonnet + Haiku Agents — ALWAYS at MAX reasoning
```

## Quick start — copy-paste dispatch

Run independent lanes **in parallel** (multiple `Agent` calls in one message). Every prompt is self-contained and ends with the max-reasoning directive.

```
Agent(
  description: "<3-5 word label>",
  subagent_type: "Explore"   // read-only research; or "general-purpose" for edits/bash
  model: "sonnet",           // sonnet = judgment/code-gen; haiku = read/scan/mechanical
  prompt: `Use MAXIMUM reasoning depth — be exhaustive and rigorous.
           <ROLE>: <Research | Code-generation | Testing> lane for an Opus-orchestrated task in <repo>.
           CONTEXT (self-contained — you lack the conversation): <what changed / state>.
           TASK: <exact, bounded>.
           DO NOT: touch protected paths; commit; rewrite dated history.
           RETURN: <exact format — table / verdict / diff>.`
)
```

## Model routing

| Lane | Default model | Use when |
|------|---------------|----------|
| Research (classify, judge, prior-art) | **sonnet** | needs judgment over what it finds |
| Research (census, grep-survey, read-dump) | **haiku** | mechanical breadth, go heavy |
| Code-generation (patches, new files, refactors) | **sonnet** | correctness matters |
| Testing (run scripts, parse logs, verify) | **haiku** | mechanical execution + report |

`Explore` = read-only (can't edit) — safest for research. `general-purpose` = full tools — for edits/bash. Never spawn an Agent to read one known file (do it inline).

## The orchestrator loop (Opus keeps these)

1. **Decompose** into independent lanes; identify what genuinely parallelizes.
2. **Dispatch** parallel Agents (one message, multiple calls), each self-contained, each at max reasoning.
3. **Review + correct** — first-run agent output is a hypothesis. Verify every load-bearing claim against local evidence; override what's wrong.
4. **Finalize** — Opus only: scoped-pathspec commit, push, irreversible/outward calls, protected-path discipline. Agents never finalize.

## Hard rules (failure-anchored)

- **Agent, never Workflow.** Workflow `agent()` bills the main/Opus quota; the `Agent` tool with `model:"sonnet"` bills the separate Sonnet pool. <!-- @anchor: v1 | failure: FB:WORKFLOW-BILLS-MAIN-QUOTA-NOT-SONNET | regression: .claude/memory/feedback-no-workflow-tool-use-agent-only.md -->
- **Always max reasoning.** The Agent tool has no effort param, so keep the orchestrator at max effort (agents inherit) AND pin `Use MAXIMUM reasoning depth` as the first line of every agent prompt. <!-- @anchor: v1 | failure: FB:OPUS-ORCHESTRATES-SONNET-HAIKU-AGENTS | regression: .claude/memory/feedback-opus-orchestrates-sonnet-haiku-agents.md -->
- **Verify every agent result.** A Haiku testing lane (2026-06-22) couldn't run its check, *guessed from reading code*, and reported the guard would BLOCK existing `.claude` files — direct evidence showed WARN. Override agent guesses with local runs. <!-- @anchor: v1 | failure: opus-fleet-haiku-warn-block-misguess-2026-06-22 | regression: SKILL.md self-test (verify agent claim before trusting) -->
- **Agents earn their keep.** Same session, a Sonnet research lane found a real ENOENT (`yuri-supercharge-gate.mjs` pointing at a deleted test) that the solo pass missed — the fan-out is not theater. <!-- @anchor: v1 | failure: none | regression: none -->
- **Self-contained prompts.** Agents lack the conversation; an underspecified prompt returns confident garbage. Always include state + constraints + return format.

## Anti-rationalization table

| Excuse | Reality |
|--------|---------|
| "This is small, I'll just do it solo." | Then it's trivial → fine. But "multi-file / multi-step / needs a survey" is exactly the fan-out case; solo is slower and misses things (the ENOENT above). |
| "Workflow is right here and easier." | Workflow drains the Opus quota and is banned here. `Agent(model:"sonnet")` is the only fan-out path. |
| "The agent said it passed, ship it." | Agent output is a hypothesis. The Haiku lane *guessed wrong* this session. Verify against a local run before trusting. |
| "Max reasoning costs too much." | Sonnet bills a separate weekly pool. The cost concern is inverted — fan out liberally. |
| "I'll skip the context, the agent will figure it out." | It can't — it has no conversation history. Underspecified → confident garbage. Self-contained prompt every time. |

## Optional — loop until done

For unknown-size discovery, wrap rounds with the convergence governor `_SYSTEM/Scripts/swarm-convergence.mjs` (obligation floor + critical-signal block + adversarial "what's missing" pass + damping). DISARMED by default (`YURI_SWARM_CONVERGENCE=1`). Use when one fan-out round isn't provably complete.

## Session Notes

- **2026-06-22 (v1.0.0, created):** Built via the model itself — Sonnet research lane (overlap audit + discoverability mechanics: byte-0 frontmatter, `skill-recall` ranks `description` not `triggers`, `skill-sync --sync` publishes `skills/`→`.claude/skills/`), Opus synthesized + registered, Haiku testing lane verified discoverability. Corrections caught this session: Haiku WARN/BLOCK misguess (→ verify-agent-output rule), research found an ENOENT solo missed. Tools: Agent (Explore/sonnet, general-purpose/haiku), Write, Edit, Bash, skill-sync, skill-recall. Errors: none on build. Registered in `skills/domain-index.json` → `01-agent-assembly`; alias `commands/opus-fleet.md`.
