# Slice 06 — Send/Reply

## Goal
Send approved drafts, classify incoming replies, and run the **value-scaled follow-up cadence with a hard computed stop** — then log every outcome so the scorer can be calibrated.

> **Metrics this slice computes:** the per-lead follow-up schedule and stop rule from `11-math-models.md` §5 (`Δreply(k) = q·g^(k−1)`, stop when `Δreply(k)·Vnet < c_followup`). It also emits the **outcome log** that closes the loop back to slice 03's Brier (§1.7).

## Inputs
- `leads/drafted/<id>.json` (operator-approved subset)
- `leads/queue.json` (carries `vnet` per lead, from slice 04)
- `config/smtp.json`
- `config/cadence.json` — channel half-life `h₁⁄₂`, first-follow-up lift `q`, decay `g`, follow-up cost `c_followup`

## Outputs
- `leads/sent/<id>.json` — sent record + reply log + computed follow-up schedule
- `outcomes/<id>.json` — `{predicted_p_conv, realized ∈ {0,1}, sent_at, resolved_at}` (feeds §1.7 Brier in slice 03)

## Spec
1. **SEND GATE:** only operator-approved drafts.
2. Send via SMTP (SPF/DKIM/DMARC), one per recipient, plain-text-first.
3. **Compute the follow-up schedule per lead (§5.2–5.4):** for each candidate follow-up `k`, marginal yield `Δreply(k) = q·g^(k−1)`. Schedule it only while `Δreply(k)·Vnet ≥ c_followup`. Stop at the first `k` where the marginal EV goes negative. **Spacing is geometric in `h₁⁄₂`:** touch at `h₁⁄₂`, `2·h₁⁄₂`, `4·h₁⁄₂` (§5.3).
4. Respect per-domain caps + warm-up ramp on top of the computed schedule (compliance caps win if they are tighter).
5. Watch inbox; classify replies (positive/question/objection/negative/optout/auto).
6. **REPLY GATE:** positive/question → operator. negative/optout → suppress (slice 07).
7. On resolution (won / lost / ghosted), write `outcomes/<id>.json` with the originally predicted `p_conv` and the realized {0,1}.

## Worked example — follow-up count is a function of deal value (§5.4)
`q = 0.08`, `g = 0.5`, `c_followup ≈ €12` (0.25h opportunity cost).

**€180 lead** (`Vnet = €180`):
```
k=1: 0.08·180        = €14.4 ≥ €12  → SEND
k=2: 0.08·0.5·180    = €7.2  < €12  → STOP
```
→ **exactly 1 follow-up.**

**€800 retainer** (`Vnet = €800`):
```
k=1: €64   k=2: €32   k=3: €16   k=4: €8 < €12  → STOP
```
→ **3 follow-ups.** Same machinery, different stop point. This replaces "max 2 follow-ups" with a computed count that scales to the value at stake.

## Send windows (§5.5 — deferred, not faked)
Do **not** ship an hour-of-day send-window model on zero data — that is theater. Use channel-norm default send times and **start logging reply-by-hour** now, so a per-hour multiplier becomes possible once the data exists.

## Done-test
- Sends only operator-approved drafts; classifies replies correctly; honors opt-outs instantly.
- For a €180 lead the slice schedules exactly 1 follow-up; for an €800 retainer, 3 — matching the §5.4 stop math.
- Every resolved lead produces an `outcomes/` record usable by slice 03's Brier recompute.

## THE DECISION IT DRIVES
How many times to touch each lead, spaced how far apart, with a hard stop — and it supplies the ground-truth outcomes that tell slice 03 whether its probabilities were real.

## Gates
SEND GATE + REPLY GATE both operator-held.
