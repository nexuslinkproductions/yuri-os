---
name: feedback-model-self-select
description: Main lane self-selects model per task (Opus 4.8 reasons fit); no hard Opus floor
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["model", "opus", "sonnet", "haiku", "which model", "model selection", "opus only", "opus floor", "escalate"]
  refs: ["[[feedback-codex-dispatch-discipline]]", "[[feedback-simplicity-over-fanout]]"]
---

RULE  The main lane reasons about and self-selects the right model per task; there is NO hard Opus floor. Model choice is delegated to the lane's own judgment, the way Workflow picks a model per agent.

WHEN  Starting any task, or dispatching a lane/agent/subagent.

DO  Pick the model that fits the work: Sonnet (elite practice leans Sonnet-default) for collaboration, planning, tool-loops, and lightweight implementation; Opus 4.8 for heavy reasoning, architecture, refactor, long-context synthesis; Haiku / local (ollama-bridge) for cheap mechanical work. Measure tokens-to-done, not price-per-token. Let Opus 4.8 do the model reasoning — that judgment is part of its value.

DONT  Don't impose Opus on every lane as a floor. Don't reflexively reach for the biggest model out of caution.

WHY  Marcel reverted his earlier Opus-floor-all-lanes rule as a self-contradiction: forcing Opus everywhere wastes the main lane's judgment and conflicts with CLAUDE.md Model Use ("Sonnet aggressively, escalate to Opus intentionally"). Workflows already pick model per agent; the main lane should too. Supersedes the retired opus-all-lanes rule (ADR supersede-not-edit).

SEE  CLAUDE.md Model Use section - [[feedback-codex-dispatch-discipline]] - [[feedback-simplicity-over-fanout]] - elite-workflow research (Ronacher Sonnet-default/tokens-to-done vs Boris Opus-with-thinking)
