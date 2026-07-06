---
name: ref-ollama-cloud-peer-lane
description: "Ollama Cloud is a first-class YURI NANO SWARM peer lane via llm-lane.mjs — how to call it, the :cloud model-id suffix, keychain key, build trio, and the set-e hydration gotcha"
metadata: 
  node_type: memory
  type: reference
  tier: working
  scope: all
  trig: 
    - ollama cloud
    - ollama-cloud lane
    - nano swarm
    - peer lane swarm
    - ollama api key
    - ollama launch claude
    - which ollama models
  refs: 
    - "[[ref-llm-lane-aggregateerror-ipv4]]"
    - "[[feedback-mimo-peer-lane]]"
    - "[[ref-mimo-firing]]"
  originSessionId: cfdc0bb4-8057-4194-979b-da6a74627733
---

FACTS:
- `ollama-cloud` is a FIRST-CLASS peer lane in `.claude/config/models.json` → `llm_compat_lanes`, dispatched through `llm-lane.mjs` (full YURI NANO SWARM loadout + read/grep/search/xref/bash/write/edit toolset + coreOnDispatch/coreOnResult governance) — equal grade to deepseek/mimo, NOT the thin `ollama-lane.mjs` path (that stays for local utility lanes).
- CALL: `ai llm ollama-cloud "<task>" --model <model>:cloud` (the `--model` flag was added to llm-lane.mjs; it's the enabler for fan-out). Cloud model IDs REQUIRE the `:cloud` suffix (e.g. `glm-5.1:cloud`) — live-verified 2026-06-14; bare names are the local-catalog form.
- KEY: macOS Keychain, service `YURI_OS_MUSUBI:OLLAMA_API_KEY`, account `$USER`. Set with `security add-generic-password -a "$USER" -s "YURI_OS_MUSUBI:OLLAMA_API_KEY" -w '<key>' -U`. Hydrated at dispatch by BOTH `ai` and `llm-compat.sh` (`.env` is NOT the store here).
- BUILD TRIO (owner-selected, research-backed, cross-family, Pro plan = 3 concurrent): `nemotron-3-ultra:cloud` (agentic/tool-use orchestrator, permissive license) · `glm-5.1:cloud` (SWE-Bench Pro 58.4 SOTA, 8h autonomous) · `minimax-m3:cloud` (II 55 top open, 1M ctx, best agentic avg). Swarm = 3 backgrounded `ai llm ollama-cloud --model <X>:cloud &` (7s wall-clock observed). Endpoint `https://ollama.com/api/chat`, allowlisted in llm-lane ALLOWED_HOSTS.
- PERSONA: llm-lane lanes wear `_SYSTEM/nano-swarm-persona.md` (NOT CLAUDE.md/persona.md — those made nodes answer "I'm Claude Sonnet"). Identity = "YURI NANO SWARM node on <backend>", never Claude. They are FULL PEER OPERATORS (not advisory/dev-only) — truth is earned by the SHARED verification system (local evidence + verified CITED online research, gates, owner approval), the same standard applied to Claude.
- GOTCHA (cost me a debug cycle): `ai` runs `set -euo pipefail` on line 3 BEFORE key hydration, so a `[ -n "$value" ] && export ...` that short-circuits (key absent) returns 1 → `set -e` kills the whole dispatch silently (exit 1, no output). Use `if [ -n "$value" ]; then export ...; fi` + `return 0`. `llm-compat.sh` dodges this only because its hydration runs before it enables `set -e`.
- AGGREGATEERROR: `dns.setDefaultResultOrder('ipv4first')` now in llm-lane.mjs (pre-existing) + mimo.mjs + ollama-adapter.mjs; the ollama-cloud cloud transport uses `https.request`+`agent:false`+`Connection:close` (the AggregateError-immune pattern), not undici fetch. Hardened across all node-lane transports — not "proven fixed" (per [[ref-llm-lane-aggregateerror-ipv4]] you can only confirm in a bad IPv6 window).

IMPLICATION: to fan a peer nano-swarm of frontier open models "wearing YURI", use `ai llm ollama-cloud --model <X>:cloud`; pick from the live catalog (`curl -s https://ollama.com/api/tags`, 42 models 2026-06-14, rotates) but qwen3.6 is ABSENT from ollama cloud. `ollama launch claude --model <X>:cloud` is ollama's OWN native Claude-Code-on-cloud-model bridge — complementary to this YURI-integrated path.

SEE: `02_RESOURCES/research/ollama-cloud-model-selection-2026-06-14.md` (model verdict + sources) · [[ref-llm-lane-aggregateerror-ipv4]] · [[feedback-mimo-peer-lane]]
</content>
