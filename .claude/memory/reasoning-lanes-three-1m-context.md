---
name: reasoning-lanes-three-1m-context
description: "The 3 (and only 3) YURI reasoning lanes — nemotron-3-ultra, deepseek, kimi — all 1M CONTEXT window; the throttle is the OUTPUT max_tokens cap, a separate knob. Do not conflate."
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - offload
    - reasoning lane
    - deepseek
    - nemotron
    - kimi
    - context window
    - max_tokens
    - output budget
    - empty output
  refs: 
    - nemotron-3-ultra-lane-live
    - feedback_codex_powerhouse_nim_scope
  originSessionId: 489e4b10-fbd1-4f6d-bc4c-b39a1cc2ad6f
---

FACTS:
- The system uses EXACTLY THREE reasoning lanes (owner-confirmed 2026-06-05): nemotron-3-ultra (`nvidia/nemotron-3-ultra-550b-a55b`, pinned in nemotron-dispatch.mjs:38), deepseek (`deepseek-v4-pro`, endpoint api.deepseek.com/v1), kimi (`kimi-k2.6`). The ~50-lane list in offload-runner.mjs (laneNames ~1696) is DEAD LEGACY.
- ALL THREE have a 1,000,000-token CONTEXT WINDOW (input capacity). Input is NOT the constraint — full-spectrum loadouts are fine. models.json today: kimi-k2.6 has context_window=1000000; deepseek + nemotron are MISSING it.
- CONTEXT WINDOW (input) ≠ OUTPUT max_tokens. They are SEPARATE knobs. Stop conflating them (I did, repeatedly, 2026-06-05).
- The real throttle is the OUTPUT cap (max_tokens), was 32768 (offload-runner maxTokenByDepth ~1363). deepseek-v4-pro counts reasoning_tokens AGAINST max_tokens, so at a low output cap, MAX reasoning on a heavy prompt drains the whole budget → finish_reason='length', content='' (empty). DeepSeek API live-verified accepting output up to 131072. Nemotron/Kimi output ceilings = verify before setting.

IMPLICATION: when a reasoning lane returns empty on a heavy prompt at max reasoning, it is OUTPUT-budget exhaustion, NOT context overflow — raise max_tokens, do not touch context. When equipping a lane with a big loadout, the 1M context easily holds it. Codex/gpt-5.5 is a SEPARATE collaborator lane, not part of this offload set.

SEE: [[nemotron-3-ultra-lane-live]] · [[feedback_codex_powerhouse_nim_scope]] (NIM scope) · the offload consolidation (silent-fail exit-0, kagami-boot AggregateError noise, 3-layer dispatch tangle — under rework 2026-06-05).
