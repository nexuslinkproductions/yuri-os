# 01 — Acquisition Strategy

**Nexus Link acquisition workbench**

## The model

Nexus Link sells **services** (niche configured per campaign) to businesses in any sector, globally. Two individuals, cold start, no registered company yet, no warm network. That last fact is not a footnote — it is the central mathematical constraint, and this file treats it as one. Acquisition cannot lean on referrals, so the primary channel is **proactive, value-first cold outreach at quality.**

The thesis: we do not win on volume, we win on **demonstrated specificity and delivered value.** Every prospect gets a message proving we already studied their actual business and either found a concrete problem or already brought part of the fix.

The math that runs underneath this strategy lives in `11-math-models.md`. This file does not re-derive it — it *applies* it, with the same notation. Three models drive the strategic decisions here:

- **§2 EVH** (`11`) — which channel and which lead get the next hour. Drives the channel ranking below.
- **§4 funnel-with-bands** (`11`) — how much to forecast and how many sends to commit. Replaces the old single-number funnel.
- **§3.3 cold-start impulse** (`11`) — why month-1 underpricing is mechanically necessary, not generosity.

> **Honesty banner.** Every rate and revenue figure on this page is a **designed prior**, not a measurement. We have zero logged outcomes. The numbers exist to *size decisions and set bands*, not to predict. They become real only when the outcome-logging loop (`04` §9) runs and Brier-calibrates them.

---

## 1. The cold-start problem stated as math (why this is hard, precisely)

At a cold start, reputation `R = 0`. Win-rate is a saturating function of reputation (`11` §3.3):

```
w(R) = w∞ · R / (R + R½)
```

At `R = 0`, `w(0) = 0`. No reputation → ~no wins → no reviews → reputation stays at 0. **`R = 0` is a stable dead basin**: the system, left alone, stays broke. This is the formal version of "nobody hires the person with no reviews."

You do not escape a dead basin by trying harder inside it. You escape it with an **external impulse** — a deliberate kick that injects the first reputation units below their market cost. That impulse is what §3 (cold-start pricing) and Family 2 (credibility channels) are for. Everything in this strategy is built around buying the first few reputation units as cheaply as possible, because the math says those are the highest-leverage units we will ever buy.

**Worked (spec §3.3, `w∞=0.05`, `R½=5`):**

| Reviews `R` | Win-rate `w(R)` | Marginal gain per review |
|---:|---:|---:|
| 0 | 0.0% | — |
| 3 | 1.9% | ≈ 0.63 pp/review (first cohort) |
| 10 | 3.3% | ≈ 0.20 pp/review (later cohort) |

The first 3 reviews each add roughly **3× the win-rate** of reviews 4–10 (0.63 pp vs 0.20 pp per review — the curve is concave). **The decision this drives:** treat the **first ~5 reviews as the single highest-ROI asset in the campaign.** Buy them with loss-leader pricing and value-first delivery (§3, Family 2). After ~5, the curve flattens and the right move flips to *raising price*, not chasing more cheap reviews.

---

## 2. Channel ranking by EVH (not by gut)

We have more channels than hours. The channels do not get equal time — they get ranked by **expected value per effort-hour** (`11` §2), the same EVH that ranks individual leads in `04` §7:

```
EVH(channel) = [ P(conv | lead) · V_net ] / c(lead)        averaged over that channel's typical lead
```

This is the strategic version of the lead-level sort. The worked three-lead example in `11` §2.3 is the proof of the counterintuitive result, and it generalizes directly to channels:

| Representative lead | P(conv) | V_net | effort `c` | EV | **EVH** |
|---|---:|---:|---:|---:|---:|
| A — fresh job post, crowded | 0.51 | €180 | 1.5 h | €91.8 | **€61/h** |
| B — direct retainer pitch | 0.20 | €2,328 | 6 h | €465.6 | **€78/h** |
| C — warm inbound / referral-grade | 0.70 | €120 | 1.0 h | €84.0 | **€84/h** |

**Rank: C (€84/h) > B (€78/h) > A (€61/h).** Read what that inversion says:

