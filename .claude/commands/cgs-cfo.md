---
description: Load the CGS CFO lane — Swiss MWST 2027 pack (primary sources), real figures, Effektiv-vs-Saldo calc, readiness checklist, and the cite-or-flag / never-file operating rules.
---

Invoke the `cgs-cfo` skill.

Before doing any work, also load:
- skill `cgs-books` (the ledger app — data access, VAT gate, deploy rules)
- memory `rene-cgs-jeffrey-operating-profile` — confirm-gate + Rule B privacy

Working docs live in `02_RESOURCES/CGS-TAX/`. Rerun the method calc with
`node 02_RESOURCES/CGS-TAX/mwst-method-calc.mjs --sss <rate>` whenever an input changes.

$ARGUMENTS
