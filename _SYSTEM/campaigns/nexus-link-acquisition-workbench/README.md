# Nexus Link — Acquisition Workbench

A reusable, niche-agnostic specification for an **automated client-acquisition pipeline**. It takes Nexus Link from "empty lead list" to "booked conversation" with as many steps automated as the law and the platforms allow.

**Built for:** Nexus Link (two-person operation, no registered entity yet)
**Stack:** an AI build agent, local-first, no SaaS lock-in
**Scope:** global, all sectors, niche-agnostic

## Quick start

1. Read `00-START-HERE.md`
2. Work through `01`–`10` in order
3. Hand `09-build-blueprint.md` + `build-slices/` to the implementation lane, one slice at a time

## Structure

| File | Purpose |
|------|---------|
| 00-START-HERE | orientation |
| 01-acquisition-strategy | model + funnel math (with bands) + channel mix |
| 02-icp-and-segments | who we target + value-first segmentation |
| 03-lead-sourcing-playbook | where leads come from + how to harvest |
| 04-lead-scoring-model | lead → calibrated conversion probability + EVH ranking |
| 05-evidence-enrichment | attach proof we did our homework |
| 06-outreach-doctrine | the cold-message rules (the core) |
| 07-send-reply-loop | send cadence + reply handling + value-scaled follow-up stop |
| 08-health-and-compliance | deliverability + GDPR/CAN-SPAM + checks + the compliance veto |
| 09-build-blueprint | modular build slices (each bound to one model in `11`) |
| 10-templates-library | copy-paste message skeletons |
| 11-math-models | **canonical decision math** — every number, defined once, with the decision it drives |

## Design intent

This workbench is deliberately **niche-agnostic**. The pipeline architecture — source, enrich, score, sequence, draft, send, reply-loop, health-check, clean, profile, personalize — does not change when the target sector changes. Only the *signal definitions*, `config/` values (weights, economics, capacity, jurisdictions), and *example copy* are swapped per campaign. Treat every file's `Reusable core` note as the contract that survives a pivot.

The decision math lives once in `11-math-models.md` and is referenced everywhere else — there is no duplicated formula, and each build slice implements exactly one model from it (see the slice↔metric table in `09`). Math appears only where it changes a decision; everything else was cut and named as theater. Until outcomes are logged and Brier-calibrated, every probability is a designed prior — the workbench says so on its artifacts.

## Status

Active workbench. Niche: none (agnostic by design). Configure per campaign via `config/`.
