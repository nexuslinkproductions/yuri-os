# NISABA — HOUSE 6: IDEA-TO-EMPIRE PIPELINE
*The Forge. Where raw concepts become running civilizations.*

---

## THE FORGE DOCTRINE

> The gap between "I have an idea" and "I have a running empire" is not skill.
> It is architecture.
> NISABA provides the architecture.

This house codifies the complete pipeline from concept through discovery, specification, build, quality assurance, deployment, sustainability, distribution, and evolution. Every stage has clear inputs, outputs, gates, and failure modes.

BTN's "Idea to SaaS in 48 Hours" is Stage 0–4. NISABA extends to Stage 7 — the full lifecycle.

---

## THE SEVEN STAGES

### STAGE 0: DISCOVERY

**Purpose:** Answer the question "Should this be built?" before writing a single line of code.

**Six research agents run in parallel:**

```
Agent: MARKET ANALYST
  Input: idea description
  Output: market-size.md
  Contains: TAM/SAM/SOM with sources, growth rate, market maturity
  Rule: every number must have a verifiable source URL
  Failure mode: inflated numbers from press releases → require primary sources

Agent: COMPETITOR HUNTER
  Input: idea description
  Output: competitors.md
  Contains: 5–15 direct competitors with pricing, features, positioning, weaknesses
  Rule: every competitor URL must be verified accessible (no dead links)
  Failure mode: missing competitors → search 3+ different query angles

Agent: PRICING ENGINEER
  Input: competitors.md
  Output: pricing-analysis.md
  Contains: pricing models across competitors, price sensitivity analysis, recommended pricing
  Rule: include at least 3 pricing models (freemium, usage, flat, tiered)
  Failure mode: copying competitor pricing → derive from value delivered instead

Agent: TOOL SCOUT
  Input: idea description + feature list
  Output: tech-stack.md
  Contains: recommended APIs, services, frameworks with cost per unit
  Rule: prefer services with free tiers for MVP
  Failure mode: over-engineering → constrain to "what ships in 48 hours"

Agent: SOCIAL PROOF FINDER
  Input: idea description
  Output: validation.md
  Contains: real businesses making money in this space, community demand signals
  Rule: revenue claims must be sourced (Indie Hackers, public filings, interviews)
  Failure mode: survivorship bias → include failures and pivots too

Agent: SEO RESEARCHER
  Input: idea description
  Output: seo-keywords.md
  Contains: 20–50 keywords with monthly search volume, difficulty, intent
  Rule: use real data from search tools, not estimates
  Failure mode: vanity keywords → focus on buyer-intent keywords (commercial/transactional)
```

**Discovery gate:** All 6 documents reviewed. If market is too small, competition too entrenched, or no clear positioning exists → STOP. Do not proceed to Stage 1. Document why.

---

### STAGE 1: SPECIFICATION

**Purpose:** Turn discovery into an actionable build plan.

```
Input: 6 discovery documents (product bible)
Output: feature specifications

Process:
1. Define MVP scope: 5–8 features maximum
   - Each feature must solve one user problem
   - Each feature must be buildable in 2–6 hours
   - If a feature can't be scoped to 6 hours → split it

2. Dependency ordering:
   Auth → before any user-specific feature
   Database schema → before any data-dependent feature
   Payments → before any billing/subscription feature
   Email → before any notification feature

3. For EACH feature, produce a spec:
   ---
   Feature: {name}
   Priority: {1–N, build order}
   User story: "As a {persona}, I want to {action} so that {benefit}"
   Acceptance criteria:
     - [ ] Criterion 1 (binary pass/fail, specific)
     - [ ] Criterion 2
   Database changes: {tables, columns, RLS policies}
   API endpoints: {method, path, request/response shape}
   UI: {page/component, key interactions, responsive behavior}
   Edge cases:
     - {edge case 1} → {expected behavior}
     - {edge case 2} → {expected behavior}
   Estimated hours: {2–6}
   Dependencies: {feature names that must be complete first}
   ---

4. MVP validation checklist:
   [ ] Total features ≤ 8
   [ ] Total estimated hours ≤ 48
   [ ] Auth is feature #1
   [ ] No circular dependencies
   [ ] Every feature has ≥ 2 acceptance criteria
   [ ] Every feature has ≥ 1 edge case documented
```

---

### STAGE 2: BUILD (7-Step Feature Pipeline)

**Purpose:** Implement each feature through a structured sequence that prevents the most common build failures.

