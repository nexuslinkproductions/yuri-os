# YURI Claim-to-Wiring Integrity Audit — 2026-06-13

**Question answered:** Where does YURI *claim* a capability whose *wiring* does not hold up?
**Method:** 8-domain fan-out (16 agents: 8 finders + 8 adversarial verifiers, sonnet-pinned), every finding verified against **live HEAD code** with `file:line` evidence. Trackers, dated reports, graph annotations, and in-file headers were treated as hypotheses, not truth (per the standing live-recall rule). The verifier overturned 6 finder verdicts in both directions; only survivors are listed as open ends.
**HEAD at audit:** `8dffc7ee`. **Branch:** main.

---

## Verdict

The claims mostly **exist as code** — the gap is *wiring*, not vaporware. ~34 confirmed open ends across three structural diseases. The highest-order finding: YURI's **self-model drifts in both directions** — it labels dead things live and live things dead.

### The 3 diseases

1. **Graph rot / dual-graph split.** Two circuitry graphs exist and the nav tools read the smaller, older one.
   - `_SYSTEM/yuri-graph.json` = 240 nodes (viz / self-model).
   - `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` = 118 nodes (read by `xref-query` + `propagation-scan`).
   - 29 nodes still point at a deleted `pulse-orchestrator.mjs`; `claim-cortex` is tagged `UNWIRED` while running live on every tool call. For a system whose pitch is "the self-model is ground truth," the map ≠ the territory.
2. **Enforcement theater.** Several hooks named `*-enforce` / `guard` are advisory / fail-open / fail-silent by default. The only hard boundary that actually holds is the settings.json deny-list + `operator-write-guard` (file tools only). Prose says "BLOCKS"; committed config doesn't.
3. **Half-wired autonomic layer.** Enqueue without drain (dream), advisory without executor (homeostat), session-bound crons that died 2026-06-11, "continuous EOT" that never auto-fires. The persistent LaunchAgent fleet (17 agents) is up; the reflective loops depending on the 2 dead crons never close.

---

## P1 — claim is live-false (advertised capability that silently doesn't deliver)

| # | Open end | Evidence | Fix |
|---|----------|----------|-----|
| 1 | **`ai auto` coding lane silently dies.** route-plan returns `lane=code-local` for every code-change (the most common case); `code-local` isn't in VALID_LANES → falls to `llm-lane.mjs` → exit 3 `unknown_lane`. `llm-compat.sh` handles it via Ollama but `ai`'s `run_llm_lane` bypasses that path. | `_SYSTEM/Scripts/ai:800`, `llm-lane.mjs:481`, `llm-compat.sh:193`, contract `llm-compat-contract.mjs:551` | route code-local through OLLAMA_LANE_RUNNER, or add to VALID_LANES |
| 2 | **`ai` is broken in every non-interactive shell.** `~/.local/bin/ai` shadows the zsh alias and points to `/Users/marcelspatz/NUDIMMUD/Scripts/ai` (does not exist) → exit 126 in hooks / `bash -c` / subprocesses. research_pipeline.md says it "can always be invoked" — false. | `~/.local/bin/ai` (70-byte dead wrapper); `NUDIMMUD/Scripts/` missing | delete or repoint `~/.local/bin/ai` → `_SYSTEM/Scripts/ai` |
| 3 | **Energy gate doesn't block in committed config.** `energy-enforce.mjs` is wired synchronously, deny path complete, but `YURI_ENERGY_ENFORCE` absent from settings.json + flag file absent → every would-be deny is metrics-only audit. Brain says "BLOCKS." *(IS armed in the audit session via env var — not committed.)* | `energy-enforce.mjs:47-49`, `:107-119`; `CLAUDE.md:14` | decide: commit the flag (guarantee) or soften prose to "blocks only when armed" |
| 4 | **`gateClaimTransition` unwired.** Swap-immune/identity-aware claim veto has zero non-test callers; own header: "LIVE STATUS: no runtime caller." L∞ cap is a partial substitute; equal-magnitude swaps still pass. | `claim-cortex.mjs:868-874` | wire into tick path or drop the swap-immunity claim |
| 5 | **`discovery-precision-gate` unwired.** Scope + protected-path veto meant to run *before* the energy gate — zero importers, no hook. Pure design intent. | grep: 0 production callers; `autonomous-orchestration.md:40` | wire ahead of energy-enforce or mark design-only |
| 6 | **4 dangling slash-commands.** `/gpt-oss-local-runtime`, `/kimi-k2-6-server-adapter`, `/math-curve-loaders` declare `skill:` dirs that don't exist → Skill tool hard-fails. `/yuri-dna-ingest` points at the *wrong* skill (`non-destructive-infinity-guard`) + validator is archive-only. All 4 appear "live" in the session skill list. | `skill-manifest.json:497` `"exists":true` (false); `yuri-dna-ingest.md:8` | create skills or delete commands + manifest entries |
| 7 | **`/research` silently inert.** Prose only, no `skill:`/script; claims auto-route to deepseek-v4-pro/flash but `/ds-pro` `/ds-flash` are deleted. Pure model-inference. | `research.md:8-9`; `ds-pro.md`/`ds-flash.md` absent | wire to `llm-lane.mjs` or restate as advisory |
| 8 | **EOT "continuous auto-trigger" unwired.** SKILL.md + harness desc claim auto-fire at task-completion / context≥60% / after-errors. No hook implements any threshold; trigger is keyword-only. Newest micro-EOT file 3+ weeks old. | grep across hooks: 0 threshold logic; `user-prompt-submit.js:111-125`; `.claude/eot/continuous/` newest 2026-05-22 | implement PostToolUse threshold or rewrite SKILL claim |
| 9 | **Dream-drain + Homeostat crons dead.** Both session-bound CronCreate jobs died 2026-06-11, never re-armed. `yuri-dream.js` Stop hook only *enqueues*; drain (`yuri-dream-processor.mjs`) is manual-only, unhooked. Homeostat advisory-only, no executor. Queue grows, reflexes never run. | `dream-drain-cron.md:7-8`, `homeostat-cron.md:6-7`, `yuri-dream.js:67-86`, `yuri-homeostat.mjs:4` | move to persistent LaunchAgents (like the other 17), not session-bound crons |
| 10 | **claim-ledger ζ (staleness) factor is a no-op.** `staleness.halfLifeDays` absent from energy-weights.json → ζ weight × 0. 5 of 6 epistemic factors fire; staleness is ΔU-neutral. ("NEXT BUILD" memory label stale — v1 IS built and live.) | `energy-tick-core.mjs:374-378`; `energy-weights.json` (key absent) | add the key or document ζ as off |

