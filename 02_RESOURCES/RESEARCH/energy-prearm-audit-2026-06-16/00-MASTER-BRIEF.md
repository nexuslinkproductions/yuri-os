# MASTER BRIEF — Energy-Enforce Pre-Arm Red-Team (2026-06-16)

> Ground truth for every finder/verifier/peer in this audit. Read this FIRST. Do not re-derive what is stated here.

## Mission

We arm `energy-enforce` **LIVE this weekend**: a synchronous PreToolUse Policy Enforcement Point that can **BLOCK tool calls** by emitting `permissionDecision:"deny"`. Arming = create `_SYSTEM/state/energy-enforce.enabled` AND/OR set `YURI_ENERGY_ENFORCE=1`. Before flipping a live blocking gate, find **every** bug, gap, and missed seam. No stone unturned. The architecture must come out *remarkable*, not merely "passing."

This audit's job: **find → adversarially-verify (refute locally) → synthesize → spec the regression tests.** It does **NOT** arm and does **NOT** apply risky fixes — both owner-gated.

## The arm target — what flipping the flag actually changes

- `.claude/hooks/energy-enforce.mjs` is the PEP. Master switch `YURI_ENERGY_OBSERVABILITY` is hardcoded `"1"` in `.claude/settings.json` (always on). Arm check (OR): `process.env.YURI_ENERGY_ENFORCE === '1'` **OR** `fs.existsSync(_SYSTEM/state/energy-enforce.enabled)`.
- When NOT armed: a would-be deny is audited to `~/.yuri-audit.log` (METRICS ONLY). When armed: it emits `permissionDecision:"deny"` to stdout → the harness blocks the tool.
- Registered in `.claude/settings.json` PreToolUse, matcher `""` (all tools), **synchronous** (can block). The PostToolUse `energy-tick.mjs` is `async:true` (cannot block; fire-and-forget).
- Every error path is **fail-OPEN** (missing snap, gate throw, JSON parse error, top-level try/catch). The energy gate is an advisory layer-2 conscience; deterministic guards (operator-write-guard, settings deny-list) are layer-1.

## The 5 candidate seams (UNVERIFIED — confirm or KILL each with a local repro)

These came from a fast recon pass. **Treat every one as an unproven claim.** A confident claim is regularly, flatly wrong (the NS2 0/4-P0 lesson). Confirm only with a runnable repro; kill with a counter-repro.

1. **SEAM-3 (PRIORITY-ZERO — the whole ballgame):** PostToolUse `energy-tick` (`.claude/hooks/energy-tick.mjs:~51`) and PreToolUse `energy-enforce` (`.claude/hooks/energy-enforce.mjs:~83`) both derive `sessionId = String(event.session_id||'').replace(/[^A-Za-z0-9_-]/g,'') || 'default'`. The snap lives at `_SYSTEM/state/energy-session/<sessionId>.json`. **If the harness sends a different/absent `session_id` to PreToolUse vs PostToolUse, tick writes `<A>.json` and enforce reads `<B>.json`/`default.json` → `snap=null` → fail-open forever → ARMING DOES NOTHING.** Determine empirically what `session_id` each hook event actually carries. This gates the entire arm.
2. **SEAM-1 (async race):** tick is async fire-and-forget, enforce is sync. Rapid consecutive tool calls → enforce on call N+1 may run before tick's snapshot write for call N completes → enforce reads an N-2 snapshot → a trip at N is invisible until N+2. Quantify the window; is it exploitable / does it lose a real trip?
3. **SEAM-2 (untested PEP process):** zero integration test for `energy-enforce.mjs` as a process (stdin event JSON → stdout `permissionDecision:deny`). Top-level `try/catch` swallows crashes → silent fail-open. A regression in the stdout JSON shape, an ESM import failure, or an encoding bug breaks the ONLY block signal and nothing catches it.
4. **SEAM-4 (gateErrorVeto unreachable on SKIP):** `claimFieldFailures` is passed through unchanged on SKIP-tier ticks (`energy-tick-core.mjs:~355`); the 3-strike `gateErrorVeto` (`:419-423`) can only accrue on WORK/CRITICAL ticks. A SKIP-only session with a poisoned claim ledger never trips.
5. **SEAM-5 / live calibration:** `staleness.halfLifeDays` is ABSENT from `_SYSTEM/SELF/energy-weights.json` → the ζ staleness term is **SKIPPED for every live verdict right now** (evidence records pass with `age:0` → zero staleness). `mu` (overconfidence coupling) is absent → uses default `0.5`. `beta=2.2` overrides default `2.0`. The JSON `_doc.weight_meanings` still describes `beta` as "klDivergence" but live code is **Wasserstein-1** (energyFormulaVersion 3). Calibration drift + auditor confusion.

## Coverage gaps (where undiscovered bugs hide)

- `_SYSTEM/Scripts/token-ledger.mjs` — 24 exported fns, **1 smoke test** (calculateCostUsd, reconcileProviderExport, verifyHashChain, getRollups untested).
- `_SYSTEM/Scripts/cost-reservation-pool.mjs` — 10 fns, **1 smoke test** (admit/release atomicity, concurrent races, exhaustion untested).
- `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs` — 20 fns, **5 tests**.
- `evalStalenessShadow` (Cox per-class aging) — exported, untested.
- Malformed-field veto guards (protectedPath/promotionLadder PRESENT-but-NaN/negative) — thin.
- **No `energy-enforce.mjs` process-level test at all.**
- Baseline (current HEAD): `node --test _SYSTEM/Scripts/math/*.test.mjs` = 849/849 green; `energy-breaker.test.mjs` = 32/32 green.

