---
name: session-resume-2026-06-04-circuitry-instrument
description: "DIRECT-CONTINUATION resume (2026-06-04 EOT): build the polished CHIP-DIE CIRCUIT BOARD circuitry instrument. Spectral organic atlas REJECTED by Marcel ('horrible, not the circuit board'). Engine + shell + manual + backup all done; hero = the chip-die, interactive."
metadata:
  node_type: memory
  type: project
  tier: working
  scope: main
  trig:
    - resume
    - continue
    - circuitry
    - circuit board
    - chip die
    - visualization
    - viz
    - instrument
    - where we left off
    - next session
  refs:
    - "[[feedback-circuitry-visual-is-chip-die]]"
    - "[[circuitry-change-propagation-continuity]]"
    - "[[coding-excellence-corpus]]"
    - "[[bug-bounty-corpus-location-schema]]"
  originSessionId: ac838f3b-aa39-4793-9049-6c32b65bdb31
---

GOAL: a POLISHED interactive circuitry visualization that helps understand + actively TRACK YURI mechanically (not guess). WHO: Marcel (owner). WHEN: 2026-06-04 EOT → direct continuation in a fresh session. WHERE: `02_RESOURCES/RESEARCH/circuitry/`.

## ⚠️ COURSE-CORRECTION — READ FIRST (Marcel 2026-06-04)
The spectral ORGANIC ATLAS render is **REJECTED** ("the design is horrible and not even close to the circuit board we got going on"). The visual target is the **CHIP-DIE CIRCUIT BOARD** — like `02_RESOURCES/RESEARCH/yuri-circuitry-chip.svg` (the phone artifact Marcel LOVED): orthographic die-blocks, orthogonal Manhattan traces, silicon-floorplan feel, gold moat region. Build THAT as the hero — interactive + polished. The spectral atlas is at most a secondary toggle (reconsider if it earns a place at all).
**The determinism math is NOT wasted:** it feeds the chip-die via GORDIAN region-constrained quadratic placement (determined within-block cell order) — determinism lives UNDER the circuit-board aesthetic, it does not replace it with a blob.

## BROADER CONTEXT — THE MOAT (don't scope in too hard, Marcel 2026-06-04)
The circuitry instrument is NOT a standalone viz — it exists to make **the MOAT visible + mechanically trackable** ("the moat made visible" is the framing; the gold = the moat core). The bigger operation is **[[moat-activation-4track-2026-06-03]]**: YURI's defensible core = the work-dynamics **energy instrument** + the **cognition / brain-dump-decode** engine + **governed memory**. State: T1 energy→enforcing ✅ · T2 claim cortex ✅ · T4 subconscious ✅ · **T3 MUSUBI ONE packaging spec = STILL PENDING** (now also carries the OpenClaw install-time **write-path portability** requirement added this session) · then the **CAPSTONE: deep red-team on the YURI CODE** (logic flaws, invariants, races, the energy math, memory governance, the breaker). Don't tunnel on the circuit board alone — the viz SERVES the moat; "understand + actively track YURI mechanically, not guess" IS tracking the moat's health. Keep both threads live: build the instrument **and** hold the moat op (T3 + CAPSTONE) in view.

## NEXT — fresh session, in order
1. **Build the CHIP-DIE CIRCUIT BOARD interactive lens.** K1 floorplan blocks+cells (✅ verified, deterministic) + K2 orthogonal routing **patched via the ELK card** (segment-ordering DAG + Kahn topo-numbering → fixes the verified hub-overdraw) → emit interactive HTML. **REUSE the shell** from `circuitry/build-circuitry-instrument.mjs` (Nexus CSS + pan/zoom/pinch/minimap/detail-panel/search/moat-spotlight/chips/keyboard — all built + security-hardened); **swap ONLY the render half** (spectral nodes/hulls → die-blocks + cells + orthogonal traces). Match/exceed `yuri-circuitry-chip.svg`.
2. **Polish to outstanding** — orthogonal traces in channels, die-block labels, gold moat block, lane-separated wires, the real silicon feel. This is the "circuit board."
3. Optional: GORDIAN determined within-block placement; spectral atlas as a 2nd toggle IF it earns it.
4. **Inspect mode** (1-hop ego, hardened spec — see manual §7) + **live-pulse** (PostToolUse stamps `circuitry-live.json`, page polls → decay-glow).
5. **Obey the CONTINUITY LAW** on every change: graph → viz/engine → BUILD-MANUAL → reverify → `ai reindex` ([[circuitry-change-propagation-continuity]]).

## DONE THIS SESSION (verified, reusable)
- `circuitry/laplacian.mjs` — ✅ spectral engine **7/7 verified** (clean-room TQL2 eigensolver, deterministic, component-aware: real graph = 25 components/giant 55/28 orphans, Fiedler λ₂=0.0289). REPURPOSE for GORDIAN chip placement, NOT the blob.
- `circuitry/build-circuitry-instrument.mjs` — interactive HTML generator. Its **SHELL is the reuse donor**; its spectral render is the rejected part. (Emitted `yuri-circuitry-instrument.html`.)
- `circuitry/BUILD-MANUAL.md` — the construction spine: data contract, determinism law, **provenance map §5**, two lenses §6, inspect §7, **security contract §8**, decision log §9, consistency rules §11 (incl. the continuity-propagation law), build log §12. KEEP CURRENT.
- **K1 floorplan packer** ✅ verified (`/tmp/phone-viz/kernels/K1-floorplan.mjs`) — THE circuit-board base (3×3 concentric slot lattice, moat-centred, gutters=channels).
- **K2 router** ⚠️ hub-overdraw defect (`/tmp/phone-viz/kernels/K2-router.mjs`); fix = `02_RESOURCES/CODE-BIBLE/mechanisms/orthogonal-edge-routing.md` (ELK method, EPL study-only/clean-room).
- **`yuri-circuitry-chip.svg`** (on main, `02_RESOURCES/RESEARCH/`) = the AESTHETIC TARGET to match/exceed.
- CODE-BIBLE: 6 cards (catmull-rom, convex-hull, cytoscape-ego, ELK routing, laplacian-eigensolve, semantic-zoom). `circuitry-layout-theory-2026-06-04.md` = cited theory (spectral/GORDIAN/Sugiyama/orthogonal). Security contract §8. Memory backup LIVE (private repo `yuri-vault`, `3855c6f`).

## LESSON
Lead with Marcel's loved artifact's AESTHETIC (chip-die circuit board), not a theory-driven alternative (spectral blob). The math serves the chosen look; it doesn't pick it. [[feedback-circuitry-visual-is-chip-die]]

SEE: [[feedback-circuitry-visual-is-chip-die]] · [[circuitry-change-propagation-continuity]] · BUILD-MANUAL.md §6 · [[moat-activation-4track-2026-06-03]] (T3 OpenClaw write-path portability added this session)
