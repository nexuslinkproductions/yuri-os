# Phase 3 — 6-week review (20/10/2026)

Pages published 08/09/2026. GSC data runs to **17/10/2026** (normal ~2-day lag). All figures read
from Search Console + the WooCommerce order log on 20/10/2026 (automated scheduled run).
Interim baseline: `phase3-review-2026-10-06.md`.

---

## 1. Crawl / index state — the defect is closed

All 16 URLs have impressions in the Performance report, which requires indexing. URL inspection
of the four that were uncrawled on 06/10:

| URL | State 20/10 | Letztes Crawling |
|---|---|---|
| glock-43x | **URL ist auf Google — Seite ist indexiert**, self-canonical | 06.10.2026, 10:29:55 |
| glock-19 | indexiert | 06.10.2026, 10:11:52 |
| glock-45 | indexiert | 06.10.2026, 10:13:54 |
| sig-p320 | indexiert | (06.10.2026 per interim) |

**glock-43x was crawled on 06/10 at 10:29 — the re-request DID take; the 06/10 panel was simply
lagging.** Nothing to re-request. All four still show *Verweisende Seite: Nicht gefunden* and a
per-URL *Sitemaps: Vorübergehender Verarbeitungsfehler*, but the Sitemaps report says
`/sitemap_index.xml` last read **17/10/2026, Erfolgreich, 114 pages** — the per-URL label is stale,
not a live fault.

**Consequence for the cross-linking proposal:** its trigger was "if glock-43x is still uncrawled".
It isn't. The "weitere Modelle" block is no longer needed for *indexing*; it is now only a possible
*ranking* lever (see glock-19 below). Not urgent, still owner-gated.

## 2. Per-URL performance vs 06/10 interim (3-month window, i.e. the pages' whole life)

**Total (DE + EN): 130 clicks / 900 impressions / CTR 14.4% / position 6.8**
(interim 88 / 525 / 16.8% / 6.5 → **+48% clicks, +71% impressions in 12 days of data**).

| Page | 06/10 | 17/10 | Position | Pre-launch query pos. | Read |
|---|---:|---:|---:|---:|---|
| walther-pdp | 26/94 | **28/113** | 4.8 | 10.0 | growing |
| sig-p220 | 14/102 | **24/167** | 4.9 | 9.9 | growing fast |
| glock-45 | 0/0 | **13/104** | 7.9 | 7.9 | new since crawl fix |
| springfield-echelon | 8/43 | 11/50 | 5.3 | 6.6 | growing |
| cz-shadow-2 | 8/34 | 10/46 | 6.0 | 13.0 | growing |
| sphinx-sdp | 9/26 | 10/29 | 6.5 | 10.8 | flat |
| glock-17 | 3/38 | 4/50 | 7.7 | 9.5 | slow |
| hub | 2/24 | 4/31 | 11.2 | — | slow |
| walther-ppq | 4/16 | 4/18 | 7.8 | 11.3 | flat |
| sig-p365 | 3/8 | 4/10 | 7.9 | 7.3 | tiny volume |
| hk-sfp9 | 3/37 | 3/46 | 8.0 | 12.7 | flat clicks, low CTR 6.5% |
| sig-p320 | 0/0 | 3/44 | 6.1 | 10.5 | new since crawl fix |
| glock-19 | 0/0 | 2/48 | **15.9** | 9.5 | **weakest — worse than baseline** |
| sig-p226 | 2/40 | 2/42 | 5.9 | 9.2 | flat, CTR 4.8% |
| walther-q5-match | 1/14 | 2/21 | 6.8 | 17.5 | growing from nothing |
| glock-43x | 0/0 | 1/25 | 7.2 | 10.9 | new since crawl fix |

EN twins: cz-shadow-2 2/7 · sig-p220 1/13 · hk-sfp9 1/11 · springfield-echelon 1/9 · hub 0/14 ·
sphinx-sdp 0/2.

The four crawl-fixed pages added **19 clicks / 221 impressions in ~11 days** — the fix was worth it.
None of the 15 is dead. Weak spots: **glock-19 (pos 15.9)** and low CTR on hk-sfp9 / sig-p226 /
glock-43x (titles/snippets may not be winning the click).

Caveat: the "position" column is the page's average across all its queries; the pre-launch column
is query-level. Directionally comparable, not identical metrics.

