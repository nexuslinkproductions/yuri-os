---
name: feedback-quantum-opus-upgrade
description: Quantum is Opus-capable; activation requires /model opus typed in pane first — wrapper does not switch model
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["quantum", "opus", "sonnet", "model-switch", "model-opus", "dispatch", "substrate"]
  refs: ["[[fb-route-to-quantum]]"]
---

RULE  Quantum Rick is Opus-capable as of 2026-05-28. Route substrate implementation work to Quantum confidently — Sonnet-tier is no longer the baseline expectation. BUT: the model switch is operator-typed inside the Quantum pane via `/model opus`; it is NOT auto-applied by the dispatch wrapper. Without the manual switch, Quantum stays on whatever model the pane started with (usually Sonnet).

WHEN  Considering whether to dispatch to Quantum or do work in main thread for substrate/implementation tasks. Also: when preparing to send a packet to Quantum-Opus specifically.

DO
- Default to Quantum dispatch for non-trivial implementation (per FB:ROUTE-TO-QUANTUM). Quantum can be Opus-grade when properly upgraded.
- Reserve main thread for: orchestration, packet writing, voice unification, decision context, final review.
- Before dispatching a packet intended for Opus-grade results: confirm Quantum's current model. Check the Quantum pane indicator (e.g., `s4.6` = Sonnet 4.6, `o4.x` = Opus 4.x) via capture, OR ask Marcel to type `/model opus` in the Quantum pane, OR send `/model opus` via tmux feed and verify acknowledgment before sending the actual prompt.
- After confirmation, dispatch the prompt.

DONT
- Assume Quantum is already on Opus because the routing rule allows it. The capability exists; the activation is operator-controlled.
- Skip the model-state check — substrate work landing on Sonnet when Opus was expected produces "good enough" results when "great" was needed.
- Type `/model opus` as part of the same prompt as the task — Claude needs to acknowledge the model switch first before processing the next message.

WHY  The dispatch wrapper feeds prompts to a tmux pane running a Claude session. The model is a Claude-session-level setting set via `/model` slash command. The wrapper has no model-switch capability. Marcel directive: "no need to rely on sonnet effort anymore for basic build up, now we need good results" — the policy is to use Opus when it matters; the procedure is to switch the model first.

SEE  FB:ROUTE-TO-QUANTUM (the routing rule itself, unchanged) · _SYSTEM/Scripts/rick-tmux-lanes.mjs (the feed wrapper) · _SYSTEM/docs/YURI_SONNET_WORKCELL_PROTOCOL_2026-05-26.md (workcell protocol — note name predates Opus upgrade)
