---
name: ref-kagami-cli-scrapped
description: kagami-cli reflect CLI is SCRAPPED (owner 2026-06-14) — routing removed (.zshrc handler+fn + Scripts/kagami launcher guarded); the 5 SCHEDULED kagami agents stay LIVE. Do not route anything through kagami-cli.
metadata: 
  node_type: memory
  type: reference
  tier: working
  scope: all
  trig: 
    - kagami
    - kagami-cli
    - route through kagami
    - command not found
    - scrap kagami
    - kagami launcher
    - kagami reflect
  refs: 
    - "[[ref-llm-lane-aggregateerror-ipv4]]"
    - "[[ref-ollama-cloud-peer-lane]]"
  originSessionId: b3e309f5-b1ab-4b9b-b13d-ad91a4dbf2e4
---

FACTS:
- `kagami-cli.mjs` (the reflect/facade CLI) is SCRAPPED per owner directive (2026-06-14). Do NOT route anything through it.
- Routes REMOVED this session: (1) `~/.zshrc` `command_not_found_handler` + `kagami()` function — commented out (backup `~/.zshrc.bak-kagami-*`); (2) `_SYSTEM/Scripts/kagami` launcher guarded — now `echo + exit 127`, no longer execs kagami-cli.
- The `ai` script's facade route was ALREADY gated off (`KAGAMI_FACADE_ENABLED != 1` → direct llm-lane dispatch); the env flag is set nowhere. Audited: no hook / cron / launchd / command routes to kagami-cli (only historical session-journal log refs remain).
- KEEP (NOT scrapped): the 5 SCHEDULED kagami AGENTS — overseer, session-synthesizer, heartbeat, memory-consolidator, stale-memory-scan — LIVE via launchd, separate scripts (`kagami-*.mjs`/`.sh`), never routed through the reflect launcher.
- WHY: the `command_not_found → kagami` route + macOS-missing `timeout` produced the masked red `AggregateError` that poisoned node lanes (full root cause: [[ref-llm-lane-aggregateerror-ipv4]]).

IMPLICATION: model lanes dispatch ONLY via `ai llm <lane>` / `llm-lane.mjs` (zero kagami dependency, verified). The "type any unknown command → kagami" natural-input surface is retired; if natural-language routing is wanted again, wire it to a LIVE surface, never to kagami-cli.

SEE: [[ref-llm-lane-aggregateerror-ipv4]] · [[ref-ollama-cloud-peer-lane]]
