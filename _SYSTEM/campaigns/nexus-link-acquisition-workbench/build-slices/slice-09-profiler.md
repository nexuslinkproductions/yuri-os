# Slice 09 — Profiler

## Goal
Read a lead's brand voice / personality to tune personalization.

> **Metric this slice computes:** none — it produces qualitative evidence (a voice/brand read), not a number. It does **not** emit a score; the only score in this pipeline is slice 03's calibrated `p_conv` (`11-math-models.md` §1). The profile here is timestamped enrichment that feeds slice 10 and can raise the `pain_matches_proof` feature confidence in slice 03.

## Inputs
- `leads/enriched/<id>.json`
- their public content (bio, posts, site copy)

## Outputs
- `leads/enriched/<id>.json` + `profile` block

## Spec
1. Analyze public content tone (formal/casual, playful/serious).
2. Note brand values, audience, communication style.
3. Write profile block (voice, formality, hooks-that-fit).

## Profile block
voice, formality, values, audience, hook_style.

## Done-test
Profile matches manual read of the brand.

## Use
Feeds slice 10 to tune message tone to their voice.
