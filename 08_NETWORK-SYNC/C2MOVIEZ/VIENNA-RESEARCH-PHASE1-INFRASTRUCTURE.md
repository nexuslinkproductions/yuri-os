# VIENNA B2B LEAD RESEARCH — Phase 1 Infrastructure

**Created:** 2026-04-16  
**Scope:** Design research infrastructure for 50-80 Vienna companies → 40 premium targets  
**Output for Phase 2:** Sonnet bulk research and Haiku screening  
**Timeline:** 2.5-3 weeks to delivery

---

## EXECUTIVE BRIEF

**Goal:** Identify €200k-€5M revenue Vienna companies with multi-service needs (video/content, website, IT/security, ad management).

**Why Vienna?** Primary market for exeoflow (IT/AI services) + c2moviez (creative production). Austrian EPU legal structure. Dense B2B services ecosystem.

**Yield target:** 50-80 candidates Phase 1 → 40 premium after screening.

---

## PART 1: SOURCE LIST — WHERE TO FIND 50-80 VIENNA COMPANIES

### 1.1 LINKEDIN (PAID TIER REQUIRED)

**Tool:** LinkedIn Sales Navigator (budget: ~€50/month)  
**Time per source:** 4-6 hours bulk export, then 30 min/week monitoring

**Search String 1: Company Size + Location + Industry Mix**
```
Industry: Advertising, Marketing, Software, Hospitality, Ecommerce, Manufacturing, 
          Professional Services, Logistics, Design, IT Services
Company size: 11-500 employees (proxy for €200k-€5M revenue band)
HQ location: Vienna, Austria
Founded: 2010 or later (rules out most legacy slow-movers)
```

**Expected yield:** 200-250 companies  
**Screening step required:** YES (size overshoot upward)

**Search String 2: Decision-Maker Targeting**
```
Title: Founder | CEO | CMO | Marketing Director | VP Marketing | Digital Director
Located in: Vienna
Industry: Advertising, Software, E-commerce, Manufacturing, Services, SaaS
Company size: 11-500 employees
```

**Expected yield:** 80-120 decision-makers (cross-reference with company list)

**Export method:** LinkedIn Sales Navigator → Lists → Export CSV  
**Data captured:** Company name, URL, employee count, industry, founder/CEO name + title + email (if available)

**Quality notes:**
- LinkedIn size estimates trend 20-30% high; apply correction factor
- Email extraction often fails; use secondary enrichment (see Section 1.4)
- Cost: ~€50/month for Sales Navigator; do 1-month subscription, bulk export, cancel

---

### 1.2 AUSTRIAN COMPANY REGISTRY (FIRMENREGISTER.AT)

**Tool:** Public registry, no cost  
**Time per source:** 6-8 hours initial load, 30 min/week updates

**Search Criteria:**
```
Location: Vienna (Bundesland: Wien)
Revenue proxy: "Umsatz" €200k-€5M (some fields available)
Business type: Exclude NGOs, government, associations (filter by Rechtsform)
Status: Active (Aktiv status only)
Industries: Search each keyword below
```

**Industry Keyword Searches:**
1. "Werbeagentur" (advertising agency)
2. "Webdesign" OR "Webentwicklung" (web design/development)
3. "Videoproduktion" OR "Videografie" (video production)
4. "IT-Service" OR "IT-Sicherheit" (IT services, security)
5. "E-Commerce" OR "Online-Shop"
6. "Grafikdesign" OR "Motion Graphics"
7. "SEO" OR "SEM" OR "Digital Marketing"
8. "Softwareentwicklung"
9. "Consulting" (general catch-all)
10. "Manufaktur" OR "Verlag" OR "Druck" (manufacturing, publishing, printing)

**Export method:** Manual CSV export from Firmenregister (Abfrage → Ergebnisse exportieren)  
**Data captured:** Company name, address (Vienna district), founding year, revenue (if disclosed), business description, managing director/contact

**Quality notes:**
- Firmenregister is the **canonical source** for Austrian company data
- Revenue field ("Umsatz") is often missing or 1-2 years old; use as secondary signal only
- Rechtsform filters: Include GmbH, AG, LLC; exclude "Verein", "Stiftung", "Genossenschaft", government entities
- Cost: Free

