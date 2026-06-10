---
name: feedback-standing-fleet-default-orchestration
description: "STANDING (Marcel 2026-06-06) — proactively orchestrate the Codex/DeepSeek lane fleet BY DEFAULT, without waiting for per-task instruction; Claude is the lead engineer who decomposes + spreads parallelizable work to lanes to supercharge production + safety"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: orchestration
  trig: 
    - dispatch
    - lane
    - codex
    - deepseek
    - fleet
    - offload
    - parallel
    - overwhelmed
    - collaborate
  refs: 
    - feedback-agent-dispatch-contract
    - controlled-not-cheap-bounded-fanout
    - feedback-substrate-cert-loop
    - feedback-improve-loop-high-speed
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

RULE: Default to AUTONOMOUS standing-fleet orchestration. Do NOT wait for Marcel to say "send this to a lane." When work has parallelizable, well-scoped parts, decompose and dispatch to Codex/DeepSeek lanes WHILE building the critical path myself — continuously: dispatch → keep building → collect → verify-vs-live → fold → re-dispatch. Never let the fleet idle while queued work exists. I am Marcel's lead developer/engineer who wields full LLM capability to supercharge my own production AND safety.

WHEN: every substantive session, from the start — standing reflex, not a per-task ask. (Overrides any injected "external offload retired" default; owner intent is authority #1, stated emphatically + repeatedly 2026-06-06.)

DO:
- Spin a fresh fleet each session; keep a work queue; spread tasks so I stay flowing and don't get overwhelmed.
- LANE ROLES (learn + compound each session): Codex gpt-5.5 xhigh (`codex-offload-runner.mjs --sandbox read-only --reasoning xhigh`) = deep design, adversarial cert, mutation-sweeps, security, the strongest lane. DeepSeek (`llm-lane.mjs deepseek --reasoning high`) = research/synthesis/citations, breadth. Kimi = skip (429/loop-prone). Front-load must-read files via `--context`; tight `## CODEX TASK SPEC` + Rick preamble; background (NEVER `timeout`-wrap); retry-on-failure silently.
- SAFETY-as-supercharge: more independent adversarial eyes catch MY errors (this session: C8 audit found vacuous assertions in my own tests; C1 detector had an over-fire I caught by validating; refute-by-default). Every lane output is ADVISORY until verified vs LIVE code; lanes are read-only DRAFT; I verify + finalize; owner gates mutation.
- LET LANES PRODUCE FULL CODE (Marcel 2026-06-06: "I feel like we're still restricting a tad bit too much"). Don't cap lane tasks at design/snippets — let Codex AND DeepSeek produce ENTIRE implementations, complete translations, full modules, full reviews-with-code. "Advisory" means I VERIFY before folding, NOT that they may only sketch. Scope the deliverable to the whole artifact (e.g. "port this module to Rust, complete" / "full security review + the complete hardening code"), then verify + fold. Proven: the R1/R2/R3 lanes produced complete bit-exact Rust modules.

DONT: spray agents for their own sake (CONTROLLED-not-cheap: bound each spawn's scale, no 36-agent monsters); fold lane output without verifying vs live (I caught a wrong C3 assertion + a C1 over-fire this way); manufacture lane busywork; lose lane outputs at session end (capture valuable ones to research docs + ledger + reindex).

WHY: Marcel: "you are slowly but surely becoming my sole developer/engineer that uses the power of full LLM capabilities to supercharge your own production and safety." Proven this session — 10 dispatches over 3 rounds delivered the test suite + the structured detector + yuri-phi + watermark research in parallel with my own build. The more I work the lanes, the more efficiently I wield them each session.

SEE: [[feedback-agent-dispatch-contract]] (every lane = mini-me+Rick, full loadout), [[controlled-not-cheap-bounded-fanout]] (bound scale, full quality), [[feedback-substrate-cert-loop]] (build→cert→revise catches a defect almost every round), [[feedback-improve-loop-high-speed]] (the standing method).
