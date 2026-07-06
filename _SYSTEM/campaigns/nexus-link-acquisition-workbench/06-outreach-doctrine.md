# 06 — Outreach Doctrine

> **What this file is.** The rules for *what a message is and whether it is worth
> sending at all.* `05` decides if a lead is enriched enough to score; this file decides
> the shape of the message and — critically — whether the message clears its
> **expected-value bar** before it goes out. A message is not free: it costs operator time
> and a finite slice of channel reputation. Doctrine here is the gate that keeps low-EV
> sends from leaking out.

**Notation is shared.** `P(reply)`, `P(conv|reply)`, `P(conv|L)`, `Vnet`, `EV`, `EVH`,
`c(L)`, `Δreply(k)` are defined once in `11-math-models.md §0`. This file references them;
it does not redefine them.

---

## 1. The one rule

**Prove you analyzed their actual business before you ask for anything.**

Every message must pass the test: *could this have been sent to anyone else?* If yes, it
fails — delete and redo. In math terms (`11 §1.3`), a message that could go to anyone has
**no populated `pain_matches` feature**, which means the lead is sitting near the cold-start
base rate `P(reply) ≈ 0.20`. The "could-this-go-to-anyone-else" test *is* the
"is-`pain_matches`-real" test, in plain language.

---

## 2. Anatomy of a cold message

```
[ANCHOR]      — name the specific artifact / problem (proves we looked)
[OBSERVATION] — one true, concrete, non-insulting note
[VALUE]       — one specific improvement we'd make, or one we already delivered
[ASK]         — low-friction next step (not "buy", just "worth a look?")
[EXIT]        — easy opt-out (compliance + respect)
```

Each line is the surface form of a scoring feature from `05 §3`:

| Line | Backing feature(s) (`05 §3`) | Why it moves the number |
|---|---|---|
| ANCHOR | `specific_artifact`, `fresh` | kills the mass-blast pattern; carries the freshness bonus |
| OBSERVATION | `pain_matches` (**+0.9 `v`**) | the single highest conversion-side weight in the model |
| VALUE | `pain_matches`, `delivered_value` (L4) | reciprocity + proof; L4 replaces this line with shipped proof |
| ASK | `scoped_ask` (**+0.4 `v`**) | a scoped ask closes; a vague ask ghosts |
| EXIT | compliance | not a feature — a hard gate (`08`); also lifts reply *quality* |

When a **delivered-value artifact** exists (a landed finding, a merged fix, a working
prototype), it **replaces** the VALUE line with proof and collapses the ASK to near-zero
friction: we already helped; the call is just the next step. That is the L4 frame from
`05 §5` — and it is the only message shape that justifies the highest-effort `c(L)`.

---

## 3. Message expected-value — does this send clear the bar?

A doctrine that only talks about *quality* and never about *whether the send is worth the
minutes* is half a doctrine. Before sending, a message has an expected value (`11 §2.1`):

```
EV(message) = P(conv|L) · Vnet                    Vnet = Vdeal·(1−take)   (11 §0, §2)
EVH         = EV / c(L)                            c(L) = research + write + follow-ups
```

**Compute recipe (per message, before it goes out):**
1. Pull `P(conv|L)` from the scored lead (`04`, computed via `11 §1`).
2. Estimate `Vnet` (ticket × (1−take)); use the **conservative band** of `Vdeal` when it
   is a guess, not a quote (`11 §2.4`) — never EV on a fantasy number.
3. Estimate `c(L)` = minutes to research + write this message + its *bounded* follow-up
   tail (the follow-up count is itself computed — see §6).
4. `EVH = P·Vnet / c`. Sort the day's outbound queue by **descending EVH** (`11 §2.3`),
   spend top-down until the daily effort budget (`07`) is exhausted.

**Worked (the EVH inversion that should change behavior, from `11 §2.3`):**

| Lead | `P(conv)` | `Vdeal` | take | `Vnet` | `c` (h) | EV | **EVH** |
|---|---|---|---|---|---|---|---|
| A (fresh job post, our `05 §4` lead) | 0.51 | €200 | 0.10 | €180 | 1.5 | €91.8 | **€61/h** |
| B (retainer pitch) | 0.20 | €2400 (€800×3) | 0.03 | €2328 | 6 | €465.6 | **€78/h** |
| C (inbound, scoped) | 0.70 | €150 | 0.20 | €120 | 1.0 | €84 | **€84/h** |

**Rank: C (€84) > B (€78) > A (€61).** The *lowest-probability* lead B (20%) ranks
**second** because its `Vnet` is an order of magnitude bigger; the intuitively-best
high-prob lead A ranks **last**. **THE DECISION THIS DRIVES:** *which message you write
first today.* Doctrine says "personalize everything"; EVH says "personalize in this order,
and stop writing when the budget runs out." Without EVH you grind cheap high-prob gigs
while the retainer rots.

---

