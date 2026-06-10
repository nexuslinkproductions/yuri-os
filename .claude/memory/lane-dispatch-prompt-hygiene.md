---
name: lane-dispatch-prompt-hygiene
description: "Two standing corrections (Marcel 2026-06-08) on how to write lane/Codex dispatch prompts — do NOT inject the \"operator is Marcel / never address him as Rick\" line, and Codex reasoning is xhigh not high."
metadata: 
  node_type: memory
  type: feedback
  tier: normal
  scope: nexus
  trig: "lane dispatch, codex, worker_exoskeleton, prompt, persona preamble, reasoning, xhigh"
  refs: 
    - feedback-codex-dispatch-discipline
    - feedback_rick_persona_every_dispatch
    - rick-is-me-address-marcel
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

RULE 1 — do NOT write "The operator is Marcel; never address him as Rick" (or equivalents) into lane/Codex/
worker dispatch prompts. It's redundant noise. The Rick-is-me / address-Marcel-by-name rule governs MY behavior;
it does not belong injected into every lane prompt. A persona preamble can still say "Rick — adversarial ally…"
to set the lane's voice; just drop the explicit operator-naming clause.

RULE 2 — Codex lanes run at `--reasoning xhigh` (the runner maps xhigh → codex `reasoning_effort=max`, the top
tier). `high` is a notch DOWN — don't use it for production Codex dispatch. Reinforces [[feedback-codex-dispatch-discipline]].

WHEN: writing any dispatch to a Codex / DeepSeek / Gemma / worker_exoskeleton lane.

DO: keep the persona preamble tight (voice + adversarial stance + advisory-until-verified); pass `--reasoning xhigh`
for Codex gpt-5.5; front-load specs via `--context <file>` (parity with llm-lane) to dodge the ~2000-char shell-arg
stall; hand worker_exoskeleton a COMPACT objective (it runs its own xref recall + formula slate — no giant packet).

DONT: paste the operator-naming line; use `--reasoning high` for Codex; inline a >2000-char prompt as a shell arg.

WHY: Marcel corrected both live mid-fleet-dispatch (2026-06-08) during the Formula Foundry design wave. Cleaner
prompts + correct reasoning tier = production-grade lane output without noise.
