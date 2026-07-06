# Energy-Enforce Pre-Arm Red-Team — Findings & Arm Ruling (2026-06-16)

Fleet: 10 native Sonnet finders + 5 cross-family ollama peers (minimax-m3/glm-5.1/kimi-k2.7-code/nemotron-3-ultra/deepseek-v4-flash) → dedup → adversarial verify → 3 Opus synthesis lanes. **88 agents, 6.14M tokens, 77 min.** Plus independent main-session (Opus) ground-truth verification of every arm-blocking claim.

## Headline

**71 raw → 70 unique → 60 confirmed / 10 killed**, but the 60 collapse to **6 root-cause classes + ~24 lower individual items** (the backlog multi-counted witnesses — same race reported 4×, same config-doc drift 6×).

**ARM RULING: `arm-after-fixes`** (izanagi 3-branch EV×reversibility×blast: arm-after-fixes 8.70 > don't-arm 7.20 > arm-this-weekend 5.40). The fixes are hours of reversible work — "this weekend" still holds. **SEAM-3 (priority-zero) is KILLED — arming will not silently no-op.**

The two findings tagged "BLOCKS THE ARM" were **both disproven at the seam** (the fleet over-claimed; main-session + Opus-2 re-verification corrected them):
- **D5 phantom staleness** reproduces (ΔU=0.478 > threshold=0, gateProposal soft-rejects every healthy Edit) BUT the live deny path is **breaker-gated, not soft-ΔU-gated**. `evaluateGate` only returns `deny` when the breaker is OPEN; the breaker only opens on a **catastrophic veto** (`isCatastrophic`), never a soft reject. Verified live: healthy Edit → `verdict.accept:false` but `isCatastrophic:false` → breaker CLOSED → `evaluateGate` returns `allow`. **Enforce does NOT block healthy work.** Real signal-quality defect, NOT an arm-blocker; errs conservative (more rejection, never wrongly opens the breaker).
- **D2 clobber** reproduces and is real, but the trip model is single-event-catastrophic, so the next tick re-trips if the condition persists → a per-race **1-call deny slip**, not "permanently disarmed." **HIGH, not CRITICAL.**

## Live status flags (verified this session)

- ⚠️ **`YURI_ENERGY_ENFORCE=1` is ALREADY set in this env.** Enforce is technically armed in-session right now — but quiescent (live breaker CLOSED) AND structurally unable to reliably hold a trip (B1 clobber). The protection is currently **illusory**. The flag-file arm this weekend is the deliberate durable step; it will not actually protect until B1+B3+B2 land. (Live evidence: this entire 77-min audit session ran under env-armed enforce with zero interference — the CLOSED-breaker/fail-open path does not disrupt normal work.)
- Version **2.1.177**. Harness deny-contract (`exit 0` + `hookSpecificOutput.permissionDecision:"deny"`) **verified against official docs** (code.claude.com/docs/en/hooks) — energy-enforce emits exactly that shape and exits 0. Residual: one-time LIVE confirmation is owner-gated.
- Arm flag + snap dir confirmed **absent from every deny-list** (settings.json, bash-security-guard, operator-write-guard).

## The honest blocker set (deduped to root cause)

### B1 — RMW / read-modify-write RACE CLASS  · HIGH · arm-blocking-for-RELIABILITY · 12 witnesses → 1 fix
`energy-enforce.mjs:88` reads the FULL snap, mutates only `snap.breaker` at `:105`, atomicWrite-renames the whole snap back — unguarded read-modify-write to the same destination `energy-tick` (async, fire-and-forget) writes. **Hermetic repro CONFIRMED (main session):** enforce reading a stale pre-trip snap then writing it back erased tick's OPEN breaker, `depth++`, and `protectedPathViolations` (final: CLOSED/10/0). The SAME defect class recurs: cost-reservation-pool admit() TOCTOU double-spend, token-ledger SELECT+INSERT race, session-state shared-tmp race. **FIX (one primitive):** enforce writes a breaker-only sidecar (never tick's full snap) OR a shared CAS/atomic-merge-snapshot primitive every writer uses OR enforce stops persisting (tick owns the snap — burn-in proves tick alone evolves the breaker).

### B2 — block channel untested + not live-verified · HIGH · arm-blocking-for-CONFIDENCE · 5 witnesses
Zero process-level test for the PEP (stdin event JSON → stdout `permissionDecision:deny`). The metrics-only burn-in **never exercises `emit()`** (burn-in flips emit→audit; emit is the untested branch) — so burn-in green does NOT predict armed-correct. The harness contract matches the docs but was never live-confirmed on 2.1.177. **FIX:** commit `energy-enforce-process.test.mjs` (5 proven scenarios: no-snap fail-open, OPEN→deny, CLOSED→allow, observability-off, enforce-off) into the pre-commit gate + a one-time live harness-contract test (owner-gated).

