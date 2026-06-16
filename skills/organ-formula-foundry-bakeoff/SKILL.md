---
name: organ-formula-foundry-bakeoff
description: "Foundry CHUNK 3 — the bakeoff harness + the promotion/demotion ledger (the SCORER + GOVERNANCE side of Core B). Takes already-synthesized candidates as INPUT and runs them up a staged promotion…"
triggers:
  - "organ-formula-foundry-bakeoff"
  - "how do I use formula-foundry-bakeoff"
  - "formula-foundry-bakeoff usage"
  - "formula-foundry-bakeoff guide"
  - "Formula Foundry Bakeoff + Promotion Ledger (Core B test layer)"
generated: true
source_node: "formula-foundry-bakeoff"
source_file: "_SYSTEM/Scripts/math/formula-foundry-bakeoff.mjs"
---

<!-- GENERATED from the canonical graph node "formula-foundry-bakeoff" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — Formula Foundry Bakeoff + Promotion Ledger (Core B test layer)

**Module:** `_SYSTEM/Scripts/math/formula-foundry-bakeoff.mjs` · **Layer:** Energy & Math · **Invocation:** both · **CLI:** `ledger`

**Purpose.** Foundry CHUNK 3 — the bakeoff harness + the promotion/demotion ledger (the SCORER + GOVERNANCE side of Core B). Takes already-synthesized candidates as INPUT and runs them up a staged promotion ladder, recording every gate verdict to an append-only ledger. Deliberately the GENERATOR≠SCORER boundary: it never imports the synthesizer, so a synthesizer can never grade its own candidate.

## Exports
- `stableHash(obj)`
  - in: any JSON-serializable object
  - out: a deterministic stable hash string (sorted-key, no clock)
- `PROMOTION_LADDER (frozen const)`
  - in: —
  - out: the ordered, frozen list of promotion rungs
- `readLedger(ledgerPath = LEDGER_PATH)`
  - in: optional ledger path
  - out: array of gate records (malformed lines skipped)
- `appendGateRecord(record, ledgerPath = LEDGER_PATH)`
  - in: a gate record + optional path
  - out: appends one JSONL line to the ledger (mkdir-safe)
- `canPromote(formulaId, toRung, ledger = readLedger())`
  - in: formula id + target rung + optional ledger
  - out: boolean — whether the ladder + evidence permit promotion to that rung
- `promote(card, toRung, ledger = readLedger())`
  - in: card + target rung + optional ledger
  - out: the promotion result; records a gate entry
- `demote(formulaId, toRung, reason, opts = {})`
  - in: formula id + target rung + reason
  - out: the demotion result; records a gate entry with the reason
- `stage0Intake(candidate)`
  - in: a candidate
  - out: stage-0 intake verdict
- `stage1Fixtures(card)`
  - in: a card
  - out: stage-1 fixture-test verdict
- `async stage2Counterexamples(card, opts = {})`
  - in: a card + opts
  - out: stage-2 counterexample-search verdict
- `stage3RealData(candidates, opts = {})`
  - in: candidates + opts
  - out: stage-3 real-data verdict with ACTUAL corpus totals (no top-N laundering) or a refusal
- `async runBakeoff(candidates, opts = {})`
  - in: candidates + opts (incl. opts.stamp for determinism)
  - out: the full staged bakeoff result

## Security boundary
MUTATING but bounded: appends to the promotion/demotion LEDGER (_SYSTEM/state, append-only JSONL, mkdir-safe) — never deletes or rewrites. No protected-path access. DOMAIN-BLIND: nothing inspects a candidate's source domains to loosen/tighten a gate — music, frequency, magnetism, numerology, alchemy, information-theory clear the SAME rungs on the SAME evidence bar; a candidate fails only for insufficient evidence. Deterministic: no Math.random, no Date.now (timestamps via opts.stamp).

## When to use
Promoting/demoting a formula candidate through the evidence ladder, reading the gate-decision history, or running the full staged bakeoff over a candidate set. The governance/scoring counterpart to formula-foundry's generation.

## Gotchas
- GENERATOR≠SCORER: this module never imports synthesizeFormulaCandidates — keep that separation; do not wire the synthesizer in.
- Determinism requires the caller to pass opts.stamp — there is no clock inside; a missing stamp loses reproducibility.
- stage3RealData reports REAL corpus totals or REFUSES — it will not emit a top-N severity-laundered count.
- The ledger is append-only; a later record for an id supersedes earlier ones (read reconstructs current state).

## Session Notes

### 2026-06-13
- session: 40m | peak ctx: 0% | compacts: 0
- tools: Bash×824, Read×163, Edit×17, StructuredOutput×16, Write×8, TodoWrite×4, ToolSearch×2, ScheduleWakeup×2, Workflow×1, mcp×1, AskUserQuestion×1
- corrections: none
- errors: none
