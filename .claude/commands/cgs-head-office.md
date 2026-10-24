---
description: Load CGS Head Office — the sourced registry of company facts (UID, address, AGB, policies, suppliers, overhead, infrastructure), the organigram → role-lane map, and the quarterly drift check.
---

Invoke the `cgs-head-office` skill.

Answer company-fact questions with value + source path + verified date; `UNVERIFIED` when the source
is not on disk. The organigram PDF is at `02_RESOURCES/CGS-HEAD-OFFICE/`. For money → `cgs-cfo`,
for the site → `cgs-seo`, for stock/production/customers/marketing → the matching `cgs-*` lane.

$ARGUMENTS
