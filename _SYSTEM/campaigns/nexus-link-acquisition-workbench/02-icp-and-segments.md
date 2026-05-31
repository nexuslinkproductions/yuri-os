# 02 — ICP and Segments

> **This file decides where the next hour goes at the *segment* level.** `04` ranks
> individual leads by EVH; this file ranks the *segments* those leads come from, so you
> point sourcing (`03`) and sending (`07`) at the pools with the best expected value per
> hour *before* you ever score a single lead. Notation is identical to
> `11-math-models.md`. Every probability below is a designed prior until outcomes are
> logged and Brier-calibrated (§1.7) — say so on any artifact.

## Ideal Client Profile (ICP)

A business or operator who:
- **Is actively doing the thing** that creates ongoing need (shipping product, hiring, publishing, running operations)
- **Has budget** (existing spend, paid headcount, commercial output, funding)
- **Shows a visible, addressable gap** we can close (a fixable problem in their public surface)
- **Is reachable** (discoverable contact, active DMs, or an open program/posting)
- **Is not a direct competitor**

Note: well-funded and well-established targets are explicitly **in scope.** A solid
company with a real, narrow gap is a high-value lead — the gap is the opportunity, not a
disqualifier.

**The five ICP criteria are not just filters — they are the `xᵢ` features the scorer in
`04` reads.** "Has budget" is `+0.4` reply / `+0.8` conv in `11` §1.3; "decision-maker
reachable" is `+0.6`/`+0.5`; "no reachable contact" is the `−2.0`/`−2.0` that makes a
lead effectively unpursuable. So the ICP is the qualitative front-door to the same logit
model `04` runs quantitatively. Same criteria, two resolutions.

---

## Segment EV — why segments get ranked, not just listed

A segment is a *pool* of leads with a shared `(P, Vnet, c)` profile. You only have so
many hours; you should point them at the pool with the highest **expected value per
hour**, exactly the EVH logic from `11` §2, lifted one level up from lead to segment:

```
EV(seg)  = P̄(conv|seg) · V̄net(seg)            (segment-average prob × segment-average net value)
EVH(seg) = EV(seg) / c̄(seg)                     (per-hour, the only comparable unit)
```
where `P̄`, `V̄net`, `c̄` are the segment's average convert-prob, average net deal value,
and average effort-hours to pursue one lead in it. **Rank segments by descending `EVH(seg)`**;
that ordering tells sourcing (`03`) which pool to fill first and sending (`07`) where the
daily effort budget goes first.

> Same fat-tail guard as `11` §2.4: a segment with a huge `V̄net` on a thin, guessed `P̄`
> can dominate EVH on a fantasy. Use the **conservative lower-band `V̄net`** for any
> segment whose value is estimated, not observed, and cap how many hours one speculative
> segment may eat per week.

---

## Primary segment template

Segments are configured per campaign. Define each segment by: *who they are, their pain,
the signal that surfaces them, the value-first hook,* **and a starting `(P̄, V̄net, c̄)`
prior so it can be ranked by EVH.** The pattern below is the reusable skeleton — fill the
brackets per niche.

### Segment A — Active spenders
Run paid acquisition / have committed budget; always need better output. Pain: cost or
quality of current solution.
- Signal: visible active spend / commercial output
- Hook: a concrete improvement to something they're currently paying for
- Scorer features: *explicit budget* (`+0.4`/`+0.8`), often *verified prior spend*
  (`+0.3`/`+0.6`) → high `P̄`; tickets mid; effort mid.

### Segment B — Scaling operators
Outgrowing their current capacity. Pain: a specific function has become the bottleneck.
- Signal: growth markers + signs of strain (slipping cadence, hiring posts, backlog)
- Hook: "this looks like a bottleneck — here's the fix"
- Scorer features: budget often *inferred not stated* (lower reply weight), but `V̄net`
  can be high (retainer-shaped) → wide value band, use the conservative end.

### Segment C — Buyers needing overflow / specialist help
Teams that win work then scramble for capacity or expertise. Pain: gaps between demand
and in-house ability.
- Signal: stated need without matching internal depth (job posts, thin coverage of a service they list)
- Hook: overflow capacity / specialist second pair of hands
- Scorer features: *specific scoped ask* (`+0.2`/`+0.4`), repeatable → **high LTV**,
  which is exactly the kind of large `V̄net` that lifts a moderate-`P̄` segment up the EVH
  ranking (the §2.3 inversion).

