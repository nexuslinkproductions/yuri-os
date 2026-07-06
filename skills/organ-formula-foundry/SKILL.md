---
name: organ-formula-foundry
description: "Formula Foundry typing Core A — the legal-move generator that classifies formula input/output units into closed-set dimensions and rejects dimensionally-incoherent compositions. Use when composing formulas and needing to verify dimensional compatibility, cataloging formula banks, or checking whether one formula's output can legally feed another's input."
triggers:
  - "organ-formula-foundry"
  - "how do I use formula-foundry"
  - "formula-foundry usage"
  - "formula-foundry guide"
  - "Formula Foundry (typing core: catalog + coverage + composition type-algebra)"
generated: true
source_node: "formula-foundry"
source_file: "_SYSTEM/Scripts/math/formula-foundry.mjs"
---

<!-- GENERATED from the canonical graph node "formula-foundry" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — Formula Foundry (typing core: catalog + coverage + composition type-algebra)

**Module:** `_SYSTEM/Scripts/math/formula-foundry.mjs` · **Layer:** Energy & Math · **Invocation:** both · **CLI:** `catalog`, `coverage`, `compose`, `composable`, `sequences`, `synth`, `preflight`

**Purpose.** Formula Foundry typing CORE A — the legal-move generator. Reads the typed formula-bank cards, classifies each card's input/output UNITS into a deterministic closed-set dimension, and decides whether one formula's output may legally feed another's input. Rejects dimensionally-incoherent compositions (bits→length, probability into an energy slot) — the silent-garbage hole the engine exists to close.

## Exports
- `classifyDimension(unitText)`
  - in: a prose unit string (e.g. 'bits', 'joule', 'meters/second')
  - out: { dimension, witness } — closed-set dimension + the matched witness token (or null)
- `dimensionsCompatible(a, b)`
  - in: two dimension strings (from classifyDimension)
  - out: { compatible, confidence, reason }
- `catalogFormulas(opts = {})`
  - in: optional { bankDir }
  - out: { cards, count, banks, skipped } — unified read-view over the typed formula-banks; corrupt banks are listed in skipped
- `async coverageReport()`
  - in: none (reads banks + math-kernel exports)
  - out: { boundCount, kernelExportCount, unboundPrimitives, orphanCards, cardCount } — the kernel-fn↔bank-card binding worklist
- `composeCheck(cardA, cardB)`
  - in: two catalog card objects
  - out: { legal, compatibleSlots, reasons, from, to, outputDim } — whether A's output may legally feed B
- `composableTargets(cardA, catalog = null)`
  - in: one card + optional pre-loaded catalog
  - out: array of legal downstream targets { to, slots, outputDim }
- `composeOperatorSequences(catalog = null, opts = {})`
  - in: optional catalog + { min/max chain length, branching, domain filters }
  - out: { sequences, count, truncated, truncation, params } — enumerated legal operator chains
- `synthesizeFormulaCandidates(opts = {})`
  - in: optional catalog + synthesis constraints
  - out: { candidates, count, truncated } — research-status candidates
- `draftFormulaBankCard(candidate)`
  - in: a synthesized candidate
  - out: a research-status bank card (promotionStatus:'research', advisoryOnly:true, implementedBy:null)
- `proofPreflightCandidate(card, opts = {})`
  - in: a draft card + optional overrides
  - out: { inert, hasBinding, reason, promotionStatus, advisoryOnly, validationOk, validationErrors }

## Security boundary
READ-ONLY over the formula-bank files; mints NO production cards. Synthesis output is INERT — promotionStatus:'research', advisoryOnly:true, no kernel binding — and cannot promote until someone binds a real kernel symbol AND a green worked example clears math-proof-gate (Core B). No protected-path access. Deterministic: no RNG, no clock, sorted iteration, closed-set classification.

## When to use
Auditing math coverage (which kernel primitives are unbound / which cards are orphaned), checking whether two formulas can legally compose, enumerating legal operator chains, or prototyping new formula candidates by dimensional rules. The upstream typing gate before math-proof-gate validates.

## Gotchas
- Dimension classification is keyword-based over a CLOSED set; short tokens (≤5 chars) require full word boundaries to avoid collisions with ordinary English (F-1 hardening).
- UNKNOWN dimensions are treated as compatible-by-default (cannot be disproven) — an UNKNOWN slot is not a rejection.
- Synthesized candidates are INERT and advisory; they NEVER auto-promote — binding + proof-gate is a separate manual step.
- Corrupt bank files are silently skipped; the only visibility of lost cards is the `skipped` field of catalogFormulas.
- Generator (synthesize) and scorer (bakeoff) are deliberately separate modules — this core does not grade its own candidates.

## Session Notes

### 2026-06-13
- session: 40m | peak ctx: 0% | compacts: 0
- tools: Bash×824, Read×163, Edit×17, StructuredOutput×16, Write×8, TodoWrite×4, ToolSearch×2, ScheduleWakeup×2, Workflow×1, mcp×1, AskUserQuestion×1
- corrections: none
- errors: none
