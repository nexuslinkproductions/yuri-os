# Phase 3 — 4-week interim review (06/10/2026)

Pages published 08/09/2026. This is **4 weeks in, not the 6 the review was scheduled for** —
read everything below as early signal, not settled result. All figures read from Search Console
on 06/10/2026.

---

## 1. The 15 pages are working, earlier than predicted

3-month window (they have existed for 4 weeks of it):

```
88 clicks · 525 impressions · CTR 16.8% · avg position 6.5
```

| Page | Clicks | Impressions | Pre-launch baseline position |
|---|---:|---:|---:|
| walther-pdp | 26 | 94 | 10.0 |
| sig-p220 | 14 | 102 | 9.9 |
| sphinx-sdp | 9 | 26 | 10.8 |
| springfield-echelon | 8 | 43 | 6.6 |
| cz-shadow-2 | 8 | 34 | 13.0 |
| walther-ppq | 4 | 16 | 11.3 |
| glock-17 | 3 | 38 | 9.5 |
| hk-sfp9 | 3 | 37 | 12.7 |
| sig-p365 | 3 | 8 | 7.3 |
| sig-p226 | 2 | 40 | 9.2 |
| (hub) | 2 | 24 | — |
| walther-q5-match | 1 | 14 | 17.5 |

EN twins are earning independently: `cz-shadow-2` 2/7 · `sig-p220` 1/10 · `springfield-echelon` 1/9 ·
`hk-sfp9` 1/9 · hub 0/13 · `sphinx-sdp` 0/1.

New-page average position **6.5** against baselines of 9–17. Sitewide CTR is 12.9%; these run 16.8%.

**Honest limits:** 88 clicks is a small sample and a 16.8% CTR on 525 impressions moves a lot on
noise. Cannibalisation cannot be fully excluded — for `~pdp` queries the new page took 9 clicks while
the old `/artikel/walther-pdp-f-series-*` URLs still took 5, so it is not purely redistribution, but
the volumes are too small to prove incrementality. Direction is right; magnitude is not settled.

## 2. The crawl defect — 4 pages Google had never fetched

`glock-19`, `glock-45`, `glock-43x`, `sig-p320` had **zero impressions**. Inspection showed
*"Gefunden – zurzeit nicht indexiert"* with **Letztes Crawling: Nicht zutreffend** — in the sitemap,
never fetched. That cost the Glock pages specifically, the highest-volume platform on the list.

Indexing requested by René 06/10/2026. Verified minutes later:

| URL | State after request |
|---|---|
| glock-45 | **crawled 06.10.2026, 10:13:54** — Gecrawlt, zurzeit nicht indexiert |
| sig-p320 | **crawled 06.10.2026, 10:15:53** — Gecrawlt, zurzeit nicht indexiert |
| glock-19 | **crawled 06.10.2026** — Gecrawlt, zurzeit nicht indexiert |
| glock-43x | **NOT crawled** — "URL ist Google nicht bekannt", Letztes Crawling: Nicht zutreffend |

3 of 4 took within minutes. **glock-43x needs re-requesting.**

## 3. Guardian Angel — the 301 salvage consolidated

Guardian queries, 3-month window — only the **live** pages appear; the 404 that held 4,343
impressions is gone from the report entirely.

```
/en/artikel/guardian-angel/   24 clicks  78 imp  CTR 30.8%  pos 4.9
/artikel/guardian-angel/       4 clicks  80 imp  CTR  5.0%  pos 6.8
                      cluster  28/152    CTR 18.4%  pos 5.9   (was 8.2)
```

The window straddles the fix so this is not a clean before/after, but a vanished 404 plus 8.2 → 5.9
is what a working 301 looks like.

**Open oddity:** the English page converts **6× better than the German** on similar impressions.
Same product, same market. Unexplained and worth a look.

## 4. The sitewide decline is real, and it is NOT ours

```
Last 3 months     1,240 clicks   9,690 impressions   CTR 12.9%   pos 9.2
Previous 3 months 2,650 clicks  30,500 impressions   CTR  8.7%   pos 7.8
```

Before attributing that to the September work: the 16-month chart puts the cliff in
**mid-June 2026** — impressions fall from ~350/day to ~150/day and stay flat. Our work landed
07–08/09, three months into the already-depressed stretch, and the line has been flat-to-slightly-up
since.

Part of the impression drop is deliberate (95 empty categories deleted, product tags noindexed on
07/09 — hence impressions down while CTR rose). That does not explain clicks halving in June.

**The mid-June cliff is now the single biggest open item on this site. Cause unknown. Not yet
investigated.**

## 5. Confounder — the holiday closure

René closed the store to orders from the **start of September 2026**, reopening ~09–11/10/2026. The
site stayed online and crawlable; no order could be placed.

So the entire 4-week measurement window ran against a shop that could not convert. The traffic
figures above are valid as traffic. **Any commercial read of them is not** — zero revenue was
possible. The real test of these pages starts at reopening.

Vacation mode began in September; the cliff is mid-June. **They are unrelated events — do not merge
them.**

## Next actions

1. **Re-request indexing for `glock-43x`** — the only one of the four that did not take.
2. **On reopening: purge WP Super Cache.** The "Bestellbereich pausiert" banner is cached, and
   toggling the vacation setting is not a post edit, so it will not auto-purge (skill trap #7).
   Then re-check product availability in GSC → Shopping → Produkt-Snippets.
3. **Investigate the mid-June cliff.** A ~50% traffic loss outranks every remaining SEO item.
4. Scheduled review 20/10/2026 — updated with all three confounders so it cannot misread the data.
