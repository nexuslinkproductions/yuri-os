# Autonomous AI Swarm — Complete System Documentation

**Status:** Ready for deployment  
**Purpose:** Overnight brand building while Marcel sleeps  
**Schedule:** Nightly 22:00–06:00 Vienna time  
**Outcome:** Wake to published content, queued carousels, drafted Reddit replies, finance digests

---

## What the Swarm Does

The Autonomous AI Swarm is a five-phase orchestration system that runs every night:

1. **Generation Phase (22:00–23:00)**
   - Dispatches all four distribution agents in parallel
   - Blog Writer, Carousel Maker, Reddit Scout, Finance Digest work simultaneously
   - Collects all outputs into staging folder

2. **Validation Phase (23:00–23:45)**
   - Runs each piece through GAN Loop validation
   - Evaluator scores against rubrics (binary gates + weighted dimensions)
   - Approves or rejects based on thresholds (7.0+ for blog/carousel, 7.5+ for Reddit, 8.5+ for finance)

3. **Learning Phase (23:45–00:15)**
   - Extracts patterns from what was generated and validated
   - Updates self-evolving hooks with new rules
   - Tracks execution metrics for future optimization

4. **Deployment Phase (00:15–00:45)**
   - Queues approved content for posting
   - Blog posts → blog queue (awaiting manual approval)
   - Carousels → Instagram queue (ready to post)
   - Reddit drafts → Reddit queue (awaiting manual review)
   - Finance digest → email ready

5. **Reporting Phase (00:45–06:00)**
   - Generates comprehensive morning briefing
   - Summarizes content generated, approved, rejected
   - Lists action items and deployment status
   - Ready for Marcel's breakfast review

**Result:** Marcel wakes to finished work. All content either published, queued, or ready for manual posting.

---

## Architecture Overview

```
/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/
├── config.json                           [Master configuration]
├── orchestrator.js                       [Main orchestration script]
├── SWARM-ORCHESTRATOR.md                 [Detailed phase instructions]
├── SWARM-DEPLOYMENT.md                   [Deployment protocol]
├── README.md                             [This file]
├── generated/                            [Output staging folder]
│   └── [YYYY-MM-DD]/
│       ├── blog-post.md
│       ├── carousel/
│       ├── reddit-drafts.json
│       └── finance-digest.json
├── validated/                            [Validation results]
│   └── [YYYY-MM-DD]/
│       └── results.json
├── deployments/                          [Deployment manifests]
│   └── [YYYY-MM-DD]-manifest.json
├── rejected/                             [Failed content]
│   └── [YYYY-MM-DD]/
├── reports/                              [Morning briefings]
│   └── [YYYY-MM-DD]-morning-brief.md
└── logs/                                 [Run logs]
    └── [YYYY-MM-DD]-run.log
```

---

## How to Activate the Swarm

### Option 1: System Cron (Recommended)

Add to your crontab:

```bash
crontab -e
```

Add this line:

```
0 22 * * * /usr/bin/node /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/orchestrator.js >> /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/logs/cron.log 2>&1
```

This runs the swarm every night at 22:00 Vienna time.

### Option 2: Claude Code Scheduled Task

```bash
/scheduled-tasks create \
  --taskId autonomous-swarm \
  --description "Autonomous AI Swarm: overnight brand building" \
  --cronExpression "0 22 * * *" \
  --prompt "Run the autonomous swarm orchestrator"
```

### Option 3: Manual Trigger (Testing)

```bash
node /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/orchestrator.js
```

Runs immediately (useful for testing or manual runs).

---

## Daily Workflow: What You Need to Do

### Before Sleeping (Evening)

1. **Write debrief notes** (if you shot today)
   - Location: `/Volumes/T7/NUDIMMUD/01_PROJECTS/[CLIENT]/[PROJECT]/DEBRIEF.md`
   - Include: what worked, what failed, techniques, insights
   - Time: 5 minutes
   - This feeds the Blog Writer agent

2. **Ensure finance folder is up to date** (if new invoices/expenses)
   - Location: `/Volumes/T7/NUDIMMUD/04_FINANCE/2026/`
   - Include: invoices in `invoices/`, expenses in `expenses/`
   - Format: `INV-[YYYY]-###_Client.pdf` or `EXP-[YYYY-MM-DD]_Vendor.pdf`
   - This feeds the Finance Digest agent

3. **Review blog posts** (optional)
   - If you published content yesterday, recent posts feed the Carousel Maker

