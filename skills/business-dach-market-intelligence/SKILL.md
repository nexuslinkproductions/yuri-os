---
name: business-dach-market-intelligence
description: "Autonomous market intelligence for DACH region (DE/AT/CH). Weekly signal gathering, biweekly opportunity ranking, monthly synthesis, quarterly review. Targets video production / on-set capture opportunities aligned with c2moviez and planzerfilms networks."
triggers:
  - "DACH market"
  - "market intelligence"
  - "DACH opportunities"
  - "business intelligence"
  - "find clients"
  - "signal gathering"
  - "opportunity scan"
  - "DACH signals"
---

# DACH Market Intelligence Skill

**Purpose:** Autonomous market intelligence gathering for DACH region (Germany, Austria, Switzerland). Discover high-value opportunities aligned with existing network patterns and on-set capture skillset.

**Activation:** Scheduled agent (weekly); on-demand when new partner connection emerges.

**Version:** 1.0 | Created: 2026-04-17 | Status: DRAFT

---

## Scope

**In scope:**
- DACH region only (DE, AT, CH)
- Opportunities: video production, on-set capture, commercial content
- Mapping c2moviez (21 clients) and planzerfilms networks
- Ranking by success probability (collaboration fit, revenue tier, scope complexity)

**Out of scope:**
- Post-production/editing services
- Social media content only
- International expansion beyond DACH
- Speculative pitching without a qualified signal

**Delegation:**
- Claudio (c2moviez): client relationship, project scope, billing
- Marc (planzerfilms): scope and opportunity overlap
- MACL-ONE: define scope first, then map

---

## Prerequisites

**Context required:**
- `identity.md` — Marcel's role (on-set videographer/photographer)
- `kagami_state.md` — current constraints and priorities
- `02_AREAS/DACH-Market-Intelligence/` — operational data folder
- `06_NETWORK-SYNC/C2MOVIEZ/_MAPPING.md` — c2moviez client network
- `00_COMMAND-CENTER/MOC-Network.md` — existing partnerships

---

## Execution Phases

| Phase | Cadence | Output |
|---|---|---|
| 1 — Signal gathering | Weekly | Raw signals (10-20 items) → `signals/weekly-YYYY-MM-DD.md` |
| 2 — Analysis & ranking | Bi-weekly | Tier 1/2 opportunity list → `analysis/biweekly-YYYY-MM-DD.md` |
| 3 — Deep synthesis | Monthly | Trend + pattern report → `reports/monthly-YYYY-MM.md` |
| 4 — Executive review | Quarterly | Strategic recommendations → `reports/quarterly-YYYY-Q#.md` |

---

## Opportunity Tiers

- **Tier 1:** Immediate fit → hand to Claudio/Marc with intro request
- **Tier 2:** Exploration needed → clarify scope, request intro
- **Tier 3:** Monitor → track, may fit in 6 months
- **Tier 4:** Filter → outside scope or low probability

---

## Success Metrics Framework

See: `02_AREAS/DACH-Market-Intelligence/framework.md`

Four dimensions (scored 0–4 each → composite → tier):
1. Revenue tier fit (target: CHF 2K–8K day rate)
2. Collaboration quality (decision speed, technical literacy)
3. Project scope complexity (multi-camera, location, crew)
4. Brand alignment (premium, technical focus, repeat work likelihood)

---

## Vault Integration

- Signals: `02_AREAS/DACH-Market-Intelligence/signals/`
- Analysis: `02_AREAS/DACH-Market-Intelligence/analysis/`
- Reports: `02_AREAS/DACH-Market-Intelligence/reports/`
- Network: `00_COMMAND-CENTER/MOC-Network.md`

---

## Implementation Checklist

- [ ] Create `/02_AREAS/DACH-Market-Intelligence/` folder structure
- [ ] Write `framework.md` (success metrics, scoring rules)
- [ ] Write `data-sources.md` (signal sources, automation options)
- [ ] Create signal inbox template
- [ ] Set up scheduled agent (weekly signal gather)
- [ ] Train on signal quality (first run manual, then refine)
- [ ] Link from `MOC-Network.md` → DACH Intelligence Hub

## Session Notes

### 2026-05-15
- Promoted from a provider-specific skill surface into the root `skills/business-dach-market-intelligence/` library.
- Added SKILL.md frontmatter with triggers and routing
