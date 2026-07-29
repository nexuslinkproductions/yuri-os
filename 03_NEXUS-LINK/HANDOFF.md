# HANDOFF — Nexus Platform Build (for Claude Code / any lane)

Date: 2026-07-29 · From: Apollo (Kimi) · Branch: `nexus-workbench`
Repo: `nexuslinkproductions/yuri-os` (PRIVATE)
Operator: Marcel Spatz (@nexuslinkproductions). He is the only publisher
and the only merger.

---

## 0. Read these first (in order)

1. `03_NEXUS-LINK/NEXUS-APP.md` — what Nexus is + the 6 locked principles
2. `03_NEXUS-LINK/app/CONTRIBUTING.md` — the PR workflow (THE RULE: nothing
   lands except via PR, PR body carries verification evidence)
3. `03_NEXUS-LINK/app/LOOPS.md` — the agentic loop system spec
4. `03_NEXUS-LINK/app/BACKEND-SPEC.md` — backend module specs (cyber patterns)
5. `03_NEXUS-LINK/NEXUS-BUILD.md` — milestone plan
6. This file — state, contracts, next steps

## 1. What exists and is verified (state on 2026-07-29)

### The app — `03_NEXUS-LINK/app/` (zero npm deps, node builtins only)
- `server.mjs` (:8472) — dashboard REST API + serves `index.html`.
  Endpoints: health, radar, competitors, drafts, drafts/edit|approve|
  disapprove, queue, queue/posted, ledger, benchmarks, connections, voice,
  synthesis, creators, alerts, media/<file>.
- `index.html` — single-file UI. Views: Radar (live sweep viz), Star Map
  (CANVAS CONSTELLATION — drafts as stars in platform clusters, status as
  light, drawer with platform mock + EDIT / DISAPPROVE WITH EDITS /
  APPROVE), Intelligence (digested patterns from synthesis files + receipts
  drill-down), Queue, Benchmarks, Connections.
- `social-mcp.mjs` (:8787/mcp) — MCP server, 7 curated verbs: draft,
  schedule, post_now, read_mentions, read_analytics, reply,
  cross_post_with_overrides. Registered in repo `.mcp.json` as
  `nexus-social`. **Approval gate is protocol-level**: post_now refuses
  non-approved drafts.
- `backend/` — spine (PR #27): store.mjs (node:sqlite typed objects +
  relationships, `_SYSTEM/state/nexus/nexus.db`), policy.mjs (deny-by-default
  registry + hash-chained `audit.jsonl` with cross-process lockfile),
  rules.mjs + 4 seed rules, alerts.mjs (RBA, banner ≥75), verify.mjs
  (secret sweep + manifest + `--audit`).
- `Nexus.command` — launcher (starts both servers, opens browser, stops on
  close). `~/Desktop/Nexus.app` wraps it.
- `node --test` from `app/`: 8/8 backend tests green.

### The content engine — `_SYSTEM/content-engine/`
- `VOICE-PROFILE.md` (the fingerprint; eras, mechanics, signature moves,
  no-CTA rule, em-dash hard ban, no "not X" landings) +
  `voice-corpus.json` (verified posts+replies scrape)
- `references/jlee/` — catalog.json (33 IG posts with plays), 26 voice
  transcripts, ANALYSIS.md, SYNTHESIS.md (7-beat script skeleton, hook
  taxonomy, transferable/refused moves)
- `references/x/X-SYNTHESIS.md` — X authority-tier writing patterns
  (karpathy, rauchg, theo, simonw, mckaywrigley, swyx) + quality-gate
  checklist every scripted draft must pass
- `references/PINTEREST-API.md` — manual references path (API skipped):
  Marcel drops images in `references/drop/` or shares a public board URL
- `SOCIAL-LINKING.md` — posting paths: browser lane (LIVE), Postiz (OSS,
  recommended), RobinReach (SaaS MCP, fastest)
- `context-pack.mjs` — ranked drafting context from radar + captures
- `media/` — Atlas-rendered PNGs (grep-tax, rene-pipeline, 1200x627)

### The radar — `_SYSTEM/signals-radar/`
- `research_signals.py` (venv in `.venv/`, NOT committed): GitHub trending,
  Reddit RSS, YouTube captions, MCP registry + a `scrape_threads` bridge
  reading `threads-inbox/*.json` (browser-captured competitor posts)
- `signals-watchlist.yaml` — 17 Threads accounts (English only), subreddits,
  YouTube channels, keywords. Edit this to retune.
- Sweep: `cd _SYSTEM/signals-radar && ./.venv/bin/python research_signals.py`
  (self-gates to every 2nd day, `--force` overrides)

### Lane assignments (October fleet)
Apollo/Kimi = orchestrator, radar, research, QA, posting lane.
**Hermes/Claude Code = the writer** (all drafting; voice files are the
contract). Atlas/Codex = imagery (board tasks, anti-slop test in
references/REFERENCE.md). Marcel = approval + merge.

### Already merged into `nexus-workbench` (2026-07-29)
- **PR #27** feat/backend-spine — backend/ + wiring + process docs +
  Intelligence view (+ constellation build swept in, noted in PR comment).
  Merged 16:08Z.
