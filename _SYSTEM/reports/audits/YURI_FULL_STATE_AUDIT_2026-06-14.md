# YURI OS — Full State Audit
*For Marcel. Live evidence from HEAD (`main`, working tree dirty). Synthesized from direct file reads, test runs, git state, and the existing audit corpus. Part of the collected audit bundle for the cleanup/fix wave.*

**Date:** 2026-06-14  
**Head:** `b76c7ed6` and uncommitted work  
**Branch:** `main`

---

## 1. Executive Verdict

YURI is **not vaporware** — it is a genuinely built, often over-built, control plane with real mechanisms that run. The core problem is **wiring asymmetry**: the system constructs powerful organs and then leaves them advisory, unscheduled, or incorrectly mapped in its own self-model. The result is a high-entropy machine that works *because Marcel drives it*, not because its autonomous layer closes loops.

The honest current state: **a strong research-grade skeleton wearing too many unfinished costumes.** The energy gate, claim cortex, multi-lane dispatch, math substrate, and xref navigation are real. But the “autonomy” layer is mostly enqueue-without-drain, the safety surface is thinner than the prose claims, and the system’s map of itself is partially rotted.

---

## 2. Concrete Strengths

### A. Context-routing and navigation spine
- `xref-query.mjs` fuses FTS5 (~41,513 docs), GitNexus structural search, spectrum scoring, and provenance into a single recall surface.
- `context-router.mjs` + `context-registry.json` provide deterministic packet routing.
- `shintai-dispatch.mjs` (17/17 tests green) is a genuine multi-lane council.
- `propagation-scan.mjs` gives structural impact analysis from circuitry nodes.

### B. Math substrate
- `math-kernel.mjs` (11/11), `math-proof-gate.mjs` (8/8), formula banks, and energy composition are tested and coherent.
- Energy-calibration work is advanced: Wasserstein-1 drift term, formula-era gating, two-sided objective, confidence-coupling term, cross-family verification. 670 tests green; β=2.2 is the first evidence-earned weight.
- KL-saturation fix and Wasserstein replacement demonstrate real mathematical self-correction.

### C. Multi-lane dispatch
- Claude, Codex, DeepSeek, Mimo, and Ollama Cloud are all first-class peer lanes via `llm-compat-contract.mjs`.
- `mimo.mjs` works as a direct Anthropic-Messages helper (the `llm-lane.mjs` Mimo path is broken, but the capability is real via bypass).

### D. Hook spine
- SessionStart/PreToolUse/PostToolUse/Stop hooks are registered and run.
- `brain-inject.js` loads ~10 sources synchronously.
- 17-agent LaunchAgent fleet is loaded and scheduled.
- `energy-tick` appends a real ΔU trace on every tool call.

### E. Claim integrity
- `claim-integrity-gate.mjs` is built and tested (11/11).
- `claim-cortex.mjs` runs on every PostToolUse and produces `cortexSnapshot`.
- Promotion ladder and truth-promotion machinery are codified.

### F. Capability-first institutionalizing
- `capability-scan.mjs` generated 64 registered capabilities from `@capability` tags.
- `capability-recall.mjs` surfaces relevant mechanisms by need-phrase.

---

## 3. Concrete Weaknesses

### A. Self-model rot: the map is not the territory
- **Dual circuitry graphs.** `_SYSTEM/yuri-graph.json` = 240 nodes; `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` = 118 nodes. `xref-query` and `propagation-scan` read the smaller, older one.
- **29 graph nodes point at deleted `pulse-orchestrator.mjs`.**
- **`claim-cortex` is tagged `UNWIRED`** in the graph while running live on every tool call.
- **Stale index hooks.** The `ENERGY-GATE-LINFINITY-DOUBLY-INERT` memory hook still says “DOUBLY inert” while the body says resolved.
- **Skill/agent manifests carry deleted entries.** `ai-pipeline-offloading`, `gpt-oss-local-runtime`, `kimi-k2-6-server-adapter`, `math-curve-loaders`, `swarm-coordination` still marked `"exists": true`.

