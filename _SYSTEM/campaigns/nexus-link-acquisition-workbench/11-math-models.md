# 11 — Math Models (Canonical Spec)

> The decision layer underneath the workbench. Every model here exists because it
> **changes what an operator does** — which lead to touch first, what to bid, when
> to follow up, when to STOP sending. If a formula does not change a decision, it is
> marked MATH-THEATER and cut. No decoration survives this file.

**Read order:** this file is the math spine for `01`, `04`, `07`, `08`. Each model
ends with **THE DECISION IT DRIVES** and a **LOAD-BEARING / MATH-THEATER** verdict.
Where a model maps into another workbench doc, the map is in §9 (per-file enhancement map).

**Honesty contract (inherited from the internal energy-landscape methodology):**
- The scoring weights are **designed, not learned**, until you have outcome data. State that on every artifact.
- Calibration (Brier) is the only thing that converts "a number" into "a probability you can bet effort on." Until you log outcomes, every P is a **prior**, not a measurement.
- Cold-start = **n=1, ~0 reviews, ~0 logged outcomes.** Treat all numbers below as planning priors with wide bands, not forecasts.
- The internal energy/U landscape is an **internal capability** for state-gating. It is never a product, never client-facing, never named to a buyer.

---

## 0. Notation (defined once, used everywhere)

| Symbol | Meaning | Units |
|---|---|---|
| `L` | a single lead (a job post, a person, an org, a bounty) | — |
| `xᵢ` | evidence feature i on a lead (binary or scaled to [0,1]) | — |
| `wᵢ` | weight on feature i in the score | logit units |
| `b` | bias / base-rate term | logit units |
| `z` | score = `b + Σ wᵢxᵢ` (log-odds) | logit units |
| `σ(z)` | logistic `1/(1+e^⁻ᶻ)` → probability | [0,1] |
| `P(reply\|L)` | prob. lead replies if contacted | [0,1] |
| `P(conv\|reply)` | prob. converts to paid given a reply | [0,1] |
| `P(conv\|L)` | unconditional convert prob = `P(reply)·P(conv\|reply)` | [0,1] |
| `Vdeal` | expected deal value (gross, before take-rate) | currency |
| `take` | platform take-rate (0–0.20 typ.) | fraction |
| `Vnet` | `Vdeal·(1−take)` | currency |
| `c(L)` | effort cost to pursue L (research + write + follow-ups) | hours |
| `EV(L)` | expected value of pursuing L | currency |
| `EVH(L)` | EV per hour = `EV(L)/c(L)` | currency/hour |
| `B` | backlog: committed work, in AI-adjusted hours | hours |
| `R` | reputation capital (reviews / trust proxy) | count |
| `λ` | arrival rate of WON work | jobs or hrs / week |
| `μ` | service rate (delivery throughput) | jobs or hrs / week |
| `ρ` | `λ/μ`, queue utilization | dimensionless |
| `w(R)` | win-rate as a function of reputation | [0,1] |
| `t` | discrete time index (day or week) | — |
| `Δτ` | hours since first contact / since last touch | hours |
| `h₁⁄₂` | reply-probability half-life | hours |
| `U` | internal scalar potential over campaign state (energy fn) | energy units |
| `ΔU` | `U(after) − U(before)` | energy units |

**Log-odds convention.** Probabilities multiply badly and clip at 0/1; **log-odds add cleanly.** That is the entire reason scoring is done in `z`-space and squashed once at the end with `σ`. Evidence is additive in logits, which is exactly how a human reasons ("verified budget → bump; no reply history → cut").

---

## 1. Lead scoring as a calibrated probability  → `04` (+ feeds `01`)

### 1.1 Why probability, not "points"
A 0–100 "lead score" is uncomparable across operators and uncalibrated against reality.
A **probability** is bettable: `P(conv)=0.30` means *if you pursue 10 of these, ~3 convert.*
That is the only form a score can take that plugs into EV (§2). Points are theater; probability is load-bearing.

### 1.2 The model — weighted-evidence logistic
Two stages, because the failure modes are different (a lead can be reply-likely but convert-unlikely, or vice-versa):

