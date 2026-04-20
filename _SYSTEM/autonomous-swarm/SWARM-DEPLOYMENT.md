# Autonomous Swarm — Deployment Protocol

**Purpose:** Queue, stage, and deploy approved content to blogs, Instagram, Reddit, and email  
**Audience:** Orchestrator agent (automated)  
**Outcome:** Marcel wakes to content ready to post or already published

---

## Deployment Workflow

After GAN Loop validation approves content, deployment agent moves it from staging to production queues.

---

## Blog Posts

### Input
- Approved MDX file from Writer agent: `/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/blog-post.mdx`
- Validation score: ≥7.0/10
- Status: approved

### Deployment Steps

```
1. Copy approved post to blog queue:
   SOURCE: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/blog-post.mdx
   DEST:   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/[date]-[slug].mdx
   
2. Create deployment metadata:
   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/[date]-[slug].deployment.json
   {
     "source": "autonomous-swarm",
     "generated_date": "[date]",
     "validation_score": 8.2,
     "status": "awaiting_manual_approval",
     "deployed_at": "[timestamp]",
     "manual_approval_required": true,
     "instructions": "Review for accuracy. Publish to nexus-link.com once approved."
   }

3. Log deployment:
   /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-blog-deployed.log
```

### Manual Approval Process

Marcel receives queued post in morning. He:
1. Reads the blog post
2. Checks metadata for validation score
3. Either:
   - **Approve:** Publish to nexus-link.com
   - **Reject:** Move to `/archive/rejected/` with feedback
   - **Edit:** Make changes, re-save, publish

### Fallback

If blog post is never manually approved within 7 days:
- Archive to `/archive/pending/`
- Log as "approved but not published"

---

## Instagram Carousels

### Input
- 7 PNG files (1080x1350 each) from Carousel Maker agent
- Combined PDF for reference
- Validation score: ≥7.0/10
- Status: approved

### Deployment Steps

```
1. Create carousel ready folder:
   DEST: /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/[date]-[topic]/

2. Copy PNG slides:
   SOURCE: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/carousel/
   DEST:   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/[date]-[topic]/
   Files:
   ├── slide-1.png
   ├── slide-2.png
   ├── slide-3.png
   ├── slide-4.png
   ├── slide-5.png
   ├── slide-6.png
   ├── slide-7.png
   ├── carousel-combined.pdf
   └── deployment.json

3. Create deployment metadata:
   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/[date]-[topic]/deployment.json
   {
     "source": "autonomous-swarm",
     "generated_date": "[date]",
     "validation_score": 7.5,
     "status": "ready_to_post",
     "deployed_at": "[timestamp]",
     "manual_approval_required": false,
     "posting_instructions": [
       "1. Open Instagram app",
       "2. Create new post → Carousel",
       "3. Upload 7 PNG files in order (slide-1.png through slide-7.png)",
       "4. Review layout",
       "5. Add caption: [optional suggested caption]",
       "6. Tag @nexus.link.productions",
       "7. Publish"
     ]
   }

4. Create posting reminder:
   /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-carousel-ready.notification
   Subject: "Instagram carousel ready to post: [topic]"
   Link: /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/[date]-[topic]/

5. Log deployment:
   /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-carousel-deployed.log
```

### Posting Process (Manual)

Marcel sees reminder in morning. He can:
1. **Post immediately:** Open Instagram app, upload carousel
2. **Schedule:** Use Meta Business Suite to schedule for later
3. **Skip:** Move carousel to `/archive/skipped/` with notes

### Auto-Scheduling (Optional Future Feature)

If configured, carousel posts automatically to Instagram at scheduled time (e.g., 09:00 next morning).

---

## Reddit Drafts

### Input
- Markdown file with curated threads + drafted replies: `/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/reddit-drafts.md`
- 8–10 threads with replies
- Validation score: ≥7.5/10
- Status: approved (but requires tone verification)

### Deployment Steps

```
1. Copy to Reddit queue:
   SOURCE: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/reddit-drafts.md
   DEST:   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/ready/[date]-reddit-ready.md

2. Create deployment metadata:
   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/ready/[date]-reddit-deployment.json
   {
     "source": "autonomous-swarm",
     "generated_date": "[date]",
     "threads_curated": 9,
     "validation_score": 7.8,
     "status": "ready_for_manual_posting",
     "deployed_at": "[timestamp]",
     "manual_approval_required": true,
     "posting_instructions": [
       "1. Review each drafted reply (verify 90/10 rule maintained)",
       "2. Check tone for authenticity (not salesy)",
       "3. Post replies to corresponding Reddit threads",
       "4. Note any modifications you made to replies",
       "5. Monitor upvotes and comments for engagement"
     ],
     "checklist": [
       "All 9 replies follow 90/10 rule?",
       "No sales language?",
       "Replies are specific to each thread?",
       "Your voice sounds authentic?"
     ]
   }

3. Create posting reminder:
   Subject: "Reddit threads ready for posting: 9 replies drafted"
   Link: /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/ready/[date]-reddit-ready.md

4. Log deployment:
   /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-reddit-deployed.log
```

### Posting Process (Manual)

