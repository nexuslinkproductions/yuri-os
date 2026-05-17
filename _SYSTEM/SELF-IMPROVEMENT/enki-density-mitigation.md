# ENKI Density Mitigation — STATE_AGGREGATOR Proposal
**Date:** 2026-05-16
**Source:** v15 visual-introspection finding — ENKI has 30 incoming edges, high choke risk
**Status:** Design proposal — not yet implemented in codebase

---

## Problem

ENKI is the control-plane convergence node. 30 incoming edges from lanes, advisors, scouts, and tool outputs all terminate directly at ENKI. As the graph grows, every new lane or advisor adds another ENKI edge. This creates:

1. **Merge complexity:** ENKI must handle return-value aggregation, conflict resolution, and context compression for all 30+ inputs simultaneously
2. **Single-node latency:** Any ENKI processing bottleneck blocks the entire pipeline
3. **Fragile fan-out tracing:** 30 edges makes causal tracing difficult in error cases

---

## Proposed Solution: STATE_AGGREGATOR Node

Insert a `STATE_AGGREGATOR` node between the lane/advisor tier and ENKI. Categories of returns that share a schema get routed to STATE_AGGREGATOR first; ENKI receives one aggregated object per category.

```
Before:
  [DeepSeek-A] ──┐
  [OpenClaw-A] ──┤
  [Hermes-A]  ──┤──→ ENKI (30 edges)
  [Cassandra-A]──┤
  ...28 more  ──┘

After:
  [DeepSeek-A] ──┐
  [OpenClaw-A] ──┤──→ STATE_AGGREGATOR ──→ ENKI (4-6 edges)
  [Hermes-A]  ──┤         (merge by category)
  [Cassandra-A]──┘
```

---

## Aggregation Categories

| Category | Members | Output shape |
|----------|---------|-------------|
| `advisor_findings` | DeepSeek-A, OpenClaw-A, Cassandra-A, NVIDIA-A, Kimi-A | `{ findings[], risks[], confidence }` |
| `gate_status` | Hermes-A, Argus-A, Obliteratus-A | `{ gates: { hermes, argus, obliteratus }, blocked: bool }` |
| `memory_context` | MEMORY, session-state, NEXUSPULSE | `{ memory_entries[], session_vars }` |
| `tool_outputs` | GitNexus, ENKI_COMMANDS, CODEX_FLOW | `{ tool_results[], files_touched[] }` |
| `scout_signals` | HOOK_PIPELINE, NATIVE_GATES | `{ hook_events[], native_signals[] }` |

ENKI receives `{ advisor_findings, gate_status, memory_context, tool_outputs, scout_signals }` — 5 typed inputs instead of 30 raw edges.

---

## Implementation Path

**Phase 1 (graph visualization):**
Add `STATE_AGGREGATOR` node to `yuri-os-dashboard.html` GRAPH_STATE at position between ADVISORS tier and ENKI. Add 5 aggregation category edges. Reroute existing ENKI-bound edges through STATE_AGGREGATOR.

**Phase 2 (pulse-orchestrator):**
Add `aggregateAdvisorOutputs()` function to `_SYSTEM/Scripts/pulse-orchestrator.mjs` that merges advisor findings before passing to main-session synthesis. This reduces the main-session merge loop complexity.

**Phase 3 (lane dispatcher):**
When `_SYSTEM/Scripts/lane-dispatcher.mjs` (Packet 15) lands, route all advisory outputs through the aggregator as a first-class pipeline stage.

---

## Risk Assessment

- **Low** — STATE_AGGREGATOR is additive; existing ENKI-direct paths can coexist during transition
- **Rollback** — Remove node from graph; aggregator function is an optional pre-processing step
- **Dependencies** — Packet 15 (lane-dispatcher) makes Phase 3 natural; Phases 1-2 are independent

---

## Decision

Do NOT implement Phase 1-2 in this sprint — graph stability more valuable than density reduction right now. **Defer to post-Jun-14 sprint.** This doc is the audit artifact per v15 upgrade C6.
