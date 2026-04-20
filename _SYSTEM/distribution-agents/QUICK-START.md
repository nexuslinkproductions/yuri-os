# Distribution Agents — Quick Start

**Four agents. Four schedules. One mission: Build Nexus Link brand while you shoot.**

---

## Setup (5 minutes)

### 1. Review Configuration

```bash
cat /Volumes/T7/NUDIMMUD/_SYSTEM/distribution-agents/config.json
```

Verify:
- ✓ Schedules match your timezone (Vienna)
- ✓ Output directories exist
- ✓ Brand voice resonates with you

### 2. Enable Schedules

**Via Claude Code:**
```bash
claude code schedule set \
  --task behind-the-scenes-writer \
  --cron "0 9 * * 1-5" \
  --agent AGENT-behind-the-scenes-writer.md
```

Repeat for each agent (carousel, reddit, finance).

**Or manually:** Add to crontab:
```bash
0 9 * * 1-5  /path/to/agent.js behind-the-scenes-writer
0 14 * * 1,3,5  /path/to/agent.js carousel-maker
0 11 * * *  /path/to/agent.js reddit-scout
0 8 * * 1  /path/to/agent.js finance-digest
```

### 3. Create Output Directories

```bash
mkdir -p /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/
mkdir -p /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/
mkdir -p /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/
mkdir -p /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/
```

---

## Daily Workflow

### After Every Shoot

Write debrief notes (5 min):

```
/Volumes/T7/NUDIMMUD/01_PROJECTS/[CLIENT]/[PROJECT]/DEBRIEF.md
```

Include:
- What worked
- What failed (and how you fixed it)
- Key techniques used
- Gear notes
- One insight learned

Example:
```markdown
# Shoot Debrief — MACL ONE Campaign, April 19, 2026

## What Worked
- Gimbal stabilization on crane shot (DJI RS 3 Mini, 35mm)
- 3-point interview lighting in windowless room
- Wireless audio stayed interference-free (RF pre-check helped)

## What Failed & Fix
- Initial gimbal drift at second location (humidity + temperature swings)
  Fix: Recalibrated after 30-min drive, compass-free mode temporarily
  
## Techniques Used
- Gimbal: balanced before shoot, recal every location change
- Interview lighting: 1K key + reflector fill + practical lamps as kickers
- Wireless: Sennheiser G4 on 2.4GHz, scanned interference before choosing freq

## Gear Notes
- Red Komodo white balance adjusted for tungsten lighting
- Backup gimbal battery ready after issue at second location
- Audio recorder picked up ambient conversation (good B-roll audio)

## Insight Learned
Recalibrating gimbal after location change is essential. Temperature/humidity changes throw off the accelerometers. Compass-free mode is a valid workaround when RF interference is present.
```

---

## The Four Agents

### 1. Behind-the-Scenes Writer
**Runs:** Weekdays 9:00 AM  
**Reads:** Your debrief notes  
**Creates:** 1 blog post (500–800 words)  
**Output:** `/blog/posts/[date]-[topic].mdx`

**What it needs from you:**
- Detailed shoot notes with techniques, challenges, solutions

**What it delivers:**
- SEO-optimized blog post on production technique
- Ready to publish to nexus-link.com

---

### 2. Carousel Maker
**Runs:** Mon/Wed/Fri 2:00 PM  
**Reads:** Recent blog posts  
**Creates:** 7-slide Instagram carousel  
**Output:** `/social/carousels/[date]-[topic]/`

**What it needs from you:**
- Optional: photographic assets or footage from shoot
- Blog posts already published

**What it delivers:**
- 7 PNG files (1080x1350 each)
- Ready to post on Instagram

---

### 3. Reddit Scout
**Runs:** Daily 11:00 AM  
**Searches:** Relevant subreddits  
**Creates:** Curated threads + drafted replies  
**Output:** `/social/reddit-drafts/[date]-reddit-daily.md`

**What it needs from you:**
- Target subreddits to monitor (configured in AGENT file)
- Your expertise (to draft authentic replies)

**What it delivers:**
- 8–10 curated threads daily
- Drafted replies for each (100% value, zero sales pitch)
- Ready for you to post manually

**The 90/10 Rule:**
9 out of 10 replies are pure value. 1 can mention Nexus Link contextually. Never promote.

