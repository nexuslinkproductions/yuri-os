# Rick Prime — A.2 Dispatch Wiring Certification

C-137 → Rick Prime. A.2.a (observability-mode gate-dispatch wiring) landed via Quantum. Per `codexPolicy: required-final-pass` for substrate code modifying live dispatch paths, requesting your review before flipping `YURI_ENERGY_OBSERVABILITY=1`.

## Files to review

**New:**
- `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs` (107 lines)
- `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs` (18 tests)

**Modified (3 lines each — surgical):**
- `_SYSTEM/Scripts/shintai-dispatch.mjs`
- `_SYSTEM/Scripts/offload-runner.mjs`
- `_SYSTEM/Scripts/claude-codex-final-pass.mjs`

Diff inspection confirms exactly 1 import + 1 `traceDispatchEvent` call per modified file.

## Test evidence (locally re-run)

117/117 PASS across all suites:
- `yuri-energy-dispatch-bridge`: 18/18
- `shintai-dispatch`: 17/17 (no regression)
- `offload-runner-rails`: 13/13 (no regression)
- `claude-codex-final-pass`: 1/1 (no regression)
- `yuri-energy-trace`: 39/39 (no regression)
- `yuri-energy`: 28/28 (no regression)
- `root-architecture`: 1/1

## What I need from you — focus on four surfaces

### 1. Error-isolation completeness

The bridge wraps the telemetry path in try/catch. Verify:
- Are there any code paths in `traceDispatchEvent` that could throw OUTSIDE the try/catch? (e.g., parameter destructuring failures, the `isObservabilityEnabled()` env-var read)
- Does the catch handler itself have a failure mode (e.g., the stderr warn path)? If the warn writes itself fails, does it propagate?
- Is the one-time-per-process warning sentinel properly scoped — could it leak across worker processes via shared module state?

### 2. Observable-behavior preservation

The hook is supposed to be invisible to the dispatch surfaces. Verify by inspecting each modified file:
- `shintai-dispatch.mjs` — hook in `runAdvisory` after assembly. Does the hook fire BEFORE or AFTER any side-effecting work (file writes, network calls, stdout writes)? It should fire at a point where, if it threw, the dispatch would still complete normally.
- `offload-runner.mjs` — hook fires AFTER quarantine substitution. Quantum noted this means dry-run paths exit before the hook (line 151–156 exits before line 174). Verify this is intentional and not a missed observability surface.
- `claude-codex-final-pass.mjs` — hook fires after handoff.json write, before spawnSync. Verify this is the right placement.

### 3. Privacy Gate v3 compliance via numericContext sanitization

The bridge has a `sanitizeNumericContext` function (per Quantum's SC-3 verification) that strips non-finite-numeric values from caller-supplied context. Verify:
- Are there any caller paths that bypass `sanitizeNumericContext`?
- Does the sanitizer handle every Privacy-Gate-forbidden type (strings, functions, symbols, Maps, Sets, Dates, custom classes, BigInt) — or only the obvious ones?
- The bridge then passes the sanitized context into the trace record. Does the final record actually pass `validateRecord` post-sanitization? (i.e., is there a gap between "sanitized" and "actually safe to serialize"?)

### 4. `_resetWarnOnce` production-surface concern

Quantum flagged this as residual risk: `_resetWarnOnce()` is test-only but exported. A production caller importing and calling it would re-enable the one-time warning sentinel, producing repeated stderr noise under sustained error conditions. Verify:
- Is the JSDoc warning sufficient, or should there be a runtime guard?
- Would moving `_resetWarnOnce` to a `.test-helpers.mjs` sidecar be a cleaner separation, or is the current export-with-JSDoc-marker acceptable?

## What I want returned

1. **Verdict:** PASS / NEEDS_FIX / BLOCKED.
2. **Error-isolation critique** — any gap in the try/catch coverage. Cite line numbers.
3. **Observable-behavior critique** — hook placement issues, or confirmation that placements are correct.
4. **Privacy Gate compliance critique** — any gap in `sanitizeNumericContext` coverage.
5. **`_resetWarnOnce` risk verdict** — accept JSDoc, recommend runtime guard, recommend sidecar move, or other.
6. **Recommendation:** ready to flip `YURI_ENERGY_OBSERVABILITY=1` and begin B.1 data collection? Or revise A.2 first?

## Hygiene state

- GitNexus current at `c9119c4`.
- 117/117 tests pass.
- A.2 files: 2 new, 3 modified (3 lines each). Diffs surgical.
- Operator-side note: Quantum lane indicator showed `s4.6` (Sonnet 4.6) during A.2 work — the Opus upgrade may not have been applied operator-side yet, but the work landed clean. Worth confirming Marcel's intent on lane model for A.2.b and subsequent dispatches.

## Discipline

- Peer-lane voice.
- Local truth required, cite line numbers.
- Read-only review.

Over to you, Prime.

— C-137
