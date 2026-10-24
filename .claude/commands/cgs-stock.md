---
description: Load the CGS Stock & Procurement lane (Stefan) — cockpit inventory/demand/purchasing endpoints, landed-cost factors, the propose-only rules, and the weekly reorder routine.
---

Invoke the `cgs-stock` skill.

Before doing any work, also load:
- skill `cgs-cockpit` (the app — paths, run/restart gotchas, the three write doors)
- memory `rene-cgs-jeffrey-operating-profile` — confirm-gate (propose → René clicks)

Data comes from `http://127.0.0.1:8000/api/inventory/demand` & co. in René's Chrome session; the lane
never POSTs. Supplier ledgers live in the cockpit repo under `cgs-cogs/data/`.

$ARGUMENTS
