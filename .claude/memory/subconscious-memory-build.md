---
name: subconscious-memory-build
description: subconscious LIVE+verified 2026-06-01 (cold store schema valid, archive hook gone, recall wired); brain-inject dead code removed+pushed c5823a7e
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["subconscious", "memory build", "relocator", "cue recall", "fsrs", "cold store", "go live", "subconscious live", "pulse orchestrator"]
  refs: ["[[neuro-tunables-map]]", "[[brain-inspired-memory-evolution]]", "[[energy-attack-round2-deferred]]", "[[yuri-app-tuning-cockpit]]", "[[session-resume-2026-06-01]]"]
---

GOAL: build YURI's subconscious memory subsystem — forgetting = relocate-not-delete + cue-recall + offline consolidation. Design locked. NOW LIVE.
STATE (2026-06-01): LIVE + VERIFIED. Subsystem L5b–L10 built+tested last session (72/72 green); armed + confirmed-live this session.
GO-LIVE — DONE (was OWNER-gated, owner-approved + executed):
  - Cold store EXISTS with valid FTS5 schema: _SYSTEM/OS_KERNEL/memory-cold.db (cold_docs + shadow tables + cold_meta). Currently 0 docs (nothing aged past floor yet) → recall correctly no-ops, so no <subconscious-recall> block injects YET. Designed steady state, not a fault.
  - memory-archive.mjs --execute hook REMOVED from .claude/settings.json (no forgetting gap; relocator supersedes it, same _SYSTEM/memory root). Verified: zero memory-archive refs in settings.json.
  - Recall WIRED into live UserPromptSubmit hook (.claude/hooks/user-prompt-submit.js: readPriorRecall + spawnRecall, gated on cold-DB existence; RECALL_FILE + RECALL_SCRIPT consts). Hook registered in settings.json.
  - yuri-recall.mjs runs clean (exit 0); cue is POSITIONAL (joined argv), not --cue; --out writes atomic envelope. Empty store → no envelope (no empty-DB side effect).
  - memory.db (Track A hot) untouched, as decided.
DEAD-CODE CLEANUP — DONE this session (committed c5823a7e, pushed): removed orphaned brain-inject.js loaders (loadOperatingBrain/loadPersonaCore/loadNeurodivergentEngine + OPERATING_BRAIN_FILE/PERSONA_CORE_FILE consts + 3 always-empty section-builders + orphaned cortexTier calc), dead since the persona.md consolidation nulled them. <yuri-brain> block byte-identical to baseline (verified); subconscious demote->recall->re-promote E2E green post-edit. −80 net lines.
SUBSYSTEM BUILD (reference, still valid):
  L5b user-prompt-submit readPriorRecall (consume-once + 1h stale-drop) + spawnRecall gated on cold-DB; yuri-recall --out atomic envelope.
  L6 kagami-memory-consolidator runSubconsciousPass + findRepromotionCandidates; DRY-RUN default, --execute does reversible demote + re-promotion proposals.
  L7 energy-weights.json fsrs:{} + recall:{} blocks (code defaults); brain-inject consciousSetCap + retrievability-rank-on-overflow.
  L8 pulse-orchestrator retired reversibly (PULSE_ORCHESTRATOR_RETIRED flag). Pulse-cortex archived NON-DESTRUCTIVELY to _SYSTEM/archive/retired-pulse-cortex/ (+README+restore).
  L9 cockpit 401 fixed (Bearer token); fsrs/evict sliders; hydrates from live /config. 8/8 server tests.
  L10 dead-knob wiring proven live (fsrs->consolidator, recall->yuri-recall); applyTransition per-record evidence deep-copy fix (energy-tick 21/21).
REMAINING (LOW, deferred): enforce dead-knob full removal (5-file churn, harmless no-op now); negative-threshold unbounded (policy call); isMain symlink-safety (no isMain symbol; inline import.meta.url guards repo-wide, low value).
DECISIONS LOCKED: single relocator (verify-first, reversible); relocate-not-delete; FTS5/BM25 only; memory.db untouched. Relocator root = _SYSTEM/memory (Track A); cold store = _SYSTEM/OS_KERNEL/memory-cold.db; ledger = _SYSTEM/state/memory-usage.jsonl.
SEE: [[neuro-tunables-map]], [[brain-inspired-memory-evolution]], [[energy-attack-round2-deferred]], [[yuri-app-tuning-cockpit]], [[session-resume-2026-06-01]]
