# AUTONOMOUS ORCHESTRATION MANIFEST — 2026-06-09 night run

> GROUND TRUTH for the autonomous multi-hour run. Marcel asleep; no human "continue" button.
> On ANY context reset: read THIS file → `node _SYSTEM/Scripts/yuri-nerve.mjs digest` → `node _SYSTEM/Scripts/yuri-total-recall.mjs` → resume at the first unchecked queue item. Branch must be `main`, pwd = repo root.

## Operating constraints (Marcel, 2026-06-09)
- BUDGET IS THE HARD CONSTRAINT: 17% of weekly used in first 14h. My (Opus) turns stay CHEAP — deterministic scripts, orchestration, verification only. HEAVY generation/analysis goes to DeepSeek-flash + Codex lanes (their compute, not my weekly).
- MAX 1 Workflow agent. Prefer EXTERNAL lanes (llm-lane deepseek / codex-offload-runner) over Agent/Workflow fan-out.
- Constant back-and-forth with lanes: dispatch → verify against source → integrate → dispatch next. I am the lead engineer/orchestrator + verifier + integrator.
- Generate-from-node IS the guide source of truth AND ship real skills — BOTH.
- No commit/push without owner approval (e60e3f91 was the last approved). Stage work; do not push.
- Lanes hydrated/equipped; Codex never sandboxed. Gemma drip STOPPED (superseded by me + lanes).

## Lane invocation (direct runners — the `ai` wrapper AggregateErrors; do NOT use it)
- DeepSeek: `node _SYSTEM/Scripts/llm-lane.mjs deepseek "<prompt>" [--reasoning d] [--out FILE] [--dry-run]`
  - model resolves to deepseek-v4-pro / deepseek-v4-flash (flash = cheap/fast; see P1 fix status below)
- Reindex: `node _SYSTEM/Scripts/yuri-search-index.mjs`
- Resume tools: `yuri-nerve.mjs digest` (afferent open work) · `yuri-total-recall.mjs` (salience recall over git+nerve)

## WORK QUEUE (dependency-ordered; check off as completed; update STATE per item)
- [~] P1  llm-lane robustness — PARTIAL. Diagnosed: (a) "AggregateError" is intermittent undici keep-alive socket reuse vs api.deepseek.com (NOT flash-specific — pro fails identically; network/key/API all verified 200). FIXED w/ in-process retry + `Connection: close` (kills stale-socket reuse) + top-level rejection→clean-fail handler + process-level retry wrapper `lane-dispatch.mjs`. (b) DEEPER UNFIXED: deepseek-v4-flash is a REASONING model — returns output in `reasoning_content`, leaves `content` EMPTY for substantive asks (tiny "say ok" works; a JSON guide comes back empty even at --reasoning high). llm-lane reads `.content` only → empty output. REAL FIX (later): llm-lane should fall back to reasoning_content OR bump max_tokens for reasoning models OR use a non-reasoning model for structured extraction. UNTIL FIXED: lanes are unreliable for substantive generation → I author precise work directly; reserve lanes for when the content-extraction is fixed. Banked: llm-lane.mjs retry, lane-dispatch.mjs, llm-lane.test.mjs stale-nemotron-alias fix (suite green).
- [ ] P2  Organ guides → nav-layer skills (BOTH node-guide source + real skills):
        - [ ] P2a  Define `mechanism.guide` schema on canonical nodes (_SYSTEM/yuri-graph.json)
        - [ ] P2b  Author/verify 8 organ guides source-grounded (exports hard-gated vs real `export`s)
        - [ ] P2c  Register MISSING node: yuri-nerve (shipped e60e3f91, never registered)
        - [ ] P2d  Build projector yuri-guide-project.mjs: canonical node.guide → .claude/skills/organ-<id>/SKILL.md (generated, back-ref)
        - [ ] P2e  Run projector → skills emitted + verify frontmatter + Session Notes
- [ ] P3  Full propagation: propagation-scan on changed nodes → graph-unify project → reindex (CIRCUITRY-CHANGE-PROPAGATION law)
- [ ] P4  CAPSTONE: circuitry die 110→200+ nodes regenerated:
        - [ ] P4a  circuitry-auto-register.mjs — auto-register all tools/tests/scripts into the wiring
        - [ ] P4b  build-chip-die.mjs — regenerate the die at 200+ nodes
        - [ ] P4c  verify die viz + node count + run circuitry test suites
