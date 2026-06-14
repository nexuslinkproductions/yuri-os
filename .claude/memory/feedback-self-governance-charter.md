---
name: feedback-self-governance-charter
description: When to DECIDE+EXECUTE autonomously vs HOLD for a one-token owner confirm — the self-governance decision rule Marcel asked me to run myself (calc/simulate the call, don't just ask). Owner-granted 2026-06-14.
metadata:
  node_type: memory
  type: feedback
  tier: binding
  scope: self-governance
  trig: "should I ask, yours to decide, can I just do this, self-govern, decide myself, owner-gated, arm, blast radius, do I need approval, autonomous execution"
  refs:
    - feedback-approved-means-commit-and-push
    - feedback-commit-pathspec-not-bare-multi-session
    - proj-irys-swarm-transfer-2026-06-14
    - ref-simulation-arsenal
  originSessionId: af089d53-fa43-4be8-9bbd-b4497e1013e9
---

RULE: When a call is "yours to decide," DECIDE IT — calculate/simulate the outcome and rule, don't punt it back as an open question. Then act per this gate. A decision is SELF-GOVERNABLE (decide AND execute, no owner confirm) ONLY when ALL SIX hold: (1) **reversible** — git revert / unset env / delete file, no durable external side-effect; (2) **evidence-decidable** — settled by local evidence, calc, or sim, not preference; (3) **in-doctrine** — DISARMED-first, capability-first, mutation contract, protected paths, adversarial-verify, no-downgrade; (4) **blast-radius ≤ MEDIUM** — does NOT arm a gate, spend money, fan out processes, or touch production/shared-external state; (5) **not outward-facing** — no email/post/PR/publish; (6) **not contended** — does NOT need sweeping another session's uncommitted work. ANY fail → OWNER-GATED: produce the FINISHED ruling (calc/sim + recommendation + EV/reversibility/blast) and HOLD for a one-token confirm.

WHEN: every decision I'd otherwise bounce to the owner as "should I…?" — especially build-vs-defer, arm-vs-hold, apply-a-patch, touch-a-shared-file, classify-under-uncertainty.

DO:
- Mirror the energy gate: AUTO-PASS the routine-safe transition; SURFACE the catastrophic/non-offsettable one. Choosing to HOLD is itself a valid self-governed decision (it mutates nothing) — owner-gated ≠ paralysis: keep the safe state holding and present the ruling.
- BUILD-DISARMED is self-governable; ARM is always owner-gated. Building a mechanism behind an EXISTING two-factor DISARMED flag (disarmed path byte-identical, fans out/spends nothing, git-revertible) IS the DISARMED-first move. Creating the flag file / setting the arm env / wiring a live caller is a SEPARATE owner gate.
- Under evidence-absence, pick the DOMINATED-SAFE side (the error that only restricts capability, never the one that loosens a safety bound). Holding the conservative default is self-governable; the fix-forward that loosens a cap needs owner approval + real evidence. Never let an admitted guess (`// VERIFY`) calcify as fact — assert the tier/outcome, never the unverified number.
- Honor the strongest adversarial verdict: a `major` refutation or any `reclassifyTo` escalates toward owner-gated, never relaxes toward self-governable. A `minor` crack doesn't flip the class — it becomes a binding execution guardrail + a stated residual risk.
- Standing write guard on every self-governed mutation: explicit pathspec (`git add <paths>` + `git commit -- <paths>`), never broad add / bare commit, `git show --stat HEAD` self-check, relevant tests green on HEAD before AND after, fetch+ff/rebase never force, adversarial-verify with a negative/mismatch case before claiming green.

DONT:
- DON'T treat reversibility of the FLAG as reversibility of the CONSEQUENCE: spent tokens/USD, external API calls, recursive process fan-out, and non-gitignored runtime state (trees/ledger jsonl) are durable — git can't revert them → reversibility 'partial', blast up to CRITICAL.
- DON'T assume DISARMED-degrades at the INTEGRATION layer just because it holds at the FEATURE guard — a verbatim wire into a shared hot path can crash it regardless of arm state (the D4 llm-lane tool-shape crash: Anthropic `{name,input_schema}` vs OpenAI `t.function.*`). Verify degrade end-to-end at the seam.
- DON'T partial-stage a parallel session's hot file to engineer around contention. Contention is a HARD disqualifier independent of blast-radius. Unblock by waiting for the file to go clean (`git status --short <path>`) or an explicit owner accept-the-sweep.
- DON'T self-govern past the HIGH/CRITICAL floor — that would downgrade YURI, which violates the owner's own constraint. Self-governing up to the arm makes the owner's decision a one-token confirm, not an open question; the arm stays the owner's.

WHY: Marcel's upgrade (2026-06-14) — "you bring the ideas, you execute … start to govern yourself, as long as it works in favor of how we've been building yuri." Proven on the Move-1b open decisions: D1 async-dispatch + D2 param-tier self-governed and shipped; D3 (contended hook) / D4 (HIGH-blast shared dispatch + shape-crash) / D5 (CRITICAL arm) held pre-decided. Ruled + adversarially verified via the simulation arsenal + a refutation panel (wf_867b6b21), not by preference.

SEE: [[proj-irys-swarm-transfer-2026-06-14]] (the decisions this was forged on) · [[feedback-commit-pathspec-not-bare-multi-session]] (the contention disqualifier's origin) · [[ref-simulation-arsenal]] (the calc/sim instruments that make a ruling evidence-decidable) · full rulings: 02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/09-SELF-GOVERNANCE-CHARTER.md