## 4. The personalization quality bar, restated as a feature requirement

- **A-tier:** fully hand-written ANCHOR + OBSERVATION + VALUE, or a delivered artifact (L4).
  Requires `pain_matches = 1` operator-verified, ideally `delivered_value` set.
- **B-tier:** template skeleton, personalized ANCHOR + OBSERVATION. Requires
  `specific_artifact` + `pain_matches` populated; VALUE may be templated.
- **C-tier:** **not contacted.** Below the quality bar = no `pain_matches` = pinned at base
  rate. C-tier is not a weaker send; it is a *non-send* (`05 §9` golden rule).

Tier is therefore not a vibe — it is a function of which features `05` managed to populate.

---

## 5. Why each part works (mechanism, not assertion)

- **Anchor** kills the "mass blast" pattern instantly — it is the visible proof of a real
  `specific_artifact` feature.
- **Observation** proves competence and carries the **+0.9 conversion weight**; it is the
  single most valuable sentence in the message.
- **Value** gives before asking (reciprocity), and demonstrates skill rather than claiming it.
- **Ask** is low-friction (a look, not a purchase) — a scoped ask closes; a vague one ghosts.
- **Exit** is compliance + respect, and empirically lifts reply *quality* (you hear from
  people who actually opted in, not the annoyed). It is also a hard `08` requirement, not
  optional politeness.

---

## 6. Cadence is part of doctrine: send once, follow up by value, stop on a computed line

Doctrine does not end at the first send. The number of follow-ups is **not** a matter of
persistence — it is a function of deal value (`11 §5.2`, §5.4). Stop following up the moment
the marginal touch goes EV-negative:

```
Δreply(k) = q · g^(k−1)                              (marginal reply lift of follow-up k)
STOP when  Δreply(k) · Vnet < c_followup             (the touch costs more than it earns)
```

**Worked (`11 §5.4`), with `q=0.08`, `g=0.5`, `c_followup ≈ €12` (≈ 0.25h):**
- **€180 lead:** k1 = `0.08·180 = €14.4 > €12` → SEND; k2 = `0.04·180 = €7.2 < €12` → STOP.
  **= 1 follow-up.**
- **€800 retainer:** k1 = €64, k2 = €32, k3 = €16, k4 = `€8 < €12` → STOP at 3.
  **= 3 follow-ups.**

**THE DECISION THIS DRIVES:** *how many times you are allowed to touch this lead* — 1 for a
small gig, 3 for a retainer, computed, not felt. The full send/hold/stop loop (including the
`ρ<1` throttle and geometric spacing at `h₁⁄₂`, `2h₁⁄₂`, `4h₁⁄₂`) lives in `07`; doctrine's
job is to *forbid* the open-ended "just keep nudging" follow-up that burns reputation for
negative EV.

---

## 7. Tone rules

- Peer-to-peer, not vendor-to-buyer.
- Specific > clever. No puns, no hype.
- Short. 5–7 sentences max. (A longer message does not raise any feature weight; it only
  raises `c(L)` and lowers EVH.)
- One ask. Never stack. (A stacked ask lowers the effective `scoped_ask` quality.)
- No flattery. Observation ≠ compliment.

---

## 8. Forbidden (these are `klDivergence` generators or base-rate sends)

- "I hope this email finds you well" — zero features; pure base-rate filler.
- "We are a leading provider of..." — vendor frame, breaks peer-to-peer; unverifiable claim.
- "I wanted to reach out..." — no anchor, mass-blast tell.
- **Any sentence that survives copy-paste to another prospect.** That sentence has no
  backing feature, so it cannot be moving a probability — by definition it is decoration.

---

## 9. Channel adaptations

- **Email:** subject = the ANCHOR. Body = full anatomy. `h₁⁄₂` ≈ 24–48h (`11 §5.3`).
- **DM:** drop the subject, compress to 3 sentences, keep the same anatomy. Faster `h₁⁄₂`.
- **Professional network:** slightly more formal; lead with the OBSERVATION.
- **Open-need response (bounty / posting):** lead with the **delivered artifact** (L4); the
  ASK becomes "happy to take the next one on." This is the highest-converting shape because
  `delivered_value` is set *and* `clear_accept` is usually present (`+0.7 v`).

---

## 10. Reusable core

The **ANCHOR→OBSERVATION→VALUE→ASK→EXIT anatomy + the EVH send-order bar + the
value-scaled follow-up stop + the "could this go to anyone else?" test** are 100%
niche-agnostic. Only the example copy and the per-niche quality dimensions of the
OBSERVATION change. The EV math and cadence stop carry across every campaign unchanged.

---
*Math notation and all formulas are defined in `11-math-models.md` (§0, §2, §5). The
`P(conv|L)` used in any EVH calc is a designed prior until outcomes are logged and
Brier-calibrated (`11 §1.7`). Advisory until then. Platform-neutral and entity-neutral by
construction.*
