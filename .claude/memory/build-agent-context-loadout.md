---
name: build-agent-context-loadout
description: "PROPORTIONAL agent context loadout (Marcel 2026-06-04 correction) — match the context handed to a dispatched agent to the TASK's complexity + blast radius, NOT maximal-always. The full 7-part loadout is for HIGH-complexity / multi-organ / architectural builds (like the master-spec build it was written for); trivial/known tasks get a light loadout. Over-loading wastes tokens + dilutes; under-loading silos a big build."
metadata:
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig:
    - build agent
    - dispatch agent
    - load up the agents
    - agent context
    - context loadout
    - how much context
    - code bible
    - orchestrate build
  refs:
    - "[[feedback-agent-dispatch-contract]]"
    - "[[feedback-scope-to-the-current-ask]]"
    - "[[feedback-fanout-self-size]]"
    - "[[feedback-simplicity-over-fanout]]"
    - "[[hold-big-picture-breadth-and-depth]]"
    - "[[cross-reference-engine]]"
  originSessionId: fbd2b7b2-1d10-45fd-b2bb-5481c763f291
---

RULE: match an agent's context loadout to the TASK — proportional, not maximal-always. Self-size context the way you self-size fan-out. The FULL loadout is for high-complexity / multi-organ / high-blast-radius builds; small / known / mechanical tasks get a light loadout (down to just the scoped task + a pointer). Over-loading every dispatch wastes tokens and DILUTES the signal; under-loading a big architectural build silos it and breeds drift.

WHEN: deciding how much context to hand any dispatched agent.

DO: (1) gauge the task's complexity + blast radius, then pick the tier —
- LIGHT (trivial / known / single-file mechanical): the scoped task + 1-2 pointers; trust the agent to pull more via `ai search` if it needs it.
- MEDIUM (a real feature inside one organ): task + the relevant research/Code-Bible cards + cross-ref tools + the guard contract. Skip the full brain/circuitry-overview unless it touches shared surfaces.
- FULL (architectural / multi-organ / shared-contract / high-blast-radius — e.g. the master-spec build): the 7-part loadout below.
(2) When unsure or blast-radius is high, lean heavier; when clearly small, stay light. (3) Always: protected-path + local-evidence discipline, regardless of tier.

THE FULL 7-PART LOADOUT (used at the FULL tier only): (1) brain+persona (CLAUDE.md/`_SYSTEM/persona.md`/SOUL.md — operate AS a YURI lane, [[feedback-agent-dispatch-contract]]); (2) circuitry large-scale overview (`02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` + its node + siblings + ripple); (3) the Code Bible (`02_RESOURCES/CODE-BIBLE/`, currently viz-only — expand before relying on it for non-viz excellence); (4) the research (roadmap + `three-seams-shaped-with-prior-art` + the specific transfer cards + seam prior-art); (5) cross-referencing tools+mandate (`ai search` + GitNexus + the graph — verify vs live code, find siblings, no drift); (6) guard+continuity contract (protected paths, canaries, fail-closed, owner-gates, propagate→graph+manual→reindex); (7) its scoped item + acceptance/verification criteria.

DONT: fire the full loadout on every task (overkill — token waste + dilution, the error Marcel corrected 2026-06-04); under-load a multi-organ / shared-contract build (silos + drift); blind-dump the whole corpus into one window (point + let it pull via FTS5).

WHY: Marcel correction 2026-06-04 — the full loadout was written specifically for the master-spec build; making it fire every time is overkill, because the depth required varies by context. Proportionality is the same self-sizing discipline as [[feedback-fanout-self-size]] + [[feedback-simplicity-over-fanout]] + [[feedback-scope-to-the-current-ask]], applied to context handed to agents.

NOTE — THIS BUILD: the master-spec build IS high-complexity + multi-organ + shared-contract, so it qualifies for the FULL loadout. That is a context-appropriate choice for this one build, not a universal mandate.

SEE: [[feedback-agent-dispatch-contract]] · [[feedback-fanout-self-size]] · [[feedback-scope-to-the-current-ask]] · [[hold-big-picture-breadth-and-depth]] · the master build plan (forthcoming).