### Segment D — Active-need signalers
Anyone broadcasting a concrete, current need we can fill. Pain: an open, unsolved problem.
- Signal: open bug bounty, posted contract/job, public issue, support backlog
- Hook: a working contribution against the exact stated need (this is where the
  proactive-contribution channels feed directly — see `01`/`03`)
- Scorer features: *bounty/contribution with clear accept criteria* (`+0.7`/`+0.7`) →
  highest `P̄` in the set (they *asked*); tickets often small but `c̄` is also low, which
  keeps EVH competitive.

---

## Segment scoring priority — EVH-ranked, with the worked numbers

The old default ranked by "warmth + LTV intuition." Replace that intuition with EVH.
Below are **illustrative priors** (n=1, not measured — wide bands apply) plugged into
`EVH(seg) = P̄·V̄net / c̄`:

| Segment | `P̄(conv)` | `V̄net` (conservative) | `c̄` (h) | EV | **EVH (€/h)** |
|---|---|---|---|---|---|
| D — Active-need signalers | 0.45 | €150 | 1.0 | €67.5 | **€68** |
| C — Overflow / specialist | 0.20 | €2,000 (retainer-shaped) | 6.0 | €400 | **€67** |
| A — Active spenders | 0.30 | €300 | 1.5 | €90 | **€60** |
| B — Scaling operators | 0.18 | €600 | 3.0 | €108 | **€36** |

**Read this exactly like `11` §2.3:** D wins on *low cost + high prob* (they asked), but
C — the **lowest-probability** pursuable segment (20%) — lands essentially tied for first
because its retainer-shaped `V̄net` is an order of magnitude larger. A naive
"chase-the-warmest" ranking would put A or D first and let C rot; EVH says C earns nearly
the same hour-priority as D despite being the long shot. **B ranks last** here not because
it's bad but because high `c̄` (inferred budget → more qualification work) drags its
per-hour return down.

**THE DECISION THIS DRIVES:** which *pool* sourcing (`03`) fills first and which pool the
daily send budget (`07`) drains first — before any individual lead is scored. Recompute
`EVH(seg)` whenever you log real per-segment reply/convert/effort numbers; the priors
above will move, possibly a lot.

> Default ordering *as a tie-broken fallback when EVH numbers are still pure priors*:
> 1. Active-need signalers (warmest cold lead — they asked, lowest `c̄`)
> 2. Buyers needing overflow / specialist help (high `V̄net`, repeat LTV)
> 3. Active spenders (budget + volume)
> 4. Scaling operators (volume, variable/inferred budget, high `c̄`)
>
> But the moment you have data, **EVH overrides this list.** The list is the prior; EVH is
> the measurement.

---

## Anti-ICP (do not target)

- Direct competitors
- Dead accounts / orgs (no activity in 90 days)
- No discoverable contact AND no open DMs AND no open program
- Targets with obvious, complete in-house coverage of exactly our service (no gap to close)

Each anti-ICP maps to a scorer kill-feature: "no reachable contact" → `−2.0`/`−2.0`
(unpursuable); "region requires consent we lack" → `−1.2`/`−0.4` **and** a hard
compliance gate in `08` (the non-offsettable `protectedPathViolations` veto, `11` §6.4 —
no segment EV buys past it).

---

## Disqualifiers as data

Every disqualifier is a **scoring signal, not just a filter.** A target that is highly
active but shows a clear, addressable gap is *higher* priority, not lower — the gap is the
opportunity. In scorer terms, "active + visible gap + reachable" stacks positive logits
(`fresh`, `budget`, `DM`, `match`); only the genuine kills (no contact, consent-blocked,
crowded-to-death) push `z` down. The gap raises the score; it does not lower it.

---

## Reusable core

The **segmentation method** — *active + has-budget + visible-gap + reachable +
not-competitor* — plus the **EVH segment-ranking** is the niche-agnostic part. Only the
segment names, signals, hooks, and the starting `(P̄, V̄net, c̄)` priors are configured per
campaign. The ranking *mechanism* never changes; the numbers it ranks do.
