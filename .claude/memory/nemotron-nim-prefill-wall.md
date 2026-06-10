---
name: nemotron-nim-prefill-wall
description: "NVIDIA free-NIM ~40s no-output gateway wall kills the 550b-ultra; nemotron lane now serves 120b-super via raw_https streaming; dispatch lean (tool-read, not big --context)"
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - nemotron
    - nvidia
    - nim
    - lane timeout
    - ETIMEDOUT
    - prefill
    - raw_https
  refs: 
    - lane-timeout-ghost-lesson
    - kimi-nim-toolcall-adapter
  originSessionId: 181862b0-0556-4bc5-aac9-41ba2f9250b1
---

FACTS: NVIDIA's FREE build endpoint (integrate.api.nvidia.com) closes any connection that has produced NO output by ~40s — a server-side gateway timeout, NOT ours (proven by removing every client-side timeout: shell→AbortController→undici-headers→socket, and a bare zero-dependency node:https probe with setTimeout(0) STILL ETIMEDOUTs at ~40s). · nemotron-3-ultra-550b can't emit a first token within that wall under load (slow prefill of a >~50KB body; also throttles after a request burst). It DID respond early (PONG at 20-37s) then degraded — intermittent/load-dependent. · RESOLUTION (owner-approved 2026-06-05): the `nemotron` lane now serves `nemotron-3-super-120b-a12b` (3s PONG on a small body), via a new `raw_https` streaming node:https transport in llm-lane.mjs (postChatHttps, SSE, zero timeout, its own connection — deepseek/kimi keep their fetch path untouched). Lane key renamed (old id kept as a back-compat ALIAS). · Even the 120b hits the wall on big prompts, so keep dispatch LEAN: tool-read files, NOT big `--context` front-loads. · nemotron's NIM tool-call format parses cleanly with no adapter (unlike kimi).
IMPLICATION: do NOT re-diagnose this as a YURI bug or a removable timeout — it's NVIDIA's gateway × model prefill time. A reliable big-context NIM reasoning lane needs a paid/dedicated endpoint or a smaller model. SEE [[lane-timeout-ghost-lesson]] · [[kimi-nim-toolcall-adapter]] · LANE-MANUAL.md §nemotron.