### B3 — arm flag + snap dir self-disarmable · HIGH · arm-blocking-for-INTEGRITY · confirmed
`_SYSTEM/state/energy-enforce.enabled` and `_SYSTEM/state/energy-session/` are in NO deny-list. A model under the armed gate can `rm` the flag (silent disarm, no audit) or inject a CLOSED-breaker snap to bypass for its session. (Env-armed sessions are immune to the rm-flag vector but NOT snap-injection.) **FIX:** add both paths to the settings.json deny-list / bash-security-guard BLOCKED set before arming.

### B4 — ζ staleness fires fail-closed on every live record · MEDIUM (not arm-blocking) · must-fix · 6 witnesses
`applyTransition` (energy-tick-core.mjs:272) writes evidence as `{base,age,capturedAt}` with **no halfLife**; `staleness.halfLifeDays` is absent from config → `hydrateEvidence` never runs → `confidenceDecay` throws on every record → `evalStaleness` all-malformed fail-closed → +0.5·N phantom staleness on every verdict. Not arm-blocking (soft reject, breaker-CLEAN) but it makes the entire ΔU signal garbage and is a latent landmine if soft-enforce is ever added. **Same root cause as the energy-breaker test fixed earlier today (`bc11ebf5`).** FIX: wire `halfLifeDays` + write `halfLife` into each record so ζ measures real age, OR set `zeta=0` and document ζ as deferred.

### Other notable confirmed (non-arm-blocking, real)
- **D7 HIGH** `memory-canonical-store.mjs:365` keyOf uses space separator but comment claims NUL → silent claim collision / data loss on compaction.
- **D9 HIGH** `math-proof-gate.mjs` `validateFormulaCard` early-returns when `bank.advisoryOnly===true` → a card can lie about `promotionStatus:'stable'` with zero worked-example execution. (Integrity crack for the formula-promotion pipeline; not this arm.)
- **CONFIG/DOC-DRIFT ×11**: `energy-weights.json _doc` says "klDivergence" but live is Wasserstein-1 (v3); `mu` has no config knob/_doc entry; `_doc.threshold` says "any sign" but the loader silently drops negatives.

## Remarkability roadmap (the owner's bar — what makes it remarkable, not merely correct)

1. **Kill the RMW-race CLASS, don't patch it** — one shared CAS/atomic-merge (or breaker-only sidecar) primitive every hook uses. Five instances of one concurrency bug → one proven primitive.
2. **Make the block channel tested + version-verified** — the committed process test + the one-time live 2.1.177 contract test. The whole arm rests on this external fact.
3. **Engage or honestly retire ζ** — measure real age or `zeta=0` + documented Wave-3. Don't ship a term that mislabels fresh evidence as malformed.
4. **Config IS the contract** — doc matches code, every live weight (incl `mu`) tunable, out-of-range warns-and-clamps instead of silently dropping.
5. **Protect the arm flag + snap dir** — layer-1 deny-list → self-disarm structurally impossible.
6. **Close the proof-gate promotion-status hole (D9)** before any kernel formula promotes into computeU.

## Architecture strengths (verified, genuinely good)
- PDP/PEP split (decision computed PostToolUse + persisted; PreToolUse only reads+enforces) — OPA-style, rare in hook gates.
- Deny-OR composition is sound: all 9 other ALL-matcher sync PreToolUse hooks emit ZERO `permissionDecision:'allow'` → energy-enforce's deny can never be silently downgraded.
- Layered defense: energy gate is explicitly layer-2 advisory; layer-1 deterministic guards hold the real floor; fail-open is the correct direction for a layer-2 conscience.
- Breaker auto-decay + clock-skew rescue → provably cannot permanently block.
- Math substrate is deep + self-defending (multiple findings KILLED because the math holds: NaN-ΔU unreachable via 3 guards; malformed-before is conservative not fail-open).

## Completeness: SUBSTANTIALLY signed off after main-session mop-up (only the owner-gated live test remains)
- ✅ CLOSED (first pass): harness deny-contract (verified vs official docs), cross-dimension dedup (→6 classes), live-arm status (env-armed confirmed), evalStalenessShadow (brief was stale — it IS tested), SEAM-3 (killed).
- ✅ CLOSED (mop-up): **breaker veto-order** — deterministic enumeration (the exact tool; quantum-sim is for probabilistic order-effects, the breaker is deterministic) shows [CAT,CLEAN]/[CLEAN,CAT]/[CAT,CLEAN,CAT]/[CAT,CAT,CLEAN] ALL → OPEN/deny: **no order-dependent trip**. **deny-OR composition** — all 8 emitting PreToolUse hooks emit ZERO `allow`: deny is **un-downgradeable** (now exhaustive, not spot-checked). **RESET path** (`energy-enforce.mjs:93`) — same full-snap RMW → folds into the B1 race class (one fix covers it).
- 🆕 mop-up FINDING (B5, non-arm-blocking, perf): **13 SYNC (blocking) PreToolUse hooks, only 4 timeout-bounded.** Arming adds enforce's snap read+write FS I/O to an unbounded 13-hook chain per tool call — a cumulative-latency item for the arm-day runbook, not a blocker.
- ⏳ TRUE RESIDUAL (only one, and it is owner-gated by nature): the **LIVE harness-contract test on 2.1.177** — confirm an actual armed breaker-OPEN trip is blocked by the harness end-to-end. Cannot be done without arming + forcing a trip → owner action. Plus the first-arm cold-start runbook (a doc artifact, not a verification).

