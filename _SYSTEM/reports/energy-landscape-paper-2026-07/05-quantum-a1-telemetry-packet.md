# Quantum Rick Packet — Workstream A.1: Telemetry Layer

**Status:** draft, awaiting dispatch
**Drafted by:** Claude (Opus, main thread)
**Architecture reference:** [01-sandbox-simulation-architecture.md](01-sandbox-simulation-architecture.md), Section 2 Layer 1 + Section 5 implementation safety questions
**Operator decisions reference:** [04-operator-decisions.md](04-operator-decisions.md)
**Codex docs-only acceptance:** PASS (2026-05-28)

---

## CLAUDE CONTROL PACKET

### Goal

Implement Workstream A.1 — the telemetry layer that captures every gate evaluation as structured JSONL output. This is the foundation for Workstream B's empirical evidence: every experiment downstream reads telemetry produced by this module.

### Target files (create)

- `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` — telemetry module
- `_SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` — test suite
- Runtime state directory `_SYSTEM/state/energy-trace/` — gitignored; JSONL files land here as `<YYYY-MM-DD>.jsonl`
- New `.gitignore` entry: `_SYSTEM/state/energy-trace/`

### Module specification

The telemetry module exposes:

```js
// Pure record builder — does not write
export function buildTraceRecord({
  lane,              // canonical lane name ("main", "shintai", "deepseek-v4-pro", etc.)
  runId,             // string identifier per dispatch
  stateBefore,       // full state object (will be summarized internally)
  stateAfter,        // full state object (will be summarized internally)
  computeUResult,    // result of computeU(stateAfter, weights) — for U_after
  computeDeltaUResult, // result of computeDeltaU(stateBefore, stateAfter, weights)
  gateProposalResult, // result of gateProposal({stateBefore, stateAfter, weights, threshold, allowOverride})
  weights,           // weights used
  threshold,         // threshold used
})

// Returns: structured trace record (one JSONL line equivalent)

// Append to today's trace file
export function appendTrace(record, options = { traceDir, dateOverride })

// Tracing wrapper: invoke this around any gate evaluation
// to evaluate AND log in one call
export function traceGateEvaluation({
  lane,
  runId,
  stateBefore,
  stateAfter,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
})
// Returns: { record, gateResult } — caller uses gateResult.accept for downstream behavior
```

### Trace record schema (JSONL line shape)

Required fields:

- `timestamp`: ISO-8601 string, millisecond precision
- `runId`: string
- `lane`: canonical lane name
- `stateBefore_summary`: object with **only** these numeric/structural fields — no free text:
  - `claimPromotionDistribution`: object mapping promotion-ladder labels to counts
  - `claimedDistribution_length`: integer (length of array, not values)
  - `verifiedDistribution_length`: integer
  - `evidence_count`: integer
  - `evidence_age_stats`: { min, max, mean } in days
  - `predictions_count`: integer
  - `forecasts_count`: integer
  - `protectedPathViolations`: integer
  - `promotionLadderInversions`: integer
  - `verifiedEvidenceCount`: integer