**Daily shape** (all /kydex-holster/ URLs):

| Window | Days | Clicks | Impr. | per day |
|---|---:|---:|---:|---|
| Launch spike 09–17/09 | 9 | 56 | 292 | 6.2 clicks |
| Trough 18/09–08/10 | 21 | 41 | 332 | 2.0 clicks |
| Post-reopen 09–17/10 | 9 | 32 | 274 | 3.6 clicks |

Classic new-page pattern: freshness spike → settle → climb. The climb started ~04/10, before reopening.

## 3. Query-level position vs pre-launch baseline — mostly unmeasurable

Query-filtered data (last 28 days, 20/09–17/10) is too thin to compare with 16-month baselines:

| Term | Clicks/Impr. | Pos | Baseline pos |
|---|---:|---:|---:|
| glock 45 | 4/31 | 5.7 | 7.9 |
| glock 19 | 0/21 | 24.6 | 9.5 |
| pdp | 2/12 | 4.6 | 10.0 |
| p320 | 1/8 | 10.1 | 10.5 |
| p220 | 0/5 | 17.4 (owb-holster, not the new page) | 9.9 |
| glock 17 | 0/5 | 8 | 9.5 |
| 43x | 1/4 | 5 | 10.9 |
| shadow | 0/3 | 20 | 13.0 |
| sfp9 / p226 / ppq / echelon | ≤2 each | — | — |
| sdp / sphinx / p365 / q5 | 0 | — | — |

Why so thin: (a) most of the pages' impressions come from **anonymised long-tail queries** (the 3-month
named-query list for /kydex-holster/ accounts for ~20 of the 130 clicks); (b) **gun-name demand itself
collapsed in June** — see §5. Sphinx-sdp earned 10 page clicks but 0 "sphinx" query impressions in 28
days. Page-level positions (§2) are the usable signal; glock-19 is the one gun where both page- and
query-level say "worse than before".

## 4. Guardian Angel — holding, position improved

| Window | Clicks/Impr. | CTR | Pos |
|---|---:|---:|---:|
| 3 months (to 17/10) | 25/144 | 17.4% | **5.1** (06/10: 5.9, pre-fix 8.2) |
| 28 days | 9/40 | 22.5% | 5.4 |

`/en/artikel/guardian-angel/` 21/74 (28.4%, pos 4.7) · `/artikel/guardian-angel/` 4/74 (5.4%, pos 5.6).
Only the two live URLs appear; no dead URL resurfaced. Position held and improved. The 3-month click
total dipped 28 → 25 only because the rolling window dropped mid-July days. The EN-vs-DE CTR gap
(28% vs 5%) persists — still unexplained, still worth a look.

**Commercial:** 4 orders since reopen entered on a Guardian Angel page (2 organic Google, 2 direct).

## 5. Sitewide — and the mid-June cliff now has a prime suspect

Sitewide 3 months: **1,290 clicks / 9,828 impressions / CTR 13.1% / pos 8.9** (06/10: 1,240 / 9,690).
Last 7 days: 156 clicks / 1,056 impressions (~22 clicks/day vs ~13/day in the July–Sept trough and
~30+/day before June). Last 28 days: 441 / 3,300.

**The cliff is NOT Phase 3** — it predates it by 11 weeks. But this run found what lines up with it:

- The 6-month sitewide chart steps down at **~20–22/06/2026**.
- The five configurator products were **created 19/06–20/06/2026** (`wp/v2/product`: owb-holster
  812283 19/06 20:03 · ipsc_idpa 20/06 11:00 · pancake 11:05 · iwb 10:30 · sidecar 11:12).
- The 07/09 404 analysis found **276 deleted per-gun-model product pages** — the old one-page-per-gun
  catalogue, removed in that consolidation.
- Query `~shadow` (6 months): steady impressions until **~22/06**, then **flat zero** for 11 weeks
  until the new page launched. 579 of its 686 impressions were on `/artikel/cz-shadow-2-6/`. `~pdp`
  shows the same break, with a slower tail (old URLs lingered).

