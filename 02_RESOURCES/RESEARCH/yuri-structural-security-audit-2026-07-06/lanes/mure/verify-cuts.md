This is the smoking gun. `pulse-lane-dispatch.mjs` is the **active code path** for complex/critical tier dispatches in `llm-compat.sh`. When `pulse-classify-stdin.mjs` returns `"complex"` or `"critical"` and `--model` is not manually set, `llm-compat.sh` EXECUTES `pulse-lane-dispatch.mjs`. This is **not dead code** — it is the tier-gated dispatch wrapper for the most complex dispatches.

Now I have complete evidence for all cut candidates. Here is my adjudication.

---

# MURE ADJUDICATOR VERDICT — Adversarial Cut Verification

**Auditor:** GLM lane (Adjudicator, refute-by-default) | **Date:** 2026-07-06
**Mission:** Independently verify every proposed cut against code. Sibling lanes (H1, S2) already over-claimed.

---

## EXECUTIVE SUMMARY

H1 proposed ~8 cut candidates. S2 re-verified and downgraded 5, but **S2 also got 2 wrong** — one of which is a **critical safety-relevant false positive**. My independent code verification found:

- **2 CONFIRMED-dead** (safe to archive)
- **1 CONFIRMED-dead skill** (safe to archive)
- **5 REFUTED** (live code incorrectly flagged for cut — including one that is a **load-bearing dispatch path**)
- **3 NEEDS-VERIFICATION** (correctly flagged as uncertain)

---

## CONFIRMED-DEAD (verified: zero live callers, safe to archive)

### D1: `lane-dispatcher.mjs`
- **Evidence:** Zero `import`/`require`/`spawnSync` callers anywhere in `_SYSTEM/Scripts`.
- **Self-check FAILS:** `node lane-dispatcher.mjs --self-check` throws on line 58.
- **Functionally distinct** from `lane-dispatch.mjs` (S2 correct here) — it's a capability SCORER over `lane-capability-manifest.json`, never wired into the live dispatch path.
- **Verdict:** CONFIRMED DEAD. Archive.

### D2: `nisaba-sentinel.mjs`
- **Evidence:** File does not exist (`test -f` → NOT FOUND). Only a role string `nisaba-sentinel-native` remains in `llm-compat-contract.mjs:986` (dead reference to a purged script).
- **H1 classification correct.**
- **Verdict:** CONFIRMED DEAD (already purged in 2026-05 wave).

### D3: `parallel-clone-orchestrator` skill
- **Evidence:** Explicit tombstone with `status: retired` in SKILL.md header.
- **Verdict:** CONFIRMED DEAD (already tombstoned correctly).

---

## REFUTED — LIVE CODE WRONGLY FLAGGED FOR CUT

### R1: ⚠️ `codex-offload-runner.mjs` — **CRITICAL FALSE POSITIVE**
- **H1 claim:** "retired; DeepSeek now via llm-lane.mjs"
- **S2 claim:** "CONFIRMED dead, H1 correct"
- **MY FINDING:** **BOTH WRONG.** This script has **4 LIVE CALLERS** that import and execute it:
  - `yuri-sandbox-loop.mjs:21` — `const RUNNER_PATH = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs')` → called at lines 265, 293, 331, 365
  - `memory-proposal-autopilot.mjs:25` — `const CODEX_RUNNER = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs')` → called at line 204
  - `worker-bridge.mjs:34` — `const CODEX_RUNNER = ...` → called at line 371 (`args = [CODEX_RUNNER, task.lane]`)
  - `task-queue.mjs:34` — `const CODEX_RUNNER = ...` → called at line 132 (`args = [CODEX_RUNNER, task.lane]`)
- **Caller liveness verified:** `worker-bridge.mjs` is imported by `rick-repl.mjs:26`; `task-queue.mjs` is referenced by `automation-kernel.mjs:30`.
- **Evidence:**
  - `MATCH file=_SYSTEM/Scripts/yuri-sandbox-loop.mjs term=codex-offload-runner line=21 excerpt="const RUNNER_PATH = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs')"`
  - `MATCH file=_SYSTEM/Scripts/worker-bridge.mjs term=codex-offload-runner line=371 excerpt="args = [CODEX_RUNNER, task.lane]"`
  - `MATCH file=_SYSTEM/Scripts/task-queue.mjs term=codex-offload-runner line=132 excerpt="args = [CODEX_RUNNER, task.lane]"`
  - `MATCH file=_SYSTEM/Scripts/memory-proposal-autopilot.mjs term=codex-offload-runner line=204 excerpt="CODEX_RUNNER"`
