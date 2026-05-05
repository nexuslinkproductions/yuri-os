# NISABA — HOUSE 3: DISTRIBUTION SWARM
*The Granary Gate. Where the harvest reaches the world.*

---

## THE DISTRIBUTION DOCTRINE

> Production without distribution is a warehouse fire.
> You built the thing. Nobody saw it.
> NISABA does not allow this.

Distribution is not marketing. Marketing is a department with a budget and a prayer.
Distribution is a **pipeline with specialists, a scheduler, and measurable output**.

Each agent in the pipeline has one narrow job. Each agent's output becomes the next agent's input.
The pipeline runs on a schedule. The schedule is non-negotiable.

---

## THE PIPELINE

```
SCOUT (07:00) → finds opportunities
  ↓
WRITER (09:00) → creates primary content
  ↓
CAROUSEL (11:00) → creates visual content from written content
  ↓
COMMUNITY (13:00) → creates engagement drafts from Scout's findings
  ↓
AMPLIFIER (15:00) → adapts content to each platform natively
  ↓
MEASURER (Sunday 20:00) → measures everything, feeds back to Scout
```

Every agent in this pipeline is a Claude Code subagent or routine.
Every agent reads from and writes to a shared state directory: `.nisaba/distribution/`

---

## AGENT 1: SCOUT

**Job:** Find what the world is talking about that intersects with what we build.
**Trigger:** Daily 07:00 (cron or Claude Code scheduled task)
**Cost:** ~$0.10–0.30 per run (Haiku with web search)

### What the Scout does

```
1. Read the project's topic definition (.nisaba/distribution/topics.md)
2. Search 4 channels:
   - Hacker News (front page + "Show HN" + "Ask HN")
   - Reddit (configured subreddits — r/SaaS, r/webdev, r/filmmaking, r/cinematography)
   - X/Twitter (configured keywords)
   - Google Trends (configured terms)
3. Score each opportunity:
   Recency (0–3):    posted < 24h = 3, < 48h = 2, < 7d = 1, older = 0
   Relevance (0–3):  exact topic match = 3, adjacent = 2, tangential = 1, unrelated = 0
   Opportunity (0–3): no good answers yet = 3, some answers = 2, saturated = 0
   Total score = Recency + Relevance + Opportunity (max 9)
4. Output: ranked list to .nisaba/distribution/scout-{date}.md
```

### Scout output format
```markdown
# Scout Report — 2026-04-19

## Top Opportunities (score ≥ 6)

### 1. "How to automate video delivery for clients" (Score: 8)
- Source: Reddit r/videography — 47 upvotes, 12 comments, 6 hours ago
- URL: https://reddit.com/r/videography/...
- Gap: No one mentioned automated delivery pipelines
- Our angle: Nexus Link's client portal approach
- Keyword: "automated video delivery"

### 2. "Best practices for AI agent orchestration" (Score: 7)
- Source: Hacker News — 89 points, 34 comments, 14 hours ago
- URL: https://news.ycombinator.com/item?id=...
- Gap: Most comments discuss single-agent approaches, not swarms
- Our angle: NISABA's swarm architecture
- Keyword: "AI agent orchestration"

## Tracked but below threshold (score 4–5)
[...]

## No-go topics (score < 4)
[...]
```

### Topic definition file
```markdown
# .nisaba/distribution/topics.md

## Core topics (relevance = 3 if matched)
- AI agent orchestration
- Autonomous coding workflows
- Claude Code automation
- Video production automation
- Client portal design
- SaaS building with AI

## Adjacent topics (relevance = 2 if matched)
- Developer productivity
- No-code/low-code tools
- Freelance workflow optimization
- Content creation pipelines

## Subreddits to monitor
- r/SaaS
- r/webdev
- r/ClaudeAI
- r/videography
- r/cinematography
- r/Filmmakers

## Keywords for X/Twitter
- "claude code"
- "AI agents"
- "ship faster"
- "video production workflow"
```

---

## AGENT 2: WRITER

**Job:** Turn the top Scout opportunity into a complete, SEO+GEO-optimized blog post.
**Trigger:** Daily 09:00 (after Scout)
**Cost:** ~$0.50–1.50 per run (Sonnet with web research)

### Writer workflow

```
1. Read today's Scout report (.nisaba/distribution/scout-{date}.md)
2. Select the #1 opportunity (highest score, not yet written about)
3. Research: read 3–5 primary sources via web search
   - Competitor articles on the same topic
   - Documentation / official sources
   - Real examples with concrete numbers
4. Write the post to .nisaba/distribution/drafts/{date}-{slug}.md
5. Self-verify against the quality rubric before marking done
6. Update state: mark opportunity as "written" in scout report
```