---

### 1.3 CRUNCHBASE (OPTIONAL, PAID TIER)

**Tool:** Crunchbase Pro (budget: ~€150/month)  
**Time per source:** 2-3 hours setup + 1 hour bulk export  
**Use case:** Identify startup-stage SaaS + tech companies (ages 2-8 years)

**Search Criteria:**
```
Country: Austria
Region: Vienna
Funding stage: Seed to Series A (rules out pre-revenue startups)
Industries: Software, AdTech, MarTech, Analytics, SaaS
Revenue estimate: $250k-$5M USD equivalent (~€230k-€4.6M)
Founded: 2017 or later
```

**Export method:** Crunchbase → Advanced Search → Export list  
**Data captured:** Company name, URL, team size, funding raised, investor list, founding date, description

**Expected yield:** 30-50 companies  
**Quality notes:**
- Heavy overlap with LinkedIn results
- Useful for identifying **VC-backed or angel-funded** companies (signal: has external capital)
- Cost: Optional; skip if budget tight (LinkedIn + Firmenregister covers 80% of target)

---

### 1.4 GOOGLE MAPS + GOOGLE BUSINESS SEARCH (FREE)

**Tool:** Google Maps, Google Business API via Apify  
**Time per source:** 4-5 hours initial, ongoing scrape

**Search Terms (by location):**
```
Advertising agency, Vienna
Web design, Vienna
Video production, Vienna
Digital marketing, Vienna
IT consulting, Vienna
Web development, Vienna
E-commerce specialist, Vienna
SEO agency, Vienna
Graphic design, Vienna
Social media management, Vienna
```

**Method A (Manual):** Google Maps search → scrape business name, URL, phone, reviews/rating (proxy for maturity)  
**Method B (Automated):** Apify Google Maps scraper (€5-20 per run)

**Expected yield:** 100-150 businesses (many are solopreneurs; filter out later)  
**Data captured:** Business name, address, phone, website, review count, average rating, category tags

**Quality notes:**
- Heavy on solo practitioners and freelancers
- Use review count (20+) and rating (4.0+) as maturity filters
- Website presence is **hard requirement** for Phase 2 research
- Cost: Free (manual), €5-20/run (Apify automated)

---

### 1.5 AUSTRIAN INDUSTRY DIRECTORIES & MEMBERSHIPS (SUPPLEMENTARY)

**Tool:** Industry-specific databases  
**Time per source:** 2-3 hours per directory  
**Cost:** Free; some require light registration

**Directories to scan:**

1. **Wirtschaftskammer Österreich (WKÖ)**
   - URL: wko.at → Firmenfinder
   - Filter: Vienna, industries (Sparte)
   - Expected yield: 150-200 (duplicate with Firmenregister)

2. **Austrian Advertising Association (ÖWV)**
   - URL: oewv.at → Mitglieder (members directory)
   - Expected yield: 40-60 vetted agencies

3. **GIPSA (Austrian Software & IT Services Association)**
   - URL: gipsa.at → Members
   - Expected yield: 60-100 IT/software firms

4. **Austrian E-Commerce Association**
   - URL: ecommerce.or.at → Members
   - Expected yield: 30-50

5. **Google Maps Local Guides + Reviews**
   - Cross-reference highly-rated video/design/marketing vendors
   - Expected yield: 20-30 (after dedup)

**Method:** Scrape member directories; cross-reference with LinkedIn/Firmenregister  
**Data captured:** Company name, category, URL, contact info if public

**Quality notes:**
- High overlap with other sources
- Useful for **verification** (is company active in professional org?) and finding contact emails
- Cost: Free

---

## PART 2: SCREENING FORMULA — DISQUALIFY / GREEN-FLAG CRITERIA

### 2.1 HARD DISQUALIFIERS (FILTER OUT IMMEDIATELY)

Apply these filters after initial data collection. **If ANY of these apply, mark DISQUALIFY.**