- The **lowest-probability** lead (B, 20%) ranks **second**, because its `V_net` is an order of magnitude larger — a fragile shot at a retainer beats a safe shot at a one-off.
- The **highest-probability** lead (A, 51%) ranks **last**, because it is crowded and slow per euro.
- Naive "chase the most likely yes" is provably the wrong sort. EVH overturns it.

**The decision this drives:** the literal order in which we spend the day's hours across channels. Concretely, that ranking is *why* the channel mix below is ordered the way it is, and why a low-probability high-ticket pitch is not skipped just because it "probably won't land."

> **Fat-tail guard (spec §2.4).** A single huge `V_net` can hijack the ranking on a fantasy number. Two rules: (1) cap any one speculative lead at a fixed fraction of the day's hours regardless of EVH; (2) when `V_deal` is *our guess* and not *their quote*, plug the **conservative lower band** into `V_net`. EV computed on an optimistic invented number is theater.

---

## 3. Cold-start pricing as the ejection impulse

The classic cold-start mistake is pricing at market from day one and then wondering why `w(R=0) ≈ 0` keeps the pipeline empty. §1 already showed why: you are trying to win from inside the dead basin.

So month-1 pricing is deliberately **below market** — not as a discount strategy, but as the **external impulse** that ejects the system from `R = 0` (spec §3.3). Each under-priced, over-delivered early engagement buys a reputation unit while the marginal reputation unit is at its most valuable (the concave region of `w(R)`). Once `R` climbs past the knee (~5 reviews), the controller flips: price rises with reputation (`11` §3.4, "`R` grows → raise price"), and the loss-leader phase ends.

**The decision this drives:** *what to charge in week 1 vs week 4.* Underprice hard early, then raise price as reviews accrue — a scheduled, math-justified ramp, not a vibe. The W1→W4 sprint plan is literally a hand-run of the §3.4 controller.

---

## 4. Funnel forecast — bands, never a single number

This is the part the old version got wrong. A single "we'll make €X" number at n=1 is a lie dressed as a plan. The funnel multiplies stage rates (survivorship-weighted), and the output is an **uncertainty band** (`11` §4).

### 4.1 The funnel (survivorship-weighted)

```
Won         = Sent · P(reply) · P(conv|reply)
Revenue_exp = Won · V_net
```

Conservative designed-prior rates (configure per campaign):

| Stage | Rate | Note |
|-------|------|------|
| Lead → qualified send | 60% | scoring gate filters hard (`04`) |
| Send → delivered | 95% | deliverability hygiene (`08`) |
| Positive reply rate `P(reply)` | 20% | specificity drives reply quality |
| Reply → conversion `P(conv\|reply)` | 40% | value-first earns the close |

Blended `p = P(reply)·P(conv|reply) = 0.20 · 0.40 = 0.08`.

### 4.2 The band (binomial, spec §4.4)

```
Won_band ≈ n·p ± 1.96·√(n·p·(1−p))        (95%)
```

**Worked — 80 sends at p = 0.08, V_net ≈ €180:**

```
Won_mean = 80 · 0.08 = 6.4 wins
SD       = √(80 · 0.08 · 0.92) = √5.89 = 2.43
95% band = 6.4 ± 1.96·2.43 = 6.4 ± 4.76 → [1.6, 11.2] wins
Revenue  → conservative €290 | expected €1,150 | aggressive €2,020
```

**The decision this drives:** *how many sends to commit.* The honest 95% outcome at 80 sends spans **€290–€2,020.** That width *is the message* — not the midpoint. If the band is too wide to plan against, the move is **raise `n` until it tightens**, not "trust €1,150." The band narrows as `1/√n`:

| Sends `n` | 95% half-width (relative to mean) |
|---:|---:|
| 20 | ≈ 150% (basically uninformative) |
| 80 | ≈ 74% |
| 320 | ≈ 37% |

So the forecast is not "€1,150." It is "conservative €290 / expected €1,150 / aggressive €2,020 at this volume, and here is how much more volume buys a tighter answer."

