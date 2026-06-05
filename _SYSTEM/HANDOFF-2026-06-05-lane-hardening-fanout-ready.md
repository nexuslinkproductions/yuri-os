# HANDOFF — lane hardening + Codex full-equip + audit → FAN-OUT READY (2026-06-05)

> **Top-loaded by design** (newest/current first, history below — applying [[newest-first-doc-ordering-idea]], owner 2026-06-05). Read the top; dig down only for provenance.

## ⏭️ NEXT SESSION — FIRST ACTIONS

1. **LAUNCH THE BREADTH-FIRST FAN-OUT (Wave 1).** Fully planned + ready. Surface = 127 nodes / 15 sectors in `_SYSTEM/yuri-graph-state.json`. Partition sectors into ~6 slices; each slice → one of the 4 equipped lanes, **`--context` front-loaded with that slice's real files**, both-lens (weaknesses-weighted) + LOCAL-corpus cross-ref first (bug-bounty 9,487 + study-competition memory + research docs). Lanes return file:line findings (advisory). ME + ≤3 own agents = scoper / synthesizer / adversarial-verifier; nothing climbs to "real" without a truth-gate vs live runtime. Output = a verified ranked coverage map + hot-spots for Wave 2. Owner params (locked): **breadth-first · local-corpus-first · both-lens weaknesses-weighted · max 3 of my own agents** (the lanes do the coverage, not my agents).
2. **Adopt the top-loading doc convention** ([[newest-first-doc-ordering-idea]]): pin a CURRENT-STATE block at the top of living docs (handoffs, plans, status logs), history aging below; leave strictly-chronological ledgers append-only. Evaluate + apply.

## ✅ CURRENT STATE (true as of session end)

**The lanes are bulletproof + fully equipped.** Dispatch reference: [`_SYSTEM/LANE-MANUAL.md`](LANE-MANUAL.md) (build+operate manual — roster, env-wire grammar, core-ingest seam, security, §7a front-load, §10 gotchas, §11 add-a-lane).
- **3 LLM-compat lanes:** `deepseek-v4-pro` (DIRECT api.deepseek.com) · `nemotron-3-ultra-550b-a55b` (NIM) · `kimi-k2.6` (NIM). All 1M ctx. Invoke `ai llm <lane> "<prompt>" --context <files> --out <file>`.
- **Codex (gpt-5.5):** now **fully equipped like Claude — un-sandboxed (`danger-full-access`), guard-VERIFIED** (it attempted `rm -rf` and `.codex/hooks/pre-tool-use.mjs`→yuri-safety-core BLOCKED it). Spine via AGENTS.md, repo-wide (repoRoot bug fixed), `--context` parity. Invoke via `codex-offload-runner.mjs` / `ai codex`.
- **`--context <files|@manifest>`** front-loads must-read files INTO the dispatch (both lane types) — the dispatch-quality lever: guaranteed context turn-1, not self-discovery. Budget `LLM_LANE_CONTEXT_BUDGET=240k`, protected-surface-safe. Dispatcher picks files per task (proportional).
- **RELIABLE DISPATCH RULE: never wrap a live lane call in shell `timeout`** — it truncates the live request to empty output (cost hours this session). The lane self-limits via its own AbortController. Use `--out <file>` for capture.

**All committed + merged to `main`** (4 commits): `028e430f` rename · `d800012c` lane improvements+manual · `21ddcaca` Codex full-equip · `29e5b16c` kagami noise fix. Branch `feat/offload-consolidation` == `main`.

## 🔧 OPEN RECOMMENDATIONS (from the audit — do in the fan-out or separately)

- **Lean lane entry:** explicit lane verbs (`ai llm|deepseek|kimi|nemotron|codex`) still run through `pulse-classify-stdin` (only `--model`/`-m` sets `PULSE_LANE_BYPASS`). Set the bypass for explicit verbs → leaner direct dispatch.
- **Retire the kagami FACADE:** disabled (`KAGAMI_FACADE_ENABLED=0`), auth scrapped, boot script `kagami-start.sh` MISSING — outdated dead-weight. The 5 SCHEDULED kagami agents (forgetting-loop/memory-consolidator, overseer, session-synthesizer, heartbeat, stale-memory-scan) are LIVE (launchd, exit 0) — **KEEP**. Noise already gated (`29e5b16c`); full retirement of the facade subsystem is the next cleanup (verify no live consumer first).
- **Pre-existing test-debt** (from the PRIOR consolidation, NOT this work): `offload-runner.mjs` is deleted but `yuri-local-model-policy.test` (gating) + `rick-harness-runtime.test` reference it / dead lanes (`deepseek-v4-flash`) → red. `claude-protocol-guard.test` requires a `.js` hook that's `.mjs`. All pre-existing; fixing = finishing the consolidation's test cleanup.

## 🧭 BIGGER GOAL (don't lose it)

The fan-out IS the moat capstone red-team ([[moat-activation-4track-2026-06-03]] CAPSTONE) + serves T3 (MUSUBI ONE packaging needs a clean, correctly-named, documented lane subsystem — now delivered). 4-track: T1/T2/T4 done; T3 the open one. The whole rename+hardening was the SETUP; the fan-out is the payoff: measure how much more surface 4 equipped frontier lanes cover vs my agents alone, maintaining truth + enterprise-grade.

## 📜 SESSION ARC (history — provenance)

1. **Rename** offload → "LLM compatibility lane" — hard, atomic, no alias. 6 files git-mv'd, command `ai offload`→`ai llm`, all grammar `OFFLOAD_*`→`LLM_COMPAT_*`, graph+viz+docs+git-hooks, GitNexus reindexed. 5-agent adversarial verify caught real misses (git-hooks, safety regex, 2nd-batch env tokens). `028e430f`.
2. **LANE-MANUAL.md** created (circuitry-manual-parity).
3. **The timeout ghost** — chased a "lane is broken / sandboxed" phantom for ~an hour; root cause = MY shell `timeout` wrapper truncating the live node call. Lane was never broken (owner was right: "we had it going today"). Lesson banked.
4. **`--context` front-load** built + verified (both lane types).
5. **Codex full treatment** — un-sandboxed + guard-verified + repoRoot fix + `--context`.
6. **Audit** — ai-wrapper (pulse-classify friction) + kagami (facade outdated/noise-gated; agents live).

## KEY LEARNINGS (also in memory)

- **Suspect your own recent change first** before externalizing to "environment/sandbox" — and verify operational claims vs LIVE runtime, never happy-path tests/dry-runs (the live network path is where the truth is). [[lane-timeout-ghost-lesson]]
- **Front-load context to dispatched lanes/agents** — "equipped" (identity loadout + tools) ≠ "has the right context." Hand it the must-reads. [[lane-context-front-load]]
- **Fully-equipped not caged:** un-sandbox Codex (full reach) but keep the deterministic framework guard (yuri-safety-core) — guide+guard via the framework, not a sandbox wall. Verify the guard actually fires.

SEE: [[offload-consolidation-and-rename]] · [[lane-timeout-ghost-lesson]] · [[lane-context-front-load]] · [[newest-first-doc-ordering-idea]] · [[moat-activation-4track-2026-06-03]] · `_SYSTEM/LANE-MANUAL.md`.
