---
name: ref-claim-partition-attack-aggregate-gate
description: anchor-bound claim identity is swap+depth-safe but PARTITION-vulnerable; fix = target-keyed cross-anchor aggregate gate at K≈3 (extends delta-gate-severity-laundering)
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: claim-cortex
  trig: 
    - partition attack
    - anchor-bound
    - smuggle over-claim
    - aggregate gate
    - claim identity
    - cross-anchor
    - severity laundering
  refs: 
    - delta-gate-severity-laundering
    - proj-claim-wiring-audit-2026-06-13
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

FACTS:
- The Wave-3 claim-governance design uses anchor-bound identity (claims keyed on target+claim-type). It is swap-immune (per-id identity veto, claim-cortex.mjs:909-930) and depth-safe (L∞ floor maxLadderInversion vs cap=1, yuri-energy.mjs:700/90) — but PARTITION-VULNERABLE.
- PARTITION ATTACK (verified, /tmp/cross-anchor-aggregate-gate.mjs): split one severe over-claim into N fragments, each deltaRank=1 (sub-RETRACT, claim-cortex.mjs:646/650), all sharing the same TARGET but different claim-types (= different anchors). The per-id veto never fires (no fragment is RETRACT≥2); the L∞ cap=1 never fires (max depth=1, not >1). The aggregate (severity N) ships undetected. This is delta-gate-severity-laundering one level up: the per-claim L∞ that closed the magnitude swap is itself partition-fungible across anchors.
- MITIGATION (prototype verified): cross-anchor aggregate gate. In cortexSnapshot compute aggregateInversionByTarget[target] = Σ deltaRank over NON-RETRACT claims sharing that TARGET (key on target ALONE, not target+claim-type — else the attacker varies claim-type to spread across anchors of one target). Add a third non-offsettable veto when aggregate > budget K (K≈2-3; v5 cross-entropy optimum K≈3.07; research starting range [2,4]). Compose in the cortex layer, energy core untouched, mirroring the existing identity-veto architecture. Verified to catch the partition WITHOUT false-vetoing honest 2× parallel work or legitimately-spread claims.
- The v5 scaled optimizer (effectively-infinite space, cross-entropy + CVaR) independently CHOSE to add this gate (target-keyed, 100% confidence) and upgraded identity from pure anchor-bound to anchor+node-canonical (node-id when mappable — higher smuggle-resistance).

IMPLICATION:
- Do NOT claim anchor-bound identity is "smuggle-safe" — it is swap-safe + depth-safe only. The partition hole is open until the aggregate gate lands.
- gateClaimTransition has NO live runtime caller yet (claim-cortex.mjs:868) — both the identity veto AND any new aggregate gate are test-only until the v2 prose-claim source (3b) lands; wire the aggregate gate in the SAME change.
- A per-unit-threshold gate is always partition-fungible into floor(severity/T)+1 sub-units unless an aggregate-over-units term exists. General law, applies beyond claims.

SEE: [[delta-gate-severity-laundering]] (the magnitude-swap precursor), [[proj-claim-wiring-audit-2026-06-13]], ops plan _SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md §11-12.