| Criterion | Rule | Why |
|-----------|------|-----|
| **Revenue range** | <€150k OR >€50M | Below viable service project budget; above local market fit |
| **No website** | No verifiable website URL | Can't verify legitimacy; can't prospect decision-makers |
| **Government entity** | Any public sector, state-owned, NGO status | Won't use freelance creative + IT services; procurement cycles 6-18mo |
| **Fortune 500 subsidiary** | Parent company >€500M | Centralized procurement; no local budget authority |
| **Non-active status** | Dissolved, bankruptcy, liquidation status | Can't engage if company is legally dissolved |
| **Headquarters outside Vienna** | Remote HQ, different city as primary | Reduces likelihood of Vienna-local spending decisions |
| **Industry: Education (public)** | Public university, public school | Slow procurement; different budget model |
| **Industry: Healthcare (public)** | Public hospital, state health entity | Government contract/procurement rules; slower velocity |
| **Single-person freelancer** | 0-1 employees, no team | Not addressable for bundled (video + web + IT + ads) services |
| **Web presence quality** | Website older than 2015 OR inactive social media | Signal: company may be dormant or legacy |

**Screening time:** ~3 min per company (automated filters + manual spot-check)

---

### 2.2 GREEN FLAGS (PRIORITIZE THESE)

**Companies matching 3+ of these signals = PRIORITY tier in Phase 2 dashboard**

| Signal | Why | Weight |
|--------|-----|--------|
| **€200k-€2M revenue** | Sweet spot for 3+ service adoption; mature enough for bundled spend | HIGH |
| **E-commerce business** | Needs video (product demos, brand videos), web (often rebuilding), ads (growth), IT (security) | HIGH |
| **Digital agency / Marketing agency** | Core need: video content, web properties, IT infrastructure | HIGH |
| **SaaS or software company** | Needs content marketing, landing pages, IT security, ad spend | HIGH |
| **Hospitality (hotels, restaurants, tourism)** | High need: visual content, booking site, Google My Business + ads, IT (POS security) | HIGH |
| **Manufacturing/B2B Services** | Lower SME penetration; high ARPU; often underserved by agencies | HIGH |
| **Founder/CEO visible on LinkedIn** | Easier to reach; founder-led = faster decision velocity | MEDIUM |
| **Recent website redesign (2023+)** | Signal: thinks about digital; willing to invest | MEDIUM |
| **Active social media** | Instagram, LinkedIn, TikTok posts in last 3 months = engaged audience | MEDIUM |
| **Team size 10-100** | Management layer exists; structured budgeting | MEDIUM |
| **VC-backed or investor funding** | Growth capital available; likely marketing budget | MEDIUM |
| **Multi-location (Vienna + elsewhere)** | Regional player; higher revenue potential | MEDIUM |
| **Recent company founding (2017-2023)** | Growth phase; budget prioritizes scaling | MEDIUM |
| **Industry: Professional Services** | High digital transformation need; consultants need content/visibility | MEDIUM |

---

### 2.3 YELLOW FLAGS (INVESTIGATE, DON'T AUTO-EXCLUDE)

| Flag | Context | Action |
|------|---------|--------|
| **Revenue <€200k but growing** | Early-stage, but signal of founders willing to invest | Check growth rate; research founder commitment |
| **No obvious website** | Uses Instagram/Facebook only; pre-web services | Check social media quality; if strong, may still qualify |
| **Founder/team not visible online** | Privacy-conscious or older generation | Try secondary research (news, awards, industry memberships) |
| **Website in German only** | Local-only focus; may restrict growth appetite | Check if they export or have multi-language version planned |
| **Industry: Luxury goods/fashion** | High visual content needs; margin-rich | Research typical spend; may be high-tier prospect |
| **Established (founded 2000-2010)** | Slower-moving, but may have accumulated budget | Check if they've recently done any digital work |

---

## PART 3: DATA CAPTURE TEMPLATE

**Minimal fields required for Phase 2 screening and research:**

### Core Fields (Required for all 80 candidates)

