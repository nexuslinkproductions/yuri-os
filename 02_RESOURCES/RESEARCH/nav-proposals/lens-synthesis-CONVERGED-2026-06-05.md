# Master-Navigation — CONVERGED Synthesis + Adversarial Verdict (2026-06-05)

> The decision doc the last session owed. Reconciles the 4 lens proposals (lens1 completeness · lens3 index · lens4 interface · lens5 integration; **lens2 was dropped** — it would have owned the storage/recall-calibration model) into one buildable design, then **adversarially verified it against the live `_SYSTEM/Scripts/xref-query.mjs`**. All 3 verify axes returned `holds=false`. Advisory until built + locally verified; **graph mutation is owner-gated.**
> Method: 8-agent Workflow (4 lens-readers → 1 synthesis arbiter → 3 adversarial skeptics). Grounded against the live circuitry graph (124 nodes / 273 edges / **14 sectors, no `retrieval` sector**) and the live xref source.

---

## 1. Converged design (skeleton — SOUND)

- **Organ `NAVIGATION`** in the **EXISTING `memory` sector**, parent `MEMORY`. **No new sector.** Minting a sector is the costliest mutation under the continuity law (touches `sectors[]` + layout + plane_radii + viz legend + BUILD-MANUAL + full edge audit). NAVIGATION is a *wrapper over a live surface*, not new infrastructure — it must not pay sector-minting cost. `pulse_cortex` (lens1) is wrong: that tier is *pre-retrieval* (turn-classifier/fan-out); completeness is a *post-retrieval* property.
- **Children:** `NAV_TRAVERSAL` (breadth-first pass-audit over live `xrefQuery()`), `NAV_RECEIPT` (CoverageReceipt gen + verify), `NAV_DRIFT` (thin extension of live `xref-drift-scan.mjs`).
- **Wrap, never duplicate.** `xref-query.mjs` stays the primary engine with its own callers; NAVIGATION calls the exported `xrefQuery(raw, opts)`. CLI verb `ai nav` (namespace verified free).
- **Build now on xref; do NOT block on Wave-2.** `propagation-scan.mjs` is **verified absent**; the GitNexus structural leg is already live inside xref (`passGitnexus`, line 264). When propagation-scan lands, `NAV_TRAVERSAL` swaps its xref call behind the same boundary — a one-file change. **(This timing decision survived all verifiers.)**

### Dropped (over-engineering the verifiers confirmed)
- lens5 per-surface **circuit-breaker** state machine — xref already fails-closed in-process; no flapping-remote failure mode exists.
- lens5 **6-phase migration controller** — its job was to retire direct xref callers; converged design keeps them, so it has no job.
- lens3 **MASTER_NAV_INDEX** (new SQLite schema + 4 FTS5 tables + deterministic rebuild) — ~400–600 eng-hrs to *duplicate* retrieval infra `search-index.db` already provides. Violates wrap-don't-duplicate.
- lens3 demoting `xref-query` to a "thin adapter" — destabilizes a shipped, tested surface for zero gain.
- lens4 hardcoded **17 sectors** — graph has **14** (verified).

---

## 2. Adversarial verdict — ALL 3 AXES `holds=false`

### AXIS 1 · completeness-claim → **FALSE (the central lie)**
The live engine **truncates every modality** and has **no total-match count anywhere**:
`FTS5 LIMIT 30` · `graph slice(0,20)` · `spectrum slice(0,20)` · `gitnexus --limit 8` · `merge slice(0, top=10)`.
A "CoverageReceipt" computed over a BM25-ranked top-N prefix **cannot honestly claim a surface was "exhausted"** — and the wrapper doesn't even *know* how many it missed (no `COUNT(*)` over the FTS5 MATCH). "Guaranteed structural" is a **1-hop, top-8, 30s-timeout-killable sample** — the exact severity-laundering pattern from `[[delta-gate-severity-laundering]]`: a strong word ("guaranteed/provable") welded to a weak, partition-able mechanism. The HMAC signs the *truncated result set*, not the *completeness claim* → tamper-evidence for the wrong property.

**Must-fix:** drop the word "exhausted" OR make it true — add a per-surface `{returned, totalMatched, truncated}` (real `COUNT(*)` for FTS5, uncapped counts for graph/spectrum/gitnexus); re-label the "guaranteed" tier as "1-hop neighborhood, bounded, may be DOWN"; emit calibrated modalities as `recallBound: null, confidence: 'unmeasured'` (a null bound, not a guessed float with a low-confidence flag); report a fail-soft empty (`catch {}` at xref:172) as "surface errored, recall=0, UNKNOWN" — never "searched, nothing found."

