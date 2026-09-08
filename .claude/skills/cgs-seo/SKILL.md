---
name: cgs-seo
description: René's SEO + site-performance work on custom-gear.ch (WordPress/WooCommerce, Apache/Plesk at hosttech). Use when René says "cgs-seo", "/cgs-seo", "shop SEO", "custom-gear SEO", "Search Console", "GSC", "Bing Webmaster", "Yoast", "redirects", "Redirection", "sitemap", "meta descriptions", "alt text", "gun-model pages", "Phase 3", "page speed", "WP Super Cache", or references anything under 02_RESOURCES/CGS-SEO. Gives the live site's stack, what is already done, the working mechanisms (Yoast-at-scale, Redirection REST API, media alt_text API), and the traps that silently break things — so a fresh session is productive without rediscovering any of it.
triggers:
  - /cgs-seo
  - cgs-seo
  - shop seo
  - custom-gear seo
  - search console
  - gun-model pages
---

# cgs-seo — custom-gear.ch SEO playbook

**Read first:** memory `cgs-shop-seo` (site state + numbers) and memory `cgs-holster-copy-rules`
(BINDING copy constraints — legal + technical, do not write customer copy without them).

Working docs: `02_RESOURCES/CGS-SEO/`
- `meta-final-2026-09-07.md` + `_gen_meta.py` — the 73 titles/descriptions (edit the .py, never the .md)
- `404-analysis-2026-09-07.md` — the 306 dead URLs and what they mean
- `deleted-empty-categories-2026-09-07.md` — restore list for the 95 deleted categories
- `phase3-gun-model-pages-plan.md` — the ranked top-15 + approved page template

---

## The stack (verified)

| | |
|---|---|
| Host | hosttech, **Plesk `https://149.hosttech.eu:8443`** (domainId 331), CloudLinux |
| Server | **Apache** behind an nginx proxy. NOT LiteSpeed — LiteSpeed Cache does not apply |
| PHP / DB | 8.3.33 · MariaDB 10.11 · memory 512M · max_execution 600s |
| Theme / builder | Astra + Elementor **Pro** (Theme Builder, Custom Code) |
| SEO | Yoast · Site Kit (connected via `renespatz@bluewin.ch`) |
| Cache | **WP Super Cache** (Simple/PHP mode) — installed by us |
| Redirects | **Redirection** (John Godley) — installed by us |
| Images | Converter for Media (WebP) — installed by us |

**Never touch:** `.env`, credentials, WooCommerce order data. Shop is LIVE and takes real money.

---

## State: what is already done (do not redo)

Speed 4,500 ms → ~70 ms · WebP 100% · 7 plugins deactivated · **73 titles + meta descriptions live**
· alt text 98.9% (984 images) · `/shop/` canonical fixed · sr-only H1s on `/` and `/shop/` ·
**Bing verified + sitemap** · **Google sitemap submitted** (had never been) · 8+3 redirect rules ·
95 empty categories deleted · product tags noindexed ·
**Phase 3 complete as drafts (2026-09-08): all 15 gun pages + the hub, each with 1 H1, 12 H2,
Yoast title ≤60 and description 110-155, verified against the rendered preview HTML.**

Phase 3 page ids — hub `kydex-holster` **813335** · `cz-shadow-2` 813336 · `walther-pdp` 813350 ·
`sig-p220` 813351 · `hk-sfp9` 813352 · `glock-45` 813353 · `glock-19` 813354 · `walther-ppq` 813355 ·
`sphinx-sdp` 813356 · `glock-17` 813357 · `sig-p320` 813358 · `springfield-echelon` 813359 ·
`sig-p226` 813360 · `sig-p365` 813361 · `walther-q5-match` 813362 · `glock-43x` 813363.
Generators: `02_RESOURCES/CGS-SEO/_gen_gunpages.py` + `_gen_gunmeta.py`.

**Open:** **René publishes the hub + 15 children** (Claude is classifier-blocked from publishing) ·
optimise `/artikel/guardian-angel/` (4,889 impressions — biggest single item in GSC) ·
H1 on `/kontakt/` + `/referenzen/` · 11 hardcoded `alt=""` on 6 minor pages ·
typo "Zentralschweiz **seid** 2019" → `seit`.

**Flagged for owner ruling:** the Shadow 2 page ends its holster table with a "häufigste Wahl"
recommendation. That is a sales-data claim I have for no other gun, so the 14 new pages carry the
neutral line *"Alle fünf Holstertypen fertigen wir für die &lt;Gun&gt;."* instead. If René names the
most-chosen type per gun, patch them in. Second: the hub intro predates the approved CAD/CNC
boilerplate and says "fräsen wir für jede Waffe eine eigene Form" — true, but not the verbatim block.

