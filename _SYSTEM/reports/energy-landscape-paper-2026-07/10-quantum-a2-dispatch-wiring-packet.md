# Quantum Rick Packet — Workstream A.2 (Observability Mode): Gate-Dispatch Wiring

**Status:** ready for dispatch
**Drafted by:** Claude (Opus, main thread)
**Lane:** Quantum-Opus per `FB:QUANTUM-OPUS-UPGRADE`
**Predecessor:** A.1 telemetry layer — Codex PASS, 68/68 tests, Privacy Gate v3
**Architecture reference:** `_SYSTEM/reports/energy-landscape-paper-2026-07/01-sandbox-simulation-architecture.md` Section 2 Layer 2
**Operator decisions:** `04-operator-decisions.md` Q4 (observability-only initially, action mode after B.1 review)

---

## CLAUDE CONTROL PACKET

### Goal

Wire `gateProposal()`-via-telemetry into three real YURI dispatch surfaces such that every dispatch is **evaluated by the gate but never blocked**, producing a JSONL telemetry stream that feeds Workstream B.1's data collection. Behavior of the dispatch surfaces themselves must be **byte-identical** to pre-A.2 when observability mode is off, and **observably-unchanged** when it is on.

### Target files

**Create:**

- `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs` — the integration layer between dispatch surfaces and the trace module
- `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs` — tests

**Modify (minimal, additive only):**

- `_SYSTEM/Scripts/shintai-dispatch.mjs` — single hook call per dispatch
- `_SYSTEM/Scripts/offload-runner.mjs` — single hook call per dispatch
- `_SYSTEM/Scripts/claude-codex-final-pass.mjs` — single hook call per dispatch

Do not refactor any of the three dispatch surfaces. Add exactly the lines required to invoke `traceDispatchEvent`.

### Bridge module spec

The bridge exposes a single function (plus a default-off env-var control):

```js
// _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs

/**
 * Trace a dispatch event in observability mode.
 *
 * Returns immediately (no I/O, no error) if YURI_ENERGY_OBSERVABILITY !== '1'.
 * When enabled, builds a synthetic state pair representing the dispatch event,
 * runs traceGateEvaluation, and appends a record. Errors are swallowed
 * silently with a single stderr warning per process to satisfy the
 * non-negotiable rule: telemetry must never affect dispatch outcome.
 *
 * @param {Object} args
 * @param {string} args.lane             - dispatch surface name: 'shintai' | 'offload' | 'codex-final-pass'
 * @param {string} args.runId            - synthetic identifier per dispatch (e.g., ISO timestamp + lane)
 * @param {Object} [args.numericContext] - schema-compatible numeric fields (counts, sizes, etc.)
 * @returns {void}
 */
export function traceDispatchEvent({ lane, runId, numericContext = {} }) { ... }

export function isObservabilityEnabled() {
  return process.env.YURI_ENERGY_OBSERVABILITY === '1';
}
```

Key behaviors:

- **Default OFF.** Without `YURI_ENERGY_OBSERVABILITY=1`, the function is a no-op. Zero file I/O. Zero performance cost beyond the env-var check.
- **Error isolation.** Wrap the telemetry path in try/catch. Catch any error (validation throw, file write failure, anything). Log one warning per process to stderr. Never rethrow. The dispatch must complete identically whether telemetry succeeded or failed.
- **Schema-compatible state synthesis.** A dispatch event does not naturally have a "stateBefore/stateAfter" delta in the Privacy Gate v3 schema. Construct a minimal placeholder:
  - `stateBefore_summary` and `stateAfter_summary` filled with zeros for the standard fields
  - Numeric context (e.g., prompt length, lane count, tier) goes into the appropriate numeric fields (e.g., `evidence_count`, `predictions_count`) where the analogy fits; otherwise omit
  - This produces ΔU = 0 for every dispatch — that is honest for A.2.a (we're capturing the *fact* of the dispatch, not measuring its effect on a state we don't yet track)