```
# Company Identification
- Company Name (exact legal name)
- Registration Number (Firmenbuchnummer, if available from Firmenregister)
- Website URL (primary domain)
- Location (Vienna district: 01, 02, ... 23)

# Revenue & Size Signals
- Estimated Annual Revenue (€, derived from: employee count, industry data, disclosure)
- Revenue Source (Firmenregister | LinkedIn size proxy | Google Maps | estimate)
- Confidence Level (High = disclosed; Medium = derived; Low = estimated)
- Employee Count (if available; use as secondary revenue signal)

# Industry & Business Model
- Primary Industry (tag: e-commerce, agency, SaaS, manufacturing, hospitality, etc.)
- Secondary Industries (if multi-service)
- Business Description (1-2 sentences; what they sell/do)
- Target Market (B2B, B2C, B2B2C, mixed)

# Digital Presence & Quality Signals
- Website Quality Score (1-5: 1=basic/no site, 5=modern/well-designed)
  - Scoring: 1=None/text-only; 2=Basic HTML; 3=CMS/basic design; 4=Modern/professional; 5=Enterprise/sophisticated
- Social Media Presence (Yes/No; platforms: LinkedIn, Instagram, Facebook, TikTok, Twitter)
- Last Activity (date of most recent social post; "active" = <30 days)
- Google Reviews Count (if available; proxy for maturity: 20+ = stable, 5-19 = emerging)

# Decision-Maker Contact Information
- Primary Contact Name (CEO, Founder, or CMO)
- Contact Title (CEO, Founder, CMO, Marketing Director, etc.)
- Contact Email (if available; source: LinkedIn, website, directory)
- Contact Phone (if available)
- Contact LinkedIn Profile URL
- Decision-Maker Seniority (Founder/Owner, C-suite, Manager, Other)

# Service Needs Assessment (Preliminary)
- Likely Need: Video/Content Production (Yes/No/Maybe; confidence)
- Likely Need: Website/Digital (Yes/No/Maybe; confidence)
- Likely Need: IT/Security Services (Yes/No/Maybe; confidence)
- Likely Need: Paid Advertising Management (Yes/No/Maybe; confidence)
- Multi-Service Potential (High = 3+ needs; Medium = 2 needs; Low = 1 need)

# Research & Status
- Data Collection Date (YYYY-MM-DD)
- Primary Source (LinkedIn, Firmenregister, Google Maps, Crunchbase, Directory)
- Research Notes (open text: red flags, quick impressions, context)
- Screening Status (GREEN = priority, YELLOW = investigate, RED = disqualify)
- Phase 2 Tier (PRIORITY, SECONDARY, TERTIARY, or EXCLUDE)
```

### Template CSV Structure

```
Company Name,Reg Number,Website,Location District,Est Revenue (EUR),Revenue Source,Employee Count,Primary Industry,Secondary Industry,Business Description,Web Quality (1-5),Social Active,Last Social Post,Decision Maker,Title,Email,LinkedIn URL,Video Need,Website Need,IT Need,Ads Need,Multi-Service Potential,Screening Status,Phase 2 Tier,Notes,Data Collection Date
```

---

## PART 4: YIELD ESTIMATE — REALISTIC PIPELINE

### Source-by-Source Yield (Assuming 4-week research sprint)

| Source | Time Investment | Raw Yield | After Dedup | Quality Loss (Low-quality/freelance) | Net Usable | Confidence |
|--------|-----------------|-----------|-------------|--------------------------------------|------------|------------|
| LinkedIn Sales Nav | 6 hours | 200-250 | 150-180 | 30% (size overshoot) | **105-126** | HIGH |
| Firmenregister.at | 8 hours | 180-220 | 160-200 | 15% (more accurate) | **136-170** | VERY HIGH |
| Google Maps + Apify | 6 hours | 100-150 | 80-120 | 40% (many solopreneurs) | **48-72** | MEDIUM |
| Crunchbase (optional) | 3 hours | 30-50 | 25-45 | 5% (pre-screened by platform) | **24-43** | MEDIUM |
| Industry Directories | 4 hours | 120-180 | 100-150 | 10% (vetted orgs) | **90-135** | MEDIUM |
| **Total Unique Companies** | **~27 hours** | **~660-850** | **~515-695** | **~30% avg loss** | **~360-487** | - |

