# Origin Entry Point — Adversarial Bridge Review

**Lane:** YURI Originator advisory lane B. Advisory only; no code edits. Grounded in the live files and verified tests.

---

## 1. Current State (What We Actually Have)

The "Origin" already has a shape — it's just fractured across two platforms rather than unified at one entry point.

| Surface | Docks to core hooks? | Energy ΔU traced? | Memory recall? | Evidence ledger? | Symbiotic pulse? |
|---|---|---|---|---|---|
| **Claude** (native session) | N/A — IS the core | Via PreToolUse hook | Via cold-store | Via memory-kernel | Via CLAUDE.md pulse contract |
| **DeepSeek / Kimi / Nemotron** (`llm-lane.mjs`) | ✅ `lane-core-hooks.mjs` → `coreOnDispatch` + `coreOnResult` | ✅ `traceDispatchEvent` via `yuri-energy-dispatch-bridge.mjs` | ✅ `yuri-recall.mjs` → recall block injected into system prompt | ✅ `_SYSTEM/state/memory-ledger.jsonl` append | ✅ `_SYSTEM/state/lane-pulse-trace.jsonl` append |
| **Codex** (`codex-offload-runner.mjs`) | ❌ NOT wired — "separate platform, open option" (LANE-MANUAL.md §5, HANDOFF §Residuals) | ❌ No `traceDispatchEvent` call | ❌ No recall block | ❌ No evidence ledger entry | ❌ No pulse trace |
| **Gemma / Ollama** (`ollama-lane.mjs`) | ✅ `lane-core-hooks.mjs` | ✅ via same bridge | ✅ via same recall | ✅ via same ledger | ✅ via same pulse |

The **critical asymmetry**: when Claude dispatches Codex via `yuri-offload-mcp.mjs`, the MCP wraps `llm-compat.sh` → `codex-offload-runner.mjs`. That runner builds its own `traceId`, timestamp, and dry-run preview, but **never calls `coreOnDispatch` or `coreOnResult`**. So a Codex lane turn is invisible to the energy landscape, memory recall, and evidence ledger — and the docked-output pulse contract is not enforced.

---

## 2. Failure Modes

### FM-1: Silent energy gap — Codex lane actions are ΔU=0
Every DeepSeek dispatch increments the energy trace via `traceDispatchEvent`. Codex dispatches produce zero telemetry events. The energy landscape (the Lyapunov-style `gateProposal` reject guard) cannot see Codex-induced state transitions. An attacker who knows the asymmetry routes destructive work through Codex to evade the energy gate.

**Evidence:** `codex-offload-runner.mjs` contains zero imports of `lane-core-hooks.mjs` or `yuri-energy-dispatch-bridge.mjs`. Grep confirms `traceDispatchEvent` appears only in `lane-core-hooks.mjs` (import + call site) and `yuri-energy-dispatch-bridge.mjs` (definition).

```
TERM_COUNT term="traceDispatchEvent" count=3
MATCH file=_SYSTEM/Scripts/lane-core-hooks.mjs term="traceDispatchEvent" line=39 excerpt="import { traceDispatchEvent }"
MATCH file=_SYSTEM/Scripts/codex-offload-runner.mjs term="traceDispatchEvent" count=0
```

### FM-2: Codex memory amnesia — no cold-store recall
DeepSeek/Kimi/Nemotron calls receive a `<subconscious-recall>` block with the top-K associative memory items from `yuri-recall.mjs`. Codex calls get their `--context` files + the YURI spine, but NO recalled memory — so Codex can't leverage episodic YURI memory unless the dispatcher explicitly front-loads every memory file. This is a real operational degradation: Codex is the primary implementation lane, yet it operates with less situational awareness than advisory DeepSeek.

