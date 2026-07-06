---
name: yuri-navigation-layer-design-2026-06-09
description: Design — the YURI Navigation Layer. Per-organ guides (= skills) + a unified mathematical traversal door (yuri-traverse) that makes the whole system domain- AND cross-domain-navigable at high precision + speed. Marcel 2026-06-09 ("guides per organ + great traversal + maths for cross-domain navigation"). Soon, not now.
metadata: { node_type: design, date: 2026-06-09, status: designed-not-built, tier: high }
tags: navigation, traversal, skills, guides, cross-domain, navigate, yuri-match, transfer-distance, super-tool
---

# YURI Navigation Layer — design (build SOON)

**The ask (Marcel 2026-06-09):** every organ should carry a GUIDE that lets an AI navigate it securely + fast; a
system for great TRAVERSAL; and — the deep part — use MATH so the system is domain-navigable AND cross-domain-
navigable at high precision + speed. "any LLM uses the whole NEXUS as one super-tool", made concrete.

## The key realization
"Guides per organ" == the SKILLS Marcel also asked to add. A skill IS an AI-usage guide (purpose · call signature ·
security boundary · inputs/outputs · when-to-use · gotchas). Build the guides as skills → the two asks are one.

## The three gears already exist (not new — just not unified)
| Gear | Built | Role in traversal | Precision | Speed |
|---|---|---|---|---|
| `yuri-navigate` | ✓ (284fde3a) | WITHIN-domain: structural centrality + reachability (dependency/impact) over the canonical graph | complete-on-graph | bounded BFS, cached |
| `yuri-match` (containment + RRF + shared space) | ✓ | CROSS-domain/surface: "0.4-in-memory == 0.4-in-code" recall across code/docs/memory/graph | prefix-filter = 100% recall above threshold | no full scan |
| `transfer-distance` (A·M·B) | ✓ | CROSS-domain MECHANISM transfer: a mechanism from domain A maps onto organ B | bridge-gated | bounded |
Supporting: `yuri-id-bridge` (the file-path spine joining surfaces), the canonical graph (the structure),
`xref-query` (recall), the prefix-filter completeness (speed), the GVF gates + calibration C-layer (precision).

## What is genuinely NEW (the build)
1. **Per-organ AI-usage GUIDES as skills.** A structured guide attached to each organ: `{purpose, call, inputs,
   outputs, securityBoundary (gates/protected paths), whenToUse, gotchas}`. Machine-navigable + compact (the AI
   doesn't read 2000 lines). The canonical-graph node descriptions are proto-guides — promote them to real skills.
2. **`yuri-traverse(intent)` — the unified door.** Fan an intent through navigate (structure) ⊕ match (cross-
   surface) ⊕ transfer-distance (mechanism), rank by calibrated precision, return `{organs[], each with its
   skill-guide, a usage path, the security boundary}`. One entry point: task → the right organ + how to use it.

## The math for "domain + cross-domain at high precision + speed" (stated plainly)
- DOMAIN-navigable: navigate's deterministic centrality/reachability (precise = complete on the graph; fast =
  bounded BFS over 240 nodes, cached reverse-index).
- CROSS-domain-navigable: match's containment + RRF + shared global space (precise = prefix-filter 100% recall
  above threshold; fast = candidate filter, no scan) + transfer-distance for mechanism leaps.
- PRECISION: the completeness guarantees (no silent miss) + the GVF calibration C-layer (when built, comparable
  scores → P(relevant), so "the right organ" is ranked, not guessed).
- SPEED: prefix-filter (no full scan) + bounded/cached navigate + the LSH/MinHash predictor (gpd-confirm-matcher)
  as a cheap pre-rank.

## Build order (when we do it)
1. Define the organ-guide schema + author guides for the shipped organs (Foundry, OpenProcess, decode, navigate,
   match, gates, cockpit, filing) — as real skills (`.claude/skills/` + the guide schema).
2. `yuri-traverse(intent)` over navigate ⊕ match ⊕ transfer-distance + the guides; return ranked organs + usage path.
3. Calibrate (the GVF C-layer gives the precision ranking).
4. Wire as a one-port op on the Originator (any lane calls traverse → the right organ + guide).

## Open question to resolve at build time
Whether the guide lives IN the canonical-graph node (one source, projects to the skill) or in `.claude/skills/`
with a back-reference — keep ONE source of truth (the canonical graph is the spine; lean toward generating the
skill guide FROM the node, consistent with the projection pattern).

SEE: [[one-canonical-graph-generated-projections]] · [[cross-surface-comparability-cracked]] ·
[[originator-convergence-all-surfaces-as-nodes]] · [[rick-opts-into-originator-port]].