```
z_reply = b_r + Σ wᵢ·xᵢ            (reply features)
P(reply|L)      = σ(z_reply)

z_conv  = b_c + Σ vⱼ·xⱼ            (conversion features)
P(conv|reply,L) = σ(z_conv)

P(conv|L)       = P(reply|L) · P(conv|reply,L)
```

### 1.3 Feature/weight starter table (designed priors — NOT learned)
Weights are in **logit units.** A weight of `+0.7` ≈ multiplies the odds by `e^0.7 ≈ 2×`.
Bias `b_r = −1.4` encodes the cold-start base reply rate ≈ `σ(−1.4) ≈ 0.20`.

| Feature `xᵢ` | applies to | `w` (reply) | `v` (conv) | rationale |
|---|---|---|---|---|
| Post age < 24h (fresh) | job posts | +0.9 | 0 | fresh posts reply far more; decays fast (§5) |
| Explicit budget stated | all | +0.4 | +0.8 | budget = intent + ability to pay |
| Decision-maker reachable | all | +0.6 | +0.5 | gatekeeper kills conversion |
| Pain matches a proof-piece we hold | all | +0.5 | +0.9 | we can show, not tell → converts |
| Verified prior spend (history) | platform | +0.3 | +0.6 | they've paid before |
| Specific scoped ask (not vague) | all | +0.2 | +0.4 | scoped → closes; vague → ghosts |
| Bounty/contribution with clear accept criteria | bounty | +0.7 | +0.7 | objective accept = high convert |
| Competition (many bidders) | job posts | −0.5 | −0.3 | crowded → reply + convert drop |
| Region requires consent we lack (compliance) | cold | −1.2 | −0.4 | see `08`; also a hard gate |
| No reachable contact | all | −2.0 | −2.0 | effectively unpursuable |

`b_r = −1.4`, `b_c = −0.4` (≈ 0.40 convert-given-reply base for a matched lead).

### 1.4 Compute recipe
1. Collect features per lead from `05` (evidence enrichment) — each `xᵢ ∈ {0,1}` or scaled [0,1].
2. `z_reply = b_r + Σ wᵢxᵢ`; `P(reply)=σ(z_reply)`.
3. `z_conv = b_c + Σ vⱼxⱼ`; `P(conv|reply)=σ(z_conv)`.
4. `P(conv|L) = P(reply)·P(conv|reply)`.
5. Carry `P(conv|L)` and `P(reply)` into the EV calc (§2).

### 1.5 Worked numeric example
Lead L = fresh Upwork post (<24h), explicit budget, decision-maker reachable, pain matches a proof-piece we hold, but crowded (many bidders).

```
z_reply = −1.4 + 0.9(fresh) + 0.4(budget) + 0.6(DM) + 0.5(match) − 0.5(crowded)
        = −1.4 + 2.9 − 0.5 = 0.5
P(reply) = σ(0.5) = 1/(1+e^−0.5) = 0.622

z_conv  = −0.4 + 0.8(budget) + 0.5(DM) + 0.9(match) − 0.3(crowded)
        = −0.4 + 2.2 − 0.3 = 1.5
P(conv|reply) = σ(1.5) = 0.818

P(conv|L) = 0.622 × 0.818 = 0.509  ≈ 51%
```
**Read:** roughly a coin-flip to convert if pursued. That goes into EV next.

### 1.6 Bayesian update (when first-touch evidence arrives)
Before reply you have a prior `P(conv|L)`. The moment the lead *acts* (opens, replies fast, asks a scoping question), update with `bayesUpdate` from the math kernel:

```
P_post = (P_prior · Lᴛ) / (P_prior · Lᴛ + (1−P_prior) · L_F)
```
where `Lᴛ` = likelihood of that signal **if** they'll convert, `L_F` = likelihood **if** they won't.

**Worked:** prior `P=0.509`. Signal = "replied within 1 hour with a scoping question."
Estimate `Lᴛ=0.8` (converters reply fast), `L_F=0.3` (non-converters rarely do).
```
P_post = (0.509·0.8) / (0.509·0.8 + 0.491·0.3) = 0.407 / (0.407+0.147) = 0.735
```
A fast scoped reply moved convert-prob 51% → 74%. **Decision:** promote this lead to priority send-now and allocate a real custom deliverable.