- **Privacy Gate compliance.** The bridge must only emit records that pass `validateRecord`. Do not pass raw paths, prompt content, transcript bodies, lane-instance IDs beyond the canonical name, or any free-text field. If any caller passes such content, the bridge strips it before construction.

### Integration points

In each of the three dispatch surfaces, add **exactly one call** to `traceDispatchEvent` at the right hook point:

**`_SYSTEM/Scripts/shintai-dispatch.mjs`:** at the entry of the main dispatch function (after task normalization, before lane fanout). Use `lane: 'shintai'`, `runId: synthesizeRunId('shintai')`, and numericContext including the assembled-team size and tier.

**`_SYSTEM/Scripts/offload-runner.mjs`:** at the entry of the main offload function (after argument parsing, before model call). Use `lane: 'offload'`, runId derived, numericContext including model alias slot, output cap, and prompt char length (NOT prompt content).

**`_SYSTEM/Scripts/claude-codex-final-pass.mjs`:** at the entry of the main Codex final-pass function (after packet resolution, before Codex CLI invocation). Use `lane: 'codex-final-pass'`, runId derived, numericContext including reasoning level slot and packet character length (NOT packet content).

For all three: the hook is **fire-and-forget**. Synchronous call that returns void. No awaiting, no result usage.

### Constraints

- **Observable-behavior preservation.** A dispatch with `YURI_ENERGY_OBSERVABILITY=1` must produce identical observable behavior to one with the env var unset — same stdout, same stderr (except the optional one-time bridge-error warning), same return value, same files written by the dispatch itself.
- **No new imports in dispatch surfaces beyond the bridge.** Do not import `yuri-energy.mjs` or `yuri-energy-trace.mjs` directly from the dispatch surfaces. Only the bridge imports them.
- **The bridge is the only file that touches `yuri-energy-trace.mjs` from outside the math substrate.** This preserves the separation between math substrate and dispatch infrastructure.
- **No new dependencies.** Node stdlib + existing yuri-energy / yuri-energy-trace exports only.
- **No mutation of caller state.** Per A.1's discipline.
- **Telemetry never propagates errors.** This is non-negotiable. If `traceDispatchEvent` ever throws into the dispatch path, the implementation has a bug.

### Acceptance criteria

1. New file `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs` exists with exports `traceDispatchEvent` and `isObservabilityEnabled`.
2. New file `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs` exists with ≥ 12 passing tests covering:
   - Default OFF: `traceDispatchEvent` is a no-op when env var unset (no file written, no error)
   - ON: `traceDispatchEvent` writes a trace record when env var = '1'
   - Trace record passes `validateRecord` (Privacy Gate v3 compliance)
   - Numeric context fields map correctly into stateAfter_summary
   - Errors inside the telemetry path are caught and do not propagate (use `appendTrace` mocked to throw, verify caller does not see the error)
   - The one-time stderr warning fires once per process on telemetry error
   - `isObservabilityEnabled` returns false for unset, false for '0', false for 'true', true only for '1'
   - Schema-incompatible caller input (e.g., free-text in numericContext) is stripped or rejected before bridge emits the record
   - Concurrent calls do not corrupt state
3. The three modified dispatch surfaces each have exactly one new `import` line and exactly one new `traceDispatchEvent` call. Verify via diff.
4. With `YURI_ENERGY_OBSERVABILITY` unset, all existing tests still pass:
   - `node --test _SYSTEM/Scripts/shintai-dispatch.test.mjs` no regression
   - `node --test _SYSTEM/Scripts/offload-runner-rails.test.mjs` no regression
   - `node --test _SYSTEM/Scripts/claude-codex-final-pass.test.mjs` no regression
5. With `YURI_ENERGY_OBSERVABILITY=1` set in env, a smoke test runs each dispatch surface (mocked or real) and confirms a trace record appears in `<tmpDir>/energy-trace/<date>.jsonl`.
6. Privacy Gate v3 (A.1) tests still pass: `node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` returns 39/39.
7. Root-architecture test passes: `node --test _SYSTEM/Scripts/root-architecture.test.mjs`.