**Expected Phase 1 Output: 50-80 companies** (after applying hard disqualifiers + web presence check)

**Then: Phase 2 Sonnet Research** feeds these 50-80 into bulk analysis → detailed screening → final 40 priority targets

---

### Deduplication Strategy

Same company will appear in multiple sources. **Dedup by:**

1. **Exact match:** Company name + website domain (primary)
2. **Fuzzy match:** Name similarity + address + industry (secondary)
3. **Registration number:** Austrian Firmenregister number (if available, 100% match)

**Tool:** Python script (pandas, fuzzy matching) or manual spreadsheet with VLOOKUP/dedup functions

**Time:** ~3-4 hours for 500 raw records

---

## PART 5: TOOLS & METHODS — EXECUTION LAYER

### 5.1 FREE VS. PAID BREAKDOWN

| Tool | Cost | Time | Output | Recommendation |
|------|------|------|--------|-----------------|
| **LinkedIn Sales Navigator** | €50/month | 6 hours bulk + 30 min/week | 100-120 decision-makers + 150-180 companies | RECOMMENDED; do 1-month subscription |
| **Firmenregister.at** | Free | 8 hours (multiple keyword searches) | 160-200 companies + legal data | ESSENTIAL; canonical source |
| **Google Maps + Apify scraper** | Free (manual) or €5-20/run (automated) | 4-5 hours | 80-150 businesses | OPTIONAL; manual is free but slower |
| **Crunchbase Pro** | €150/month | 3 hours + 1 hour export | 25-45 startups | OPTIONAL; nice-to-have, skip if budget tight |
| **Industry directories (WKÖ, ÖWV, GIPSA, etc.)** | Free | 3-4 hours per directory | 30-100 per directory | RECOMMENDED; free + verification signal |
| **Dedup + screening tool** | Free (Python) or €15-50 (Airtable/Zapier) | 4-5 hours | Clean 50-80 candidate list | ESSENTIAL |

**Total budget:** €50-220 (LinkedIn mandatory + optional Crunchbase)  
**Total time:** 27-35 hours

---

### 5.2 MANUAL SCRAPING VS. AUTOMATION

**When to use manual:**
- Smaller datasets (<100 records)
- One-time research sprint (not recurring)
- Complex logic needed (e.g., "filter for video production + e-commerce")

**When to use automation:**
- Weekly/monthly updates needed
- Large datasets (500+ records)
- Simple, repeatable scraping (e.g., Google Maps, directory pages)

**Tools:**

1. **Apify** (€, no-code scraping)
   - Use for: Google Maps, Google Business, industry directories
   - Setup: 30 min, cost: €5-25 per run

2. **Python (pandas + requests + BeautifulSoup)**
   - Use for: Firmenregister, multi-source dedup/consolidation
   - Setup: 1-2 hours, cost: €0

3. **Airtable / Google Sheets + IMPORTXML()**
   - Use for: Light scraping, formula-based enrichment
   - Setup: 1 hour, cost: Free (Sheets) or €12+ (Airtable)

4. **Zapier / Make.com**
   - Use for: Workflow automation (e.g., LinkedIn → Airtable → Slack notification)
   - Setup: 2-3 hours, cost: €10-50/month

---

### 5.3 TIME ESTIMATE PER COMPANY — PHASE 2 RESEARCH

Once you have 50-80 candidates, **Sonnet bulk research phase:**

**Per company, Sonnet will spend ~8-12 minutes on:**
- Website analysis (2-3 min): What they claim to do, current services, recent projects
- Decision-maker research (3-4 min): LinkedIn, company news, founder research
- Need assessment (2-3 min): Likelihood of video/web/IT/ads needs based on industry + current state
- Preliminary contact enrichment (1 min): Email finder, phone lookup

**Total Phase 2 time for 80 companies:** ~10-16 hours (Sonnet working in parallel batches)

---

## PART 6: INTEGRATION WITH PHASE 2 (SONNET BULK RESEARCH)

### Input to Phase 2

Deliver to Sonnet:

1. **Company list CSV** with all fields from Part 3
2. **Research instructions** (see below)
3. **Decision-maker target list** (extracted from LinkedIn)