### 1.7 Calibration — Brier score (the honesty gate)
A score is worthless until it's calibrated. After ≥30 logged outcomes, compute Brier
(`brierScore` in the kernel): mean squared error of predicted prob vs realized {0,1}.
```
Brier = (1/N) Σ (Pᵢ − oᵢ)²        oᵢ ∈ {0,1}
```
- `Brier ≈ 0.0` → near-perfect.
- `Brier = 0.25` → no better than always guessing 0.5 → **your weights are theater, retune.**
- Track Brier weekly; if it isn't beating 0.25, the model is decoration and you should fall back to "pursue anything with budget + reachable DM."

**Worked:** 5 leads, predicted `[0.9,0.8,0.3,0.6,0.2]`, outcomes `[1,1,0,0,0]`.
```
Brier = [(0.9−1)²+(0.8−1)²+(0.3−0)²+(0.6−0)²+(0.2−0)²]/5
      = [0.01+0.04+0.09+0.36+0.04]/5 = 0.54/5 = 0.108
```
0.108 ≪ 0.25 → the model is earning its keep. The `0.6→0` lead is the worst miss; inspect what feature lied.

### 1.8 Confidence decay on stale evidence
Evidence ages. A "verified budget" scraped 30 days ago is weaker than one from today.
Apply `confidenceDecay` (kernel) to any feature with an age:
```
x_effective = x_base · 0.5^(age / halfLife)
```
**Worked:** budget feature `x_base=1.0`, age=20 days, halfLife=14 days →
`x_eff = 1.0 · 0.5^(20/14) = 0.5^1.43 = 0.37`. The stale budget signal is worth ~⅓ of fresh. Feed `x_eff` (not `1.0`) into §1.4.

### 1.9 Verdict
**LOAD-BEARING.** Logistic score → calibrated probability → EV is the whole reason to prefer one lead over another. The two-stage split, Bayesian update, Brier gate, and decay are all decision-changing. **The one cut:** do NOT also compute entropy/KL over the lead set for ranking — that's §6 territory and would be theater here.

**THE DECISION IT DRIVES:** *which lead gets the next hour, and at what intensity.*

---

## 2. Expected-Value prioritization  → `01` (+ `04`)

### 2.1 The model
Probability alone under-ranks: a 51% lead worth €200 for 1h beats a 70% lead worth €150 for 4h.
You rank by **EV per unit effort.**
```
EV(L)  = P(conv|L) · Vnet(L)            Vnet = Vdeal·(1−take)
EVH(L) = EV(L) / c(L)                   c(L) = effort hours
```
Pursue in **descending EVH** until you hit your effort budget for the day (`07` send loop).

### 2.2 Compute recipe
1. From §1: `P(conv|L)`.
2. Estimate `Vdeal` (ticket) and `take` (platform → `Vnet`).
3. Estimate `c(L)` = research + custom-deliverable + write + expected follow-ups (use §5 to bound follow-up count).
4. `EVH = P·Vnet / c`. Sort the day's queue by EVH.

### 2.3 Worked numeric example (3 competing leads, one operator-hour to allocate)
| Lead | P(conv) | Vdeal | take | Vnet | c (h) | EV | **EVH** |
|---|---|---|---|---|---|---|---|
| A (job, our example §1.5) | 0.51 | €200 | 0.10 | €180 | 1.5 | €91.8 | **€61/h** |
| B (retainer pitch) | 0.20 | €800/mo×3 = €2400 | 0.03 (direct) | €2328 | 6 | €465.6 | **€78/h** |
| C (Fiverr inbound) | 0.70 | €150 | 0.20 | €120 | 1.0 | €84 | **€84/h** |

**Rank by EVH:** C (€84) > B (€78) > A (€61).
**Read this carefully:** the *lowest-probability* lead (B, 20%) is **second**, because the retainer's `Vnet` is an order of magnitude larger. And the cheap inbound (C) wins on a per-hour basis. Naive "chase the highest probability" (A) ranks **last**. That inversion is the entire reason EV exists — it routinely overturns the intuitive order.