**Leading hypothesis (strong timing + mechanism, not yet proven sitewide):** the mid-June cliff is the
**catalogue consolidation of 19–20/06** — ~276 per-gun URLs that ranked for gun-name queries were
replaced by 5 generic configurator products that don't rank for those queries. The September 301s
send those old URLs to the **generic** `/artikel/owb-holster/` (`X-Redirect-By: redirection`, verified
today on `/artikel/cz-shadow-2-6/`, `…walther-pdp-f-series-4/`, `…glock-45/` etc.), so their accumulated
relevance lands on a page that isn't about that gun. Phase 3 is in effect the partial rebuild of what
June removed — which is also why it works.

To prove it: per-brand/per-query 16-month breaks dated against 19–20/06 (do 5–6 more guns), and
check nothing else changed that week (theme, robots, Yoast, hosting).

## 6. Post-reopen commercial read — first evidence, small sample

WooCommerce order log (attribution = entry page of the converting session):

- **Before reopen:** last checkout order **09/09/2026**; **zero orders 10/09 → 08/10**. (Note: checkout
  orders were placed 02/09, 08/09 and 09/09, so in practice the block bit from ~10/09, not 01/09 —
  recorded as an observation, the mechanism is not in question.)
- **Since reopen (09/10–19/10): 38 orders, 17 organic Google.**
- **1 order entered on a Phase 3 page:** 19/10/2026, organic Google → `/kydex-holster/cz-shadow-2/`,
  CHF 144.50, processing. **The first measurable sale from the 15 pages.**
- Traffic before vs after reopen (equal 9-day windows): 30/09–08/10 15 clicks / 133 impr. →
  09–17/10 32 / 274. But the rise began ~04/10 and is explained by the crawl fix (glock-45/-19/-43x,
  sig-p320 indexed 06/10) — reopening can't move Google rankings. Don't attribute it to the reopen.

Verdict on commerce: **one sale in 11 days is proof the path works, not proof of value.** Attribution
undercounts (only the converting session's entry page is recorded; a buyer who found a gun page
yesterday and came back direct today is logged as direct). Too early; re-read at ~12 weeks.

## 7. Health check — all 16 clean (anonymous fetch, 20/10/2026)

| Check | Result |
|---|---|
| HTTP | 200, 0 redirects, all 16 |
| H1 | exactly 1, all 16 |
| robots | `index, follow`, all 16 |
| canonical | self, all 16 |
| `häufigste` / `in der Praxis` | **0 hits**, all 16 (positive control: "Alle fünf Holstertypen fertigen wir für die Glock 43X." matched, so the umlaut grep works) |

## 8. Verdict

**Working — early, but working.** Six weeks in, the 15 pages have grown to 130 clicks / 900
impressions at an average position of 6.8 against pre-launch positions of 9–17. All 16 are indexed.
The crawl fix added 19 clicks in 11 days. The first sale from a gun page arrived 19/10. Guardian
Angel holds at position 5.1. Weak spots: glock-19 (position 15.9, worse than its baseline) and
low CTR on hk-sfp9 / sig-p226. Volume is still small and 4–12 weeks was the stated expectation, so
the magnitude is not settled. The bigger story: the unexplained mid-June cliff, the largest open
item on this site, now has a prime suspect — the 19–20/06 consolidation that deleted ~276 per-gun
pages. **Highest-value next action:** confirm that hypothesis on 5–6 more guns. If it holds, repoint
the old per-gun URLs for the 15 covered guns from the generic `/artikel/owb-holster/` to their
matching `/kydex-holster/<gun>/` page with exact-match Redirection rules (owner approval required —
changes live redirects). That hands each new page the relevance its predecessor built up, and costs
nothing on the 15 already built.

## Next actions

1. **Confirm the June hypothesis** on 5–6 more gun queries (16-month query breaks vs 19–20/06), and
   rule out other changes that week.
2. **Owner decision:** repoint old per-gun `/artikel/…` URLs → `/kydex-holster/<gun>/` (exact rules,
   ordered above the broad regex, then fetch every URL to confirm). Not done — owner-gated.
3. glock-19: look at why it sits at 15.9 (likely cannibalised by a Glock 17/19/45 combo URL or the
   configurator). Cross-linking block is now a ranking lever only — still owner-gated.
4. hk-sfp9 / sig-p226 / glock-43x: CTR < 7% at positions 6–8 → title/meta test.
5. Re-review at ~12 weeks (~01/12/2026), with the commercial read on a full post-reopen month.