```
For EVERY feature (in dependency order):

STEP 1: PLAN
  Read the feature spec
  Identify exact files to create or modify
  Write implementation plan to .swarm/plans/{feature-id}.md
  NO CODE YET — plan only

STEP 2: DATABASE
  Create tables with proper types and constraints
  Add Row Level Security policies (if Supabase/Postgres)
  Add indexes for expected query patterns
  Verify: migration runs without errors

STEP 3: BACKEND
  Implement API endpoints per spec
  Add input validation (zod or equivalent)
  Add error handling (typed errors, not generic catches)
  Add rate limiting where appropriate
  Verify: endpoints return expected responses for happy path + edge cases

STEP 4: FRONTEND
  Wire UI to API endpoints
  Implement routing
  Add loading states, error states, empty states
  Verify: user can complete the full flow end-to-end

STEP 5: POLISH
  Spacing, alignment, visual hierarchy
  Hover states, focus states, transitions
  Responsive behavior (mobile, tablet, desktop)
  Accessibility basics (labels, contrast, keyboard nav)
  Verify: visual review passes on 3 viewport sizes

STEP 6: TEST
  Click through every user flow manually
  Hit every API endpoint with valid + invalid inputs
  Test every edge case from the spec
  Verify: all acceptance criteria pass

STEP 7: GATE
  Run the full gate stack (House 1, 7 gates)
  Type check → Lint → Build → Test → Security → Semantic → Integration
  If ANY gate fails → fix before moving to next feature
  If gate fails 3x on same issue → escalate to human
```

**When features require coordination:**
```
Parallel build (if no shared files):
  Feature A (auth) in worktree-a
  Feature B (landing page) in worktree-b
  Merge after both pass gates

Sequential build (if shared files):
  Feature A completes all 7 steps
  Feature B starts step 1 after A merges
```

---

### STAGE 3: QUALITY ASSURANCE

**Purpose:** The build is complete. Now verify it holistically before anyone sees it.

```
3a. FULL FLOW TESTING
  Sign up → onboard → use core feature → pay → manage account → delete account
  Every transition verified
  Every error state verified (bad input, expired session, network failure)

3b. GAN LOOP REVIEW (House 4)
  Generator: the built product
  Evaluator: scores against product spec + UX rubric
  Rubric dimensions: functionality (0.30), usability (0.25), performance (0.20),
                      visual quality (0.15), accessibility (0.10)
  Threshold: 7.0

3c. SECURITY PIPELINE (House 5)
  Full Phase 1 + Phase 2 + Phase 3
  All P1/P2 findings must be remediated before Stage 4
  P3 findings documented and backlogged

3d. PERFORMANCE BASELINE
  Lighthouse score (target: 90+ on all categories)
  Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
  API response times baselined (p50, p95, p99)
```

---

### STAGE 4: DEPLOY

```
4a. PRODUCTION DEPLOYMENT
  Deploy to production environment (Vercel, Railway, Fly.io, etc.)
  Verify deployment is accessible and functional
  SSL certificate active
  Custom domain configured (if applicable)

4b. MONITORING SETUP
  Error tracking: Sentry or equivalent
  Analytics: PostHog or equivalent
  Uptime: health check endpoint + external monitoring
  Alerts: email/Slack on errors, downtime, or anomalies

4c. BACKUP PROTOCOL
  Database: daily automated backups with point-in-time recovery
  Code: git repository (already version controlled)
  Config: environment variables documented (not in code)
  Media: CDN with origin backup
```

---

### STAGE 5: SUSTAIN (14+ Maintenance Commands)

**Purpose:** Keep the system healthy after launch. Each command is a specific, scoped maintenance task.

```
SECURITY COMMANDS:
  /security   — run Phase 1 reporter scan
  /pentest    — run Phase 1 + Phase 2 (reporter + exploiter)
  /audit      — full Phase 1 + 2 + 3 (reporter + exploiter + documenter)
  /secrets    — scan for exposed secrets in code + git history

PERFORMANCE COMMANDS:
  /performance — Lighthouse audit + Core Web Vitals report
  /seo         — SEO audit (meta tags, schema, sitemap, robots)
  /monitor     — check uptime, error rates, response times for last 7 days

ENHANCEMENT COMMANDS:
  /enhance     — analyze user behavior data → suggest top 3 improvements
  /spec        — generate feature spec for a new enhancement
  /design      — generate UI mockup for a proposed change

MAINTENANCE COMMANDS:
  /dependencies — check for outdated packages, security advisories
  /cleanup      — remove dead code, unused imports, orphaned files
  /backup       — verify backup integrity, test restoration
  /emails       — review transactional email templates, test delivery

REPORTING COMMANDS:
  /status       — full system health report (uptime, errors, costs, traffic)
  /metrics      — user metrics dashboard (signups, retention, engagement)
```