### 2.4 Risk-adjustment caveat (don't over-trust a fat tail)
A single huge `Vdeal` can dominate EV on a fragile probability. Two guards:
- **Cap effort exposure:** never let one speculative lead consume > X% of the day's hours regardless of EVH.
- **Use the lower confidence band of `Vdeal`** (conservative ticket) when the value is a guess, not a quote. EV on a fantasy number is theater.

### 2.5 Verdict
**LOAD-BEARING.** EVH re-orders the queue against intuition and prevents the classic trap of grinding cheap high-prob gigs while a retainer rots. The fat-tail guard is what keeps it honest.

**THE DECISION IT DRIVES:** *the literal sort order of today's pursue-queue.*

---

## 3. Pipeline / throughput dynamics  → `07` + `08`

This is the strongest, most defensible math in the workbench — straight from the
internal dynamical-systems framing. It is a real controlled queue, not a metaphor.

### 3.1 State vector
```
xₜ = [ Bₜ (backlog, AI-adj hours)
       Rₜ (reputation, reviews)
       rₜ (revenue rate, smoothed €/wk)
       Mₜ (recurring MRR, €/mo) ]
```
All four are **observable daily.** Controls `uₜ = [effort, AI-leverage, proposal volume, price]`.

### 3.2 Queue stability — `ρ < 1` (the hard gate)
Work arrives (wins) at rate `λ = w(R)·p`, is served (delivered) at rate `μ = e·ℓ(a)/h`:
```
ρ = λ/μ                  STABLE ⟺ ρ < 1
```
If `ρ ≥ 1` persistently, backlog **diverges** → late delivery → bad review → `R` collapses → `λ` collapses. This is a genuine feedback instability, and it is the formal version of the "don't win faster than you can deliver at full quality" risk.

**Compute recipe:** each week, `λ` = wins×avg-hours-per-job; `μ` = productive hours × AI-leverage / hours-per-job. Compute `ρ`. If `ρ > ~0.8`, **stop sending** (throttle `p` in §5/§7) or raise AI-leverage / decline marginal work.

**Worked:** week 3. Wins inflow `λ = 5 jobs × 6h = 30h/wk`. Capacity `μ = 50 productive h × leverage 1.0 / 1 = 50h/wk` of effective delivery, but only **30h** is genuinely available after sales/QA/admin → use `μ=30`. Then `ρ = 30/30 = 1.0`. **At the edge — reject the marginal 6th win this week**, or backlog tips over and the next review slips.

### 3.3 Reputation as a slow integrator (two-timescale structure)
`R` changes slowly (a review every few jobs), but it **gates the fast revenue loop** through `w(R)`:
```
w(R) = w∞ · R / (R + R₁⁄₂)        (monotone, saturating)
```
At `R=0`, `w≈0` → no wins → no reviews → stuck. **`R=0` is an unstable equilibrium (a cold-start trap basin).** You only escape it with an **external impulse**: deliberately under-priced loss-leader orders that buy the first reviews. This is the mathematical reason month-1 underpricing is not generosity — it's the kick that ejects the system from the dead basin.

**Worked:** `w∞=0.05` (5% ceiling win-rate at high rep), `R₁⁄₂=5` reviews.
- `R=0`: `w = 0.05·0/5 = 0%` → dead.
- `R=3`: `w = 0.05·3/8 = 1.9%`.
- `R=10`: `w = 0.05·10/15 = 3.3%`.
First few reviews move win-rate the most (concave) → **the first 5 reviews are the highest-ROI asset in the campaign.** Quantifies why `08`/`07` treat early reviews as sacred.

### 3.4 Lyapunov backlog control (a real feedback controller, hand-tuned gains)
Target a *healthy non-zero* backlog `B★` (empty pipeline = starving; overfull = quality collapse).
```
V(x) = ½(B − B★)² + (κ/2)(r★ − r)²        V ≥ 0, =0 only at target
```
Control law that drives `ΔV ≤ 0` each week:
- `B < B★` → **raise** proposal volume `p` (send more).
- `B > B★` → **lower** `p` (stop sending) and/or raise AI-leverage `a`.
- `R` grows → **raise** price `π`.

