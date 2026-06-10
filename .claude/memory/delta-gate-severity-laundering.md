---
name: delta-gate-severity-laundering
description: A delta/Lyapunov gate keyed on a conserved scalar SUM is partition-fungible — it cannot catch an equal-magnitude swap. Needs an L∞ max-severity term. Found red-teaming the claim cortex (2026-06-03).
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig: 
    - energy gate
    - lyapunov
    - structural floor
    - severity laundering
    - convex penalty
    - delta gate
    - claim cortex
    - over-claim
  refs: 
    - "[[claim-evidence-ledger]]"
    - "[[moat-activation-4track-2026-06-03]]"
    - "[[feedback-substrate-cert-loop]]"
    - "[[feedback-gate-hardening-fail-closed]]"
  originSessionId: 7c5d16a8-012a-45bd-9e7f-e27f602edc51
---

RULE: a DELTA gate (ΔU > threshold → reject, the YURI energy `gateProposal` structural floor) measures CHANGE, not absolute level. Keyed on a single conserved scalar (e.g. `promotionLadderInversions` = a sum), it is PARTITION-FUNGIBLE: an attacker swaps one bad thing for an equally-bad thing and the field is conserved → the floor stays blind → softer offsettable terms (KL credit) fund a negative ΔU → the over-claim is ACCEPTED.

WHEN: hardening any Lyapunov/energy/delta gate over an aggregate scalar, or building a sensor that feeds one (the claim cortex `_SYSTEM/Scripts/claim-cortex.mjs` → `computeU`).

RESOLVED (2026-06-03): the catch is NOT a magnitude aggregate. Convex (depth²) kills count→depth fungibility but EVERY magnitude aggregate — sum, convex sum, even L∞ MAX — is conserved under an equal-magnitude identity swap (resolve a 5-rung honestly, smuggle a fresh 5-rung fab: max is ALSO 5→5). The only thing not conserved is per-claim IDENTITY: the launder introduces/deepens a SPECIFIC claim's over-claim. So track identity.

DO: (1) keep the CONVEX (depth²) aggregate as a soft signal (it kills count→depth and the cheap cases). (2) The REAL fix is a per-claim, NON-OFFSETTABLE IDENTITY veto: compare the inverting-claim-id→depth map before vs after; veto when any claim becomes a new-or-deeper RETRACT-verdict over-claim, independent of what happened to other claims. Calibrate to RETRACT-tier (>=2-rung / verified-tier-no-evidence); untracked (id-less) RETRACT fails closed. (3) COMPOSE it in the CORTEX LAYER (`gateClaimTransition` in claim-cortex.mjs OR's the identity veto with `gateProposal`) — the owner-gated enforcing energy core stays UNTOUCHED. No energy-core change needed. Implemented + tested (the equal-magnitude swap + Pythagorean cases now veto; genuine descents still accept).

DONT: trust ANY conserved magnitude aggregate (incl. L∞ max) to catch swaps — only identity is swap-immune. Don't edit the enforcing energy core to fix this (it's unnecessary AND owner-gated). Don't claim a convex penalty "always raises the field a severe over-claim introduces" — false under Pythagorean partition.

WHY: two adversarial red-team rounds on the claim cortex (9 + 8 = 17 fixed defects) converged on this as the one residual a magnitude aggregate cannot close. The resolution generalizes: to catch "swap one bad thing for an equally-bad thing," gate on IDENTITY, not magnitude — composed on top, never inside, the owner-gated core.

SEE: [[claim-evidence-ledger]] · [[moat-activation-4track-2026-06-03]] · [[feedback-substrate-cert-loop]]