- **PR #28** feat/star-constellation — constellation hardening delta +
  MEDIA_TYPES fix (/media/* was 500ing; now 200). Merged 16:09Z.
- **PR #30** fix/nexus-security — closes 4 confirmed holes: XSS scheme
  allowlist (`safeUrl`) on all five href sinks; approval bypass (editing an
  approved draft now resets status to draft and clears `approved-by`); MCP
  path traversal in `readDraft`/`writeDraft`; duplicate-publish terminal
  guard (409 `already_posted`). Merged 17:26Z. Pull latest `nexus-workbench`
  before touching approval or publish paths.

## 2. Data contracts (do not break)

- **Draft**: `00_COMMAND-CENTER/Inbox/content-drafts/<date>/<file>.md` —
  frontmatter (platform, pillar, status: draft|approved|rejected|posted,
  source_signal, created, optional voice_pass/review_note/scheduled_at/
  reply_to) + blank line + body + tail (`---\ninfographic:\nmedia_needed:`).
  `media_needed: READY — <path>` renders in-app. NOTE: this dir is
  gitignored (local working state). It lives in the Apollo worktree:
  `/Users/marcelspatz/Library/Application Support/October/worktrees/
  YURI-OS-MUSUBI/apollo-1785308903911/`. To continue drafting continuity,
  work in that worktree or copy the folder.
- **Ledger**: `_SYSTEM/content-engine/content-ledger.jsonl` (posted posts).
- **Audit**: `_SYSTEM/state/nexus/audit.jsonl` (hash-chained, verify with
  `node backend/verify.mjs --audit`).
- **Store**: `_SYSTEM/state/nexus/nexus.db` (node:sqlite; drafts are
  indexed, files stay text-truth).
- **Signals**: `_SYSTEM/signals-radar/signals/<date>/signals.json` +
  `threads-inbox/<handle>.json` (contract in threads-inbox/README.md).

## 3. The rules (locked, enforce on every PR)

1. **PRs only** — feat/<slug> off `nexus-workbench`, evidence in body,
   Marcel merges. Agents never merge their own PRs.
2. **Marcel is the only publisher** — post_now/post.execute require
   approved status, enforced in policy.mjs (not just UI).
3. **Voice rules are auto-fail** — no CTAs of any kind, no em-dashes, no
   "not X" landings, no AI-slop list, English only, earned numbers only, no
   YURI internals in public content. Spec: `02_RESOURCES/GUIDES/
   CONTENT-VOICE.md` + `_SYSTEM/content-engine/VOICE-PROFILE.md`.
4. **Digested, not raw** — competitor material becomes SYNTHESIS.md
   patterns; never repost raw captures.
5. **Autonomy bounds** (LOOPS.md §autonomy) — auto-adjust only watchlists,
   pattern weights, brief weights, cadence; everything logged + reversible.
6. **Zero npm deps** in the app. No frameworks. Vanilla everything.
7. mcporter (Exa search) must run from /tmp, NOT the worktree (worktree
   .cursor/mcp.json breaks its config loader).

## 4. Next steps (in order)

### Immediate (this week)
1. **Pull latest `nexus-workbench`.** The backend spine (#27), constellation
   (#28), and security fixes (#30) are already merged — nothing to merge
   here. Rebase onto current `nexus-workbench` before starting.
2. **Loop engine** (`_SYSTEM/content-engine/loops/loop-runner.mjs` +
   `loops/loop-ledger.jsonl` + `adjustments.jsonl`): implement L1 sweep
   scoring (engagement percentile per account, 30-day cohort, recency
   weight) + L5 meta weekly report skeleton. Store scores via backend
   store. PR: `feat/loop-engine`.
3. **Loops view** in the dashboard: per-loop health, adjustment journal
   with revert buttons, meta report card. PR: `feat/loops-view`.

### M2 — platform depth (NEXUS-BUILD.md)
4. Media library view + attach-to-draft from UI.
5. Draft edit history (versioned snapshots before mutation, shown in drawer).
6. Benchmark feed writer: /dive results append to benchmarks.json.
7. Calendar view: 30-day arc grid, drafts snap onto days.

### M3 — posting + analytics
8. Posting runner: approved + scheduled_at reached → prepare post → Marcel
   confirms in Queue → browser lane executes → permalink → ledger.
9. Own-post engagement tracker: daily in-session scrape of
   @nexuslinkproductions → `engagement.jsonl` → feeds L4 scoring.

### Connections (Marcel's one-time steps, then lanes wire)
10. Postiz or RobinReach: Marcel picks and does the 15-min account setup;
    then `post_now` driver switches from browser-lane to API. His call:
    he'll evaluate direct connectors in Claude/Codex himself.
11. Pinterest: manual path (drop folder / public board URL) — no API.
12. X: logged-out public sweeps work now; deeper needs either October
    browser login or Cookie-Editor export from Comet → twitter-cli.

### Later
13. M4 creative studio (reference packs browser, Atlas task composer in-app).
14. Anomaly watch (BACKEND-SPEC module 6) once engagement data exists.
15. Trading module — far stretch, see `03_NEXUS-LINK/TRADING-BRANCH.md`
    (open inputs listed there).

## 5. How to run everything

```bash
# the app (both servers + browser) — or double-click ~/Desktop/Nexus.app
bash 03_NEXUS-LINK/app/Nexus.command

# servers individually
node 03_NEXUS-LINK/app/server.mjs          # dashboard :8472
node 03_NEXUS-LINK/app/social-mcp.mjs      # MCP :8787/mcp

# backend tests + audit verification
cd 03_NEXUS-LINK/app && node --test
node backend/verify.mjs --audit

# radar sweep
cd _SYSTEM/signals-radar && ./.venv/bin/python research_signals.py --force

# drafting context pack
node _SYSTEM/content-engine/context-pack.mjs

# Exa search (from /tmp only!)
cd /tmp && mcporter call 'exa.web_search_exa(query: "...", numResults: 8)'
```

## 6. Verification culture (what "done" means here)

Ran it, saw it work, pasted the output. Screenshots for UI. `node --check`
for JS. Test suite green. PR body template in CONTRIBUTING.md (What / Why /
Verification / Deviations / Risk). If you could not run it, say so in the
PR — unverified claims get PRs rejected.