### 4.3 Survivorship correction (the lie people skip — spec §4.5)

The first leads that reply are the **easy** ones — fresh, well-matched, low-competition. If week 1 returns a 25% reply rate, **do not** extrapolate 25% onto week 2's harder surviving pool. Re-estimate `p` on the *surviving* lead quality, not the flattering early cohort. Naive extrapolation of the best early cohort is the single most common forecast lie in cold outreach. Every forecast on this page that uses an early-cohort rate must flag whether it has been survivorship-corrected.

---

## 5. Channel mix (ordered by §2 EVH logic)

Two families. Run both on most campaigns; the order within each is the EVH order.

### Family 1 — Direct cold outreach
1. **Email** (primary) — where we have a legitimate business address + lawful basis.
2. **Platform DM** (secondary) — where email is absent; on-platform, consent-implicit.
3. **Professional network messaging** (tertiary) — B2B / enterprise segments.

### Family 2 — Value-first credibility channels (the cold-start engines)
These are the **`R = 0` ejection impulse** in channel form (§1, §3). They manufacture reputation *before* the ask:
1. **Bug bounties** — public / responsible-disclosure programs. A landed finding is a proof artifact and a warm intro in one.
2. **Paid open-source / contribution programs** — sponsored issues, bounty-funded PRs, ecosystem grant work. Delivered code is the credential.
3. **Apply-to-jobs / contract boards** — where companies signal active need; we answer with a value-first proof of capability, not a generic application.
4. **Proactive problem-solving** — find a real, fixable problem in a target's public surface and bring a working improvement as the opener.

Family 2 is the differentiator for a cold start: it converts "stranger asking for work" into "person who already helped / already shipped" — which is exactly how you buy the first reputation units below cost.

---

## 6. Why specificity wins (the moat)

Decision-makers drown in generic "we do X" pitches. The edge is **proof we examined their work and brought value**:
- naming a specific artifact, problem, or recent activity
- citing a concrete, true observation
- proposing — or already delivering — one specific improvement

Specificity is also what lifts `P(reply)` and `P(conv|reply)` in the §4 funnel above the cold-baseline. The entire workbench exists to produce that one specific, evidence-backed, value-carrying message at scale. This is the moat.

---

## 7. Build-vs-buy

- **Build:** sourcing, enrichment, scoring, drafting, health checks — all local, all ours.
- **Buy/borrow:** SMTP relay for deliverability; optional enrichment API for contact-finding.
- **Never:** a SaaS CRM that owns the lead data or sends on our behalf without an operator gate.

---

## 8. Operator gates

Two human gates; everything else automated:
1. **Send gate** — operator reviews the drafted batch before send. (This is also where the `04` §10 / `11` §6 compliance veto fires — a protected-path violation blocks the batch regardless of lead value.)
2. **Reply gate** — operator handles judgement calls in replies (pricing, scoping, commitments).

---

## 9. KPIs (now tied to the math, not vanity)

- **Leads sourced/day, qualified %, mean `P(conv|L)`** — feeds §2 EVH and §4 funnel.
- **Value artifacts delivered** (bounties landed, PRs merged, problems fixed) — the §1/§3 reputation impulse; track reviews/`R` directly.
- **Sends/day, delivery %, `P(reply)`, `P(conv|reply)`** — the live funnel rates; survivorship-correct before trusting (§4.3).
- **Calls booked, engagements won, effort-hours per win** — the denominator in EVH; if it rises, EVH falls.
- **Brier score** once outcomes log (`04` §9) — the gate that says whether any `P` above is real yet.

---

## 10. Niche binding

This workbench is **niche-agnostic by design.** ICP, scoring features, signal definitions, and example copy are configured per campaign. The pipeline architecture and the math (`11`) never change when the niche changes — swap the config, keep the machine.

---

*Platform-neutral. No entities, no persons, no niches. Two people, cold start, no registered company yet. Every rate and revenue figure here is a designed prior with a band until the `04` §9 outcome loop runs and Brier-calibrates it.*