### Test command

```bash
# Bridge tests
node --test _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs

# No regression in upstream surfaces
node --test _SYSTEM/Scripts/shintai-dispatch.test.mjs
node --test _SYSTEM/Scripts/offload-runner-rails.test.mjs
node --test _SYSTEM/Scripts/claude-codex-final-pass.test.mjs

# A.1 still clean
node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs
node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs

# Architecture invariant
node --test _SYSTEM/Scripts/root-architecture.test.mjs

# Full sweep should report all-pass
```

### Rollback boundary

If acceptance fails:
```bash
# Delete bridge files
rm _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs \
   _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs
# Revert dispatch surface modifications
git checkout _SYSTEM/Scripts/shintai-dispatch.mjs \
              _SYSTEM/Scripts/offload-runner.mjs \
              _SYSTEM/Scripts/claude-codex-final-pass.mjs
```

### Route-plan classification

- `lane: quantum-rick (Opus)`
- `scenario: implementation-substrate-wiring`
- `tier: focused-implementation-high-stakes`
- `qualityGate: main-session-review + codex-final-pass-required`
- `codexPolicy: required-final-pass` (substrate code modifying live dispatch paths)

### Adversarial verification (Quantum self-checks before reporting done)

Five failure modes to verify:

1. **Telemetry-error-propagation leak.** Construct a test where `traceGateEvaluation` is forced to throw (e.g., by passing an invalid lane name to the bridge that fails validation). Confirm the calling dispatch surface does NOT see the error — it must complete normally. If the dispatch surface receives the error, the try/catch around telemetry has a gap.

2. **Observability default-OFF leak.** Unset `YURI_ENERGY_OBSERVABILITY`. Run a dispatch. Confirm zero file writes to `_SYSTEM/state/energy-trace/` (or to any path under `YURI_STATE_DIR` if set). The default-OFF path must be truly silent.

3. **Privacy Gate leak via numericContext.** Construct a caller that passes a `numericContext` containing a free-text string (e.g., `numericContext: { promptBody: "secret" }`). Confirm the bridge either strips the forbidden field before record construction or rejects the call entirely. The forbidden content must not appear in any written record.

4. **Observable-behavior drift.** Capture stdout + stderr + return value of a dispatch surface call with observability OFF. Capture same with observability ON. Diff. The two captures must be identical (modulo the optional one-time bridge-error warning, which should not fire under normal operation).

5. **Concurrent bridge calls.** Two dispatches firing simultaneously must both produce valid trace records with distinct runIds. No interleaved JSONL lines. (Reuses A.1's parallel-append safety, exercised here via the bridge.)

### What Quantum returns

A single message containing:
1. Confirmation of files created and modified, with line counts.
2. Test results — count per suite, all-pass confirmation.
3. Five adversarial self-check results.
4. `git diff --stat` scoped to the modified dispatch surfaces (confirms only one new import + one new call each).
5. Residual risk statement.
6. Integration findings (peer-lane neutral voice).

---

## Dispatch command

```bash
node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick (Opus) — Workstream A.2.a gate-dispatch wiring. Full Claude Control Packet at _SYSTEM/reports/energy-landscape-paper-2026-07/10-quantum-a2-dispatch-wiring-packet.md. Run 'bash _SYSTEM/Scripts/ai route-plan implementation-substrate-wiring' first. Build new bridge module + test, modify 3 dispatch surfaces with exactly one import + one call each. Observability mode is DEFAULT OFF — env var YURI_ENERGY_OBSERVABILITY=1 to enable. Telemetry MUST NEVER affect dispatch outcome — error isolation is non-negotiable. Privacy Gate v3 compliance from A.1 is enforced via the bridge. Apply 5 adversarial self-checks. Full test sweep before reporting." --execute
```
