# Dashboard spec — what Claude builds from your sweep

Say: **"Build the dashboard following DASHBOARD-SPEC.md."** Claude reads the
newest `signals/YYYY-MM-DD/signals.json` and generates a single, self-contained
**`dashboard.html`** — no server, no build step, just double-click it.

It's a **static snapshot**: the data is baked into the file at build time. After
each new sweep, ask Claude to rebuild it and refresh the browser tab.

This is the "Signals Radar" screen from the reel. Two tabs.

---

## Tab 1 — Radar (the every-other-morning read)

Top to bottom:

1. **KPI tiles** (four, animate: count up from 0 on load):
   - **Signals captured** — total items in the sweep.
   - **Channels green** — how many of the five sources came back OK, as `N/5`.
   - **Loudest signal** — the single highest numeric `signal` in the sweep (the
     top repo's stars-today, or the top X post's likes if you've wired X). Show
     the number; put what it was underneath.
   - **Deep reads** — how many items got their full text pulled and saved.

2. **Sweep volume by channel** — one horizontal bar per source (X · YouTube ·
   GitHub · Reddit · MCP), width proportional to how many items it returned, the
   count on the right (`12 repos`, `20 posts`…). Bars grow from zero on load.
   This is the "which source is loud today, which is quiet/down" glance.

3. **Ranked signal cards** — every item as a card, **sorted by `signal`
   (pull) descending** so the biggest thing is first. Each card shows: the title,
   the `signal_label` (e.g. `1,851 stars today`), and a channel chip + the `who`
   (owner/repo, @handle, or subreddit). Items with captured `full_text` are
   **clickable** — a small "read it here" affordance — and cascade/fade in
   staggered.
   - **Click a card → a modal opens** showing the **full captured text**
     (`full_text`, scrollable), the channel + source + date, and an **"open
     source ↗"** link to the original URL. Close on the ✕, on click-outside, or
     on `Esc`. Items with no captured text (e.g. bare Reddit/MCP titles) are not
     clickable — they just link out.

Order the sections exactly like that: tiles, then bars, then cards.

## Tab 2 — Pipeline (how the machine works — the postable bit)

A horizontal **node graph** of the flow, drawn in plain HTML/CSS (no chart
library). This is the tab that explains the whole thing in one picture, so it's
worth making it clean. Two rows joined by a downward connector:

```
[7:30am · every 2 days] → [Watchlist (yaml)] → [GitHub] → [Reddit] → [YouTube] → [MCP] → [X · your login]
                                                     │
[Dedup] → [Deep read · top 10, full text] → [Notes + signals.json] → [Dashboard · this page]
```

- Colour the nodes by role (a small legend up top): **external source (free)**,
  **deep read**, **local step**, **output**. Mark the X node as the one that
  needs a login.
- Animate the nodes cascading in left → right on load / tab-switch.
- **Caption underneath (the honest hero line — keep it):**
  > Every other morning this runs before you're up: five sources scraped,
  > deduped, the top ten read in full, saved as markdown + one `signals.json`,
  > and rendered into this page — **$0.00 per run, no API keys, no subscription.**
  > The watchlist is one small file.

Don't claim any AI runs inside the pipeline — it's deterministic code. The
thinking happens when *you* read this dashboard.

## Design rules

- **Light theme**, generous whitespace, **one accent colour** used consistently
  (the reel uses a calm blue on a warm off-white; pick one and stick to it). No
  dark-mode toggle needed.
- A monospace body font with a sans-serif for the big numbers gives it the
  "console" look from the reel — but use a **system font stack**, no web-font
  CDN. It must render with zero network.
- **Load animations matter** — tiles count up, bars grow from zero, cards
  cascade in, pipeline nodes stagger. They make it feel alive with no
  dependencies.
- **Everything inline:** one `dashboard.html`, `<style>` + `<script>` embedded,
  **zero external requests** — it has to open offline by double-click.
- Desktop-first; it's a review tool. Don't break on a phone, but don't sweat it.
- Anything sensitive is already stripped upstream — but never echo file-system
  paths or tokens into the page; it's an artifact you might share.

## Data contract — `signals/YYYY-MM-DD/signals.json`

The scraper writes exactly this. Build the whole page from it; you don't need the
markdown notes (they're the human-readable archive of the same `full_text`).

```json
{
  "date": "2026-07-15",
  "generated_at": "2026-07-15T07:30:12",
  "channels": {
    "github":  {"status": "ok",   "detail": "trending scraped", "count": 12},
    "reddit":  {"status": "ok",   "detail": "rss scraped",      "count": 20},
    "youtube": {"status": "ok",   "detail": "4 new videos",     "count": 4},
    "mcp":     {"status": "ok",   "detail": "registry scraped", "count": 10},
    "x":       {"status": "down", "detail": "X needs your own login — see README", "count": 0}
  },
  "items": [
    {
      "channel": "github",
      "title": "owner/repo",
      "url": "https://github.com/owner/repo",
      "summary": "one-line description from the source",
      "signal": 1851,
      "signal_label": "1,851 stars today",
      "source": "GitHub Trending",
      "who": "owner/repo",
      "item_id": "owner-repo",
      "note_file": "web-owner-repo-1a2b3c4d.md",
      "transcript_skipped": false,
      "full_text": "…the deep-read text, or \"\" if this item wasn't read in full"
    }
  ]
}
```

Field notes:

- `channels` — always the five sources. `status` is `"ok"` or `"down"`; a `down`
  channel (X unconfigured, or a source that failed) should render greyed with its
  `detail` as the reason. `count` drives the volume bars.
- `signal` — the numeric pull for ranking (GitHub stars-today; X likes). `0` for
  Reddit / MCP / YouTube (they have no numeric score) — rank those by their
  order in the array, which is already the source's own ranking.
- `signal_label` — the human string to print on the card.
- `who` — short attribution for the chip (`owner/repo`, `@handle`, `r/sub`); may
  be `""`.
- `full_text` — the captured deep-read/transcript. **Present ⇒ the card is
  clickable and the modal shows this.** Empty ⇒ not clickable.
- `note_file` — the sibling markdown note in the same folder, if you want to link
  to it; optional, `""` when there's no full text.
- `transcript_skipped` — `true` for a YouTube video with no captions; show a
  small "no transcript" hint if you like.

Any missing or empty field should render as `—` and **never break the page**.
