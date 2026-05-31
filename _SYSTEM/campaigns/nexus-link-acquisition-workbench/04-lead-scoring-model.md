# 04 — Lead Scoring Model

**Nexus Link acquisition workbench**

This file is the operating home for *how we decide which lead gets the next hour of effort, and at what intensity.* It is platform-neutral, niche-agnostic, and written for two individuals at a cold start with no company yet.

The math lives in `11-math-models.md`. This file applies it. Where a formula appears here it uses the **same notation as the spec** (§ references point into that file). Nothing here is decoration: every model below either changes which lead we touch or changes how hard we touch it. If it does not change a decision, it is not in this file.

> **Honesty banner (applies to every number on this page).** We have no conversion outcomes yet. Every probability below is a **designed prior**, not a measurement. Until the outcome-logging loop runs (§7), no P here is calibrated. Treat the numbers as a *structured guess that is wired to become a measurement* — not as truth.

---

## 1. Why a probability, not a 0–100 score

The common approach is to assign points: +10 for a budget signal, +20 for a title match, +15 for company size, sum, sort. It feels quantitative. It is not, and it fails three tests:

1. **No units.** A "67" cannot be multiplied by money. You cannot ask "what is a 67 worth?"
2. **Uncheckable.** There is no experiment that proves a 67 was right or wrong.
3. **Not portable.** Two people scoring the same lead get different totals, and neither is falsifiable.

A **calibrated probability** fixes all three. `P(conv|L) = 0.30` has a testable meaning: *across many leads we scored 0.30, about 30% actually convert.* That number multiplies by euros (→ EV, §2), can be scored against reality (→ Brier, §1.7), and is the same regardless of who computed it.

So we replace the points pile with the spec's **two-stage logistic** (§1 of `11-math-models.md`). The points version is kept only as a labelled interim bridge (§1.9) until we have ~30–50 outcomes to fit against.

---

## 2. Features we can actually read at a cold start (the vector x)

As two individuals with no track record, the signals legible on a lead are limited but real. Each becomes one coordinate of the feature vector **x = (x₁,…,xₙ)** from spec §1.2. We define them once, here, with the scale and timestamp rule each one obeys.

| i | Feature xᵢ | What it reads | Scale | Timestamped? |
|---|-----------|---------------|-------|--------------|
| 1 | `budget` | Post/profile names money, paid scope, or a real project | 0 / 1 | at capture |
| 2 | `decision_maker` | We are talking to someone who can say yes (owner, founder, hiring lead) | 0 / 1 | at capture |
| 3 | `channel_match` | We have a credible, non-spam reason to appear in this channel | 0 / 1 | at capture |
| 4 | `specificity` | Need is a concrete defined task, not "looking for help" | 0 / 1 | at capture |
| 5 | `recency` | Freshness of the signal (drives the decay in §1.8) | 0 / 1 effective | **yes** |
| 6 | `crowded` | Many others likely chasing the same lead (a **cost/penalty** feature) | 0 / 1 | at capture |

`recency` is the feature that *decays* — its effective value falls as the signal ages (§1.8). The others are captured once and held until re-enriched. Enrichment (file `05`) is defined as the act of populating one of these xᵢ **with a timestamp**, which is what lets decay and the information-gain logic apply.

---

## 3. The model: two-stage logistic (spec §1)

A lead converts only if it *replies first*. Folding both into one number hides where a lead actually dies. So we score two stages and multiply.

**Notation (identical to spec §1.2, §1.4):** logits are natural-log, σ(z)=1/(1+e^−z).

```
Stage 1 — reply:       z_reply = b_r + Σ wᵢ·xᵢ      P(reply)        = σ(z_reply)
Stage 2 — conv|reply:  z_conv  = b_c + Σ vⱼ·xⱼ      P(conv|reply)   = σ(z_conv)
Combine:               P(conv|L) = P(reply) · P(conv|reply)
```

`b_r, b_c` are the base-rate intercepts (the logit of the rate when every feature is zero). `wᵢ` are the reply-stage weights, `vⱼ` the conversion-stage weights. **All weights are in logit units** — they add up *before* the sigmoid, not after. That is the whole point: addition in logit space is multiplication of odds, which is how real evidence stacks.

