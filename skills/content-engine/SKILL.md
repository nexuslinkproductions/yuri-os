---
name: content-engine
description: NEXUS LINK content pipeline — radar sweeps, competitor capture, topic dives on trending subjects, and raw-thought voice conversion into Threads + LinkedIn drafts for Marcel's approval. Use when the user asks for content, drafts, posts, "run the radar", "dive <topic>", "turn this into a post", "what's trending", or social anything. NEVER posts automatically — everything is draft-only until Marcel approves.
---

# Content Engine

Radar → research → voice → drafts → Marcel approves → browser posting → ledger.

## Lane assignments (October fleet)

| Lane | Agent | Job |
|---|---|---|
| Orchestrator | Apollo (Kimi) | radar, research dives, context packs, QA gate against voice rules, posting after approval |
| **Writer** | **Hermes (Claude Code)** | **ALL drafting. Marcel's voice mimicry lives here. Never draft in another lane unless Hermes is unreachable.** |
| Imagery | Atlas (Codex) | infographics, storyboards, post visuals (board tasks) |
| Publisher | Marcel | the only approval authority, always |

Handoff pattern (canvas connections need Marcel to draw them, so the shared
board is the bus): orchestrator posts a self-contained drafting brief as a
board task addressed to Hermes; Hermes writes drafts into
`00_COMMAND-CENTER/Inbox/content-drafts/<date>/` per the format below and
marks the task done. Briefs must include: topic + angle, the research
context inline (Hermes may not have the radar output), target platforms,
and a pointer to the voice files.

## Voice files (read BEFORE drafting, every time)

1. `_SYSTEM/content-engine/VOICE-PROFILE.md` — the fingerprint (eras, mechanics,
   signature moves, scripted formula, raw-thought conversion rules)
2. `02_RESOURCES/GUIDES/CONTENT-VOICE.md` — strategy, hard rules, pillars,
   infographic spec, draft file format
3. `_SYSTEM/content-engine/voice-corpus.json` — ground-truth posts+replies
4. `_SYSTEM/content-engine/references/*/SYNTHESIS.md` and `X-SYNTHESIS.md` —
   digested competitor playbooks (script skeletons, hook taxonomies,
   transferable moves) and the X authority-tier writing patterns (7
   cross-tier moves + quality-gate checklist). Drafts must USE the patterns,
   never imitate the person. Raw competitor posts are never displayed or
   reposted anywhere: captures get digested into synthesis files (skeleton,
   beats, hook class, transferable move, rejected move) and the synthesis is
   the only thing the pipeline consumes.

## Quality gate (before any draft reaches Marcel)

Score every scripted draft against `_SYSTEM/content-engine/references/x/X-SYNTHESIS.md`
§"How this feeds the quality gate": one named cross-tier pattern, one real
number or verbatim receipt, zero CTAs, zero banned forms, decode sentence
present, reads like someone who tested the thing this week. Failing drafts
get revised before filing, not after Marcel reads them.

Hard rules (auto-fail): DRAFT-ONLY · ENGLISH ONLY · NO YURI LEAK · NO AI SLOP ·
earned numbers only · LinkedIn always has an infographic spec.

---

## Commands

### `/radar` — sweep all sources
```bash
cd _SYSTEM/signals-radar && ./.venv/bin/python research_signals.py        # gated to every 2nd day; --force to override
node _SYSTEM/content-engine/context-pack.mjs                              # ranked context for drafting
```

### `/capture <handle...>` — refresh competitor Threads captures
Browser bridge (October browser, logged-in session). Per handle:
1. `browser_navigate https://www.threads.com/@<handle>` — 404 page = dead
   handle, mark it in the watchlist comment.
2. Extract server-rendered posts IN-PAGE (fast, no scroll-reading):
   eval a walker over `script[type="application/json"]` collecting objects
   with `caption.text` + `pk` + `taken_at` (+ `like_count`). For older posts,
   install a fetch/XHR hook on `/graphql/query` first, scroll in ~5 bursts,
   harvest captures. Both patterns are proven in this worktree.
3. Write `_SYSTEM/signals-radar/threads-inbox/<handle>.json` per
   `threads-inbox/README.md`. English only. Then re-run `/radar --force`.

### `/dive <topic>` — 72-hour topic dive → post-ready drafts
The core research move. Produce 1–3 drafts on a trending topic, informative
and current, in Marcel's voice. Steps:
1. **News (Exa, keyless — run mcporter from /tmp, NOT the worktree, because
   worktree .cursor/mcp.json breaks its config loader):**
   ```bash
   cd /tmp && mcporter call 'exa.web_search_exa(query: "<topic>", numResults: 10)'
   cd /tmp && mcporter call 'exa.web_search_exa(query: "site:threads.com <topic>", numResults: 10)'
   ```
