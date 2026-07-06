---
name: ref-llm-lane-aggregateerror-ipv4
description: "CORRECTED root cause: bare red 'AggregateError' from a node lane was NOT an IPv6 flap — it was zsh's command_not_found_handler routing unknown commands (esp. macOS-missing `timeout`) into the SCRAPPED kagami-cli, which died ECONNREFUSED ::1:3005 when Kagami control-plane was down. FIXED 2026-06-14."
metadata: 
  node_type: memory
  type: reference
  tier: working
  scope: all
  trig: 
    - aggregateerror
    - llm-lane broken
    - mimo aggregateerror
    - deepseek lane fails
    - ollama cloud aggregateerror
    - lane transport
    - command not found kagami
    - timeout macos
  refs: 
    - "[[ref-mimo-firing]]"
    - "[[feedback-mimo-peer-lane]]"
    - "[[ref-ollama-cloud-peer-lane]]"
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

CORRECTION (2026-06-14, Claude, evidence-backed): the prior diagnosis in this memory — "intermittent Node happy-eyeballs / IPv6 flap, force IPv4" — was WRONG. The IPv4 advice treated a symptom that was never the cause. Real root cause found by instrumenting child processes (NODE_OPTIONS=--import preload + per-pid markers):

FACTS:
- The bare red `AggregateError` (empty stdout) was printed by a CHILD process running `kagami-cli.mjs` (its `fail()` at line 164, from `main().catch` line 595) — NOT by the lane.
- VECTOR: `~/.zshrc` defined `command_not_found_handler() { .../Scripts/kagami "$*"; }` — "type any unknown command → Kagami". macOS has NO `timeout` binary, so EVERY `timeout … node llm-lane.mjs …` (a habit in tests/scripts) was an unknown command → rerouted to `kagami` → kagami-cli → `cmdReflect` → tried the Kagami control-plane at `localhost:3005` (resolves `::1` first) → when Kagami was DOWN, dual-stack `connect ECONNREFUSED ::1:3005` → Node wraps both family failures as `AggregateError` → kagami-cli red-prints the bare name.
- "Intermittent, flips 200↔error minutes apart" (the thing blamed on IPv6) = actually whether the Kagami control-plane on :3005 happened to be UP or DOWN at that moment. curl was "immune" because curl never ran the zsh handler.
- The lane itself (`llm-lane.mjs` deepseek/mimo/ollama-cloud) is CLEAN — zero Kagami dependency. PROVEN: `OLLAMA_API_KEY=$(keychain) node _SYSTEM/Scripts/llm-lane.mjs ollama-cloud "…" --model minimax-m3:cloud --no-tools` (NO `timeout` prefix) returned clean output `READY.`
- FIX APPLIED 2026-06-14: commented out the `kagami()` fn + `command_not_found_handler` in `~/.zshrc` (backup `~/.zshrc.bak-kagami-*`). Unknown commands now get zsh's normal "command not found"; NOTHING routes through the scrapped kagami-cli. Owner directive: kagami-cli is scrapped, do not route through it.

IMPLICATION: when a node lane prints a bare `AggregateError`, do NOT chase IPv6/transport/keys. CHECK: (1) was the command prefixed with `timeout` or any macOS-missing/typo'd binary? (2) is something still routing unknown-commands → kagami-cli? Use `gtimeout` (coreutils) or the Bash tool's own timeout / run_in_background — never the bare `timeout` on macOS. The `dns.setDefaultResultOrder('ipv4first')` lines added earlier are harmless but were not the fix.

SEE: `02_RESOURCES/RESEARCH/SESSION-CHECKPOINT-2026-06-14.md` · [[ref-ollama-cloud-peer-lane]] · [[ref-mimo-firing]] · [[feedback-mimo-peer-lane]]