- **Root cause of false claim:** H1 relied on test-file comments ("retired") without grepping for live callers. S2 trusted H1 here instead of re-verifying (S2 explicitly said "both carry explicit in-code retirement markers and zero live callers" — **the zero-live-callers claim is FALSE**).
- **Verdict:** **LIVE. KEEP. DO NOT CUT.** Cutting this would break `worker-bridge`, `task-queue`, `yuri-sandbox-loop`, and `memory-proposal-autopilot`.

### R2: ⚠️ `pulse-lane-dispatch.mjs` — **CRITICAL FALSE POSITIVE**
- **H1 claim:** "Marked retired 2026-05-29; grep zero refs"
- **S2 claim:** "CONFIRMED dead, H1 correct"
- **MY FINDING:** **BOTH WRONG.** This script is the **live tier-gated dispatch path** for complex/critical dispatches:
  - `llm-compat.sh:51` — `exec node _SYSTEM/Scripts/pulse-lane-dispatch.mjs "$@"` — triggered when `pulse-classify-stdin.mjs` returns `"complex"` or `"critical"` and `--model` is NOT manually set.
  - The "retired 2026-05-29" comment (line 7/87) refers ONLY to the semantic-memory/palace retrieval feature being gutted (`const mem = '';`). The script itself still executes as a dispatch wrapper that calls `llm-compat.sh` with enriched persona context.
- **Evidence:**
  - `MATCH file=_SYSTEM/Scripts/llm-compat.sh term=pulse-lane-dispatch line=51 excerpt="exec node _SYSTEM/Scripts/pulse-lane-dispatch.mjs"`
  - `MATCH file=_SYSTEM/Scripts/llm-compat.sh term=PULSE_TIER line=48 excerpt='if [ "$PULSE_TIER" = "complex" ] || [ "$PULSE_TIER" = "critical" ]; then'`
  - `MATCH file=_SYSTEM/Scripts/pulse-lane-dispatch.mjs term=retired line=87 excerpt="const mem = ''; // semantic-memory/palace retrieval retired 2026-05-29"`
- **Root cause:** H1 grep'd for `pulse-lane-dispatch` in `.mjs`/`.js`/`.cjs` files only — **missed the `.sh` caller**. S2 claimed it re-verified but did not check `llm-compat.sh`.
- **Verdict:** **LIVE. KEEP. DO NOT CUT.** This is a load-bearing dispatch wrapper. Cutting it would silently break tier-gated routing for every complex/critical dispatch that doesn't specify `--model`.

### R3: `nano-compact-gate.mjs` — S2 correct (LIVE), H1 wrong
- **H1 claim:** "uncertain orphan"
- **S2 claim:** "LIVE, imported by cost-reservation-pool.mjs and nano-tick.mjs"
- **MY FINDING:** S2 correct. Verified:
  - `MATCH file=_SYSTEM/Scripts/nano-tick.mjs term=nano-compact-gate line=17 excerpt="import { decideCompact, DEFAULT_THRESHOLD_TOKENS } from './nano-compact-gate.mjs'"`
  - `MATCH file=_SYSTEM/Scripts/cost-reservation-pool.mjs term=nano-compact-gate line=25 excerpt="nano-compact-gate.mjs (single-call context ceiling)"`
- **Verdict:** LIVE. KEEP. H1 false positive, S2 correctly caught.

