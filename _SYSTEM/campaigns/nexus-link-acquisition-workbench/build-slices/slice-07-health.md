# Slice 07 — Health

## Goal
Keep lead data fresh, keep sending reputation alive, and run the **throughput controller** — the weekly backlog/queue-stability brain that tells the pipeline to push, hold, or refuse a win.

> **Metrics this slice computes:** `ρ = λ/μ` (`11-math-models.md` §3.2), the Lyapunov backlog potential `V(x)` + throttle direction (§3.4), the funnel forecast with confidence bands (§4), and the recurring Brier recompute (§1.7) from slice 06's outcome log. This is the slice that owns *backlog control and queue stability* for the whole pipeline.

## Inputs
- all `leads/**/*.json`
- `outcomes/*.json` (from slice 06)
- `config/capacity.json` — productive hours, AI-leverage, hours/job, target backlog `B★`, target revenue rate `r★`, `κ`
- `config/forecast.json` — blended `p`, `Vnet` for the forecast

## Outputs
- updated leads (demoted/dropped if stale) + `suppression.json` updates
- `metrics/throughput.json` — `λ`, `μ`, `ρ`, `B`, `V(x)`, throttle direction
- `metrics/forecast.json` — conservative / expected / aggressive revenue band
- `metrics/calibration.json` — current Brier + `n_outcomes`

## Spec — data + reputation health
1. For each lead: website resolves (200), profile active, email MX valid, no competitor redirect.
2. Dead URL → demote/drop (stale evidence = bad outreach).
3. Track bounce/complaint rates; spike → auto-pause sending + alert (hands off to `08`).
4. Maintain suppression list (append-only, never removed).

## Spec — throughput / backlog control (§3)
5. **Compute `ρ` (§3.2):** `λ` = this week's wins × avg hours/job; `μ` = productive hours × AI-leverage ÷ hours/job, **after** subtracting sales/QA/admin overhead. `ρ = λ/μ`. `ρ ≥ 1` persistently = backlog diverges → late delivery → bad review → reputation collapse. The `ρ` line is the hard "are we over-winning?" signal slice 04 reads as its admission gate.
6. **Lyapunov backlog throttle (§3.4):** with target backlog `B★`:
   ```
   V(x) = ½(B − B★)² + (κ/2)(r★ − r)²
   ```
   Throttle direction:
   - `B < B★` → tell slice 04 to **raise** proposal volume (send more).
   - `B > B★` → tell slice 04 to **cut** proposal volume and raise AI-leverage.
   - reputation `R` growing → raise price `π` (config bump).
   Each week `ΔV ≤ 0` means the throttle is working; `ΔV > 0` means you are still over-winning and must cut harder.

## Spec — forecasting with bands (§4)
7. **Funnel forecast, never a single number (§4.2, §4.4):**
   ```
   Won_mean = n·p
   SD       = √(n·p·(1−p))
   Won_band = n·p ± 1.96·SD          (95%)
   Revenue band = Won_band · Vnet
   ```
   Report **conservative / expected / aggressive** = lower-band / mean / upper-band.
8. **Survivorship correction (§4.5):** re-estimate `p` on the *surviving* lead quality, not the easy early cohort. Flag any forecast that extrapolates W1's best leads onto W2's harder pool.

## Spec — calibration loop (§1.7)
9. Pull `outcomes/*.json`; recompute Brier = `(1/N)Σ(Pᵢ−oᵢ)²`. Write to `metrics/calibration.json`. If `Brier ≥ 0.25`, raise a "scorer is theater, retune slice 03 weights" alert.

## Worked examples
**ρ (§3.2):** `λ = 30h/wk`, `μ = 30h/wk` → `ρ = 1.0` → at the edge → signal slice 04 to refuse the marginal win.
**Lyapunov throttle (§3.4):** `B★ = 25h`, `B = 40h`, κ-term zero → `V = ½(40−25)² = 112.5`. Cut sends, push leverage. Next week `B = 27h` → `V = 2.0`. `ΔV = 2.0 − 112.5 = −110.5 ≤ 0` → descending → throttle worked.
**Forecast band (§4.4):** 80 sends, `p = 0.08`, `Vnet ≈ €180` → `Won = 6.4`, `SD = 2.43`, 95% band `[1.6, 11.2]` wins → revenue `[€290, €2020]`, expected `€1150`. The **band is the message**; a single "€1150" off n=1 is a lie.

## Done-test
- Catches dead URLs + bad MX; auto-pauses on a reputation spike.
- Emits `ρ` weekly; when `ρ ≥ 0.8` the throttle direction in `metrics/throughput.json` says "cut", and `ΔV` from the worked example reproduces by hand.
- Forecast output is always a three-value band, never a single revenue number.
- Brier recompute runs off the real outcome log and flips to "retune" at `Brier ≥ 0.25`.

## THE DECISION IT DRIVES
Send more, hold, or refuse a win (backlog control); how many sends to commit (raise `n` until the band is tolerable); and whether to trust the scorer at all (Brier).

## Honest limitation (§3.5)
The smooth Lyapunov controller covers gradual over-winning. It does **not** cover a platform ban or mass-dispute — that is a discontinuous `−δ` jump in reputation the math provably does not protect against. That risk belongs to `08` as a hard gate, not a tunable here.

## Compliance
Suppression list append-only, never removed, always honored.
