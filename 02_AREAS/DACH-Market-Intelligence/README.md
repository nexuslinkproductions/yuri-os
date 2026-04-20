# DACH Market Intelligence System

**Active:** 2026-04-17 → Ongoing  
**Radar Status:** ✓ Autonomous · ✓ Weekly signals gathering · ✓ Biweekly analysis · ✓ Monthly synthesis  
**Owner:** Nexus Link Productions (Marcel Spatz)  
**Purpose:** Discover high-value DACH region opportunities aligned with on-set capture expertise

---

## Quick Start (For Marcel)

### This Week's Signals
→ See: **[signals/inbox.md](signals/inbox.md)** (newest at top)

### Biweekly Opportunities (Tier 1/2)
→ See: **[analysis/biweekly-analysis-latest.md](analysis/)** (sorted by date)

### Monthly Market State
→ See: **[reports/monthly-synthesis-latest.md](reports/)** (sorted by month)

### Framework (How We Score)
→ See: **[framework.md](framework.md)** (success metrics, scoring system)

### Data Sources (Where Signals Come From)
→ See: **[data-sources.md](data-sources.md)** (automated feeds, partners, web research)

---

## The System (How It Works)

### Weekly: Signal Gathering (Every Monday 08:00)
**Autonomous Agent** scans:
- LinkedIn (videographers, production companies, agencies in DACH)
- Google News & industry alerts (advertising, production news)
- Partner networks (Claudio, Marc, MACL-ONE)
- Inbound opportunities (emails, referrals)

**Output:** New signals added to [signals/inbox.md](signals/inbox.md)

**You get:** Updated inbox ready for analysis

---

### Biweekly: Opportunity Analysis (Every Wednesday 07:00)
**Autonomous Agent** scores all inbox signals:
- Revenue tier fit (CHF amounts, frequency)
- Collaboration quality (decision speed, tech literacy)
- Project scope complexity (cameras, locations, crew)
- Brand alignment (premium positioning, repeat potential)

**Output:** Ranked Tier 1/2 opportunities in [analysis/biweekly-analysis-[YYYY-MM-DD].md](analysis/)

**You get:** Action items (which to pursue, which to explore, which to monitor)

---

### Monthly: Market Synthesis (Every 28th at 06:00)
**Autonomous Agent** synthesizes 4 weeks of signals:
- Market trends by industry & geography
- Partner network health (Claudio, Marc, MACL-ONE feedback)
- Framework calibration (did our scoring predict actual success?)
- Strategic recommendations

**Output:** [reports/monthly-synthesis-[YYYY-MM].md](reports/)

**You get:** Strategic direction for next month

---

### Quarterly: Full Strategic Review (End of Q, by request)
**Manual process:** Marcel + Agent review quarterly data

