# 09 — Build Blueprint

> **Math home:** every slice that computes a number computes it from `11-math-models.md`. This blueprint binds each slice to the *exact* model it implements, so the build agent never invents a metric and never duplicates one. Read `11` before building any scored/throttled slice; the worked numeric examples there are the slice unit tests.

## How to build this

The pipeline is built as **modular slices**, each one a self-contained build task. Build in order; each slice has clear inputs, outputs, and a done-test. Slices live in `build-slices/`. Each slice is sized to be implemented and tested independently by the AI build agent.

## Architecture

```
leads/raw/        ← slice 01 writes here
leads/enriched/   ← slice 02 + 05 + 09 write here   (timestamped features, §1.3/§1.8)
leads/scored/     ← slice 03 writes here            (p_conv, §1)
leads/queue.json  ← slice 04 writes here            (EVH order + ρ gate, §2/§3.2)
leads/drafted/    ← slice 05 + 10 write here
leads/sent/       ← slice 06 writes here
outcomes/         ← slice 06 writes here            (predicted vs realized, feeds §1.7)
metrics/          ← slice 04 + 07 write here        (rho, throughput, forecast, calibration)
suppression.json  ← slice 07 owns
config/           ← seeds, weights, economics, capacity, cadence, templates
```

The **`metrics/` directory is new and load-bearing**: it is where the throughput controller (`ρ`, `V(x)`), the forecast bands, and the Brier calibration live. Those are the numbers that decide push/hold/refuse, and they must be on disk so any slice (and the operator) can read them.

## Slice map — slice ↔ metric ↔ decision

Each slice owns exactly one math job (or honestly owns *none* and says so). No slice computes another slice's metric.

| Slice | Name | Computes (model in `11`) | Decision it drives |
|-------|------|--------------------------|--------------------|
| 01 | source | — (sets `n` for the funnel, §4) | how many sends are possible; band width input |
| 02 | enrich | timestamped features `xᵢ` (§1.3) + as_of for decay (§1.8) | gives the scorer real, decaying evidence; lowers U (§6.4) |
| 03 | score | `P(reply)`, `P(conv\|reply)`, **`P(conv)`** (§1 logistic) + Brier (§1.7) | which lead is worth the next hour, and at what intensity |
| 04 | sequence | **`EV`, `EVH`** (§2) + weekly **`ρ=λ/μ`** admission gate (§3.2) | sort order of the pursue-queue; whether to send at all this week |
| 05 | outreach | — (L3 anchor = the §6.4 evidence-before-send rule) | draft vs hold on evidence grounds |
| 06 | sendreply | **follow-up count + spacing** (§5.2–5.4) + outcome log (→§1.7) | how many times to touch a lead, with a hard stop |
| 07 | health | **`ρ`, Lyapunov `V(x)` throttle** (§3.4) + **forecast bands** (§4) + Brier recompute (§1.7) | send more / hold / refuse a win; how many sends to commit; trust the scorer? |
| 08 | clean | — (binary leak veto = §6.4 non-offsettable) | send vs hard-block on credibility |
| 09 | profiler | — (qualitative evidence; no score) | tune tone; raise a feature's confidence |
| 10 | personalize | — (re-runs the §6.4 leak veto) | final quality pass before SEND GATE |

The **automatable** column from the old map still holds (01–04, 07, 08 full; 05, 09, 10 semi; 06 gated) — but the table above is the one that matters for correctness: it is the contract that each metric has exactly one home.

## Where throughput, queue-stability, and backlog control live

This is the spine of the operating cadence, and it is deliberately split across two slices so admission and control don't collide:

- **Slice 04 = the admission gate.** It computes `ρ = λ/μ` and *refuses to grow the queue* past `ρ ≈ 0.8` (§3.2). Fast loop, runs every send cycle.
- **Slice 07 = the controller.** It computes the Lyapunov backlog potential `V(x)` and the throttle *direction* (`B < B★` → push, `B > B★` → cut), and proves the throttle worked when `ΔV ≤ 0` (§3.4). Slow loop, runs weekly.

Slice 04 reads slice 07's throttle direction from `metrics/throughput.json`; slice 07 reads slice 06's outcomes. The two close a loop: outcomes → calibration + backlog state → throttle direction → admission → sends → outcomes. **Until that loop runs with real logged outcomes, every probability is a designed prior, not a measurement — slices must say so on their output (the honesty contract from `11` §0).**

## Build principles

- **Each slice = one build session.** Self-contained, testable.
- **JSON between slices.** No tight coupling; each reads/writes files.
- **Idempotent.** Re-running a slice doesn't double-process.
- **Local-first.** All state on disk, no external DB.
- **Gated where risky.** Slices 05/06 have operator gates; slice 08 + the §6.4 compliance veto in `08` are hard, non-offsettable blocks.
- **One metric, one home.** A slice computes its own metric and no other's. The slice-map table is the contract.
- **Config-driven niche.** All niche specifics live in `config/`, never hardcoded — including every weight, economics estimate, and capacity number. The math never hardcodes a campaign.

## Done-test per slice (each ties to a worked example in `11`)

- 01: pulls N real leads from a seed, writes valid JSON, deduped.
- 02: enriches with verifiable company facts; every feature carries an `as_of` timestamp.
- 03: `p_conv ∈ [0,1]` (never 0–100); reproduces the §1.5 worked logistic by hand on one lead.
- 04: queue sorted by `evh` desc; planted low-`p`/high-`Vnet` retainer outranks a cheap high-`p` gig (§2.3 inversion); writes a throttle verdict when `ρ ≥ 0.8`.
- 05: drafts pass "could-go-to-anyone"; no draft without an L3 anchor.
- 06: schedules exactly 1 follow-up on a €180 lead, 3 on an €800 retainer (§5.4); writes an outcome record per resolved lead.
- 07: emits weekly `ρ`; reproduces the §3.4 `ΔV = −110.5` throttle example; forecast is always a 3-value band, never a single number (§4.4); Brier recompute flips to "retune" at `≥ 0.25`.
- 08: blocks 100% of leaked tokens; a high-value lead with a leak is blocked identically to a worthless one.
- 09: profile matches a manual read; emits no numeric score.
- 10: tuned draft measurably more specific; leak veto re-runs clean.

## Tech choices

- Node or Python per slice (operator's choice).
- Plain JSON files for state, including `metrics/` and `outcomes/`.
- SMTP via relay lib.
- Optional: local LLM for classification/profiling.
- The math (logistic, EVH, `ρ`, Lyapunov, binomial bands, Brier) is plain arithmetic — no ML framework needed at cold start; the only "training" is recalibrating the §1.3 weights once Brier (§1.7) has ≥30 outcomes.

## Build order

`01 → 02 → 03 → 04 → 07 → 08 → 05 → 09 → 10 → 06`

Two reasons this order, both now math-backed:
- **Health + clean before outreach** so drafts are validated and the compliance veto (`08`) is live from day one.
- **Score (03) + sequence/ρ-gate (04) + controller (07) before any send** so the throughput admission gate and backlog controller exist *before* you can win work — you never want to discover `ρ ≥ 1` after you've already over-committed. The controller has to predate the wins it governs.

## Reusable core

The **slice architecture + JSON-between-slices + the slice↔metric contract + done-tests + build order** is 100% niche-agnostic. Swapping campaigns swaps the `config/` values (weights, economics, capacity, jurisdictions) and the example copy — never the math and never the slice boundaries.
