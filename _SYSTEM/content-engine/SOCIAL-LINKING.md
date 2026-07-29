# SOCIAL-LINKING.md — direct AI → socials paths (research 2026-07-29)

Question: what are the efficient paths to let the AI post directly to
Marcel's socials, and which fits the October workflow with minimal steps?

## The paths, ranked

### 1. Browser lane (LIVE NOW, zero setup)
Apollo is already wired to the logged-in browser (Threads + LinkedIn sessions
active). Approved drafts get posted through the real composer UI.
- Cost: $0. Setup: done. Risk: session-dependent, one platform at a time.
- This is the current default. Nothing to build.

### 2. Postiz + postiz-agent CLI (RECOMMENDED, open source)
Open-source scheduler (gitroomhq/postiz-app, **33.9k stars**) with an
agent-first CLI (gitroomhq/postiz-agent, Feb 2026): `npm i -g postiz`,
OAuth device flow (`postiz auth:login`), then `postiz posts:create` across
28+ platforms: X, LinkedIn, Instagram, TikTok, YouTube, Reddit, Threads,
Facebook...
- Why it fits: it IS the "connect my AI to my socials" product. One CLI,
  every platform, media upload supported, scheduling built in. OSS and
  self-hostable, so tokens live on our machine.
- Setup needed from Marcel (one time, ~15 min): create Postiz account (cloud
  or self-host), connect each social channel in their UI (OAuth clicks),
  then `postiz auth:login` on this machine.
- After that, the approval flow stays identical: Marcel approves in the
  dashboard, the lane runs one postiz command instead of driving the browser.

### 2b. RobinReach (fastest to live, closed SaaS)
robinreach.com/post-to-threads-with-claude — free account, one OAuth click
per network, ONE MCP URL gives Claude/ChatGPT/Codex real tools (draft,
validate, media, schedule, publish) across 12 networks incl. Threads, X,
LinkedIn, Instagram. No Meta dev app, no token refresh, no code.
- Trade: closed SaaS, posting credentials live in their cloud, free tier
  limits. Fine to be live today; Postiz is the ownership path.
- Works as an MCP server, so any lane (Claude, Codex, Kimi) can call it.

### 2c. Other OSS checked (weaker)
- inovector/mixpost (3.5k stars) — Laravel self-hosted scheduler, no agent
  CLI; would need custom API glue.
- Anil-matcha/Free-AI-Social-Media-Scheduler (472 stars) — Postiz-lite,
  too young to trust with accounts.
- SaaS APIs (Ayrshare, upload-post, GetLate, Blotato) — paid, same
  credentials-in-their-cloud trade as RobinReach without the MCP-native UX.

### 3. Official APIs (per-platform, more control, more paperwork)
- **Threads API** (Meta for Developers): real posting endpoints exist
  (developers.facebook.com/docs/threads). Needs a Meta developer app +
  Threads account linked; rate limits documented (socialcrawl.dev 2026-06
  analysis). Good long-term, but app setup + token management for one
  platform.
- **LinkedIn Posts API** (Community Management): posting works, but the API
  product requires LinkedIn app review/approval. Weeks, not minutes.
- **X API**: posting on free tier is crippled; useful tiers are paid.
- Verdict: only worth it if Postiz coverage fails somewhere. Postiz wraps
  most of these anyway.

### 4. n8n / Make / Zapier
Possible but adds a whole automation platform for something Postiz + the
browser lane already cover. Skip.

## Decision

Phase A (now): browser lane posting from the approval queue.
Phase B (when Marcel does the 15-min Postiz setup): switch the posting step
to `postiz posts:create`, keep everything else identical. The dashboard
queue contract (`GET /api/queue` → post → `POST /api/queue/posted`) does not
change either way.

## Security note (from agent-reach install guide, applies here too)

Posting tokens = full account access. Keep them in one place only
(`~/.postiz/credentials.json` or the browser session), never in the repo,
never in drafts, never in logs. If a platform ever offers a secondary
posting scope, take it.
