# 07 — Send / Reply Loop

> **This file is the send / hold / stop brain.** It owns three computed decisions:
> *how many times* to touch a lead (value-scaled follow-up stop, §5 of `11`), *how to
> space* those touches (reply-decay geometric spacing, §5.3), and *whether to keep
> sending at all this week* (the `ρ<1` throughput gate + Lyapunov throttle, §3 of `11`).
> Notation is identical to `11-math-models.md`. Every number below is a planning prior
> until outcomes are logged and Brier-calibrated (§1.7) — say so on any artifact.

## Purpose

Take drafted, gated messages → send them safely → classify replies → follow up
*exactly as many times as the deal value justifies* → and throttle the whole loop the
moment delivery can no longer keep up with wins. Cadence is not a vibe here; it is
computed per lead from its `Vnet` and the channel's reply half-life `h₁⁄₂`.

---

## Send cadence (deliverability floor — non-negotiable)

These are deliverability constraints, not optimization knobs. They sit *under* the math:
the math decides *who/how-many*, these decide *how-fast-is-safe*.

- **Warm-up:** new sending domain ramps slowly (10/day → 50/day over 3 weeks).
- **Steady state:** cap per domain/day for deliverability (e.g. 40–50 email).
- **Spacing:** randomized human-like gaps, not burst.
- **Per-org throttle:** never two contacts to the same org in <14 days.

---

## Follow-up count & spacing — computed, not guessed (§5)

The old rule was "max 2 follow-ups." That is a vibe. The right number of touches is a
**function of the deal value `Vnet`**, because each extra follow-up has a shrinking
incremental reply probability while costing the same effort.

### The model (notation from `11` §0, §5.1–§5.2)
Reply likelihood decays from first contact with half-life `h₁⁄₂`:
```
P(reply by τ) = P₀ · (1 − 0.5^(τ / h₁⁄₂))        (cumulative; marginal density peaks early)
```
Marginal reply lift of the k-th follow-up:
```
Δreply(k) = q · g^(k−1)        q = first-follow-up lift, g ∈ (0,1) decay
```
**Hard stop rule:** keep following up while the marginal touch still has positive EV;
**STOP the first time** the marginal EV of the touch goes negative:
```
SEND follow-up k   while   Δreply(k) · Vnet ≥ c_followup
STOP at the first k where   Δreply(k) · Vnet <  c_followup
```
where `c_followup` is the effort cost of one follow-up in money terms (hours × your
hourly opportunity cost).

### Compute recipe (per lead)
1. Pull `Vnet = Vdeal·(1−take)` for the lead (from `04`/`02`).
2. Pick `h₁⁄₂` for the channel (defaults below).
3. Set `q`, `g`, `c_followup` (campaign priors below; recalibrate once you log replies).
4. For k = 1,2,3…: compute `Δreply(k)·Vnet`. Send while ≥ `c_followup`; stop at the first k below it.
5. Schedule the surviving touches geometrically: at `h₁⁄₂`, `2·h₁⁄₂`, `4·h₁⁄₂` after the prior touch (spacing matches the decay — §5.3).

### Worked example — the count is set by deal value (§5.4)
Priors: `q = 0.08` (first follow-up adds ~8 reply-prob points), `g = 0.5`,
`c_followup ≈ 0.25h ≈ €12` opportunity cost.

**€180 one-off lead** (`Vnet = €180`):
```
k=1: Δreply = 0.08            → 0.08 · 180 = €14.4 ≥ €12  → SEND
k=2: Δreply = 0.08·0.5 = 0.04 → 0.04 · 180 = €7.2  <  €12  → STOP
→ exactly ONE follow-up.
```
**€800 retainer lead** (`Vnet = €800`):
```
k=1: 0.08      · 800 = €64 ≥ €12 → SEND
k=2: 0.04      · 800 = €32 ≥ €12 → SEND
k=3: 0.02      · 800 = €16 ≥ €12 → SEND
k=4: 0.01      · 800 = €8  <  €12 → STOP
→ THREE follow-ups.
```
**THE DECISION THIS DRIVES:** the literal follow-up count per lead. A €180 gig earns
**1** touch; an €800 retainer earns **3**. Same effort per touch, very different number
of touches — because the value on the other side is different. Chasing a €180 lead four
times is provably EV-negative; that effort belongs on the retainer or the next source.