### AXIS 2 · structure-propagation → **FALSE (the edges are broken)**
- **`XREF_QUERY` is not a graph node.** XREF-01 landed as *code* in Wave 1a, **never propagated into the self-model**. The design's first edge `XREF_QUERY → NAV_TRAVERSAL` wires from a nonexistent source — dangling edge / breaks the 124→128 arithmetic. *(Independently confirmed: no xref/nav/index node exists in the graph.)*
- **`NAV_RECEIPT` is a pure sink** (2 in, 0 out). The graph enforces return-flow: **111/273 edges are `is_return`**; every memory sibling has an explicit return edge. A sink is a structural defect, not cosmetic.
- **Fabricated invariant.** The "one section-tier root per sector" justification is FALSE: `operator_io` has 3, `control_plane` has 2, `pulse_cortex` has 2. Placement may still be right; the *reason* must not cite an invariant the graph contradicts.
- **Unreconciled sector seam.** The master build plan defines a `RET=Retrieval&Knowledge` area + an `OFM·XREF-00→05` migration whose step 4 is a planned **"sector rename in ONE motion"**. Landing NAVIGATION in `memory` now may strand it on the wrong side of that rename.
- **Edge schema mismatch** — proposed edges omit required `type`/`is_return`; live shape is `{source, target, type, is_return}`.

**Must-fix:** re-source the structural edge from real `GITNEXUS → NAV_TRAVERSAL` (drop the phantom XREF_QUERY edge) OR mint the XREF_QUERY node first (then math is 124→129); add `NAV_RECEIPT → NAVIGATION` `is_return:true` (edge count 273→**280**, not 279); strengthen RE-VERIFY from "degree ≥ 1" to "no sub/leaf node is a pure sink"; specify `type`+`is_return` on every edge; bind the BUILD-MANUAL leg to a real file + name the renderer `_SYSTEM/Scripts/arch-graph-engine.mjs`; **get an owner ruling on the OFM sector-rename seam.**

### AXIS 3 · cost-value-timing → **FALSE (≈2× oversized)**
The live `xrefQuery` return **already carries ~70% of the receipt payload**: `structuralLegAvailable`, `gitnexus.{available,reason,stale,behind,indexedCommit,head}`, `counts.{fts5,graph,gitnexus,spectrum,candidates,merged,deduped,suppressed}`, `sublog[]`. The genuinely-new value is narrow: **(a)** sector/mechanism coverage math, **(b)** `honestGaps[]` for the not-indexed memory modality. The "exhaustion engine" guards a skip that can't happen (xref always runs all 4 passes). HMAC is theater in v1 (self-signed/self-verified; derived-from-repo key fallback = forgeable). **Phase 4 (graph mutation) is the most expensive step and buys the least** — the CLI works without a self-model node.

**Must-fix:** cut v1 to **Phase 0 (receipt types) + a thin Phase 2** (call xref → re-serialize its existing telemetry → add the missing sector/mechanism coverage from `node.sector` → append memory `honestGaps` → content-hash); **drop HMAC** (re-derivation against live indices *is* the tamper check); **defer Phase 1 intent-classifier + Phase 3 deepening** until a consumer needs them; **re-justify or defer Phase 4** on value, not just gate it; downgrade the mandate to v1 reality.

> Timing HOLDS across all three: build now on xref, don't wait for Wave-2. The defect is the **size and the honesty of the claim**, not the build-vs-Wave-2 ordering.

---

## 3. Owner gates (nothing mutates until these clear)
- **GATE-1 — graph mutation (Phase 4):** approve adding NAVIGATION + 3 children + edges to `yuri-graph-state.json` (124→128 nodes; edges 273→**280** after the NAV_RECEIPT return-edge fix), OR defer the node-add until the wrapper earns its place (code-only v1).
- **GATE-2 — OFM sector-rename seam:** does NAVIGATION live in `memory` permanently, or move when the retrieval-sector rename lands? (Structural seam the design silently crosses.)
- **GATE-3 — memory-wall (the lens2 gap):** is Track-B auto-memory ever indexed as a 5th retrieval modality? `yuri-origin` currently forbids the Track-A→Track-B dependency. v1 reports memory as not-indexed.
- **GATE-4 — recall calibration (the 2nd lens2 gap):** build the held-out eval corpus that makes calibrated recall bounds real, or explicitly defer (receipts stay `confidence: unmeasured`).
- **GATE-5 — gating vs advisory:** v1 ships NAVIGATION findings as advisory to `ENKI_INBOX`; wiring an energy/cortex veto on `!receipt.guaranteed.structural` is a separate gated change.

---

## 4. Recommendation (adversarial-ally call)
Ship the **minimal honest v1**: Phase 0 receipt types + thin Phase 2 wrapper that re-serializes xref's existing telemetry, adds sector/mechanism coverage + memory honestGaps, carries **real per-surface `{returned, totalMatched, truncated}`** counts, and content-hashes (no HMAC). **Rename away from "exhaustion" → "breadth-first audit with disclosed caps."** **Defer Phase 4 graph mutation** until the wrapper proves its keep — and resolve GATE-2 (sector-rename seam) before any node lands. This is the cheapest thing that delivers a completeness *receipt* without shipping a completeness *lie*.
