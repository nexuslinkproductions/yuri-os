---
name: feedback-nonoffsettable-is-per-claim-not-net-delta
description: "A \"non-offsettable\" gate floor must be keyed PER-CLAIM (new-or-deeper vs that claim's own baseline), NOT a global net/aggregate delta — a net delta is offsettable by construction (resolve debt to fund a fresh fabrication, nets to zero)"
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: gate-design
  trig: 
    - non-offsettable
    - gate floor
    - delta gate
    - partition attack
    - offset attack
    - claim cortex
    - swap immune
  refs: 
    - feedback-affine-objective-enumerate-corners
    - proj-prose-claim-extractor-3b-2026-06-13
    - feedback-delta-gate-severity-laundering
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

RULE: when a gate must be "non-offsettable" (resolving/improving other items must NOT create budget for a fresh violation), key it PER-ITEM against each item's OWN baseline (new-or-deeper) — like the claim-cortex identity veto's beforeDepth. A GLOBAL net/aggregate delta (after_total − before_total > cap) is offsettable BY CONSTRUCTION: the attacker resolves N units of legitimate debt and adds N units of fresh violation, net 0, gate passes.

WHEN: designing or reviewing any conserved-quantity gate (energy ΔU floors, inversion-mass floors, severity sums, budget gates) where an adversary can both improve and degrade in the same transition.

DO: sum the penalty over items that are NEW or DEEPER vs their own prior state; id-less/untrackable items fail-closed (always counted). Pair with an evidence-kind/identity asymmetry so a magnitude swap can't pass (you can't swap a backed resolve for an unbacked fabrication without raising the per-item measure).

DONT: phrase a floor as "after-mass strictly exceeds before-mass" / "net delta > cap" and call it non-offsettable — that is a contradiction. ([[feedback-delta-gate-severity-laundering]] is the same disease at the conserved-SUM level; L∞ max + per-item baseline is the cure.)

WHY: the Wave-3 partition gate. An Opus red-team converged on "non-offsettable DELTA floor (after-mass > before-mass)"; I built it; my own repro defeated it (resolve 6 advisory debts −6, add 6 fresh fabrications +6, net 0, accept=true). Switching to per-claim new-or-deeper unsupported-mass caught it (addedMass=6) with zero false-veto. Self-verification beat the convergence — verify the FIX against the attack, not just the gap.

SEE: [[proj-prose-claim-extractor-3b-2026-06-13]] · `_SYSTEM/Scripts/claim-cortex.mjs` gateClaimTransition · [[feedback-affine-objective-enumerate-corners]] (sibling: verify the method, not just the conclusion)
