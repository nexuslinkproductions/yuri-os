---
tags:
  - process
  - sop
  - sales
---

# Sales Process SOP

> Current: organic/referral. Goal: 1-2 new clients/month with consistent pipeline.

## Pipeline Stages (ops.c2moviez.com)

| Stage          | What happens                                            | Owner         |
| -------------- | ------------------------------------------------------- | ------------- |
| **Lead**       | First contact, referral received, initial interest      | 🔵 CTI        |
| **Pre-sales**  | Discovery meeting scheduled/completed, needs understood | 🔵 CTI        |
| **Offer Sent** | Proposal created (Offer Builder) and sent to client     | 🔵 CTI        |
| **Active**     | Contract signed, project in execution                   | 🔵 CTI + team |
| **Pre-active** | Onboarding in progress, not yet fully started           | 🔵 CTI        |

> Pipeline is tracked in **ops.c2moviez.com → Pipeline section** (Netlify Blobs storage)

---

## Step-by-Step Sales Flow

### 1. Lead In
- [ ] Referral received or natural conversation leads to interest
- [ ] Add lead to ops.c2moviez.com pipeline → Stage: **Lead**
- [ ] Log source (who referred, how they found us)

### 2. Discovery Meeting
- [ ] Schedule meeting via **Cal.com**
- [ ] Meet in person or video call
- [ ] Record meeting via **ops.c2moviez.com** (Whisper transcription)
- [ ] Understand: scope, budget, timeline, goals
- [ ] Move pipeline → Stage: **Pre-sales**
- [ ] Create meeting note in Obsidian: `05 - Meetings/`

### 3. Create Offer
- [ ] Open **Sales Offer Builder** app (`~/CI-CD/sales_offer_template/`)
- [ ] Select appropriate package from [[07 - Resources/Offering Packages|Offering Packages]]:
  - 3-month campaign (standard): ~CHF 19k
  - 3-month full-funnel (premium): ~CHF 36k
  - 6-month retainer: ~CHF 54k
  - Yearly contract: custom
  - À la carte: per service
- [ ] Configure services, pricing, timeline in the builder
- [ ] Export PDF
- [ ] Send to client
- [ ] Move pipeline → Stage: **Offer Sent**

### 4. Follow-Up
- [ ] Follow up within 3 business days if no response
- [ ] Schedule follow-up in Plane.so ticket
- [ ] Address questions, negotiate if needed
- [ ] If declined → archive lead, note reason

### 5. Close & Onboard
- [ ] Client signs → create Plane.so project
- [ ] Move pipeline → Stage: **Active** or **Pre-active**
- [ ] Create client note in `02 - Clients/` using template
- [ ] Start relevant onboarding SOP:
  - [[06 - Processes/Service Onboarding - Content Creation|Content Creation]]
  - [[06 - Processes/Service Onboarding - Social Media|Social Media]]
  - [[06 - Processes/Service Onboarding - Google Ads|Google Ads]]
  - [[06 - Processes/Service Onboarding - Web Development|Web Dev]]
- [ ] Assign team members
- [ ] Start time tracking (ExeoFlow when live)

---

## Future Sales Channels (Fanny-led)

> [!fanny] Fanny to build c2moviez marketing — budget: organic first, paid later

| Channel | Status | Responsibility |
|---------|--------|---------------|
| Instagram / Facebook | Active (own content) | 🟣 FK |
| LinkedIn | Planned (C2I-23) | 🟣 FK |
| Google Ads | Not started | 🟣 FK (with CTI strategy) |
| Meta Ads | Not started | 🟣 FK |
| Website SEO | Passive | 🔵 CTI |
| Referrals | Always active | 🔵 CTI |

**Target:** 1-2 new clients/month through combined organic + referral

---

## Owner
- [[04 - Team/CTI - Claudio Tinner|CTI]] — owns all sales relationships

## Current Pipeline (April 2026)

| Client                  | Stage       | Potential               | Next Action            |
| ----------------------- | ----------- | ----------------------- | ---------------------- |
| SLTECH (SLT)            | Offer phase | 3-month campaign (HIGH) | Send offer via Builder |
| Chicano (CHI)           | Pre-sales   | 3-month campaign        | Schedule meeting       |
| Gianluca Giardino (GLG) | Lead        | 3-month campaign        | Meetup planned         |
| PDR Tech (PDRT)         | Lead        | TBD                     | Offering phase         |