### R4: `spreading-activation-gate.mjs` — **NEEDS-VERIFICATION** (S2 over-claimed LIVE)
- **S2 claim:** "LIVE — shows up in yuri-knowledge-graph.json and an active energy-session snapshot"
- **MY FINDING:** S2's evidence is **weaker than claimed.** The script has **zero `.mjs`/`.js`/`.cjs` importers**. Its only references are:
  - Graph state files (auto-generated, not callers)
  - Its own self-reference to `spreading-activation-memory.mjs` (line 17: `import { ingestMemoryDir, recall } from './spreading-activation-memory.mjs'`)
  - A claim-extractor shadow-ledger entry (which is S2's own claim recorded by prose-claim-extract)
- **The actually-LIVE script is `spreading-activation-memory.mjs`** (imported by `yuri-knowledge-graph.mjs:30`), NOT `spreading-activation-gate.mjs`.
- **Distinction:** `spreading-activation-gate.mjs` is a **promotion gate** (the header says "promotion gate for roadmap organ 1"). `spreading-activation-memory.mjs` is the **memory recall engine**. They are different scripts.
- **Verdict:** NEEDS-VERIFICATION. `spreading-activation-gate.mjs` may be a roadmap-organ prototype never wired into live execution. S2's "LIVE" claim relied on graph-state auto-inclusion (which lists ALL scripts, not just live ones) and a self-referential shadow-ledger claim. **Do NOT cut without tracing whether any live energy-session actually invokes it.**

### R5: `train-fleet-router-from-ledger.mjs` — LIVE (correctly flagged NEEDS-VERIFICATION by S2)
- **MY FINDING:** This is **LIVE**, connected to the fleet-MLP training pipeline:
  - `MATCH file=_SYSTEM/Scripts/fleet-mlp-feedback.mjs term=train-fleet-router line=292 excerpt="runPostTrainSummary → trainFleetRouterFromLedger (batch replay from ledger)"`
  - `MATCH file=_SYSTEM/Scripts/fleet-router-mlp.mjs term=train-fleet-router line=120 excerpt="Exported for held-out eval Brier computation (train-fleet-router-from-ledger.mjs)"`
  - Referenced by `runFleet.mjs:298` and `fleet-mlp-feedback.mjs:350`
- **Caveat:** The MLP learn pipeline itself is gated behind `YURI_MLP_LEARN=1` (DISARMED by default), but the script and its callers exist and are wired.
- **Verdict:** LIVE but DISARMED-gated. KEEP. S2 correctly flagged as NEEDS-VERIFICATION.

---

## MEMORY BRIDGE TRIO — S2 correct, H1 wrong

H1 flagged `memory-kernel-canonical-bridge.mjs`, `yuri-canonical-memory-import.mjs`, and `kagami-memory-consolidator.mjs` as potentially redundant. S2 correctly verified all three are non-overlapping. My independent verification confirms:

- **memory-kernel-canonical-bridge.mjs:** Called by `mcs-maintenance.mjs:16` (`import { syncLedgerToCanonical }`). 6 live refs including test.
- **yuri-canonical-memory-import.mjs:** Called by `yuri-proving-run-repeatable.mjs:13`, listed in `yuri-truth-promotion-enforcement.mjs:33` registry. 24+ live refs.
- **kagami-memory-consolidator.mjs:** Called by `kagami-subconscious-e2e.test.mjs:10`, `kagami-memory-consolidator.test.mjs:6`. Different substrate (Qwen local model audit pass over `.claude/memory/*.md`).

**Verdict:** All three KEEP. S2 correctly caught H1's false positive.

---

## HOOK/GATE FINDINGS — S2 + H2 findings verified

### Three drifted protected-path denylists (CONFIRMED)
- `bash-security-guard.js` — BLOCKED_CLAUDE_FILES Set
- `yuri-safety-core.mjs` — PROTECTED_TARGETS/PROTECTED_LITERAL_PATTERNS (verified missing `.git/`)
- `yuri-z-brain.py` — inline PROTECTED tuple (verified missing `~/.aws/`, `~/.npmrc`, etc.)

**Verdict:** CONFIRMED overlap + drift risk. This is the highest-leverage consolidation, not a cut.

### `tirith-url-guard.js` — NOT dormant (H2 claim partially wrong)
- **H2 claim:** "Dormant — no tirith binary installed by default"
- **MY FINDING:** `~/.hermes/bin/tirith` EXISTS as a real Mach-O arm64 binary (10MB, dated May 8). The guard is **ARMED but passive** — it only activates on URLs in commands, and `TIRITH_FAIL_LOUD=1` defaults off (silent exit on error).
- **Verdict:** Not dormant. Conditionally active. The "default fail-open" posture is accurate, but the binary IS present.

### `energy-enforce.mjs` — DISARMED (CONFIRMED)
- Enforcement requires `YURI_ENERGY_ENFORCE=1` env OR `_SYSTEM/state/energy-enforce.enabled` flag file. Neither present. Default = metrics-only burn-in.
- **Verdict:** H2 correct. DISARMED confirmed.

### `pre-tool-gate.js` → `pre-tool-use.js` merge — NEEDS-VERIFICATION
- `pre-tool-gate.js` (115 lines): DeepSeek routing for large reads. Never blocks.
- `pre-tool-use.js` (191 lines): 4-tier memory compaction + cross-terminal state. Never blocks.
- **Verdict:** Functionally adjacent but distinct concerns (routing vs compaction). Merge is LOW value. NEEDS-VERIFICATION on exact routing logic overlap — but I see no evidence they share code paths.

---

## SKILLS FINDINGS (H3)

### `test-driven-development` + `tdd` — CONFIRMED duplicate dirs
- Both exist: `.claude/skills/test-driven-development/SKILL.md` and `.claude/skills/tdd/SKILL.md`
- **Verdict:** NEEDS-VERIFICATION (content diff required before merge, but filesystem confirms two dirs).

### `cgs-mold.md` command — CONFIRMED missing
- `test -f .claude/commands/cgs-mold.md` → MISSING. Confirms H3.

### `haki-intent` / `hatch-pet` status — NEEDS-VERIFICATION (H3 correctly uncertain)

---

## SUMMARY TABLE

| Item | H1 Verdict | S2 Verdict | **MY Verdict** | Evidence Strength |
|---|---|---|---|---|
| `lane-dispatcher.mjs` | Maybe redundant | DEAD orphan | **CONFIRMED DEAD** | HIGH (zero callers, self-check fails) |
| `codex-offload-runner.mjs` | Retired | DEAD (trusted H1) | **⚠️ LIVE — 4 callers** | HIGH (grep + import verification) |
| `pulse-lane-dispatch.mjs` | Retired | DEAD (trusted H1) | **⚠️ LIVE — exec'd by llm-compat.sh** | HIGH (shell caller found) |
| `nano-compact-gate.mjs` | Uncertain orphan | LIVE | **LIVE** (S2 correct) | HIGH (import chain verified) |
| `spreading-activation-gate.mjs` | Uncertain orphan | LIVE | **NEEDS-VERIFICATION** (S2 over-claimed) | MEDIUM (zero .mjs importers; only graph state) |
| `gate-rerank.mjs` | Orphan candidate | DOES NOT EXIST | **CONFIRMED: does not exist** | HIGH (test -f fails) |
| `multi-horizon-gate.mjs` | Orphan candidate | DOES NOT EXIST | **CONFIRMED: does not exist** | HIGH (test -f fails) |
| `train-fleet-router-from-ledger.mjs` | Maybe superseded | NEEDS-VERIFICATION | **LIVE (DISARMED-gated)** | HIGH (fleet-MLP pipeline refs) |
| `nisaba-sentinel.mjs` | Dead | (not addressed) | **CONFIRMED DEAD** (file gone) | HIGH |
| Memory bridge trio (3 scripts) | Maybe redundant | KEEP all 3 | **KEEP all 3** (S2 correct) | HIGH (distinct callers verified) |

---

## FAILURE-MODE ANALYSIS — Why the over-claims happened

1. **Shell-blindness:** H1 and S2 both grepped `.mjs`/`.js`/`.cjs` but not `.sh` files. `pulse-lane-dispatch.mjs` is called from `llm-compat.sh` — invisible to `.mjs`-only grep. **This is the most dangerous class of false positive: a script with zero `.mjs` callers that is still exec'd from shell.**

2. **Comment-trusting:** "retired 2026-05-29" in `pulse-lane-dispatch.mjs` referred to a FEATURE (semantic-memory retrieval), not the SCRIPT. H1 read the comment, not the code path.

3. **S2 trusted H1 on `codex-offload-runner.mjs`:** S2 explicitly said "H1 correct" for this one without running its own grep. A direct grep would have found 4 live callers in 2 seconds.

4. **Graph-state ≠ liveness:** `spreading-activation-gate.mjs` appears in `yuri-knowledge-graph.json`, but graph state is auto-generated and lists ALL scripts. Graph presence is not import presence.

5. **Test-file comments ≠ retirement:** `codex-offload-runner.test.mjs` notes about retirement refer to the OLD offload architecture, but the script was repurposed as a codex CLI runner for `worker-bridge`, `task-queue`, `yuri-sandbox-loop`, and `memory-proposal-autopilot`.

---

## RECOMMENDED ACTION

**Safe to archive (CONFIRMED-dead):**
- `lane-dispatcher.mjs` (zero callers, self-check fails)
- `nisaba-sentinel.mjs` (file already gone; dead role reference in llm-compat-contract.mjs:986 can be cleaned)

**DO NOT CUT (REFUTED — live code):**
- `codex-offload-runner.mjs` — 4 live callers
- `pulse-lane-dispatch.mjs` — exec'd by `llm-compat.sh:51`

**NEEDS-VERIFICATION before any cut:**
- `spreading-activation-gate.mjs` — zero `.mjs` importers; may be a roadmap-organ prototype. Trace whether any live energy-session invocation exists.
- `test-driven-development` vs `tdd` skill — filesystem confirms two dirs, but content diff needed.
- `haki-intent` / `hatch-pet` skill status.

**Consolidation (not cuts):**
- Three drifted protected-path denylists → consolidate onto `evaluateToolCall` (S1/S2 recommendation, confirmed valid).
- Voice-brain inline gate (`yuri-z-brain.py:296-390`) → port onto `evaluateToolCall` (S1 CRIT finding #1, confirmed valid).

---

07GL_ADJUDICATOR_CUT_VERIFICATION_REFUTED_2_FALSE_POSITIVES_P_PASS_COMMITTED