2. **Repos:** `gh search repos "<topic>" --sort stars --limit 10` and
   `gh search repos "<topic> created:>$(date -v-3d +%F)" --sort stars` for 72h freshness.
3. **Reddit:** `curl -s "https://www.reddit.com/r/ClaudeAI+LocalLLaMA+AI_Agents/top/.rss?t=week" -H "User-Agent: Mozilla/5.0"` (defusedxml parse — pattern in research_signals.py).
4. **YURI internal angle:** grep the repo for prior art on the topic (we often
   already built something adjacent — that becomes the "journey" tie-in WITHOUT
   naming internals; see rule: improve/add to the topic implicitly).
5. **Deep-read** the 2–3 best items via `curl -s "https://r.jina.ai/<url>"`.
6. Draft per VOICE-PROFILE §6: ONE current fact + ONE real number + ONE of his
   moves + flat close. The decode sentence (explain what everyone's pretending
   to understand, one plain sentence) is mandatory.
7. Write drafts to `00_COMMAND-CENTER/Inbox/content-drafts/<today>/`.

### `/voice <raw thought>` — Marcel's words → post-ready draft
Apply VOICE-PROFILE §7: light shaping only (casing, apostrophe drops, rhythm,
one move if none). Never marketing-rewrite. Output draft + one-line change note.
Flag factual errors, don't silently fix.

### `/refs <style query>` — build a reference pack (Pinterest-first)
1. `cd /tmp && mcporter call 'exa.web_search_exa(query: "site:pinterest.com <query>", numResults: 8)'`
2. Harvest images via the browser lane (pin pages are JS-walled for curl):
   open the pin/board, eval-extract `pinimg.com/.../736x/...` URLs, curl the
   CDN direct into `_SYSTEM/content-engine/references/<pack>/`.
   NOTE: needs Pinterest logged in in the connected browser (currently a
   login wall — flag to Marcel if still walled).
3. Append anchors to `_SYSTEM/content-engine/references/REFERENCE.md` and
   reference the pack in any Atlas render task. Anti-slop test in
   REFERENCE.md applies to every render.

### `/drafts` — list pending
Show all `status: draft` files newest-first with first lines.

### Posting (approved only)
Marcel sets `status: approved`. Then a browser-wired agent posts via the
live session and appends `{ts, platform, file, permalink}` to
`_SYSTEM/content-engine/content-ledger.jsonl`.

---

## Toolkit map (what to reach for)

| Need | Tool |
|---|---|
| 72h news / semantic search | Exa via mcporter (from /tmp) |
| Read any page | `curl -s https://r.jina.ai/<url>` |
| Trending repos | `gh search repos` + signals-radar github channel |
| YouTube transcripts | yt-dlp (radar youtube channel) |
| Reddit | combined-sub RSS (radar reddit channel) |
| Threads capture | browser bridge (see `/capture`) |
| OSINT methodology | `skills/cyber-collecting-open-source-intelligence`, `cyber-conducting-external-reconnaissance-with-osint`, `cyber-performing-ai-driven-osint-correlation` (confidence-scored multi-source correlation) |

## Creator OSINT (the digestion layer)

What this pipeline does to competitors IS open-source intelligence work, so
run it like OSINT, not like scrolling:
- **Collect** without touching targets: public pages via in-session fetch,
  media info endpoints, yt-dlp audio. No fake accounts, no engagement.
- **Process** everything to structured form: catalog.json (numbers) +
  transcripts (verbatim) per creator.
- **Analyze to confidence-scored patterns**, the
  `cyber-performing-ai-driven-osint-correlation` method applied to content:
  multi-post correlation (which hooks repeat across winners), engagement
  ratios (comments/plays beats raw likes), recency weighting.
- **Digest, never display**: the only artifacts the pipeline consumes are
  SYNTHESIS.md files (skeleton, beats, hook class, transferable move,
  rejected move). Raw competitor posts stay in references/, never surface in
  drafts, dashboards, or replies. We extract technique, not property
  (sharingan rule).
- **Re-capture on a cadence**: weekly diff per watched creator, new posts
  appended, plays re-measured after 48h maturity.
| Full platform router | `skills/agent-reach` (`agent-reach doctor --json`) |

## Cadence target (Lilly's strategy)

Threads 4–6/wk (mix: ~2 scripted dives, ~2 raw-thought conversions, ~1–2
drafted replies to radar accounts) · LinkedIn 2/wk (1 deep piece + infographic,
1 journey piece). Drafts only, always.