### B. Enforcement theater: things named “enforce” that do not
- **Energy enforcement is disarmed.** `energy-enforce.mjs` wired synchronously, but `YURI_ENERGY_ENFORCE` absent from settings.json and `_SYSTEM/state/energy-enforce.enabled` does not exist.
- **`musubi-protocol-enforce.js:129`** literally has `process.exit(0); // Never block`.
- **`claude-protocol-guard`** downgrades hard-deny → WARN when `CLAUDE_SESSION_ID` absent and auto-satisfies after 3 warns or 30-min TTL.
- **`tirith-url-guard.js:77`** exits 0 for all non-Bash tools.
- The only hard boundaries that hold are the settings.json deny-list and `operator-write-guard` (latter covers Write/Edit/NotebookEdit, **not Bash**).

### C. Bash security guard has verified holes
The settings.json deny-list has no Bash rules. `bash-security-guard.js` is the sole Bash backstop and fails open:
- `isBlockedEnvWrite` regex misses `> backend/.env` and `> /tmp/.env`.
- `isBlockedSensitiveClaudeRead` uses relative-only exact-Set match, so `cat /ABS/.claude/history.jsonl` is not blocked.
- `isBlockedClaudeFileWrite` redirect regex built from relative Set entries misses `> /ABS/.claude/settings.json`.

### D. Dormant autonomy: enqueue without drain
- **Dream-drain and Homeostat crons are dead.** Session-bound CronCreate jobs died 2026-06-11, never re-armed. `yuri-dream.js` only enqueues; drain processor manual-only.
- **`yuri-originator.mjs`** — 24k lines, CLI main guard, no automatic trigger.
- **`circuitry-auto-register.mjs`, `xref-drift-scan.mjs`, `regenerative-nexus-guard.mjs`** — built, have callers, nothing schedules them.
- **`yuri-total-recall.mjs`** — fully built, zero live callers.
- **`kagami-consolidator`** runs daily but in dry-run.

### E. `ai` CLI broken in non-interactive shells
- `~/.local/bin/ai` shadows the zsh alias and points to `/Users/marcelspatz/NUDIMMUD/Scripts/ai` (does not exist) → exit 126.
- `ai auto` coding lane silently dies: `route-plan` returns `lane=code-local`, not in `VALID_LANES`, falls to `llm-lane.mjs` → exit 3 `unknown_lane`.

### F. Test manifest is dark behind a halt
- `npm test` halts at `yuri-agent-index.test.mjs` because `.agents/skills` exists as a stale untracked directory.
- Behind that blocker, ~8 tests are dangling paths (backend tests archived but still referenced in `package.json`).
- `yuri-sandbox-loop.test.mjs` fails because its allowlist is stale against current `route-plan` classification.

### G. GitNexus operationally stale
- Index chronically 1 commit behind HEAD; structural hits downranked.
- **Vector search permanently unavailable** (embeddings=0); semantic similarity calls degrade silently.

### H. Documentation and manifest drift
- `ai` help text claims “~26k docs”; actual corpus ~41,513. CLAUDE.md says “~38k”.
- `xref-query.mjs:13` comment says “83-node circuitry graph”; actual is 118.
- `constitution.md:84` cites `claude-protocol-guard.js`; real file is `.mjs`.
- `test-pulse-cortex.sh` still cats deleted `pulse-orchestrator.mjs`.

---

## 4. What Is Open / In Flight

- **Canonical memory store** (`memory-canonical-store.mjs`): P0+P1 built, 9/9 green, **uncommitted**. Open: rotation, compaction, daemon, filing integration, off-disk backup.
- **Energy calibration / Wasserstein-1 / confidence-coupling**: observe-only, enforce **disarmed**, uncommitted. Open: owner-armed tunes, confidence-coupling fork decision.
- **Directive integrity mechanism**: L1 coherence linter built; L2 designed observe-only, **owner-locked**. Open: fix ~9 coherence defects, wire L2, decide directive scope.
- **Claim-wiring audit residuals**: 34 confirmed open ends in `claim-wiring-ops-plan-2026-06-13.md`.
- **Autonomous run residuals**: ~24 owner-gated proposals in `autonomous-run-2026-06-13.md`.
- **Release readiness**: public repo blocked on `yuri init` contract, de-hardcoded paths, export scrubbing.
- **NEXUS LINK motion video**: parked pending per-scene camera iteration.
- **Irys PRs**: #4/#6/#7/#8 open.