The sprint plan (W1 build pipeline → W2 stabilize quality → W3–4 raise price as R accrues) is literally a hand-tuned run of this controller.

**Worked:** `B★=25h`, current `B=40h`, `r★=€2000/wk`, `r=€2000` (κ term zero).
`V = ½(40−25)² = 112.5`. Controller says: overfull → cut `p` to ~0 this week, push AI-leverage. Next week `B=27h` → `V=½(27−25)²=2.0`. `ΔV = 2.0 − 112.5 = −110.5 ≤ 0` → **descending → the throttle worked.** A POSITIVE ΔV next week would mean the throttle failed and you're still over-winning.

### 3.5 Honest limitation (carried from internal methodology — state it, don't hide it)
A platform ban / mass-dispute is a **discontinuous jump** in `R` (impulsive `−δ` term). Lyapunov *decrease* says nothing about surviving a state-jump that large. The smooth controller does **not** cover a ToS ban. That's why `08` (compliance) is a hard gate, not a tunable — the math explicitly does not protect you there.

### 3.6 Verdict
**LOAD-BEARING** for `ρ<1`, the slow-integrator/cold-start reading, and the throttle controller. **MATH-THEATER (cut):** any "global convergence theorem," any claim that "stable = profitable" (the conservative-floor fixed point is stable and still poverty), and treating reputation as smooth. Use the controller to decide *throttle vs. push*; do not dress it as a proof.

**THE DECISION IT DRIVES:** *send more, hold, or stop — and when to refuse a win.*

---

## 4. Conversion forecasting (survivorship-weighted funnel + bands)  → `01`

### 4.1 The model
Forecast revenue by pushing volume through the funnel with **survivorship weighting** —
each stage multiplies by its pass-rate, and you carry an **uncertainty band**, never a point.
```
Won          = Sent · P(reply) · P(conv|reply)
Revenue_exp  = Won · Vnet
```
**Survivorship weighting** = use the *realized* surviving fraction at each stage, not the optimistic top-of-funnel rate, because most leads die early and the survivors are not representative.

### 4.2 Confidence bands (binomial)
With `n` sends and conversion prob `p`, the count of wins has SD `√(n·p·(1−p))`. Report a band, not a number:
```
Won_band ≈ n·p ± 1.96·√(n·p·(1−p))       (95%)
```

### 4.3 Compute recipe
1. Planned sends `n` for the window (from `07` cadence × days).
2. `p = P(reply)·P(conv|reply)` (campaign-blended, from logged rates once available; priors before that).
3. `Won = n·p`; band via §4.2; `Revenue = Won·Vnet`.
4. Report **conservative / expected / aggressive** = lower-band / mean / upper-band.

### 4.4 Worked numeric example
Window: 80 sends. Blended `P(reply)=0.20`, `P(conv|reply)=0.40` → `p=0.08`.
```
Won_mean = 80·0.08 = 6.4 wins
SD       = √(80·0.08·0.92) = √5.89 = 2.43
95% band = 6.4 ± 1.96·2.43 = 6.4 ± 4.76 → [1.6, 11.2] wins
Vnet ≈ €180  →  Revenue band ≈ [€290, €2020], expected ≈ €1150
```
**Read:** at 80 sends the honest 95% outcome spans €290–€2020. That band **is the message** — anyone quoting a single "€1150 forecast" off n=1 is lying. Wide band = the decision is "increase n to tighten it," not "trust the midpoint."

### 4.5 Survivorship correction (the part people skip)
If W1 sends got 25% reply but those were the *easiest* fresh leads, do NOT extrapolate 25% to W2's harder pool. Re-estimate `p` on the **surviving** lead quality. Naive extrapolation of the best early cohort is the single most common forecast lie — flag it.

### 4.6 Verdict
**LOAD-BEARING** for the band; **the point estimate alone is MATH-THEATER** and actively misleading at n=1. The funnel multiply is trivial arithmetic — keep it, but the value-add is the band + survivorship correction.

