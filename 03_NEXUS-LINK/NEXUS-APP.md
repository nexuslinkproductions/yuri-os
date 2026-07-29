# NEXUS — Marcel's personal application

Status: FOUNDATION (2026-07-29). Rebuilt on the content-engine core after the
original nexus-app code was lost (research docs survive in
`YURI-BUSINESS/02_RESOURCES/RESEARCH/nexus-*2026-07-0*.md`).

## What Nexus is becoming

Not a dashboard. Marcel's office board, creative studio, and eventually his
externalized brain: one local app he opens to view, monitor, decide, and
create — with any LLM able to drive it through a curated MCP surface.

## Layers (what exists / what's next)

### 1. Control surface (LIVE)
`app/server.mjs` + `app/index.html` on :8472
- Radar: live signals sweep (GitHub/Reddit/YouTube/MCP/Threads) with trend
  keywords
- Star Map: every draft per platform with simulated previews; EDIT /
  DISAPPROVE WITH EDITS / APPROVE; media rendered inline
- Intelligence: digested competitor + X-authority patterns (script skeleton,
  hook taxonomy, transferable moves, refused patterns) with receipts
  drill-down
- Queue: approved posts, copy text, mark-posted, permalink ledger
- Benchmarks: the news-outlet strip (real numbers only)
- Connections: platform status (Threads/LinkedIn live via browser, Postiz,
  Pinterest, Email, IG, Trading)

### 2. Agent seam (THIS WEEK)
`app/social-mcp.mjs` on :8787/mcp — the original July 5 design, honored:
one aggregator MCP, 7 curated verbs, no CRUD dump:
`draft`, `schedule`, `post_now`, `read_mentions`, `read_analytics`,
`reply`, `cross_post_with_overrides`.
- Any LLM client (Claude, Codex, Kimi, ChatGPT via connector) drives the
  same pipeline Marcel sees in the UI.
- The approval gate is protocol-level: post_now only fires on
  `status: approved`. Marcel remains the only publisher.

### 3. Connector layer (IN PROGRESS)
- Browser lane: LIVE (Threads + LinkedIn sessions)
- Pinterest API: OAuth pending Marcel's app approval (references harvest)
- Postiz or RobinReach: the commoditized 12-28 platform write layer, one
  15-min setup away (see `_SYSTEM/content-engine/SOCIAL-LINKING.md`)
- Email, Instagram: pending decisions

### 4. Memory / brain layer (NEXT)
- The app starts surfacing YURI Track A memory: what Nexus did, decided,
  and learned per day (session journal, decision log, the content-ledger as
  the public-action memory).
- Voice + persona surfaces come later (the voice stack already exists in
  `_SYSTEM/Scripts/voice/`).

### 5. Office board (LATER)
- Analytics per post (after posting APIs land: pulls engagement back into
  the ledger)
- Calendar/tasks surfaces, email triage view
- Trading module: far stretch, see `TRADING-BRANCH.md`

## Principles (locked)

1. **Local-first.** The app, the data, the tokens. Cloud only where a
   platform forces it (RobinReach/Postiz paths documented as trades).
2. **Marcel is the only publisher.** Every outward action passes his
   approval, in UI or via an explicit approved command.
3. **Digested, not raw.** Competitor material appears as synthesis
   patterns with receipts, never as reposted content.
4. **Any LLM can drive it.** The MCP seam is the contract; the UI is one
   client among many.
5. **Earned numbers only.** Every metric on screen traces to a file.