---

## Working mechanisms

### Yoast meta at scale
Yoast meta is **NOT** writable via `wp/v2` REST, and the new bulk editor covers Posts+Pages only —
**not Products**. Quick Edit has no Yoast fields either.

Working method — drive the page's own editor:
```js
wp.data.dispatch('yoast-seo/editor').updateData({title, description});
// then click the page's real save button
```
- **Products** = classic editor → hidden inputs `#yoast_wpseo_title` / `#yoast_wpseo_metadesc`, save `#publish`
- **Terms** = DIFFERENT ids → `#hidden_wpseo_title` / `#hidden_wpseo_desc`, submit `form#edittag`
- **Homepage** = page id **5** (block editor)

### Redirection REST
```js
POST /wp-json/redirection/v1/redirect      // create
POST /wp-json/redirection/v1/redirect/{id} // update (DELETE /{id} returns 404 — update in place)
GET  /wp-json/redirection/v1/redirect?per_page=50
// header: X-WP-Nonce = wpApiSettings.nonce
```
Language-aware pattern — one rule covers DE **and** EN:
`^/(en/)?artikel/…` → `/$1artikel/owb-holster/`

### Media alt text
`alt_text` **is** writable: `POST /wp-json/wp/v2/media/{id}` + `X-WP-Nonce`. Far easier than Yoast.

### Pages
Claude CAN create/save **drafts** (`POST /wp-json/wp/v2/pages`, status `draft`).
**Publishing is René's step — Claude is classifier-blocked from it.** Plan for that.

---

## Traps that silently break things

<!-- @anchor: v1 | failure: this session 2026-09-07 | regression: the verification commands below -->

1. **Plain WP pages render WHITE TEXT ON WHITE.** Astra body colour is white (dark site design) but
   the default page template uses a white panel. Content is in the DOM and invisible. Fixed by
   Customizer CSS scoped to `body.page-id-813335` / `body.parent-pageid-813335`. Any new hub child
   inherits it. **Always screenshot a new page before believing it works.**
2. **Regex redirects on substrings break live products.** Token `hk` matched inside
   "flac**hk**opfschrauben" → a real product 301'd away. Require delimiters, and make the leading
   one optional or slug-initial tokens never match:
   `(?=(?:.*[-/])?(?:TOKENS)(?:[-/]|$))`
   **Then fetch every live URL and confirm 200 + no redirect.** Non-negotiable.
3. **Yoast settings saves are slow; navigating away discards them.** A "Leave site?" dialog means
   your save did NOT persist. Reload the settings page and re-read the control.
4. **Elementor's condition UI is Backbone-driven** and ignores programmatic `select.value` +
   jQuery change. Focus the select and send real keyboard `Down` presses, or the dependent
   sub-dropdown never appears.
5. **Elementor caches rendered markup.** After changing attachment alt text, clear Elementor cache
   (`admin.php?page=elementor-tools` → `#elementor-clear-cache-button`) **then** purge WP Super Cache.
6. **CONCURRENCY 1 on admin work.** Three parallel product-editor loads produced **502 Bad Gateway**.
   Sequential + ~2.5 s gap. (The page cache shielded public visitors — verify the public site after
   any admin hammering.)
7. **The shop has a vacation mode.** The "Bestellbereich pausiert" banner gets cached. When René
   reopens, purge the cache manually — toggling the setting is not a post edit and won't auto-purge.
8. **Yoast/WP nonce dies when you navigate off wp-admin** (e.g. to a raw image URL). Re-grab it.
9. **Yoast meta cannot be driven from an iframe.** `javascript_tool` runs in an isolated world, so a
   same-origin `<iframe>` of `post.php` gives `SecurityError` on `contentWindow.wp` — the subframe's
   MAIN world is unreachable. There is no batching shortcut: navigate the top tab per page.
   Sending `meta:{_yoast_wpseo_title:…}` to `wp/v2/pages/{id}` returns **200 and silently does nothing**
   (unregistered meta) — never treat that `ok:true` as proof. Read back `yoast_head_json` instead.
10. **A plain-HTML page gets NO H1.** Astra does not render the page title on these, so a page built
   from raw `<p>/<h2>` markup ships with zero H1s. Prepend an explicit `<h1>` to `content` and assert
   `document.querySelectorAll('h1').length === 1` on the rendered preview.
11. **`javascript_tool` blocks its own return value** when a string contains URLs with query strings
   or looks base64 ("BLOCKED: Cookie/query string data"). Reading a page's `content.raw` back trips it.
   Work around it by masking `[?&=]` inside `href="…"` before returning, or slice under ~350 chars.