**THE DECISION IT DRIVES:** *how many sends to commit to (raise n until the band is tolerable), and whether to trust early rates.*

---

## 5. Cadence / timing (reply-decay + follow-up spacing)  → `07`

### 5.1 Reply-probability decay
Reply likelihood decays with time-since-contact. Exponential half-life model:
```
P(reply by τ) = P₀ · (1 − 0.5^(τ / h₁⁄₂))      cumulative
marginal reply density peaks early, then thins
```
For **lead freshness** (job posts), the inverse: a post's *own* reply-rate to bids decays from when it was posted — fresh-post bonus in §1.3 is this same decay.

### 5.2 Follow-up spacing — diminishing returns
Each follow-up has a declining incremental reply probability. Model marginal yield of follow-up `k`:
```
Δreply(k) = q · g^(k−1)        q = first-follow-up lift, g ∈ (0,1) decay
```
Stop following up when `Δreply(k)·Vnet < c_followup` (marginal EV of the touch goes negative). This gives a **hard, computed stop rule** instead of "follow up a few times."

### 5.3 Compute recipe
1. `h₁⁄₂` for the channel (cold email ≈ 24–48h to first reply; platform bids faster).
2. Schedule follow-ups at ≈ `h₁⁄₂`, `2·h₁⁄₂`, `4·h₁⁄₂` (geometric spacing matches the decay).
3. For each planned follow-up, compute `Δreply(k)·Vnet` vs cost; cut the tail when negative.

### 5.4 Worked numeric example
`q=0.06` (first follow-up adds 6 pts reply prob), `g=0.5`, `Vnet=€180`, `c_followup`=0.25h ≈ €12 opportunity cost.
```
k=1: Δreply=0.06 → 0.06·180 = €10.8  vs €12 → NEGATIVE already? recompute with q=0.08:
k=1: 0.08·180 = €14.4 > €12 → SEND
k=2: 0.08·0.5·180 = €7.2  < €12 → STOP
```
**Decision: exactly one follow-up on a €180 lead.** Raise `Vnet` to €800 (retainer) and:
```
k=1: 0.08·800 = €64   k=2: €32   k=3: €16   k=4: €8 < €12 → stop at 3.
```
**So follow-up count is a function of deal value** — 1 touch for a €180 gig, 3 for an €800 retainer. That's a computed cadence, not a vibe.

### 5.5 Send windows
If/when you log reply-by-hour, weight send time by historical reply density (a simple per-hour multiplier). Until you have that data, this is **MATH-THEATER** — do not fabricate a send-window model on zero data; use channel-norm defaults and start logging.

### 5.6 Verdict
**LOAD-BEARING:** decay-spaced follow-ups and the value-scaled stop rule (it directly sets how many times you touch a lead, by EV). **MATH-THEATER (deferred):** send-window optimization until you have hour-level reply data.

**THE DECISION IT DRIVES:** *follow-up count and spacing per lead, with a hard computed stop.*

---

## 6. Salience / attention allocation (energy/U prioritization — INTERNAL)  → `04` + `01`

> **Framing lock:** this is the **internal** energy landscape capability used to gate
> *campaign state transitions* (e.g., "should we promote this lead to active / commit
> this batch of sends"). It is NEVER a product, never client-facing, never named to a buyer.

### 6.1 What U does here
`computeU(state)` collapses a campaign-state snapshot to a single scalar "badness" potential.
`gateProposal(before, after)` rejects a proposed transition if `ΔU > threshold` (Lyapunov-style),
with a **hard non-offsettable veto** on protected-path / compliance violations (see `08`).

### 6.2 The honest mapping (only the terms that mean something here)
Repurpose the existing `computeU` terms onto campaign state — do **not** invent new physics:

| U term (existing) | Campaign meaning | weight intent |
|---|---|---|
| `entropy(claimPromotionDistribution)` | spread of leads across pipeline stages — high entropy = scattered, no focus | mild penalty on unfocused state |
| `klDivergence(claimed, verified)` | gap between *claimed* lead quality and *verified* evidence (`05`) | **strong** penalty on hype-vs-evidence drift |
| `brier / logLoss` | scoring-model miscalibration (§1.7) | penalize a lying model |
| `−informationGain` | a transition that *reduces* uncertainty (enrichment) **lowers** U | reward learning |
| `staleness` | stale evidence dragging the state up (§1.8) | mild penalty |
| `protectedPathViolations` | compliance/consent violation (`08`) | **catastrophic, hard veto** |
| `−verifiedEvidenceCredit` (capped) | verified evidence lowers U (saturating) | bounded reward, can't mask violations |

### 6.3 Compute recipe (gate a send-batch)
1. Snapshot `state_before` (current pipeline distribution, evidence quality, compliance counters).
2. Build `state_after` = state if you commit the batch.
3. `gateProposal({stateBefore, stateAfter, threshold:0})`.
4. `accept=false` → **don't send the batch**; inspect `dominantTerm` to see *why* (e.g. `klDivergence` = you're sending on unverified hype → go enrich first).

