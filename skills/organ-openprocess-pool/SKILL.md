---
name: organ-openprocess-pool
description: "Mathematical memory for started-but-unclosed work that ranks open tasks, research, ideas, todos, skills, bugs, experiments, and handoffs by open mass (status, staleness, dependency centrality, risk, and value). Use when you need a math-grounded answer to 'what did we start but not finish?', or when invoking openprocess-pool to surface and prioritize unclosed work across all lanes."
triggers:
  - "organ-openprocess-pool"
  - "how do I use openprocess-pool"
  - "openprocess-pool usage"
  - "openprocess-pool guide"
  - "OpenProcess Sum Pool (mathematical memory for started-but-unclosed work)"
generated: true
source_node: "openprocess-pool"
source_file: "_SYSTEM/Scripts/openprocess-pool.mjs"
---

<!-- GENERATED from the canonical graph node "openprocess-pool" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — OpenProcess Sum Pool (mathematical memory for started-but-unclosed work)

**Module:** `_SYSTEM/Scripts/openprocess-pool.mjs` · **Layer:** Memory & Subconscious · **Invocation:** both · **CLI:** none (import-only surface)

**Purpose.** The OpenProcess Sum Pool — mathematical memory for started-but-unclosed work. Users + lanes start tasks/research/ideas/todos/skills/bugs/experiments/handoffs over days; many stay open and fall out of working memory. This ranks them by OPEN MASS (status + staleness hazard-decay + dependency centrality + risk + value) so 'what did we start but not finish?' gets a math-grounded answer, not a memory vibe. UI-agnostic and YURI-native (same across all lanes).

## Exports
- `OPEN_PROCESS_TYPES (frozen const)`
  - in: —
  - out: ['task','research','idea','todo','skill','bug','experiment','handoff']
- `OPEN_PROCESS_STATES (frozen const)`
  - in: —
  - out: ['open','active','blocked','stale','closed']
- `DEFAULT_WEIGHTS (frozen const)`
  - in: —
  - out: the default OpenMass term weights (status/age/dep/risk/value)
- `staleness(proc)`
  - in: an OpenProcess object
  - out: a hazard-decay staleness score (stale-but-open rises back into attention)
- `openMass(proc, opts = {})`
  - in: an OpenProcess + optional { weights }
  - out: the scalar OpenMass for that process
- `rankPool(processes, opts = {})`
  - in: array of processes + opts
  - out: processes ranked by descending OpenMass
- `poolTotal(processes, opts = {})`
  - in: array of processes + opts
  - out: the summed OpenMass over the pool
- `categoryPools(processes, opts = {})`
  - in: array of processes + opts
  - out: OpenMass grouped/summed by category
- `whatIsUnfinished(processes, opts = {})`
  - in: array of processes + { top, weights }
  - out: the top-N highest-mass open processes with their next candidate action
- `async navigateCentrality()`
  - in: none
  - out: dependency centrality per process via yuri-navigate.aggregateProcessCentrality

## Security boundary
Pure / read-only ranking math — computes OpenMass over process objects supplied by the caller; persists nothing itself. navigateCentrality reads the canonical graph via yuri-navigate (also read-only). No protected-path access. Deterministic (sorted, hazard-decay, no RNG).

## When to use
Answering 'what did we start but not finish?', ranking open work by mass, summing pool/category load, or weighting a process by its dependency centrality. The math layer under the nervous system's afferent digest (yuri-nerve calls whatIsUnfinished).

## Gotchas
- Staleness uses hazard-decay: a stale-but-open item RISES back in rank over time — it is not penalized into invisibility.
- navigateCentrality is async and depends on yuri-navigate over the canonical graph; a stale graph yields stale centrality.
- The pool is data-in/score-out — it does not own storage; the caller supplies the process objects (e.g. from the nerve store).

## Session Notes

### 2026-06-13
- session: 40m | peak ctx: 0% | compacts: 0
- tools: Bash×824, Read×163, Edit×17, StructuredOutput×16, Write×8, TodoWrite×4, ToolSearch×2, ScheduleWakeup×2, Workflow×1, mcp×1, AskUserQuestion×1
- corrections: none
- errors: none
