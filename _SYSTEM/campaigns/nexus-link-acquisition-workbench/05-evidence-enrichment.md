# 05 — Evidence Enrichment

> **What this file is.** The bridge between "we found a lead" and "we can score
> and send to it." Enrichment is not busywork — every enrichment level **populates a
> specific scoring feature `xᵢ`** (see `11-math-models.md` §1.3) and therefore moves a
> real probability. This file makes that link explicit: enrichment → feature → `P(reply)` /
> `P(conv)` → EV. If an enrichment step does not move a feature, it does not earn the time.

**Notation is shared with the math spec.** `xᵢ`, `wᵢ`, `z`, `σ`, `P(reply|L)`,
`P(conv|reply,L)`, `P(conv|L)`, `EVH` are all defined once in `11-math-models.md §0`.
This file does not redefine them; it shows which evidence populates which `xᵢ`.

**Honesty contract (inherited).** Every weight below is a **designed prior, not learned**
(`11 §1.3`). Until ≥30 outcomes are logged and Brier-checked (`11 §1.7`), every uplift
number on this page is a *planned* lift, not a measured one. State that on any artifact
built from this file.

---

## 1. Purpose

Every lead must carry **proof we did our homework** before outreach. Enrichment attaches
that evidence so the message can be specific — and, where possible, carry an
already-delivered improvement.

But enrichment has a second, harder job: **it is how a lead gets a real score.** A bare
lead (a URL and a name) sits at the cold-start bias — `z_reply = b_r = −1.4`,
`P(reply) ≈ 0.20` (`11 §1.3`). Every enrichment step that flips a feature `xᵢ` from
`0 → 1` adds its weight `wᵢ` to `z` and lifts the probability. Enrichment is the
**evidence-to-probability uplift engine.** Skipping it doesn't just make the message
generic — it leaves the lead pinned at the base rate.

---

## 2. The evidence object (now timestamped)

For each scored lead, gather:

```json
{
  "id": "uuid",
  "evidence": {
    "specific_artifact":  "Their public artifact / product / posting / system we examined",
    "observation":        "One concrete, true, non-insulting issue or gap",
    "improvement":        "The specific fix we would make (or have already made)",
    "proof_we_examined":  "A precise, verifiable detail only a real reviewer would cite",
    "company_facts":      {"founded": 2019, "size": "5-10", "sector": "configurable"},
    "recent_activity":    "Concrete recent activity that proves they're active",
    "delivered_value":    null,
    "captured_at":        "2026-05-30T14:00:00Z",
    "source_age_days":    0
  },
  "features": {
    "fresh":            {"x": 1, "captured_at": "2026-05-30T14:00:00Z"},
    "budget_stated":    {"x": 1, "captured_at": "2026-05-12T09:00:00Z"},
    "dm_reachable":     {"x": 1, "captured_at": "2026-05-30T14:00:00Z"},
    "pain_matches":     {"x": 1, "captured_at": "2026-05-30T14:00:00Z"},
    "crowded":          {"x": 1, "captured_at": "2026-05-30T14:00:00Z"}
  }
}
```

`delivered_value` holds a link/reference to an already-shipped contribution (a landed
bounty finding, a merged fix, a working prototype) when the value-first channels from
`01` produced one. A populated `delivered_value` is the strongest possible anchor — it
turns the message ASK from "worth a look?" into "I already did one; want the next?"

**Why `captured_at` per feature, not just per object.** Different features age at
different rates and were gathered at different times. A budget figure scraped 18 days ago
and a "decision-maker reachable" fact verified today must decay independently. Per-feature
timestamps are what make the confidence-decay rule (`11 §1.8`, §6 below) applicable at all.
Without them, decay is theater.

---

## 3. The enrichment → feature → probability map

This is the core of the file. Each enrichment step exists **because** it populates a
feature in the scoring model. The weights are the designed priors from `11 §1.3`.

| Enrichment step (what the operator does) | Feature `xᵢ` populated | `w` (reply, logits) | `v` (conv, logits) | What it proves |
|---|---|---|---|---|
| Note post/activity is < 24h old | `fresh` | **+0.9** | 0 | timing — fresh posts reply far more, decays fast (`11 §5`) |
| Find an explicit stated budget / price band | `budget_stated` | **+0.4** | **+0.8** | intent + ability to pay |
| Identify and verify a reachable decision-maker | `dm_reachable` | **+0.6** | **+0.5** | a gatekeeper kills conversion |
| Match their pain to a proof-piece we hold | `pain_matches` | **+0.5** | **+0.9** | we can *show*, not tell → converts |
| Confirm verified prior spend / paid history | `prior_spend` | **+0.3** | **+0.6** | they have paid before |
| Pin a specific scoped ask (not vague) | `scoped_ask` | **+0.2** | **+0.4** | scoped → closes; vague → ghosts |
| Confirm objective accept-criteria (bounty) | `clear_accept` | **+0.7** | **+0.7** | objective accept = high convert |
| Detect heavy competition (many bidders) | `crowded` | **−0.5** | **−0.3** | crowded → reply + convert drop |
| Detect a consent/compliance block (region) | `consent_gap` | **−1.2** | **−0.4** | hard gate in `08`; also tanks the score |
| Confirm no reachable contact at all | `no_contact` | **−2.0** | **−2.0** | effectively unpursuable — drop |