**P1 but design-acknowledged** (real, but the code documents them as intentional threat-model boundaries — not hidden):
- **`bash-security-guard` fail-open** for 3 documented bypass classes (byte-escaped payloads to non-shell interpreters, source/external-file indirection, runtime-computed paths). `operator-write-guard` doesn't cover Bash, so the Bash hard boundary rests entirely on this fail-open lexical guard. `bash-security-guard.js:953-974`. (Matches existing memory `BASH-GUARD-ROLE-MATCHER`.)
- **formula-foundry + bakeoff governance never fired.** CLI works (catalog=23 cards, coverage 20/36), but the only live import path runs through `yuri-decode` — which itself has zero production callers — and the promotion ledger `formula-foundry-ledger.jsonl` has never been written. The "upstream typing gate before math-proof-gate" is never mechanically enforced. `yuri-decode.mjs:16`.

---

## P2 — degraded / misleading (capability works but narrower than claimed)

- **`claude-protocol-guard`**: downgrades hard-deny → WARN when `CLAUDE_SESSION_ID` absent (all subagents/headless), and auto-satisfies after 3 warns **or** 30-min TTL. `claude-protocol-guard.mjs:192`, `:209-213`, `:360-365`.
- **`musubi-protocol-enforce.js`**: `process.exit(0); // Never block` — advisory-only despite the "enforce" name; only `additionalContext`, throttled 60s. `:129`.
- **`tirith-url-guard.js`**: matcher `''` fires on all tools but impl exits 0 for anything non-Bash → WebFetch/Agent URLs never inspected. `:77`.
- **`propagation-scan` covers 118/240 nodes**: 122 nodes from `yuri-graph.json` silently return "node-id not found"; CLAUDE.md doesn't say which graph. `propagation-scan.mjs:99`.
- **gitnexus index chronically 1 commit behind HEAD**, no auto-refresh — hook prints a warning, never spawns analyze. Every structural hit downranked (conf 0.582, stalenessPenalty 0.6). `gitnexus-hook.cjs:191`, `:220`.
- **`ai reindex` manual-only**: no hook/cron refreshes the FTS5 corpus; SessionStart only reindexes MEMORY.md (Track B), not the search corpus. The *mandatory first research step* runs on a self-staling index. `claude-memory-write.mjs:254`.
- **OpenClaw bridge = dead branch** but graph nodes OC_BRIDGE/OPENCLAW_A still advertise active advisory. `llm-compat-contract.mjs:338`, `:979-993`.
- **`claim-integrity-gate` runs only at session-end** (Stop → `yuri-closeout`), can't catch mid-session over-claims pre-commit. `yuri-closeout.mjs:18`, `:47`.
- **skill-manifest.json + agent-manifest.json stale**: ≥6 deleted skill dirs (ai-pipeline-offloading, graphify, gpt-oss-local-runtime, kimi-k2-6-server-adapter, local-subagent, math-curve-loaders, swarm-coordination) with `"exists":true` false positives; architect/doc-cleaner/file-inventory agents still reference `swarm-coordination`/`graphify`. `agent-manifest.json:48`, `:123`, `:149`.
- **`yuri-decode` + `lane-telemetry-cockpit` "Invocation: both" half-true** — CLI live, data live, zero production importers (operator-manual only).
- **`/design` + `/spec` prose-only**: no `skill:`/executable; `/spec` subcommands are deprecation stubs, `spec-pipeline.mjs` never called by `spec.md`. `/design` claims "auto-activates via hook" — no such hook in settings.json.

