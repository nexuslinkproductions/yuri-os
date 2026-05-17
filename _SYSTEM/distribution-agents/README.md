# Distribution Agents — Automated Brand Building

**Status:** Framework complete, ready for scheduling  
**Purpose:** Build Nexus Link brand while you shoot  
**Time Commitment:** You write shoot notes; agents handle everything else

---

## What It Does

Four agents run on a schedule, each building a different part of your brand:

| Agent | Schedule | Output | Purpose |
|-------|----------|--------|---------|
| **Behind-the-Scenes Writer** | Weekdays 9am | 1 blog post/day | 20 posts/month on production knowledge |
| **Carousel Maker** | Mon/Wed/Fri 2pm | 1 carousel/run | 12 Instagram carousels/month |
| **Reddit Scout** | Daily 11am | Curated thread list | Daily authentic community engagement |
| **Finance Digest** | Monday 8am | 1 weekly report | Cash flow tracking + action items |

---

## How It Works

### Behind-the-Scenes Writer

**Input:** Shoot notes from today or yesterday  
**Process:** Reads notes → extracts technique/challenge → writes 500–800 word blog post  
**Output:** MDX file ready to publish to nexus-link.com blog  
**Result:** 20 blog posts per month = ~500–2000 new organic visitors via SEO

**Example:**
- You shoot with Red in morning, note gimbal drift issue in evening notes
- 9am next day: Agent reads notes, writes "Gimbal Drift: Why It Happens and How to Fix It"
- Post goes to `/blog/posts/[date]-gimbal-drift-why-it-happens.mdx`

### Carousel Maker

**Input:** Recent blog posts  
**Process:** Reads blog → extracts 5 key teaching points → designs 7-slide carousel  
**Output:** PNG files (1080x1350 each) + combined PDF  
**Result:** 12 Instagram carousels per month, each teaching something valuable

**Example:**
- Blog post published: "Interview Lighting in Windowless Rooms"
- 2pm same/next day: Agent creates carousel
  - Slide 1: "3-Point Lighting Without a Window 👇"
  - Slides 2–6: Each teaches one technique (with images)
  - Slide 7: "Try this. Tag us. 👉 @nexus.link.productions"
- Ready to post on Instagram

### Reddit Scout