**How to read a weight.** `w` is in **logit units**; `+0.7 ≈ ×2 on the odds`,
`+0.9 ≈ ×2.5`. They **add** in `z`-space, then squash once with `σ` (`11 §0`). That is
why enrichment is cumulative: each feature is one more additive bump on `z`, not a
multiplier you have to reason about in probability space.

---

## 4. The uplift, computed level by level (worked example)

This is the same lead as `11 §1.5`, but built up **one enrichment at a time** so you can
see each level pay for itself. Reply bias `b_r = −1.4`. Convert bias `b_c = −0.4`
(`11 §1.3`).

| State | Features active | `z_reply` | `P(reply)=σ(z)` | Δ vs prior level |
|---|---|---|---|---|
| **L0 bare lead** | none | `−1.4` | `σ(−1.4) = 0.198` | — (base rate) |
| **L1 auto** | `+ fresh, + dm_reachable` | `−1.4+0.9+0.6 = 0.1` | `σ(0.1) = 0.525` | **+0.327** |
| **L2 artifact** | `+ budget_stated` | `0.1+0.4 = 0.5` | `σ(0.5) = 0.622` | **+0.097** |
| **L3 judgement** | `+ pain_matches`, `− crowded` | `0.5+0.5−0.5 = 0.5` | `σ(0.5) = 0.622` | **+0.000** |

Worked digits for the lines that matter:
```
σ(0.1) = 1/(1+e^−0.1) = 1/(1+0.9048) = 0.525
σ(0.5) = 1/(1+e^−0.5) = 1/(1+0.6065) = 0.622
```

**Read the table honestly.** The biggest single uplift is **L0→L1** (+0.327): just being
fresh + reaching a real decision-maker more than doubles reply probability. **L2** adds a
solid +0.097. **L3** here adds **zero to `P(reply)`** because `pain_matches` (+0.5) is
exactly cancelled by `crowded` (−0.5) — but it is *not* wasted, because `pain_matches`
carries a **+0.9 on conversion** (`v`), while `crowded` only costs −0.3 there:

```
z_conv (L3) = −0.4 + 0.8(budget) + 0.5(dm) + 0.9(pain) − 0.3(crowded) = 1.5
P(conv|reply) = σ(1.5) = 0.818
P(conv|L)     = 0.622 × 0.818 = 0.509   (matches 11 §1.5)
```

**THE DECISION THIS DRIVES:** *which enrichment level to stop at.* Diminishing returns are
visible in the table — you push enrichment until the next level's combined uplift to
`P(conv|L)·Vnet` (i.e. to EV, `11 §2`) no longer beats the minutes it costs. For a
low-`Vnet` lead, L1+L2 may be the rational stop; for a retainer-sized `Vnet`, push to
L3/L4 because the conversion-side weights (`pain_matches +0.9 v`, `clear_accept +0.7 v`)
are where the money is.

---

## 5. Enrichment levels (operational definition)

Each level is now defined by **which features it can populate**, not just by effort.

- **L1 (auto) — scriptable.** Populates `fresh`, `dm_reachable` (where public),
  `prior_spend`, `crowded`, `no_contact`, company facts, recent activity, contact.
  *Moves mostly the reply side.* Fully scriptable from `03` sources.
- **L2 (semi) — scriptable + light review.** Populates `budget_stated`, `scoped_ask`,
  `clear_accept` and identifies the `specific_artifact`. *Starts moving the conversion side.*
- **L3 (judgement) — AI-assisted, operator-verified.** Populates `pain_matches` plus the
  free-text `observation` + `improvement`. **This is the highest-`v` (conversion) lever in
  the table.** It is the move that earns `pain_matches +0.9 v`.
- **L4 (delivered) — value already shipped.** An actually delivered improvement against
  their need (value-first channel). Sets `delivered_value`. Optional but decisive: it does
  not just bump a feature, it changes the *message frame* and collapses the ASK friction.

---

## 6. Evidence ages — apply confidence decay (`11 §1.8`)

A feature is not worth its full weight forever. A "verified budget" captured 20 days ago is
weaker than one captured today. Before scoring, decay each feature by its own age:

```
x_effective = x_base · 0.5^(age_days / halfLife)        (11 §1.8)
```

**Worked:** the `budget_stated` feature in §2 was captured 2026-05-12, scored today
2026-05-30 → `age = 18 days`, `halfLife = 14 days`:
```
x_eff = 1.0 · 0.5^(18/14) = 0.5^1.286 = 0.410
```
So instead of feeding `+0.4 logits` into `z_reply`, the stale budget feeds
`0.410 × 0.4 = +0.164`. The reply-side contribution of that one feature dropped ~59%.