### FM-3: Docked-output pulse contract unenforced on Codex
`yuri-origin.md` mandates: "Symbiotic pulse is mandatory for every visible input: user input, assistant self-proposed action, tool result, **docked LLM output**, handoff, plan, and final claim." Codex output bypasses the pulse contract entirely. Claude handles the pulse on *receiving* Codex output manually, but there is no automated `advisory_only`/`local_truth_claim:false` stamp on the Codex result in the pulse trace.

### FM-4: Evidence ledger asymmetry
When DeepSeek produces output, it lands in `memory-ledger.jsonl` with `type: lane_output`, `contentSha256`, `via: llm-lane`. When Codex produces output, the MCP adapter logs through `kernel.py mem-log` with `channel: codex-offload` — a DIFFERENT schema, different store. Cross-lane evidence aggregation cannot correlate them.

### FM-5: Two entry points, two loadouts — drift risk
`codex-offload-runner.mjs` builds its own system prompt from AGENTS.md + `.codex/skills/yuri-control-plane-first/SKILL.md`. `llm-lane.mjs` builds its system prompt from `buildYuriLoadout()` (SPINE_FILES + OPERATING_DIRECTIVE). These are DIFFERENT loadouts. If the spine changes (e.g., an authority rule shifts in `yuri-origin.md`), the llm-lane front gets the update; Codex may not until someone manually syncs the Codex skill. This is a drift-inducing dual-write problem.

### FM-6: The MCP boundary as silent failure point
`yuri-offload-mcp.mjs` calls `spawnSync('bash', [LLM_COMPAT_SH, ...])` with `maxBuffer: 10MB`. If Codex produces >10MB of stdout (a long tool-using session), the spawnSync silently truncates with a `maxBuffer` error. The MCP marks this as `FAILED`, but the lane's actual work may have been correct — it just couldn't fit through the MCP pipe. No partial-result recovery exists.

### FM-7: Codex `danger-full-access` sandbox with no core-hooks energy gate
`codex-offload-runner.mjs` defaults `gpt-5.5` to `danger-full-access` (owner directive). The safety gate is `.codex/hooks/pre-tool-use.mjs` → `yuri-safety-core.mjs`, which blocks destructive ops and protected paths. But there is NO energy-gate vector — `gateProposal` never fires on a Codex-proposed mutation. If Codex were to propose a HIGH-risk structural change, the energy landscape cannot reject it pre-commit. Claude must catch this manually.

---

## 3. Verification Gates (What Must Pass)

### Gate-1: `lane-core-hooks` wiring into Codex dispatches
Wire `coreOnDispatch` (energy ΔU + memory recall) and `coreOnResult` (evidence ledger + pulse) into `codex-offload-runner.mjs` at the same two points: before the `codex` spawn, and after the stdout collection. Verify:
- `traceDispatchEvent` fires with the Codex lane label and stable `runId`.
- The recall block is injected into the Codex system prompt (or attached as context).
- Evidence lands in `memory-ledger.jsonl` with `type: lane_output, via: codex-offload-runner`.
- Pulse lands in `lane-pulse-trace.jsonl` with `authority: advisory_only, source: docked-llm, lane: codex`.

### Gate-2: Energy landscape can see Codex state transitions
After Gate-1, verify that `gateProposal` (in `yuri-energy.mjs`) can evaluate Codex-proposed transitions. The bridge's current synthetic ΔU=0 for observability mode is fine for A.2.a (baseline). Action mode (real ΔU) requires the Codex hook to supply `*Before`/`*After` counts — wire the PreToolUse hook to capture state snapshots.

### Gate-3: Single loadout, not dual-write
Converge on ONE canonical loadout builder. `buildYuriLoadout()` in `llm-lane.mjs` is the better implementation (reads live files, assembles the spine deterministically). The Codex path should use the same function — or the session should generate ONE loadout that both platform adapters consume, rather than each adapter maintaining its own prompt assembly.

