---
name: feedback-master-brief-per-mission
description: "For multi-spawn missions, write ONE master-brief ground-truth doc FIRST so every spawn shares identical framing/constraints/capabilities"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 53a52603-b3b9-4334-aa4a-1d18e47af592
---

RULE: When starting any multi-spawn / multi-phase mission (competitive-intel sweep, audit, build wave, fan-out research), create ONE master-brief document FIRST and point every spawn (Anthropic agents, mimo, future-phase workers) at it by absolute path.

WHEN: any task that will fan out across more than a couple of agents or run across multiple staged phases. Marcel's standing request (2026-06-13): "create one master document basically so the spawns work with the same info and capabilities to ensure quality."

DO: capture in the brief — mission + Marcel's exact framing; the staged flow with owner-checkpoint gates; the target list with subsystem mapping; hard constraints (clean-room, no-install, capability-first, protected paths, owner authority); the VERIFIED lane reality (which lanes work + how to call them); methodology/quality bar; the spawn protocol (each spawn reads the brief first); artifact list; a live status log updated as phases close. Land it in the canonical research dir (`02_RESOURCES/RESEARCH/<mission>-<date>/00-MASTER-BRIEF.md`).

DONT: bake divergent context into each spawn prompt ad-hoc (drift + inconsistent quality); skip the brief because "the workflow prompt already has context"; let spawns run on stale assumptions about lane health.

WHY: shared ground truth = consistent quality across spawns; it is the bankai-manifest discipline applied to fan-out; it also doubles as the resumable mission record and the owner-visible status surface. mimo can't read files inside a workflow — feed it the brief's constraints inline.

SEE: [[ref-mimo-firing]] (lane call syntax) · [[feedback-build-agent-context-loadout]] (proportional loadout) · bankai-manifest skill
