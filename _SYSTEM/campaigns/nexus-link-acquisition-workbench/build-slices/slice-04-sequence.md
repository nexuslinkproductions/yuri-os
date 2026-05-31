# Slice 04 — Sequence

## Goal
Turn the scored leads into a **compliance-safe, EV-ranked send queue**, and refuse to overfill it past delivery capacity.

> **Metrics this slice computes:** `EV(L)`, `EVH(L)` (`11-math-models.md` §2) for the sort order, and the weekly utilization `ρ = λ/μ` (§3.2) as an admission gate. This slice is where "who do we contact, in what order, and do we contact *anyone* this week" is decided.

## Inputs
- `leads/scored/<id>.json` (carries `p_conv` from slice 03)
- `config/economics.json` — per-channel `Vdeal` estimate (or quote), `take` rate, default effort `c(L)` hours, daily effort budget
- `config/capacity.json` — weekly productive hours, AI-leverage, hours/job (for `μ`)
- `suppression.json`

## Outputs
- `leads/queue.json` — ordered, throttle-respecting send queue, each entry tagged with `ev`, `evh`, `vnet`
- `metrics/rho.json` — this week's `λ`, `μ`, `ρ`, and the admission verdict

## Spec
1. **Hard filters first** (these gate, ranking never overrides them): drop anything on `suppression.json`; drop consent-gap leads (lawful-basis gate, see `08`); drop `no-contact` leads.
2. For each surviving lead compute economics:
   ```
   Vnet = Vdeal · (1 − take)
   EV   = p_conv · Vnet
   EVH  = EV / c(L)        (use conservative lower-band Vdeal when value is a guess, §2.4)
   ```
3. **Sort by `EVH` descending.** Fill the queue down the list until the **daily effort budget** (Σ `c(L)`) is spent.
4. **Fat-tail guard (§2.4):** never let one speculative lead consume more than X% of the day's hours, regardless of EVH.
5. **Throughput admission gate (§3.2):** compute `ρ = λ/μ` for the week (recipe below). If `ρ > ~0.8`, **throttle** — trim the queue / stop adding sends — and write the verdict to `metrics/rho.json`. The Lyapunov backlog control that decides *how hard* to throttle lives in slice 07; this slice just refuses to push the queue past the safe utilization line.
6. Enforce throttle rules: max sends/domain/day, min 14d gap per org.
7. Write queue + rho metrics.

## Worked example — EVH inverts the intuitive order (§2.3)
Three leads, one operator-hour pool:
| Lead | p_conv | Vdeal | take | Vnet | c(h) | EV | **EVH** |
|---|---|---|---|---|---|---|---|
| A (job, §1.5 lead) | 0.51 | €200 | 0.10 | €180 | 1.5 | €91.8 | **€61/h** |
| B (retainer ×3mo) | 0.20 | €2400 | 0.03 | €2328 | 6 | €465.6 | **€78/h** |
| C (inbound gig) | 0.70 | €150 | 0.20 | €120 | 1.0 | €84 | **€84/h** |

Queue order: **C > B > A.** The 20%-probability retainer (B) ranks **second** on `Vnet` size; the naive "highest probability first" (A) ranks **last**. That inversion is the whole reason this slice ranks on EVH, not on `p_conv`.

## Worked example — ρ admission (§3.2)
Week 3: wins inflow `λ = 5 jobs × 6h = 30h/wk`; effective delivery capacity `μ = 30h/wk` (50 raw hours minus sales/QA/admin). `ρ = 30/30 = 1.0` → **at the edge.** Verdict: throttle to ~0 new sends, reject the marginal 6th win, hand backlog control to slice 07. A 6th win at `ρ=1.0` tips the queue into divergence → late delivery → bad review → reputation collapse.

## Done-test
- Queue is sorted by `evh` descending and respects all throttle/suppression/lawful-basis rules.
- A planted retainer lead with low `p_conv` but large `Vnet` ranks above a cheap high-`p_conv` gig (EVH inversion proven).
- When fed `λ ≥ 0.8·μ`, the slice writes a throttle verdict and stops growing the queue.

## THE DECISION IT DRIVES
The literal sort order of today's pursue-queue **and** whether the pipeline is allowed to take on more work this week at all.

## What this slice does NOT do
- It does not compute `p_conv` (slice 03 does) and it does not compute the Lyapunov throttle gain (slice 07 does); it consumes the first and obeys the second.
