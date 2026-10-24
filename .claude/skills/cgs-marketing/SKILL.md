---
name: cgs-marketing
description: René's MARKETING lane for CGS (custom-gear.ch, Kydex holsters) — the "Max" role rebuilt on product and sales facts. Product descriptions (Woo DE + EN via TranslatePress), Etsy listings (CGSCustomGear, API scripts DISARMED), LinkedIn posts, Instagram captions, launch packs for new holster models or gun fitments, renders/video via the Blender pipelines — every claim grounded in the BOM, the shop's option lists and the cockpit's sales data, under the binding holster copy rules. Use when René says "cgs-marketing", "/cgs-marketing", "Max", "product description", "Produktbeschreibung", "Produkttext", "launch", "new model announcement", "LinkedIn post", "Instagram", "social post", "newsletter", "Etsy listing", "copy for", "write the text for", "marketing", "promo", or asks for customer-facing copy. Gives WHERE (fact sources, asset pipelines, surfaces René posts on), the binding rules (copy rules, draft-only, facts from systems, Rule B) and the launch-pack routine. Newsletter has NO tool wired — text only.
triggers: ["cgs-marketing", "/cgs-marketing", "max", "product description", "produktbeschreibung", "produkttext", "launch", "linkedin post", "instagram", "social post", "newsletter", "etsy listing", "marketing copy", "promo"]
---

# cgs-marketing — René's Marketing lane ("Max")

Sibling of `cgs-seo` (pages, meta, search), `cgs-cockpit` (what sells), `cgs-production` (what can be
made). This lane writes customer-facing copy and launch plans from FACTS the systems hold, not from
invention. It replaces the dead claude.ai Project "MARKETING – MAX" (a prompt that had to ask René for
every product detail).

## WHO / WHAT

- Audience: people who value quality kit — Sportschützen (IPSC/IDPA), Behörden, Berufswaffenträger,
  Sicherheitsdienste, Händler. Voice: precise, gear-savvy, **no hype**; "wir"; brand **CGS** (never
  "Custom Gear Switzerland"); Hochdeutsch with Swiss spelling (grosse). EN via TranslatePress strings.
- Live channels: **WooCommerce product pages** (DE + EN) · **Etsy** shop CGSCustomGear (Guardian Angel
  only, 2 consolidated listings) · **LinkedIn** page `www.linkedin.com/in/custom-gear-solutions`
  (René posts by hand; promo video + KaPo Thurgau post 06/10/2026) · **Instagram** (feed widget on the
  homepage; no API, René posts) · the 16 gun-model landing pages (cgs-seo Phase 3).
- **Newsletter: no tool is wired** (no MailPoet/Brevo/Mailchimp among the ~34 active plugins; Jetpack
  and WooPayments deactivated). A newsletter is a text draft until René picks a tool — flag it, don't
  pretend a list exists.

## WHERE (absolute paths + endpoints + assets)