## The 10 attack dimensions

D2/D3 (SEAM-3/SEAM-1) are the priority-zero block — if enforce silently no-ops, everything else is moot.

| Dim | Target | Key files |
|---|---|---|
| D1 | Enforce PEP process: stdout deny shape, arm check, fail-open paths, crash-swallow | `.claude/hooks/energy-enforce.mjs` |
| **D2** | **State extraction + session-ID consistency (SEAM-3) + async race (SEAM-1)** | `.claude/hooks/energy-tick.mjs`, `energy-enforce.mjs`, `energy-tick-core.mjs` |
| D3 | Breaker state machine: cross-process persistence, permanent-block reachability, clock skew, recentSigned loss | `_SYSTEM/Scripts/energy-breaker.mjs` |
| D4 | PDP math: gateProposal/computeU, all terms, veto classes, allowOverride+NaN edge, per-term fail-open vs closed | `_SYSTEM/Scripts/math/yuri-energy.mjs`, `math-kernel.mjs` |
| D5 | Staleness/confidenceDecay: ζ-skipped-live, bare-record fail-closed, hydration seam | `yuri-energy.mjs` evalStaleness, `math-kernel.mjs` confidenceDecay, `energy-tick-core.mjs` hydrateEvidence |
| D6 | Config/weights hydration: mu absent, beta doc drift, validation floors, threshold≥0 | `_SYSTEM/Scripts/math/yuri-energy-config.mjs`, `_SYSTEM/SELF/energy-weights.json` |
| D7 | Canonical memory store: fold commutativity, retract dead-marking, lease loss, gen rotation, contested resolver | `_SYSTEM/Scripts/memory-canonical-store.mjs`, `memory-kernel-canonical-bridge.mjs` |
| D8 | Token/cost watcher: recording-live-on-dispatch, ledger hash-chain, pool admit/release atomicity | `token-ledger.mjs`, `token-report.mjs`, `cost-reservation-pool.mjs`, `llm-lane.mjs` |
| D9 | eml-tree + formula-foundry + proof-gate: pow2, DISARMED-degrade at the wiring seam, schema validation | `math/eml-tree.mjs`, `formula-foundry.mjs`, `math-proof-gate.mjs` |
| D10 | Cross-cutting concurrency/TOCTOU + fail-open-vs-closed sweep + the hook/protected-path gate surface | all hooks + `bash-security-guard.js`, `pre-tool-use.js` |

## Finding schema (every finder returns this)

```
{ dim, title, file, line, severity (CRITICAL|HIGH|MEDIUM|LOW), claim (what's wrong),
  repro_sketch (the smallest local check that proves it), arm_blast (how it affects the live arm) }
```

## Verify protocol (the kill filter — non-negotiable)

- Every candidate finding gets an INDEPENDENT verifier that tries to **REFUTE it against live code with the smallest runnable repro**. Default to "refuted" if it cannot be reproduced.
- A confident finding is a hypothesis, not proof. Lanes over-claim (NS2: 18/19 reported 19/19 with 0 edits; a raw arithmetic hallucination passed peer review). Verify EVERY claim locally.
- Order-sensitive findings (breaker veto sequence) → quantum-sim `qqEquality`. Robustness/config findings → decision-sim `robustScore`/`pgdWitness` (CVaR worst-case).
- Majority-refute → KILLED (log why; no silent drops). Survives with a green repro → CONFIRMED, severity-locked.

## Confirmed cross-family peer roster (pinged live 2026-06-16, all OK)

`minimax-m3:cloud` · `glm-5.1:cloud` · `kimi-k2.7-code:cloud` · `nemotron-3-ultra:cloud` · `deepseek-v4-flash:cloud`
Dispatch: `bash _SYSTEM/Scripts/ai llm ollama-cloud --model <X>:cloud "<prompt>" --reasoning xhigh --out <file>` (output→FILE, never pipe — piping prints a bare AggregateError). Peers re-attack their assigned dimension BLIND; a peer claim is advisory until a local repro confirms it.

## Rails (binding)

- **No arming. No risky fixes.** Deliverable = confirmed-defect backlog + RED regression tests + arm-readiness ruling + remarkability assessment.
- Protected paths off-limits: `backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `.env`, `node_modules/`. (Note: `_SYSTEM/state/energy-session/` is under `.claude/state`-class runtime state — inspect via the hook code + a hermetic tmp repro, never by reading live session snapshots.)
- Commits (test/doc only): explicit pathspec, never `git add .`/bare commit; checks green + `git show --stat`; fetch+FF never force. Parallel session is live on `main` → scoped/disjoint only; `--no-verify` ONLY for their skill-hash drift.

## Status log

- 2026-06-16: recon (3 Explore agents) → 5 seams + coverage gaps. Roster pinged, all 5 live. Master-brief written.
- 2026-06-16: audit fleet launched (Workflow wf_51575105-d06: 10 native Sonnet finders + 5 cross-family peers → dedup → verify → 3 Opus synth).
- 2026-06-16: MAIN-SESSION ground truth (parallel to fleet): **SEAM-3 KILLED** (no default.json fallback ever; enforce read real-UUID snaps; arm won't no-op — see 01-SEAM3-VERDICT.md). **SEAM-5 facts CONFIRMED**: `staleness` block absent → ζ inert live (weight 0.5 but every record age:0 → 0 contribution); `mu` absent (default 0.5); `beta`=2.2 override. SEAM-5 defect-vs-calibration ruling deferred to fleet D5/D6 + Opus.
