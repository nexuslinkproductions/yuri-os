---
name: ref-mimo-integration
description: "Xiaomi Mimo native Claude Code integration — launcher, models, key storage, architecture constraint"
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - mimo
    - xiaomi
    - claude-mimo
    - token plan
    - cheap model
  originSessionId: 6b7a7ad6-f4f8-4d4d-a4a5-3fcb86747960
---

STANDING DIRECTIVE (Marcel 2026-06-10):
Mimo is a FIRST-CLASS provider equal to Anthropic with the SAME FULL CAPABILITIES AS CLAUDE CODE — NOT an advisory/reasoning-only lane and NOT a bulk/cheap fallback. The `ai claude-mimo` launcher runs the real Claude Code binary, so a Mimo session is a complete agentic peer: full tool loop, coding, file edits, the works — identical to a main Claude session, just a different model backend. Treat dispatched Mimo work as a peer coding lane, not a bounded advisor. Always use largest context (mimo-v2.5-pro[1m], 1M tokens) and max effort; it's an efficiency multiplier.

FACTS:
- Mimo speaks the Anthropic Messages API (NOT OpenAI-compat). As of 2026-06-10 llm-lane.mjs HAS a native Anthropic adapter (toAnthropicMessages/toAnthropicTools/postMessagesAnthropicHttps, /v1/messages SSE) — so `ai llm mimo "<prompt>"` dispatches natively. Two surfaces: `ai llm mimo` (advisory lane) OR `ai claude-mimo` (dedicated isolated session).
- Token plan base URL: https://token-plan-ams.xiaomimimo.com/anthropic
- API key format: tp-xxxxx (token plan)
- Keychain service: yuri-mimo-api-key → `security add-generic-password -U -a "$USER" -s yuri-mimo-api-key -w 'tp-...'`
- Key loads in env.sh as $MIMO_API_KEY
- Launcher: `ai claude-mimo` — starts isolated Claude Code session with ANTHROPIC_BASE_URL=Mimo endpoint
- Default model: `mimo-v2.5-pro[1m]` (1M context) — ALL model slots (sonnet/opus/haiku) map here
- Effort: always max

ARCHITECTURE CONSTRAINT:
Claude Code uses ONE ANTHROPIC_BASE_URL per session. Mimo and Anthropic models cannot coexist in the same session. `ai claude-mimo` = dedicated isolated Mimo session; regular `ai claude` sessions stay on Anthropic untouched.

LANE CONSOLIDATION (2026-06-10, committed 8ca6c254 + fad88bf6, pushed):
The reasoning-lane roster is now deepseek-v4-pro, deepseek-v4-flash, mimo-v2.5-pro[1m], mimo-v2.5[1m], mimo-v2-flash. NVIDIA NIM lanes (kimi-k2.6, nemotron) were REMOVED entirely (NVIDIA_API_KEY now unused), propagated across: llm-lane.mjs (kimi adapter + postChatHttps deleted), models.json (nvidia_nim catalogue dropped), llm-compat-contract.mjs (@nvidia/@kimi gone, nvidia-preflight→mimo-preflight), llm-compat.sh, pulse-orchestrator.mjs, lane-kernel.mjs (LANE_KERNEL.mimo; ACTIVE_NIM_LANES=[], DEAD_NIM_LANES=[nemotron,kimi]), lane-session/kagami-overseer/token-ledger/yuri-originator/yuri-input-genome/rick-repl, and the circuitry graph (LANE_MIMO/LANE_MIMO_FLASH, regenerated via yuri-graph-unify). 9 test files migrated green.

ALSO REMOVED same session (owner: outdated/unused): shintai-dispatch.mjs + shintai-team.json + rick-harness-runtime.test.mjs — were wired deeper than expected (required:true source manifests in memory-kernel/control-plane, rick-repl @shintai runAdvisory import, evidence-contract required-evidence). Full scrub done, control-plane/evidence-contract tests green. Registered the 4 _SYSTEM/Scripts/math/formula-foundry* artifacts (validate was failing).

IMPLICATION: `ai claude-mimo` = a full Claude Code session (all capabilities, the primary surface); `ai llm mimo "<prompt>"` = same model as a dispatched lane. Use it as a full coding peer, not advisory-only. Main YURI sessions stay on Anthropic untouched (one ANTHROPIC_BASE_URL per session).
SEE: [[ref-llm-compat-contract]]
