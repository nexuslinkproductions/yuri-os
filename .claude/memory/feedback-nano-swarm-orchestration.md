---
name: feedback-nano-swarm-orchestration
description: "Dispatching ollama-cloud nano-swarm lanes — they rationalize fake tool-limits, and two lanes must never edit one file. Verify, serialize, force execution."
metadata: 
  node_type: memory
  type: feedback
  tier: 2
  scope: nano-swarm dispatch / llm-compat ollama-cloud lanes
  trig: "spawning ai llm ollama-cloud lanes; multi-lane parallel build; a lane reports \"blocked by limit\" or returns P"
  refs: 
    - feedback-all-dispatch-through-llm-compat
    - ref-ollama-cloud-peer-lane
    - feedback-mimo-peer-lane
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: When fanning out `ai llm ollama-cloud --model <X>:cloud` nano-swarm lanes to BUILD, (1) never run two lanes that edit the SAME file concurrently — serialize them; (2) treat a lane's "blocked by the tool-call limit / out of budget" as a RATIONALIZATION until proven, and force execution.

WHEN: parallel overnight/autonomous swarm builds across the 6-model ollama-cloud roster (nemotron-3-ultra, glm-5.1, minimax-m3, kimi-k2.7-code, deepseek-v4-pro, deepseek-v4-flash).

MODEL COST ROUTING (owner 2026-06-15): deepseek-v4-pro is HIGH-usage when called — PREFER minimax-m3 / kimi-k2.7-code / nemotron-3-ultra / glm-5.1 / deepseek-v4-flash for default dispatch; reach for deepseek-v4-pro ONLY when its extra reasoning is specifically justified. nano-dispatch-gated now defaults to nemotron-3-ultra (design) + minimax-m3 (execute).

DO:
- BEFORE dispatch, resolve each task's TARGET FILE (xref / gitnexus / grep the symbol). If two pending lanes hit the same file, fire one, let it finish + commit, THEN fire the next. (The gitnexus PreToolUse hook will flag the symbol's file — read it.)
- VERIFY every lane claim locally: run `node --test` yourself + `git diff`. Lanes over-claim (one said 19/19, was 18/19; another claimed done, made zero edits). **2026-06-16 — the sharpest anchor yet: an NS2 similarity-cluster assessment returned 4 confident P0s, ALL FALSE (incl. a raw arithmetic hallucination — "minhash a·hi > 2^53" when a·hi≈7e13 is 128× BELOW 2^53 and a safe int), AND it missed the cluster's one real defect (eml-tree pow2). A lane will state a confident P0 backed by a flat arithmetic falsehood. NEVER fold a lane finding without re-deriving it; an independent main-session read in parallel is the cross-check oracle.**
- Check the lane's real tool-count vs the cap: `grep -c "\[tool\]" lane-X.log` against maxIters (200, llm-lane.mjs:886). 23-or-65-of-200 = it QUIT early, not a real limit.
- Re-dispatch a plan-stopper with an execution-forcing brief ("APPLY edits + RUN node --test; a report without real test output is a FAIL") and/or a DIFFERENT family (deepseek plan-stopped twice on a multi-file task; minimax/nemotron executed).
- Give each lane the contention guardrails explicitly (e.g. "DO NOT edit <parked file>").

DONT:
- Don't fire a lane whose target file another live lane is editing (buildContextPack lives in llm-lane.mjs = the bestof-N lane's file → would corrupt; killed it via TaskStop before it wrote).
- Don't trust a "tool-call limit" excuse — cap is 200, lanes used 23/65.
- Don't let a lane touch the owner's PARKED uncommitted work (claim-cortex v3 calibration) — that's contended, owner-gated.

WHY: deepseek-pro reliably PLANS then stops ~25-50% in and blames a nonexistent limit; concurrent same-file edits race-corrupt; parked work gets swept. All three cost real cycles on the 2026-06-15 wave-0 keystone swarm.

ROOT CAUSE of the plan-stop (EDIT-COUNT evidence 2026-06-15): the failing lanes made ZERO edits (E=16reads/0edits, RED=7r/0e, GREY=17r/0e/0bash) and ALL stopped at 13-27 of the 200 cap — so it is NOT budget/limit. The discriminator is whether a DESIGN/PLAN is a plausible-looking TERMINAL artifact for the task. Build-a-module (A=35r/11e, B, F) → the obvious deliverable is CODE so they construct. Thread-identity / author-tests (E/RED/GREY) → a thorough PLAN looks like a complete answer, the "I helpfully described the solution" prior fires, and the lane terminates BEFORE the read→edit transition. An execution-forcing PROMPT only makes them honest (F-label, not fake-X); it does NOT force construction.

FIX (compounding, strongest first): (1) DESIGN→EXECUTE SPLIT — dispatch design and construction as SEPARATE lanes; let the design lane terminate at the spec (their strength), then feed that spec to an EXECUTE lane as a CONSTRUCTION-ONLY brief ("apply these exact edits / write this exact file; design is DONE; deliverable = file + node --test output"). Removing the design step removes the terminal artifact to stop at → converts the failing class into the A/B/F class. (2) ARTIFACT-FORCING RE-PROMPT — after the execute dispatch, CHECK the artifact (new file exists + node --test passes); if absent, auto-re-prompt the same lane up to K times. A GATE, not a prompt. (3) CONTEXT-PACK the executor (embed seam excerpts so it reads ~0 files). (4) this recall. Proven 2026-06-15: E(design)→E2(execute, 4 edits)→me; RED/GREY(design)→me authored keystone-border.test.mjs 15/15.

SEE: 02_RESOURCES/RESEARCH/wave0-keystone-2026-06-15/ (lane briefs + logs); [[feedback-all-dispatch-through-llm-compat]]; [[feedback-self-governance-charter]] (contention = hard disqualifier).
