---
name: cheap-tier-recon-dispatch
description: "When dispatching cheap recon / spec-drafting work in a MURE workflow, fan across canary-proven cheap-tier routes by sub-task rather than running it inline in Sol. Trigger: any R0 read-only recon or R1 spec drafting that can be split across cheap-frontier models."
---

# Cheap-Tier Recon Dispatch — MURE Roster Rule

Owner directive (Marcel, propagated via Griffin fleet message 2026-07-16 msg-8ae7c9b0):
when cheap recon or spec drafting is part of a MURE workflow, fan across the canary-proven
cheap-tier roster — do NOT run it inline in Sol. Match model to sub-task.

## Canary-proven cheap routes

| Route | Backend | Sub-task fit |
|---|---|---|
| deepseek-flash | ollama-cloud | scan / extract / classify (R0) |
| mimo (opencode-go/mimo-v2.5) | opencode | scan / extract / classify (R0); supports R1 with a config flip |
| composer-2.5 | cursor | code + spec drafting (R1) |
| gemini-3.5-flash | cursor | code + spec drafting (R1); broader scope fallback |
| kimi-k2.7 | ollama-cloud | code + spec drafting (R1) |
| nemotron-3 | ollama-cloud | code + spec drafting (R1); second-opinion lane |

## Fail-closed carve-outs

- **deepseek DIRECT** → fail-closed. Use ollama-cloud ONLY. Direct request shape not currently
  canary-proven.
- Any route not on the canary-proven list → fail-closed (Terra / Luna / Sol also fail-closed per
  OMP default; Cline provider unavailable).

## Sub-task routing

- **R0 read-only** (scan / extract / classify / evidence-gathering): deepseek-flash or mimo —
  in parallel, fanned out by independent slice.
- **R1 spec / code drafting**: composer / kimi / nemotron — parallel drafts of independent slices.
- **R2+ verification or architecture**: escalate to the heavy frontier (Opus / Sonnet thinking),
  not Sol-inline.

## Hard rules

1. R0 recon MUST be fanned — never inline in Sol unless it's the trivial one-shot (single file,
   ≤50 lines, no multi-stage bash, per fleet-economy Iron Rule 5).
2. R0 may also be R0 + evidence (cheap produces only R0 + evidence, never R1+ semantic — promote
   the producer, not the cheap lane).
3. Sub-task slices dispatched with the cheapest tier that fits — never escalate to a heavier tier
   when a cheaper one canary-proven for the slice.
4. All fan-out respects the OMP dispatch rule for the current session (see provider route
   eligibility in OMP RULES).

## Operator protocol

Before dispatching recon:

1. Slice the work into independent R0 tasks (scan / extract / classify / code-draft).
2. For each slice, pick the canary-proven route from the table above.
3. Confirm depth (R0 vs R1 vs R2+) matches the lane's allowed tier.
4. Dispatch in parallel via `task` tool; collect results; verify locally before integrating.

## Provenance

- Origin: Griffin fleet message (worker-term-mrnswa2u-k) via Marcel directive, 2026-07-16.
- One known violation this session: the gap-closure spec was produced inline in Sol instead of
  fanned to deepseek-flash (R0 scan/extract) + composer (R1 spec drafting). Next dispatch on
  this thread MUST route per the table.