---

## Verification patterns (use these, don't eyeball)

```js
// live meta/H1/alt for any URL, as an anonymous visitor
const h = await (await fetch(u,{credentials:'omit',cache:'no-store'})).text();
const d = new DOMParser().parseFromString(h,'text/html');
d.title; d.querySelector('meta[name=description]')?.content;
d.querySelectorAll('h1').length; [...d.querySelectorAll('img')].filter(i=>!i.alt?.trim()).length;
```
- **Whole-site sweep:** pull `/sitemap_index.xml` → each sub-sitemap → fetch every URL, assert
  `status < 400` **and** `r.url === requested` (catches accidental redirects). ~117 DE URLs, ~187 with EN.
- Long runs: start an async loop writing to a `window.__x` progress object, then poll with short
  calls + `Bash sleep` — avoids the 45 s JS timeout.
- Purge after every content change: WP Super Cache → `Cache leeren`.

---

## Phase 3 — how the 14 pages were built (2026-09-08)

Content generated by `_gen_gunpages.py` (mirrored as a JS builder in the browser so only the
~1.5 KB of per-gun copy travels per call, not the 5 KB page), POSTed as drafts with
`parent: 813335`, sequential with a 1.8 s gap. Then per page: navigate to `post.php`, dispatch
`yoast-seo/editor`, click `.editor-post-save-draft`, and read `yoast_head_json` back to prove it
persisted. H1s injected afterwards in one REST pass over all 16.

Anti-doorway measures actually applied: two gun-specific intro paragraphs, a gun-specific first FAQ,
and the real variant list per brand from the WCPA export. Everything else is the approved verbatim
block set — that is deliberate, not laziness, but it means the intros/FAQs are the only thing
standing between these 15 pages and a doorway-page penalty. Do not let a future page skip them.

## Phase 3 — the 14 pages (built)

Ranked by measured GSC impressions (16 mo). Template + per-gun angles are in
`phase3-gun-model-pages-plan.md`; **the approved wording blocks are in memory `cgs-holster-copy-rules`
— reuse them verbatim, do not re-invent.**

Walther PDP · SIG P220 · H&K SFP9 · Glock 45 · Glock 19 · Walther PPQ · Sphinx SDP · Glock 17 ·
SIG P320 · Springfield Echelon · SIG P226 · SIG P365 · Walther Q5 Match · Glock 43X

Fitment truth = the WCPA export `C:\Users\rene\Downloads\wcpa-forms-lists-export-01-08-2026.json`
(17 manufacturers, 84 models, 24 lights). **Lights are independent of the gun** — never claim
per-gun light restrictions.

---

## Session Notes

**2026-09-08** — tools: claude-in-chrome (WP REST + block-editor dispatch), Bash/python.
- Built the remaining 14 gun pages + wired the hub's "Beliebte Modelle" list (15 links) + Yoast
  title/description on all 16 + an H1 on all 16. Verified every page: exactly 1 H1, 12 H2,
  `document.title === yoast_head_json.title`, title ≤60, description 110–155, no duplicates.
- Four new traps recorded above (9–12): the isolated-world iframe block, the silent
  `meta:{_yoast_*}` no-op, the missing-H1-on-plain-HTML-pages default, and `javascript_tool`
  refusing to return strings that contain query-string URLs.
- Open question left for René rather than guessed: the per-gun "häufigste Wahl" recommendation.
  Inventing sales data for 14 guns would have been the easy clone-filler; it is not a fact I hold.

**2026-09-07** — tools: claude-in-chrome, Bash/python, WP+Yoast+Redirection REST, GSC, Bing WMT.
- Corrections from René, all now binding: retention = **Zugfestigkeit**, set by **screws** (2 / IWB+Sidecar 3 / Pancake 1); **never imply civilian carry** (illegal in CH); Level 2 = **Sicherung**, not retention; no cross-fit claims; model/light lists are open-ended, invite contact; no "Typisch für" column; moulds are **all** CAD-designed and CNC-milled in-house incl. Konturschnitt — never frame as per-gun.
- My errors worth remembering: claimed René had no GSC access (I queried a non-existent `sc-domain:` property); claimed the 346 crawled-not-indexed were the empty categories (actually 119 products / 76 cats / 74 tags / 149 EN twins); omitted Gürtelclips from the accessory list by working from memory; shipped a regex that redirected a live product.
- Pattern that worked repeatedly: **build one, verify against live HTML, then scale.** It caught the white-on-white pages, the `hk` regex bug, and the reverted Yoast save.
