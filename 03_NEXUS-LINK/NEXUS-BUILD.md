# NEXUS-BUILD.md — platform build plan (heavy main build, 2026-07-29)

The Nexus app becomes Marcel's daily driver: view, monitor, decide, create.
Four milestones. Each ships working, verified software. No stubs.

## M1 — Always-on core (DONE pending verification)
- launchd user agents for the dashboard (`:8472`) and the social MCP
  (`:8787`): auto-start on login, auto-restart on crash, logs to
  `_SYSTEM/state/nexus/logs/`.
- `app/bin/nexus-start.sh` / `nexus-stop.sh` helpers + README runbook.

## M2 — Platform depth
- **Media library**: `/media/*` browsing in-app (the media/ dir + reference
  packs rendered as a grid), attach-to-draft action (sets `media_needed:
  READY — <path>` from the UI).
- **Draft edit history**: every edit writes a versioned snapshot
  (`drafts/_history/<id>/<ts>.md`) before mutation; drawer shows history.
- **Benchmark feed writer**: `/dive` results append real entries to
  `benchmarks.json` (dated, sourced) instead of hand-editing.
- **Calendar view**: the 30-day arc (Lilly's strategy) as a week grid;
  drafts snap onto days; approved+scheduled shows where it lands.

## M3 — Posting runner + analytics loop
- **Runner spec**: approved + `scheduled_at` reached → runner asks the
  browser lane to post (via the queue) → permalink written → status posted.
  Manual-confirm mode first: runner prepares, Marcel clicks "post now" in
  Queue, lane executes.
- **Own-post engagement tracker**: daily in-session scrape of
  @nexuslinkproductions (same technique as the corpus harvest) → engagement
  snapshots into `_SYSTEM/content-engine/engagement.jsonl` → Queue/benchmarks
  show deltas per posted item.

## M4 — Creative studio
- Reference packs browser (drop intake → packs), anti-slop test checklist
  in-UI, Atlas task composer (pick pack + spec → board task posted from the
  app), storyboard strip view for reels later.

## Principles (from NEXUS-APP.md, locked)
Local-first · Marcel is the only publisher · digested-not-raw · any LLM
drives it · earned numbers only.
