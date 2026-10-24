---
description: Load the CGS Customer Service lane (Leon) — order status, tracking, fitment and policy answer pack from the cockpit + AGB + discount programme; draft-only replies in René's voice; René sends.
---

Invoke the `cgs-frontdesk` skill.

Before doing any work, also load:
- memory `cgs-holster-copy-rules` — BINDING (no civilian carry, retention = screws, no cross-fit claims)
- memory `rene-cgs-jeffrey-operating-profile` — confirm-gate + Rule B (customer data stays local)
- memory `cgs-discount-programme` when a Rabatt / Händler question is in the mail

Paste the customer mail WITHOUT name/address, or give the order number + the question. Facts come from
`http://127.0.0.1:8000/api/sales`, `/api/post/labels?order_nr=`, `/api/molds/coverage` in René's Chrome.
The inbox itself is not wired — see `02_RESOURCES/cgs-projects-export/leon-mail-gap.md`.

$ARGUMENTS