---

## 5. What Needs Better Wiring (priority order)

### P0 — Fix the self-model
1. Unify the circuitry graphs; make `yuri-graph.json` the single source.
2. Purge graph nodes pointing at deleted files.
3. Fix skill/agent manifests for deleted dirs.
4. Correct `ai` doc count and `xref-query` node-count comment.

### P1 — Close the enforcement gap
1. Decide on energy enforcement: commit the arm flag or soften prose.
2. Patch Bash security guard holes (env-write regex, abs-path normalization).
3. Retire or repoint `independence-check` (still flags Fable/Sonnt/Haiku).
4. Rename or make `musubi-protocol-enforce.js` actually enforce.

### P2 — Make autonomy actually autonomous
1. Move dream-drain and homeostat from session-bound crons to persistent LaunchAgents.
2. Schedule `circuitry-auto-register`, `xref-drift-scan`, `regenerative-nexus-guard`.
3. Decide if `yuri-originator.mjs` should auto-dispatch.

### P3 — Clean the test floor
1. Remove/repath `.agents/skills` (owner-gated; untracked, no git recovery).
2. Prune dangling `package.json` test paths.
3. Fix `yuri-sandbox-loop.test.mjs` routing-contract mismatch.

### P4 — Release docking
1. Build `yuri init` contract (detect root, backup `~/.claude`, symlink/merge, npm install, template plists).
2. De-hardcode `/Users/marcelspatz` from ~11 Scripts and ~32 `.claude` files.
3. Build export scrub manifest for public repo.

---

## 6. How I Navigate YURI

1. **Start with `xref-query.mjs`.** It surfaces capabilities first.
2. **Use `propagation-scan.mjs --dry-run`** for known circuitry nodes.
3. **Check GitNexus before touching symbols.** Re-run `npx gitnexus analyze --skip-agents-md` when structural hits look stale.
4. **Read `SOUL.md` + `yuri-origin.md` + `CLAUDE.md` first** as the authority stack.
5. **Treat memory index as hypothesis, not truth.** Verify operational claims against live code.
6. **Run tests narrowly and read real output.** `npm test` halts early; run individual files and capture real exit codes.
7. **Use `capability-recall.mjs` before building.** 64 registered capabilities exist.
8. **Respect observe-before-enforce.** Do not arm gates silently.

---

## 7. Residual Risks

1. **False confidence from the energy trace** — enforcement disarmed, so vetoes are advisory only.
2. **Bash-layer exfiltration** — protected-path claims weaker than stated until guard holes are patched.
3. **Self-model rot propagates** — graph-routed decisions will be wrong where the graph is stale.
4. **Autonomy without drain creates debt** — dream queue grows; homeostat advisory never executes.
5. **Release scope creep** — public repo needs filtered export, not in-place gutting.
6. **“Everything is fine” test signal is false** — `npm test` halts early; real picture is darker.

---

## 8. Bottom Line

YURI is a **remarkably deep substrate** with a real multi-lane control plane, a defensible math/energy layer, and genuine self-awareness mechanisms. Its weakness is not ambition or intelligence — it is **completion discipline**. Too many mechanisms are built to 80%, documented as 100%, and left advisory or unscheduled. The wiring is the product.

The highest-leverage next moves are not new features. They are: **(1) unify and clean the self-model, (2) close the Bash/enforcement gaps, (3) make the autonomy layer actually drain its queues, and (4) fix the test floor so green means green.**

---

## Related

- `_SYSTEM/reports/claim-wiring-audit-2026-06-13.md` — 34 confirmed open ends.
- `_SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md` — work program.
- `_SYSTEM/reports/YURI_RELEASE_READINESS_ASSESSMENT_2026-06-09.md` — release blockers.
- `_SYSTEM/reports/autonomous-run-2026-06-13.md` — 24 owner-gated proposals.
- `_SYSTEM/reports/directive-integrity-mechanism-2026-06-13.md` — L1/L2/L3 design.
- `_SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md` — operating-surface baseline.