- `stateAfter_summary`: same schema as stateBefore_summary
- `U_before`: number
- `U_after`: number
- `deltaU`: number
- `componentContributions`: object mapping component name to numeric value (entropy, klDivergence, logLoss, brier, informationGain, staleness, protectedPathViolations, promotionLadderInversions, verifiedEvidenceCredit)
- `componentDeltas`: object mapping component name to delta value
- `decision`: `"accept"` or `"reject"`
- `dominantTerm`: string or null
- `threshold`: number
- `allowOverride`: boolean
- `weights`: object (the full weight set used)
- `advisory_only`: boolean (always true for this module's output)
- `local_truth_claim`: boolean (always false for this module's output)

**Forbidden fields** (Layer 7 Privacy Gate compliance, enforced mechanically):
- No memory bodies
- No prompt text
- No transcript content
- No protected-path content
- No raw identifiers (user names, file paths beyond canonical lane names, lane-instance IDs, claim bodies)
- No credentials
- No evidence excerpts
- No free-text field of any kind

The module must **refuse to serialize** any record containing a string-typed field outside the allow-list (`timestamp`, `runId`, `lane`, `decision`, `dominantTerm`, weight keys, component name keys). Refusal mechanism: a validator function that runs before append and throws if any forbidden shape is detected.

### Constraints

- **Pure record builder, side-effect-free append.** `buildTraceRecord` must be a pure function. `appendTrace` is the only file-write surface.
- **Trace file path resolution honors `YURI_STATE_DIR`.** If `process.env.YURI_STATE_DIR` is set, traces go to `${YURI_STATE_DIR}/energy-trace/<date>.jsonl`. Otherwise default to `_SYSTEM/state/energy-trace/<date>.jsonl` resolved relative to repo root.
- **No mutation of input state objects.** The module operates on summaries; it must not modify the caller's state.
- **Deterministic output for identical input** (except timestamp). Two calls with the same arguments at the same instant must produce identical records.
- **Append-only.** The module never truncates, never rewrites, never deletes trace files. JSONL grows monotonically per day.
- **Concurrent-safe append.** Multiple lanes writing to the same trace file concurrently must not corrupt JSON lines. Use `fs.appendFileSync` with proper buffering; each line written atomically.
- **No network calls. No external dependencies beyond Node.js stdlib and `math-kernel.mjs` / `yuri-energy.mjs` exports.**

### Acceptance criteria

1. Module file exists at `_SYSTEM/Scripts/math/yuri-energy-trace.mjs`.
2. Test file exists at `_SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` with **≥ 20 tests, all passing**.
3. Tests cover (minimum):
   - `buildTraceRecord` returns valid record for typical input
   - `buildTraceRecord` is pure (does not mutate input)
   - Validator throws on records containing forbidden free-text fields
   - Validator throws on records containing forbidden raw-path fields
   - `appendTrace` honors `YURI_STATE_DIR` environment variable
   - `appendTrace` creates the date-stamped JSONL file if missing
   - `appendTrace` appends without truncating existing content
   - Concurrent-append safety (10 parallel writes produce 10 valid JSON lines)
   - `traceGateEvaluation` returns both `record` and `gateResult`
   - `traceGateEvaluation` records `decision: "accept"` for descending transitions
   - `traceGateEvaluation` records `decision: "reject"` for ascending transitions
   - `traceGateEvaluation` records `dominantTerm` correctly on rejections
   - JSONL line is valid JSON when parsed (round-trip test)
   - Trace record includes all required fields and excludes all forbidden fields
4. `.gitignore` includes `_SYSTEM/state/energy-trace/`.
5. Running `node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` returns all-pass.
6. Running `node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs` still returns 28/28 (no regression).
7. Running `node --test _SYSTEM/Scripts/root-architecture.test.mjs` still returns pass (no regression).
8. No file outside the create-list is modified.

### Test command

```bash
node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs && \
node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs && \
node --test _SYSTEM/Scripts/root-architecture.test.mjs && \
echo "ALL PASS"
```

### Rollback boundary

Files created by this task only. If acceptance fails, delete:
```bash
rm _SYSTEM/Scripts/math/yuri-energy-trace.mjs \
   _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs
# Revert the .gitignore append for energy-trace
```

### Route-plan classification

- `lane: quantum-rick`
- `scenario: implementation-substrate`
- `tier: focused-implementation-high-stakes`
- `qualityGate: main-session-review + codex-final-pass`
- `codexPolicy: required-final-pass` (this is foundational infrastructure for the paper's empirical evidence; Codex review on this code is non-negotiable before A.2 dispatches)

### Adversarial verification (Quantum self-checks before reporting done)

Four failure modes to check:

1. **Privacy Gate leak.** Does the trace record ever serialize a value that contains memory body content, prompt text, transcript content, raw path strings, or any free-text field? Search the test output: every JSONL line, every recorded record. If any forbidden value appears, the validator has a gap. Verification: explicitly construct a test case where `stateBefore` includes a `memoryBody` string field; confirm the validator throws on append attempt.

2. **YURI_STATE_DIR coverage hole.** Does the module respect the environment variable for *every* write path, or only the default? Construct a test that sets `YURI_STATE_DIR=/tmp/fake-isolated-state`, runs `appendTrace`, and confirms the file lands at `/tmp/fake-isolated-state/energy-trace/...` and **nothing** lands in real `_SYSTEM/state/`. This is Codex's flagged implementation risk #1.

3. **Concurrent-append race condition.** JSONL files must remain valid under concurrent writes. Construct a test with 10 parallel `appendTrace` calls; parse the resulting file as JSONL; confirm exactly 10 valid records (no partial lines, no interleaved bytes).

4. **Hidden mutation of caller state.** Construct a test that snapshots `stateBefore` via deep clone, runs `traceGateEvaluation`, then compares stateBefore to the snapshot. Must be identical. The module must not mutate caller state.

### What Quantum returns

A single message containing:
1. Confirmation of files created.
2. Test results: all tests passing count + failure detail if any.
3. Output of `git diff --stat` showing exactly which files changed.
4. Four named failure modes considered + verification result (especially Privacy Gate leak + YURI_STATE_DIR coverage).
5. Residual risk statement.
6. Integration findings (peer-lane neutral voice).

---

## Dispatch command

```bash
node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick — Workstream A.1 telemetry layer. Full Claude Control Packet at _SYSTEM/reports/energy-landscape-paper-2026-07/05-quantum-a1-telemetry-packet.md — read it fully. Run 'bash _SYSTEM/Scripts/ai route-plan implementation-substrate' in your lane first. Create _SYSTEM/Scripts/math/yuri-energy-trace.mjs + .test.mjs per spec. Privacy Gate enforcement is non-negotiable — validator must refuse free-text fields. YURI_STATE_DIR coverage is Codex's flagged risk #1 — test it explicitly. Run full test sweep (yuri-energy-trace, yuri-energy, root-architecture) before reporting. Apply 4 adversarial self-checks. Peer-lane neutral voice." --execute
```

---

## Notes for Marcel (not in the packet)

- A.1 unlocks B.1's data collection. Sequencing: A.1 ships → A.2.a (observability-mode wiring) → B.1 starts.
- After A.1 lands and tests pass, Codex final-pass review is recommended before A.2 dispatch. Codex review on infrastructure code catches the boundary-validation misses we've seen before.
- Privacy Gate enforcement is the architecturally critical part of A.1. Codex flagged Layer 7 enforcement as "must be first-class Workstream A acceptance" — this packet bakes it in as four explicit acceptance criteria (no forbidden fields, validator throws, raw-path refusal, free-text refusal).
- Expected Quantum turnaround: ~10–15 min (longer than paper sections; substrate code with mandatory adversarial checks).
