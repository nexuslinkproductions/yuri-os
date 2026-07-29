# NEXUS LINK, Personal Work Dashboard

Zero-dependency work dashboard for the NEXUS LINK content loop: signals radar,
draft review (star map), competitor research (creators), posting queue,
benchmarks, and channel connections.

No npm install, no build step. Node >= 18, builtins only (`node:http`,
`node:fs`, `node:path`). ES modules.

## Run

```bash
cd 03_NEXUS-LINK/app
node server.mjs
# open http://localhost:8472
```

`PORT` env var overrides the default port 8472.

## UI sections

| Section | What it shows |
|---------|---------------|
| Radar | Canvas radial sweep of the latest signals-radar sweep. Blips positioned by channel (angle) and signal strength (radius), glow on beam pass. Channel health rows, trend keyword chips, ranked top signals with links. |
| Star Map | Every draft as a node per platform column, color by status. Click for a 40vw drawer with a platform-faithful mock (Threads dark card / LinkedIn light card), ready media rendered inline, char count, production notes, and SAVE EDIT / DISAPPROVE WITH EDITS / APPROVE actions. |
| Intelligence | Digested competitor intelligence, patterns first. jlee.mov playbook from `SYNTHESIS.md`: 7-beat script skeleton strip, hook taxonomy ranked by plays as bars, transferable moves, refused patterns, and per-pattern "see receipts" drill-downs into the catalog posts that prove them. X authority-tier synthesis from `X-SYNTHESIS.md` as a second pattern group with per-account evidence. Posts are evidence rows, never the primary display. |
| Queue | Approved drafts oldest-first with platform previews, copy-text button, and a mark-posted flow (permalink in, ledger entry out). Posted ledger below. |
| Benchmarks | News-style list seeded from `benchmarks.json`. |
| Connections | Channel status cards from `connections.json`. |

Polls every 5 seconds. Panels never re-render while you are interacting with
them (drawer open, textarea or input focused, mark-posted form open).

## API

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/api/health` | — | `{ok:true}` |
| GET | `/api/radar` | — | `{date, generated_at, channels, items[12], trends[10]}` |
| GET | `/api/competitors` | — | `{accounts:[{account, captured_at, posts sorted by likes}]}` |
| GET | `/api/creators` | — | `{creator, name, followers, positioning, scraped_at, posts sorted by plays desc (null plays last)}` |
| GET | `/api/synthesis` | — | `{jlee, x}`: both synthesis markdown files parsed server-side (skeleton beats, hook taxonomy with plays + derived receipts, moves, refusals; X accounts, cross-tier patterns with account receipts) |
| GET | `/media/<file>` | — | serves png/jpg from `_SYSTEM/content-engine/media/`, correct content-type |
| GET | `/api/drafts` | — | `{drafts:[{id, date, file, platform, pillar, status, body, infographic, media_needed, chars}]}` |
| POST | `/api/drafts/edit` | `{id, body}` | rewrites body section, frontmatter and tail untouched |
| POST | `/api/drafts/approve` | `{id}` | sets `status: approved` |
| POST | `/api/drafts/disapprove` | `{id, note}` | sets `status: rejected`, appends `review_note:` |
| GET | `/api/queue` | — | approved drafts, oldest first |
| POST | `/api/queue/posted` | `{id, permalink}` | sets `status: posted`, appends ledger line |
| GET | `/api/ledger` | — | `{entries:[{ts, platform, file, permalink}]}` |
| GET | `/api/voice` | — | trimmed voice corpus (bio, eras, voice facts, posts) |
| GET | `/api/benchmarks` | — | contents of `benchmarks.json` |
| GET | `/api/connections` | — | contents of `connections.json` |

All writes are atomic-ish (write tmp file, then rename). Draft `id` is a
relative path like `2026-07-29/threads-foo.md` and is validated to stay inside
the content-drafts directory (no traversal). `/media/<file>` is validated to a
bare png/jpg basename inside the media directory. JSON only, except `/media`.

## Data sources (all local, all real)

| Source | Used for |
|--------|----------|
| `_SYSTEM/signals-radar/signals/YYYY-MM-DD/signals.json` | Radar section: channel health, top items by signal, trend keywords |
| `_SYSTEM/signals-radar/threads-inbox/*.json` | `/api/competitors` competitor Threads captures |
| `_SYSTEM/content-engine/references/jlee/catalog.json` | Intelligence receipts + `/api/creators`: 33 scraped IG posts with plays/likes/comments/captions |
| `_SYSTEM/content-engine/references/jlee/SYNTHESIS.md` | Intelligence view, jlee group: skeleton, hook taxonomy, moves, refusals (parsed per request, edits flow through) |
| `_SYSTEM/content-engine/references/x/X-SYNTHESIS.md` | Intelligence view, X group: per-account patterns, cross-tier patterns (parsed per request) |
| `_SYSTEM/content-engine/media/*.png` | Ready media rendered inside draft previews (`/media/<file>`) |
| `00_COMMAND-CENTER/Inbox/content-drafts/YYYY-MM-DD/*.md` | Star Map and Queue: draft parse, edit, approve, reject, post |
| `_SYSTEM/content-engine/content-ledger.jsonl` | Posted history (created on first `/api/queue/posted`) |
| `_SYSTEM/content-engine/voice-corpus.json` | Voice reference panel on the Star Map |
| `benchmarks.json` (this folder) | Benchmarks section, edit to add entries |
| `connections.json` (this folder) | Connections section, edit to update statuses |

## Draft file format

```
---
platform: threads|linkedin
pillar: ...
status: draft|approved|rejected|posted
source_signal: ...
created: YYYY-MM-DD
---

post body

---
infographic: none | block
media_needed: ...
```

Edit/approve/disapprove/posted mutations only touch the frontmatter or the
body section; the tail block is preserved byte-for-byte.
