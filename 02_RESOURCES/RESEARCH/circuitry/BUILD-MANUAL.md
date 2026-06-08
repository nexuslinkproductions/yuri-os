# YURI Living-Circuitry Instrument — Build Manual

> **Purpose.** The construction reference + provenance ledger + decision log for the circuitry instrument. Read this before extending the circuitry so it develops *consistently over time* instead of drifting. Every component records WHERE its mechanism came from (research finding / Code-Bible card / verified kernel) so nothing gets re-derived, re-guessed, or quietly broken. This is the spec the build conforms to — build *to* this manual.
>
> **Status legend:** ✅ built+verified · 🔨 in progress · ⏳ planned · ⚠️ has an open defect
>
> Companion docs: [circuitry-layout-theory-2026-06-04.md](../circuitry-layout-theory-2026-06-04.md) (the cited theory) · [../../CODE-BIBLE/](../../CODE-BIBLE/) (external mechanism cards) · [math-theory-transfer-catalog-2026-06-03.md](../math-theory-transfer-catalog-2026-06-03.md) (Card 4 = the shared Laplacian).

---

## 1. What it is

A single self-contained interactive HTML instrument that renders the YURI architecture as a **deterministic circuitry map** — *every organ in its own earned spot, never a random force-blob* (owner's hard requirement). Two spatial lenses over one graph, plus a focus mode:

- **FLOORPLAN lens — the HERO (Marcel 2026-06-04).** Cyberpunk chip-die: orthographic die-blocks + Manhattan-routed traces + gold moat block. THIS is the circuit-board aesthetic the instrument is for — match/exceed `../yuri-circuitry-chip.svg`. Build this first + polished.
- **ATLAS lens — secondary.** Spectral cartograph; every coordinate a solved eigenvector. The determinism ENGINE is verified + kept (it feeds GORDIAN chip placement), but the organic blob RENDER was rejected — demote / reconsider whether the view earns a toggle.
- **INSPECT mode** — click an organ → camera focuses → its 1-hop ego (micro-IO + neighbors) blooms.
- **LIVE pulse** — organs glow on real tool events (poll-a-file).

## 2. The non-negotiable laws (never break these)

1. **DETERMINISM CONTRACT.** Layout is a *pure function of the graph JSON*. No `Math.random`, no force-sim rest-state, no wall-clock. Same input → byte-identical pixels. Freeze: (i) edge type-weights, (ii) solver tie-break (lexicographic by node id), (iii) the eigenvector sign + orientation gauge. If a change can make two runs differ, it's wrong.
2. **LAYOUT BAKES AT GENERATE-TIME.** Heavy math runs once in Node; positions/paths are baked into the payload; the browser only renders + interacts + pulses. Never ship an in-browser layout solver.
3. **SECURITY CONTRACT** (§8) is mandatory — this is a diagram renderer, the most-exploited category in our corpus.
4. **MECHANISM-NOT-CODE.** External technique is studied + rebuilt clean; copyleft (ELK/EPL) is never copied. Provenance is logged here.
5. **MOAT CARRIES THE LIGHT.** The 3 moat layers (Energy&Math, Cognition&Persona, Memory&Subconscious) render centre + bright; commodity layers sit dim at the rim. The map *argues the moat thesis visually*.

## 3. Data contract (the single source of truth)

`02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` — **do not** hand-edit positions into it; it carries topology + prose only.

- **108 nodes:** `{ id, label, layer, files[], triggeredBy, description }`
- **171 edges:** `{ from, to, kind∈{calls,reads,writes}, description }`
  - **95 GRAPH edges** (`to` is a node id) → drive layout/routing.
  - **76 ARTIFACT-IO edges** (`to` is a file/state path) → panel + inspect-mode micro-ring only; **never** layout.
- **10 layers**, LAYER_ORDER (moat first): `Cognition & Persona · Energy & Math · Memory & Subconscious · Retrieval & Knowledge · Learning & Continuity · Self-Improvement · Governance & Safety · Skills & Orchestration · Token-Efficiency & Session · Hidden / Meta / Self-referential`.
- **MOAT_LAYERS** = {Energy & Math, Cognition & Persona, Memory & Subconscious}. Layer histogram: Energy&Math 36 (the central die), Memory 12, Retrieval/Skills 11, Token-Eff/Hidden 9, Governance 7, Cognition/Learning 5, Self-Improvement 3.
- **Status** derived from prose: `phantom` (no files / "PHANTOM"), `dormant` (UNWIRED/DORMANT/SUPERSEDED/…), else `live`.
- **Connectivity caveat:** 95 graph edges over 108 nodes ⇒ the graph is **disconnected** (a tree needs 107). Spectral must embed the *giant component* and place orphans/small components on a deterministic orbital rim (see §6).

## 4. Architecture / pipeline

```
graph.json ──► build-chip-die.mjs (Node, generate-time)
                 ├─ FLOOR = buildTierFloorplan() → core/moat/systems/rim bands [K1D-tiers.mjs]
                 ├─ TRACE = radial-orthogonal PCB router over ring-gap lanes   [build-chip-die.mjs]
                 ├─ bake  → inline payload {nodes, traces, blocks, meta}
                 └─ emit  → yuri-chip-die.html  (self-contained pan/search/panel shell)
                                              │
circuitry-live.json ◄── PostToolUse hook ────┘ (page polls → decay-glow)
```

## 5. Provenance map (what was picked from where) — **the consistency core**

| Component | Mechanism | Source picked from | License |
|---|---|---|---|
| **Shared Laplacian** `L=D−W` | type-weighted normalized Laplacian | theory §VLSI quadratic-placement + Card 4 (math catalog) | — |
| **NEXUS numerology channels** | bounded symbolic feature buckets (`gematria`, `digitalRoot`, harmonic ratios) | `MATH-SCIENCE-MANUAL.md` §10 + `nexus-numerology.mjs` | YURI-original |
| **ATLAS positions** | spectral layout ψ₂(Fiedler)/ψ₃ | theory §Knowledge-cartography (Hall 1970 / Fiedler 1973 / Koren 2005) | — |
| **Eigensolver** | dense symmetric TQL2 (tred2+tql2), sign-pinned | Code-Bible [symmetric-laplacian-eigensolve](../../CODE-BIBLE/mechanisms/symmetric-laplacian-eigensolve.md) ← ml-matrix | MIT (reimplemented) |
| **District coastlines** | convex hull → expand → centripetal Catmull-Rom closed | Code-Bible [d3-catmull-rom-spline](../../CODE-BIBLE/mechanisms/d3-catmull-rom-spline.md) + [d3-convex-hull](../../CODE-BIBLE/mechanisms/d3-convex-hull.md) ← d3 ; impl harvested from verified **K3** hull/catmull/collision | ISC (reimplemented) |
| **FLOORPLAN blocks** | concentric dependency-tier chip die, energy core + moat/systems/rim bands | verified kernel **K1D** (`buildTierFloorplan`) | YURI-original |
| **Intra-block placement** | GORDIAN region-constrained quadratic (upgrade from plain grid) | theory §VLSI (GORDIAN, Kleinhans 1991) | — ⏳ |
| **Trace routing** | radial-orthogonal PCB traces: source radial fan-out → arc lane in a ring gap → target radial fan-in, deterministic lane hash | build-chip-die.mjs + K2 invariant harness | YURI-original |
| **Pan/zoom/LOD + focus transition** | viewport transform (k,x,y) + tweened transitions + semantic zoom | Code-Bible [semantic-zoom-transform](../../CODE-BIBLE/mechanisms/semantic-zoom-transform.md) ← d3-zoom | ISC (reimplemented) |
| **INSPECT 1-hop ego** | neighborhood select + animated camera fit | Code-Bible [cytoscape-ego-focus-zoom](../../CODE-BIBLE/mechanisms/cytoscape-ego-focus-zoom.md) ← cytoscape.js | MIT (reimplemented) |
| **UX shell + design tokens** | Nexus "Forge & Thread" (`--nx-*`), pan/minimap/chips/moat/search/panel | phone generator `build-circuitry-html.mjs` (donor) | YURI-original |
| **Security hardening** | Map/null-proto, trust boundary, SVG-via-createElementNS, escape+`'` | bug-bounty corpus cross-ref (Mermaid/Kroki proto-pollution, DOM-clobber, SVG-XSS) | — |

## 6. The two lenses (detail)

**ATLAS — spectral** ✅ engine built+verified (`laplacian.mjs`, 7/7 self-checks: deterministic, no-mush, eigensolver-correct, Fiedler λ₂=0.0289>0, hulls closed) · ⏳ visual-tuning pending (see §12 punch-list)
- `buildLaplacian(nodes, graphEdges, typeWeights)`: symmetric `W` from the 95 graph edges, `kind→weight` (calls 1.0 · writes 0.8 · reads 0.6, symmetrized by max), `L=D−W`.
- Components: BFS. **Giant component → spectral** (`symEig(L_giant)`, ascending ⇒ col0=trivial, **col1=ψ₂=x, col2=ψ₃=y**). Orphans/small components → deterministic outer **orbital ring** (ordered by size desc then id) so they don't pollute the eigenvectors (Card 4 warning: near-zero entries on disconnected graphs are orphans, not boundary nodes).
- Gauge: `pinSign` each eigenvector (anchor max-|component| node positive) + deterministic orientation (moat centroid → fixed quadrant). Normalize to canvas with padding.
- Hulls: **per layer, giant-component members only** (clean coastlines); orphans render as rim markers excluded from hulls.
- Radii ∝ √degree (hubs read bigger).

**FLOORPLAN — chip-die** 🔨 `K1D-tiers.mjs`
- `buildTierFloorplan` (K1D, verified): concentric dependency-tier bands with 10 live layers plus the Energy core block. Self-Improvement now rides the SYSTEMS band. Current invariant: all 108 graph nodes produce cells; a missing cell is a hard build failure because the chip die must never silently drop a layer.
- `build-chip-die.mjs` trace router (verified): routes all 95 graph traces as radial-orthogonal copper through ring-gap lanes. The K2 harness remains the regression fixture for generic orthogonal routing invariants and hub overdraw.

## 7. INSPECT mode (1-hop ego, hardened) ⏳

Locked = **1-hop ego default**, accreting (shift-click) as a secondary layer on the same primitives. Hardened against the pre-build attack:
- **Ring 1 (micro, smaller scale):** the organ's `files` + artifact-IO reads/writes + trigger — terminal leaves.
- **Ring 2 (neighbors, peer scale):** graph-edge neighbors — drillable (click re-focuses).
- **Sector** Ring 2 by edge-kind (not a wheel); hemisphere split upstream/downstream; "+N" spill at hubs.
- Ego layout is **radial-deterministic, NOT spectral** (a star ego-graph is eigen-degenerate — corrected during the attack).
- Animated re-focus (clicked neighbor *becomes* centre) preserves the mental map; macro lens stays a dimmed ghost; context-ghosts `pointer-events:none`.
- Lens-agnostic: works identically from atlas or floorplan; returns to the lens you left.

## 8. Security contract (corpus-weighted, mandatory) ⏳

Diagram renderers are the top-exploited category in our local corpus (Mermaid/Kroki proto-pollution → stored XSS, HIGH-severity disclosed). Therefore:
1. **Map / `Object.create(null)`** for every node-id-keyed structure — never `{}` literals (kills proto-pollution; the phone fetch-html violated this, the generator didn't).
2. **Live-pulse file = trust boundary** — `circuitry-live.json` is hook-written from tool events (untrusted); intersect with the known 108 ids, **never render its raw strings**.
3. **All SVG via `createElementNS` + `textContent`**, never innerHTML string-concat for node content.
4. `escapeHtml` covers `& < > " ' /`.
5. **No data-derived string into `fill`/`style`/`href`** (CSP-bypass-via-color class).
6. Node ids stay `dataset` + Map, **never element-id** (DOM clobbering).
7. **Cap accretion + debounce polling + rAF-batch** (uncontrolled-resource-consumption = corpus class #4).

## 9. Decision log (ADR — why, so it isn't re-litigated)

- **Spectral, not force (D-001).** Owner: "determined, not random." Force-directed = seeded sim halting at a random local rest-state; spectral = the *unique global optimum* of `xᵀLx` (eigenvectors). Same spring physics, solved exactly vs simulated. K3's force version is *replaced*; its hull/collision code is *reused*.
- **Dual-lens hybrid (D-002).** Owner chose chip+atlas toggle over either alone. Both are the *same Laplacian* (spectral takes its eigenvectors; GORDIAN solves it under region constraints) — one `buildLaplacian` serves both + Card-4 clustering.
- **1-hop ego default (D-003).** Wayfinding/LOD; accreting is power-user shift-click. Survived the pre-build red-team with fixes (§7).
- **K2 routing rebuilt on ELK method (D-004).** Adversarial verify caught K2's greedy lane-stuffing overdrawing at hubs; ELK's segment-DAG+Kahn is the deterministic fix (clean-room, EPL never copied).
- **Build manual exists (D-005).** This file — anti-drift as the circuitry evolves (owner request 2026-06-04).
- **Chip-die circuit board is the HERO; spectral atlas demoted (D-006, Marcel 2026-06-04).** The spectral organic render was rejected on sight ("horrible, not the circuit board"). The visual target is the silicon-floorplan chip-die (`yuri-circuitry-chip.svg`). The spectral/Laplacian determinism math is KEPT — it feeds GORDIAN determined placement *under* the chip-die look — but it does NOT pick the aesthetic. Lead with the owner's loved artifact, not theory. See memory FB:CIRCUITRY-VISUAL-IS-CHIP-DIE.
- **xref/propagation organs wired into the self-model, mirroring siblings (D-007, 2026-06-05).** The three real scripts (`xref-query.mjs`, `propagation-scan.mjs`, `nemotron-dispatch.mjs`) existed on disk but were absent from both self-model graphs — and the circuit graph already implied an `XREF_QUERY→PROPAGATION_SCAN` edge from a node that didn't exist. Wired all three into BOTH graphs by reading a real sibling first and copying its exact shape (no invented fields): `LANE_NEMOTRON`←`LANE_KIMI`/`offload-contract`; `PROPAGATION_SCAN`/`XREF_QUERY`←`GN_QUERY`/`yuri-search`. The circuit-graph node-ids are the SCREAMING_SNAKE state-graph ids (`PROPAGATION_SCAN`/`XREF_QUERY`/`LANE_NEMOTRON`) by design — `propagation-scan` resolves a node by exact `id` match, so those ids are the functional contract that makes the cross-reference engine able to scan its own organs. Obeyed the change-propagation trigger end-to-end (graph→engine/test→manual→re-verify); reindex per §11 step 6.
- **Gemma local SLM lane is llm-compat, not old AI/offload/Kagami routing (D-008, 2026-06-07).** `gemma4:12b-it-qat` is the only active routed local model policy. `ollama-lane.mjs` is the local Ollama compatibility runner; it calls `ollama-adapter.mjs` for alias normalization and `lane-core-hooks.mjs` for energy ΔU, recall, evidence ledger, and docked-output pulse. Needle, Qwen, `gemma4:e2b`, and `gpt-oss` are compatibility/retired aliases only; they must not appear as active local policy choices in graph/manual routing.
- **Nexus Guard owns built-but-unwired circuitry graph alarms (D-009, 2026-06-08).** When a new core math module exists on disk and is documented in the math manual but absent from `yuri-circuitry-graph.json`, class G (`node-absent-from-graph`) is the authoritative alarm. The 2026-06-08 pass proved this on `_SYSTEM/Scripts/math/nexus-numerology.mjs`, then cleared it by adding the `nexus-numerology` node and real edges to `yuri-jaccard` and `yuri-token-expand`.

## 10. File map

```
02_RESOURCES/RESEARCH/
  yuri-circuitry-graph.json                 # data contract (topology+prose)
  circuitry-layout-theory-2026-06-04.md     # cited theory authority
  circuitry/
    BUILD-MANUAL.md                         # ← this file
    laplacian.mjs        🔨 spectral atlas core (buildLaplacian, symEig, spectralAtlas)
    K1D-tiers.mjs        🔨 concentric dependency-tier floorplan
    K2-router.mjs        🔨 deterministic orthogonal router
    build-chip-die.mjs   🔨 generator → emits yuri-chip-die.html
    build-circuitry-instrument.mjs ⏳ generator → emits the HTML
    yuri-circuitry-instrument.html ⏳ the shipped instrument
02_RESOURCES/CODE-BIBLE/mechanisms/*.md     # external mechanism provenance
.claude/hooks/ (or _SYSTEM)                 # ⏳ PostToolUse pulse-stamp → circuitry-live.json
```
(The phone artifacts `build-circuitry-html.mjs` / `yuri-circuitry*.svg` / `.html` are the **donor/reference** generation; the new build supersedes them.)

## 11. Consistency rules for future development

> **CHANGE-PROPAGATION TRIGGER — mandatory law (Marcel 2026-06-04).** The moment anything in YURI extends / changes / improves something the circuitry represents (an organ, mechanism, edge, file, or status), it TRIGGERS the full propagation — in order: (1) verify the change vs **live code**; (2) cross-reference the circuitry graph for what it touches + its siblings (the upgrade-propagation-engine substrate — one idea ripples YURI-wide); (3) update `yuri-circuitry-graph.json` + **regenerate the viz/engine**; (4) update THIS manual (provenance §5 / decisions §9 / build-log §12); (5) re-run determinism + invariant checks; (6) reindex xref/search (`xref-drift-scan` + `yuri-search-index`). Never patch the viz without the graph, never the graph without the manual. The circuitry is a *model of the live architecture* — if it drifts from reality it becomes a lie, so **the rigour IS the feature**, not overhead. **This same change→propagate→document discipline applies to ALL YURI aspects, not just the circuitry** (memory: FB:CIRCUITRY-CHANGE-PROPAGATION-CONTINUITY · PROJ:UPGRADE-PROPAGATION-ENGINE).

- **Extend, don't fork.** New views/features hang off the existing payload + shell. Add a lens? It bakes positions at generate-time like the other two.
- **Every borrowed mechanism gets a Code-Bible card + a row in §5.** No silent lifts.
- **Touch layout math → re-run the determinism check** (two runs byte-identical) + the no-mush/overdraw invariants. A non-deterministic layout is a regression, not a feature.
- **New rendered string → §8 review.** Especially anything from the live-pulse file or a future external graph source.
- **Update this manual in the same change** that alters architecture/provenance/decisions. Stale manual = drift.
- **Regenerate, never hand-edit** the emitted HTML or baked positions — change the generator + re-run.
- **VARIABLE node sizing — NOT one-size-for-all (Marcel 2026-06-04).** A node's visual mass (die-block / pin / diode size) scales with **how much that node does** — its weight, throughput, fan-out, centrality. Heavy organ → big block; tiny helper → small. **Principled, not hand-set:** `nodeSize = f(structural-analysis)` sourced from the architecture-graph engine (degree + spectral-centrality from card 4, betweenness/articulation from card 16, Forman-curvature from card 17 — see roadmap `02_RESOURCES/RESEARCH/yuri-math-engine-and-propagation-roadmap-2026-06-04.md` §3/§10.1). Add a `size`/`weight` field to the graph schema (today nodes carry only id/label/layer/files/triggeredBy/description) sourced from that engine; the renderer maps it to block dimensions. Wire when the architecture-graph engine ships (obeys the change-propagation trigger above).

## 12. Build log
- 2026-06-04 — manual created (D-005); spectral core in progress; K1 verified, K2 defect known + fix sourced, K3→spectral. Theory captured + cited; 6 Code-Bible cards deposited.
- 2026-06-04 — **COURSE-CORRECTION (D-006):** spectral atlas render rejected by Marcel; CHIP-DIE CIRCUIT BOARD is the hero. Built `build-circuitry-instrument.mjs` (interactive HTML generator) — its SHELL (pan/zoom/minimap/panel/search/moat/chips, security-hardened) is the reuse donor; its spectral render is swapped out next session for the chip-die (K1 blocks + K2/ELK orthogonal traces). Spectral engine kept for GORDIAN placement. EOT → direct continuation: [[session-resume-2026-06-04-circuitry-instrument]].
- 2026-06-04 — **`laplacian.mjs` (spectral ATLAS core) BUILT + VERIFIED** (7/7). Clean-room TQL2 eigensolver (control [[2,1],[1,2]]→[1,3]); component-aware (real graph = 25 components, giant=55, 28 orphans on a deterministic orbital ring); gauge-pinned (sign + moat-quadrant orientation); type-weighted L (calls 1.0/writes 0.8/reads 0.6); per-layer Catmull-Rom coastlines over giant members. Determinism + no-mush proven. First render confirmed the research's caveat: squared-wirelength spectral over-tightens the densely-coupled moat. **VISUAL-TUNING PUNCH-LIST (next pass, before "outstanding"):** (a) GORDIAN-style per-district spreading + legalization to declump the moat knot; (b) hull outlier-rejection / per-cohesive-cluster coastlines (kill spiky slivers + ballooned overlaps); (c) de-overlap district labels; (d) tidy the orphan ring (group-by-layer arcs). NOTE: SVG label escaping (`&`→`&amp;`) confirmed mandatory live — the debug render's XML parse error proved §8's escape rule on contact.
- 2026-06-05 — **xref / propagation organs WIRED into both self-model graphs (D-007).** Added 3 organs to the circuitry data contract (graph went **83→86 nodes, 153→155 edges**, GRAPH edges 77→79): `XREF_QUERY` (`_SYSTEM/Scripts/xref-query.mjs`, Retrieval & Knowledge — the unified retrieval surface) and `PROPAGATION_SCAN` (`_SYSTEM/Scripts/propagation-scan.mjs`, Retrieval & Knowledge — read-only cross-reference engine V1), with the real `XREF_QUERY→PROPAGATION_SCAN` (`calls`) edge that closes the prior "edge from nonexistent node" finding, plus `XREF_QUERY→yuri-search`; and `LANE_NEMOTRON` (`_SYSTEM/Scripts/nemotron-dispatch.mjs`, Skills & Orchestration — advisory external reasoning lane, DEV-ONLY, advisory-until-verified). The rich VISUAL self-model `_SYSTEM/yuri-graph-state.json` learned the same 3 organs (**124→127 nodes, 273→278 edges, 14 sectors unchanged**): `LANE_NEMOTRON` mirrors `LANE_KIMI` in `routing_lanes` (ROUTING branch-in → RESPONSE return); `PROPAGATION_SCAN` + `XREF_QUERY` mirror `GN_QUERY` in `code_intelligence` (`XREF_QUERY→PROPAGATION_SCAN`, `GITNEXUS→PROPAGATION_SCAN` structural leg, `PROPAGATION_SCAN→ENKI_INBOX` return so it is not a sink). **Verified:** both graphs parse; no dup id; every new node ≥1 edge + non-sink; `arch-graph-engine.test.mjs` 22/22 (LIVE shape re-snapshotted 127n/giant=116/11-isolated/255-realEdges); `lifecycle-gap-scan` 0 gaps; `xref-drift-scan` 86/86 pass drift=0; `propagation-scan PROPAGATION_SCAN|XREF_QUERY|LANE_NEMOTRON` all resolve + surface real mechanism-siblings (functional proof the circuit-graph edit took).
- 2026-06-07 — **Gemma 4 12B QAT local SLM propagated into llm-compat + self-model graphs (D-008).** Added `ollama-lane` + `ollama-adapter` to the circuitry graph and `LANE_GEMMA` to `_SYSTEM/yuri-graph-state.json`; updated stale `LANE_LOCAL` / `LANE_TRIAGE` / `LANE_GPTOSS` / `SVC_OLLAMA` graph metadata away from Qwen/GPT-OSS and into the Gemma-only local policy. `llm-compat.sh`, `llm-compat-contract.mjs`, `.claude/config/models.json`, local policy tests, and capability manifest now select `gemma4:12b-it-qat` for routed local roles. Verification must prove: graph parse/no dup ids, propagation-scan reaches `ollama-lane`/`LANE_GEMMA`, dry-run routes normalize retired aliases to Gemma, and Ollama reports the model installed.
- 2026-06-08 — **NEXUS numerology + Originator era circuitry propagated.** Nexus Guard correctly flagged `_SYSTEM/Scripts/math/nexus-numerology.mjs` as class-G `node-absent-from-graph`; graph now includes `nexus-numerology` plus real edges `nexus-numerology→yuri-jaccard` and `yuri-token-expand→nexus-numerology`. The graph is now **108 nodes / 171 edges / 95 graph traces / 76 artifact I/O edges**. `Self-Improvement` is a first-class SYSTEMS-band layer in `K1D-tiers.mjs`, `build-chip-die.mjs`, and the K2 real-graph smoke layout; this fixed the `c.band` crash caused by silently dropped Self-Improvement nodes. Regenerated `yuri-chip-die.html`: `cells=108 traces=95 blocks=11 canvas=4159x4159 live=103 dormant=4 phantom=1`. **Verified:** `regenerative-nexus-guard` class G cleared; `build-chip-die.mjs` writes cleanly; K2 router real graph routes 95/95 edges with no overdraw; K1D adversarial check proves floorplan coverage is 108/108 cells, `Self-Improvement` is in the SYSTEMS band, and package bounding boxes do not overlap; `nexus-numerology.test.mjs` and guard tests pass.
- 2026-06-08 — **WorkSubstrate + local Gemma tool-loop propagated.** `_SYSTEM/Scripts/yuri-originator.mjs` now exposes `create_work_substrate`, `candidate_actions`, and `launch_substrate` so front LLMs can hand lanes a compact launch substrate instead of a giant context packet. Local Ollama/Gemma launches gain a YURI-controlled JSON `toolRequests` loop for `xref_query`, `read_file`, `grep`, `list_dir`, and `propagation_scan` under WorkSubstrate allowed paths/actions; DeepSeek/Kimi/Nemotron continue through `llm-lane` native tools. Originator energy gates now arm `DEFAULT_MAX_LADDER_INVERSION_CAP` by default, so persistent high-severity claim inversions are rejected unless the caller explicitly opens compatibility mode. Verification must prove: originator tests pass, graph/registry JSON parse, launch_substrate planned smoke emits compact substrate + CandidateAction seeds, and the equal-magnitude `maxLadderInversion` transition rejects by default.
- 2026-06-08 — **Lane streaming telemetry + OpenProcess pool direction propagated.** Originator worker calls now use a live spawned child runner instead of blind `spawnSync`, emitting process start/heartbeat/stdout/stderr/process-exit telemetry and parsing adapter lane events. Ollama adapter chat calls can stream `/api/chat` chunks with `LLM_COMPAT_OLLAMA_STREAM_TELEMETRY=true`; final stdout remains parser-compatible while stream events flow into Originator telemetry. The local WorkSubstrate tool loop now uses operator/runtime tool budgets (`YURI_SUBSTRATE_TOOL_ITERS`, `YURI_SUBSTRATE_TOOL_REQUESTS`) instead of the earlier tiny fixed cap, and records `substrate.tool_iteration` / `substrate.tool_loop_exhausted`. Claude handoff now includes the Open Process Sum Pool: started-but-unclosed tasks, research, ideas, todos, skill work, and experiments become xref-grounded `OpenProcess` objects with mathematical open mass and closure evidence.
