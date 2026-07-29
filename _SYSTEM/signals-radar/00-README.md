# The Signals Radar — full setup guide

This is the system from the reel: every other morning a tiny scraper sweeps five
corners of AI — GitHub, Reddit, YouTube, the MCP server registry, and (optionally)
X — reads the best items in full, and renders a one-page **Signals Radar** you
skim in a couple of minutes to decide what to make. Instead of doom-scrolling
five feeds, you read one board.

Two honest things up front:

- **It costs $0 to run.** No API keys, no metered spend, no subscription. The one
  source that needs anything is X, and that's your own login — not a paid key.
- **There's no AI inside the scraper.** It's plain, deterministic code: scrape →
  dedup → read the top items → save. The "AI" part is *you* (and Claude) reading
  the finished dashboard and spotting what's worth a post. The tool just does the
  fetching so you don't have to.

You're getting the whole thing:

| File | What it is |
|---|---|
| `00-README.md` | This guide — start here |
| `research_signals.py` | The scraper — the only code you run |
| `signals-watchlist.yaml` | Your watchlist — what to watch (fill this in) |
| `DASHBOARD-SPEC.md` | The spec Claude follows to build your `dashboard.html` |
| `com.you.signals-radar.plist` | Optional — makes it run itself every morning (Mac) |

**You don't need to be able to code.** The fastest path is to hand this whole
folder to Claude and let it do the setup.

---

## The 5-minute version (recommended)

1. Install [Claude Code](https://claude.com/claude-code) if you don't have it.
2. Make a folder (e.g. `signals-radar/`) and save all five files into it.
3. Open Claude Code in that folder and say:

> Read 00-README.md and set this signals radar up for me. What I care about is
> **[your niche / what you make or decide about]**. Fill `signals-watchlist.yaml`
> with a handful of good AI accounts and subreddits for that, install what's
> needed, run the scraper once with `--force`, then build the dashboard.

Claude will take it from there — installing the packages, tuning the watchlist,
running the first sweep, and building `dashboard.html`.

---

## What it costs to run

**$0.** Really. Here's why, so you can trust it:

- **GitHub Trending, Reddit, the MCP registry** — all public pages, no accounts.
- **YouTube** — pulls each channel's latest uploads and their captions with
  `yt-dlp`, a free open-source tool. No key.
- **The deep-reads** (pulling the full text of the top items) use
  [r.jina.ai](https://r.jina.ai) — a free public reader that needs no sign-up.
- **X / Twitter** — the only source that needs anything, and it's *your own
  login*, not a paid API. It's off until you choose to wire it in.

No line item bills you. The realistic monthly total is **$0.**

## The five sources — and which need any setup

| Source | What it pulls | Setup |
|---|---|---|
| **GitHub Trending** | AI/automation repos by stars gained today | none |
| **Reddit** | top posts of the day across your subreddits | none |
| **MCP registry** | newly listed MCP servers | none |
| **YouTube** | latest uploads per channel + caption transcripts | `pip install yt-dlp` (free) |
| **X / Twitter** | recent posts from your watchlist | **your own login** — optional |

Four of the five run with **zero login**. **X is the one that needs you to
connect your own account** (there's no free public API for it), so it ships
switched off. That's fine — the radar is genuinely useful on the other four, and
you can add X later if you want it.

## Manual setup (if you'd rather drive)

1. You need **Python 3.10+**. Install the packages:

   ```bash
   pip install requests beautifulsoup4 defusedxml pyyaml
   pip install yt-dlp        # optional — only for the YouTube source
   ```

2. Open `signals-watchlist.yaml` and make it yours — a few AI accounts, the
   subreddits your audience actually reads, keywords from your world. The
   examples in there are just to show the shape; replace them. (Conventions:
   X handles have **no** `@`, YouTube handles **keep** the `@` and stay quoted.)

3. Run the scraper:

   ```bash
   python3 research_signals.py --force      # first run (--force skips the 2-day gate)
   python3 research_signals.py --print-only  # dry run — shows what it'd grab, writes nothing
   ```

   It writes into `signals/YYYY-MM-DD/`: one `signals.json` (the dashboard's data)
   plus a markdown note for each item it read in full.

4. Tell Claude: **"Build the dashboard following DASHBOARD-SPEC.md."** You get a
   `dashboard.html` — double-click to open it in your browser.

5. Every couple of days: run the scraper again, then **"rebuild the dashboard."**

## The every-other-morning rhythm

The scraper **self-gates to a 2-day minimum** — that's the "every *other*
morning" from the reel. Run it whenever you like; if it's been less than two
days it politely skips (add `--force` to override). Open the dashboard, read the
top signals and what each source surfaced, pick your angles. That's the whole
point: **you stop watching feeds and start reading patterns.**

Want it hands-off every morning? Use the included launchd file (Mac):

1. Edit `com.you.signals-radar.plist` and replace the `/PATH/TO/signals-radar`
   placeholders with the real folder path. (If you installed the packages into a
   virtualenv, also point the `python3` line at that venv's python — a scheduled
   run doesn't use your terminal's setup.)
2. Load it:

   ```bash
   cp com.you.signals-radar.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.you.signals-radar.plist
   ```

3. To stop it later:

   ```bash
   launchctl unload ~/Library/LaunchAgents/com.you.signals-radar.plist
   ```

It pokes the script daily at 7:30am; the 2-day gate inside the script means you
actually get a sweep every other morning. Not on a Mac? Ask Claude to schedule it
with `cron` (Linux) or Task Scheduler (Windows) — same idea, same script. Out of
the box, run-when-you-want is honestly enough.

## Fair-use notes (read this once)

- This is **public data, fetched gently** — trending pages, public RSS, a public
  README, YouTube captions. The defaults keep the volume low (one sweep every
  couple of days). Keep it there; don't crank it into a constant scrape.
- It's **research signal, not a repost kit.** Read the transcripts and repo
  blurbs to learn what's landing — hooks, topics, patterns — then make your own
  thing in your own voice. Don't republish someone's transcript or video.
- The deep-reads lean on **r.jina.ai**, a free shared reader. No account needed,
  but be reasonable with it — it's a courtesy, not an entitlement.
- **X:** only ever your own logged-in session, and only if you wire it in
  yourself. This starter ships no credentials and asks for none.

## Troubleshooting

- **"Missing &lt;package&gt;"** — run the `pip install` line above.
- **Reddit returns nothing / a 429** — Reddit rate-limits bursts; wait a minute
  and re-run. It uses public RSS with a browser user-agent on purpose.
- **"yt-dlp not found"** — `pip install yt-dlp`. Only the YouTube source needs
  it; the other four don't care.
- **A YouTube video has no transcript** — some uploads simply have no captions.
  It's still listed, just without full text.
- **The scheduled run does nothing / `sweep.log` says "Missing &lt;package&gt;"** — launchd
  used a different Python than your `pip install` did. Point the plist's `python3`
  line at the exact interpreter you installed the packages into (your venv's
  `python3` if you used one), then reload it. Running by hand always uses your
  terminal's Python, which is why the manual path just works.
- **"last run was &lt;2 days ago — skipping"** — that's the gate working. Add
  `--force` to run anyway.
- **X always shows "down"** — expected until you connect your own login (see the
  `scrape_x()` note inside `research_signals.py`). The radar stays strong on the
  other four without it.
- Anything else: paste the error into Claude. It has all five files — it can fix
  its own plumbing.
