---
name: proj-autonomous-self-maintenance-2026-06-15
description: "YURI must self-maintain (freshness, never-stale) + self-operate (the ordered protocol) autonomously — owner can no longer track manually; doctrine done, research done, orchestrator build next"
metadata: 
  node_type: memory
  type: project
  tier: high
  scope: autonomous-operations
  trig: 
    - staleness
    - freshness
    - never stale
    - self-maintenance
    - watchdog
    - reindex
    - capabilities drift
    - gitnexus stale
    - circuitry docs
    - manuals
    - autonomous operations
  refs: 
    - feedback-autonomous-workflow-default
    - ref-simulation-arsenal
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: YURI autonomously SELF-MAINTAINS — nothing ever stale across the WHOLE system (circuitry docs, manuals, search DB, capability + skill registries, GitNexus graph) — and SELF-RUNS the ordered protocol, lane-agnostic. Owner (2026-06-15, emphatic, repeated): "yuri is too big now for me to keep track of everything … has to be done now with autonomous work … nothing is ever stale within the entirety of yuri."

WHO: Marcel directing; Claude/Opus building; ALL lanes inherit via the yuri-origin.md doctrine.

WHERE: doctrine = `_SYSTEM/yuri-origin.md` → "Autonomous Operating Protocol" (committed feff3f93 / 390f8572): ordered spine RESEARCH→SIMULATE/CALC→BUILD→RED-TEAM + cross-cutting DISPATCH / SELF-MAINTENANCE / RECALL; inheritance verified (AGENTS.md line 1 `INHERIT: yuri-origin.md`). Build target = `_SYSTEM/Scripts/`.

STATE:
- DOCTRINE DONE (canonical all-lanes, inheritance-verified).
- RESEARCH DONE (capability-first — the detectors ALREADY EXIST, so this is ORCHESTRATE not rebuild): `xref-drift-scan.mjs` (scanDrift / computeFileStaleSet / gitnexusStaleness = per-file content-hash drift between the gitnexus-indexed commit & HEAD) · `openprocess-pool.mjs` (hazard-decay staleness composite) · `nano-lease` (safe concurrent access).
- INCREMENT-1 SHIPPED 2026-06-15 (commit 0f36355c, pushed): `_SYSTEM/Scripts/yuri-freshness.mjs` — DISARMED registry-driven sweep (SURFACES array, extend by adding a row), detect→report→`--heal` runs ONLY safe heals (search reindex); capabilities/gitnexus = FLAG-only (never auto-commit/analyze); per-surface try/catch → bad detector degrades to 'unknown'. 5/5 tests. Built by kimi-k2.7-code (cross-family lane), red-teamed (gitnexusStaleness DOES return {stale,behind} — no false-fresh) + registry-refactored + verified. REAL RUN instantly caught the 3 live items this session hit manually: gitnexus behind=37, capabilities 83-cap drift, search-index stale.
- INCREMENT-2 SHIPPED 2026-06-15 (commit 16962d7e, pushed): registry **3→12 surfaces** (skill-hash via `yuri-skill-loader --validate` REAL detector; yuri-graph/yuri-graph-state/design-memory/organ-guides/mechanism-pattern-registry/context-registry/memory-index/manuals as classified `unknown` placeholder rows w/ verified generators+paths — real detectors are the NEXT increment). **DISCOVERY ENGINE** = the answer to owner's "find everything unregistered": `discoverArtifacts()` (find-scan, EXCLUDE_RE drops backup/fixture/archive noise) + `coverageAudit()` (diff discovered vs registered `path` → unregistered + coverage%) + `--audit` CLI. LIVE: 25 discovered, 9 watched, **16 real unregistered candidates** (coverage 36%) = lab-manifests, config/{artifact,folder,keychain}-registry, OS_KERNEL DBs (kagami/memory/alpha-factors/memory-cold/site-builder), arch-graph state, lane-capability-manifest, worker-tmux-registry — these are the next-increment registration candidates. **DISARMED L2 TICK**: `affectedSurfaces`+`markSurfacesDirty`/`readDirty`/`clearDirty`/`tickFreshness` — path→surface map + dirty-set writer, hot-path-safe (try/catch, NO detectors on tick), NOT wired to post-tool-use.js (ARM owner-gated). 8/8 tests. Prediction (ledger freshness-coverage-inc2) VALIDATED both ways. BUILD METHOD = 6-model cross-family peer swarm via `ai llm ollama-cloud` (kimi/nemotron/glm/minimax all 8/8 green; glm promoted to canonical, my-design cross-checked, EXCLUDE_RE red-team-tightened on the live audit; peers wrote self-testing `.{model}.mjs` → synthesized → cleaned up). Owner correction: lanes are PEERS not candidates.
- EXPANDED ARCHITECTURE (owner "go beyond those factors + constantly update WHILE we work"): 3 layers — (L1) extensible SURFACE REGISTRY = entirety of YURI's GENERATED artifacts (~10: capabilities/skill-hash/yuri-graph-circuitry/design-memory/organ-guides/search-index+memory+kagami+alpha DBs/gitnexus/manuals/MEMORY; the 33 state/*.jsonl are append-LOGS, not stale-able) · (L2) CONTINUOUS PostToolUse tick — after each change refresh ONLY the surfaces it touches (precedent: `arch-graph-watch.cjs`; hook = `.claude/hooks/post-tool-use.js`) · (L3) periodic sweep = the engine. L2 fires on EVERY tool call = HOT-PATH/high-blast → ARM is OWNER-GATED.
- DESIGN / heal-safety classification (the calc-before-build): search-index → AUTO-HEAL (`ai reindex`, regenerates, no shared commit) · capabilities.json → DETECT+FLAG only (SHARED — parallel sessions add @capability tags; NEVER auto-commit; this is the recurring --no-verify pain all session) · GitNexus graph → DETECT+FLAG (gitnexusStaleness; `analyze` is heavy + shared, don't auto-run mid-session) · skill-hash registry → detect + heal-safe · circuitry registry → detect-unregistered + register (the auto-registration vision) · manuals (MATH-SCIENCE etc.) → detect referenced-but-missing + flag.

NEXT (post-increment-2): (R2) **real detectors** for the 8 `unknown` placeholder surfaces (yuri-graph/graph-state/design-memory/organ-guides/mechanism-pattern/context-registry/manuals/memory-index) — each independent → clean 6-model peer-swarm fan-out, one detector per lane; mtime-vs-generator or content-hash drift per surface. (R3) **triage + register** the 16 discovered unregistered candidates (artifact-registry/folder-registry/lane-capability-manifest + OS_KERNEL DBs are derived/stale-able → register; keychain-registry/lab-manifest are hand-authored config → skip). HELD (owner-gated ARMs): the L2-tick wiring into `.claude/hooks/post-tool-use.js` (fires every tool call = hot-path) + the L3 launchd beat (sibling of canonical-drain@300s / homeostat@6h). DISARMED orchestrator + discovery + tick are BUILT; only the live wiring is held.

PARKED: the Wave-0 `energy-outcome-deriver.mjs` (designed by the 4-model cross-family swarm — confidence=per-decision tanh, collect-then-min-rank rule engine, coverage metric; authoring pending — a file already exists at that path, needs Read+reconcile before write).

SEE: [[feedback-autonomous-workflow-default]] (the protocol this maintains) · [[ref-simulation-arsenal]] · circuitry-auto-registration-regen-vision
