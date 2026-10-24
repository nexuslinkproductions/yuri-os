---
description: Load the CGS Production lane (Bruno) — cockpit molds/ready verdicts, WIP shells, finished stock, sheet demand, job sheets, and the propose-only weekly build-plan routine.
---

Invoke the `cgs-production` skill.

Before doing any work, also load:
- skill `cgs-cockpit` (the app — Molds/Sales/Inventory pages, CNC-share footgun, restart gotcha)
- memory `rene-cgs-jeffrey-operating-profile` — confirm-gate + the two trust-enders
- memory `cgs-cam-naming-norm` when a new mold or cut-out is in scope

Data comes from `http://127.0.0.1:8000/api/molds/ready` & co. in René's Chrome session; the lane never
POSTs. New molds route to `cgs-align` → `cgs-decimate` → `cgs-mold` → FreeCAD CAM.

$ARGUMENTS
