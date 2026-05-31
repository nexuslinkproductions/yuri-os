# 03 — Lead Sourcing Playbook

> **This file decides where sourcing hours go.** `02` ranks *segments* by EVH; this file
> ranks the *channels* that feed those segments, by **cost per qualified lead** and
> **channel ROI per hour**. The point: stop spreading sourcing effort evenly across five
> channels and pour it into the one with the best yield-adjusted return. Notation is
> identical to `11-math-models.md` (EVH lifted to the channel level, same mechanism as
> `02` §"Segment EV"). Every rate below is a designed prior until you log real sourced→
> qualified→won counts — say so on any artifact.

## Principle

Leads come from **where the ICP is visible doing the thing that signals need** — wherever
a target publishes work, lists itself, broadcasts spend, or posts an open need. But "where
they're visible" is not the same as "where it pays to look." A channel can be full of ICP
and still be a bad use of hours if its qualify-rate is low or its leads convert cheap. The
yield math below turns "five plausible channels" into a ranked spend order.

---

## Sourcing-yield notation (consistent with `11` §0, §2, §4)

| Symbol | Meaning | Units |
|---|---|---|
| `n_src` | raw leads sourced from a channel in a window | count |
| `c_src` | sourcing effort spent on that channel | hours |
| `q` | qualify-rate = fraction of sourced leads that pass the `04` gate | [0,1] |
| `n_q` | qualified leads = `n_src · q` | count |
| `CPQL` | **cost per qualified lead** = `c_src / n_q` | hours / qualified-lead |
| `P̄(conv\|q)` | avg convert-prob of this channel's *qualified* leads (from `04` §1) | [0,1] |
| `V̄net` | avg net deal value of this channel's leads (`11` §0) | currency |
| `EVH(ch)` | channel ROI per hour (defined below) | currency / hour |

> Reusing `q` for qualify-rate here does not collide with `11` §5's `q` (first-follow-up
> lift) — different file, different model, both labelled at point of use. If you ever put
> both in one sheet, write them `q_qualify` and `q_followup`.

---

## Cost per qualified lead (CPQL) — the first cut

A channel that surfaces 100 leads where only 3 survive the `04` gate is worse than one
that surfaces 20 leads where 10 survive — even though the first looks busier.

```
n_q  = n_src · q                         qualified leads
CPQL = c_src / n_q = c_src / (n_src · q)  sourcing-hours per qualified lead
```

**Compute recipe (per channel, per week):**
1. Log `n_src` (raw leads pulled) and `c_src` (hours spent pulling + de-duping them).
2. After the `04` gate runs, log `n_q` (how many passed) → back out `q = n_q / n_src`.
3. `CPQL = c_src / n_q`. Lower is better. This is your channel efficiency number.

**Worked example:**
| Channel | `n_src` | `c_src` (h) | `q` | `n_q` | **CPQL (h/qual)** |
|---|---|---|---|---|---|
| 1 — Platform discovery | 120 | 3.0 | 0.10 | 12 | **0.25** |
| 3 — Spend signals | 40 | 2.0 | 0.35 | 14 | **0.14** |
| 4 — Open-need boards | 25 | 2.0 | 0.50 | 12.5 | **0.16** |
| 2 — Registries | 200 | 2.5 | 0.05 | 10 | **0.25** |

**Read:** Channel 1 and Channel 2 both look productive on raw volume (120, 200 leads) but
their CPQL (0.25 h/qualified) is the *worst* in the set — most of what they surface dies at
the `04` gate. Spend signals (0.14) and open-need boards (0.16) cost roughly **half the
hours per qualified lead**, because their leads arrive pre-loaded with the high-weight
scorer features (`explicit budget` `+0.4/+0.8`, `bounty/clear-accept` `+0.7/+0.7` — `11`
§1.3). **CPQL alone says: shift hours toward Channels 3 and 4.**

---

## Channel ROI ranking — EVH lifted to the channel (the real cut)

CPQL measures *cost* to get a qualified lead. It does not measure what that lead is *worth*.
A cheap channel full of €120 one-offs can lose to a pricier channel full of retainer-shaped
leads — exactly the EV inversion from `11` §2.3. So rank channels by **net value per
sourcing-hour**, the same `EVH` mechanism used for leads (`11` §2) and segments (`02`),
applied one level up:

```
EV per qualified lead   = P̄(conv|q) · V̄net
Net value created /wk    = n_q · P̄(conv|q) · V̄net
EVH(ch) = (n_q · P̄(conv|q) · V̄net) / c_src        currency per sourcing-hour
```
**Rank channels by descending `EVH(ch)`; fund the top channels until the weekly sourcing-
hour budget is spent.** That is the literal allocation decision.

