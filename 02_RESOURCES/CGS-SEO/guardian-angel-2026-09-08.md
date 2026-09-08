# Guardian Angel — the traffic was landing on a 404

Worked 08/09/2026. Every number below is read from Search Console or from a live HTTP fetch.

---

## What I expected to find, and what was actually there

The plan said: *"Guardian Angel — 4,889 impressions, 368 clicks, position 8. You already sell this
(`/artikel/guardian-angel/`). It does not need a new page; it needs its existing page improved."*

The first half of that was a **misattribution**. Those numbers are the **query-level** total for every
search containing "guardian" across the whole site (real figure: 4,970 impressions / 367 clicks /
Ø 8.2, 16 months). Breaking the same filter down **by page** tells a completely different story:

| Page | Clicks | Impressions | Live status 08/09 |
|---|---:|---:|---|
| `/artikel/guardian-angel4-owb/` | **270** | **4,343** | **404** |
| `/en/artikel/guardian-angel4-owb/` | 52 | 276 | **404** |
| `/en/artikel/guardian-angel/` | 18 | 70 | 200 |
| `/artikel/guardian-angel-3-iwb-gen-2/` | 15 | 297 | 301 → generic `/artikel/iwb-holster/` |
| `/artikel/guardian-angel-4-iwb/` | 10 | 203 | 301 → generic `/artikel/iwb-holster/` |
| `/artikel/guardian-angel/` | **4** | **76** | 200 |
| `/en/artikel/guardian-angel-4-iwb/` | 2 | 60 | 301 → generic `/en/artikel/iwb-holster/` |
| `/artikel/guardian-angel-3-owb-gen-2/` | 2 | 60 | **404** |
| `/en/artikel/guardian-angel_3_4-owb/` | 1 | 8 | **404** |
| `/artikel/guardian-angel_3_4-owb/` | 0 | 53 | **404** |
| `/en/artikel/guardian-angel-3-iwb-gen-2/` | 0 | 2 | 301 → generic `/en/artikel/iwb-holster/` |

**The live product page was taking 76 of 4,970 impressions. The page earning the traffic was dead.**

And it is not historical decay — it is still bleeding *now*. `/artikel/guardian-angel4-owb/`, last
3 months, as a 404:

```
263 impressions · 7 clicks · CTR 2.7 % · Ø position 9.3
```

CTR is 2.7 % against a 16-month average of 6.2 % on the same URL. That is what a 404 looks like from
Google's side — still ranked, increasingly not clicked, on the way to being dropped.

### This contradicts my own earlier verdict, and it should

`404-analysis-2026-09-07.md` concluded: *"redirects are hygiene, not a growth lever."* That was
argued from backlinks — none of the dead pages has an external link, so 301s recover no authority.
The argument is correct and the conclusion was still wrong **for this URL**, because it measured the
wrong thing. Link authority is not the only reason a 301 pays; **live query impressions** are. I
never checked impressions per dead URL. Do that before dismissing a redirect again.

---

## What was changed

### 1. Nine 301s, exact-match only

All → `/artikel/guardian-angel/` (DE) or `/en/artikel/guardian-angel/` (EN), Redirection ids 13–21:

```
/artikel/guardian-angel4-owb/            /en/artikel/guardian-angel4-owb/
/artikel/guardian-angel-3-owb-gen-2/     /en/artikel/guardian-angel_3_4-owb/
/artikel/guardian-angel_3_4-owb/         /en/artikel/guardian-angel-4-iwb/
/artikel/guardian-angel-3-iwb-gen-2/     /en/artikel/guardian-angel-3-iwb-gen-2/
/artikel/guardian-angel-4-iwb/
```

**Exact match, `regex: false`.** Deliberate: the one production incident this project has had was a
regex token (`hk`) matching inside `flachkopfschrauben` and 301-ing a live product away. Exact rules
cannot do that — they can only ever affect the nine listed paths.

Four of the nine were not 404s but **mis-targeted 301s**: the generic `*iwb*` regex (rule id 5) was
sending `guardian-angel-4-iwb` to the generic IWB holster configurator. A pepper-spray-holder query
landing on a firearm-holster page is a soft-404 signal to Google, so those were repointed too.

### 2. Two Redirection traps worth remembering

- `POST /wp-json/redirection/v1/redirect` **returns 400 without `match_type: "url"`.** The field is
  not optional and the error body does not say so. Mirror an existing rule's shape.
- **Redirection ignores `position` on create.** All nine were requested at `position: 0` and were
  appended at 12–20 — *behind* the generic `*iwb*` regex at position 4, which kept winning. Fixed by
  a second `POST /redirect/{id}` per rule setting `position: 0`, which does stick. Verify precedence
  by fetching the URL, never by reading back the create response.

### 3. Product page rewritten — `/artikel/guardian-angel/` (id 669669)

| | Before | After |
|---|---|---|
| Description | **28 words** | **265 words** |
| H2s in description | 0 | 5 |
| Yoast title | `Piexon Guardian Angel Halterung \| Custom Gear Solutions` (55) | `Guardian Angel Holster für Piexon 3 + 4 \| Custom Gear` (53) |
| Meta description | 114 chars | 148 chars |
| Product name / H1 | `GUARDIAN ANGEL` | `PIEXON GUARDIAN ANGEL HOLSTER` |

The title change is the substantive one. Every top query uses **"holster"** — `guardian angel 4
holster` (843 imp), `guardian angel holster` (829), `holster guardian angel 4` (298) — and the old
title led with "Halterung". The head term did not match the query term.

New sections, all sourced from the live WCPA configurator, nothing invented: *Passend für* ·
*Montage* (the six clip options with their belt widths) · *Rechts- oder Linkshänder* · *Farben* (the
ten + on request) · *Häufige Fragen* (3).

### 4. Regression check

Full sitemap sweep after the redirect changes: **99/99 URLs return 200 with no unexpected
redirect.** The single flagged row is `/checkout/` → `/warenkorb/`, which is WooCommerce's own
empty-cart behaviour, not ours.

---

### 5. Product renamed (owner instruction, same day)

`GUARDIAN ANGEL` → **`PIEXON GUARDIAN ANGEL HOLSTER`**. On a WooCommerce product the H1 *is* the
product name, so this is what puts the head term ("Holster") and the brand ("Piexon") into the H1.

**The slug was pinned to `guardian-angel` in the same request** — non-negotiable, because that URL is
the target of all nine 301s. Verified after the rename: slug unchanged, `/artikel/guardian-angel/`
still 200, all three spot-checked redirects still land on it, and the new name renders on `/`,
`/shop/` and `/product-category/piexon/`. Past orders are unaffected — Woo stores the line-item name
at time of order.

---

## Open — needs René

1. **Guardian Angel 5.** `guardian angel 5` shows **169 impressions** site-wide and 12 on the dead
   page in the last 3 months. The configurator offers only `GUARDIAN ANGEL 3 + 4`. Product question,
   not a copy question — do you make one? I will not write a fit claim you have not confirmed.
2. **"Unterschied Guardian Angel 3 und 4"** — 27 impressions, **0 clicks**, unanswered by anyone on
   your site. A short factual comparison would be the cheapest content win here, but the facts belong
   to Piexon, not to us, so it needs verifying against Piexon's own documentation first.
3. **The `/en/` version is machine-translated from the same post (669669)** and was still serving the
   German title at the time of checking. If the translation layer caches, it may need a refresh.