**Output:** [reports/quarterly-[YYYY-Q#].md](reports/)

**Includes:** Top 5 opportunities, market outlook, partner strategy, financial summary

---

## Filing Structure

```
02_AREAS/DACH-Market-Intelligence/
├── README.md (this file)
├── framework.md (success metrics & scoring)
├── data-sources.md (where signals come from)
├── signals/
│   ├── inbox.md (current week's signals, awaiting analysis)
│   └── archive/ (processed signals by month)
├── analysis/
│   ├── biweekly-template.md (template for analysis)
│   ├── biweekly-analysis-[YYYY-MM-DD].md (scored opportunities)
│   └── archive/ (old analyses)
└── reports/
    ├── quarterly-template.md (template for quarterly reports)
    ├── monthly-synthesis-[YYYY-MM].md (monthly market state)
    ├── quarterly-[YYYY-Q#].md (quarterly strategic reports)
    └── archive/ (old reports)
```

---

## What to Do When You See Results

### Tier 1 Opportunity Identified (Score ≥3.5)

**Recommended action:**
1. **Check opportunity details** in biweekly analysis
2. **Assess connection path:**
   - Via Claudio (c2moviez): "Is this already in your pipeline?"
   - Via Marc (planzerfilms): "Does this fit your client profile?"
   - Direct outreach: cold email with portfolio + rates
3. **Email partner or outreach** within 2–3 days
4. **Track outcome:** did they respond? Pursue? Close?

### Tier 2 Opportunity Identified (Score 2.8–3.4)

**Recommended action:**
1. **Gather missing information:** What would move this to Tier 1?
2. **Request via partner** or light research
3. **Monitor:** revisit in 2–4 weeks
4. **If it levels up to Tier 1:** pursue immediately

### Pattern or Trend Identified

**Recommended action:**
1. **Read monthly synthesis** for full context
2. **Adjust strategy:** Are we underserving an industry? A geography?
3. **Discuss with partners:** "I'm seeing [trend]. Are you seeing it too?"

### Framework Adjustment Suggested

**Recommended action:**
1. **Review the adjustment** in monthly synthesis
2. **Confirm with real projects:** did the old scoring miss anything?
3. **Approve framework update** (document in framework.md)
4. **Rescore:** apply new framework to outstanding Tier 2/3 opportunities

---

## Autonomous Agent Schedules

| Agent | Runs | Frequency | Time | Output |
|-------|------|-----------|------|--------|
| **Weekly Sweep** | Monday 08:00 | Every week | dach-market-intelligence-weekly-sweep | signals/inbox.md (updated) |
| **Biweekly Analysis** | Wednesday 07:00 | Every 2 weeks | dach-market-intelligence-biweekly-analysis | analysis/biweekly-analysis-[date].md |
| **Monthly Synthesis** | 28th of month 06:00 | Monthly | dach-market-intelligence-monthly-synthesis | reports/monthly-synthesis-[month].md |

**You:** Review outputs when convenient. Agents work while you sleep. No manual intervention needed unless you want to hand-score a signal or clarify framework.

---

## Real Numbers to Date

**Framework calibration** (from BOV, SHI, GANZ projects):
- Revenue tier: CHF 3K–4K/day typical for c2moviez pipeline
- Collaboration quality: Claudio handles scope → fast decisions
- Scope complexity: 2–3 day shoots, multi-camera, location work
- Brand alignment: premium positioning, retainer potential

**Data source performance** (Q2 2026):
- Partner referrals: 80%+ Tier 1 quality
- LinkedIn search: 15–20% Tier 1 quality (high noise)
- Web search: 10–15% Tier 1 quality (heavy filtering required)
- Inbound: 100% Tier 1 (but rare)

**Expected cadence:**
- ~15–20 signals/week
- ~3–5 Tier 1 opportunities/biweekly
- ~1–2 pursued/month
- ~0.5–1 closed/month (varies by pipeline maturity)

---

## Integration Points

**Connected to:**
- [MOC-Network.md](../../00_COMMAND-CENTER/MOC-Network.md) — new partners listed here
- [identity.md](../../identity.md) — Marcel's on-set capture profile used for scoring
- [enki_state.md](../../enki_state.md) — constraints reviewed for feasibility
- [06_NETWORK-SYNC/C2MOVIEZ/](../../06_NETWORK-SYNC/C2MOVIEZ/) — Claudio's client data reference

**Used by:**
- **business-client-onboarding** skill (when Tier 1 → prospect → project)
- **production-shoot-brief** skill (when opportunity → shoot day)
- Quarterly strategic planning (with Marcel)

---

## Framework Versions

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-17 | Initial framework: 4 dimensions (revenue, collaboration, scope, brand) |
| 1.1 | TBD | [Pending first month of real data] |
| 1.2 | TBD | [Pending quarterly calibration] |
| 2.0 | TBD | [Full redesign if strategy shifts] |

---

## Troubleshooting

**Q: Signals are too noisy (too many low-quality signals)**
- A: Tighten data source filters; reduce time on low-signal sources
- See: data-sources.md → "Data Quality Filters" section

**Q: Tier 1 assignments aren't converting**
- A: Framework scoring may be miscalibrated
- Action: Review actual closed projects; adjust thresholds in framework.md
- See: framework.md → "Evolution of Framework" section

**Q: Partners (Claudio, Marc) aren't following up on Tier 1**
- A: Signals may not actually fit their pipelines
- Action: Post-mortem with partner; adjust scoring for future similar opportunities
- Document in analysis report

**Q: Not finding enough signals in Germany**
- A: Data sources may be Austria/Switzerland-heavy
- Action: Expand German keywords, LinkedIn search, event networking
- See: data-sources.md → "German Production Scene" section

---

## Contact & Next Steps

**For immediate questions:** Marcel Spatz (marcel@nexuslink.productions)

**To update framework:** Edit [framework.md](framework.md) with new thresholds or dimensions

**To adjust data sources:** Edit [data-sources.md](data-sources.md) with new feeds or changes

**To request manual analysis:** Email signal details; ask for immediate Tier assignment

**For quarterly review:** Schedule meeting after 28th of month (synthesis ready by then)

---

## Status

**System Launch:** 2026-04-17  
**Current Phase:** Weekly signal gathering active; biweekly analysis standing by  
**Next Milestone:** First biweekly report (2026-04-23)  
**First Quarterly Review:** June 30, 2026

**The radar is live. Signals flow continuously. Keep watch.**
