---
name: organ-discovery-precision-gate
description: "Gates a lane claim against its WorkSubstrate scope and discovery footprint before the energy gate runs, verifying the lane stayed inside its granted authority. Use when a lane produces a claim that needs scope-and-footprint verification, or when invoking discovery-precision-gate to filter claims before energy evaluation."
triggers:
  - "organ-discovery-precision-gate"
  - "how do I use discovery-precision-gate"
  - "discovery-precision-gate usage"
  - "discovery-precision-gate guide"
  - "Discovery Precision Gate (scope + footprint filter before the energy gate)"
generated: true
source_node: "discovery-precision-gate"
source_file: "_SYSTEM/Scripts/discovery-precision-gate.mjs"
scope: harness
invocation: ability
---

<!-- GENERATED from the canonical graph node "discovery-precision-gate" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — Discovery Precision Gate (scope + footprint filter before the energy gate)

**Module:** `_SYSTEM/Scripts/discovery-precision-gate.mjs` · **Layer:** Governance & Safety · **Invocation:** both · **CLI:** none (import-only surface)

**Purpose.** Gates a lane claim against its WorkSubstrate scope + discovery footprint BEFORE the energy gate runs. The energy gate scores a transition's quality; this is the upstream filter asking 'did the lane stay inside the authority it was granted, and how precise was its discovery?'. Rides on yuri-id-bridge (isProtectedPath/normalizePath — the protected veto) and yuri-navigate (impact centrality — the claim's blast radius).

## Exports
- `discoveryPrecisionGate(claim = {})`
  - in: a claim { targets, scope (allowed/denied), discovery records }
  - out: { verdict, vetoes, precision, footprint, advisory_only } — a hard protected/scope veto blocks; precision is reported
- `async withNavigate(claim, substrate, opts = {})`
  - in: a claim + substrate + opts
  - out: the gate verdict enriched with yuri-navigate impact centrality (blast radius of the claim's graph targets)

## Security boundary
ADVISORY pre-filter with a HARD veto: a protected-path or out-of-scope target produces a blocking veto (fail-closed via isProtectedPath, which is traversal-hardened so '../'-escapes are caught). Precision + impact are advisory_only (reported for the downstream energy/proof gates + operator). Reads the graph via yuri-navigate; writes nothing. Deterministic (sorted, no RNG/clock).

## When to use
Before accepting a lane's claim/transition — to confirm it stayed inside granted authority (scope + protected paths) and to surface how precise/wide-blast its discovery was, upstream of the energy gate.

## Gotchas
- The verdict is ADVISORY except the protected/scope VETO, which is a hard block — do not treat the precision score as a gate by itself.
- Protected-path detection is realpath/traversal-hardened (yuri-id-bridge), not lexical — '../' escapes are caught.
- withNavigate is async (graph impact lookup); high impact_centrality means 'surface for review', not automatic block.

## Session Notes

### 2026-06-13
- session: 40m | peak ctx: 0% | compacts: 0
- tools: Bash×824, Read×163, Edit×17, StructuredOutput×16, Write×8, TodoWrite×4, ToolSearch×2, ScheduleWakeup×2, Workflow×1, mcp×1, AskUserQuestion×1
- corrections: none
- errors: none
