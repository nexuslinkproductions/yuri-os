# jlee.mov — creator playbook analysis (scraped 2026-07-29, 33 posts)

Source: `_SYSTEM/content-engine/references/jlee/catalog.json` (+ transcripts
in `transcripts/` once the Parakeet pass lands). Account: Jacob 재현, 4,492
followers, "AI Systems, real client builds documented in public."

## The numbers that matter

| Post | Plays | Likes | Comments | Comment rate |
|---|---|---|---|---|
| Competitor dashboard (build-in-public) | 88,201 | 2,332 | 129 | 0.15% |
| CLONE funnel | 78,759 | 1,558 | 754 | 0.96% |
| SCRAPER funnel (the gist we run) | 41,106 | 924 | 5,185 | **12.6%** |
| PLAYBOOK funnel | 23,010 | 374 | 1,844 | **8.0%** |
| RADAR funnel | 10,154 | 194 | 674 | 6.6% |
| Typical non-funnel post | 500–6,000 | 10–90 | 0–20 | ~0.3% |

**The comment-keyword funnel is a 10–40x engagement multiplier.** Every top
post gates a guide/template behind "Comment WORD". His median non-funnel
post does ~3k plays; funnel posts do 10k–80k.

## His 5 formats (frequency, median plays)

1. **comment-funnel** (17 posts, ~3k median, up to 79k) — keyword CTA, dots,
   hashtags. The guide IS the product; the reel is the ad.
2. **news-decoded** (8 posts, ~2k median) — takes a news item (Anthropic
   Economic Index, Alibaba distillation, Opus 4.8 honesty, Claude dreaming)
   and gives the "what this actually means for a business owner" reading.
   Low engagement but positions authority.
3. **build-in-public** (3 posts, highest ceiling: 88k) — documents a real
   client system with the actual stack named (Apify, Scribe, Claude) and
   real architecture ("six checks, plain code, no AI in the maths").
4. **tutorial** (4 posts, ~4k median) — settings, tools, limits workarounds.
5. **framework/hot-take** (2 posts) — 5-levels carousel, 7-second take.

## What makes his best post win (88k, competitor dashboard)

- The system is the content: "reverse-engineers every competitor in my niche
  while I sleep." People wanted the dashboard, not the lesson.
- Named stack, no mystery: Apify scrapes, Scribe transcribes, Claude scores.
- "the dashboard is the whole point" — he sells the interface, not the idea.
- Breakdown promise: hook style, every beat, the CTA, the real numbers.

## What we take (and what we refuse)

TAKE:
- **Build-in-public with named stacks is the ceiling.** Our version: the
  content engine itself (radar → drafts → approval queue → posted), shown
  with real numbers. Same genre, our proof is already real.
- **News-decoded as a steady format** (fits Marcel's "decoding AI" bio
  exactly; jlee's version targets business owners, ours targets builders).
- **The per-post breakdown board** (his dashboard concept) is now a section
  in our app: Creators. We reverse-engineer HIM with it.
- Duration band: his reels sit at 34–68s. If Marcel does reels, 40–60s.

REFUSE (voice rules already ban these):
- The comment-keyword funnel. It's his growth engine and it's exactly the
  engagement-bait register Marcel's brand rejects. Our funnel is the repo:
  "inspect the code" beats "comment SCRAPER".
- Dotted-line caption padding and hashtag blocks (IG-native crutches; our
  platforms are Threads + LinkedIn first).

## Watch list

He ships ~5 posts/week. Worth a recurring capture (weekly) into the radar:
same in-session fetch method, diff against catalog.json, new posts appended
with plays after 48h (they mature). Command lives in the content-engine
skill (`/capture ig jlee.mov`).