**Compute recipe:**
1. From CPQL step: `n_q`, `c_src` per channel.
2. From `04`: `P̄(conv|q)` for that channel's qualified leads.
3. Estimate `V̄net` (use the **conservative lower band** when value is guessed, not quoted —
   `11` §2.4 fat-tail guard; a channel must not top the ranking on a fantasy ticket).
4. `EVH(ch) = n_q · P̄(conv|q) · V̄net / c_src`. Sort. Spend top-down.

**Worked example (carrying the CPQL table forward):**
| Channel | `n_q` | `P̄(conv\|q)` | `V̄net` (cons.) | `c_src` (h) | Net value/wk | **EVH(ch) (€/h)** |
|---|---|---|---|---|---|---|
| 3 — Spend signals | 14 | 0.30 | €300 | 2.0 | €1,260 | **€630** |
| 4 — Open-need boards | 12.5 | 0.45 | €150 | 2.0 | €844 | **€422** |
| 1 — Platform discovery | 12 | 0.25 | €250 | 3.0 | €750 | **€250** |
| 2 — Registries | 10 | 0.20 | €200 | 2.5 | €400 | **€160** |

**Read this against the CPQL table:** open-need boards (Channel 4) had the lower CPQL tie
and the highest qualified-lead probability (they *asked*), but **spend signals (Channel 3)
win the ROI ranking** because their leads carry a larger `V̄net` (active budget → bigger
tickets), and value-per-hour is what funds the operation — not lead count, not even
qualify-rate. Registries (Channel 2) rank last on *both* CPQL and EVH: high raw volume, low
qualify-rate, small tickets → the volume is a trap. **THE DECISION THIS DRIVES:** put the
top sourcing hours into Channel 3, then 4; treat Channels 1–2 as fill, not focus, until
their logged numbers earn a promotion.

> Two channels can swap rank the moment you have real data — these are priors. The
> *mechanism* (rank by EVH) is what's load-bearing; the specific order is provisional.

---

## Survivorship correction on yield (`11` §4.5) — do not extrapolate the easy cohort

The single most common sourcing lie: a channel's *first* pull skims the most obvious,
freshest, highest-intent leads, posts a great `q` and `P̄(conv|q)`, and you extrapolate
those rates to the next 200 leads — which are the harder, deeper, lower-intent remainder.

**Rule (from `11` §4.5):** re-estimate `q` and `P̄(conv|q)` on the **surviving** (later,
harder) cohort, not the easy early skim. A channel's true EVH is its *steady-state* yield
after the cream is gone, not its launch-week yield. Flag any channel whose ranking depends
on first-pull numbers as **unconfirmed** until a second, deeper pull reproduces the rate.

**Worked:** Channel 4 launch pull: 10 leads, `q=0.70` (skimmed the obvious open bounties).
Second pull, 15 leads, `q=0.37` (the remaining needs are vaguer). Blended `q ≈ 0.50` (used
above) — **not** 0.70. Had you ranked on the 0.70 first-pull number, Channel 4 would have
falsely topped Channel 3. Survivorship correction is what kept the ranking honest.

---

## Source channels

Channels are configured per campaign. The five families below cover most niches; enable and
tune per campaign in `config/seeds.json`. Each channel notes the **scorer features (`11`
§1.3)** its leads typically carry — that's *why* its qualify-rate and convert-prob land
where they do.

### Channel 1 — Platform / ecosystem discovery
- Topic, tag, and location search on the platforms where the ICP is active
- Directories and indexes for the target sector
- Public profiles, accounts, and repositories matching the niche

**Harvest:** handle/name, activity markers, cadence, last-active date, link, contact surface.
**Yield profile:** high `n_src`, **low `q`** (lots of off-ICP noise) → high CPQL. Carries
*fresh/active* signals but rarely *explicit budget* — fill channel, not focus.

### Channel 2 — Business registries / company-data sources
- National business registries and company-data providers (OpenCorporates-style aggregators that expose legal name, jurisdiction, address, sector codes)
- Chamber / trade-association member directories for the target region
- Industry association member lists

**Harvest:** legal name, jurisdiction, address, website, registered contact, sector code.
**Yield profile:** very high `n_src`, **lowest `q`** (existence ≠ active need) → highest
CPQL, smallest tickets. Strong for *verifying* an org's identity, weak as a primary yield
source. Use to enrich leads found elsewhere, not to originate them.

### Channel 3 — Spend / activity signals
- Public ad and spend libraries — who is actively paying for acquisition
- Funding / hiring trackers — who just raised or is scaling headcount
- These are *gold*: active spend = has budget = has need.

**Harvest:** organization name, spend/activity samples, run duration, landing surface.
**Yield profile:** moderate `n_src`, **high `q`**, and crucially leads carry *explicit/
verified budget* (`+0.4/+0.8`, `+0.3/+0.6` — `11` §1.3) → larger `V̄net` → **top EVH(ch)**.
This is the focus channel in the worked ranking.