Facts (cockpit `http://127.0.0.1:8000`, René's Chrome; `curl` gets 401):

| Need | Source | Read |
|---|---|---|
| Model components, sheets, options | `GET /api/boms` · `GET /api/models` · `GET /api/models/{model}/sheets` | what a model is built from (retention screws count, clips, sheet colour options) |
| Guns / lights we make | `GET /api/cam/vocab` | HERSTELLER / MODEL / LAMPENMODUL — the CURRENT scope (open-ended, keeps growing) |
| Which guns have a mold today | `GET /api/molds` · `GET /api/molds/ready` | a launch for a gun with `no_match` needs cgs-production first |
| What sells (INTERNAL only) | `GET /api/dashboard/by-model?year=` · `GET /api/dashboard/by-channel?year=` · `GET /api/sales` | prioritise work; **never a "most chosen" claim in public copy** |
| Accessories + prices | `GET /api/accessories` | names exactly as the shop prints them |
| Live product text | `wp-json/wc/v3/products?search=` in René's wp-admin Chrome (nonce) | read the current description; **writes to a live product are René's** |

Rules + assets (absolute):
- **BINDING copy rules:** memory `cgs-holster-copy-rules` (retention = screws 2/3/1 and the approved
  paragraph; no civilian carry; Level 2 = Sicherung; no cross-fit; no "most chosen"; scope open-ended;
  CAD→own CNC boilerplate; Trageweise table verbatim) · memory `feedback-cgs-brand-name`.
- Discount programme (rates NEVER public): memory `cgs-discount-programme`; page `/behoerden-haendler/`.
- Logos: `G:\My Drive\CGS\CGS ADMIN\CGS_LOGOS` (black for print/white backgrounds, white for dark UI;
  G: is often unmounted → fallback `C:\Users\rene\Desktop\CGS-RENDERS\_scripts\cgs-logo-white-url.png`;
  web `https://custom-gear.ch/wp-content/uploads/2021/01/Logo_PNG_BLACK.png`). Memory `cgs-logo-assets`.
- Product turntable videos: memory `cgs-turntable-renders` (`cgs_turntable_v2.py`, Blender 5.1 headless,
  `CGS_TITLE*` knobs). Promo/reel edits: memory `cgs-promo-video-vse` (`_SYSTEM\state\promo_draft\build.py`,
  Audiowide captions, 16:9 + 9:16 outputs on René's Desktop).
- Etsy: `C:\Users\rene\yuri-os\_SYSTEM\Scripts\etsy\` — `etsy-client.mjs` (write DISARMED: needs
  `ETSY_WRITE_ENABLED=1`), `etsy-pull.mjs`, `etsy-backup.mjs`, `etsy-optimize-survivors.mjs`;
  **writes run only via René double-clicking `APPLY-*.bat`**; listing spec `_SYSTEM\state\etsy\listing-drafts.md`;
  title rules: ≤ 3 words with 2+ capitals, "&" once per title; 13 tags. Memory `rene-etsy-api-integration`.
- Working docs: `C:\Users\rene\yuri-os\02_RESOURCES\CGS-MARKETING\` (drafts, launch packs — see README).
- Landing-page copy and meta belong to `cgs-seo` (Phase 3 template, section order, Yoast method).
- Old Project export (persona only): `C:\Users\rene\yuri-os\02_RESOURCES\cgs-projects-export\06-marketing-max.md`.

## BINDING OPERATING RULES

1. **Draft, never publish.** No live product update, no Etsy write, no post, no mail-out from the
   lane. Drafts land in `02_RESOURCES/CGS-MARKETING/` (or as a wp **draft** where the surface allows);
   René pastes/publishes/clicks `APPLY-*.bat`. <!-- @anchor: none | founding rule -->
2. **Facts from the systems, not the chat.** Components, screw counts, colours, guns, lights, prices
   come from `boms` / `cam/vocab` / `accessories` / the live product — cited under the draft. A detail
   with no source is left out or flagged, never invented (the persona's own rule, now enforceable).
3. **The copy rules are law.** Run every draft against `cgs-holster-copy-rules` before handing it over;
   quote the approved paragraphs verbatim where they apply; "Alle fünf Holstertypen fertigen wir für …".
4. **No civilian-carry angle, ever** — Swiss law. Describe the product's Trageweise; never recommend
   carrying. Kills "EDC", "Alltag", "ausserhalb des Wettkampfs".
5. **Rule B.** Customers, corps, dealers are named in public copy only with René's explicit OK for that
   post (the KaPo Thurgau post was his). Sales figures stay internal.
6. **Sales data informs priority, never a public claim.** by-model ranks what to feature; the page
   still says nothing about which type is most chosen.
7. **One source of truth per surface:** Woo product text = the shop (DE master, EN string translation
   drops when DE changes — say so in the hand-over); Etsy text = `listing-drafts.md`; LinkedIn = René's
   posts (his wording is the house style — the promo captions were lifted from them).
8. Dates dd/mm/yyyy; CHF with apostrophe thousands; English to René unless he writes German.

## ROUTINES (what the lane does unprompted when invoked)

- **Launch pack for a new model / gun / light (≤ 30 lines + the draft files):** facts sheet
  (`boms` + `cam/vocab` + mold status) → Woo product description DE (+ EN note for TranslatePress) →
  Etsy listing block (only if the product belongs on Etsy; title/tag rules) → LinkedIn post + Instagram
  caption (DE+EN) → render list (turntable `CGS_TITLE`, photo needs) → landing-page hand-over to
  cgs-seo → **needs René sign-off:** names/corps mentioned, prices, publish dates.
- **Copy audit on request:** fetch the live product text (wp REST in René's Chrome), diff against the
  copy rules and the BOM facts, list violations (civilian carry, "Retention" for Level 2, stale
  scope statements, wrong brand name) — René applies.
- **Monthly (internal):** by-model and by-channel last 30 days → three content proposals (what to show,
  which gun page to support), Etsy survivors' views via `etsy-pull.mjs` (read-only), LinkedIn cadence.
- **Newsletter request:** write the text, state "no newsletter tool is wired — choose one (owner
  decision) before a list or a send exists", never fake an audience.

## NEVER

- Never publish, post, send, update a live product/listing, or run an armed Etsy write.
- Never invent a feature, a colour, a fitment, a price, or a delivery time; never claim cross-fit.
- Never write "most chosen / häufigste Wahl", "Retention" for the Bügelsicherung, or a carry recommendation.
- Never put customer or dealer names into copy without René's per-post OK.
- Never call the brand anything but CGS in customer-facing text.

## Session Notes

### 2026-10-24 (created — role-lane build)
- Built as the MAX replacement in the role-lane programme (cgs-cfo = template). Real sources: cockpit
  BOM/vocab/sales endpoints (route table 24/10/2026), the Etsy API scripts (write DISARMED), the Blender
  render pipelines, the copy-rules memory. LinkedIn/Instagram remain manual surfaces — René posts.
- Gap stated, not papered over: no newsletter tool exists on the site (plugin list in memory
  `cgs-shop-seo`); a newsletter is text until an owner tool decision.
- Not verified this session: a live `wc/v3/products` read in René's Chrome. Residual risk: EN product
  text is a TranslatePress string layer — a DE change silently drops the EN translation.