**Input:** Target subreddit lists (r/videography, r/filmmaking, r/cinematography, etc.)  
**Process:** Finds relevant threads → reads question → drafts helpful reply  
**Output:** Markdown file with curated threads + drafted replies  
**Result:** Daily authentic engagement (90/10 rule: help people, don't sell)

**Rule:** 90/10 means 9 out of 10 replies are pure value with zero self-promotion.

**Example:**
- Thread on r/videography: "How do you deal with gimbal drift?"
- Agent drafts detailed reply with your experience + specific tips
- Reply is saved for you to post manually
- Zero "hire us" or "check our portfolio" language

### Finance Digest

**Input:** Finance folder (`04_FINANCE/2026/`)  
**Process:** Reads all invoices, expenses, due dates → creates summary  
**Output:** Email-ready markdown with action items  
**Result:** Weekly cash flow visibility + invoice follow-up reminders

**Example:**
- Monday 8am: Agent reviews all outstanding invoices
- Digest includes:
  - What's paid, what's pending, what's overdue
  - Upcoming payments next 2 weeks
  - Action items ("Chase C2MOVIEZ, they're 32 days overdue")
- You get clarity on cash position before your week starts

---

## Architecture

```
├── config.json                           [Schedule, brand voice, outputs]
├── AGENT-behind-the-scenes-writer.md     [Blog post generation protocol]
├── AGENT-carousel-maker.md               [Instagram carousel protocol]
├── AGENT-reddit-scout.md                 [Reddit engagement protocol]
├── AGENT-finance-digest.md               [Finance reporting protocol]
├── README.md                             [This file]
├── QUICK-START.md                        [Usage guide]
└── outputs/
    ├── blog/posts/                       [Generated blog posts]
    ├── social/carousels/                 [Generated carousels]
    ├── social/reddit-drafts/             [Reddit replies drafted]
    └── finance/                          [Weekly digests]
```

---

## Scheduling

### How to Activate

**Option A: Claude Code Scheduled Tasks**

```bash
# Create scheduled task for each agent
  --task behind-the-scenes-writer \
  --cron "0 9 * * 1-5" \
  --script AGENT-behind-the-scenes-writer.md
```

**Option B: System Cron**

```bash
# Add to ~/.crontab or /etc/cron.d
0 9 * * 1-5  /usr/bin/node /path/to/agent.js behind-the-scenes-writer
0 14 * * 1,3,5  /usr/bin/node /path/to/agent.js carousel-maker
0 11 * * *  /usr/bin/node /path/to/agent.js reddit-scout
0 8 * * 1  /usr/bin/node /path/to/agent.js finance-digest
```

### Schedules (Vienna Timezone)

| Agent | Time | Frequency | Notes |
|-------|------|-----------|-------|
| Blog Writer | 9:00 AM | Weekdays (Mon–Fri) | One post per business day |
| Carousel Maker | 2:00 PM | Mon/Wed/Fri | After blog posts have been published |
| Reddit Scout | 11:00 AM | Daily | Early enough to post when threads are active |
| Finance Digest | 8:00 AM | Mondays | First thing: plan your week with cash clarity |

---

## Workflow: From Shoot to Brand

### Day 1: You Shoot

```
Morning: Shoot on location (camera, gimbal, audio, lighting)
Evening: Write debrief notes in YURI
  - What worked
  - What failed and how you fixed it
  - Techniques used
  - Gear notes
  - Insights learned
```

### Day 2: Agents Work (While You Sleep or on Next Shoot)

```
8:00 AM: Finance Digest
  - Weekly cash flow summary
  - Invoice follow-ups

9:00 AM: Behind-the-Scenes Writer
  - Reads your debrief notes
  - Writes blog post about the technique/challenge
  - Publishes to /blog/posts/

11:00 AM: Reddit Scout
  - Finds relevant threads
  - Drafts helpful replies based on your expertise
  - Ready for you to post

2:00 PM: Carousel Maker
  - Reads published blog posts
  - Creates 7-slide Instagram carousel
  - Saves PNGs ready to post
```

### Result: By Day 3

You have:
- ✓ One published blog post (searchable, drives organic traffic)
- ✓ One Instagram carousel (visual content for followers)
- ✓ 8–10 drafted Reddit replies (authentic engagement opportunities)
- ✓ Weekly finance summary (stay on top of cash flow)

**All while you were shooting the next project.**

---

## Expected 30-Day Results

| Metric | Output | Impact |
|--------|--------|--------|
| Blog posts | 20 (5x per week) | 500–2000 organic visitors/month |
| Instagram carousels | 12 (3x per week) | 1000–5000 impressions/month |
| Reddit threads | 20–30 curated | 100–500 upvotes total, authentic visibility |
| Finance digests | 4 weekly reports | Clear cash position, timely invoice chasing |

**Brand positioning:** Nexus Link emerges as a knowledgeable, helpful, process-focused production company. Not salesy. Teaching-focused.

---

## Data Flows

### Input: What Agents Read

- **Writer:** Shoot debrief notes (you write these daily)
- **Carousel Maker:** Published blog posts
- **Reddit Scout:** Reddit API / community threads
- **Finance Digest:** Invoice folder, expense receipts, bookkeeping files

### Output: What Gets Created

- **Writer:** MDX blog posts (`/blog/posts/`)
- **Carousel Maker:** PNG files (`/social/carousels/`)
- **Reddit Scout:** Markdown drafts (`/social/reddit-drafts/`)
- **Finance Digest:** Markdown reports (`/reports/finance/`)

### Amplification

These outputs feed into:
- Website blog (SEO, organic traffic)
- Instagram (audience building)
- Reddit (community authority)
- Internal reporting (cash flow clarity)

---

## Integration with Other Systems

### Self-Evolving Hooks
- Agents' outputs are reviewed by you
- Your corrections are captured by Hooks
- Over time, Hooks learn "what Marcel approves"
- Future agents prepend those learned rules

### GAN Loop
- Before writer generates blog post, evaluator could score it
- Before carousel is rendered, could check design against rubric
- (Currently optional; adds quality gate if desired)

### Trace to Skill
- After 50+ blog posts, run Trace to Skill
- Extract "what makes great production writing"
- Codify into SKILL.md for future writers

### Autonomous Swarm
- Swarm uses these agents as part of overnight processing
- While you sleep: brand content created + deployed
- You wake to published posts, ready carousels, drafted replies

---

## What You Must Do

**Minimal effort needed from you:**

1. **Write debrief notes after shoots** (5 min)
   - What worked, what failed, what you learned
   - Saved to YURI inbox or project folder

2. **Review generated outputs** (optional)
   - Blog posts before auto-publish
   - Carousels before posting to Instagram
   - Reddit drafts before posting

3. **Post manually** (if you prefer human control)
   - Copy carousel PNGs to Instagram
   - Copy Reddit drafts to Reddit threads
   - Publish blog posts to website

4. **Act on Finance Digest** (once per week)
   - Chase overdue invoices (digest highlights them)
   - Plan expenses for the week
   - Keep cash flow healthy

**What agents do:**
- Write, design, curate, report
- Everything else

---

## Configuration

All adjustable in `config.json`:

- **Schedule times:** Change cron expressions
- **Output directories:** Where files are saved
- **Brand voice:** Your tagline, mission, audience definition
- **Agent toggles:** Enable/disable any agent
- **Frequency:** Run daily, weekly, or on-demand

---

## Next Steps

1. **Confirm agent protocols** — Read each AGENT file, verify they match your vision
2. **Set up schedules** — Activate via Claude Code tasks or system cron
3. **Provide initial shoot notes** — Agents need debrief input to start
4. **Review first outputs** — Check blog post, carousel, Reddit drafts, digest
5. **Iterate** — Adjust config or protocols based on results

---

## Quality Notes

- **Writer:** Reads your actual debrief notes, not generic
  - Quality depends on how detailed your notes are
  - Better notes → better blog posts

- **Carousel:** Design quality depends on images available
  - Include photography/footage in your shoot notes
  - Agents use that for visual content

- **Reddit Scout:** Authenticity is key
  - Agent follows 90/10 rule (no sales pitch)
  - Your reputation grows as helpful, not pushy

- **Finance Digest:** Only as accurate as your bookkeeping
  - Ensure invoices are properly dated and filed
  - Digests are only as good as the data

---

## Long-Term Vision

**Month 1:** Four agents running, producing content automatically  
**Month 2–3:** First organic traffic from blog posts, Instagram following grows  
**Month 4:** Reddit reputation building (people recognize your helpful replies)  
**Month 6+:** Nexus Link brand established as knowledgeable, teaching-focused production company

By focusing on **giving value** rather than selling, you build authentic brand authority that attracts quality clients.