### Spacing schedule (geometric in `h₁⁄₂`)
| Channel | `h₁⁄₂` (prior) | touch 1 | touch 2 (k=1) | touch 3 (k=2) | touch 4 (k=3) |
|---|---|---|---|---|---|
| Platform bid / DM | ~12h | t=0 | +12h | +24h | +48h |
| Cold email | ~36h | t=0 | +36h | +72h | +144h (~6d) |

Then truncate the schedule at the computed stop-k for that lead's `Vnet`. (Per-org and
per-domain throttles above always override — deliverability beats cadence.)

> **Send-window / hour-of-day optimization is deliberately NOT here.** Per `11` §5.5 it
> is MATH-THEATER until you have hour-level reply data. Use the channel defaults above,
> log reply timestamps, and revisit once the data exists. Do not fabricate a send-window
> model on zero data.

---

## Weekly throughput gate — `ρ < 1` (send / hold / refuse a win) (§3)

Follow-up math decides *per-lead* touches. This gate decides whether the *whole loop*
should keep sending this week, because **winning faster than you can deliver at full
quality is the failure that kills reputation `R`**, which kills future win-rate (§3.3).

### The model (notation from `11` §3.2, §3.4)
```
λ = w(R)·p     arrivals: wins/week × avg hours/job  → inflow in delivery-hours/week
μ = e·ℓ(a)/h   service:  productive hours × AI-leverage / hours-per-job → delivery-hours/week
ρ = λ / μ                      STABLE ⟺ ρ < 1
```
If `ρ ≥ 1` persistently, backlog `B` diverges → late delivery → bad review →
`R` collapses → `λ` collapses. It is a real feedback instability, not a slogan.

### Compute recipe (run every week)
1. `λ` = (wins this week) × (avg delivery-hours per won job).
2. `μ` = (genuinely available delivery-hours after sales/QA/admin) × AI-leverage.
3. `ρ = λ / μ`.
4. **If `ρ > ~0.8`** → throttle: cut proposal volume `p` toward 0 and/or raise
   AI-leverage `a`; **refuse the marginal win** rather than slip a delivery.
5. **If `ρ < ~0.6`** and backlog is below target → it is safe to *raise* `p` (send more).

### Worked example — refuse the 6th win (§3.2)
Week 3. Wins inflow `λ = 5 jobs × 6h = 30h/wk`. Capacity after sales/QA/admin is only
`μ = 30h/wk` of genuinely available delivery time. Then `ρ = 30/30 = 1.0` — **at the
edge.** Decision: **reject the marginal 6th win this week.** Taking it tips `ρ>1`, the
backlog diverges, and the next review slips — and per §3.3 early reviews are the
highest-ROI asset in the whole campaign, so a slipped one is the most expensive miss.

### The Lyapunov throttle — how hard to cut (§3.4)
Target a *healthy non-zero* backlog `B★` (empty = starving, overfull = quality collapse).
```
V(x) = ½(B − B★)² + (κ/2)(r★ − r)²        V ≥ 0, =0 only at target
```
Control law (drives `ΔV ≤ 0`):
- `B < B★` → **raise** `p` (send more).
- `B > B★` → **lower** `p` (stop sending) and/or raise AI-leverage `a`.
- `R` grows → **raise** price `π` (handled in `01`/pricing).

**Worked (§3.4):** `B★ = 25h`, current `B = 40h`, revenue at target (κ term 0) →
`V = ½(40−25)² = 112.5`. Controller says **overfull → cut `p` to ~0 this week, push
leverage.** Next week `B = 27h` → `V = ½(27−25)² = 2.0`. `ΔV = 2.0 − 112.5 = −110.5 ≤ 0`
→ **descending → the throttle worked.** A *positive* `ΔV` would mean you are still
over-winning and the throttle failed — cut harder.

> **Honest limit (§3.5):** this smooth controller says nothing about a platform ban or
> mass-dispute — that is a discontinuous `−δ` jump in `R` the math does **not** cover.
> That is exactly why compliance lives in `08` as a *hard gate*, not a tunable knob.

---

## Send gate (operator) — quality + the compliance VETO

