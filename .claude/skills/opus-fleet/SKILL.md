---
name: opus-fleet
description: "Compatibility redirect — opus-fleet's orchestration doctrine has moved to fleet-economy. This skill is a tombstone: it carries no roster, dispatch template, or execution rule of its own. If invoked by an old trigger (/opus-fleet, opus orchestrates, spawn agents, agent fleet, glm fleet), load fleet-economy instead."
version: 3.0.0
status: deprecated
triggers:
  - /opus-fleet
  - opus orchestrates
  - spawn agents
  - fan out agents
  - agent fleet
  - glm fleet
  - zai fleet
  - glm-fleet
scope: harness
invocation: workflow
---

# opus-fleet — tombstone, redirects to `fleet-economy`

**This skill is retired as a doctrine source.** All orchestration rules, the model roster, dispatch mechanics, the MLP router, and MURE role-cast guidance now live in a single canonical skill: **`fleet-economy`**. Load that skill instead of reading further here.

## Why this file still exists

Kept only so old triggers (`/opus-fleet`, "opus orchestrates", "spawn agents", "agent fleet", "glm fleet") still resolve to something instead of a dead reference. It intentionally carries **no roster table, no dispatch template, no hard rules, and no substrate detail** — every one of those previously lived here and is now owned exclusively by `fleet-economy`, so there is exactly one place doctrine can drift out of date.

## History note (why the name "opus-fleet" is legacy)

The doctrine predates the current native dispatch model: it was written when the main session ran Sonnet with Haiku sub-agents via the Claude `Agent` tool, and cloud fan-out went through separate `glm-fleet.mjs` / `ollama-fleet.mjs` scripts. Current state: dispatch is native **OMP `task` tool** (parent-orchestrator-only) routed through the provider-route registry — Sol (`openai/gpt-5.6-sol`) and Opus (`anthropic/claude-opus-4-8`, canary-proven) are both historical orchestrator seats; the registry `roleTopology.orchestrator.owner` is the live source of truth, not this doc. Haiku 4.5 is owner-retired. None of that is re-documented here — see `fleet-economy` for the live doctrine.

## Redirect

→ **`.claude/skills/fleet-economy/SKILL.md`**