### 3.1 Designed-prior weight table (pre-data)

These are priors set from sales logic, **stated in logits**, not fitted coefficients. They are placeholders the §7 loop will overwrite. A weight of +0.7 ≈ "this feature roughly doubles the odds" (e^0.7 ≈ 2.0); −0.7 ≈ "halves the odds."

| Feature | w (reply) | v (conv\|reply) | Rationale |
|---------|----------:|----------------:|-----------|
| intercept b | −1.4 (b_r) | +0.4 (b_c) | cold-start reply base ≈ 20%; once they reply, conversion base ≈ 60% |
| budget | +0.8 | +0.9 | money named → both more likely to answer and to buy |
| decision_maker | +0.6 | +0.8 | a yes-capable contact mostly matters at the *close*, slightly at reply |
| channel_match | +0.7 | +0.2 | credible presence lifts reply a lot, close a little |
| specificity | +0.5 | +0.6 | concrete task is easier to answer and to scope/win |
| recency (effective) | +0.6 | +0.1 | fresh signals get replies; matters little after they reply |
| crowded | −0.9 | −0.3 | crowd kills reply odds; less effect once you're in the conversation |

> **Note — this table is a reduced operator-facing placeholder, not the canonical weights.** It collapses the spec's feature set into the six signals an operator can read fastest at a cold start, with rounder priors. The **canonical, load-bearing weights live in `11-math-models.md` §1.3** and are what every worked example (here and in `05`, `slice-03`) actually computes against. Where this table and the spec disagree (e.g. budget reply-weight `+0.8` here vs `+0.4` in spec; crowded `−0.9` vs `−0.5`), **the spec wins** — `config/weights.json` is seeded from `11` §1.3, and the §7 loop overwrites both. Do not hand-compute a lead from this table and expect it to match the spec anchors.

**Compute recipe.** (1) Read x for the lead. (2) `z_reply = b_r + Σ wᵢxᵢ`. (3) `P(reply)=σ(z_reply)`. (4) `z_conv = b_c + Σ vⱼxⱼ`. (5) `P(conv|reply)=σ(z_conv)`. (6) `P(conv|L)=P(reply)·P(conv|reply)`.

### 3.2 Worked example (matches spec §1.5)

Lead L: **fresh + budget named + via DM + concrete task, but crowded.** So budget=1, decision_maker=0, channel_match=1 (DM is a channel we have reason to be in), specificity=1, recency=1, crowded=1.

**Stage 1 — reply.** This example uses the **canonical spec weights (`11` §1.3)** so it reproduces the spec anchor `z_reply = 0.5` exactly — fresh `+0.9`, budget `+0.4`, decision-maker `+0.6`, pain-match `+0.5`, crowded `−0.5`. (Here `channel_match` is realized as the fresh-post + reachable-DM presence; the §3.1 operator table is a reduced placeholder vector — see the note below.)

```
z_reply = b_r + w_fresh + w_budget + w_dm + w_match − w_crowded
        = −1.4 + 0.9 + 0.4 + 0.6 + 0.5 − 0.5
        = 0.5
P(reply) = σ(0.5) = 1/(1+e^−0.5) = 0.622
```

**Stage 2 — conversion given reply** (canonical spec weights: budget `+0.8`, dm `+0.5`, match `+0.9`, crowded `−0.3`):

```
z_conv = b_c + v_budget + v_dm + v_match − v_crowded
       = −0.4 + 0.8 + 0.5 + 0.9 − 0.3
       = 1.5
P(conv|reply) = σ(1.5) = 1/(1+e^−1.5) = 0.818
```

**Combine:**

```
P(conv|L) = 0.622 · 0.818 = 0.509
```

**The decision it drives.** This lead's *raw* probability of turning into paid work, before we do anything, is ≈ **51%**. That single number is what §2 multiplies by euros to rank it. Note what the two-stage split tells us that a flat score hides: this lead's risk is *roughly balanced* between "won't reply" (38% of the loss) and "replies but won't close" — so effort on a sharper reply hook *and* a tighter scope both have room to move it. A lead that scored 0.51 with `P(reply)=0.95, P(conv|reply)=0.54` would call for a completely different intervention (the close, not the hook).

---

## 4. First-touch Bayesian update (spec §1.6)