### Writer rules (non-negotiable)

```
STRUCTURE:
- Title: [number] + [outcome] format ("7 Patterns That Ship Code While You Sleep")
- Hook: first paragraph must state the problem the reader has RIGHT NOW
- Body: each section answers one question, with one concrete example
- CTA: one specific next step (not "contact us" — a real action)

SEO:
- Target keyword in title, first H2, and 2+ body sections
- Meta description: 150–160 chars, includes keyword, states benefit
- URL slug: 3–5 words, keyword included
- Internal links: 2–3 links to existing content
- Schema markup: Article type with author, date, description

GEO (Generative Engine Optimization — for AI citation):
- Lead every section with a one-sentence definition
- Use specific numbers, never vague claims
- Answer the follow-up question within the same section
- Tables and lists over prose (LLMs extract structured content more reliably)
- Include FAQ section with 3–5 real questions
- Ensure all claims are verifiable

BANNED:
- "Game-changer", "revolutionary", "unleash", "dive into", "buckle up"
- "In today's fast-paced world", "It's no secret that"
- Em-dashes (use commas, colons, or periods)
- Passive voice in opening paragraphs
- Claims without specific numbers or evidence
```

### Writer quality rubric (self-evaluation before output)
```
Sprint gates (binary — if ANY fail, rewrite):
  [ ] No banned words or phrases
  [ ] Specific numbers in at least 3 sections
  [ ] CTA is a real action, not a vague invitation
  [ ] FAQ section has 3+ real questions

Weighted dimensions:
  Relevance to Scout opportunity (0.25) — does this directly address the gap?
  Depth of insight (0.25) — is there something here you can't find elsewhere?
  Actionability (0.20) — can the reader do something after reading this?
  SEO compliance (0.15) — keyword placement, meta, schema, structure
  GEO compliance (0.15) — definition-first, structured, verifiable

Threshold: 7.0 (below = iterate, above = ship)
```

---

## AGENT 3: CAROUSEL

**Job:** Turn the latest blog post into a 7-slide visual carousel for Instagram/LinkedIn.
**Trigger:** Daily 11:00 (after Writer)
**Cost:** ~$0.30–0.80 per run (Sonnet for TSX generation)

### Carousel specification

```
Slide structure (always 7 slides):
  Slide 1: HOOK — bold statement or question that stops the scroll
  Slides 2–6: VALUE — one insight per slide, short text, visual hierarchy
  Slide 7: CTA — specific action (follow, comment, link in bio)

Format: 1080 × 1350 px (Instagram portrait)
Font: clean sans-serif (Inter or similar)
Colors: brand palette from .nisaba/distribution/brand.md
Background: gradient or solid from brand palette (never white)

Each slide:
  - Max 40 words
  - One key number or stat highlighted large
  - Visual hierarchy: headline (large) → supporting text (small)
  - No logos on slides 2–6 (only slide 1 and 7)
```

### Carousel implementation approaches

```
Approach 1: TSX → PNG (if Remotion or React tooling available)
  Generate 7 React components
  Render each to 1080x1350 PNG via Puppeteer/Playwright
  Output: 7 PNG files in .nisaba/distribution/carousels/{date}/

Approach 2: Markdown → Image generation tool
  Generate 7 slide descriptions
  Use image generation tool to create each slide
  Output: 7 images in .nisaba/distribution/carousels/{date}/

Approach 3: Structured output (for manual design)
  Generate 7 slide text blocks with layout instructions
  Output: .nisaba/distribution/carousels/{date}/slides.md
  Marcel or designer implements in Figma/Canva
```

### Self-verification
```
Before marking done, the Carousel agent verifies:
  [ ] Exactly 7 slides generated
  [ ] Slide 1 is a hook (question or bold claim)
  [ ] Slide 7 has CTA
  [ ] No slide exceeds 40 words
  [ ] Each slide 2–6 has one clear insight
  [ ] Colors match brand palette
  [ ] All images render at 1080x1350
```

---

## AGENT 4: COMMUNITY

**Job:** Draft value-first replies for relevant Reddit/HN threads.
**Trigger:** Daily 13:00 (after Scout finds threads)
**Cost:** ~$0.10–0.30 per run (Haiku)

### Community rules (sacred — violating these burns credibility)