### Gate-4: Cross-lane evidence ledger schema alignment
The Codex path logs through `kernel.py mem-log` (schema: `{task_id, channel, source, event, intent, lane, prompt_hash, files, dry_run, mutation_allowed}`). The llm-lane path logs through `appendJsonl` in `lane-core-hooks.mjs` (schema: `{timestamp, type, lane, runId, exitCode, bytes, content, contentSha256, via}`). These differ in keys, structure, and store. Align them — or build a single `appendEvidence` function in `lane-core-hooks.mjs` that both paths call.

### Gate-5: MCP transport defense
The 10MB `maxBuffer` on `spawnSync` is a hard ceiling. Verify that long Codex tool sessions don't produce >10MB of stdout (a real session might). Options: stream rather than buffering, or chunk through the MCP in multiple calls with continuation tokens.

---

## 4. Minimal Next Implementation Path

The shortest path with the highest ROI — each step is testable and commits can be separated:

### Step 1: Wire `coreOnDispatch`/`coreOnResult` into `codex-offload-runner.mjs`
This is the single injection that connects Codex to the energy landscape, memory recall, evidence ledger, and pulse. Two call sites: one before the `codex` spawn (coreOnDispatch → energy + recall), one after stdout collection (coreOnResult → evidence + pulse). The module already imports from `../_SYSTEM/Scripts/` (`token-ledger.mjs`) — same pattern. ~15 lines of code. **This alone closes FM-1, FM-2, FM-3, FM-4.**

### Step 2: Converge loadout. Have `codex-offload-runner.mjs` call `buildYuriLoadout()` or a shared spine builder.
Either export `buildYuriLoadout` from `llm-lane.mjs` and import it in `codex-offload-runner.mjs`, or extract the spine assembly into a shared `_SYSTEM/Scripts/yuri-loadout.mjs`. The Codex AGENTS.md spine + control-plane-first skill can then reference the same live files rather than a static copy. **Closes FM-5.**

### Step 3: Unify evidence schema. Replace `kernel.py mem-log` in the Codex path with `lane-core-hooks.mjs` ledger append.
The MCP adapter currently calls Python `kernel.py mem-log`. Replace with a direct `appendJsonl` call to the same ledger file that `lane-core-hooks.mjs` uses — or route through `coreOnResult`. **Closes FM-4 completely.**

### Step 4: (Owner-gated) Wire the energy gate into the Codex PreToolUse hook.
After Step 1 gives us telemetry, this step makes the energy gate *enforcing* for Codex. The existing `.codex/hooks/pre-tool-use.mjs` already delegates to `yuri-safety-core.mjs`. Add a `gateProposal` check on Codex-proposed mutations before allowing them. This is the defense-in-depth step that closes FM-7. **Start in observability mode, promote to enforcing after a burn-in period.**

### Step 5: MCP transport hardening. Replace `spawnSync` + `maxBuffer` with streaming or chunked output.
The MCP calls `spawnSync` with a fixed buffer. For long Codex sessions, replace with a streaming pipe that writes partial results to a file and the MCP returns a handle + completion notification. Or keep the sync call but raise `maxBuffer` to 100MB and add a truncation-detection guard. **Closes FM-6.**

---

## 5. Stale-Surface Cleanup List

These surfaces are dead, duplicated, or superseded by the llm-lane consolidation — removing them sharpens the Origin:

