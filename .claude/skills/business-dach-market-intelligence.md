# Skill: business-dach-market-intelligence

**Purpose:** Autonomous market intelligence gathering for DACH region (Germany, Austria, Switzerland). Discover high-value opportunities aligned with existing network patterns and on-set capture skillset. Run continuously to feed actionable signals without manual intervention.

**Activation:** Scheduled agent (weekly); on-demand when new partner connection emerges.

---

## Scope

**In scope:**
- DACH region only (DE, AT, CH)
- Opportunities involving video production, on-set capture, commercial content
- Mapping client networks of existing partners (c2moviez, planzerfilms)
- Identifying unmet opportunities within existing ecosystem
- Ranking by success probability (collaboration fit, revenue tier, project complexity)
- Continuous signal gathering (market trends, industry news, partner activity)

**Out of scope:**
- Post-production/editing services (Marcel's role is on-set capture)
- Social media content purely (focus: commercial video, photography)
- International expansion beyond DACH (scope: DACH only for now)
- Speculative pitching without signal trigger (only action on qualified leads)

**Delegation:**
- Claudio (c2moviez): client relationship, project scope, billing
- Marc (planzerfilms): unclear — skill will clarify scope and opportunity overlap
- MACL-ONE: define scope first, then map potential

---

## Prerequisites

**Context required:**
- `identity.md` — Marcel's role (on-set videographer/photographer, technical execution focus)
- `enki_state.md` — current constraints and priorities
- `02_AREAS/DACH-Market-Intelligence/` — operational folder with data sources, framework, signals inbox
- `06_NETWORK-SYNC/C2MOVIEZ/_MAPPING.md` — understand c2moviez client network structure
- `00_COMMAND-CENTER/MOC-Network.md` — existing partnerships (planzerfilms, MACL-ONE, exeoflow)

**Data required:**
- c2moviez client roster (21 clients from Claudio's vault)
- planzerfilms client network (to be mapped)
- MACL-ONE network (to be clarified)
- DACH industry signals (production companies, agencies, brands, budgets)
- Success metrics from closed projects (what worked, what revenue tier)

**Decisions required:**
- Confirm project success metrics (revenue, collaboration quality, scope fit, brand alignment)
- Define what signals trigger immediate action (vs. quarterly review)
- Set time allocation for agent (weekly 30m scan? monthly 2h deep analysis?)

---

## Execution Flow

### Phase 1: Intelligence Gathering (Weekly)

**Goal:** Collect raw signals from DACH market.

**Steps:**
1. **Web signals** (automated if possible):
   - DACH production company news (Geschäftsmeldungen, industry publications)
   - LinkedIn: production companies, agencies, brand marketing directors in DE/AT/CH
   - Job postings (videographer, content specialist, on-set coordinator)
   - Industry event calendars (DACH advertising, production conferences)

2. **Partner network mapping**:
   - c2moviez: scan Claudio's 21 clients for DACH-only subset (estimate: 12-15)
   - planzerfilms: request client list from Marc; map overlap with c2moviez
   - MACL-ONE: clarify scope (is this sports agency? brand consulting?)
   - Ask: "Who else in DACH are they working with?"

3. **Inbound signals**:
   - Referrals from Claudio, Marc, MACL-ONE contacts
   - Partnership opportunities with motion graphics (SILASWIRTH), VFX, color grading studios

4. **Archive to inbox**: `02_AREAS/DACH-Market-Intelligence/signals/weekly-[YYYY-MM-DD].md`

**Output:** Raw signals list (10-20 items/week expected)

---

### Phase 2: Analysis & Ranking (Bi-weekly)

**Goal:** Score signals against success metrics; identify high-probability opportunities.

**Steps:**
1. **Apply success metrics** (see Framework section below):
   - Revenue tier fit (target: CHF 2K-8K day rate on-set work)
   - Collaboration quality (decision speed, technical literacy, respect for craft)
   - Project scope complexity (multi-camera, location logistics, crew coordination)
   - Brand alignment (premium, technical focus; not volume/fast-turnaround)

2. **Opportunity ranking**:
   - Tier 1: Immediate fit (can hand to Claudio/Marc, high confidence)
   - Tier 2: Exploration needed (clarify scope, request intro)
   - Tier 3: Monitor (track, may fit in 6 months)
   - Tier 4: Filter (outside scope, low probability, too niche)

3. **Outbound mapping**:
   - For each Tier 1/2: identify connection path (via Claudio? Marc? cold outreach?)
   - Check: is [Client] already a c2moviez/planzerfilms customer? If yes, why not Marcel yet?
   - Document: "Why Marcel would be ideal for [Client]" (1-2 sentence rationale)

4. **Archive to analysis**: `02_AREAS/DACH-Market-Intelligence/analysis/biweekly-analysis-[YYYY-MM-DD].md`

**Output:** Ranked opportunity list with connection strategy (3-8 Tier 1/2 items/biweekly)

---

### Phase 3: Monthly Deep Synthesis (Monthly)

**Goal:** Identify patterns, trends, network gaps; generate strategic recommendations.

**Steps:**
1. **Pattern detection**:
   - Which industries appear most? (fashion, automotive, food & beverage, tech, B2B SaaS?)
   - Which DACH cities? (Zurich, Vienna, Munich, Berlin, Hamburg?)
   - Budget clustering (which revenue tiers most active?)
   - Collaboration patterns (who works with whom?)

2. **Network gap analysis**:
   - What types of clients should c2moviez/planzerfilms target but aren't?
   - Are there underserved segments where Marcel could pioneer?
   - Can we identify new partner profiles (colorist, sound designer, producer) to strengthen ecosystem?

3. **Success metric refinement**:
   - Review closed projects (BOV, SHI, GANZ): which metrics predicted success?
   - Update framework: adjust thresholds based on real outcomes

4. **Archive to reports**: `02_AREAS/DACH-Market-Intelligence/reports/monthly-synthesis-[YYYY-MM].md`

**Output:** Strategic recommendations + trend summary (narrative + data table)

---

### Phase 4: Quarterly Executive Review (Quarterly)

**Goal:** Present synthesized intelligence to Marcel for strategic decisions.

**Steps:**
1. **Compile 3-month signals** into quarterly report
2. **Summarize:** top 5 opportunities, top 3 trends, top 2 strategic recommendations
3. **Action items:** which Tier 1 opportunities to pursue? Which partners to deepen?
4. **Update framework:** refine success metrics based on 3 months of closed projects

**Output:** `/02_AREAS/DACH-Market-Intelligence/reports/quarterly-[YYYY-Q#].md`

---

## Integration Points

**Vault references:**
- Signals inbox: `02_AREAS/DACH-Market-Intelligence/signals/`
- Analysis reports: `02_AREAS/DACH-Market-Intelligence/analysis/`
- Quarterly synthesis: `02_AREAS/DACH-Market-Intelligence/reports/`
- MOC reference: `00_COMMAND-CENTER/MOC-Network.md` (update with new partners found)
- Project templates: `01_PROJECTS/_TEMPLATE/` (when new client onboards)

**Skill dependencies:**
- Before this: `identity.md`, `enki_state.md` (understand constraints)
- Alongside: `business-client-onboarding` (when Tier 1 signal becomes a project)
- After: `production-shoot-brief` (operational execution)

**Action triggers:**
- Tier 1 opportunity identified → email Claudio/Marc with intro request
- New partner connection → add to `MOC-Network.md` + create folder
- Success metric shift → update framework in `02_AREAS/DACH-Market-Intelligence/framework.md`
- Quarterly review → present to Marcel, get guidance on direction

---

## Outputs & Artifacts

**Primary deliverable:** Quarterly strategic report + continuous Tier 1/2 opportunity feed

**Secondary artifacts:**
- Weekly signals inbox (raw data, for pattern detection later)
- Biweekly ranked opportunity list (actionable, with connection strategy)
- Monthly trend synthesis (what's shifting in DACH market?)
- Success metric framework (living document, evolves with real data)

**Vault updates:**
- New partner profiles added to `MOC-Network.md`
- Closed opportunities archived (why it didn't work?)
- Connection pathways documented (how to reach [Client]?)

---

## Error Handling

| Problem | Resolution |
|---------|-----------|
| **Signal quality low** (too much noise) | Adjust data sources; add filters; reduce noise sources |
| **No Tier 1 signals for 3+ weeks** | Expand search to adjacent industries; check assumptions in metrics |
| **Partner (Claudio/Marc) doesn't follow up on Tier 1** | Ask why; may indicate signal metrics are wrong — refine |
| **Closed project fails despite Tier 1 rating** | Post-mortem; update success metrics; was it execution or prediction? |
| **DACH market shift (e.g., recession)** | Adapt budget thresholds; monitor client spend patterns; stay flexible |
| **New partner enters ecosystem** | Map their network immediately; look for overlap with c2moviez/planzerfilms |

---

## Success Metrics Framework

See: `02_AREAS/DACH-Market-Intelligence/framework.md`

Framework tracks four dimensions:

1. **Revenue tier fit** (CHF/EUR amount, day rates, project budget)
2. **Collaboration quality** (decision speed, technical literacy, respect for craft)
3. **Project scope complexity** (multi-camera, location difficulty, crew size, timeline)
4. **Brand alignment** (premium positioning, technical focus, repeat work likelihood)

Each opportunity scored 0-4 on each dimension → composite score → tier assignment.

---

## Continuous Learning

**Post-execution reflection:**
- After each Tier 1 opportunity (whether pursued or not): document outcome
- After each closed project: does it match the success metrics we predicted?
- Monthly: any pattern shifts in what makes projects work?

**Feedback loop:**
- Quarterly review with Marcel: are the metrics still correct?
- Adjust thresholds based on real outcomes
- Share learnings with partners (e.g., "we find [Client type] works best when...")

**Iteration schedule:**
- V1.0 (live 2026-04-17): weekly gathering, biweekly analysis, monthly synthesis
- V1.1 (after first month): adjust data sources based on signal quality
- V1.2 (after 3 months): refine success metrics based on closed projects
- V2.0 (after 6 months): full redesign if DACH market or priorities shift

---

## Related Skills

**Depends on (read first):**
- `identity.md` — understand Marcel's role and scope

**Required for (runs before):**
- `business-client-onboarding` — when signal becomes a prospect
- `production-shoot-brief` — when opportunity → project

**Parallel execution possible with:**
- `business-client-relationship-deepening` (with Claudio, Marc on partnership expansion)

---

## Status

**Version:** 1.0 (DRAFT)
**Date Created:** 2026-04-17
**Next Review:** 2026-05-17 (after first 4 weeks of signals)
**Active:** Yes

**Dependencies (blockers):**
- [ ] Framework.md written with success metrics
- [ ] Data sources identified + prioritized
- [ ] Scheduled agent created (weekly sweep)
- [ ] Signal inbox template created
- [ ] Biweekly analysis template created
- [ ] Marcel approves metrics framework before autonomous run

---

## Implementation Checklist

- [ ] Create `/02_AREAS/DACH-Market-Intelligence/` folder structure
- [ ] Write `framework.md` (success metrics, scoring rules)
- [ ] Write `data-sources.md` (where to gather signals, automation options)
- [ ] Create signal inbox template (`signals/inbox.md`)
- [ ] Create analysis template (`analysis/biweekly-template.md`)
- [ ] Create monthly synthesis template (`reports/monthly-template.md`)
- [ ] Create quarterly template (`reports/quarterly-template.md`)
- [ ] Set up scheduled agent (weekly signal gather)
- [ ] Train agent on signal quality (first run manual, then refine)
- [ ] Link from `MOC-Network.md` → DACH Intelligence Hub
- [ ] Add to `.claude/rules/content-workflow.md` if it affects on-set priorities