**Sonnet's task in Phase 2:**
- For each of the 50-80 companies:
  1. Check current website and recent activity
  2. Identify and verify primary decision-maker (CEO/CMO/Founder)
  3. Estimate likelihood of 3+ service needs (video + web + IT + ads)
  4. Flag any new red flags or green signals
  5. Estimate decision-maker reachability (LinkedIn open, email available, etc.)

**Sonnet's output:** Enriched spreadsheet with Phase 2 columns added + final PRIORITY ranking

### Final Output (After Phase 2)

**40-target dashboard** with columns:

```
Company Name, Website, Decision Maker, Email, Phone, Est Revenue, Industry,
Service Needs (3+ = priority), Reachability Score, Outreach Priority Rank (1-40),
Notes from Phase 2 Research
```

---

## PART 7: SPECIFIC AUSTRIAN CONTEXT & TIPS

### Revenue Estimation (Austrian SMEs)

For companies where revenue is not disclosed:
- **Employees 1-3:** €50k-€200k (micro)
- **Employees 4-10:** €150k-€500k (small)
- **Employees 11-30:** €400k-€2M (SME)
- **Employees 31-100:** €2M-€10M (mid-market)
- **Employees 100+:** €5M+ (corporate)

**Austrian quirk:** ÖWV (Werbeagentur membership) is reliable signal for real agencies (membership fee ~€2k/year = minimum viable business)

### Decision-Maker Names (Austrian Context)

Common CEO/founder titles in Austria:
- **Geschäftsführer** (Manager/CEO, most common)
- **Gründer** (Founder)
- **Inhaber** (Owner)
- **Direktor** (Director, more formal)
- **Leiter** (Head of; often marketing head)

**LinkedIn advantage:** Filter for "Geschäftsführer" or "Founder" to find decision-makers directly

### Payment Terms & Velocity

Austrian B2B context:
- Average decision cycle: **6-12 weeks** (longer than US)
- Typical invoice terms: **NET 30-60** (slow payment)
- Typical project budgets: **€5k-€50k** (for bundled creative + tech)
- Common blockers: Multi-level approval, compliance, budget cycles (Jan-Feb, Sep-Oct)

**Implication:** Your pipeline needs volume (40 targets) because conversion will be slower than Western European tech hubs.

---

## PART 8: QUALITY GATES & CHECKPOINTS

### Gate 1: Raw Collection (During Phase 1)

**Checkpoint:** Before Phase 2 begins, verify:
- [ ] 50-80 companies in spreadsheet
- [ ] Each has website URL verified (manual spot-check: 5-10)
- [ ] Each has at least one decision-maker identified (or "TBD - research in Phase 2")
- [ ] No duplicate rows (dedup complete)
- [ ] Revenue estimates reasonable (sanity check: <€50M, >€150k)
- [ ] All hard disqualifiers applied (no government, no Fortune 500 subsidiaries)

**Estimated time:** 2-3 hours (final QA)

### Gate 2: After Phase 2 Sonnet Research

**Checkpoint:** Verify Sonnet output:
- [ ] All 50-80 companies have Phase 2 research notes
- [ ] Decision-maker email + LinkedIn updated (where available)
- [ ] Service need likelihood scored (1-5 scale for each: video, web, IT, ads)
- [ ] Reachability flagged (easy, medium, hard, unknown)
- [ ] Top 40 ranked and justified

**Estimated time:** 1-2 hours (Haiku review + consolidation)

---

## PART 9: EDGE CASES & HANDLING

### What to do with:

| Scenario | Action |
|----------|--------|
| **Company found in multiple sources with conflicting info** | Keep Firmenregister data as canonical; use others for cross-validation |
| **No website, only Instagram/Etsy** | Manual research required; if strong social signal + right industry, keep as YELLOW |
| **Website is placeholder or outdated (last update 2015)** | YELLOW flag; research if still active via news, social, Firmenregister status |
| **Decision-maker contact not findable** | Mark "TBD"; note in Phase 2 for secondary research (news, industry events) |
| **Company in border region (Gänsermarkt, Groß-Enzersdorf) but serves Vienna** | Technically outside Vienna but focus area; mark with note |
| **Nonprofit with commercial arm (e.g., museum gift shop, charity media)** | Exclude nonprofit itself; research commercial arm separately |
| **Founder/CEO unreachable (no email, no LinkedIn)** | Try: company phone → general inbox, Google dorking (site:company.at email), Crunchbase |

