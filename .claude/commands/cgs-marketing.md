---
description: Load the CGS Marketing lane (Max) — product/launch copy from BOM + shop option lists + sales data, Etsy/LinkedIn/Instagram surfaces, render pipelines; draft-only under the binding holster copy rules.
---

Invoke the `cgs-marketing` skill.

Before doing any work, also load:
- memory `cgs-holster-copy-rules` — BINDING copy constraints (legal + technical)
- memory `feedback-cgs-brand-name` — the brand is "CGS"
- skill `cgs-seo` when a landing page or meta is in scope

Drafts go to `02_RESOURCES/CGS-MARKETING/`. Facts come from `http://127.0.0.1:8000/api/boms`,
`/api/cam/vocab`, `/api/dashboard/by-model` in René's Chrome. Nothing is published by the lane.

$ARGUMENTS