---

## P3 — self-model rot (cosmetic, but it IS the lying-map problem)

- 29 graph nodes → deleted `pulse-orchestrator.mjs` + 3 → deleted `pulse-codex-runner.mjs` (`yuri-graph.json`; both archived wave-2/wave-3).
- `claim-cortex` node + edge `:10914` mislabeled `UNWIRED` / "no live hook feeds this path" — it's live (energy-tick → claim-ledger → claim-cortex on every PostToolUse).
- MEMORY `ENERGY-GATE-LINFINITY-DOUBLY-INERT` now stale — cap=1, armed in trace path; veto reachable. `yuri-energy.mjs:90`, `:700`.
- `math-register-guard.mjs:11-12` header says "NOT wired into settings.json" — it **is** wired (`settings.json:228`).
- **`test-pulse-cortex.sh` broken**: Phase 6 cats the deleted `pulse-orchestrator.mjs` (4 FAILs); Phase 4 double-nested path bug → MODULE_NOT_FOUND + stale `bridge_advisory` assertion. A test that cannot pass.
- `memory-proposal-autopilot` graph `triggeredBy: "invoked by yuri-autonomy-runner"` — false; zero references there.
- `memory-evict.mjs` / `memory-archive.mjs` dead code — superseded by `memory-relocator`, zero importers.
- `ai` help text "~26k docs" (lines 79, 1035) vs CLAUDE.md "~38k" vs actual **41,513**.
- `xref-query.mjs:13` comment "83-node circuitry graph" — actual 118.
- `constitution.md:84` cites `claude-protocol-guard.js`; real file is `.mjs`.

---

## What held up (honest baseline — claims that DO wire correctly)

Track A `memory-kernel` (propose/decide/ledger) · Track B `claude-memory-write` + MEMORY SessionStart reindex · `lane-persona-map` roster (7 entries) · all 3 DeepSeek lane paths · `yuri-closeout` EOT (lean, no swarm) · `organ-yuri-nerve` + `openprocess-pool` SessionStart digest (openCount live) · `filing-assessor` (filing-gate + filing-ledger hooks) · `energy-tick` PostToolUse ΔU trace (real append) · `computeU` (real fn @ `yuri-energy.mjs:449`, 20 call-sites — just mislabeled as a "script" in brain prose) · the 17-agent LaunchAgent fleet (loaded, scheduled) · `ai search` FTS5 over 41,513 docs (normal path) · `xref-query` 4-leg (gitnexus leg stale but functional) · the 8 `upgrades_pending` (all applied-v15, closed) · cross-domain-transfer-engine PHANTOM (correctly documented). **The L∞ veto is armed now (cap=1)** — the old "doubly-inert" memory is obsolete.

---

## Residual risk

`UNWIRED` verdicts lean on "zero grep hits," which can miss dynamically-built import paths — the verifier already caught one such false-negative (`openprocess-pool`, imported via relative path that didn't match the absolute-path grep). High confidence, not absolute. Re-verify any `UNWIRED` finding before deleting the underlying code.

## Suggested fix order

1. **Cheap P1s (no intent call needed):** #2 (PATH shadow), #1 (code-local lane), #9 (crons → persistent LaunchAgents), #6 (dangling skill commands).
2. **Intent calls (Marcel decides):** #3 energy-enforce — guarantee vs aspirational? · merge the two circuitry graphs to one? · is formula-foundry governance meant to be live?
3. **Self-model hygiene sweep (P3):** regenerate `yuri-graph.json` from live code (auto-register), fix the stale headers + manifests + `test-pulse-cortex.sh`, update `ai` help count.