---

## PART 10: REFERENCE DOCUMENTATION

### URLs to Bookmark

| Resource | URL | Use |
|----------|-----|-----|
| Firmenregister Austria | https://www.firmenregister.at/ | Company searches, legal data |
| WKÖ Firmenfinder | https://www.wko.at/service/Firmenfinder | Business searches by industry |
| Austrian Advertising Association | https://www.oewv.at/ueber-uns/mitglieder | Vetted agencies |
| GIPSA Members | https://www.gipsa.at/ueber-gipsa/mitglieder | IT/software firms |
| LinkedIn Sales Navigator | https://business.linkedin.com/sales/solutions/sales-navigator | Decision-maker targeting |
| Crunchbase | https://www.crunchbase.com/ | Startup/SaaS data (optional) |
| Apify Google Maps | https://apify.com/apify/google-maps-scraper | Automated local business scraping |

### Key Decision Documents for Sonnet

**In Phase 2, Sonnet will reference:**
1. This document (Part 1-5 for methodology understanding)
2. Your raw 50-80 company CSV (with all Part 3 fields)
3. Additional instructions for decision-maker research (to be created after Phase 1)

---

## FINAL CHECKLIST — PHASE 1 COMPLETION

Before moving to Phase 2 (Sonnet):

- [ ] LinkedIn Sales Navigator subscription active (1 month, €50)
- [ ] Firmenregister searches complete (8 keyword combinations + dedup)
- [ ] Google Maps scraping done (manual or Apify run)
- [ ] Industry directories reviewed (WKÖ, ÖWV, GIPSA)
- [ ] Crunchbase export complete (optional but recommended)
- [ ] All sources consolidated into single CSV
- [ ] Deduplication script run (Python or manual)
- [ ] Hard disqualifiers applied (no government, no subsidiaries, no solo freelancers)
- [ ] Web presence verification spot-check (10 random companies)
- [ ] Revenue estimates sanity-checked
- [ ] 50-80 companies in final list
- [ ] Gate 1 QA complete
- [ ] CSV exported + ready for Sonnet Phase 2

**Estimated completion:** 4-5 business days of focused work

---

## APPENDIX: SAMPLE COMPANY PROFILE (FILLED EXAMPLE)

```
Company Name: MediaTech Solutions GmbH
Reg Number: FN 482951a
Website: https://www.mediatech-solutions.at
Location District: 06 (Mariahilf)
Est Revenue (EUR): €750,000
Revenue Source: LinkedIn size proxy + industry estimate
Employee Count: 18
Primary Industry: Digital Agency
Secondary Industry: Video Production, Web Development
Business Description: Offers video production, website design, and digital marketing to luxury brands and e-commerce clients
Web Quality (1-5): 4
Social Active: Yes
Last Social Post: 2026-04-14 (Instagram)
Decision Maker: Anna Schmidt
Title: Geschäftsführerin (CEO)
Email: anna.schmidt@mediatech-solutions.at
LinkedIn URL: https://www.linkedin.com/in/anna-schmidt-vienna
Video Need: Yes (already offering, but likely need for production tooling/outsourcing)
Website Need: Yes (client sites)
IT Need: Maybe (internal security/infrastructure)
Ads Need: Yes (client paid advertising management)
Multi-Service Potential: High (3+ needs identified)
Screening Status: GREEN
Phase 2 Tier: PRIORITY
Notes: Active on social; modern website; founder visible; good candidate for bundled services (video outsourcing, IT security, ads management consolidation)
Data Collection Date: 2026-04-16
```

---

**Next step:** Execute Phase 1 using this infrastructure; deliver 50-80 company CSV to Sonnet by [Target Date]. Estimated effort: 27-35 hours over 4-5 days.