### 6.4 Worked numeric example
Proposed batch adds a compliance violation (cold-sending into a consent-required region, `08`):
```
before: protectedPathViolations=0
after:  protectedPathViolations=1
gateProposal → accept=false, dominantTerm="protectedPathViolations",
reason="protected-path violation increase (0→1) — HARD VETO, non-offsettable"
```
No amount of "but these are great leads" (`verifiedEvidenceCredit`) can buy it back — the veto is non-offsettable by design. **Decision: the batch is blocked at the gate, full stop.**

Second case — a *healthy* transition: enrich 5 leads (raise `verifiedEvidenceCount`, raise `informationGain`, drop `klDivergence`):
`ΔU < 0` → `accept=true` → "this is a state-improving move, proceed." Confirms enrichment-before-send is energetically favored.

### 6.5 The brutal honesty (this is where most of the energy stuff dies)
For **ranking individual leads**, U is **MATH-THEATER** — §1 (logistic P) + §2 (EVH) already rank them better and more legibly. U does not improve lead ranking; squashing six leads into one scalar to sort them is strictly worse than EVH.

U earns its keep in **exactly one place: gating batch/state transitions on compliance + evidence-drift**, where its non-offsettable veto and `ΔU` Lyapunov check do something EV cannot: **refuse a state that's cheap-but-toxic.** Keep U as the *governor* on the campaign loop; do not let it cosplay as the lead scorer.

### 6.6 Verdict
**LOAD-BEARING (narrow):** U/`gateProposal` as the **internal compliance+drift governor** on send-batches and lead promotions, with the hard veto. **MATH-THEATER (cut):** U as a lead-ranking score, U as anything client-facing, U as "energy" in any external copy.

**THE DECISION IT DRIVES:** *block or allow a state transition (send-batch / promotion) — a veto, not a ranking.*

---

## 7. Model interaction map (how the six chain into one loop)

```
05 evidence ──► §1 logistic P(reply),P(conv)  ──► §1.7 Brier (calibrate)
                          │
                          ▼
                §2 EVH = P·Vnet/c  ──► sort today's pursue-queue (01/04)
                          │
                          ▼
        §6 gateProposal(U): compliance+drift VETO on the batch (04/08)
                          │ accept
                          ▼
                §5 cadence: send + value-scaled follow-up stop (07)
                          │
                          ▼
        §3 ρ<1 + Lyapunov throttle: send more / hold / refuse win (07/08)
                          │
                          ▼
        §4 funnel forecast w/ bands ──► commit volume n (01)
                          │
                          └──► outcomes logged ──► back to §1.7 Brier (close the loop)
```
The loop closes on **Brier**: logged outcomes recalibrate the scorer. Until that loop runs, every P is a prior.

---

## 8. Load-bearing vs. theater — the audit (one glance)

