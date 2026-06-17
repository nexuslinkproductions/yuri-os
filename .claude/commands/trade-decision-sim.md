---
skill: trade-decision-sim
description: The DECISION LENS — recall the current signal snapshot per market and render it through the sim arsenal off one call (order-optimal sequencing + CVaR-robust sizing vs the MEASURED edge), emitting an actionable call per market. Flat when there's no measured edge. Sibling of /edge-audit.
---

Invoke the `trade-decision-sim` skill via the Skill tool.

Canonical command: /trade-decision-sim (alias /decide)

"Given everything firing right now, what should I do per market — order-optimal and risk-robust" — off one call. Sizes against the edge-audit's measured edge (no fabrication); flat/zero-size when there's no edge, which is the honest default today.