That's it. Go to sleep. The swarm works while you sleep.

### When You Wake (Morning)

1. **Check morning briefing** (10 minutes)
   - Location: `/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/reports/[today]-morning-brief.md`
   - Review: What was approved? What was rejected? Any action items?

2. **Review approved blog posts** (5 minutes)
   - Location: `/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/`
   - Files with `.deployment.json` → awaiting your approval
   - Approve and publish, or reject and send feedback

3. **Post Instagram carousel** (2 minutes, optional)
   - Location: `/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/`
   - Copy 7 PNG files to Instagram app or Meta Business Suite
   - Or skip and leave for later

4. **Review Reddit drafts** (5 minutes, optional)
   - Location: `/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/ready/`
   - Read for tone, verify 90/10 rule
   - Post manually to Reddit (maintains authenticity)

5. **Act on finance digest** (5 minutes)
   - Location: `/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/`
   - Email to self or Claudio
   - Chase overdue invoices (if any marked URGENT)

**Total morning time: 30 minutes.** Then you get on with your day.

---

## Expected Nightly Output (30-Day Average)

| Content | Per Night | Per Month | Impact |
|---------|-----------|-----------|--------|
| Blog posts | 1 | 20 | 500–2000 organic visitors |
| Instagram carousels | 0.5 | 12 | 1000–5000 impressions |
| Reddit threads | 8–10 | 200+ | 100–500 upvotes |
| Finance digests | 1 | 4 | Cash flow clarity |

**Total content pieces per night:** 9–12  
**Ready for deployment:** 90%+ (target approval rate)  
**Time to generate:** ~90–120 minutes  
**Time for you to manage:** ~30 minutes (morning review)

---

## Understanding the Flow

### Generation → Validation → Deployment

```
Night 1 (22:00–01:00):
  Write debrief notes (evening)
  ↓
  Swarm generates content (Write, Carousel, Reddit, Finance)
  ↓
  GAN Loop validates each piece
  ↓
  Approved → deployed to queues
  Rejected → queued for morning review
  ↓
  Morning briefing generated

Morning (06:00–07:00):
  Wake to briefing
  Review approved content
  Publish/post/send as desired
  ↓
  Content reaches audience (blog → SEO, Instagram → followers, Reddit → community, Finance → clarity)
```

### Learning Loop

Every night:
1. Swarm generates content
2. You make corrections (if needed)
3. Hooks capture corrections
4. Dream worker analyzes patterns
5. Future swarm runs incorporate learned rules

Over 30 days:
- Rejection rate drops (agents improve)
- Approval rate rises (content gets better)
- Brand voice solidifies (corrections accumulate)
- Your manual effort decreases (swarm learns your taste)

---

## Integration with Other Systems

### Self-Evolving Hooks
- **Input:** User corrections to generated content
- **Output:** Learned rules that prepend to sessions
- **Benefit:** Swarm's generator improves from corrections

### GAN Loop
- **Input:** Approved/rejected content from swarm
- **Process:** Validation happens inside each nightly run
- **Feedback:** Rejected content includes improvement suggestions

### Trace to Skill (Optional)
- **When:** After 50+ nights of swarm runs
- **Purpose:** Extract codified skills from execution patterns
- **Output:** SKILL.md files for each task type

### Distribution Agents
- **Relationship:** Swarm orchestrates them; agents generate content
- **Autonomy:** Agents run nightly; swarm ensures quality + deployment

---

## Configuration Reference

All customizable in `config.json`:

```json
{
  "schedule": {
    "start": "22:00",        // When swarm starts
    "end": "06:00",          // When swarm stops
    "days": "daily"          // Run every night
  },
  "phases": {
    "generation": {
      "timeout_minutes": 60  // Max time for agents
    },
    "validation": {
      "approval_threshold": 7.0,   // Min score to approve
      "max_iterations": 3          // Max retry attempts
    },
    "deployment": {
      "auto_publish_blog": false,  // Manual approval needed
      "queue_instagram": true,     // Auto-queue carousels
      "queue_reddit": true,        // Auto-queue drafts
      "send_finance_digest": true  // Auto-ready for email
    }
  },
  "thresholds": {
    "blog_post_score_min": 7.0,
    "carousel_design_score_min": 7.0,
    "reddit_authenticity_score_min": 7.5,
    "finance_accuracy_score_min": 8.5
  }
}
```