### Channel 4 — Open-need boards (value-first feed)
This channel feeds the Family-2 credibility engine from `01`:
- Bug bounty / responsible-disclosure program listings
- Paid open-source / sponsored-issue / contribution-bounty boards
- Apply-to-jobs and contract boards where companies post concrete, current need

**Harvest:** organization, exact stated need, program/posting URL, scope, reward/terms, contact route.
**Yield profile:** lower `n_src` but **highest `q` and `P̄(conv|q)`** — leads carry
*bounty/clear-accept-criteria* (`+0.7/+0.7`) and they *asked*. Tickets often small, so it
ranks 2nd on EVH behind spend signals; but its low CPQL and cold-start value (a delivered
artifact = proof) make it the natural launch channel (see `01`).

### Channel 5 — Adjacency expansion
- Expand from any won engagement or delivered value artifact into its neighbors
- "Organizations like X" recommendations and public ecosystem graphs
- Co-listings, shared directories, and sector-cluster mining

**Yield profile:** **`n_src = 0` at launch** — there are no neighbors to expand from until
the first win exists. Excluded from the ROI ranking on day one (it has no `c_src` to spend
and no leads to yield). Once seeded it typically has the *highest* `q` of any channel
(warm-adjacent), so it climbs the EVH ranking fast — but only later.

> Cold-start note (ties to `11` §3.3): Nexus Link begins with zero warm network, so Channel
> 5 is empty at launch and compounds only after the first delivered value artifact. This is
> the same `R=0` unstable-basin problem as reputation — the early loss-leader work that buys
> the first reviews (`01`, `11` §3.3) is *also* what seeds Channel 5's adjacency graph. Do
> not budget sourcing hours to Channel 5 until it has a seed.

---

## Harvest method (automated)

1. **Seed list** — operator provides tags, locations, sector codes, board queries.
2. **Crawl** — scripted pull of public profile/program data (respect robots + rate limits).
3. **Dedupe** — by handle + domain + legal name.
4. **Stage** — write raw leads to `leads/raw/` as JSON.
5. **Instrument** — record `n_src` and `c_src` per channel on every pull. **Without these two
   counts you cannot compute CPQL or EVH(ch), and channel ranking degrades to vibes.**

## Data per lead (raw schema)

```json
{
  "id": "uuid",
  "source": "platform|registry|spend_signal|open_need|adjacency",
  "handle": "@org",
  "legal_name": "Org Ltd",
  "website": "https://...",
  "contact": {"email": null, "dm": true, "program_url": null},
  "signals": {"activity": "high", "last_active": "2026-05-01", "actions_30d": 8},
  "open_need": null,
  "niche": "configurable",
  "raw_pulled_at": "2026-05-30T...",
  "source_batch": {"channel": "spend_signal", "pull_id": "uuid", "c_src_hours": 2.0, "n_src": 40}
}
```

The `source_batch` block is what makes per-channel yield computable: it tags each lead with
the pull it came from and that pull's `c_src`/`n_src`, so CPQL and EVH(ch) fall out of a
`group by channel` once `04` outcomes land.

## Compliance at source

- Only **public** data.
- Respect robots.txt + platform ToS + rate limits.
- Store lawful-basis flag per lead (legitimate interest vs consent).
- No scraping behind logins.
- For Channel 4, respect each program's published rules, scope, and disclosure policy.

> Compliance is a **hard gate, not a yield input.** A channel with great EVH but a consent
> violation does not get ranked-then-throttled — it is vetoed outright (`08`; the
> non-offsettable `protectedPathViolations` veto, `11` §6.4). No CPQL or EVH number buys
> past a ToS/consent breach, because a ban is the discontinuous `−δ` jump the smooth ranking
> math does not cover (`11` §3.5).

## Registry notes

National business registries and OpenCorporates-style company-data sources are the backbone
for *verified org identity* (legal name, jurisdiction, address, sector) — but per the yield
table they are a weak *origination* channel (lowest `q`, highest CPQL). Use them to enrich
and verify leads sourced from higher-EVH channels, paired with a website lookup for the
contact surface. Choose the registry/source that covers the campaign's target geography —
this workbench is global and does not bind to any single national registry.

## Niche-agnostic core

The **source → harvest → dedupe → stage → instrument** loop, plus the **CPQL + EVH(ch)
channel ranking and the survivorship correction**, is reusable. Only the *channels*, *signal
fields*, and the starting yield priors (`q`, `P̄(conv|q)`, `V̄net`, `c_src`) change per niche.
The ranking mechanism never changes; the numbers it ranks do, and they only become real once
logged.
