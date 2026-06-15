---
name: feedback-deepseek-lanes-cheap-strong
description: "Marcel directive 2026-06-10: DeepSeek lanes are piss-cheap and benchmark-strong (matching Opus 4.7 / gpt-5.5 in many aspects) — deploy a good few liberally for parallel breadth; they cost nothing against the Claude session limit."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - deepseek
    - lane economics
    - fleet dispatch
    - token budget
    - second opinion
  refs: 
    - "[[feedback-standing-fleet-default-orchestration]]"
    - "[[feedback-model-self-select]]"
  originSessionId: 2413b3a1-0ba9-4c70-989b-14c1ca19aa72
---

RULE: DeepSeek lanes (`./_SYSTEM/Scripts/ai llm deepseek`) are cheap + strong — send out a good few by default for parallel breadth work.
WHEN: any audit/review/research wave with parallelizable, self-contained subtasks; whenever Claude-session token budget is under pressure.
DO: ground each lane with shell-injected file content (`$(cat …)` in the prompt — zero main-context cost); write outputs to `_SYSTEM/lane-output/`; cap output lines; treat results as advisory-until-verified (house law unchanged).
DONT: dispatch DeepSeek for work needing live repo tool-loops (prompt-only lane); don't skip the verification pass just because benchmarks are good.
WHY: matches Opus 4.7/gpt-5.5 on many benchmarks at a fraction of the cost; the Claude session limit is the scarce resource — external lanes don't draw from it.
SEE: fleet shape in the math/wave-2 cleanup: Sonnet-max majority, select Opus xhigh, DeepSeek/Codex breadth ([[math-base-audit-2026-06-10]]).
