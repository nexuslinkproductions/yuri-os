---
name: feedback-periodic-codex-batch-check
description: "Every now and then, dispatch Codex via the llm-compat lane for a large batch review of accumulated autonomous work (independent second opinion)"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - codex
    - batch check
    - codex review
    - second opinion
    - autonomous
    - llm compat
  refs:
    - feedback-simulate-plan-refine-before-build
    - feedback-codex-dispatch-discipline
    - feedback-observe-codex-process
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: during long autonomous runs, periodically dispatch CODEX (OpenAI gpt-5.5, the independent lane) for a LARGE BATCH review of the accumulated work — via the llm-compat lane, not a Claude agent.
WHEN: "every now and then" — at natural checkpoints (every several cycles / after a batch of changes accumulates), NOT every cycle. ~13 cycles of uncommitted work is a checkpoint.
DO: dispatch via the canonical llm-compat surface — `bash _SYSTEM/Scripts/ai auto "<task>"` or `bash _SYSTEM/Scripts/llm-compat.sh -m codex "<spec>"` (the contract surface; NOT a Claude Agent — Codex is its own platform lane). Give it the accumulated diff/files + the report as context; ask for an independent batch review (bugs, regressions, design concerns across the run). Treat its output as ADVISORY (verify findings vs live code, kill over-statements — same as the mimo/agent red-team discipline). Codex is an optional independent check, NOT a release gate.
DONT: run it every cycle (token cost); treat its findings as ground truth without local verification; use a Claude agent for Codex work (use the llm-compat lane). NOTE: the `ai`/llm-compat egress path has been returning bare `AggregateError` in this sandbox (same wrapper that breaks curl/route-plan/mimo-via-llm-lane) — if Codex-via-llm-compat is blocked here, say so honestly rather than fabricate a review.
WHY: Marcel directive 2026-06-13: "every now and then let codex do a large batch check on your work via llm compat lane." Codex is the independent second-opinion lane; periodic batch review across accumulated autonomous work catches what self-verify + mimo + sonnet red-team miss. Pairs with [[feedback-codex-dispatch-discipline]] (Codex = platform not model; optional check not gate).
SEE: [[feedback-codex-dispatch-discipline]] · [[feedback-observe-codex-process]] · [[feedback-simulate-plan-refine-before-build]]
