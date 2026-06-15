---
name: feedback-peers-means-nano-swarm
description: "Marcel's terms peers / llm-compat / lanes / nano-swarm ALL mean the one nano-swarm mechanism — decode + fire the full thing without him spelling it out."
metadata: 
  node_type: memory
  type: feedback
  tier: 1
  scope: interpreting operator dispatch language
  trig: "any operator message saying peers, llm-compat, lanes, the lanes, nano swarm(s), spawn a lane, let the peers, fan out, or similar"
  refs: 
    - feedback-nano-swarm-orchestration
    - feedback-all-dispatch-through-llm-compat
    - ref-ollama-cloud-peer-lane
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: When Marcel says ANY of "peers", "llm-compat", "lanes", "the lanes", "nano swarm(s)", "spawn a lane", "let the peers (do it)", "fan out", or anything in that family, he means EXACTLY ONE thing — the YURI nano-swarm mechanism. Decode it to that and fire the FULL mechanism; never make him spell out the invocation to get it to fire properly.

WHEN: any operator message referencing peers / lanes / llm-compat / nano-swarm in ANY phrasing.

THE MECHANISM (what "fires properly" means, in full):
- Dispatch = `_SYSTEM/Scripts/ai llm ollama-cloud --model <X>:cloud` cross-family lanes, ROUTED THROUGH llm-lane.mjs / llm-compat (the "all dispatch through llm-compat" contract — never raw mimo.mjs / bare codex / Anthropic Workflow-Agent fan-out, which are a different, billed surface).
- Full YURI harness on each lane: the spine preamble, evaluateToolCall safety core, gated read/write/exec tool loop, coreOnDispatch energy trace + coreOnResult advisory pulse.
- 6-model roster, peers EQUAL to me: nemotron-3-ultra, glm-5.1, minimax-m3, kimi-k2.7-code, deepseek-v4-pro, deepseek-v4-flash (all `:cloud`).
- Self-size lane count to task × budget (owner-calibrated, not max-deploy).

DO: on any such phrasing, immediately plan + fire the nano-swarm; self-size; verify every lane claim locally; serialize same-file lanes; for test/integration (the plan-stop task-class) route through the artifact-gated design→execute dispatch (`nano-dispatch-gated.mjs`).

DONT: don't ask him to re-specify the mechanism; don't treat "peers/lanes" as vague or as a generic word; don't substitute Anthropic Agent/Workflow fan-out for the ollama-cloud peers.

WHY: Marcel 2026-06-15 — "when i say '/peers/llm-compat/lanes/nano swarm' or anything in that sense i always mean that exact mechanism … its tiring and difficult always having to mention it correctly so the entire mechanism fires properly." Standing vocabulary binding; removes the per-message specification tax.

SEE: [[feedback-nano-swarm-orchestration]] (mechanics + the plan-stop fix); [[feedback-all-dispatch-through-llm-compat]]; [[ref-ollama-cloud-peer-lane]]; mechanism `_SYSTEM/Scripts/nano-dispatch-gated.mjs`.
