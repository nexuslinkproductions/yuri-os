---
name: visual-introspection
description: Engineering visual analysis of the Yuri OS architecture graph. Reads _SYSTEM/yuri-graph-state.json and reports structural insights, optimization opportunities, dead-ends, missing returns, duplicate functionality, and merge candidates. Use when reviewing system architecture, planning refactors, or assessing graph health.
invocation: user
triggers:
  - "/introspect"
  - "visual introspection"
  - "graph analysis"
  - "review yuri architecture"
---

# Visual Introspection - Yuri OS Engineering Analysis

You are operating in visual-introspection mode. Read the Yuri OS architecture graph state and perform structured engineering analysis the same way a senior architect would by looking at a system diagram.

Terminology rule: current Yuri OS control-plane language is `KAGAMI` / `Kagami main`. Normalize obsolete implementation-node vocabulary in prose; do not surface retired names in user-facing artifacts.

## Inputs

Always start by reading:
1. `_SYSTEM/yuri-graph-state.json` - canonical graph state (nodes, edges, sectors, metadata)
2. `yuri-os-dashboard.html` (optional - visual reference)

## Analysis Pipeline

### Phase 1 - Structural Audit

For each node in the graph, check:
- Closed loops: does the node have a path that eventually returns its output to KAGAMI main / RESPONSE / USER?
- Dead ends: nodes with no `outputs_to` and no `returns_to` -> flag as potential gaps
- Orphans: nodes with no incoming edges -> flag as unused
- Cycles: detect cycles that are not intentional (the prompt-response cycle is intentional; others may not be)

Report:
```text
DEAD_ENDS: [list of node IDs with no return path]
ORPHANS: [list of node IDs with no incoming edges]
INTENTIONAL_CYCLES: [list of expected cycles]
UNEXPECTED_CYCLES: [list of cycles that may indicate bugs]
```

### Phase 2 - Functional Similarity / Merge Candidates

Identify nodes with overlapping purposes:
- Compare node `metadata.purpose` strings for semantic similarity
- Compare `metadata.capabilities` lists for overlap
- Compare `metadata.files` for shared sources
- Flag nodes that share more than 40% capability overlap as potential merges

Report:
```text
MERGE_CANDIDATES: [
  { nodes: ["A", "B"], reason: "Both handle X. Capabilities overlap on Y, Z." }
]
```

### Phase 3 - Sector Coherence

For each sector:
- Are all member nodes thematically consistent?
- Are there nodes that semantically belong to another sector?
- Are there missing nodes (functionality referenced in metadata but no node)?

Report:
```text
SECTOR_CONCERNS: [
  { sector: "advisors", concern: "OBLITERATUS_A serves a gate role, may belong to gates sector" }
]
```

### Phase 4 - Connection Quality

For each edge:
- Is the `type` accurate (flow vs data vs advises vs gates vs memory vs return)?
- Are there missing edges (nodes that semantically should connect but do not)?
- Are there redundant edges (same source/target same type)?

Report:
```text
MISSING_EDGES: [{ source: X, target: Y, expected_type: Z, rationale: "..." }]
REDUNDANT_EDGES: [...]
TYPE_MISMATCHES: [...]
```

### Phase 5 - Optimization Recommendations

Synthesize all findings into a ranked list of architectural improvements:
- High: dead ends without return paths (incomplete cycles)
- High: orphan nodes (dead code)
- Medium: merge candidates (consolidate similar nodes)
- Medium: sector miscategorization
- Low: type mismatches on edges
- Low: missing optional edges

For each recommendation, include:
- Concrete action ("Add edge X->Y of type data")
- Estimated impact (low/medium/high)
- Risk (low/medium/high)
- Affected files

### Phase 6 - Final Report

Output a structured markdown report:

```markdown
# Yuri OS Graph Introspection - {timestamp}

## Summary
- Total nodes: N
- Total edges: M
- Dead-ends found: K
- Merge candidates: J
- Optimization recommendations: L

## Critical Findings
{ordered list of high-impact issues}

## Recommendations
{ordered action list}

## Sector Health
{per-sector summary}
```

## Rules

- Read ONLY from graph state and metadata. Do not invent connections.
- All claims must reference specific node IDs from the graph.
- Use the metadata in graph state, not external knowledge about Yuri.
- If metadata is missing for a node, report it as `INCOMPLETE_METADATA` rather than guessing.
- Output must be evidence-backed and actionable.

## Output

Default: terminal-printable markdown report.
Optional: write to `_SYSTEM/SELF-IMPROVEMENT/graph-introspection-{date}.md` for archival.

## When to Use

- Architecture review sessions
- Pre-refactor planning
- Detecting code drift between graph state and reality
- Engineering retros (what merged? what split? what disappeared?)
- After major commits that change system topology

## Session Notes

### 2026-06-13
- session: 116m | peak ctx: 0% | compacts: 0
- tools: Bash×947, Read×345, Edit×171, StructuredOutput×82, Write×63, TodoWrite×25, ToolSearch×8, Workflow×6, Agent×3, ScheduleWakeup×2, TaskStop×1, PushNotification×1, AskUserQuestion×1
- corrections: rick i have a fun little task for you. I will be giving you the task of going through trending repos on github, scanning them, compare yuri to those, see what we can adopt and rebuild better in yuri u
- errors: none

### 2026-06-04
- session: 97m | peak ctx: 0% | compacts: 0
- tools: Bash×547, Read×426, Edit×294, Write×27, StructuredOutput×23, Workflow×5, TodoWrite×4, mcp×3, AskUserQuestion×1, ToolSearch×1
- corrections: none
- errors: none

### 2026-06-03
- session: 147m | peak ctx: 0% | compacts: 0
- tools: Bash×798, Read×626, Write×163, StructuredOutput×140, WebSearch×84, Edit×75, ToolSearch×39, WebFetch×16, Workflow×7, AskUserQuestion×1, Agent×1
- corrections: none
- errors: none
