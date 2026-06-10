---
name: gemma-lanes-strictly-sequential
description: "Gemma lanes are STRICTLY SEQUENTIAL on Marcel's Mac — one active Gemma lane at a time. Parallel is technically possible (OLLAMA_NUM_PARALLEL batching) but catastrophically laggy: 2 concurrent 12B QAT = 461s wall-clock for two 40-token gens. Marcel felt the lag live (2026-06-09) and locked sequential. Supersedes the earlier wrong 'ollama serializes safely, fire as many as you want' verdict."
metadata:
  node_type: memory
  type: feedback
  tier: high
  scope: nexus
  trig: "gemma, ollama, parallel, concurrent, lane dispatch, sequential, OLLAMA_NUM_PARALLEL, foundry-worker-dispatch"
  refs:
    - lane-dispatch-prompt-hygiene
    - feedback-codex-powerhouse-nim-scope
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

RULE: Fire Gemma lanes STRICTLY SEQUENTIALLY — one active `gemma-local`/ollama lane at a time. Never two concurrent.

WHEN: Any time dispatching Gemma work via `/tmp/foundry-worker-dispatch.mjs gemma-local ollama` or the Originator gemma path (red-team lanes, channel research, background passes).

DO: Queue Gemma jobs and run them one after another. DeepSeek/Codex lanes CAN run alongside a Gemma lane (different backends) — the sequential constraint is Gemma-vs-Gemma only.

DONT: Do NOT set OLLAMA_NUM_PARALLEL to enable 2-up Gemma and fire two at once. It "works" (both return) but thrashes the shared GPU.

WHY: Sequential is Marcel's locked preference (2026-06-09) — he felt the lag live and chose it; simpler, no contention questions. NOTE on the evidence: the "461s for 2 concurrent" number was CONFOUNDED — it was measured while `OLLAMA_NUM_PARALLEL=4` was set, and that setting forces ollama to allocate context × parallel-slots (65536×4 = 262144), blowing VRAM → the 12B spills ~43% onto CPU → ~30× slowdown on EVERYTHING (not clean two-model GPU contention). So 461s is NOT clean proof parallel is inherently bad; sequential stands as a decision, not as a benchmark verdict. SEPARATE BUG this caused: that same poisoning later broke the Gemma EXOSKELETON (ollama_timeout_300000ms, 0 lane events) — and `launchctl unsetenv` did NOT fix it because the RUNNING server kept the bad config; only force-quitting + reopening ollama restored 100% GPU / 11s gens. Lesson: an ollama env change is not truly reverted until the server is restarted. See [[fleet-findings-must-persist-durably]] sibling lesson on incomplete reverts.

SEE [[lane-dispatch-prompt-hygiene]] · [[feedback-codex-powerhouse-nim-scope]]