Marcel reviews drafted replies:
1. Scan each for tone (feels authentic?)
2. Check 90/10 rule (9 value-focused, 1 contextual mention max)
3. Post to Reddit threads manually (copy/paste to maintain control)
4. Monitor for upvotes and DMs

### Archival

After posting:
```
Move to: /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/posted/[date]-posted-results.md

Include:
- Original drafted replies
- Actual posted replies (if edited)
- Upvote counts (check after 24h)
- Notable comments or DMs
```

---

## Finance Digest

### Input
- Markdown digest from Finance Digest agent: `/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/finance-digest.md`
- Validation score: ≥8.5/10
- Status: approved (no manual review required)

### Deployment Steps

```
1. Copy to finance reports:
   SOURCE: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/generated/[date]/finance-digest.md
   DEST:   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/[date]-weekly-digest.md

2. Create email-ready version:
   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/[date]-weekly-digest.email.txt
   Format: Plain text, email headers included
   Subject: Finance Digest — Week of [X–Y], 2026
   To: Marcel (optionally: Claudio for shared visibility)

3. Create deployment metadata:
   /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/[date]-deployment.json
   {
     "source": "autonomous-swarm",
     "generated_date": "[date]",
     "validation_score": 9.0,
     "status": "ready_for_email",
     "deployed_at": "[timestamp]",
     "manual_approval_required": false,
     "delivery_instructions": [
       "1. Open /Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/[date]-weekly-digest.email.txt",
       "2. Copy content",
       "3. Paste into email to self (or share with Claudio)",
       "4. Send"
     ],
     "key_action_items": [
       "Chase overdue invoices (see URGENT section)",
       "Prepare missing invoices (see outstanding)",
       "Review upcoming payments budget impact"
     ]
   }

4. Log deployment:
   /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-finance-deployed.log

5. Create reminder:
   Subject: "Finance digest ready: review action items"
   Contains: URGENT section only (overdue invoices, missing payments)
```

### Email Process (Manual or Auto)

**Option A (Manual):** Marcel copies digest and sends to self or Claudio
**Option B (Future):** Swarm sends email directly if configured with SMTP credentials

### Action Item Tracking

After Marcel reads digest, he:
1. Marks off completed action items
2. Notes any new client payment issues
3. Archives digest with notes: `/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/[date]-acted-on.md`

---

## Rejected Content Handling

### When Content Fails Validation

```
Move to: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/rejected/[YYYY-MM-DD]/
Include:
├── original-content.[ext]
├── validation-feedback.md (what failed + why)
├── suggested-fixes.md (specific improvements)
└── deployment-metadata.json (why rejected, when, score)
```

### Marcel's Morning Review

Marcel checks `/rejected/` folder and can:
1. **Approve anyway:** Move back to deployment queue with notes
2. **Edit:** Manually fix and re-deploy
3. **Archive:** Move to `/archive/rejected/` for historical reference

### Fallback: Max Iterations

If content fails GAN Loop validation twice:
- Stop trying to auto-fix
- Queue for manual review
- Don't attempt third iteration (saves compute)

---

## Deployment Manifest

After all deployments complete, create manifest:

```
/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/deployments/[date]-manifest.json

{
  "date": "2026-04-19",
  "swarm_run_time": "22:00-01:15",
  "deployment_summary": {
    "blog_posts": {
      "deployed": 1,
      "status": "awaiting_manual_approval",
      "location": "/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/blog/posts/"
    },
    "instagram_carousels": {
      "deployed": 0.5,
      "status": "ready_to_post",
      "location": "/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/carousels/ready/"
    },
    "reddit_drafts": {
      "deployed": 9,
      "status": "ready_for_manual_posting",
      "location": "/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/social/reddit-drafts/ready/"
    },
    "finance_digest": {
      "deployed": 1,
      "status": "ready_for_email",
      "location": "/Volumes/T7/NUDIMMUD/05_NEXUS-LINK/reports/finance/"
    }
  },
  "rejected": {
    "count": 0,
    "location": "/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/rejected/[date]/"
  },
  "deployment_success_rate": 100,
  "manifest_created": "[timestamp]"
}
```

---

## Monitoring & Alerts

### Deployment Failures

If any deployment fails:
```
Action: Log to /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/errors/[date]-errors.log
Include: Error type, content piece, attempted destination, suggested fix
Notify: Send error summary to morning report
```

### Fallback Queue

Content that fails deployment goes to:
```
/Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/failover/[date]/

Morning: Marcel is alerted in briefing + can manually retry or skip
```

---

## Post-Deployment Tracking

### Monitor Published Content

After Marcel publishes:
```
Track in: /Volumes/T7/NUDIMMUD/_SYSTEM/autonomous-swarm/analytics/[date]-metrics.md

Metrics:
├─ Blog: Google Analytics hits, SEO ranking progress
├─ Instagram: Impressions, engagement rate, follows
├─ Reddit: Upvotes, comments, DMs received
└─ Finance: Invoice chase success rate
```

Update hooks with insights (what performed well?).

---

## Summary

**Deployment is the bridge between generation and publication.**

- Staging → Deployment (auto via swarm)
- Deployment queue → Manual publication (Marcel controls final step)
- Rejected content → Manual review (never forced to publish low-quality work)
- All metadata tracked for learning (what deployed well? why?)

Over time, rejection rates drop because hooks improve from nightly learning.