| Path | Reason | Action |
|---|---|---|
| `.codex/deepseek-offload.sh` | Superseded by `ai llm deepseek` / `llm-lane.mjs` | Archive or delete |
| `.codex/run-workhorse.sh` | Workhorse routing retired; llm-lane is the single dispatch | Delete |
| `.codex/adapters/yuri-offload-mcp.mjs` references to `OFFLOAD_*` env vars | Rename was done for most files; MCP adapter still references `OFFLOAD_PROMPT_TEXT` → should be `LLM_COMPAT_*` | Audit and rename |
| `.codex/agents/` directory | Contains 0 files matching the actual `.agents/agent-index.json` agents; may be a stale Codex plugin cache | Investigate, archive if unused |
| `_SYSTEM/Scripts/codex-yuri.sh` | Calls `pulse-packager.mjs` (a script not found in the current tree — possibly removed). The `YURI_ENTRY_POINT=codex` env var it sets is a good pattern to preserve | Fix pulse-packager ref or retire the script, preserve the env-var pattern |
| `_SYSTEM/Scripts/codex-mirror-tui.mjs` | Unknown status; not referenced in any active index or manual | Investigate, archive if dead |
| `_SYSTEM/OS_KERNEL/syscalls/kernel.py` `mem-log` path | Schema mismatch with `lane-core-hooks.mjs` evidence ledger. If Step 3 above unifies, this kernel function becomes dead code | Retire after schema unification |
| Duplicate lane tables | `llm-compat-contract.mjs` maintains a lanes table; `.claude/config/models.json` maintains `llm_compat_lanes`; `llm-lane.mjs` reads from models.json at runtime. The contract's lane table is partially stale (e.g., it still lists `gemma-local` etc. but the authoritative source is models.json) | Single-source: models.json is the roster; contract should reference it, not duplicate |

---

## 6. Equations Worth Preserving

These are the math primitives that both platforms should dock onto — they already exist in `math-kernel.mjs` + `yuri-energy.mjs` and are tested and proven:

### Scalar Potential (the energy landscape)
```
U(state) = α·H(claimDist) + β·KL(claimed‖verified) + γ·logLoss(preds,outs) 
         + δ·Brier(forecasts,results) + ε·(−infoGain_norm) + ζ·staleness 
         + η·protectedViolations + θ·ladderInversions + ι·(−log1p(verifiedCount_capped))
         + κ·repeatedFailures + λ·malformedForecasts
```
Where `infoGain_norm = IG / log(n)` (divisively normalized to [0,1], buy-back fixed). The gate: `ΔU ≤ threshold → accept; protectedViolations increase → HARD VETO; ladderInversions increase → STRUCTURAL FLOOR; maxLadder > cap → L∞ MAX-SEVERITY FLOOR`.

### Evidence Contract
```
evidence_quality ∝ min(verifiedEvidenceCount, CAP)  — logarithmic credit, bounded below
staleness = Σ max(0, base - confidenceDecay({base, age, halfLife}))
```

### Lane Merge (arbitrary dependence)
```
e_merged = weightedMean(eValues, weights)  — the only admissible merge under arbitrary dependence
// Product merge is ONLY valid for provably-independent lanes
```

### Transfer Distance (cross-domain)
```
scoreTransfer(t) = fieldDistance · mechanismFrameBridge · structuralConf
// Blocked when prerequisite gate fires (BLOCKED, not a scalar)
```

### CUSUM Change Detection
```
S_t = max(0, S_{t-1} + (x_t - μ₀) - k)
alarm when S_t > h
```
Useful for detecting slow regime drift in lane output quality — a Codex lane that's gradually degrading won't trip a single-outlier threshold but WILL trip CUSUM.

### Scalar Kalman Recovery
```
predict: σ² += q
innovate: y = z - x̂, S = σ² + r
gain: K = σ²/S
update: x̂ += K·y, σ² = (1-K)·σ²
surprise when y > 0 ∧ y²/S > χ²(1,0.95)
```
One-sided NIS gating (only positive innovations — only "things got worse" — count as surprises). Tracks lane output quality with re-sensitization via process noise q.

---

## 7. The One-Line Architecture

The Origin shape that makes platform switching real:

> **Every platform adapter calls the SAME `lane-core-hooks.mjs` → `coreOnDispatch({lane, prompt, runId})` AND `coreOnResult({lane, output, exitCode, runId})`, period.** The hook fires energy ΔU, memory recall, evidence ledger, and docked-output pulse — identically for Codex, Claude, DeepSeek, Kimi, Nemotron, Gemma, and any future model. The platform adapter's only job is: (1) prepare the prompt, (2) call the model, (3) collect the output. Everything else is the core seam.

Today: llm-lane + ollama-lane use the seam. Codex does not. Close that gap and you have a single Origin.