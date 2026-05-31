# 10 — Templates Library

> **What this file is.** The message skeletons, and the **binding table that ties every
> template variable back to a scored feature.** A template is just doctrine (`06`) in fill-
> in-the-blank form. The load-bearing part is not the prose — it is that **every `{variable}`
> traces to a populated feature in `05 §3`.** A variable you cannot fill from the evidence
> object is a generic line, and a generic line is a base-rate send (`11 §1.3`).

**Notation / weights are shared** with `11-math-models.md` and `05`. This file does not
redefine them; it shows which variable carries which feature, and therefore which weight.

---

## 1. How to use

These are **skeletons, not scripts.** The anchor / observation / improvement are always
filled from the lead's evidence object (`05`). Three hard rules before any template is sent:

1. **Never send a template with an empty `{anchor}` / `{specific_artifact}`.** That is the
   `pain_matches = 0` case — the lead is pinned at `P(reply) ≈ 0.20` (`11 §1.3`).
2. **Check the EVH bar first (`06 §3`).** Write templates in descending `EVH` order; stop
   when the daily effort budget is spent. A filled template is still a non-send if its
   `EVH` is below the queue cutoff.
3. **Tier the template to the evidence you actually have** (`06 §4`): A-tier needs
   `pain_matches` hand-verified; B-tier needs `specific_artifact + pain_matches`; C-tier is
   *not contacted.*

---

## 2. Email — A-tier (hand-personalized; needs `pain_matches` + ideally L4)

```
Subject: {anchor_short}

Hi {name} — {anchor_observation}.

{value_improvement}. We do this for {segment} regularly.

Worth a {duration} look at your {next_artifact}? If not, reply "no"
and I won't follow up.

— {sender}
{postal_address}
```

## 3. Email — B-tier (template + personalized anchor; needs `specific_artifact` + `observation`)

```
Subject: {anchor_short}

Hi {name} — looked at your {specific_artifact}. {observation}.

Quick win: {improvement}. We help {segment} with exactly this.

Open to a {duration} look? Reply "no" to opt out anytime.

— {sender}
{postal_address}
```

## 4. Platform DM (compress to 3 sentences; faster `h₁⁄₂`, `11 §5.3`)

```
Hey {name} — saw your {specific_artifact}. {observation_short}.

{improvement_short} would tighten it. We do this for {segment}.

Worth a quick look at your next one?
```

## 5. Professional network (B2B / enterprise; lead with the observation)

```
Hi {name} — {observation} on your {specific_artifact}.

{improvement}. We provide {service} for teams like yours.

Open to a short call on {topic}?
```

## 6. Open-need response (bounty / posting — leads with delivered value; **highest-converting shape**)

> This shape sets `delivered_value` (L4) **and** usually `clear_accept` (`+0.7 v`,
> `05 §3`). It is the only template that justifies the highest `c(L)` because both the
> conversion-side weights it carries are large. Use it whenever a delivered artifact exists.

```
Hi {name} — saw your {open_need}. I went ahead and {delivered_value}
({proof_link}).

Happy to take the next one on, or scope something larger. Worth a quick call?

— {sender}
{postal_address}
```

---

## 7. Follow-up templates (cadence-gated — do not send past the computed stop)

> **The follow-up count is computed, not chosen.** Per `06 §6` / `11 §5.4`: a **€180** lead
> gets **1** follow-up; an **€800** retainer gets **3**. Send a follow-up only if its
> marginal touch still clears EV: `Δreply(k)·Vnet ≥ c_followup`. Geometric spacing at
> `h₁⁄₂`, `2h₁⁄₂`, `4h₁⁄₂` (`11 §5.3`). When in doubt, stop early — a dead follow-up burns
> reputation for negative EV.

### 7a. Follow-up 1 (new angle — allowed on any lead that cleared the first send)

```
Hi {name} — one more thing on your {specific_artifact}: {second_observation}.

{second_improvement}. Happy to show you on a quick call.
```

### 7b. Follow-up 2 (soft close — **retainer-tier `Vnet` only**; €180 gigs STOP before this)

```
Hi {name} — last note. If this isn't a priority now, no worries. If it
becomes one, we're here. Reply anytime.
```

---

## 8. Objection responses

| Objection | Response frame |
|-----------|----------------|
| "Too expensive" | reframe to ROI / one small-scope trial (lowers `Vdeal` but raises `P(conv)` — re-score) |
| "Have someone" | overflow / specialist second-pair-of-hands |
| "Not now" | stay-in-touch, no pressure — this is a `Vnet`-dependent re-queue, not a follow-up |
| "Send portfolio" | send the 2 most relevant proofs, not everything (raises `pain_matches`, not volume) |

---

## 9. Variable → evidence → feature binding (the load-bearing table)

Every variable resolves to an evidence field (`05 §2`) **and** the scoring feature it
carries (`05 §3`). A variable with no backing feature is decoration — flag and cut it.

| Variable | Evidence source (`05 §2`) | Feature it carries (`05 §3`) | Weight it activates |
|----------|---------------------------|------------------------------|---------------------|
| `{name}` | enrichment (L1) | `dm_reachable` (addressing the real DM) | reply +0.6 / conv +0.5 |
| `{specific_artifact}` | evidence object | `specific_artifact` (anchor) | enables `pain_matches` |
| `{anchor_short}` / `{anchor_observation}` | L3 observation | `pain_matches` | reply +0.5 / **conv +0.9** |
| `{observation}` / `{observation_short}` | L3 evidence | `pain_matches` | reply +0.5 / **conv +0.9** |
| `{improvement}` / `{value_improvement}` | L3 evidence | `pain_matches` (value side) | conv +0.9 |
| `{delivered_value}` / `{proof_link}` | L4 (value-first channel) | `delivered_value` | strongest anchor — collapses ASK |
| `{open_need}` | source (open-need board) | `clear_accept` | reply +0.7 / **conv +0.7** |
| `{segment}` / `{service}` | scoring | — (framing, not a feature) | none — keep minimal |
| `{duration}` / `{next_artifact}` / `{topic}` | scoping the ASK | `scoped_ask` | reply +0.2 / conv +0.4 |
| `{second_observation}` / `{second_improvement}` | L3 (held back for follow-up 1) | `pain_matches` (fresh angle) | conv +0.9 |
| `{postal_address}` | compliance (`08`) | — (hard gate, not a feature) | required, not weighted |

**Read this table as the QA gate.** Before a template goes out, every filled variable
should map to a row above. If `{observation}` is empty, you have no `pain_matches` → the
message is base-rate → it is a C-tier non-send (`06 §4`). The `{segment}`/`{service}`
variables carry *no* feature — keep them short; padding them does not raise any probability,
it only raises `c(L)` and lowers `EVH`.

---

## 10. Reusable core

The **skeleton structure + variable→evidence→feature binding + cadence-gated follow-ups +
tier-to-evidence rule** is niche-agnostic. The example copy is illustrative — replace it per
campaign. The binding table (§9) and the follow-up stop (§7) carry across every campaign
unchanged.

---
*Math notation, weights, and the cadence stop are defined in `11-math-models.md`
(§0, §1.3, §5). Every weight is a designed prior until outcomes are logged and
Brier-calibrated (`11 §1.7`). Advisory until then. Platform-neutral and entity-neutral by
construction.*
