# Slice 05 — Outreach

## Goal
Draft a personalized message per queued lead from its evidence object.

> **Metric this slice computes:** none — it is a craft + gate slice. But it sits *after* the U governor's enrichment check: the L3 evidence anchor it requires is the concrete form of "verified evidence" that lowers U (`11-math-models.md` §6.4). No anchor = drafting on unverified hype = exactly the drift the gate refuses. So the L3 hold rule is the operational face of the U veto at draft time.

## Inputs
- `leads/queue.json`
- `leads/enriched/<id>.json` (evidence)
- `config/templates/`

## Outputs
- `leads/drafted/<id>.json` — draft message + metadata

## Spec
1. For each queued lead, load evidence object.
2. Require L3 evidence anchor (specific_artifact + observation + improvement). No anchor → hold.
3. If an L4 delivered-value artifact exists, select the open-need / delivered template instead.
4. Fill template skeleton from evidence.
5. Run "could-go-to-anyone" self-test; fail → hold.
6. Write draft.

## Personalization tiers
A: hand-written. B: template + personalized anchor. C: not contacted.

## Done-test
Drafts pass "could-go-to-anyone" test; no draft without L3 anchor.

## THE DECISION IT DRIVES
Draft vs. hold on evidence grounds. The L3 anchor requirement is the enrichment-before-send rule (§6.4) made concrete: a lead without verified evidence is held, not drafted on hype.

## Gate
L3 evidence gate: no generic drafts.