---

### STAGE 6: DISTRIBUTE

**Purpose:** The product exists. Now the world must know.

This stage activates NISABA House 3 (Distribution Swarm) with project-specific configuration:

```
1. Create .nisaba/distribution/topics.md for this product
2. Configure Scout with product-relevant subreddits and keywords
3. Writer produces launch blog post (product story, not feature list)
4. Carousel creates visual launch content
5. Community engagement in relevant threads
6. Amplifier adapts across platforms
7. Measurer tracks launch metrics

Launch-specific additions:
  - Product Hunt launch prep (if applicable)
  - Press/media outreach list
  - Partnership/integration announcements
  - Customer case study pipeline (after first 10 users)
```

---

### STAGE 7: EVOLVE

**Purpose:** The product is live and distributed. Now it must improve continuously.

This stage activates NISABA House 2 (Evolution System):

```
1. Self-evolving hooks capture user interaction patterns
2. Dream worker extracts recurring user complaints → product improvements
3. GAN loop evaluates proposed improvements against product rubric
4. Distribution pipeline announces improvements
5. Canon records every evolution cycle

Specific evolution signals for products:
  - Support tickets: what keeps breaking for users?
  - Churn analysis: what were users doing right before they left?
  - Feature requests: what do 3+ users ask for independently?
  - Usage patterns: what features are unused? (candidates for removal)
  - Performance degradation: response times trending up? (scaling needed)
```

---

## MARCEL-SPECIFIC EMPIRE CONTEXTS

### Empire 1: Nexus Link Client Portal
```
Stage 0: Research the target market, client management gaps
Stage 1: Spec auth → client dashboard → project upload → review workflow → delivery → invoicing
Stage 2: Build in dependency order (auth first, invoicing last)
Stage 3: Security focus (client data is sensitive — GDPR compliance required)
Stage 4: Deploy Vercel + Supabase (EU region for GDPR)
Stage 5: Weekly /security, monthly /performance
Stage 6: Case study content from completed projects
Stage 7: Learn from client feedback patterns
```

### Empire 2: Automation Platform
```
Stage 0: Research AI automation market, identify underserved segments
Stage 1: Spec auth → workflow builder → execution engine → monitoring → billing
Stage 2: Execution engine is the core — build and harden first
Stage 3: Extra security on execution engine (runs user code)
Stage 4: Deploy with resource isolation (each user's workflows sandboxed)
Stage 5: Daily /monitor (execution platform must be reliable)
Stage 6: Technical blog content + r/SaaS community
Stage 7: Learn from workflow patterns users build
```

### Empire 3: Creative Tool (Template System)
```
Stage 0: Research the template market, pricing models
Stage 1: Spec auth → template browser → preview → purchase → download → customization
Stage 2: Template rendering engine is core
Stage 3: Payment security focus (PCI compliance considerations)
Stage 4: Deploy with CDN for template assets
Stage 5: Weekly /dependencies (template rendering libs evolve fast)
Stage 6: Instagram carousels + YouTube tutorials
Stage 7: Learn from which templates sell and which don't
```

---

## WHEN THE PIPELINE FAILS

```
Idea too broad:
  Signal: Stage 1 produces > 8 features that all seem essential
  Response: Split into two products. Build the simpler one first.

Market too small:
  Signal: Stage 0 market analyst finds TAM < $10M
  Response: Pivot or abandon. Small market + bootstrapper = slow death.

Competition too strong:
  Signal: Stage 0 competitor hunter finds 5+ funded, mature competitors
  Response: Find the niche they all ignore. Or abandon.

Build too complex:
  Signal: Stage 2 estimates > 48 hours for MVP
  Response: Cut features until it fits. If nothing can be cut, the idea is too complex for this pipeline.

Launch too quiet:
  Signal: Stage 6 Measurer shows < 100 visitors in first week
  Response: Distribution pipeline needs different channels or messaging. Iterate.
```

---

**Status**: ACTIVE
**House**: 06 — Swarm / Idea-to-Empire
**Last updated**: 2026-04-19