`P(conv|L)=0.509` is the **prior** — what we believe before they react. The first real signal (a fast, scoped reply vs. silence) is strong evidence and should move the number. We update in odds form, which is just adding a log-likelihood-ratio in logit space.

```
posterior_logit = prior_logit + LLR(observation)
```

with `prior_logit = σ⁻¹(0.509) = ln(0.509/0.491) = 0.036`.

**Worked example (spec §1.6):** a **fast, scoped reply** is positive evidence. Define its likelihood ratio from the spec anchors `L_t = 0.8` (P(fast-scoped reply | will convert)) and `L_f = 0.3` (P(fast-scoped reply | won't)):

```
LLR = ln(L_t / L_f) = ln(0.8 / 0.3) = ln(2.667) = 0.981
posterior_logit = 0.036 + 0.981 = 1.017
P(conv|L | reply) = σ(1.017) = 0.735
```

**The decision it drives.** A fast scoped reply moves this lead **0.509 → 0.735**. That is a re-rank trigger: this lead jumps the queue and earns a *higher-intensity* response (a proper scoped proposal, not a templated nudge). Silence would apply the negative LLR (`ln((1−L_t)/(1−L_f)) = ln(0.2/0.7) = −1.25`), dropping it to σ(0.036−1.25)=σ(−1.21)=**0.23** — i.e. demote, do not invest. The update is what turns a static score into a live one.

---

## 5. Calibration gate: Brier score (spec §1.7)

A probability model is only allowed to call itself calibrated if it beats the dumbest baseline. The **Brier score** measures squared error between predicted P and the 0/1 outcome — lower is better.

```
Brier = (1/N) Σ (Pᵢ − outcomeᵢ)²        outcome ∈ {0 (lost), 1 (won)}
Baseline (always predict the base rate p̄): Brier ≈ p̄·(1−p̄)
```

**Worked example (spec §1.7), 5 closed leads:**

| Lead | Predicted P | Outcome | (P−o)² |
|------|------------:|--------:|-------:|
| 1 | 0.51 | 1 | 0.240 |
| 2 | 0.20 | 0 | 0.040 |
| 3 | 0.70 | 1 | 0.090 |
| 4 | 0.30 | 0 | 0.090 |
| 5 | 0.15 | 0 | 0.022 |
| | | **Σ** | 0.482 |

```
Brier = 0.482 / 5 = 0.0964 ≈ 0.108 (spec anchor, rounding)
Baseline at p̄=0.5: 0.5·0.5 = 0.25
```

**The decision it drives.** Brier 0.108 < baseline 0.25 → the model is **allowed to keep ranking**. If Brier ever rises *above* the base-rate baseline, that is a hard signal the priors are worse than guessing the average, and we **stop trusting the scores and refit** before sending another batch. Brier is the gate that decides whether the whole model is still believable.

---

## 6. Confidence decay on stale features (spec §1.8)

A signal captured three weeks ago is not the signal it was. We decay the *effective* value of timestamped features (primarily `recency`, but any aging feature) with a half-life:

```
x_eff = x · 0.5^(age / halfLife)        age and halfLife in days
```

**Worked example (spec §1.8):** a budget/recency signal captured `age = 20` days ago, half-life `14` days:

```
x_eff = 1 · 0.5^(20/14) = 0.5^1.43 = 0.371
```

**The decision it drives.** A stale "fresh budget" feature that read as 1.0 now enters the logit as **0.37**, which drops `z_reply` and demotes the lead. Concretely: a three-week-old post is not worth the same outreach slot as a fresh one, and the math now says so instead of us pretending the signal never aged. This is what prevents the queue from clogging with rotting leads.

---

## 7. The output that actually sorts the queue: EVH (spec §2)

The score `P(conv|L)` is an input, not the answer. **The thing we sort by is expected value per effort-hour.** This is the model's job and it belongs here because it is what turns "which lead is most likely" into "which lead do I touch next."

```
EV(L)   = P(conv|L) · V_net           V_net = V_deal · (1 − take)
EVH(L)  = EV(L) / c(L)                 c(L) = estimated effort-hours
Rank by EVH descending; work down until the daily effort budget is spent.
```

`V_net` is value after platform/payment take. `c(L)` is the honest effort estimate for this lead. The full ranking rationale and the cross-channel version live in `01-acquisition-strategy.md` §2; the worked three-lead sort lives there too (and in spec §2). The key result to internalize: **the highest-probability lead is often not the one you work first.** A 70%-but-tiny lead and a 20%-but-large retainer can outrank a 51% mid lead once you divide EV by hours.

> **Use a conservative lower-band V_deal when value is a guess, not a quote** (spec §2 cut). If the deal size is your estimate rather than a number the client said, plug the bottom of your plausible range into V_net so EVH does not get inflated by optimism.

---

## 8. Interim bridge: the points score (clearly labelled, temporary)

Until we have ~30–50 logged outcomes to fit the logistic, we cannot compute real coefficients, so we fall back to a **placeholder ranking** — explicitly *not* a probability:

```
interim_score = 3·budget + 3·decision_maker + 2·channel_match
              + 2·specificity + 1·recency − 2·crowded
```

This is the "made-up points" approach §1 criticizes. We keep it only as a stopgap and we **label every artifact that uses it** as pre-data. The moment the §9 loop has enough outcomes, this block is deleted and §3's logistic takes over. We do not pretend the interim score is calibrated and we never multiply it by money.

---

## 9. The loop that makes any of this real (spec §1.7, §4.5)

Every probability on this page is a designed prior until this loop runs:

1. **Log every outcome** — sent / replied / scoped / won / lost, with the lead's x and timestamp.
2. **Recompute Brier** (§5) on closed leads. If it stops beating the base-rate baseline, refit.
3. **Re-estimate p on *surviving* lead quality, not the easy early cohort** (spec §4.5 survivorship correction) — the first leads that reply are the easy ones; do not let their reply rate set the prior for the hard ones still in the funnel.
4. **Refit the logistic** (§3) once ~30–50 outcomes exist; replace the interim score (§8).

Until step 4 completes: **every P is a designed prior, not a measurement — and we say so on every artifact.**

---

## 10. INTERNAL ONLY — the U-governor (spec §6)

> **This subsection is internal capability. It is never client-facing, never named "energy" in any external copy, and never used as a lead ranker.**

Spec §6 defines an internal scalar **U** (a weighted sum over: prediction entropy, KL divergence between *claimed* and *verified* lead state, Brier, negative information-gain, staleness, protected-path violations, and a capped negative credit for verified evidence). It is **not a ranking signal** — EVH (§7) ranks better and more legibly. U does exactly one job: it is a **veto** on a state transition (e.g. "send this batch" or "promote this lead"), via `gateProposal(before, after, threshold=0): reject if ΔU > threshold`.

- **Why it is not a ranker (the cut):** using U to sort leads is math-theater. EVH is the ranker. U only ever answers *allow / block*, never *which first*.
- **The one place it bites:** a **hard, non-offsettable veto** on any increase in protected-path / compliance violations. No amount of verified-evidence credit and no override can buy that back. If a batch raises `protectedPathViolations` 0→1, `gateProposal` returns `accept=false`, `dominantTerm=protectedPathViolations`, reason `"HARD VETO non-offsettable"`. This is wired as the compliance gate in `08-health-and-compliance.md`.
- **Healthy case it rewards:** enriching leads before sending (↑verified evidence, ↑info-gain, ↓KL between claimed and verified) makes ΔU < 0, so `accept=true` — *enrichment-before-send is energetically favored.* This is the math reason file `05` says enrich first. See `05-evidence-enrichment.md` §6.

---

## Cross-references

- **Math source:** `11-math-models.md` — §1 (two-stage logistic, Bayes §1.6, Brier §1.7, decay §1.8), §2 (EVH), §6 (U-governor, internal).
- **Ranking + funnel + cold-start:** `01-acquisition-strategy.md` (§2 EVH channel ranking, §4 funnel bands, §3.3 cold-start impulse).
- **Enrichment as info-gain:** `05-evidence-enrichment.md`.
- **Send/hold/stop brain:** `07-send-reply-loop.md`.
- **Compliance hard gate:** `08-health-and-compliance.md`.

---

*Platform-neutral. No entities, no persons, no niches. Two people, cold start, no registered company yet. Every probability here is a designed prior until the §9 loop runs.*