```
THE 90/10 RULE:
  90% of community engagement is genuine value: answering questions,
  sharing experience, helping people solve problems.
  10% is subtle reference to your own work — and ONLY when directly relevant.

  If the thread topic doesn't naturally lead to your work, the answer is
  100% value, 0% self-reference. This is non-negotiable.

TONE:
  Write like a person at 11pm who genuinely enjoys this topic.
  No corporate speak. No buzzwords. No pitch energy.
  Contractions allowed. Informal structure allowed.
  Genuine curiosity and helpfulness required.

FORMAT:
  - Lead with the answer (not "great question!")
  - Include one specific detail that proves real experience
  - If referencing your own tool/project, state it plainly: "I built X"
  - No emoji. No exclamation marks (one max, if genuinely excited).
  - No "hope this helps!" closers

NEVER:
  - Post the same reply in multiple threads
  - Reply to threads older than 48 hours
  - Self-promote in threads that don't naturally invite it
  - Use alt accounts or coordinate upvotes
  - Reply to your own threads with additional info from another account
```

### Community output format
```markdown
# Community Drafts — 2026-04-19

## Thread 1: "How to automate video delivery for clients"
Platform: Reddit r/videography
URL: https://reddit.com/r/videography/...
Score: 8 (from Scout)

### Draft Reply:
We solved this with a simple client portal: Supabase for auth + storage,
a Next.js front end, and a webhook that fires when new files hit the
delivery bucket. Client gets an email with a secure link, downloads
directly, and the system logs the access.

Total build time was about 3 days. The webhook setup was the tricky part —
had to handle retry logic for failed email sends.

If you want the architecture: auth → upload → webhook → email → download
→ access log. Each piece is simple. The coordination is where it gets
interesting.

### Self-promotion appropriate: YES (directly relevant, stated plainly)
### Action required: HUMAN REVIEW before posting
```

---

## AGENT 5: AMPLIFIER

**Job:** Adapt the day's content to each platform's native format.
**Trigger:** Daily 15:00 (after all primary content is created)
**Cost:** ~$0.20–0.50 per run (Haiku)
**NISABA original — not in BTN.**

### Platform adaptations

```
Blog post → X/Twitter thread:
  - 5–8 tweets
  - First tweet = hook (standalone value, works without thread)
  - Last tweet = CTA (link to full post)
  - Each tweet: one idea, ≤ 250 chars
  - No hashtags (they reduce reach in 2025+)

Blog post → LinkedIn post:
  - 800–1200 words
  - First line = hook (stops the scroll in feed)
  - Structure: story → insight → specific numbers → question
  - End with a question that invites genuine comments
  - No hashtags in body (3 max at very end, only if relevant)

Blog post → Newsletter snippet:
  - 150–200 words
  - Opens with the single most valuable insight from the post
  - Links to full post for depth
  - Personal tone (first person, conversational)

Carousel → Instagram caption:
  - 100–200 words
  - Opens with the carousel hook restated differently
  - Ends with "Save this for later" or specific engagement prompt
  - Hashtags: 5–10 relevant, not generic

Blog post → YouTube description (if video exists):
  - SEO-optimized title suggestion
  - Structured description with timestamps
  - Links to related content
  - Tags: 8–12 relevant terms
```

### Cross-platform consistency rules
```
Each adaptation:
  - Maintains the core insight (same message, different format)
  - Uses platform-native language and structure
  - Never copy-pastes between platforms (each is rewritten natively)
  - Links back to the canonical blog post (SEO benefit)
  - Maintains brand voice consistency
```

---

## AGENT 6: MEASURER

**Job:** Measure everything published in the last 7 days. Feed results back to Scout.
**Trigger:** Weekly Sunday 20:00
**Cost:** ~$0.30–0.80 per run (Sonnet for analysis)
**NISABA original — not in BTN.**

### What the Measurer tracks

```
Per content piece:
  - Platform: where it was published
  - Date: when it was published
  - Topic: what Scout opportunity it addressed
  - Engagement: views, likes, comments, shares, saves
  - Traffic: clicks to site, time on page, bounce rate
  - Conversion: signups, downloads, contact form submissions
  - ROI: (conversion value) / (production cost)

Aggregated weekly:
  - Best-performing topic (by conversion, not vanity metrics)
  - Best-performing platform (by conversion)
  - Content type ranking (blog > carousel > community reply > thread)
  - Topic saturation signals (declining engagement on repeated topics)
  - New topic opportunities (engagement spikes on first-time topics)
```