---

### 4. Finance Digest
**Runs:** Monday 8:00 AM  
**Reads:** Finance folder (invoices, expenses)  
**Creates:** Weekly cash flow summary  
**Output:** `/reports/finance/[date]-weekly-digest.md`

**What it needs from you:**
- Proper file organization (invoices in invoices/ folder, expenses in expenses/)
- Consistent invoice naming (INV-YYYY-###_Client.pdf)

**What it delivers:**
- Outstanding invoices summary
- Upcoming payments list
- Action items (who to chase for payment)
- Email-ready format

---

## Expected Monthly Output

| Agent | Items/Month | Impact |
|-------|-------------|--------|
| Blog Writer | 20 posts | 500–2000 organic visitors |
| Carousel Maker | 12 carousels | 1000–5000 Instagram impressions |
| Reddit Scout | 200+ drafts | 100–500 upvotes, 5–10 DMs |
| Finance Digest | 4 reports | Timely cash flow clarity |

---

## Review Schedule

**Blog Posts:** Review before auto-publish  
**Carousels:** Review before posting to Instagram  
**Reddit Drafts:** Review before posting (ensure 90/10 rule maintained)  
**Finance Digest:** Skim weekly (15 min), act on urgent items

---

## Troubleshooting

**Q: Blog post didn't generate**
- A: Check that DEBRIEF.md exists in project folder and has content

**Q: Carousel looks bland**
- A: Include photography/footage references in blog post
- Agents use available images; more assets = better design

**Q: Reddit drafts don't feel authentic**
- A: Agent mirrors your experience from shoot notes
- More detailed notes → more authentic replies

**Q: Finance digest is wrong**
- A: Check file organization (invoices/ and expenses/ folders)
- Verify INV and EXP filenames follow naming convention

---

## Commands

### List all scheduled agents
```bash
claude code schedule list
```

### Manually trigger an agent (test)
```bash
node /Volumes/T7/NUDIMMUD/_SYSTEM/distribution-agents/orchestrator.js \
  --agent behind-the-scenes-writer \
  --manual
```

### View recent outputs
```bash
ls -lah /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/
ls -lah /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/
ls -lah /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/
ls -lah /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/
```

---

## Integration Checkpoints

### With Self-Evolving Hooks
Your corrections to agent outputs are captured:
- "Edit this blog post, remove X phrase"
- Hook learns: don't use X phrase in future writing
- Future blog posts automatically better

### With Trace to Skill
After 50+ blog posts, extract patterns:
- "What makes great production writing?"
- Run Trace to Skill on blog writing agent
- Create SKILL.md for future writers

### With GAN Loop (Optional)
If you want quality gates:
- Blog post generated → evaluator scores it → feedback loop
- Carousels generated → design evaluator checks them
- Reddit drafts → authenticity check

### With Autonomous Swarm (Later)
Swarm uses these agents for overnight processing:
- While you sleep: brand content created + deployed
- You wake to published posts, ready carousels

---

## Success Metrics (30 Days)

| Metric | Target | Tracking |
|--------|--------|----------|
| Blog posts published | 20 | Check `/blog/posts/` folder |
| Carousels created | 12 | Check `/social/carousels/` folder |
| Reddit drafts ready | 200+ | Check `/social/reddit-drafts/` |
| Finance digests | 4 | Check `/reports/finance/` |
| Organic blog traffic | 500–2000 visitors | Google Analytics (if site live) |
| Instagram engagement | Growing followers | Instagram analytics |
| Reddit upvotes | 100–500 total | Manual tracking of posted replies |
| Invoice follow-ups | 100% on time | Finance digest action items completed |

---

## Customization

Everything in `config.json` is adjustable:

```json
{
  "agents": [
    {
      "schedule": "0 9 * * 1-5"  // Change time
    }
  ],
  "outputs": {
    "blog_posts": "/custom/path/"  // Change directory
  },
  "brand": {
    "voice": "..."  // Update brand message
  }
}
```

After Claudio sync, adjust together:
- Blog tone preferences
- Reddit engagement rules
- Finance report format
- Carousel design style

---

## That's It

Write debrief notes after shoots. Agents handle the rest. Brand builds automatically while you focus on production.

Start now. Monitor for 2 weeks. Adjust as needed.
