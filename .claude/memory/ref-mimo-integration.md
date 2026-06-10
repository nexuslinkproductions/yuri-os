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
Mimo is a FIRST-CLASS provider equal to Anthropic. Always use largest context (mimo-v2.5-pro[1m], 1M tokens) and max effort. Never treat it as a budget fallback — it's an efficiency multiplier.

FACTS:
- Mimo is an Anthropic-compatible proxy (NOT OpenAI-compat) — cannot use llm-lane.mjs
- Token plan base URL: https://token-plan-ams.xiaomimimo.com/anthropic
- API key format: tp-xxxxx (token plan)
- Keychain service: yuri-mimo-api-key → `security add-generic-password -U -a "$USER" -s yuri-mimo-api-key -w 'tp-...'`
- Key loads in env.sh as $MIMO_API_KEY
- Launcher: `ai claude-mimo` — starts isolated Claude Code session with ANTHROPIC_BASE_URL=Mimo endpoint
- Default model: `mimo-v2.5-pro[1m]` (1M context) — ALL model slots (sonnet/opus/haiku) map here
- Effort: always max

ARCHITECTURE CONSTRAINT:
Claude Code uses ONE ANTHROPIC_BASE_URL per session. Mimo and Anthropic models cannot coexist in the same session. `ai claude-mimo` = dedicated isolated Mimo session; regular `ai claude` sessions stay on Anthropic untouched.

FILES CHANGED (2026-06-10):
- ~/.config/yuri/env.sh — added MIMO_API_KEY keychain loader + MIMO_BASE_URL
- _SYSTEM/Scripts/ai — added MIMO_API_KEY to hydration loop, run_claude_mimo(), claude-mimo case + usage
- .claude/config/models.json — added "mimo" top-level section
- _SYSTEM/Scripts/llm-compat-contract.mjs — added mimo lane entry

IMPLICATION: For bulk/cheap work, open a Mimo session with `ai claude-mimo`. All main YURI sessions stay on Anthropic.
SEE: [[ref-llm-compat-contract]]