Before any batch sends:
1. Operator reviews the drafted batch (anchor quality, factual accuracy).
2. Spot-check 3 random drafts for "could-go-to-anyone" failures.
3. **Run the state-transition gate (`gateProposal`, §6 of `11`).** This is an INTERNAL
   governor (never client-facing, never called "energy" to anyone). It checks whether
   committing this batch *raises* the campaign's badness potential `U`:
   - A batch that adds a compliance/consent violation flips `protectedPathViolations`
     `0→1` → **hard, non-offsettable VETO** (`accept=false`). No lead value buys it
     back. The batch is blocked, full stop. (Worked: §6.4 of `11`.)
   - A batch sending on *unverified* hype (high `klDivergence` claimed-vs-verified) →
     `dominantTerm = klDivergence` → **go enrich first** (`05`), then re-gate. Enrichment
     *lowers* `U` (§6.4 case 2), so enrichment-before-send is the energetically favored move.
4. Approve → queue. Reject / veto → back to drafting or enrichment.

---

## Send mechanics

- SMTP relay with proper SPF/DKIM/DMARC.
- One message per recipient; no CC/BCC blasts.
- Plain-text-first (better deliverability than heavy HTML).
- Unsubscribe / opt-out honored instantly.

---

## Reply classification

Incoming replies auto-classified:

| Class | Signal | Action |
|-------|--------|--------|
| Positive | "yes", "tell me more", "how much" | → operator (book call) |
| Question | asks detail | → operator (answer) |
| Objection | "too expensive", "have someone" | → objection playbook |
| Negative | "no", "not interested" | → suppress, stop |
| Opt-out | "unsubscribe", "remove" | → suppress immediately |
| Auto-reply | OOO, bounce | → reschedule / clean |

### Reply speed is an EV signal — feed it back to `04`
A **fast, scoped reply** is not just a "Positive" tag — it is Bayesian evidence the lead
will convert (§1.6 of `11`). Worked there: prior `P(conv|L)=0.509`, signal "replied
within 1h with a scoping question" (`Lᴛ=0.8`, `L_F=0.3`) updates to:
```
P_post = (0.509·0.8) / (0.509·0.8 + 0.491·0.3) = 0.735
```
**Decision:** a fast scoped reply jumps convert-prob 51% → 74% → promote the lead to
*priority send-now* and allocate a real custom deliverable. Log the signal so `04`'s
EVH re-ranking and the funnel `p` (§4) both update.

---

## Follow-up rules (now governed by the §5 stop, above)

- Follow-up **count is computed** from `Vnet` (see the worked stop-rule): ~1 touch for a
  small one-off, ~3 for a retainer. Do not exceed the computed stop-k.
- Every surviving follow-up must be **value-add** (new observation, a second delivered
  improvement, a sharper scope) — never "just bumping."
- Spacing is geometric in `h₁⁄₂` (table above), truncated at the stop-k.
- Any Negative / Opt-out cancels all remaining follow-ups immediately.

---

## Reply gate (operator)

Positive replies and questions go to the operator. The loop never auto-sends pricing,
scoping, or commitments.

---

## Bounce / health handling

- Hard bounce → suppress + flag the bad contact source.
- Soft bounce → retry once, then suppress.
- Spam complaint → suppress domain-wide + investigate (this is a reputation event — treat
  it like the start of an `R` shock and check the `ρ`/compliance gates before resuming).

---

## State machine per lead

```
sourced → scored → enriched → drafted → [SEND GATE + U VETO] → sent
→ (reply?) → classified → [Bayes update P → REPLY GATE] → booked | objection | suppressed
→ (no reply?) → followup_k (while Δreply(k)·Vnet ≥ c_followup) → STOP at first negative-EV touch → exhausted
```

Above the per-lead machine sits the **weekly loop gate**: compute `ρ`; if `ρ > ~0.8`,
throttle `p` per the Lyapunov law before any new batch is queued.

---

## Metrics emitted (and what each one recalibrates)

- delivery %, open % (if tracked), positive-reply %, booked %, suppress %
- **reply latency distribution** → feeds the Bayes update (§1.6) and eventually the
  send-window model (§5.5, currently deferred).
- **weekly `ρ`, `B` vs `B★`** → drives the throttle (§3).
- **realized reply / conversion rates per surviving cohort** → re-estimate `p` on
  *surviving* lead quality, not the easy early cohort (survivorship correction, §4.5),
  and recompute Brier (§1.7). **Until that loop runs, every P here is a designed prior,
  not a measurement.**

---

## Reusable core

The **cadence math + value-scaled follow-up stop + `ρ` throttle + send-gate VETO +
reply classification + state machine** is 100% niche-agnostic. Only the channel
`h₁⁄₂` defaults and the `q`/`g`/`c_followup` priors get retuned per channel as reply
data accumulates.
