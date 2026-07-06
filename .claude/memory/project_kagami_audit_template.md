---
name: Kagami sprint audit → reusable presentation template
description: The HTML audit at _SYSTEM/reports/kagami-sprint-audit-2026-05-19.html is being designed as a REUSABLE TEMPLATE for future Yuri sprint audits and Marcel's presentations
type: project
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
The kagami-sprint-audit-2026-05-19.html is not a one-off — Marcel explicitly stated it becomes a **template** once finalized.

**Why:** Marcel wants every future Yuri sprint to produce an equivalent visual audit. The HTML's depth/luxury/density patterns become the design system baseline.

**How to apply:**
- Treat every design decision as a reusable token (CSS variables, component classes)
- Section structure must be parameterizable (h2 → hook → multi-block sidekick)
- Charts (Sankey, sparkline, cosine grid, lane health, mem-tiers, self-improvement loop) must be replaceable with new data without restructuring
- "How Yuri Functions" mega-section is a fixed slot — content updates per sprint, layout stays
- After the current polish lands, factor recurring patterns into `_SYSTEM/reports/templates/` as reusable HTML fragments

Marcel's design priorities (locked):
1. TRUE scroll animations — pin section, content unfolds while scroll is locked, then scroll resumes
2. Variety in H1/H2/H3 hierarchy — dramatic scale, not uniform
3. Density > whitespace — pack each section
4. Premium/luxurious feel, not corporate, not generic SaaS
5. Real data over decorative text
