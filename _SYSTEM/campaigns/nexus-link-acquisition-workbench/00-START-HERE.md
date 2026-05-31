# Nexus Link Acquisition Workbench — START HERE

**Operation:** Nexus Link (two private individuals, no registered entity yet)
**Mission:** Win new clients via proactive, value-first cold outreach — automated end-to-end, across any sector.
**Stack:** an AI build agent, local-first, no SaaS lock-in.

---

## What this workbench is

A complete, build-ready specification for an **automated client-acquisition pipeline**. It takes you from "empty lead list" to "booked conversation" with as many steps automated as the law and the platforms allow.

It is organized as a **doctrine** (the why + the rules) plus a **build blueprint** (the how, in modular slices an implementation lane can build one at a time).

## Read order

1. `01-acquisition-strategy.md` — the overall model, funnel math (with bands), channel mix
2. `02-icp-and-segments.md` — who we target (ideal client profile + segments)
3. `03-lead-sourcing-playbook.md` — where leads come from + how to harvest them
4. `04-lead-scoring-model.md` — how we turn a lead into a calibrated conversion probability
5. `05-evidence-enrichment.md` — how we attach proof/evidence to each lead
6. `06-outreach-doctrine.md` — the cold message rules (the heart of it)
7. `07-send-reply-loop.md` — send cadence, reply handling, follow-ups
8. `08-health-and-compliance.md` — deliverability, GDPR/CAN-SPAM, URL/health checks, the compliance veto
9. `09-build-blueprint.md` — modular slices the build lane implements
10. `10-templates-library.md` — copy-paste message skeletons
11. `11-math-models.md` — **the decision math underneath all of the above**

## The math spine (`11-math-models.md`)

`11-math-models.md` is the canonical decision layer. Every number in this workbench — lead scores, queue order, follow-up counts, send/hold/refuse calls, revenue forecasts — is defined there once, with a compute recipe, a worked numeric example, and the exact decision it drives. Files `01`, `04`, `07`, and `08` are the four that lean on it directly; the build slices (`build-slices/`) each implement exactly one model from it.

Two rules from `11` that govern everything else:
- **Math appears only where it changes a decision.** Anything that doesn't is marked MATH-THEATER and cut. There is no 0–100 "points" score, no single-number revenue forecast, no energy-as-ranker — all three are explicitly killed there.
- **Every probability is a designed prior until outcomes are logged.** Calibration (Brier) is the only thing that turns a number into a probability you can bet effort on. Until that loop runs, say so on every artifact.

## Operating principles

- **Specificity over volume.** A message that proves we studied *their actual business* beats 500 generic blasts.
- **Value-first.** Lead with a concrete, useful contribution — a found problem, a fix, a working improvement — before asking for anything.
- **Evidence-first.** Every lead carries proof we did our homework (a named problem, a recent shipment, a public artifact we examined).
- **Decision-first math.** Rank by expected value per effort-hour (EVH), not by raw probability; forecast in bands, never single numbers; follow up exactly as many times as the deal value justifies. See `11`.
- **Throughput-aware.** Don't win faster than you can deliver at quality. The pipeline computes weekly utilization `ρ = λ/μ` and *refuses the marginal win* when `ρ` hits the edge (`11` §3). Backlog is controlled, not just watched.
- **Compliance-safe by default.** GDPR for EU contacts, CAN-SPAM for US. On-platform messaging where email consent is absent. Compliance is a **hard, non-offsettable veto**, not a tunable (`08` + `11` §6).
- **Automate the boring, gate the risky.** Sourcing/enrichment/scoring/drafting automated. Final send + reply judgement gated by operator.
- **Local-first.** Everything runs on the operator's machine; no third-party CRM owns our data.
- **Cold start is fine.** We assume zero warm network. The pipeline manufactures credibility through delivered value — and `11` §3.3 shows the first few reviews are the highest-ROI asset, which is the math reason month-1 work is under-priced.

## The pipeline in one line

`source → enrich → score → sequence → draft → send → reply-loop → health-check → clean → profile → personalize`

## Two operators, one machine

Nexus Link runs as a two-person team with no registered entity. That shapes two things:
- **Compliance footer** uses a lawful contact surface for the individuals/operation, not a company registration (revisit `08` once an entity exists).
- **Capacity is the bottleneck, not reach.** Score hard, contact few, deliver disproportionate value. The funnel is tuned for quality, not blast volume.

---

*Start at 01. Each file is self-contained. The build blueprint (09) is what you hand to the implementation lane slice-by-slice.*