**THE DECISION THIS DRIVES:** *whether to re-verify before sending.* If decay has eaten a
load-bearing feature down below ~0.5, the cheaper move is often to re-scrape / re-confirm
it (resetting `captured_at`) than to send on a stale signal. Fresh evidence is also what
keeps the U-governor happy (§7).

---

## 7. Enrichment is the move that *lowers* U (the internal reason to enrich first)

> **INTERNAL framing — never client-facing.** The `U` / energy-landscape governor
> (`11 §6`) is an internal state-gating capability. It is never a product, never named to
> a buyer. This subsection is operator-only.

The send-batch governor `gateProposal(before, after)` (`11 §6.3`) **rejects** a transition
whose `ΔU > 0`. Sending on thin, unverified leads *raises* U through two terms:
- `klDivergence(claimed, verified)` — the gap between what we *claim* about a lead and what
  we have actually verified. A bare lead with a confident pitch is pure claimed-vs-verified
  drift → **strong U penalty.**
- `−informationGain` — a state transition that *reduces* uncertainty **lowers** U.

Enrichment is precisely the `informationGain` move: it raises `verifiedEvidenceCredit`,
raises `informationGain`, and drops `klDivergence`. So:

```
enrich 5 leads  →  ↑verifiedEvidence, ↑infoGain, ↓KL  →  ΔU < 0  →  gateProposal accept=true
send on bare leads →  ↑KL (hype>evidence), no infoGain →  ΔU > 0  →  gate may reject the batch
```

**Worked (the healthy case from `11 §6.4`):** enriching before sending yields `ΔU < 0`,
`accept=true` — "this is a state-improving move, proceed." **THE DECISION THIS DRIVES:**
*enrich-before-send is energetically favored;* a batch built on bare leads can be vetoed at
the gate before a single message goes out. Enrichment is not just politeness — it is what
makes the send-batch *passable*.

---

## 8. Enrichment sources

### For the `specific_artifact` anchor (→ identifies what to observe)
- Their most recent / most prominent public work, product, or system
- A named project, shipment, or initiative
- An explicit open need (bounty scope, job posting, public issue)

### For company facts (→ `prior_spend`, segment, recency)
- Website about page
- Business registry / company-data source (see `03`)
- Professional network company page

### For the concrete observation (→ `pain_matches`, the moat)
This is what the build lane / operator generates by **actually examining** the specific
artifact — it is the L3 work that earns the highest conversion weights:
- the relevant quality dimensions for the target's domain
- one concrete, true, non-insulting observation
- one specific improvement we'd make — ideally one we can prototype or have already delivered

---

## 9. The golden rule

**No outreach without an L3 evidence anchor.** Mechanically: do not send unless
`pain_matches = 1` (the +0.9 `v` feature is populated and operator-verified). If we can't
say something specific and true about their actual work, the lead is not ready — hold it,
don't blast a generic message. A generic send is mathematically a lead pinned near the
`b_r` base rate (`P(reply) ≈ 0.20`) **and** a `klDivergence` spike at the U-gate (§7).
When an L4 `delivered_value` exists, lead with it.

---

## 10. Anti-patterns (and what they do to the math)

| Anti-pattern | What it actually is |
|---|---|
| Generic flattery ("love your work!") | zero features populated → lead stuck at `P(reply) ≈ 0.20` |
| Fake specificity ("your product is great") | claimed `pain_matches` with no verification → `klDivergence` spike, U-gate risk |
| Insulting observations ("your work is bad") | not a feature — a reputation `−δ` jump (`11 §3.5`); the smooth math does not save you |
| Observations that aren't true (they'll know) | `klDivergence` between claimed and verifiable → drift penalty, and a real trust loss |
| Sending on stale evidence without re-check | decayed `x_eff` (§6) → you *think* you scored high, you didn't |

---

## 11. Evidence → message bridge

The evidence object feeds directly into the outreach template variables (`06`, `10`):
- `{specific_artifact}` → opening line / anchor
- `{observation}`       → proof we examined (the `pain_matches` evidence)
- `{improvement}`       → value offer
- `{delivered_value}`   → the strongest opener when present (L4)

Every variable on a template traces back to a populated feature in §3. A template variable
with no backing feature is a generic line — see `10` variable-reference table for the full
binding.

---

## 12. Reusable core

The **timestamped evidence object + L1–L4 levels + enrichment→feature→probability map +
confidence decay + golden rule** are fully niche-agnostic. Only the *quality dimensions*
used to generate the `pain_matches` observation change per niche. The weights, the decay
law, and the U-gate framing carry across every campaign unchanged.

---
*Math notation and all weights are defined in `11-math-models.md` (§0, §1.3, §1.8, §6).
Every uplift number here is a designed prior until outcomes are logged and Brier-calibrated
(`11 §1.7`). Advisory until then. Platform-neutral and entity-neutral by construction.*
