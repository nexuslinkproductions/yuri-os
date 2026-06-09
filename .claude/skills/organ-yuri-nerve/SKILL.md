---
name: organ-yuri-nerve
description: "The nervous-system spine + afferent nerve. A detected event is captured ONCE under ONE deterministic id and threaded across organs: it becomes an OpenProcess-shaped entry (STATE) carrying a memory…"
triggers:
  - "organ-yuri-nerve"
  - "how do I use yuri-nerve"
  - "yuri-nerve usage"
  - "yuri-nerve guide"
  - "YURI Nerve (nervous-system spine + afferent digest)"
generated: true
source_node: "yuri-nerve"
source_file: "_SYSTEM/Scripts/yuri-nerve.mjs"
---

<!-- GENERATED from the canonical graph node "yuri-nerve" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — YURI Nerve (nervous-system spine + afferent digest)

**Module:** `_SYSTEM/Scripts/yuri-nerve.mjs` · **Layer:** Memory & Subconscious · **Invocation:** both · **CLI:** `digest`

**Purpose.** The nervous-system spine + afferent nerve. A detected event is captured ONCE under ONE deterministic id and threaded across organs: it becomes an OpenProcess-shaped entry (STATE) carrying a memory link (MEANING), cross-linked not duplicated. organStateDigest() is the compact open-work heartbeat the brain wakes with each turn. Closes auto-tracking, the memory↔task link, and the durability hole in one spine.

## Exports
- `NERVE_KINDS (frozen const)`
  - in: —
  - out: ['task','decision','fix','finding','idea','correction','build','handoff']
- `mintEventId(ev = {})`
  - in: an event { kind, title, content }
  - out: a deterministic id 'nerve.<kind>.<fnv1a(title+content)>' — same input → same id (idempotent)
- `recordEvent(ev = {}, opts = {})`
  - in: an event { kind, title, state, weight, evidence, refs, memoryLink, nextCandidateAction, closureCondition, stamp } + optional { store }
  - out: { id, entry } — appends one JSONL line to the nerve store (mkdir-safe)
- `loadEvents(store = STORE)`
  - in: optional store path
  - out: current events (de-duped by id: a later record supersedes; malformed lines skipped)
- `closeEvent(id, opts = {})`
  - in: an event id + optional { kind, title, memoryLink, stamp }
  - out: { ok, id, entry } — records a state:'closed' transition under the same id, carrying the memory link forward
- `organStateDigest(opts = {})`
  - in: optional { top, weights, store }
  - out: { op:'organ_state_digest', openCount, closedCount, top:[{id,type,title,mass,next}], advisory_only } — the afferent heartbeat

## Security boundary
MUTATING but bounded: appends to the nerve store (_SYSTEM/state/nerve-events.jsonl, append-only JSONL, mkdir-safe) — never deletes or rewrites; a state transition is a NEW superseding record. No protected-path access. Deterministic: stable content-hash ids, caller-stamped time (no clock here). organStateDigest is advisory_only.

## When to use
Durably capturing a detected event (task/decision/fix/finding/idea/correction/build/handoff) the moment it occurs so it survives compaction; closing an event; or pulling the compact open-work digest the brain wakes with (`yuri-nerve.mjs digest`). The continuity spine — record-on-detect, recall-on-wake.

## Gotchas
- Ids are content-hashed (FNV-1a) so re-detecting the same event is idempotent — it supersedes, it does not duplicate.
- No clock inside: the caller supplies stamp; without it, time-ordering relies on append order only.
- The store is append-only and reads via de-dup-by-id — a later line for an id is the current state (closeEvent works this way).
- Only `digest` is wired as a CLI subcommand; recordEvent/closeEvent are the import surface (callers stamp + supply the event).

## Session Notes
- 2026-06-09 — generated from canonical node `yuri-nerve`.mechanism.guide (source-grounded; export list hard-gated against the live module by yuri-guide-seed.mjs). Authored source: _SYSTEM/organ-guides.json.
