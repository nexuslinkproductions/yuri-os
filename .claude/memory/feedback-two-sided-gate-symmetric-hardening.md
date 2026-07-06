---
name: feedback-two-sided-gate-symmetric-hardening
description: "A two-sided/symmetric gate must apply the SAME per-item severity floor to BOTH directions — hardening one channel (per-item veto) while the other stays a pure rate re-opens severity-laundering on the unhardened side; and a staged-pipeline scorer must score the WHOLE pipeline, not just its terminal rung"
metadata:
  node_type: memory
  type: feedback
  tier: warm
  scope: claude-behavioral
  trig:
    - two-sided gate
    - symmetric gate
    - severity floor
    - rate ceiling
    - leniency strictness
    - pipeline admissibility
    - staged promotion
  refs:
    - feedback-delta-gate-severity-laundering
    - feedback-effect-size-over-binary-threshold
    - proj-energy-calibration-swarm-sheet-2026-06-13
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: When a gate evaluates TWO directions (leniency vs strictness, add vs remove, grow vs shrink), harden BOTH symmetrically. If one channel uses a per-item severity veto (any single bad item BLOCKS) and the other uses only an aggregate RATE ceiling, the rate side launders a single catastrophic item (a deep over-block hidden in a low average) — the exact severity-laundering of [[feedback-delta-gate-severity-laundering]], re-introduced on the channel you forgot. Separately: a scorer that grades only the TERMINAL rung of a staged pipeline misreports admissibility — score the whole pipeline, or label the partial verdict honestly.

WHEN: building or reviewing any symmetric/two-sided gate, dual-channel objective, or staged-promotion scorer (energy calibration two-sided objective; any add/remove or grow/shrink admission check; any "propose a candidate that the gate will accept" helper).

DO: give every direction the same two-part test — an aggregate bound (rate/CI) AND a per-item severity floor (an L∞ max term: any single item past a depth band BLOCKS regardless of rate). Fail CLOSED when a required channel can't be evaluated (empty/unloadable corpus for a direction that needs it). Key "evaluated" on records actually scored, not inputs supplied. For a pipeline scorer, run (or honestly flag) every rung — name `realDataOk` vs `pipelineAdmissible` distinctly so "the objective accepts it" is never read as "the pipeline accepts it."

DONT: harden the direction you're worried about and leave the symmetric one as a bare average. Don't let an empty corpus default a safety channel to PASS. Don't claim a candidate is admissible after scoring only the last gate when earlier gates (e.g. B.2 descent) can independently reject it.

WHY: 5-Opus refute-by-default verify of the energy two-sided objective (2026-06-13, runId wf_8ef89065-b8c) found exactly these: the leniency channel had a per-item eligibility veto but the strictness channel used a pure newFpRate ceiling → one deep over-block (candU≈50) diluted in 151 accepts passed; the strictness channel fail-OPEN on an empty accept corpus → an arbitrarily strict "reject everything" candidate passed; and the proposer scored only the real-data rung → its top candidate (beta:0.5) reported ok:true while calibrate's B.2 descent rung rejected it. Safety floors that hold on one side are not safety if the mirror side is soft.

SEE: [[feedback-delta-gate-severity-laundering]] · [[feedback-effect-size-over-binary-threshold]] · [[proj-energy-calibration-swarm-sheet-2026-06-13]]
