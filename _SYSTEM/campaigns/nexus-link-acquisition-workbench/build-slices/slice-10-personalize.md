# Slice 10 — Personalize

## Goal
Tune a draft to the lead's profile for maximum specificity + fit.

> **Metric this slice computes:** none — it is the final craft pass before the SEND GATE. It re-runs the leak check (slice 08's non-offsettable veto, `11-math-models.md` §6.4) so a personalization edit cannot reintroduce a leaked token. It improves the *quality* of a send, not its ranking.

## Inputs
- `leads/drafted/<id>.json`
- `leads/enriched/<id>.json` (profile block)

## Outputs
- `leads/drafted/<id>.json` — tuned draft

## Spec
1. Load draft + profile.
2. Adjust tone/formality to match their voice.
3. Strengthen anchor specificity.
4. Re-run "could-go-to-anyone" + leak checks.
5. Write tuned draft.

## Done-test
Tuned draft measurably more specific.

## Use
Final polish before SEND GATE.

## Niche note
Tone-matching is niche-agnostic; only example voices differ.