## POST-FIX UPDATE (2026-06-16, commit c255a43f — fix campaign core, pushed)

The arm-after-fixes blockers are CLEARED (no arming performed):
- **B1 (RMW clobber) — FIXED.** enforce is now a pure-read PEP; energy-tick is the sole breaker writer and owns the time-decay. Design sim 9/9 (clobber-flips · recovery · burn-in-invariant · decision-parity); glm-5.1 peer corroborated Design A. Locked by `energy-enforce.test.mjs` B2-6 (enforce never mutates the snap).
- **B2 (untested block channel) — FIXED.** `energy-enforce.test.mjs` 6/6 process-level scenarios (deny shape on exit 0 + every fail-open path + the pure-read invariant). Residual: the one-time LIVE harness-contract test stays owner-gated.
- **B3 (self-disarmable) — FIXED (Bash vector).** Arm flag + snap dir added to `lane-kernel.mjs` ROLE_TRUST_SURFACES; verified end-to-end that a coworker-role `rm`/snap-inject is denied. `energy-arm-hardening.test.mjs` 4/4. Residual: the secondary settings.json TOOL-deny is deferred (file contended by a parallel session) — the primary Bash self-disarm vector is closed.
- **B4 (ζ fail-closed) — FIXED.** `applyTransition` writes a self-describing `halfLife`; `staleness.halfLifeDays:30` is the tunable override; `_doc` corrected (beta = Wasserstein-1). A healthy Edit now ΔU=−0.022 accept (was +0.478 reject). Cleared **5 pre-existing** energy-tick-core failures the ζ bug had left red (invisible to the math-only baseline).

Tests: 849/849 math · 69/69 breaker+tick-core · 6/6 + 4/4 hook process tests.

### Peer adversarial verify (3 cross-family peers attacked the committed fixes; every claim re-verified locally)
- **1 real catch → FIXED (commit 14f21000):** the energy gate's own enforcement code (`energy-enforce.mjs`/`energy-tick.mjs`) was not in ROLE_TRUST_SURFACES — the deletion vector was already caught by the blanket `.claude` rule, but the write/Edit-tool vector was open (a coworker could modify the hooks to neuter the gate). Added both to the trust surface; verified a coworker write is now denied; `energy-arm-hardening.test.mjs` B3-5 locks it (5/5).
- **Triaged LOW/edge (noted, not arm-blocking):** RESET-path write is operator-env-only + an intentional force-close; B1 HALF_OPEN future-timestamp fails toward `probe`=ALLOW (fail-open, tamper-gated by B3), not block — peer mischaracterized the direction; B4 unhydrated-caller is the dead/test-only `verdictFromStates` path (live tick hydrates via halfLifeDays:30).
- **Refuted:** one peer's "B3 not wired, coworker can delete the flag" (HIGH) — disproven end-to-end; the bash guard consumes lane-kernel dynamically and the coworker block is proven.

### REMARKABILITY tier — B1-ext (race-class kill) DONE (commit aa78fa32, pushed)
The roadmap #1 move ("kill the race CLASS with one reused primitive, don't patch each"). CAPABILITY-FIRST: reused `nano-lease` (red-teamed atomic-rename claim + dead-only-under-custody reclaim); built nothing new.
- **B1-ext-2 (token-ledger, LIVE):** the drain single-writer lock was a hand-rolled mtime-stale mkdir lock with a double-acquire reclaim race → swapped to nano-lease, path-scoped by the lock dir (test/live never collide). Caught + fixed a self-inflicted bug in review (`acquireLease` returns `{ok}`, not a boolean — a `=== true` check would have silently no-op'd the drain and stopped the live ledger). End-to-end verified; `token-ledger-drain-lock.test.mjs` 3/3.
- **B1-ext-1 (cost-pool, latent/disarmed):** `admit()`'s armed read→check→write TOCTOU (two concurrent admits both pass + double-spend) → serialized with a reservations-dir-scoped nano-lease; sync caller, so contention → conservative-reject (no double-spend), disarmed path untouched. `cost-pool-admit-lease.test.mjs` 3/3.
- The race class now uses ONE proven primitive uniformly where a lock is needed (cost-pool, token-ledger) + writer-elimination where it's cleaner (energy single-writer). No regression (existing suites green).

**Revised arm-readiness:** all blockers cleared + regression-netted + peer-attacked; the remarkability race-class kill is done. **The ONLY remaining step before the weekend flag-flip is yours:** the one-time LIVE harness-contract test (arm in a throwaway session, force an armed trip, confirm the harness actually blocks). Optional/deferred: the settings.json tool-deny (when uncontended).

## Verdict line
`10ER_ENERGY_ENFORCE_PREARM_REDTEAM_P_PASS` — arm-after-fixes; SEAM-3 killed; 4 blockers (B1-B3 arm-gating + B4 must-fix); 6-move remarkability roadmap; completeness partial (live-contract test owner-gated). No arming, no risky fixes performed.