| § | Model | Verdict | The cut |
|---|---|---|---|
| 1 | Logistic calibrated P + Bayes + Brier + decay | **LOAD-BEARING** | no entropy/KL for ranking |
| 2 | EV / EVH prioritization | **LOAD-BEARING** | cap fat-tail exposure; use conservative `Vdeal` |
| 3 | `ρ<1`, slow-integrator, Lyapunov throttle | **LOAD-BEARING** | no convergence theorem; "stable"≠"profitable" |
| 4 | Funnel forecast **with bands** | band LOAD-BEARING; **point estimate THEATER** | never quote a single n=1 number |
| 5 | Reply-decay + value-scaled follow-up stop | **LOAD-BEARING** | send-window opt deferred (no data) |
| 6 | U/`gateProposal` governor | **LOAD-BEARING (narrow)** | U as a lead-ranker = CUT; never client-facing |

**Three things explicitly killed:** (a) any "lead score" expressed as 0–100 points, (b) U as a ranking function, (c) single-number revenue forecasts at n=1.

---

## 9. Per-file enhancement map (which model goes into which workbench doc, and how)

| Workbench file | Model(s) injected | Concrete change |
|---|---|---|
| **01-acquisition-strategy** | §2 EVH, §4 funnel-with-bands, §3.3 cold-start impulse | Replace any flat revenue claim with conservative/expected/aggressive **bands** (§4.4). Add the EVH channel-ranking rationale (§2.3) and the "first 5 reviews are highest-ROI" cold-start math (§3.3) as the reason for loss-leader W1 pricing. |
| **04-lead-scoring-model** | §1 (whole), §1.6 Bayes, §1.7 Brier, §1.8 decay, §2 EVH, §6 U-governor (internal note) | Make this the home of the two-stage logistic + weight table (§1.3), the worked example (§1.5), the Bayesian first-touch update (§1.6), the Brier calibration gate (§1.7), and confidence-decay (§1.8). Append EVH as the *ranking* output (§2). Add a clearly-marked **INTERNAL** subsection pointing to §6 (U as compliance/drift governor) — never client-facing. |
| **05-evidence-enrichment** | §1.3 feature extraction, §1.8 decay, §6 informationGain | Define each enrichment as the population of a specific `xᵢ` feature with a timestamp (so §1.8 decay can apply). Frame enrichment as the `informationGain` move that **lowers U** (§6.4 case 2) — gives a math reason to enrich before sending. |
| **07-send-reply-loop** | §5 cadence/decay, §5.2 follow-up stop, §3.2 ρ-throttle, §3.4 Lyapunov control | Set follow-up spacing geometric in `h₁⁄₂` (§5.3) and the **value-scaled hard stop** (§5.4 → 1 touch for €180, 3 for €800). Add the `ρ<1` gate: compute weekly `ρ`; if `ρ>~0.8`, **throttle sends** per the Lyapunov law (§3.4). This is the send/hold/stop brain. |
| **08-health-and-compliance** | §6 U hard-veto, §3.2 ρ-instability, §3.5 ban-as-jump | Wire the **non-offsettable protected-path veto** (§6.4) as the compliance gate — a violation blocks the batch regardless of lead value. Frame review-velocity starvation as the `R→0` unstable basin (§3.3) and a ban as the **discontinuous `−δ` jump the smooth math does NOT cover** (§3.5) → why compliance is a hard rule, not a tunable. |
| **(loop closure, all)** | §1.7 Brier, §4.5 survivorship | Daily/weekly: log outcomes, recompute Brier (§1.7), re-estimate `p` on surviving lead quality (§4.5). Until this runs, every P is a designed prior — say so on every artifact. |

---

## 10. Residual risk (stated, not buried)
- **Every weight in §1.3 is a designed prior, not learned.** First ~30 outcomes can swing them hard. Brier (§1.7) is the only thing that tells you if they're real.
- **All worked numbers are illustrative** at n=1; the forecasting bands (§4) are deliberately wide for that reason. Treat midpoints as planning anchors, not predictions.
- **The U-governor (§6) is internal capability only.** Any leak of "energy landscape" language into client-facing copy is a positioning error, not just a math error.
- **The smooth dynamics (§3) do not cover a platform ban** (a state-jump). Compliance (`08`) is the only thing that does, and it's a gate, not math.

---
*Spec is platform-neutral and entity-neutral by construction. Math appears only where it changes a decision; everything else was cut and named. Advisory until outcomes are logged and Brier-calibrated.*