- [ ] P5  Code Bible (#4) scaffold — curated world-class code bank, mechanism-tagged, FTS5 recall (dispatch to lanes)

## 8 ORGANS + ground-truth exports (the hard verification gate for P2b)
- formula-foundry: classifyDimension,dimensionsCompatible,catalogFormulas,coverageReport,composeCheck,composableTargets,composeOperatorSequences,synthesizeFormulaCandidates,draftFormulaBankCard,proofPreflightCandidate
- formula-foundry-bakeoff: stableHash,PROMOTION_LADDER,readLedger,appendGateRecord,canPromote,promote,demote,stage0Intake,stage1Fixtures,stage2Counterexamples,stage3RealData,runBakeoff
- openprocess-pool: OPEN_PROCESS_TYPES,OPEN_PROCESS_STATES,DEFAULT_WEIGHTS,staleness,openMass,rankPool,poolTotal,categoryPools,whatIsUnfinished,navigateCentrality
- lane-telemetry-cockpit: readTelemetry,summarizeByTrace,renderCockpit
- discovery-precision-gate: discoveryPrecisionGate,withNavigate
- filing-assessor: ZONE_RULES,classifyArtifact,assess,stalenessScore,assessAll
- yuri-decode: decode
- yuri-nerve: NERVE_KINDS (only export; real surface recordEvent/organStateDigest is CLI-dispatched — NOT exported)

## DECISIONS LOCKED
- Guide storage = generate FROM canonical graph node (Marcel chose, 2026-06-09). Node is source of truth; skill is generated projection. PLUS author real skills (Marcel: "we are also making skills").
- Gemma overnight drip STOPPED (superseded). Its one done draft (formula-foundry) validated 100% on exports — kept as cross-check only.

## DIE CAPSTONE — STATUS (2026-06-09, with Marcel live)
- UNIFIED DIE SHIPPED: the chip die now renders the ENTIRE system (all 244→242 nodes after scrap), not just the 120 mechanism nodes. Marcel: "the entire system represented on it, not just dies but other rendered components placed on purpose, nothing random."
  - `projectDie()` added to yuri-graph-unify.mjs (the ONE projector — flow/mechanism/die views; folded in after Marcel flagged a parallel build-die-graph.mjs file → deleted it). Emits yuri-die-graph.json (all tiers, die schema, kind:die|peripheral, sector→layer). build-chip-die + adversarial-check read it.
  - 116 mechanism → kind:'die' (silicon blocks); 124 flow → kind:'peripheral' (board components by sector).
  - FLOORPLAN FIXED (the overlaps): K1D-tiers sub-ring cap was 3 → crammed dense layers past ARCSEP at 244 → overlaps. Uncapped (≤12) + bumped RSEP(1.26)/ARCSEP(1.86). adversarial-check 14/14 PASS, deterministic (byte-identical rebuilds). canvas 6506².
  - Stale-assertion fix: adversarial-check Self-Improvement band was n===3 (frozen) → now asserts band===2 placement, count-agnostic.
  - Scrapped stale nodes (Marcel OK'd): weekly-comp, weekly-consolidation (canonical 244→242). KEPT filing-assessor (live organ).
  - K1-floorplan.mjs/buildFloorplan = SUPERSEDED old engine (die uses K1D-tiers); its test fails on stale LAYER_ORDER — left as-is (dead path; candidate for archival during the rework). My patch to it broke it → reverted.
- NEXT (DIRECTION LOCKED by Marcel): VISUAL+PERF REWORK of the renderer. Layout STAYS (he likes it). 
  - Perf-first: SERVER-BAKE the SVG (he opens the HTML via file://, NOT localhost — current die builds itself with 321 appendChild + per-cell photoreal QFN = ~20-40 elements/cell ×242 + per-cell gradient/filter defs → that's the open-lag).
  - Visual target: CLEAN SCHEMATIC / BLUEPRINT — flat layer-colored blocks, thin orthogonal traces, dark grid substrate floor, minimal blur. (Lightest to render — perf + look reinforce.)
  - The rewrite = replace build-chip-die.mjs output half (lines ~447-1508: cyberpunk CSS + client-side construction) with a server-baked schematic renderer consuming the same payload. Keep pan/zoom + inspect + search interactions. Add `kind` to payload so peripherals render distinctly.

## RENDERER REWRITE — DONE (2026-06-09, Marcel directed + greenlit)
- build-chip-die.mjs REWRITTEN: cyberpunk client-side renderer (1516 lines, 321 appendChild, photoreal QFN ×242 + per-cell gradients/filters + blur) → SERVER-BAKED SCHEMATIC (the SVG is a string built in Node, shipped static in the HTML). PERF: 321 appendChild→0, blur→0 (opens via file:// by PARSING, not constructing). Payload/floorplan/PCB-router preserved verbatim; dropped the unused M1/M4 material math (cleaner).
- AESTHETIC: clean schematic/blueprint — flat layer-colored cells (die=solid, peripheral=dashed outline), thin net-colored traces, dark blueprint GRID substrate floor, SF Pro/Helvetica fonts (Marcel: ditched serif/mono). Kept pan/zoom + click-inspect panel + search. Deterministic (byte-identical). 14/14 adversarial-check clean.
- Simplified away (vs old): minimap, layer-filter chips, the heavy decoration (EUV plasma, moat backlight, aurora, seal/fiducials, per-cell QFN leads/cavities/silkscreen). If Marcel wants any back, add lean.
- NEXT (Marcel's iteration): he opens the HTML, reacts; polish trace density / label spacing / color balance / peripheral visual from there.

## LAUNCH RUNWAY (Marcel 2026-06-09: "end phase — launch YURI comfortably in <2 weeks with proper docs, guides, visuals")
- [ ] BIG-1  THE YURI PAPER (upgrade, flagship) — rewrite _SYSTEM/reports/energy-landscape-paper-2026-07/ from a
        narrow ENERGY-LANDSCAPE paper into the COMPREHENSIVE YURI paper covering ALL functionality top-to-bottom.
        THESIS (Marcel's words): "let LLMs use mathematics and formulas so they can become more reliable and safe
        to use, even when you're away." + upgrade energy-landscape-dashboard.html into the full-system dashboard.
        Current structure (narrow): section-1-premise · 2-gap · 3-proposal · 4-reference-implementation ·
        5-honest-limitations · 6-open-questions + dashboard + evidence/cert packets (all about the energy gate).
        PROPOSED new structure (top-to-bottom YURI, thesis-driven — get Marcel's react before writing):
          1. Abstract/Thesis — math+formulas make an unsupervised LLM reliable+safe.
          2. The problem — fluent-but-unverified LLMs drift/hallucinate/over-reach when unattended.
          3. The YURI thesis — a MATHEMATICAL operating layer that GUIDES the LLM (not agentic) + governs work-dynamics.
          4. Top-to-bottom system (each = "math making the model safer"):
             energy gate / Lyapunov work-dynamics (existing core) · Formula Foundry (dimensional typing + proof gate,
             the legal-move generator) · nervous system + total recall (continuity as math) · navigation layer + organs
             + the unified graph/die (the system as a navigable deterministic map) · cross-domain transfer +
             domain-blind candidate domains · discovery/precision + filing + protected-path gates (safety as math).
          5. Reliability+safety story — how each layer cuts hallucination/drift/risk when the operator is away.
          6. Honest limitations + open questions (keep + expand the existing).
          7. Reference implementation — the live YURI system (link the organs/skills/die).
        NOTE: YURI is NOT agentic (it GUIDES Claude via structured context + governs via the Lyapunov energy fn) —
        keep that framing (see [[feedback-yuri-not-agentic]]). Paper voice = publication (no filenames/paths/process —
        see [[feedback-publication-voice-no-internals]]); the dashboard can show internals.
- [ ] BIG-2  Docs + guides + visuals pass for launch (the organ skills are a start; needs operator-facing docs).

## STATE LOG (append newest at bottom; this is the resume cursor)
- 2026-06-09 ~03:35  Session woke. Guard PASS (main, repo root). Nerve=11 open. Gemma drip killed. Recon done. Manifest written. Starting P1.
- 2026-06-09 ~04:25  MAJOR INCREMENT SHIPPED + VERIFIED (all deterministic, no commit/push — owner gates that):
    P2 DONE — Navigation Layer (generate-from-node + real skills, Marcel's both-not-either): authored 8
      SOURCE-GROUNDED organ guides → _SYSTEM/organ-guides.json → yuri-guide-seed.mjs writes node.mechanism.guide
      onto canonical (export-MATCH HARD GATE: each guide's exports verified vs live `import` — refuses drift) →
      yuri-guide-project.mjs emits .claude/skills/organ-<id>/SKILL.md (8 skills, LIVE in the registry now).
      yuri-nerve REGISTERED as canonical node 244 (was unregistered since it shipped e60e3f91). Pipeline idempotent.
    P3 DONE — full propagation: yuri-graph-unify project regenerated both views from canonical (flow 128, mech 120);
      nerve + 8 guides now in the die's input graph (02_RESOURCES/RESEARCH/yuri-circuitry-graph.json).
    P4 DONE (core) — DIE CAPSTONE REBUILT: build-chip-die.mjs → yuri-chip-die.html, 120 cells placed (incl yuri-nerve
      organ), 11/13 adversarial-checks PASS. Fixed MY bug en route: nerve had invalid layer "Memory & Continuity" →
      corrected to "Memory & Subconscious" (valid moat layer, matches sibling openprocess-pool); made seed upsert
      newNode core fields idempotently so the fix propagated.
    P1 PARTIAL — llm-lane robustness: AggregateError is intermittent undici keep-alive socket reuse (NOT flash-specific;
      pro fails same; net/key/API verified 200). Fixed: in-process retry + Connection:close + top-level rejection→clean-fail
      + process-level retry wrapper lane-dispatch.mjs + stale nemotron-alias test fix (suite green). LANES CONFIRMED USABLE:
      flash AND pro return clean structured `content` at finish=stop (tested {"sum":4} JSON). The big-preloaded-source
      guide extraction failed earlier on transport-blip + payload size, NOT model content — keep lane prompts SHORT/scoped,
      use --light + the wrapper. No deeper llm-lane code fix needed.

## NOT-MINE — owner decisions / pre-existing (do NOT auto-fix)
- DIE FLOORPLAN: 2 adversarial-checks FAIL (bbox-overlap memory-kernel↔memory-relocator + fsrs↔nexus-numerology;
  Self-Improvement band asserts n===3 but graph has n=4). VERIFIED these checks are NEWLY ADDED by a PRIOR session
  (absent from committed adversarial-check.mjs; present only in its uncommitted +120/-48 diff). The prior session was
  hardening the die validator + mid-refactoring K1D-tiers/laplacian to satisfy it — UNFINISHED. None involve my nerve
  node. Owner: finish the floorplan refactor OR relax n===3 to current count. K1-floorplan.test also fails (same cause).
- REINDEX (yuri-search-index.mjs): consistent bare AggregateError at RUNTIME (better-sqlite3-based, pure-local, no net).
  Module loads fine; fails during indexing. NON-BLOCKING (new skills are live via frontmatter, not FTS5). Node v25.9.0
  is bleeding-edge — suspect native-binding/parallel-read. Separate issue; not chased (budget). FTS5 corpus is stale.

## MORNING BRIEFING (Marcel) + EXACT RESUME (fresh-me)
RESUME STEPS: (1) guard pwd=repo root + branch=main. (2) read THIS file. (3) `node _SYSTEM/Scripts/yuri-nerve.mjs digest`.
(4) `node _SYSTEM/Scripts/yuri-total-recall.mjs`. (5) `git status --short` to see this session's work (uncommitted — NOT pushed).
WHAT TO REVIEW: the 8 .claude/skills/organ-*/SKILL.md (source-grounded nav guides), _SYSTEM/organ-guides.json (the editable
guide source), the regenerated yuri-chip-die.html (open in browser to see nerve on the die). To regenerate the whole chain:
`node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-graph-unify.mjs project --stamp <date> && node
_SYSTEM/Scripts/yuri-guide-project.mjs && node 02_RESOURCES/RESEARCH/circuitry/build-chip-die.mjs`.
REMAINING PLATE: P5 Code Bible (curated world-class code bank — lanes now usable for this, keep prompts short); the
prior-session die floorplan completion (owner); reindex fix (separate). LANE DISPATCH for the night:
`node _SYSTEM/Scripts/lane-dispatch.mjs flash "<short scoped prompt>" --light [--out FILE]` (process-level retry built in).

- 2026-06-09 SESSION WRAP: Navigation Layer (8 organ guides→nodes→skills, tested) + full propagation + DIE CAPSTONE fully reworked with Marcel live → server-baked SCHEMATIC chip die rendering ALL 242 unified nodes (canvas 3386², facing-rotation, region tints+labels, node-anchored card, ego-network animated directional flow, compact grid layout no-void, rim pulled in). 17/17 nav tests + die K1D-CLEAN. Committing+pushing (owner-authorized). NEXT: BIG-1 the YURI paper (see LAUNCH RUNWAY).