### Measurer output format
```markdown
# Distribution Measurement — Week of 2026-04-14

## Top performers (by conversion)
1. "7 Patterns That Ship Code While You Sleep" — Blog
   Views: 2,340 | Clicks: 187 | Signups: 12 | ROI: 8.0x
   Topic: AI agent orchestration
   Insight: Technical depth with specific numbers drives signups

2. AI Orchestration Carousel — Instagram
   Impressions: 4,100 | Saves: 89 | Profile visits: 156 | Signups: 3
   Topic: AI agent orchestration
   Insight: Carousels drive saves; saves drive delayed conversions

## Underperformers
1. "Getting Started with Claude Code" — LinkedIn
   Views: 340 | Comments: 2 | Clicks: 8 | Signups: 0
   Diagnosis: Topic too introductory for LinkedIn audience (they're advanced)

## Feedback to Scout
INCREASE priority: "AI agent orchestration", "autonomous coding"
DECREASE priority: "getting started" / introductory content
NEW signal: "video production automation" trending in r/videography (test next week)
SATURATED: "prompt engineering tips" (declining engagement 3 weeks running)
```

### Feedback loop to Scout
```
Measurer writes a feedback file: .nisaba/distribution/feedback-{date}.md
Scout reads feedback file before running its next search.
Topics with high conversion get priority boost (+1 relevance score).
Topics with declining engagement get depriority (−1 relevance score).
New signals from Measurer get added to topics.md automatically.
```

---

## SCHEDULING & STATE MANAGEMENT

### Schedule overview
```
07:00  SCOUT      — find opportunities
09:00  WRITER     — create blog post
11:00  CAROUSEL   — create visual content
13:00  COMMUNITY  — draft engagement replies
15:00  AMPLIFIER  — cross-platform adaptation
Sunday 20:00  MEASURER  — weekly measurement + feedback
```

### State directory structure
```
.nisaba/distribution/
├── topics.md              # What we write about (updated by Scout + Measurer)
├── brand.md               # Colors, fonts, voice guidelines
├── state.json             # Current pipeline state
├── scout-{date}.md        # Daily scout reports
├── drafts/
│   └── {date}-{slug}.md   # Blog post drafts
├── carousels/
│   └── {date}/            # Carousel slides
├── community/
│   └── {date}.md          # Community reply drafts
├── amplified/
│   └── {date}/            # Cross-platform adaptations
├── measurements/
│   └── week-{date}.md     # Weekly measurement reports
└── feedback-{date}.md     # Measurer → Scout feedback
```

### State file
```json
{
  "last_updated": "2026-04-19T15:00:00Z",
  "today": {
    "scout": { "status": "done", "opportunities_found": 5 },
    "writer": { "status": "done", "post_slug": "7-patterns-ship-code" },
    "carousel": { "status": "done", "slides": 7 },
    "community": { "status": "done", "drafts": 3 },
    "amplifier": { "status": "done", "platforms": ["twitter", "linkedin", "newsletter"] }
  },
  "weekly": {
    "measurer": { "status": "pending", "last_run": "2026-04-13T20:00:00Z" }
  },
  "pipeline_health": {
    "consecutive_failures": 0,
    "last_failure": null,
    "total_content_pieces_this_week": 12
  }
}
```

---

## MARCEL-SPECIFIC DISTRIBUTION CONTEXTS

### Nexus Link Productions
```
Topics: commercial videography, client management, video delivery, creative direction
Platforms: Instagram (carousels + reels), YouTube (behind-the-scenes), LinkedIn (case studies)
Voice: professional but personable, Austrian/German market awareness
Carousel style: cinematic, dark backgrounds, high-contrast text
Community: r/videography, r/cinematography, r/Filmmakers
```

### EXEOFLOW
```
Topics: AI automation, SaaS building, developer productivity, agent orchestration
Platforms: Blog (primary), X/Twitter (threads), Reddit (r/SaaS, r/ClaudeAI)
Voice: technical, specific, no-bullshit, lead with numbers
Carousel style: tech-clean, dark mode, monospace accents
Community: r/SaaS, r/webdev, Hacker News
```

### Personal brand (Marcel Spatz)
```
Topics: building in public, Japanese learning, cinematography + AI intersection
Platforms: X/Twitter (primary), Instagram (secondary)
Voice: honest, in-progress, showing work not polished results
Community: building in public communities, language learning communities
```

---

**Status**: ACTIVE
**House**: 03 — Distribution
**Last updated**: 2026-04-19
