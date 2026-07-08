---
name: organ-yuri-decode
description: "LLM-wielded decoder instrument: translate text into a deterministic math object (tokens, numerology channels, dimensional classification). Use when the model needs a deterministic structural reading of text to reason over — e.g. decoding a brain dump's surface features, analyzing token patterns, or extracting numerology/dimensional signatures from input."
triggers:
  - "organ-yuri-decode"
  - "how do I use yuri-decode"
  - "yuri-decode usage"
  - "yuri-decode guide"
  - "YURI Decode (LLM-wielded decoder instrument: text → math object)"
generated: true
source_node: "yuri-decode"
source_file: "_SYSTEM/Scripts/yuri-decode.mjs"
scope: harness
invocation: ability
---

<!-- GENERATED from the canonical graph node "yuri-decode" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — YURI Decode (LLM-wielded decoder instrument: text → math object)

**Module:** `_SYSTEM/Scripts/yuri-decode.mjs` · **Layer:** Cognition & Persona · **Invocation:** both · **CLI:** `"<text>" [--json]`

**Purpose.** The LLM-WIELDED decoder instrument: translate text → a deterministic math object. NOT an ingress pre-processor that mutates input before the LLM — it is an INSTRUMENT the LLM calls directly: decode('<text>') returns a structured math representation (tokens, numerology channels, dimensional reading, feature surface) the LLM then reasons over. The control inverts — the model wields the decode engine.

## Exports
- `decode(text, opts = {})`
  - in: a text string + optional opts
  - out: { tokens, numerology (gematria hash / digital-root mod-9 / harmonic signature), dimension, features, advisory_only } — a deterministic math object for the same text

## Security boundary
Pure / read-only and advisory_only — computes a math object from text; persists nothing, touches no protected paths. Deterministic + embedding-free: same text → same object. Reuses the shipped channels (yuri-jaccard tokenize, nexus-numerology, the Foundry dimension classifier).

## When to use
When the model wants a deterministic structural reading of a piece of text (token surface, numerology channels, dimensional classification) to reason over — e.g. decoding a brain dump's surface features into a stable object.

## Gotchas
- It is an INSTRUMENT the LLM calls, NOT an ingress mutator — it never rewrites the input before the model sees it.
- Deterministic + embedding-free: identical text yields an identical object (no RNG, no clock) — good for caching/equality.
- Output is advisory_only — a decoded reading is structure to reason over, not a verified claim.

## Session Notes

### 2026-06-13
- session: 40m | peak ctx: 0% | compacts: 0
- tools: Bash×824, Read×163, Edit×17, StructuredOutput×16, Write×8, TodoWrite×4, ToolSearch×2, ScheduleWakeup×2, Workflow×1, mcp×1, AskUserQuestion×1
- corrections: none
- errors: none