Adjust thresholds based on quality standards:
- **Lower threshold (6.0)** → More content approved, less manual review
- **Higher threshold (8.0)** → Stricter quality gate, more rejections for review

---

## Monitoring & Troubleshooting

### Check Swarm Status

```bash
# View today's morning briefing
cat /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/reports/$(date +%Y-%m-%d)-morning-brief.md

# View generation outputs
ls -lah /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/$(date +%Y-%m-%d)/

# View validation results
cat /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/validated/$(date +%Y-%m-%d)/results.json

# View rejected content (needs review)
ls -lah /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/rejected/$(date +%Y-%m-%d)/

# View last run log
tail -50 /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/logs/$(date +%Y-%m-%d)-run.log
```

### Common Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **No content generated** | Agent failed or timeout | Check logs. Ensure debrief notes exist. Verify agent configs. |
| **Everything rejected** | Validation thresholds too high | Lower approval_threshold in config.json (e.g., 6.5 instead of 7.0) |
| **Blog posts not publishing** | Manual approval not happening | Review `/blog/posts/` folder for queued items. Publish manually. |
| **Reddit drafts too salesy** | 90/10 rule violation | Check agent protocol. Review feedback in morning briefing. |
| **Finance digest wrong numbers** | Invoices/expenses misfiled | Verify naming convention: INV-[YYYY]-###_Client.pdf |

### Metrics to Track

Monitor over 30 days:

```
Weekly metrics:
- Approval rate (target: 90%+)
- Avg validation score (target: 7.5+)
- Blog posts published (target: 4–5/week)
- Carousels posted (target: 3/week)
- Reddit threads posted (target: 40–50/week)
- Finance digests sent (target: 1/week)
```

If approval rate is low, thresholds may be too strict. If content quality is low, rubrics may need revision.

---

## Success Checklist (First Month)

**Week 1:**
- [ ] Activate swarm via cron
- [ ] Write debrief notes for first shoot
- [ ] Confirm morning briefing is generated
- [ ] Review and publish first blog post

**Week 2:**
- [ ] Publish 3–4 blog posts from swarm
- [ ] Post 3 Instagram carousels
- [ ] Post 30–40 Reddit replies
- [ ] Review finance digest action items

**Week 3:**
- [ ] Monitor approval rates (target 85%+)
- [ ] Adjust thresholds if rejections too high
- [ ] Note any patterns in corrections
- [ ] Begin seeing organic traffic to blog

**Week 4:**
- [ ] 20 blog posts published (5/week)
- [ ] 12 carousels posted (3/week)
- [ ] 200+ Reddit replies posted (50+/week)
- [ ] 4 finance digests sent
- [ ] First hook learning rules observed

---

## Long-Term Vision

**Month 1:** Swarm running nightly, producing content autonomously  
**Month 2–3:** Brand voice solidifies, organic traffic grows, Reddit reputation builds  
**Month 4+:** Nexus Link recognized as knowledgeable, helpful production company  
**Month 6+:** Autonomous content system reduces manual marketing effort by 80%

**Why it works:**
- You focus on production (shooting)
- Swarm handles brand building (content)
- Self-evolving hooks ensure quality improves nightly
- Learning loop makes future content better than past content

---

## Next Steps

1. **Verify orchestrator.js is executable:**
   ```bash
   chmod +x /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/orchestrator.js
   ```

2. **Test manually (dry run):**
   ```bash
   node /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/orchestrator.js
   ```

3. **Check morning briefing was created:**
   ```bash
   cat /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/reports/[today]-morning-brief.md
   ```

4. **If successful, activate cron:**
   ```bash
   crontab -e
   # Add: 0 22 * * * /usr/bin/node /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/orchestrator.js >> /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/logs/cron.log 2>&1
   ```

5. **Monitor first week, then adjust config.json based on results:**
   - Approval rate too low? Lower thresholds.
   - Content quality poor? Review rubrics or agent protocols.
   - Approval rate too high? Raise thresholds.

---

## Files Reference

- **config.json** — All configuration (schedules, thresholds, paths)
- **orchestrator.js** — Main script; runs the five phases
- **SWARM-ORCHESTRATOR.md** — Detailed phase instructions
- **SWARM-DEPLOYMENT.md** — Deployment protocol for each content type
- **README.md** — This documentation

---

## That's It

The swarm runs nightly. You write debrief notes. The swarm builds your brand automatically.

**Focus on production. Let the swarm handle marketing.**

Start tonight. Monitor for a week. Adjust as needed.

Your brand grows while you sleep.
